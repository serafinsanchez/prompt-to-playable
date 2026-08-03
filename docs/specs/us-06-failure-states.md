# US-06: Understand failures without leaving the page

**kind:** ui

## TASK

Give every failure and wait state honest, specific, in-rail copy — Meshy's `task_error` verbatim with the auto-refund note, distinct treatments for the two 429 flavors, a plain-words rig-failure explainer — plus a retry affordance that reuses completed upstream stages.

## DEPENDENCIES

- P1 #5.2

## FILES TOUCHED

- `components/pipeline/` (failure states on stage rows, retry affordance, queue/backoff copy)
- `lib/meshy/pipeline.ts` + `lib/meshy/__tests__/pipeline.test.ts` (one addition: stage retry — see CONTEXT)
- `tests/`

## CONTEXT

- The machine already halts correctly: on FAILED it surfaces `task_error.message` verbatim into `StageState.error`, zeroes the stage's credits (auto-refund), and preserves every upstream task id "for retry reuse" (`lib/meshy/pipeline.ts` `applyTask`, lines 149–157). What's missing is the *resume-from-failure* entry point: `createPipeline({run})` resumes a `running` run, but a `failed` run stays terminal. This spec adds the one machine capability it needs — e.g. `retryFailedStage(run): PipelineRun` that resets the failed stage (and nothing upstream) to pending and the run to `running` — with fixture tests proving upstream ids are reused (no re-spend). This is a deliberate, tested `lib/meshy/` change; run the architecture-reviewer afterward per CLAUDE.md (it touches the load-bearing module).
- 429 flavors are already distinct states in snapshots (`docs/ARCHITECTURE.md` §4): `rateLimitBackoffMs != null` → RateLimitExceeded (auto-backoff, doubling to 60s cap — copy: backing off, will retry itself); `waitingForQueue` → NoMoreConcurrentTasks (copy: "Meshy queue full — waiting", normal cadence continues). Different copy, different behavior — never merged into one generic "rate limited".
- Auto-refund is a DevEx teaching moment (ARCHITECTURE §4): "failed tasks auto-refund" appears with every stage failure — the receipts already show 0 credits for the failed stage (`consumed_credits ?? 0`).
- Rig failure explainer (ARCHITECTURE §4 rigging gotcha): pose-estimation failures are input-shaped, not bugs. Plain words: rigging needs a standing, bipedal, humanoid character — suggest reshaping the prompt. The spike's only organic-style failure mode (`422 Pose estimation failed`) is the expected text.
- Voice: DESIGN.md — short sentences, technical-plain, dry half-smile; no forbidden words; the rail owns all of this (no toasts, no modals).
- Retry economics shown honestly: retrying re-spends only the failed stage's credits; say the number (mono): "Retry rig — 5 credits. Preview, refine, remesh are kept."

## REQUIREMENTS

1. Failed stage row expands to: Meshy's `task_error` verbatim (mono), auto-refund note, retry button with the stage's credit cost and the kept-stages line.
2. Retry resets only the failed stage via the new machine helper; the rail shows upstream stages still succeeded; fixture test proves no upstream create calls fire on retry.
3. Rig-stage failure additionally shows the biped explainer; a failed *preview* (prompt moderated/failed) points at the prompt instead.
4. `RateLimitExceeded`: stage row shows backing-off state with the current backoff visible (mono seconds); clears automatically on recovery.
5. `NoMoreConcurrentTasks`: "queue full — waiting" state, visually distinct from both progress and backoff; pairs with US-03b's `preceding_tasks` copy when present.
6. All failure/wait states reachable in tests via fixture transports (the existing fixtures already script FAILED and both 429s — extend scenarios as needed); Playwright covers the retry click path.

## CONSTRAINTS

- The `lib/meshy/` change is scoped to the retry helper + tests — do NOT restructure the machine, and do NOT skip the architecture-reviewer pass on it.
- Do NOT add toasts, modals, or a notification system — everything lives in the rail.
- Do NOT soften error text: `task_error` renders verbatim (trimmed, not rewritten).
- Do NOT auto-retry failed stages (auto-backoff for RateLimitExceeded is the machine's existing behavior and stays; *task failure* retry is always a user click — credits are real money).
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work (machine retry tests + UI state tests)
- [ ] All five states (stage failure, rig failure, preview failure, backoff, queue-full) renderable from fixtures and visually distinct
- [ ] design-reviewer pass; architecture-reviewer run on the `lib/meshy/` diff with no 🔴 findings

## DONE DEFINITION

Mark P1 #8 `[x]` in `docs/backlog/phase-1-the-demo.md`.
