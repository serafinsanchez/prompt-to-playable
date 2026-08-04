# US-08 Artifact Lightbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor click a stage's 32px artifact thumbnail to open it in a lightbox at up to 640px, and step between the three mesh stages to see the preview → refine → remesh fidelity progression.

**Architecture:** A pure module (`components/pipeline/artifacts.ts`) derives the ordered artifact list from the run snapshot — unit-tested under vitest, which runs in a `node` environment and cannot render React. A presentational `ArtifactLightbox` component portals to `document.body` to escape the rail's `overflow-y-auto` and owns its own step index, so it needs no callback identity from the parent. `StageRail` holds the open/closed state and passes `artifacts` + `initialIndex`. The enlarge button is a *sibling* of the existing row toggle button, absolutely positioned over the thumbnail slot — the row `<button>` already exists (US-04) and nesting a button inside it would be invalid HTML.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Tailwind v4 (`@theme inline` tokens in `app/globals.css`), Zustand, Vitest (node env, pure modules only), Playwright + `@axe-core/playwright`.

**Spec:** `docs/specs/us-08-artifact-lightbox.md`

## Global Constraints

These apply to **every** task. Copied from the spec and `CLAUDE.md`.

- **No new packages.** No headless-UI, no focus-trap library, no carousel. The dialog, the focus trap, and the stepping are hand-rolled. Do not run `npm install`.
- **Semantic tokens only.** No `bg-red-500`-style Tailwind palette literals, no hex in `className`, no hardcoded px that bypass the spacing scale. `bash scripts/check-tokens.sh` enforces this and must pass.
- **Motion tokens:** `--duration-fast: 120ms`, `--duration-normal: 220ms`, `--duration-slow: 380ms`, `--ease-stage: cubic-bezier(0.16, 1, 0.3, 1)`. Animate `transform` and `opacity` only. Every animated element carries a `motion-reduce:` escape.
- **No `backdrop-blur`, no glassmorphism, no shadows.** Scrim is `bg-background/80`. Depth is surface step + border (`bg-elevated`, `border-border`).
- **No interactive 3D in the lightbox.** It is a still image. No orbit controls, no canvas.
- **Mono type for all pipeline UI** — `font-mono text-xs uppercase tracking-caps` is the established label idiom in `components/pipeline/`.
- **Do not modify `lib/meshy/`.** The artifact list is derived from the existing run snapshot.
- **Do not change the rail's visual layout.** The thumbnail stays where it is; the caret keeps its position and its hit area.
- **Do not extend this to the gallery strip** (`components/gallery/`). Out of scope.
- Commands: `npm run typecheck`, `npm run lint`, `npm run test` (vitest), `npx playwright test <file>`, `bash scripts/check-tokens.sh`.

---

### Task 1: Pure artifact-list module

Derives the ordered list of enlargeable mesh artifacts from a run. Pure and isomorphic so vitest (node env) can cover it — this is the same pattern as `components/pipeline/completion.ts` and `stage-meta.ts`.

**Files:**
- Create: `components/pipeline/artifacts.ts`
- Create: `tests/unit/artifacts.test.ts`
- Modify: `components/pipeline/stage-rail.tsx:34` (delete the local `MESH_STAGES` const, import it from the new module)

**Interfaces:**
- Consumes: `PipelineRun`, `StageId` from `lib/meshy/types`; `proxiedAssetUrl` from `lib/meshy/assets`; `rowPresentation`, `stageDisplayName` from `./stage-meta`.
- Produces:
  - `export const MESH_STAGES: readonly StageId[]` — `["preview", "refine", "remesh"]`
  - `export interface MeshArtifact { stage: StageId; label: string; meta: string; imageUrl: string | null; modelUrl: string }`
  - `export function meshArtifacts(run: PipelineRun): MeshArtifact[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/artifacts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/unit/artifacts.test.ts`
Expected: FAIL — `Failed to resolve import "../../components/pipeline/artifacts"`.

- [ ] **Step 3: Write the implementation**

