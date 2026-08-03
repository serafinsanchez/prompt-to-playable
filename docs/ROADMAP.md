# ROADMAP — Prompt to Playable

> Three phases inside the 3-day assignment window (PRD §6: hard deadline). Each phase is shippable on its own: P0 proves the risky part works, P1 is the product, P2 is the submission.

## P0: Prove the pipeline, stand the stage — the risky bets resolve before any product UI exists.

**Acceptance criteria:**
- [ ] One biped character has gone prompt → preview → refine → rig → 5 animation clips through the typed client, and all five clips play on one skeleton in a minimal 3D harness — or the fallback ladder (2 clips / single showcase) has been invoked and logged in `docs/ARCHITECTURE.md`'s Trade-off log.
- [ ] The deployed skeleton app serves a page styled from `DESIGN.md` tokens, and the Meshy proxy passes a test-mode-key smoke test while rejecting non-Meshy paths.
- [ ] The pipeline state machine passes fixture-driven tests for: happy path, stage failure, both 429 flavors, and resume-from-storage.
- [ ] Credit budget confirmed: balance check shows the gallery plan (~8–12 characters at ~55 credits each) fits the grant, or the credit-request email has been sent.

**Depends on:** none

**Out of scope for this phase:** any product UI beyond a token-styled placeholder; gallery content; polish of any kind.

## P1: The demo — a cold visitor plays instantly; a key-holder generates live.

**Acceptance criteria:**
- [ ] A cold visitor (no key, no instructions) is controlling a gallery character — walk, run, jump, emote — within 15 seconds of page load.
- [ ] The gallery holds 8+ pre-generated characters, each showing its prompt, credit cost, and generation time; characters swap without a reload.
- [ ] A visitor with a Meshy key goes prompt → live stage rail → playing their own character in one sitting, including surviving a page refresh mid-generation.
- [ ] Every pipeline stage displays the real API request that produced it (endpoint, params, credit cost) as it runs.
- [ ] Stage failures, rate limits, and queue-full states each surface distinct, honest copy — including that failed tasks auto-refund.
- [ ] The final rigged, animated GLB is downloadable.
- [ ] First playable frame in under 5 seconds on ordinary broadband.

**Depends on:** P0 complete

**Out of scope for this phase:** motion polish beyond functional, README/content work, video. (And permanently: gameplay objectives, image-to-3D, accounts — see below.)

## P2: Polish + content + ship — the submission bundle, ready to publish.

**Acceptance criteria:**
- [ ] The signature stage-completion moment is polished per `DESIGN.md`; design-reviewer passes; a11y spec and reduced-motion behavior pass.
- [ ] 2–3 minute demo video recorded and edited to ready-to-publish quality.
- [ ] README reads as a landing page: hero shot, live link, 60-second quickstart, what-the-API-did section; MIT license; repo public under its final name.
- [ ] Distribution plan (1–2 paragraphs) finalized.
- [ ] Cold-visitor test run with 2–3 real people confirms the 15-second metric; submission checked against every line of the assignment PDF.

**Depends on:** P1 complete

**Out of scope for this phase:** new features of any kind. P2 adds zero capabilities.

## Out of scope for V1

Pulled from PRD §4 (reasons live there):

- Accounts / auth of any kind
- Image-to-3D mode
- Non-humanoid characters (quadrupeds, vehicles, limbless monsters)
- Gameplay depth — combat, enemies, objectives, scoring, physics puzzles
- Persistent user-generated gallery / share links
- Scene/character editing (materials, retargeting, color pickers)
- Mobile touch controls
- FBX/USDZ/other export formats
- Engine-specific content (Unity/Unreal/Godot tutorials, plugins)
- Own API, webhooks, admin tools, notifications, search, offline, real-time collab, i18n
- Onboarding tour / separate docs site
