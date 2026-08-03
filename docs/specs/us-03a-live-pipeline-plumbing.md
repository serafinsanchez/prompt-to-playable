# US-03a: Live generation plumbing — key entry, prompt, pipeline store, resume

**kind:** ui

## TASK

Wire the pipeline state machine into the app: key entry (sessionStorage), prompt input with biped guidance, a Zustand store driving `createPipeline()` on a ~4s tick, task-id persistence to localStorage, and resume-after-refresh — with a minimal visible stage list proving it runs end to end.

## DEPENDENCIES

- P1 #1 (6-stage graph — a live run cannot complete without remesh)

## FILES TOUCHED

- `lib/store/` or `components/pipeline/store.ts` (new: Zustand pipeline store + tick driver)
- `components/pipeline/` (new: key entry, prompt input, minimal stage list)
- `app/page.tsx`
- `tests/` + `lib` unit tests (store against fixture transport)

## CONTEXT

- Everything below the UI already exists and is tested: `createPipeline({client, clock})` with `start()`/`tick()`/`subscribe()` (`lib/meshy/pipeline.ts`); `createBrowserTransport` sends `x-meshy-key` to the proxy (`lib/meshy/transport.ts`); `saveRun`/`loadRun`/`clearRun` with versioned discard (`lib/meshy/storage.ts`, `STORAGE_KEY = "prompt-to-playable:pipeline-run"`). The store's job is orchestration only: subscribe → mirror snapshots into Zustand → `saveRun` on every emit → `setInterval`-driven `tick()` at `POLL_INTERVAL_MS` (4s). Do not re-implement machine logic in the store.
- Key handling is the project's auth section (`docs/ARCHITECTURE.md` §4): React state + `sessionStorage`, sent as `x-meshy-key`, never logged, never in URLs, one keystroke to clear. Dev/CI: test-mode key `msy_dummy_api_key_for_test_mode_12345678` (zero credits; note: it cannot pass rig — live smoke stops at refine, fixture tests cover the full graph).
- Resume (ROADMAP §P1 AC: "surviving a page refresh mid-generation"): on mount, `loadRun` → if a non-terminal run exists, hydrate the store and keep ticking; `createPipeline({run})` accepts a restored run.
- Biped guidance (ARCHITECTURE §4 rigging gotcha): the prompt UI nudges toward standing bipedal humanoids — placeholder text + one mono helper line, DESIGN.md voice, not a modal or tooltip tour.
- The minimal stage list here is scaffolding for US-03b's real rail: stage name + status + progress number in mono, in `components/pipeline/` where the rail will replace it. No rings/animation polish yet.
- Zustand was explicitly deferred to this spec (task-03 CONSTRAINTS: "zustand is authorized later with the UI spec").

## REQUIREMENTS

1. Key entry component: paste key → held in React state + `sessionStorage`; visible masked; clear button wipes both. States: empty, filled, error (proxy 401 surfaces as "key rejected" copy).
2. Prompt input + start action: disabled without key; biped guidance copy; starting creates the run and the stage list appears.
3. Store drives the machine: 4s interval tick, snapshots in Zustand, `saveRun` on every change, interval cleaned up on terminal status/unmount.
4. Refresh mid-run resumes: task ids reload, polling continues, elapsed time stays truthful (machine timestamps, not remount time).
5. Terminal runs: succeeded/failed states stop the ticker; a "start over" affordance calls `clearRun` and resets.
6. Credit + elapsed readout (mono): `creditsSpent` and elapsed from machine timestamps — must match reality (US-03 AC).
7. Tests: store logic against the fixture transport (start → tick → snapshot flow, resume path, terminal cleanup); Playwright: enter test-mode key, start, stage list appears, reload, run state persists.

## CONSTRAINTS

- Do NOT modify `lib/meshy/` (report gaps instead of patching around them).
- Do NOT build progress rings, artifact previews, or failure-copy states — US-03b and US-06 own those; keep the stage list deliberately plain.
- Key never touches `localStorage`, URLs, or logs; run persistence (task ids) is `localStorage`, key is `sessionStorage` — don't mix them.
- No toasts, no full-screen spinners (DESIGN.md forbidden defaults).
- Forbidden: install packages other than those listed under "Allowed packages" below.
- Allowed packages: `zustand`.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work (store unit tests + Playwright flow)
- [ ] Manual with test-mode key: start → preview/refine progress live → refresh mid-refine → run resumes
- [ ] design-reviewer pass on key entry + prompt bar (stage list is exempt as scaffolding, but tokens/mono rules still apply)

## DONE DEFINITION

Mark P1 #5.1 `[x]` in `docs/backlog/phase-1-the-demo.md`.
