# US-07: The signature stage-completion moment

**kind:** ui

## TASK

Make each pipeline stage completion land as the designed beat from DESIGN.md — ring fills, tick lands, artifact thumbnail clips in from below, rail advances — and extend the same care to the final swap-in "arrival," so the minutes-long wait feels alive.

## DEPENDENCIES

- P1 #5.2 (stage rail exists)
- P1 #8 (US-06 failure states — same files; choreography must cover retry/failure rows, and the two specs are not parallel-safe)

## FILES TOUCHED

- `components/pipeline/` (progress-ring.tsx, stage-rail.tsx, artifact-thumbnail.tsx, completion-actions.tsx — motion only, no logic changes)
- `components/scene/` (swap-in arrival timing only, if the 380ms beat needs wiring)
- `app/globals.css` (motion tokens / keyframes if any are missing)
- `tests/`

## CONTEXT

- **The spec is already written — in DESIGN.md §Motion.** "Signature moment: a pipeline stage completing — progress ring fills, tick lands, artifact thumbnail clips in from below (220ms), rail advances. Spend polish here; it's the emotional beat of the wait." Easing `cubic-bezier(0.16, 1, 0.3, 1)` everywhere; durations fast 120 / normal 220 / slow 380ms (stage transitions, character swap-in); 60ms stagger between rail stages; only `transform` and `opacity`, `will-change` applied before and removed after.
- **Half the moment already exists.** `components/pipeline/progress-ring.tsx` lands the tick with a 220ms scale/opacity entrance and calls itself "the structural half of the P2 signature moment." This spec is the choreography half: sequencing ring-fill → tick → thumbnail clip-in → rail advance as one beat, not four simultaneous CSS transitions.
- **The arrival is in scope.** US-05's spec deferred "the full signature choreography" of the generated-character swap-in to P2 (see `docs/specs/us-05-play-and-download.md` CONTEXT). The 380ms swap-in beat on `completion-actions.tsx` → scene swap belongs here.
- **Reduced motion is currently unhandled in the rail.** `components/scene/use-prefers-reduced-motion.ts` exists but nothing in `components/pipeline/` imports it, and there's no global reduced-motion CSS override — verify, then implement DESIGN.md's strict rule: durations→0, stagger→0; state changes still legible (the tick still appears, instantly).
- **Failure rows are part of the choreography.** US-06 (in progress) adds failed/retry states to the same rows. A failed stage should land its cross with the same weight the tick has — the beat system covers every terminal state, not just success.

## REQUIREMENTS

1. Stage completion plays as a sequenced beat: ring completes its fill, tick lands (existing 220ms entrance), artifact thumbnail clips in from below (220ms), then the rail advances the running highlight to the next stage — with deliberate offsets (60ms stagger scale), not everything at once.
2. The final animate-group completion hands off into the swap-in arrival: completion actions appear and, when the character enters the scene, the 380ms swap-in beat plays (no scene hijack — respect US-05's chosen play/auto-swap behavior).
3. Failed stages land their cross with equivalent choreography weight; retry (US-06) restarting a stage resets its ring cleanly, no animation debris.
4. `prefers-reduced-motion`: durations and stagger collapse to 0 across all pipeline UI; every state remains fully legible; the character's own idle animation may keep playing (DESIGN.md: it's content, not chrome).
5. Only `transform` and `opacity` animate; `will-change` is applied before and removed after; nothing exceeds 400ms.
6. Tests: unit coverage for any new sequencing logic (e.g. beat-state hook or stagger math); existing stage-rail tests stay green.

## CONSTRAINTS

- Motion polish ONLY — do NOT change pipeline logic, store shape, or `lib/meshy/` anything.
- Do NOT add a toast, confetti, particle, or full-screen effect — the rail owns pipeline status (CLAUDE.md anti-patterns); the beat lives inside the existing rows.
- Do NOT begin until P1 #8 (US-06) is merged — shared files in `components/pipeline/`.
- do NOT install new packages (no framer-motion, no GSAP — DESIGN.md durations + CSS/`transition` and rAF are sufficient).

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work
- [ ] Matches DESIGN.md §Motion including reduced-motion behavior (verify with OS-level reduce-motion toggled)
- [ ] design-reviewer PASS on the completion beat (run it on a fixture-driven run so stages actually complete on camera)

## DONE DEFINITION

Mark P2 #1 `[x]` in `docs/backlog/phase-2-ship.md`.
