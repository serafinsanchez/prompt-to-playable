#!/usr/bin/env bun
/**
 * Claude Code Stop hook: continual learning cadence trigger.
 *
 * Adapted from the Cursor `continual-learning` plugin (MIT) for the
 * Claude Code stop-hook contract:
 *   - input  (stdin JSON): { session_id, transcript_path, stop_hook_active, cwd, ... }
 *   - output (stdout JSON): {} for no-op, or { decision: "block", reason: "<msg>" }
 *     to keep the agent running and inject a follow-up instruction.
 *
 * `stop_hook_active === true` means a previous Stop was already blocked
 * by some hook. Never block again in that case — guards against loops.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const STATE_PATH = resolve(".claude/hooks/state/continual-learning.json");
const INCREMENTAL_INDEX_PATH = resolve(".claude/hooks/state/continual-learning-index.json");

const DEFAULT_MIN_TURNS = 10;
const DEFAULT_MIN_MINUTES = 120;
const TRIAL_DEFAULT_MIN_TURNS = 3;
const TRIAL_DEFAULT_MIN_MINUTES = 15;
const TRIAL_DEFAULT_DURATION_MINUTES = 24 * 60;

const FOLLOWUP_REASON =
  `Run the \`continual-learning\` skill now. Delegate the full memory update flow to the \`agents-memory-updater\` subagent. Use incremental transcript processing with index file \`${INCREMENTAL_INDEX_PATH}\`: only consider transcripts not in the index or transcripts whose mtime is newer than indexed mtime. Have the subagent refresh index mtimes, remove entries for deleted transcripts, and update \`AGENTS.md\` only for high-signal recurring user corrections and durable workspace facts. Exclude one-off/transient details and secrets. If no meaningful updates exist, respond exactly: No high-signal memory updates.`;

interface ClaudeStopHookInput {
  session_id: string;
  transcript_path?: string;
  stop_hook_active?: boolean;
  cwd?: string;
  [key: string]: unknown;
}

interface State {
  version: 1;
  lastRunAtMs: number;
  turnsSinceLastRun: number;
  lastTranscriptMtimeMs: number | null;
  lastProcessedSessionId: string | null;
  trialStartedAtMs: number | null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function loadState(): State {
  const fallback: State = {
    version: 1,
    lastRunAtMs: 0,
    turnsSinceLastRun: 0,
    lastTranscriptMtimeMs: null,
    lastProcessedSessionId: null,
    trialStartedAtMs: null,
  };
  if (!existsSync(STATE_PATH)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as Partial<State>;
    if (parsed.version !== 1) return fallback;
    return {
      version: 1,
      lastRunAtMs: typeof parsed.lastRunAtMs === "number" ? parsed.lastRunAtMs : 0,
      turnsSinceLastRun:
        typeof parsed.turnsSinceLastRun === "number" && parsed.turnsSinceLastRun >= 0
          ? parsed.turnsSinceLastRun
          : 0,
      lastTranscriptMtimeMs:
        typeof parsed.lastTranscriptMtimeMs === "number" ? parsed.lastTranscriptMtimeMs : null,
      lastProcessedSessionId:
        typeof parsed.lastProcessedSessionId === "string" ? parsed.lastProcessedSessionId : null,
      trialStartedAtMs:
        typeof parsed.trialStartedAtMs === "number" ? parsed.trialStartedAtMs : null,
    };
  } catch {
    return fallback;
  }
}

function saveState(state: State): void {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function getTranscriptMtimeMs(p: string | null | undefined): number | null {
  if (!p) return null;
  try {
    return statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

async function readStdinJson<T>(): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Uint8Array);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T;
}

async function main(): Promise<number> {
  let input: ClaudeStopHookInput;
  try {
    input = await readStdinJson<ClaudeStopHookInput>();
  } catch {
    process.stdout.write("{}\n");
    return 0;
  }

  // Loop guard: if a previous Stop hook already blocked, do not block again.
  if (input.stop_hook_active === true) {
    process.stdout.write("{}\n");
    return 0;
  }

  const state = loadState();
  const now = Date.now();

  // Every Stop event = one completed turn (Claude Code has no loop_count).
  const turnsSinceLastRun = state.turnsSinceLastRun + 1;

  // Trial mode: easier cadence for the first 24h to verify the loop works.
  const trialEnabled = parseBoolean(process.env.CONTINUAL_LEARNING_TRIAL_MODE);
  if (trialEnabled && state.trialStartedAtMs === null) {
    state.trialStartedAtMs = now;
  }
  const trialDurationMinutes = parsePositiveInt(
    process.env.CONTINUAL_LEARNING_TRIAL_DURATION_MINUTES,
    TRIAL_DEFAULT_DURATION_MINUTES,
  );
  const inTrialWindow =
    trialEnabled &&
    state.trialStartedAtMs !== null &&
    now - state.trialStartedAtMs < trialDurationMinutes * 60_000;

  const trialMinTurns = parsePositiveInt(
    process.env.CONTINUAL_LEARNING_TRIAL_MIN_TURNS,
    TRIAL_DEFAULT_MIN_TURNS,
  );
  const trialMinMinutes = parsePositiveInt(
    process.env.CONTINUAL_LEARNING_TRIAL_MIN_MINUTES,
    TRIAL_DEFAULT_MIN_MINUTES,
  );
  const minTurns = parsePositiveInt(process.env.CONTINUAL_LEARNING_MIN_TURNS, DEFAULT_MIN_TURNS);
  const minMinutes = parsePositiveInt(
    process.env.CONTINUAL_LEARNING_MIN_MINUTES,
    DEFAULT_MIN_MINUTES,
  );

  const effectiveMinTurns = inTrialWindow ? trialMinTurns : minTurns;
  const effectiveMinMinutes = inTrialWindow ? trialMinMinutes : minMinutes;

  const minutesSinceLastRun =
    state.lastRunAtMs > 0
      ? Math.floor((now - state.lastRunAtMs) / 60_000)
      : Number.POSITIVE_INFINITY;

  const transcriptMtimeMs = getTranscriptMtimeMs(input.transcript_path);
  const transcriptAdvanced =
    transcriptMtimeMs !== null &&
    (state.lastTranscriptMtimeMs === null || transcriptMtimeMs > state.lastTranscriptMtimeMs);

  const shouldTrigger =
    turnsSinceLastRun >= effectiveMinTurns &&
    minutesSinceLastRun >= effectiveMinMinutes &&
    transcriptAdvanced;

  if (shouldTrigger) {
    state.lastRunAtMs = now;
    state.turnsSinceLastRun = 0;
    state.lastTranscriptMtimeMs = transcriptMtimeMs;
    state.lastProcessedSessionId = input.session_id ?? null;
    saveState(state);
    process.stdout.write(`${JSON.stringify({ decision: "block", reason: FOLLOWUP_REASON })}\n`);
    return 0;
  }

  state.turnsSinceLastRun = turnsSinceLastRun;
  saveState(state);
  process.stdout.write("{}\n");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[continual-learning-stop] failed", err);
    process.stdout.write("{}\n");
    process.exit(0);
  });
