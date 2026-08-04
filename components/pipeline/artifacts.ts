/**
 * US-08: the enlargeable artifact list. Pure and isomorphic — vitest runs in
 * a node environment, so all lightbox logic that can be tested without a DOM
 * lives here and the component stays markup-only (same split as
 * stage-meta.ts and completion.ts).
 *
 * Only three of the nine stages carry a mesh worth enlarging; rig and the
 * five animate clips are iconographic by design (US-05 owns the scene
 * payoff). Caption meta is reused verbatim from rowPresentation so the
 * lightbox and the rail row can never disagree about credits or duration.
 */

import { proxiedAssetUrl } from "../../lib/meshy/assets";
import type { PipelineRun, StageId } from "../../lib/meshy/types";
import { rowPresentation, stageDisplayName } from "./stage-meta";

/** Stages whose artifact is a mesh GLB worth previewing, in pipeline order. */
export const MESH_STAGES: readonly StageId[] = ["preview", "refine", "remesh"];

export interface MeshArtifact {
  stage: StageId;
  /** Display name for the caption and the enlarge button's aria-label. */
  label: string;
  /** Right-hand meta from the rail row, e.g. "10c · 1:22". */
  meta: string;
  /** Meshy's pre-rendered PNG (raw signed URL); null falls back to the GLB. */
  imageUrl: string | null;
  /** Proxied GLB — the fallback render source. */
  modelUrl: string;
}

export function meshArtifacts(run: PipelineRun): MeshArtifact[] {
  const artifacts: MeshArtifact[] = [];
  for (const stage of MESH_STAGES) {
    const state = run.stages[stage];
    if (state.status !== "succeeded" || state.modelUrl === null) continue;
    artifacts.push({
      stage,
      label: stageDisplayName(stage),
      meta: rowPresentation(state).meta,
      imageUrl: state.thumbnailUrl ?? null,
      modelUrl: proxiedAssetUrl(state.modelUrl),
    });
  }
  return artifacts;
}