Create `components/pipeline/artifacts.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/artifacts.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Point the rail at the shared constant**

In `components/pipeline/stage-rail.tsx`, delete these two lines (currently at line 33–34):

```tsx
/** Stages whose artifact is a mesh GLB worth previewing inline. */
const MESH_STAGES: ReadonlySet<StageId> = new Set(["preview", "refine", "remesh"]);
```

Add `MESH_STAGES` to the imports:

```tsx
import { MESH_STAGES } from "./artifacts";
```

Change the one usage (currently line 108) from `MESH_STAGES.has(state.stage)` to:

```tsx
{kind === "succeeded" && MESH_STAGES.includes(state.stage) && state.modelUrl !== null && (
```

- [ ] **Step 6: Verify nothing regressed**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass. If `StageId` is now unused in `stage-rail.tsx`, drop it from the type import — lint will say so.

- [ ] **Step 7: Commit**

```bash
git add -f components/pipeline/artifacts.ts tests/unit/artifacts.test.ts components/pipeline/stage-rail.tsx
git commit -m "feat(us-08): derive the enlargeable mesh artifact list"
```

> Note: `character-pipeline-demo/.gitignore:26` contains `docs/`, which does not affect these paths. `-f` is harmless here; it is required only for new files under `docs/`.

---

### Task 2: Lightbox component + enlarge affordance (single artifact)

The dialog, the open/close paths, and the enlarge button. Stepping is Task 3 — this task ships a working single-artifact lightbox, including a usable image for stages that have no pre-rendered PNG.

Both image sources land here on purpose. Stages with no `thumbnailUrl` (runs persisted before the field existed, or tasks Meshy never rendered) fall back to a WebGL snapshot currently taken at `SNAPSHOT_SIZE = 96`; upscaling that to 640px is mush, and pointing an `<img src>` at the GLB instead renders a broken-image icon. Raising the render to 512 and reusing it here is what makes the fallback path real, so it ships in the same commit as the dialog rather than leaving a knowingly-broken intermediate state on the branch. Rendering at 512 also sharpens the rail's own 32px slot on hi-DPI displays.

**Files:**
- Create: `components/pipeline/artifact-lightbox.tsx`
- Modify: `components/pipeline/artifact-thumbnail.tsx:30` (`SNAPSHOT_SIZE` 96 → 512, export `snapshotGlb`)
- Modify: `components/pipeline/stage-rail.tsx` (row restructure, open state, render the lightbox)
- Test: `tests/stage-rail.spec.ts`

**Interfaces:**
- Consumes: `MeshArtifact`, `meshArtifacts`, `MESH_STAGES` from `./artifacts` (Task 1).
- Produces:
  - `export interface ArtifactLightboxProps { artifacts: MeshArtifact[]; initialIndex: number; onClose: () => void }`
  - `export function ArtifactLightbox(props: ArtifactLightboxProps): React.ReactPortal | null`
  - `export function snapshotGlb(url: string): Promise<string>` — promoted from module-private in `artifact-thumbnail.tsx` so the lightbox reuses the one shared renderer and its serialized queue.
  - Test IDs later tasks rely on: `enlarge-<stage>`, `artifact-lightbox`, `lightbox-image`, `lightbox-caption`, `lightbox-close`, `lightbox-scrim`.

- [ ] **Step 1: Add thumbnail support to the Playwright fixtures**

The existing fixtures have no `thumbnailUrl`, so `ArtifactThumbnail` falls back to a GLB fetch against `https://assets.meshy.test/*.glb`, which does not resolve — the rail shows its cube icon and there is no image to enlarge. Give the fixtures a real inline PNG so no network is involved.

In `tests/stage-rail.spec.ts`, add to the `FixtureStage` interface (after the `modelUrl` line):

```ts
  thumbnailUrl: string | null;
```

Add the default to the `makeRun` base stage object (after `modelUrl: null,`):

```ts
        thumbnailUrl: null,
```

Add a module-level constant near `STAGES` — an 8×8 solid PNG, inline so the image always decodes:

```ts
/** 8×8 solid PNG, inline: the rail's <img> path with zero network dependency. */
const FIXTURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO48kIbK2IYWhIAvMl5wfWTQdgAAAAASUVORK5CYII=";
```

And extend `succeededStage` to set it:

```ts
const succeededStage = (id: string, credits: number, offset: number): Partial<FixtureStage> => ({
  status: "succeeded",
  taskId: id,
  progress: 100,
  creditCost: credits,
  modelUrl: `https://assets.meshy.test/${id}.glb`,
  thumbnailUrl: FIXTURE_PNG,
  startedAt: Date.now() - 300_000 + offset,
  completedAt: Date.now() - 300_000 + offset + 82_000,
});
```

- [ ] **Step 2: Write the failing test**

Append to `tests/stage-rail.spec.ts`:

```ts
// US-08: the 32px thumbnail is a status dot, not a preview. Clicking it opens
// the artifact at up to 640px without disturbing the row's API panel.

