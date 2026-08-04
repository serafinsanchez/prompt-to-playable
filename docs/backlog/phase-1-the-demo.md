# Phase 1 — The demo: playable gallery + live generation

> Theme: a cold visitor plays instantly; a key-holder generates live. Acceptance criteria for the phase as a whole: `docs/ROADMAP.md` §P1. Triaged 2026-08-03 after the day-0 spike (P0 #4) landed.

| # | Status | Kind | Item | Spec |
|---|--------|------|------|------|
| 1 | `[x]` | backend | TASK-11: Remesh stage in the pipeline state machine (55c graph) | [task-11-remesh-stage.md](../specs/task-11-remesh-stage.md) |
| 2.1 | `[x]` | ui | US-01a: Playground stage + idling default character | [us-01a-playground-scene.md](../specs/us-01a-playground-scene.md) |
| 2.2 | `[x]` | ui | US-01b: Character controller — walk/run/jump/emote, camera follow | [us-01b-character-controller.md](../specs/us-01b-character-controller.md) |
| 3.1 | `[x]` | backend | TASK-06a: Pregen script + optimizer + manifest (offline-verified, knight seeded) | [task-06a-pregen-script.md](../specs/task-06a-pregen-script.md) |
| 3.2 | `[x]` | backend | TASK-06b: Live gallery run — 8+ characters (credits topped up 2026-08-03: 8,000 available) | [task-06b-gallery-run.md](../specs/task-06b-gallery-run.md) |
| 4 | `[x]` | ui | US-02: Gallery browse + character swap | [us-02-gallery-swap.md](../specs/us-02-gallery-swap.md) |
| 5.1 | `[x]` | ui | US-03a: Live-gen plumbing — key entry, prompt, store, resume | [us-03a-live-pipeline-plumbing.md](../specs/us-03a-live-pipeline-plumbing.md) |
| 5.2 | `[x]` | ui | US-03b: Stage rail — progress rings, artifact previews, queue depth | [us-03b-stage-rail.md](../specs/us-03b-stage-rail.md) |
| 6 | `[x]` | ui | US-04: Per-stage API-call panel | [us-04-api-panel.md](../specs/us-04-api-panel.md) |
| 7 | `[~]` | ui | US-05: Play the generated character + download GLB | [us-05-play-and-download.md](../specs/us-05-play-and-download.md) |
| 8 | `[ ]` | ui | US-06: Failure states + stage retry | [us-06-failure-states.md](../specs/us-06-failure-states.md) |

**Dependency notes:** #1 and #2.1 have no deps — start either first (parallel-safe: disjoint FILES TOUCHED). #2.2 ← #2.1. #3.1 ← #1. #3.2 ← #3.1 + external credit gate. #4 ← #2.1 + #3.1 (8+ count arrives with #3.2, no UI change). #5.1 ← #1. #5.2 ← #5.1. #6 ← #5.2. #7 ← #2.2 + #5.1. #8 ← #5.2 (also touches `lib/meshy/` — not parallel-safe with anything else in `lib/meshy/`).

**Package authorizations made at triage:** #2.2 `ecctrl` + `@react-three/rapier`; #3.1 `meshoptimizer` (+ `sharp` only if needed); #5.1 `zustand`.
