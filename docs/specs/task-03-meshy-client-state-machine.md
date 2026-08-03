# TASK-03: Typed Meshy client + pipeline state machine (`lib/meshy/`)

**kind:** backend

## TASK

Build the isomorphic typed Meshy client and the character-pipeline state machine with swappable transport, polling, per-stage credit tracking, and storage-based resume — fully covered by fixture-driven Vitest tests.

## DEPENDENCIES

- P0 #1

## FILES TOUCHED

- `lib/meshy/types.ts`, `lib/meshy/client.ts`, `lib/meshy/pipeline.ts`, `lib/meshy/transport.ts`, `lib/meshy/storage.ts`
- `lib/meshy/__tests__/` (fixtures + tests)

## CONTEXT

- API behavior source of truth: `../claude-code-resources/MESHY_CLAUDE.md` (sibling folder in the parent workspace, NOT part of this repo — copy facts, never import). Key facts: Text to 3D is **v2**, all other endpoints **v1**; async task model `PENDING → IN_PROGRESS → SUCCEEDED/FAILED/CANCELED` with `progress` 0–100; chain by `preview_task_id`/`input_task_id`; failed tasks auto-refund; two 429 flavors (`RateLimitExceeded` vs `NoMoreConcurrentTasks`); assets expire in 3 days.
- Fixture-transport test pattern proven in `../claude-code-resources/print-pipeline.fixtures.ts` + `print-pipeline.selftest.ts` — a transport interface the tests replace with scripted responses. Reproduce the pattern here idiomatically; do not copy file contents wholesale.
- Pipeline shape and polling cadence: `docs/ARCHITECTURE.md` §3–§4 (stages `preview(20c) → refine+PBR(10c) → rig(5c) → animate ×5(3c each)`; poll ~4s; resume via task ids; localStorage schema carries a `version` field).
- Animation endpoint parameter shape (`v1/animations` — how an action/animation is selected) is the least-documented call: implement against the official docs and leave a clearly named constant for the 5 clip actions (idle/walk/run/jump/emote) so TASK-05 can adjust ids without touching logic.
- This module must run in browser AND Node (`scripts/pregen/` later): no `window`/`process` access outside injected adapters (transport, storage, clock).

## REQUIREMENTS

1. `types.ts`: `MeshyTask`, stage names, `PipelineRun` (per `docs/ARCHITECTURE.md` §2), typed errors distinguishing the two 429s.
2. `transport.ts`: minimal interface (`request(path, init) → json`) with two implementations: browser (calls `/api/meshy/*` with `x-meshy-key` header) and direct (calls `https://api.meshy.ai/*` with Bearer — for Node scripts).
3. `client.ts`: typed calls for text-to-3d preview/refine, rigging, animations, remesh, balance; each returns task ids / task objects; no polling logic here.
4. `pipeline.ts`: pure state machine advancing a `PipelineRun` — start, poll tick (~4s via injected clock), stage transitions, per-stage credit + timing capture, halt-on-failure with upstream results preserved, back-off on `RateLimitExceeded`, keep-waiting on `NoMoreConcurrentTasks`. Emits state snapshots via callback/subscribe (UI-agnostic; Zustand wiring happens in a later app spec).
5. `storage.ts`: versioned serialize/restore of `PipelineRun` against an injected storage adapter; incompatible version → discard cleanly.
6. Tests (fixture transport, no network): happy path end-to-end; stage failure (verify `task_error` surfaced + upstream ids preserved); `RateLimitExceeded` backs off and recovers; `NoMoreConcurrentTasks` keeps polling; restore-from-storage resumes mid-pipeline; version mismatch discards.

## CONSTRAINTS

- Do NOT build any UI or touch `app/` (except nothing — this spec is `lib/` + tests only).
- Do NOT implement the proxy (TASK-04) or hit the live API in tests.
- Chain by task ids only — never download-and-reupload between stages.
- Do NOT install new packages. (`zustand` is authorized later with the UI spec, not here — the state machine stays store-agnostic.)

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes; all six scenario tests above exist and are green
- [ ] `lib/meshy/` imports cleanly from a Node context (`npx tsx -e "import('./lib/meshy/client.ts')"` succeeds)

## DONE DEFINITION

Mark P0 #2 `[x]` in `docs/backlog/phase-0-foundation.md`.