test("enlarge: thumbnail opens the lightbox, Esc closes it and restores focus", async ({
  page,
}) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
    }),
  );
  await page.goto("/");

  const enlarge = page.getByTestId("enlarge-preview");
  await expect(enlarge).toHaveAttribute("aria-label", "Enlarge preview mesh");

  // The overlay button sits on top of the thumbnail slot, not beside it.
  const buttonBox = await enlarge.boundingBox();
  const thumbBox = await page.getByTestId("artifact-thumb-preview").boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(thumbBox).not.toBeNull();
  expect(Math.abs(buttonBox!.x - thumbBox!.x)).toBeLessThan(4);
  expect(Math.abs(buttonBox!.y - thumbBox!.y)).toBeLessThan(4);

  await enlarge.click();

  const dialog = page.getByTestId("artifact-lightbox");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("lightbox-caption")).toHaveText("preview · 20c · 1:22");
  await expect(page.getByTestId("lightbox-image")).toBeVisible();

  // Enlarging must not toggle the row's API panel (US-04 owns that click).
  await expect(page.getByTestId("api-panel-preview")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Tab order within a row is toggle → enlarge (spec requirement 6).
  await page.getByTestId("stage-toggle-preview").focus();
  await page.keyboard.press("Tab");
  await expect(enlarge).toBeFocused();
  // Re-open from the keyboard so the focus-restore assertion below is honest.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();

  // Closing returns focus to the control that opened it, not to the top of
  // the page — the whole point of tracking the opener.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(enlarge).toBeFocused();
});

test("enlarge: scrim click and close button both dismiss", async ({ page }) => {
  await seedRun(page, makeRun("running", { preview: succeededStage("preview-0001", 20, 0) }));
  await page.goto("/");

  await page.getByTestId("enlarge-preview").click();
  await page.getByTestId("lightbox-close").click();
  await expect(page.getByTestId("artifact-lightbox")).toHaveCount(0);

  await page.getByTestId("enlarge-preview").click();
  // Click the scrim well away from the frame.
  await page.getByTestId("lightbox-scrim").click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("artifact-lightbox")).toHaveCount(0);
});

test("enlarge: no affordance on stages without a mesh artifact", async ({ page }) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
      rig: succeededStage("rigging-0004", 5, 180_000),
    }),
  );
  await page.goto("/");

  await expect(page.getByTestId("enlarge-preview")).toHaveCount(1);
  // rig succeeded but is iconographic — nothing to enlarge.
  await expect(page.getByTestId("enlarge-rig")).toHaveCount(0);
  await expect(page.getByTestId("enlarge-refine")).toHaveCount(0);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test tests/stage-rail.spec.ts -g "enlarge:"`
Expected: FAIL — all three, with `expect.toHaveAttribute` timing out because `enlarge-preview` does not exist.

- [ ] **Step 4: Raise the snapshot size and export the renderer**

In `components/pipeline/artifact-thumbnail.tsx`, change line 30:

```ts
// 512, not the rail's display size: the same snapshot backs the US-08
// lightbox at up to 640px, and upscaling a 96px render is mush. One-shot
// cost, and the rail's 32px slot gets a sharper downscale on hi-DPI for free.
const SNAPSHOT_SIZE = 512;
```

Export the function so the lightbox shares the one renderer and its queue — change the declaration on line 36 from `async function snapshotGlb` to:

```ts
export async function snapshotGlb(url: string): Promise<string> {
```

Nothing else in that file changes; the rail still displays the result in its `size-8` slot.

- [ ] **Step 5: Write the lightbox component**

Create `components/pipeline/artifact-lightbox.tsx`:

```tsx
"use client";

/**
 * US-08: the artifact lightbox. The rail's thumbnail is 32px — a status dot,
 * not a preview. This opens the same artifact at up to 640px so a visitor can
 * actually read pose, symmetry, and texture.
 *
 * Portals to document.body: the rail is `overflow-y-auto` on desktop and a
 * `max-h-[60dvh]` bottom sheet on mobile, so an in-tree dialog would be
 * clipped by its own scroll container.
 *
 * The dialog owns its step index. StageRail mounts it only while open, so the
 * initialIndex prop is read once per open and no callback identity has to be
 * stable across renders.
 *
 * Hand-rolled focus trap — no new packages (CLAUDE.md). DESIGN.md forbids
 * backdrop-blur and shadows: the scrim is a flat tint, depth is the elevated
 * surface plus a border.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MeshArtifact } from "./artifacts";
import { snapshotGlb } from "./artifact-thumbnail";

export interface ArtifactLightboxProps {
  /** Every landed mesh artifact, in pipeline order. */
  artifacts: MeshArtifact[];
  /** Which one the visitor clicked. */
  initialIndex: number;
  onClose: () => void;
}

