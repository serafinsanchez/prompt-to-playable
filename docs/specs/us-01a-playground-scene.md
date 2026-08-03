# US-01a: Playground stage with an idling default character

**kind:** ui

## TASK

Build the full-bleed R3F playground scene — stage, lighting, atmosphere — with the spike knight loaded as the default character, idle clip always playing, on the main page.

## DEPENDENCIES

None (P0 complete; uses spike assets already in `public/spike/`).

## FILES TOUCHED

- `components/scene/` (new: canvas wrapper, playground stage, character loader/clip binding)
- `app/page.tsx`
- `tests/` (Playwright: scene mounts, canvas present)

## CONTEXT

- The proven clip-binding pattern is `app/spike/page.tsx` (134 lines): `useGLTF` the rig + 5 clip GLBs, one `THREE.AnimationMixer` on the rig scene, play a clip's single `AnimationClip`. All five clips bind with zero missing track targets (`scripts/spike/check-binding.mts`, spike README "Findings"). Lift this into `components/scene/` properly — the spike page itself stays untouched as evidence.
- Default character assets: `public/spike/rig.glb` + `public/spike/animate-{idle,walk,run,jump,emote}.glb` (~8.5 MB each — acceptable placeholder until TASK-06a produces the optimized gallery knight; keep the loader path manifest-shaped so US-02 can swap sources without rework).
- Aesthetic: `DESIGN.md` — "Dark stage: the 3D scene is the hero." Scene canvas full-bleed edge-to-edge; warm charcoal world (`--color-background` oklch(0.15 0.008 80)); one electric chartreuse accent, never decorative. Atmosphere = layered lighting/fog/ground treatment, not props. References: Lusion.co restraint.
- Anti-patterns (CLAUDE.md): NOT a model viewer — no orbit-controls-as-the-experience; no dead 3D — idle animation always playing, never a frozen character; no full-screen spinners — if the GLB is still loading, show a DESIGN.md-voiced placeholder, not a spinner.
- R3F/drei/three are already installed (`package.json`). `Suspense` + `useGLTF` preload pattern is in the spike page.
- 15s/5s budgets (ROADMAP §P1): this spec sets up the first-playable-frame path — preload the default character, don't lazy-load it behind interaction.

## REQUIREMENTS

1. `components/scene/` exposes a `<Playground>` (name per `docs/ARCHITECTURE.md` §3) that renders the full-bleed canvas, stage environment (ground, lighting, atmosphere per DESIGN.md), and a character slot.
2. Character loading + clip binding live in their own module (one concept per file): given a rig GLB URL + clip GLB URLs, return the bound scene + named actions (idle/walk/run/jump/emote) via one `AnimationMixer`.
3. `app/page.tsx` mounts the playground with the spike knight; idle plays immediately on load and loops forever.
4. Loading state before first frame follows DESIGN.md voice (mono, short sentence) — no spinner.
5. `prefers-reduced-motion`: the character's idle keeps playing (it's content, not chrome — DESIGN.md motion §), any DOM/scene chrome animation is stripped.
6. A Playwright test asserts the page renders the canvas and no console errors during mount.

## CONSTRAINTS

- No character movement/input in this spec — US-01b owns the controller. The character idles in place.
- Do NOT modify `app/spike/page.tsx`, `lib/meshy/`, or the proxy.
- Semantic tokens only; scene clear-color/fog values must come from the same OKLCH values as the tokens (duplicating the literal inside the scene module with a comment pointing at `globals.css` is acceptable — three needs raw colors).
- do NOT install new packages. (ecctrl/rapier arrive in US-01b.)

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work (clip-binding module unit test + Playwright mount test)
- [ ] Cold `npm run dev` load shows the knight idling on the dark stage with no interaction and no frozen frame
- [ ] design-reviewer pass on the rendered page

## DONE DEFINITION

Mark P1 #2.1 `[x]` in `docs/backlog/phase-1-the-demo.md`.
