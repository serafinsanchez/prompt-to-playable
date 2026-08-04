/**
 * US-05 pure logic: prompt slug, generated CharacterSource extraction,
 * download plan (filenames from the prompt slug), 3-day expiry, and the
 * completion receipt copy. All against fixture runs — no network, no DOM.
 */

import { describe, expect, it } from "vitest";
import {
  ASSET_EXPIRY_MS,
  completionReceipt,
  downloadPlan,
  generatedCharacterSource,
  promptSlug,
  runAssetsExpired,
} from "../../components/pipeline/completion";
import {
  ANIMATION_CLIPS,
  PIPELINE_STAGES,
  type PipelineRun,
  type StageId,
  type StageState,
} from "../../lib/meshy/types";

const START = 1_700_000_000_000;
const SIX_MINUTES = 6 * 60_000;

function stage(id: StageId, modelUrl: string | null): StageState {
  return {
    stage: id,
    status: "succeeded",
    taskId: `task-${id}`,
    progress: 100,
    precedingTasks: null,
    creditCost: 5,
    modelUrl,
    startedAt: START,
    completedAt: START + 60_000,
    error: null,
  };
}

function succeededRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  const stages = Object.fromEntries(
    PIPELINE_STAGES.map((id) => [id, stage(id, `https://assets.example/${id}.glb`)]),
  ) as Record<StageId, StageState>;
  return {
    prompt: "A Sky Knight, with big wings!",
    status: "succeeded",
    stages,
    startedAt: START,
    completedAt: START + SIX_MINUTES,
    creditsSpent: 55,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: null,
    ...overrides,
  };
}

describe("promptSlug", () => {
  it("lowercases, hyphenates, and strips punctuation", () => {
    expect(promptSlug("A Sky Knight, with big wings!")).toBe(
      "a-sky-knight-with-big-wings",
    );
  });

  it("collapses runs of separators and trims edge hyphens", () => {
    expect(promptSlug("  robot -- butler  ")).toBe("robot-butler");
  });

  it("falls back to 'character' when nothing survives", () => {
    expect(promptSlug("!!!")).toBe("character");
  });

  it("caps very long prompts without a trailing hyphen", () => {
    const slug = promptSlug("word ".repeat(30));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("generatedCharacterSource", () => {
  it("maps rig + five animate stage URLs onto a CharacterSource", () => {
    const source = generatedCharacterSource(succeededRun());
    expect(source).not.toBeNull();
    expect(source?.rig).toBe("https://assets.example/rig.glb");
    for (const clip of ANIMATION_CLIPS) {
      expect(source?.clips[clip]).toBe(`https://assets.example/animate:${clip}.glb`);
    }
  });

  it("returns null when the rig URL is missing", () => {
    const run = succeededRun();
    run.stages.rig.modelUrl = null;
    expect(generatedCharacterSource(run)).toBeNull();
  });

  it("returns null when any clip URL is missing", () => {
    const run = succeededRun();
    run.stages["animate:jump"].modelUrl = null;
    expect(generatedCharacterSource(run)).toBeNull();
  });
});

describe("downloadPlan", () => {
  it("leads with the rig, then the five clips, filenames from the prompt slug", () => {
    const plan = downloadPlan(succeededRun());
    expect(plan).toHaveLength(6);
    expect(plan[0]).toMatchObject({
      shortName: "rig.glb",
      filename: "a-sky-knight-with-big-wings-rig.glb",
      url: "https://assets.example/rig.glb",
    });
    expect(plan.slice(1).map((entry) => entry.filename)).toEqual(
      ANIMATION_CLIPS.map((clip) => `a-sky-knight-with-big-wings-${clip}.glb`),
    );
    expect(plan.slice(1).map((entry) => entry.shortName)).toEqual(
      ANIMATION_CLIPS.map((clip) => `${clip}.glb`),
    );
  });

  it("omits entries whose stage never produced a URL", () => {
    const run = succeededRun();
    run.stages["animate:emote"].modelUrl = null;
    const plan = downloadPlan(run);
    expect(plan).toHaveLength(5);
    expect(plan.some((entry) => entry.filename.endsWith("-emote.glb"))).toBe(false);
  });
});

describe("runAssetsExpired", () => {
  it("is false the moment the run completes", () => {
    expect(runAssetsExpired(succeededRun(), START + SIX_MINUTES)).toBe(false);
  });

  it("is false one minute before the 3-day mark", () => {
    const now = START + SIX_MINUTES + ASSET_EXPIRY_MS - 60_000;
    expect(runAssetsExpired(succeededRun(), now)).toBe(false);
  });

  it("is true past the 3-day mark", () => {
    const now = START + SIX_MINUTES + ASSET_EXPIRY_MS + 60_000;
    expect(runAssetsExpired(succeededRun(), now)).toBe(true);
  });

  it("is false while the run has no completion timestamp", () => {
    const run = succeededRun({ completedAt: null });
    expect(runAssetsExpired(run, START + ASSET_EXPIRY_MS * 2)).toBe(false);
  });
});

describe("completionReceipt", () => {
  it("reads credits and rounded minutes — numbers are copy", () => {
    expect(completionReceipt(succeededRun())).toBe("55 credits. 6 minutes. Yours.");
  });

  it("uses seconds under a minute and singular forms", () => {
    const run = succeededRun({ creditsSpent: 1, completedAt: START + 42_000 });
    expect(completionReceipt(run)).toBe("1 credit. 42 seconds. Yours.");
  });

  it("singular minute at exactly one minute", () => {
    const run = succeededRun({ completedAt: START + 60_000 });
    expect(completionReceipt(run)).toBe("55 credits. 1 minute. Yours.");
  });
});
