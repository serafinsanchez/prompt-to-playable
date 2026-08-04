# US-08: Enlarge a stage's mesh artifact

**kind:** ui

## TASK

Let a visitor click a stage's artifact thumbnail to open it in a lightbox at up to 640px, and step between the three mesh stages (preview → refine → remesh) to see the fidelity progression.

## DEPENDENCIES

- P1 #6 (US-03b, stage rail — done): supplies the thumbnail slot and `rowPresentation()`.
- P2 #1 (US-07, signature completion moment): shares `components/pipeline/stage-rail.tsx` and `artifact-thumbnail.tsx`. **Not parallel-safe with US-07** — sequence after it.

## FILES TOUCHED

- `components/pipeline/artifact-lightbox.tsx` (new)
- `components/pipeline/artifact-thumbnail.tsx` (`SNAPSHOT_SIZE` 96 → 512)
- `components/pipeline/stage-rail.tsx` (artifact list, `openIndex` state, row restructure)
- `components/pipeline/preview-gate.tsx` (gate image opens the same lightbox)
- `tests/stage-rail.spec.ts`, `tests/a11y.spec.ts`

## CONTEXT

- The thumbnail today renders at `size-8` — 32px. That is a status dot, not a preview. `components/pipeline/stage-rail.tsx:108`.
- Only three of the nine rows have an artifact worth enlarging: `MESH_STAGES` = `preview`, `refine`, `remesh`. `rig` and the five `animate:*` clips are iconographic by design (US-05 owns the scene payoff). This is a per-artifact affordance, not a per-stage one.
- The three mesh artifacts are the same character at three fidelities — blockout, PBR-textured, retopologized. Stepping between them is the API story the demo exists to tell (CLAUDE.md: "teach the API while it entertains"), which is why the lightbox is steppable rather than single-shot.
- **Two image sources with different quality.** The preferred path is Meshy's pre-rendered `thumbnail_url` PNG, which is full-res and safe to enlarge. The fallback path renders a GLB through the shared offscreen `WebGLRenderer` at `SNAPSHOT_SIZE = 96`; upscaling 96px to 640px is mush. Raising `SNAPSHOT_SIZE` to 512 and downscaling in the rail costs one larger one-shot render, fixes the lightbox, and sharpens the rail on hi-DPI displays. Rejected alternative: re-rendering at 512 on open, which needs a second loading state inside the dialog for a path that only fires on legacy runs and tasks without a thumbnail.
- **The row is already a `<button>`** (US-04 expands every row to its API call). A clickable image nested inside it is invalid HTML and breaks keyboard nav. The thumbnail slot therefore stays inside the row button as a non-interactive reserved box, and the enlarge `<button>` is a *sibling* layered over that slot (`relative` row, `absolute` button). Visual layout is unchanged from today and the caret keeps its position and hit area.
- The preview gate (`components/pipeline/preview-gate.tsx`) already shows a full-width square at the moment a human is asked to judge a mesh with 35 credits riding on it. Same artifact, same affordance — it opens the same component with a one-item list.
- `DESIGN.md`: `--color-elevated` is the modal surface; shadows are none; `backdrop-blur` and glassmorphism are forbidden; motion is `--duration-normal` on `--ease-stage`, transform and opacity only.

## REQUIREMENTS

1. Clicking (or activating by keyboard) a succeeded mesh stage's thumbnail opens a lightbox showing that artifact at `max-w-[min(80vw,640px)]`, aspect-square reserved so nothing reflows while the image decodes.
2. The lightbox steps between all mesh stages that have landed so far, in pipeline order — on-screen prev/next arrows plus `←`/`→`. Arrows are disabled at the ends. A three-dot progression indicator sits under the caption.
3. Caption is a mono line: stage name plus the `meta` string taken verbatim from `rowPresentation()`, so the caption cannot drift from the row (e.g. `refine · 10c · 1:42`).
4. Dismiss on `Esc`, scrim click, or the close button. Focus traps inside the dialog while open and returns to the thumbnail that opened it.
5. `role="dialog"`, `aria-modal="true"`, labelled by the caption. The enlarge button carries an explicit `aria-label` (e.g. "Enlarge refine mesh").
6. The preview gate's image gets the same enlarge affordance, opening the lightbox with whatever mesh artifacts exist at that point (one, at `awaiting-review`). The gate's image is not inside a button today, so it becomes the button directly — no sibling-overlay trick needed there.
   - Enlarging never toggles the API panel: the enlarge button is a sibling of the row toggle, so activating it does not reach the toggle's handler. Tab order within a row is toggle → enlarge.
7. Motion: scrim fades at `--duration-normal`; the frame enters `translate-y-2 → 0` plus opacity on `--ease-stage`. Stepping crossfades opacity only — no horizontal slide, which would read as a carousel rather than a fidelity ladder. `prefers-reduced-motion` removes all of it.
8. The lightbox portals to `document.body` so it escapes the rail's `overflow-y-auto` and the mobile bottom sheet's `max-h-[60dvh]`.
9. `SNAPSHOT_SIZE` in `artifact-thumbnail.tsx` becomes 512; the rail continues to display at `size-8`.
10. Tests: Playwright in `tests/stage-rail.spec.ts` covering open, step forward/back, disabled arrows at both ends, `Esc` close, and focus restore; an axe scan in `tests/a11y.spec.ts` with the dialog open.

## CONSTRAINTS

- Do NOT install new packages — no headless-UI, no focus-trap library, no carousel. The dialog, the trap, and the stepping are hand-rolled (CLAUDE.md: components are hand-rolled; no new packages without spec authorization).
- Do NOT use `backdrop-blur` or any glassmorphism on the scrim (`DESIGN.md` forbidden defaults). Scrim is `bg-background/80`.
- Do NOT add shadows beyond the one permitted accent glow, which does not apply here — depth is surface step plus border.
- Do NOT put interactive 3D, orbit controls, or a live canvas in the lightbox. `DESIGN.md`/CLAUDE.md rule out the generic-model-viewer read; the enlarged view is a still image.
- Do NOT nest the enlarge button inside the existing row toggle button.
- Do NOT change the rail's visual layout — the thumbnail stays where it is, the caret keeps its position.
- Do NOT extend this to the gallery strip cards; out of scope.
- Do NOT modify `lib/meshy/` — the artifact list is derived from the existing run snapshot.

## ACCEPTANCE CRITERIA

- [ ] `npm run typecheck` passes; `npm run lint` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] `npx playwright test tests/stage-rail.spec.ts tests/a11y.spec.ts` passes
- [ ] design-reviewer pass
- [ ] Screenshots captured at 1280 and 375 with the lightbox open
- [ ] Manual: keyboard-only visitor can open, step, and close the lightbox and lands back on the thumbnail they started from

## DONE DEFINITION

Mark P2 #6 `[x]` in `docs/backlog/phase-2-ship.md`.
