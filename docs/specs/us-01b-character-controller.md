# US-01b: Character controller — walk, run, jump, emote with camera follow

**kind:** ui

## TASK

Make the playground character controllable — WASD/arrows + jump + emote with camera follow, clip blending between idle/walk/run/jump, no foot-sliding — controllable within 15 seconds of a cold page load.

## DEPENDENCIES

- P1 #2.1

## FILES TOUCHED

- `components/scene/` (controller module, input mapping, clip-blend logic; extends US-01a's character slot)
- `app/page.tsx` (control-hint overlay only)
- `tests/` (Playwright: keyboard input moves character)

## CONTEXT

- Controller decision is already made: **ecctrl first** (`docs/ARCHITECTURE.md` §5 Deferred decisions, resolved 2026-08-03) — clips are clean standard locomotion on one skeleton, no retargeting, no root motion. Hand-rolled rapier controller is the documented fallback *only if* ecctrl's clip-blending hooks fight the 5-clip set; invoking the fallback requires a Trade-off log entry.
- Clip facts (spike README "Findings"): durations idle 4.03s / walk 4.23s / run 0.77s / jump 1.93s / emote 5.37s. The 0.77s run loop is flagged for per-character QA — tune blend/playback so it doesn't strobe. Emote (Big_Wave_Hello) is an in-place action: gate movement input during it or blend out on movement.
- Clip actions come from US-01a's binding module (named actions on one `AnimationMixer`); wire ecctrl's movement state to those actions rather than letting it manage its own animation set, if its API allows — otherwise adapt via its animation-set convention.
- Movement polish is the demo's stated polish bet (`docs/ARCHITECTURE.md` Trade-off log, "Locomotion: 5 animation tasks"): blend walk↔run by speed, match playback rate to ground speed to kill foot-sliding at walk/run speeds (US-01 AC).
- Camera: follow cam per DESIGN.md motion — springs are reserved for the 3D world, so smooth-damped follow is in-character; `prefers-reduced-motion` cuts instead of glides.
- 15s metric (PRD primary metric, ROADMAP §P1): no instructions needed — show a minimal mono control hint (DESIGN.md voice) that fades once the visitor moves.

## REQUIREMENTS

1. WASD + arrow keys walk; a modifier or speed threshold runs; Space jumps; one key (e.g. E) emotes. All remappable in one constants module.
2. Idle/walk/run blend continuously by speed; playback rate scales with ground speed (no visible foot-slide at walk or run); jump plays once and returns to locomotion; emote plays once, movement input cancels or waits it out.
3. Camera follows behind/over shoulder, smooth-damped; never clips through the ground plane; reduced-motion uses cuts.
4. Character stays on the stage (physics collider or clamped bounds — playground, not a game; no fall-off-the-world state).
5. Idle is always the fallback state — the character is never frozen (CLAUDE.md anti-pattern).
6. Control-hint overlay: mono, tokenized, fades on first movement, reappears never (per session).
7. Playwright test: dispatch keydown, assert the character's world position changed.

## CONSTRAINTS

- Do NOT rebuild US-01a's scene/stage or clip-binding module — extend it.
- Do NOT modify `lib/meshy/`, the proxy, or `app/spike/page.tsx`.
- No mobile touch controls (PRD §4 non-goal).
- Forbidden: install packages other than those listed under "Allowed packages" below.
- Allowed packages: `ecctrl`, `@react-three/rapier` (ecctrl's physics peer). If the fallback fires, `@react-three/rapier` alone + a Trade-off log entry.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work (input→movement Playwright test; blend-logic unit test if blending is hand-rolled)
- [ ] Manual: cold load → controlling the knight (walk/run/jump/emote, camera following) within 15s, no instructions read
- [ ] design-reviewer pass (hint overlay + scene feel)

## DONE DEFINITION

Mark P1 #2.2 `[x]` in `docs/backlog/phase-1-the-demo.md`.
