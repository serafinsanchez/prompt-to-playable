# US-03b: The stage rail — live progress, artifact previews, queue honesty

**kind:** ui

## TASK

Replace US-03a's plain stage list with the real pipeline rail: per-stage progress ring, intermediate artifact previews as each stage lands, queue-depth honesty for PENDING stages, docked left on desktop / bottom-sheet on small screens.

## DEPENDENCIES

- P1 #5.1

## FILES TOUCHED

- `components/pipeline/` (rail, stage row, progress ring, artifact thumbnail)
- `app/page.tsx` (layout slot)
- `tests/` (Playwright with fixture-driven store states)

## CONTEXT

- Data: the store's `PipelineRun` snapshots (US-03a). Per stage: `status`, `progress` 0–100, `creditCost`, `modelUrl`, timestamps (`lib/meshy/types.ts` `StageState`). `MeshyTask.preceding_tasks` is typed and flows through polls — ARCHITECTURE §4 and the spike both order the rail to surface it: remesh sat behind 477–532 tasks for ~2h while processing took 2.5m (spike README run 2). "Queued behind N tasks" is honest copy; a 0-progress ring for 2 hours is not. Note: `StageState` doesn't currently persist `preceding_tasks` — if it isn't reachable from the snapshot, surface that gap to the user before hacking around it (it's a one-field `lib/meshy/` addition that belongs in a reviewed change).
- Layout: DESIGN.md Space & shape — "pipeline rail docks left on desktop, bottom-sheet on small screens." Rail is a thin overlay; the scene stays the hero.
- The rail owns ALL pipeline status (forbidden defaults: no toasts, no spinners). Mono voice throughout; stage chips may use pill radius; active stage gets the accent + the one allowed soft accent glow.
- Artifact previews: preview/refine/remesh produce meshes (`modelUrl` GLB) — a thumbnail or minimal inline render as each lands ("intermediate artifact previews as each stage lands", US-03 AC). Rig/animate previews can be iconographic; the payoff moment is US-05's scene swap, don't duplicate it here.
- Motion budget (DESIGN.md): stage transitions 380ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`, stagger 60ms, transform/opacity only, reduced-motion → durations 0. The *signature* completion moment (ring fill + tick + clip-in choreography) is P2 US-07 — build the structure it will polish (ring, tick, thumbnail slot) functionally, don't spend polish time now.
- Credits/time: per-stage credit shown when terminal (`creditCost` — real `consumed_credits`, auto-refund shows 0), run totals from US-03a's readout move into/next to the rail.

## REQUIREMENTS

1. Rail renders all 9 stages (preview, refine, remesh, rig, animate×5) with the animate group visually grouped; pending/running/succeeded/failed states visually distinct without color alone (a11y).
2. Running stage: progress ring driven by `progress`, mono percentage, accent treatment; PENDING with `preceding_tasks` present shows "queued behind N tasks" instead of a dead ring.
3. Succeeded stage: tick, real credit cost, duration (from stage timestamps), artifact thumbnail for mesh stages.
4. Failed stage: marked distinctly with the stage frozen at failure — copy details are US-06's; render its slot (`error` string presence) plainly for now.
5. Responsive: left dock ≥ desktop breakpoint, bottom-sheet below; both keyboard-navigable.
6. Playwright tests drive the store with scripted fixture states (no live API): all-states render, queue-depth copy, reduced-motion snapshot.

## CONSTRAINTS

- Do NOT modify `lib/meshy/` yourself — if `preceding_tasks` isn't in snapshots, stop and surface it (see CONTEXT).
- Do NOT implement failure/retry copy flows (US-06) or the API-call panel (US-04).
- Do NOT over-polish the completion moment — US-07 (P2) owns the signature beat.
- No toasts, no spinners, no `backdrop-blur` (DESIGN.md).
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work
- [ ] Manual with test-mode key: preview + refine run with live rings; fixture-driven storybook-style states cover the rest
- [ ] design-reviewer pass at 4 viewports

## DONE DEFINITION

Mark P1 #5.2 `[x]` in `docs/backlog/phase-1-the-demo.md`.
