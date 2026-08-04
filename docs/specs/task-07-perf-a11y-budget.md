# TASK-07: Performance + accessibility budget pass

**kind:** infra

## TASK

Verify the demo's two hard budgets — first playable frame under 5s on throttled broadband, and a real a11y bar (axe clean, keyboard path, reduced motion) — with measurements checked into tests, fixing small violations in place and filing anything larger.

## DEPENDENCIES

- P2 #1 (the motion/a11y pass must cover the final polished UI, not a moving target)

## FILES TOUCHED

- `tests/a11y.spec.ts` (flesh out the scaffold: more states, keyboard path)
- `tests/` (new perf spec)
- `playwright.config.ts`
- `next.config.ts` (only if bundle findings require it)
- `components/` (small in-place fixes only)

## CONTEXT

- **The a11y spec is a scaffold.** `tests/a11y.spec.ts` runs axe (wcag2a/aa/21a/21aa) on `ROUTES = ['/']` across 3 viewports — its own comment says "Edit this list to cover your key routes." The single route is correct (one-page app), but the *states* aren't covered: key entry open, prompt bar focused, stage rail mid-run, failure row with retry (US-06), completion state (US-05). Reach pipeline states without live API by seeding the store/localStorage the way existing Playwright specs do — see `tests/stage-rail.spec.ts` and `tests/completion.spec.ts` for the established mocking pattern before inventing one.
- **Perf budget source:** PRD success metrics + ROADMAP §P1: "first playable frame <5s on ordinary broadband." Measure in Playwright via CDP network throttling (`page.context().newCDPSession` + `Network.emulateNetworkConditions` — built into Playwright, no new packages). "First playable frame" = default character visible and controllable, not `load` event; assert on the same signal the 15s cold-visitor metric uses.
- **Bundle reality check:** dependencies include three, R3F, drei, rapier, ecctrl — the physics/controller stack is the bundle risk. `npm run build` output is the audit baseline. `public/gallery/` is 23MB total but characters load on demand; the budget only charges the default character's assets + JS to interactivity.
- **Keyboard path:** DESIGN.md/US-01b established WASD/arrows + jump + emote; the a11y question is the DOM UI — tab order through key entry → prompt → rail → download, visible `focus-visible` states (CLAUDE.md requires them on every interactive component), no keyboard trap in the canvas.
- **Reduced motion:** US-07 implements it; this pass *verifies* it — axe won't catch motion, so add an explicit `prefers-reduced-motion` emulated check (`page.emulateMedia({ reducedMotion: 'reduce' })`) asserting durations are collapsed.

## REQUIREMENTS

1. A checked-in Playwright perf spec measures time-to-playable on an emulated ordinary-broadband profile (pick and document the throttle numbers, e.g. 10 Mbps / 40ms RTT) and asserts <5s.
2. `npm run build` bundle audit written up briefly (sizes of first-load JS + default character assets) in the spec's run notes or a short `docs/` note; any finding that needs real work (code-splitting, asset re-optimization) goes to backlog intake, not scope creep here.
3. `tests/a11y.spec.ts` covers the key UI states (key entry, prompt, mid-run rail, failure+retry row, completion) via the established mocking pattern; axe clean at wcag2a/aa/21a/21aa across the 3 existing viewports.
4. Keyboard-only path verified in a test: tab order reaches key entry, prompt, retry, and download controls with visible focus; canvas doesn't trap focus.
5. Reduced-motion verified in a test via `emulateMedia`.
6. Small violations found along the way (missing label, focus style, contrast token) fixed in place; anything structural filed via backlog intake.

## CONSTRAINTS

- This is a verification-and-small-fixes pass — do NOT redesign components, restructure the scene graph, or swap dependencies to hit budgets; file findings instead.
- Do NOT modify `lib/meshy/` or `scripts/pregen/`.
- Do NOT weaken a budget to make it pass — a red measurement is a valid, reportable outcome (flag it, file the fix).
- do NOT install new packages (CDP throttling and axe are already available).

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] `npx playwright test tests/a11y.spec.ts` green with the expanded state coverage
- [ ] Perf spec exists and passes with the documented throttle profile (or the measured miss is explicitly reported + filed)
- [ ] Bundle audit note exists with real numbers

## DONE DEFINITION

Mark P2 #2 `[x]` in `docs/backlog/phase-2-ship.md`.
