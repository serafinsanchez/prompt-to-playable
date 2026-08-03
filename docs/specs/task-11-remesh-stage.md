# TASK-11: Add the remesh stage to the pipeline state machine

**kind:** backend

## TASK

Insert the mandatory `remesh` stage between refine and rig in the pipeline state machine (55 credits total), extend the fixture tests to the 6-stage linear head, and bump the storage version so stale 4-stage runs are discarded cleanly.

## DEPENDENCIES

None (P0 complete).

## FILES TOUCHED

- `lib/meshy/types.ts`
- `lib/meshy/pipeline.ts`
- `lib/meshy/storage.ts`
- `lib/meshy/__tests__/fixtures.ts`, `lib/meshy/__tests__/pipeline.test.ts`, `lib/meshy/__tests__/storage.test.ts`
- `docs/ARCHITECTURE.md` (§4 implementation-status note only)

## CONTEXT

- Why remesh is mandatory: refine outputs ~583k tris and rigging hard-rejects >300k faces with a 400 — day-0 spike run 1, `scripts/spike/README.md` + `docs/ARCHITECTURE.md` Trade-off log 2026-08-03. Live graph is `preview(20c) → refine(10c) → remesh(5c) → rig(5c) → animate ×5(3c)` = **55c**, `target_polycount: 30000` (spike-validated: 29,015 tris rigged first-try).
- The client is already done: `createRemeshTask(inputTaskId, targetPolycount?)` / `getRemeshTask(taskId)` exist in `lib/meshy/client.ts` (lines 58–60) and were exercised live by the spike's `--from-refine` lane. This spec touches only the state machine, not the client or transport.
- `lib/meshy/types.ts`: `StageId` union (line 75), `PIPELINE_STAGES` (line 78), `STAGE_CREDITS` (line 86 — its doc comment still says "50 total"). Add `"remesh"` between `"refine"` and `"rig"` in all three.
- `lib/meshy/pipeline.ts`: `LINEAR_STAGES` (line 59) is the loop the linear head walks; `createStageTask()` (line 108) maps stage → client call; `pollStageTask()` (line 116) maps stage → get call (`remesh` polls `getRemeshTask`). Chain: remesh takes refine's task id, rig takes **remesh's** task id.
- `lib/meshy/storage.ts`: `STORAGE_VERSION = 1`. Adding a stage key changes the `PipelineRun` shape, so restored v1 runs would be missing `stages.remesh` — bump to 2; `loadRun()` already discards mismatched versions cleanly (existing test in `storage.test.ts`).
- Fixture pattern: `lib/meshy/__tests__/fixtures.ts` scripts a fake transport per scenario; tests drive `tick()` manually with a fake clock. Extend, don't restructure.

## REQUIREMENTS

1. `types.ts`: `StageId` includes `"remesh"`; `PIPELINE_STAGES` order is preview, refine, remesh, rig, animate×5; `STAGE_CREDITS.remesh = 5` and the "50 total" comment says 55.
2. `pipeline.ts`: `LINEAR_STAGES` is `["preview", "refine", "remesh", "rig"]`; remesh is created with `createRemeshTask(refineTaskId, 30000)` and polled with `getRemeshTask`; rig is created from the remesh task id.
3. `storage.ts`: `STORAGE_VERSION = 2`.
4. Tests updated/added: happy path drives all 6 linear-head transitions plus the animate group; remesh-stage failure halts the run with `task_error` surfaced and preview/refine ids preserved; both 429 flavors still pass; a stored v1 run is discarded on load.
5. Grep `lib/meshy/` for stale "50" credit-total references (comments included) and fix every one.
6. Update the `docs/ARCHITECTURE.md` §4 "Implementation status" sentence (line ~79) to say the state machine now runs the 6-stage/55c graph, and strike the matching "Deferred" bullet in the Trade-off log entry only if the log's append-only rule allows an inline strike — otherwise leave the log untouched.

## CONSTRAINTS

- Do NOT touch `lib/meshy/client.ts` or `lib/meshy/transport.ts` — the remesh client surface already exists and is spike-validated.
- Do NOT build any UI or touch `app/`.
- Do NOT hit the live API in tests; fixture transports only.
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes; the remesh happy-path, remesh-failure, and v1-discard tests exist and are green
- [ ] `createPipeline()` fixture happy path ends `succeeded` with `creditsSpent === 55`
- [ ] `grep -rn "50" lib/meshy/*.ts` shows no remaining credit-total claims of 50

## DONE DEFINITION

Mark P1 #1 `[x]` in `docs/backlog/phase-1-the-demo.md`.
