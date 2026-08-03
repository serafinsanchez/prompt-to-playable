# TASK-05: Day-0 spike — full pipeline + 5-clip merge validation

**kind:** backend

## TASK

Run one biped character through the real Meshy pipeline end-to-end and prove (or fall back from) the 5-clip merge bet, resolving every deferred architecture decision that P1 spec-writing is blocked on.

## DEPENDENCIES

- P0 #1
- P0 #2

## FILES TOUCHED

- `scripts/spike/run-pipeline.ts`, `scripts/spike/README.md` (findings)
- `app/spike/page.tsx` (dev-only harness route; deleted or gated before P2 ships)
- `docs/ARCHITECTURE.md` (§5 deferred decisions + Trade-off log entries — outcome logging)
- `spike-output/` (gitignored GLBs)

## CONTEXT

- **This is the de-risk gate for the whole build** (`docs/ARCHITECTURE.md` §5 bets). P1 triage is explicitly waiting on its outcome.
- Uses `lib/meshy/` (TASK-03) with the direct transport and `MESHY_API_KEY` from local env — real credits, ~50 per character (preview 20 + refine 10 + rig 5 + 5×3 animate). Budget for up to 2–3 runs if the first prompt rigs poorly.
- Known rigging constraints (`../claude-code-resources/MESHY_CLAUDE.md`): textured bipedal humanoid required; `422` "pose estimation failed" is the common failure and means the prompt, not a bug. Pick an unambiguous biped prompt (e.g. "low-poly knight in armor, standing, arms at sides").
- Fallback ladder if 5-clip merge fails (ARCHITECTURE Trade-off log 2026-08-03): 2 clips (idle+walk) → single showcase animation. Invoking a fallback is a *successful* spike outcome if logged.
- Deferred decisions this spike must resolve (`docs/ARCHITECTURE.md` §5): drei ecctrl vs hand-rolled rapier controller (informed by what the clips look like); remesh stage yes/no (based on refined output poly counts — check with gltf-transform inspect); KTX2 only if GLB sizes threaten the 5s budget.

## REQUIREMENTS

1. `scripts/spike/run-pipeline.ts`: prompt → preview → refine(+PBR) → rig → 5 animation tasks (idle/walk/run/jump/emote or nearest available actions); download every GLB immediately on `SUCCEEDED` into `spike-output/`; print per-stage credits, timings, poly counts, and balance before/after.
2. `app/spike/page.tsx`: minimal R3F harness — load the rigged GLB, bind all downloaded AnimationClips to its skeleton, keyboard keys 1–5 switch clips. Ugly is fine; this page is not product UI.
3. Record findings in `scripts/spike/README.md`: rig success rate over attempts, clip-binding result (clean / retargeting needed / failed), file sizes pre/post optimization, chosen animation action ids, total credits spent.
4. Update `docs/ARCHITECTURE.md`: resolve the three deferred-decision rows and append a Trade-off log entry with the spike outcome (including fallback invocation if any).
5. Confirm credit budget for the P1 gallery plan (~8–12 × ~50c) against the live balance; if short, draft the credit-request email for the user to send.

## CONSTRAINTS

- Spend real credits only on the pipeline runs themselves — use the test-mode key while developing the script, switch to the real key for the actual runs.
- Do NOT build product UI, the pregen script, or gallery content — this is evidence-gathering.
- Do NOT commit `spike-output/` GLBs (gitignore) — repo assets arrive via the P1 pregen spec.
- Forbidden: install packages other than those listed under "Allowed packages" below.
- Allowed packages: `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `ecctrl` (evaluation), `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/cli`, `@types/three`

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` still green
- [ ] All 5 clips play on the rigged skeleton in `/spike` (or fallback ladder invoked with the failure documented)
- [ ] `docs/ARCHITECTURE.md` deferred decisions resolved + Trade-off log entry appended
- [ ] `scripts/spike/README.md` findings written; credit budget confirmed or request email drafted
- [ ] Balance before/after recorded — credits spent matches the per-stage math

## DONE DEFINITION

Mark P0 #4 `[x]` in `docs/backlog/phase-0-foundation.md`, then tell the user P1 is ready for re-triage.
