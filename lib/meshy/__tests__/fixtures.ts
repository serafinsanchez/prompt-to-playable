/**
 * Scripted fixture transport for client/pipeline tests — no key, no network.
 *
 * Pattern reproduced from the proven print-pipeline fixture transport: a table
 * keyed by "METHOD /path" (trailing task ids collapse to ":id"), each key
 * holding an ordered list of responses; repeat calls walk the list and the
 * last entry repeats. An entry can also throw a typed error to script 429s.
 */

import type { MeshyTask, TaskStatus } from "../types";
import type { MeshyTransport, TransportInit } from "../transport";

export type FixtureEntry = { body: unknown } | { error: Error };

export type FixtureTable = Record<string, FixtureEntry[]>;

export interface RecordedCall {
  key: string;
  body: unknown;
}

/** Fixture ids look like `preview-0001`, so a trailing one collapses to `:id`. */
export function fixtureKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/\/[a-z]+-\d{4}$/, "/:id")}`;
}

export function makeFixtureTransport(table: FixtureTable): {
  transport: MeshyTransport;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const counts = new Map<string, number>();

  const transport = async (path: string, init?: TransportInit): Promise<unknown> => {
    const key = fixtureKey(init?.method ?? "GET", path);
    calls.push({ key, body: init?.body });

    const entries = table[key];
    if (!entries || entries.length === 0) {
      throw new Error(`no fixture for "${key}"`);
    }
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    const entry = entries[Math.min(seen, entries.length - 1)]!;
    if ("error" in entry) throw entry.error;
    return entry.body;
  };

  return { transport, calls };
}

// ---------------------------------------------------------------------------
// Task builders
// ---------------------------------------------------------------------------

export function task(
  id: string,
  status: TaskStatus,
  extras: Partial<MeshyTask> = {},
): MeshyTask {
  const progress = status === "SUCCEEDED" ? 100 : (extras.progress ?? 0);
  return { id, status, progress, ...extras };
}

export function succeeded(id: string, credits: number, glb = `https://assets.meshy.test/${id}.glb`): MeshyTask {
  return task(id, "SUCCEEDED", { consumed_credits: credits, model_urls: { glb } });
}

export function failed(id: string, message: string): MeshyTask {
  // consumed_credits is always 0 on FAILED — Meshy auto-refunds.
  return task(id, "FAILED", { consumed_credits: 0, task_error: { message } });
}