export function ArtifactLightbox({ artifacts, initialIndex, onClose }: ArtifactLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [fallback, setFallback] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const artifact = artifacts[index];

  // No pre-rendered PNG (legacy run, or a task Meshy never rendered): take a
  // one-shot 512px snapshot through the shared offscreen renderer — the same
  // path and the same serialized queue the rail uses. Null whenever a real
  // PNG exists or the index is out of range, which is also the effect's guard.
  const snapshotSource =
    artifact !== undefined && artifact.imageUrl === null ? artifact.modelUrl : null;

  useEffect(() => {
    if (snapshotSource === null) return;
    let cancelled = false;
    void snapshotGlb(snapshotSource)
      .then((dataUrl) => {
        if (!cancelled) setFallback(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFallback(null);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotSource]);

  useEffect(() => {
    const node = dialogRef.current;
    if (node === null) return;
    // Restore focus to whatever opened us — the thumbnail's enlarge button.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || node === null) return;
      const focusables = node.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [onClose]);

  // Every hook above runs unconditionally — React requires stable hook order,
  // so this guard cannot move up.
  if (artifact === undefined) return null;
  const caption = `${artifact.label} · ${artifact.meta}`;
  const shown = artifact.imageUrl ?? fallback;

  return createPortal(
    <div
      data-testid="lightbox-scrim"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none"
    >
      <div
        ref={dialogRef}
        data-testid="artifact-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={caption}
        // The frame is inside the scrim, so its own clicks must not dismiss.
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="flex w-full max-w-[min(80vw,640px)] flex-col gap-3 transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
      >
        {/* The box is reserved up front and pulses while the snapshot renders,
            so the caption never jumps under the pointer. */}
        <span
          className={`relative block aspect-square w-full overflow-hidden rounded-md border border-border bg-elevated ${
            shown === null ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
        >
          {shown !== null && (
            /* eslint-disable-next-line @next/next/no-img-element -- signed Meshy PNG or an inline data URL; next/image optimizes neither */
            <img
              key={artifact.stage}
              data-testid="lightbox-image"
              src={shown}
              alt={`${artifact.label} stage mesh, enlarged`}
              draggable={false}
              className="size-full object-contain transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none"
            />
          )}
        </span>

        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="lightbox-caption"
            className="font-mono text-xs uppercase tracking-caps text-muted"
          >
            {caption}
          </span>
          <button
            ref={closeRef}
            type="button"
            data-testid="lightbox-close"
            onClick={onClose}
            className="rounded-sm border border-border px-2 py-1 font-mono text-xs uppercase tracking-caps text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent motion-reduce:transition-none"
          >
            esc
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 6: Restructure the row and wire the rail**

In `components/pipeline/stage-rail.tsx`:

Extend the imports:

```tsx
import { MESH_STAGES, meshArtifacts, type MeshArtifact } from "./artifacts";
import { ArtifactLightbox } from "./artifact-lightbox";
```

Add an `onEnlarge` prop to `StageRow`'s props type:

```tsx
  /** US-08: open the lightbox on this stage's artifact. Absent when it has none. */
  onEnlarge?: ((stage: StageId) => void) | undefined;
```

Wrap the existing row button in a positioned container and add the sibling button. Replace the `<button ...>…</button>` block (currently lines 70–131) so it is wrapped like this — the button's own markup and classes are unchanged:

```tsx
      {/* US-08: the enlarge control is a SIBLING of the row toggle, layered
          over the thumbnail slot. The row is already a button (US-04) and a
          nested button is invalid HTML; this keeps the rail's visual layout
          and the caret's hit area exactly as they were. */}
      <div className="relative flex items-center">
        <button
          type="button"
          data-testid={`stage-toggle-${state.stage}`}
          /* …unchanged… */
        >
          {/* …unchanged children… */}
        </button>

        {hasArtifact && onEnlarge !== undefined && (
          <button
            type="button"
            data-testid={`enlarge-${state.stage}`}
            aria-label={`Enlarge ${name} mesh`}
            onClick={() => {
              onEnlarge(state.stage);
            }}
            // right-5 = the caret (size-2 = 8px) plus the gap-3 (12px) that
            // precedes it, so this lands exactly on the 32px thumbnail slot.
            // tests/stage-rail.spec.ts asserts the overlap geometrically.
            className="absolute right-5 size-8 cursor-zoom-in rounded-sm border border-transparent transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent motion-reduce:transition-none"
          />
        )}
      </div>
```

Define `hasArtifact` at the top of `StageRow`, next to the existing `expanded` state, and reuse it for the thumbnail condition:

```tsx
  const hasArtifact =
    kind === "succeeded" && MESH_STAGES.includes(state.stage) && state.modelUrl !== null;
```

The thumbnail render condition (currently line 108) becomes `{hasArtifact && (`.

In `StageRail`, add the open state and render the dialog:

```tsx
export function StageRail() {
  const run = usePipeline((state) => state.run);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (run === null) return null;
  const pressure = backpressure(run);
  const artifacts: MeshArtifact[] = meshArtifacts(run);
  const enlarge = (stage: StageId): void => {
    const index = artifacts.findIndex((artifact) => artifact.stage === stage);
    if (index !== -1) setOpenIndex(index);
  };
```

Pass `onEnlarge={enlarge}` to both `StageRow` call sites (the linear rows and the animate clips — the animate rows never satisfy `hasArtifact`, so the prop is inert there but keeps the call sites identical).

Render the dialog as the last child of the outer `<div data-testid="stage-list">`:

```tsx
      {openIndex !== null && (
        <ArtifactLightbox
          artifacts={artifacts}
          initialIndex={openIndex}
          onClose={() => {
            setOpenIndex(null);
          }}
        />
      )}
```

`useState` is already imported in this file.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/stage-rail.spec.ts`
Expected: PASS — the three new `enlarge:` tests plus the three pre-existing rail tests.

If the geometry assertion fails, read the reported x/y delta before changing `right-5`: a nonzero **x** delta means the offset is wrong, a nonzero **y** delta means the container lost `items-center`.

- [ ] **Step 8: Manual check of the snapshot fallback**

Every Playwright fixture sets `thumbnailUrl`, so the automated tests only exercise the `<img>` path. Check the other one by hand: temporarily set `thumbnailUrl: null` in `succeededStage` in `tests/stage-rail.spec.ts`, run

```
npx playwright test tests/stage-rail.spec.ts -g "opens the lightbox" --headed
```

and confirm the reserved box pulses rather than showing a broken-image icon, and that nothing throws. The fixture GLB URL does not resolve, so it settles empty — the point is that the failure is graceful. **Revert the fixture edit before committing.**

- [ ] **Step 9: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test && bash scripts/check-tokens.sh`
Expected: all pass. Confirm `git diff` shows no leftover `thumbnailUrl: null` from Step 8.

```bash
git add -f components/pipeline/artifact-lightbox.tsx components/pipeline/artifact-thumbnail.tsx components/pipeline/stage-rail.tsx tests/stage-rail.spec.ts
git commit -m "feat(us-08): open a stage artifact in a lightbox"
```

---

### Task 3: Step between mesh stages

Arrows, `←`/`→`, disabled ends, and the progression dots.

**Files:**
- Modify: `components/pipeline/artifact-lightbox.tsx`
- Test: `tests/stage-rail.spec.ts`

**Interfaces:**
- Consumes: `ArtifactLightboxProps` from Task 2 (unchanged — the index is internal).
- Produces: test IDs `lightbox-prev`, `lightbox-next`, `lightbox-dots`.

- [ ] **Step 1: Write the failing test**

Append to `tests/stage-rail.spec.ts`:

```ts
test("enlarge: steps across landed mesh stages and stops at the ends", async ({ page }) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
      refine: succeededStage("refine-0002", 10, 90_000),
      remesh: succeededStage("remesh-0003", 5, 180_000),
    }),
  );
  await page.goto("/");

  await page.getByTestId("enlarge-refine").click();
  const caption = page.getByTestId("lightbox-caption");
  await expect(caption).toHaveText("refine · 10c · 1:22");

  // Opening mid-list means both directions are live.
  await expect(page.getByTestId("lightbox-prev")).toBeEnabled();
  await expect(page.getByTestId("lightbox-next")).toBeEnabled();

  await page.getByTestId("lightbox-next").click();
  await expect(caption).toHaveText("remesh · 5c · 1:22");
  await expect(page.getByTestId("lightbox-next")).toBeDisabled();

  // Keyboard mirrors the arrows.
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("refine · 10c · 1:22");
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("preview · 20c · 1:22");
  await expect(page.getByTestId("lightbox-prev")).toBeDisabled();

  // At the start, ArrowLeft is inert rather than wrapping.
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("preview · 20c · 1:22");

  // One dot per landed artifact, current one marked.
  const dots = page.getByTestId("lightbox-dots").locator("[data-dot]");
  await expect(dots).toHaveCount(3);
  await expect(dots.nth(0)).toHaveAttribute("data-dot", "current");
  await expect(dots.nth(1)).toHaveAttribute("data-dot", "other");

  // Focus trap: Tab from the last enabled control wraps to the first rather
  // than escaping to the rail behind the scrim. At index 0 the prev arrow is
  // disabled, so the cycle is next → close → next.
  await page.getByTestId("lightbox-close").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("lightbox-next")).toBeFocused();
});

test("enlarge: a lone artifact has no live arrows", async ({ page }) => {
  await seedRun(page, makeRun("running", { preview: succeededStage("preview-0001", 20, 0) }));
  await page.goto("/");

  await page.getByTestId("enlarge-preview").click();
  await expect(page.getByTestId("lightbox-prev")).toBeDisabled();
  await expect(page.getByTestId("lightbox-next")).toBeDisabled();
  await expect(page.getByTestId("lightbox-dots").locator("[data-dot]")).toHaveCount(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/stage-rail.spec.ts -g "steps across"`
Expected: FAIL — `lightbox-prev` does not exist.

- [ ] **Step 3: Add stepping to the component**

In `components/pipeline/artifact-lightbox.tsx`, add a step helper above the effect:

```tsx
  const atStart = index === 0;
  const atEnd = index === artifacts.length - 1;
  const step = (delta: number): void => {
    setIndex((current) => Math.min(Math.max(current + delta, 0), artifacts.length - 1));
  };
```

The focus-trap effect must stay mount-only. Do NOT add `onClose`, `artifacts`, or the artifact count to its dependency array: the effect captures `document.activeElement` as the opener on setup and calls `opener?.focus()` on cleanup, so *any* rerun yanks focus out of a still-open dialog and discards the visitor's tab position. `onClose` changes identity every ~4s poll; the artifact count changes whenever a stage lands. Both are live triggers during the exact scenario this feature exists for.

Read the count through a ref instead, updated during render alongside the existing `onCloseRef`:

```tsx
  const totalRef = useRef(artifacts.length);
  totalRef.current = artifacts.length;
```

Then replace the `Escape` branch of `onKeyDown` with:

```tsx
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const delta = event.key === "ArrowRight" ? 1 : -1;
        setIndex((current) => Math.min(Math.max(current + delta, 0), totalRef.current - 1));
        return;
      }
```

Leave the effect's dependency array as `[]`. The ref keeps the count current without ever rerunning the effect, which is the whole point — see the note above.

Add the arrows either side of the image, inside the frame `<div>`, replacing the bare `<span className="relative block aspect-square …">` wrapper with a row:

```tsx
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="lightbox-prev"
            aria-label="Previous stage"
            disabled={atStart}
            onClick={() => {
              step(-1);
            }}
            className="shrink-0 rounded-sm border border-border p-2 text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            <svg viewBox="0 0 8 8" aria-hidden className="size-3 rotate-180 stroke-current" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 1.5L5.5 4 3 6.5" />
            </svg>
          </button>

          <span className="relative block aspect-square min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-elevated">
            {/* …unchanged <img>… */}
          </span>

          <button
            type="button"
            data-testid="lightbox-next"
            aria-label="Next stage"
            disabled={atEnd}
            onClick={() => {
              step(1);
            }}
            className="shrink-0 rounded-sm border border-border p-2 text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            <svg viewBox="0 0 8 8" aria-hidden className="size-3 stroke-current" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 1.5L5.5 4 3 6.5" />
            </svg>
          </button>
        </div>
```

Add the dots below the caption row, as the last child of the frame:

```tsx
        {/* The progression, not a carousel: one dot per landed mesh stage. */}
        <ol data-testid="lightbox-dots" aria-hidden className="flex items-center justify-center gap-2">
          {artifacts.map((entry, position) => (
            <li
              key={entry.stage}
              data-dot={position === index ? "current" : "other"}
              className={`size-1 rounded-full transition-colors duration-(--duration-fast) ease-(--ease-stage) motion-reduce:transition-none ${
                position === index ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </ol>
```

The `<img>` already has `key={artifact.stage}`, so React remounts it on step and the `starting:opacity-0` transition crossfades each new artifact in — opacity only, no slide.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/stage-rail.spec.ts`
Expected: PASS — all eight tests in the file.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test && bash scripts/check-tokens.sh`

```bash
git add -f components/pipeline/artifact-lightbox.tsx tests/stage-rail.spec.ts
git commit -m "feat(us-08): step the lightbox across the mesh stages"
```

---

### Task 4: The preview gate opens the same lightbox

The gate is the moment a human is asked to judge a mesh with 35 credits riding on it. Its image is not inside a button, so it becomes the button directly — no sibling-overlay trick needed.

**Files:**
- Modify: `components/pipeline/preview-gate.tsx:63-83`
- Test: `tests/stage-rail.spec.ts`

**Interfaces:**
- Consumes: `meshArtifacts` (Task 1), `ArtifactLightbox` (Task 2).
- Produces: test ID `gate-enlarge`.

- [ ] **Step 1: Write the failing test**

Append to `tests/stage-rail.spec.ts`:

```ts
test("preview gate: the review image opens the lightbox", async ({ page }) => {
  const run = makeRun("running", { preview: succeededStage("preview-0001", 20, 0) });
  await seedRun(page, { ...run, status: "awaiting-review" } as typeof run);
  await page.goto("/");

  await expect(page.getByTestId("preview-gate")).toBeVisible();
  const enlarge = page.getByTestId("gate-enlarge");
  await expect(enlarge).toHaveAttribute("aria-label", "Enlarge preview mesh");

  await enlarge.click();
  await expect(page.getByTestId("artifact-lightbox")).toBeVisible();
  await expect(page.getByTestId("lightbox-caption")).toHaveText("preview · 20c · 1:22");
  // Only the preview has landed at the gate — nothing to step to.
  await expect(page.getByTestId("lightbox-next")).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("artifact-lightbox")).toHaveCount(0);
  await expect(enlarge).toBeFocused();
});
```

`makeRun`'s `status` parameter is typed `"running" | "succeeded" | "failed"`; widen it to include `"awaiting-review"` rather than casting:

```ts
function makeRun(
  status: "running" | "awaiting-review" | "succeeded" | "failed",
  overrides: Partial<Record<StageId, Partial<FixtureStage>>>,
) {
```

and the `completedAt` line becomes:

```ts
    completedAt: status === "running" || status === "awaiting-review" ? null : base + 240_000,
```

Then seed it directly: `await seedRun(page, makeRun("awaiting-review", { preview: succeededStage("preview-0001", 20, 0) }));` and drop the spread/cast from the test above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/stage-rail.spec.ts -g "preview gate"`
Expected: FAIL — `gate-enlarge` does not exist.

- [ ] **Step 3: Wire the gate**

In `components/pipeline/preview-gate.tsx`, add imports:

```tsx
import { meshArtifacts } from "./artifacts";
import { ArtifactLightbox } from "./artifact-lightbox";
```

Add state next to the existing `thumbState`:

```tsx
  const [enlarged, setEnlarged] = useState(false);
```

Turn the image wrapper `<span>` (lines 64–82) into a button and render the dialog. Replace that block with:

```tsx
      {thumbnail !== null && thumbState !== "failed" && (
        <button
          type="button"
          data-testid="gate-enlarge"
          aria-label="Enlarge preview mesh"
          onClick={() => {
            setEnlarged(true);
          }}
          className={`block aspect-square w-full cursor-zoom-in overflow-hidden rounded-sm border border-border bg-background transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent motion-reduce:transition-none ${
            thumbState === "loading" ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Meshy PNG; next/image optimizes nothing here */}
          <img
            src={thumbnail}
            alt="Preview mesh, ready for review"
            draggable={false}
            onLoad={() => setThumbState("loaded")}
            onError={() => setThumbState("failed")}
            className={
              thumbState === "loaded"
                ? "size-full object-cover transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
                : "hidden"
            }
          />
        </button>
      )}

      {enlarged && (
        <ArtifactLightbox
          artifacts={meshArtifacts(run)}
          initialIndex={0}
          onClose={() => {
            setEnlarged(false);
          }}
        />
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/stage-rail.spec.ts`
Expected: PASS — all nine tests.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test && bash scripts/check-tokens.sh`

```bash
git add -f components/pipeline/preview-gate.tsx tests/stage-rail.spec.ts
git commit -m "feat(us-08): enlarge the preview gate's review image"
```

---

### Task 5: Accessibility scan and final verification

**Files:**
- Modify: `tests/a11y.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing further.

- [ ] **Step 1: Write the failing test**

`tests/a11y.spec.ts` currently scans the bare page at three viewports. The lightbox only exists after an interaction, so it needs its own case. Append to the file, outside the existing `for` loops:

```ts
import { STORAGE_KEY as RUN_STORAGE_KEY, STORAGE_VERSION } from '../lib/meshy/storage';

// US-08: the lightbox only exists after a click, so the route-level scans
// above never see it. Seed a run with two landed mesh stages, open the dialog,
// and scan the page in that state.
const LIGHTBOX_VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'desktop', width: 1280, height: 720 },
];

for (const viewport of LIGHTBOX_VIEWPORTS) {
  test(`a11y: artifact lightbox @ ${viewport.name}`, async ({ page }) => {
    const now = Date.now();
    const stage = (id: string, credits: number) => ({
      status: 'succeeded',
      taskId: id,
      progress: 100,
      precedingTasks: null,
      creditCost: credits,
      modelUrl: `https://assets.meshy.test/${id}.glb`,
      thumbnailUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO48kIbK2IYWhIAvMl5wfWTQdgAAAAASUVORK5CYII=',
      startedAt: now - 300_000,
      completedAt: now - 218_000,
      error: null,
    });
    const pending = (id: string) => ({
      stage: id,
      status: 'pending',
      taskId: null,
      progress: 0,
      precedingTasks: null,
      creditCost: null,
      modelUrl: null,
      thumbnailUrl: null,
      startedAt: null,
      completedAt: null,
      error: null,
    });
    const run = {
      prompt: 'a bronze knight with a tower shield',
      status: 'running',
      stages: {
        preview: { stage: 'preview', ...pending('preview'), ...stage('preview-0001', 20) },
        refine: { stage: 'refine', ...pending('refine'), ...stage('refine-0002', 10) },
        remesh: pending('remesh'),
        rig: pending('rig'),
        'animate:idle': pending('animate:idle'),
        'animate:walk': pending('animate:walk'),
        'animate:run': pending('animate:run'),
        'animate:jump': pending('animate:jump'),
        'animate:emote': pending('animate:emote'),
      },
      startedAt: now - 300_000,
      completedAt: null,
      creditsSpent: 30,
      waitingForQueue: false,
      rateLimitBackoffMs: null,
      nextPollAt: null,
    };

    await page.addInitScript(
      ([key, envelope]) => {
        window.localStorage.setItem(key, envelope);
      },
      [RUN_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, run })] as const,
    );

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('enlarge-preview').click();
    await expect(page.getByTestId('artifact-lightbox')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.error(
        `\n❌ a11y violations with the lightbox open @ ${viewport.name}:\n` +
          JSON.stringify(results.violations, null, 2),
      );
    }

    expect(results.violations).toEqual([]);
  });
}
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/a11y.spec.ts -g "artifact lightbox"`
Expected: PASS. If axe reports `aria-dialog-name`, the `aria-label` on the dialog is missing or empty; if it reports colour contrast on the dots, they are `aria-hidden` and decorative — mark the finding and raise it rather than adding colour outside the token set.

- [ ] **Step 3: Run the full suite**

```bash
npm run typecheck
npm run lint
npm run test
bash scripts/check-tokens.sh
npx playwright test
```

Expected: all pass. Report the actual output; do not claim completion on any failure.

- [ ] **Step 4: Capture screenshots**

Run the dev server (`npm run dev`) and capture the lightbox open at 1280×720 and 375×667 via the browser tooling. Save as `us08-lightbox-1280.png` and `us08-lightbox-375.png` in the repo root, matching the existing screenshot naming (`us05-*`, `us06-*`). Confirm by eye: no horizontal overflow at 375, the frame is not clipped by the bottom sheet, the caption is legible, and the dots are visible.

- [ ] **Step 5: design-reviewer pass**

Invoke the `design-reviewer` subagent against `DESIGN.md` for the lightbox. Address any 🔴 findings before marking done.

- [ ] **Step 6: Mark the backlog item done**

In `docs/backlog/phase-2-ship.md`, change row 6 from `[ ]` to `[x]`. Update the P2 counts in `docs/backlog.md`.

- [ ] **Step 7: Commit**

```bash
git add -f tests/a11y.spec.ts docs/backlog/phase-2-ship.md docs/backlog.md
git add us08-lightbox-1280.png us08-lightbox-375.png
git commit -m "test(us-08): a11y scan with the lightbox open; close out US-08"
```

---

## Notes for the implementer

- **`docs/` is git-ignored** (`character-pipeline-demo/.gitignore:26`) even though 29 files under it are tracked. Existing tracked files commit normally; new files under `docs/` need `git add -f`. The `-f` in the commands above is harmless everywhere else.
- **Vitest runs in a `node` environment** (`vitest.config.ts`) — there is no jsdom and no React Testing Library. Anything that needs a DOM is a Playwright test. That constraint is why Task 1 exists as a separate pure module.
- **`npm run test` is vitest only.** Playwright is `npx playwright test`; `playwright.config.ts` already lists `stage-rail.spec.ts` and `a11y.spec.ts` in `testMatch`, so no config change is needed.
- **The fixture duration is always `1:22`** — `succeededStage` sets `completedAt = startedAt + 82_000`. Every caption assertion in this plan depends on that.
