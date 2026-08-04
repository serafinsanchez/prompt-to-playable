/**
 * US-08: the lightbox's artifact list. Order is pipeline order, membership is
 * "succeeded mesh stage with a model URL", and the caption meta is reused
 * verbatim from rowPresentation so it cannot drift from the rail row.
 */

import { describe, expect, it } from "vitest";

import { createEmptyRun } from "../../lib/meshy/pipeline";
import type { PipelineRun, StageId } from "../../lib/meshy/types";
import { MESH_STAGES, meshArtifacts } from "../../components/pipeline/artifacts";

/** A run with the listed stages marked succeeded, with realistic timings. */
function runWith(
  succeeded: Partial<Record<StageId, { credits: number; thumb?: string | null; model?: string }>>,
): PipelineRun {
  const run = createEmptyRun("a bronze knight with a tower shield");
  for (const [stage, config] of Object.entries(succeeded)) {
    const state = run.stages[stage as StageId];
    state.status = "succeeded";
    state.taskId = `${stage}-0001`;
    state.progress = 100;
    state.creditCost = config.credits;
    state.modelUrl = config.model ?? `https://assets.meshy.ai/${stage}.glb`;
    state.thumbnailUrl = config.thumb === undefined ? `https://assets.meshy.ai/${stage}.png` : config.thumb;
    state.startedAt = 1_000_000;
    state.completedAt = 1_000_000 + 82_000;
  }
  return run;
}

describe("MESH_STAGES", () => {
  it("is exactly the three mesh stages in pipeline order", () => {
    expect(MESH_STAGES).toEqual(["preview", "refine", "remesh"]);
  });
});

describe("meshArtifacts", () => {
  it("returns nothing for a fresh run", () => {
    expect(meshArtifacts(createEmptyRun("a knight"))).toEqual([]);
  });

  it("returns only succeeded mesh stages, in pipeline order", () => {
    // remesh listed first to prove the output is not insertion-ordered.
    const run = runWith({ remesh: { credits: 5 }, preview: { credits: 20 } });
    expect(meshArtifacts(run).map((a) => a.stage)).toEqual(["preview", "remesh"]);
  });

  it("excludes rig and animate stages even when they succeed", () => {
    const run = runWith({ preview: { credits: 20 }, rig: { credits: 5 }, "animate:idle": { credits: 3 } });
    expect(meshArtifacts(run).map((a) => a.stage)).toEqual(["preview"]);
  });

  it("excludes a succeeded stage with no model URL", () => {
    const run = runWith({ preview: { credits: 20 } });
    run.stages.refine.status = "succeeded";
    run.stages.refine.modelUrl = null;
    expect(meshArtifacts(run).map((a) => a.stage)).toEqual(["preview"]);
  });

  it("carries the row's own meta string so caption and row cannot drift", () => {
    const [artifact] = meshArtifacts(runWith({ refine: { credits: 10 } }));
    expect(artifact.meta).toBe("10c · 1:22");
    expect(artifact.label).toBe("refine");
  });

  it("proxies the model URL and leaves the thumbnail URL raw", () => {
    const [artifact] = meshArtifacts(runWith({ preview: { credits: 20 } }));
    expect(artifact.modelUrl).toBe(
      "/api/meshy-asset?url=https%3A%2F%2Fassets.meshy.ai%2Fpreview.glb",
    );
    expect(artifact.imageUrl).toBe("https://assets.meshy.ai/preview.png");
  });

  it("reports a null image when the stage has no thumbnail", () => {
    const [artifact] = meshArtifacts(runWith({ preview: { credits: 20, thumb: null } }));
    expect(artifact.imageUrl).toBeNull();
  });

  it("never offers a GLB as an image source", () => {
    // The lightbox puts imageUrl straight into an <img src>. A .glb there
    // renders a broken-image icon; null routes to the snapshot path instead.
    const artifacts = meshArtifacts(
      runWith({ preview: { credits: 20, thumb: null }, refine: { credits: 10 } }),
    );
    expect(artifacts).toHaveLength(2);
    for (const artifact of artifacts) {
      expect(artifact.imageUrl?.endsWith(".glb") ?? false).toBe(false);
    }
  });
});
