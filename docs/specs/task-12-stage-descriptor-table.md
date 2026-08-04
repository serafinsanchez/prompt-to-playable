# TASK-12: Collapse per-stage dispatch into a stage-descriptor table

**kind:** backend

## TASK

Replace the `createStageTask`/`pollStageTask` if-chains and the scattered per-stage declarations with a single compiler-checked stage-descriptor table, so adding a stage is a one-row change. Behavior-preserving refactor.

## DEPENDENCIES

None. (P1 #8 coordination is a file-collision concern, not a dependency — see CONSTRAINTS.)

## FILES TOUCHED

- `lib/meshy/pipeline.ts`
- `lib/meshy/types.ts`
- `lib/meshy/__tests__/pipeline.test.ts` (additive descriptor-coverage test only; existing tests unchanged)
- `lib/meshy/stages.ts` (only if the executor chooses a separate home for the table)

## CONTEXT

- **The if-chains:** `createStageTask` (`lib/meshy/pipeline.ts:153`) maps preview → `createPreviewTask(prompt)`, refine → `createRefineTask(preview id)`, remesh → `createRemeshTask(refine id, REMESH_TARGET_POLYCOUNT)`, rig → `createRigTask(remesh id)`, then **falls through** to `createAnimationTask(rig id, clip)`. `pollStageTask` (`:163`): preview/refine → `getTextTo3DTask`, remesh → `getRemeshTask`, rig → `getRigTask`, fallthrough → `getAnimationTask`. The fallthrough is the compiler hole flagged in TASK-11's review: a future `StageId` member silently becomes an animate call.
- **Declaration sites today** (adding a stage = ~6 edits): `StageId` union, `PIPELINE_STAGES`, `STAGE_CREDITS` (`lib/meshy/types.ts:~75–97`), both if-chains.
- **The fix shape:** a `Record<StageId, StageDescriptor>` — the compiler forces exhaustiveness, so a new `StageId` member fails typecheck until its descriptor exists; no default branch anywhere. Descriptor carries credits + create + poll together. Create lambdas need the prompt and upstream ids (the `requireTaskId` closure, `pipeline.ts:147`); poll needs the stage's own taskId. Suggested: `create(client, ctx: { prompt: string; requireTaskId(s: StageId): string }): Promise<string>`, `poll(client, taskId): Promise<MeshyTask>`.
- **Import direction:** `client.ts` imports `types.ts`, so the table cannot live in `types.ts` with value imports from client. Use `import type { MeshyClient } from "./client"` (type-only, exists at `client.ts:46`) and put the table in `pipeline.ts` or a new `lib/meshy/stages.ts` — executor's call; no cycles.
- **`STAGE_CREDITS` is a public export** with consumers outside this module: `components/pipeline/stage-meta.ts`, `components/pipeline/api-descriptor.ts`, `scripts/pregen/__tests__/manifest.test.ts`, `tests/unit/api-descriptor.test.ts`. Keep the export with its exact `Record<StageId, number>` shape — derive it from the table (single declaration site) rather than keeping two lists.
- **Animate stages are templated** (`animate:${clip}` over `ANIMATION_CLIPS`): building their five descriptors by mapping `ANIMATION_CLIPS` satisfies "one declaration site" — the row is the map expression, not five copies.
- **Behavior anchor:** the fixture-transport tests in `lib/meshy/__tests__/pipeline.test.ts` pin the whole observable contract, including `creditsSpent === 55` (`:173`, `:439`). They must pass **unchanged** — no fixture edits, no test rewrites.

## REQUIREMENTS

1. One descriptor table typed `Record<StageId, ...>` holding credits + create + poll per stage; no `if (stage ===` dispatch and no default fallthrough remains in `pipeline.ts`.
2. `createStageTask`/`pollStageTask` become table lookups (they may stay as thin closures over the table).
3. `STAGE_CREDITS` remains exported with an unchanged type and values, derived from the table — a stage's credits exist in exactly one place.
4. No import cycles; `import type` for `MeshyClient` where needed.
5. Existing tests pass unchanged (`lib/meshy/__tests__/pipeline.test.ts` untouched except additive).
6. One additive test: every `PIPELINE_STAGES` member has a descriptor, and descriptor credits sum to 55.

## CONSTRAINTS

- Behavior-preserving: no changes to polling cadence, error handling, resume semantics, or `createPipeline`'s public API.
- Do NOT touch `components/`, `app/`, `scripts/`, `tests/` (Playwright/unit outside lib/meshy), or the proxy.
- **COORDINATION (P1 #8):** US-06 has in-flight uncommitted work in `lib/meshy/pipeline.ts` on the main checkout. Execute this spec on an isolated worktree branch cut from main HEAD; do not include, rebase, or "helpfully merge" US-06's changes. Whoever lands second resolves the conflict — US-06's `retryFailedStage` doesn't touch the dispatch, so it's mechanical.
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `npm run lint` passes (green output pasted)
- [ ] `grep -n 'if (stage ===' lib/meshy/pipeline.ts` returns nothing
- [ ] Existing pipeline tests pass with zero modifications; the additive descriptor test exists
- [ ] `STAGE_CREDITS` consumers compile unchanged

## DONE DEFINITION

Mark P1 #9 `[x]` in `docs/backlog/phase-1-the-demo.md`.
