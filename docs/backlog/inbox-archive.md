# Inbox archive

Triaged and resolved inbox items, newest first. Original bodies preserved for provenance.

### [x] triaged → Phase 1 #9 TASK-12: Collapse per-stage dispatch into a stage-descriptor table
**Description:** Adding remesh (TASK-11) required six coordinated edits across `lib/meshy/types.ts` + `pipeline.ts` (`StageId`, `PIPELINE_STAGES`, `STAGE_CREDITS`, plus the `createStageTask`/`pollStageTask` if-chains), and the if-chains fall through to the animate default with no compiler protection. Replace them with a single per-stage descriptor table (credits + create/poll lambdas) so adding a stage is a one-row change. Behavior-preserving refactor.
**Acceptance criteria:**
- [ ] `createStageTask`/`pollStageTask` if-chains replaced by table dispatch; existing 44 tests pass unchanged
- [ ] A stage exists in exactly one declaration site (credits, create, poll together)
**Priority:** P1
**Notes:** From the 2026-08-03 thermo-nuclear review of TASK-11. "Schedule before or with US-06" window closed (US-06 already in progress at triage); user chose 2026-08-03 to run it now on an isolated branch — coordination note in the spec's CONSTRAINTS.

### [x] triaged → Phase 2 #1 US-07: Feel the signature stage-completion moment
**As a** visitor watching a generation, **I want** each stage completion to land as a designed beat (ring fills, tick, artifact clips in, rail advances), **so that** the minutes-long wait feels alive.
**Acceptance criteria:**
- [ ] Matches DESIGN.md motion spec incl. reduced-motion behavior; design-reviewer PASS
**Priority:** P1
**Phase:** P2

### [x] triaged → Phase 2 #2 TASK-07: Performance + a11y budget pass
**Description:** Verify <5s first playable frame on throttled broadband; bundle/asset audit; kit a11y spec + keyboard path + reduced-motion pass.
**Acceptance criteria:**
- [ ] Measured first-frame <5s (throttled); `tests/a11y.spec.ts` green
**Priority:** P1
**Phase:** P2

### [x] triaged → Phase 2 #3 TASK-08: README as landing page + repo publish
**Description:** Hero shot/GIF, live Vercel link up top, 60-second quickstart, how-the-pipeline-works with real API calls, credit-cost table, MIT license. Decide final public repo name (lean: `prompt-to-playable`) and publish.
**Acceptance criteria:**
- [ ] A dev who only reads the README can run it locally and knows what the API costs
- [ ] Repo public, MIT, final name
**Priority:** P0
**Phase:** P2
**Triage note:** repo found already public under the final name with a description; the spec narrows to README + LICENSE + hero + a history-hygiene check.

### [x] triaged → Phase 2 #4 TASK-09: Demo video (2–3 min), ready-to-publish
**Description:** Record and edit: cold-open on gameplay (<10s in), live generation with the rail, API panel beat, download beat, closer. Script tight; captions.
**Acceptance criteria:**
- [ ] Watchable without audio; gameplay appears in the first 10 seconds; publish-ready export
**Priority:** P0
**Phase:** P2

### [x] triaged → Phase 2 #5 TASK-10: Distribution plan + submission bundle
**Description:** 1–2 paragraph distribution plan (communities, positioning, existing presence). Run the cold-visitor test with 2–3 people (15s metric). Check every line of the assignment PDF; send.
**Acceptance criteria:**
- [ ] 15s metric verified with real people; all three deliverables (project, content, plan) bundled and submitted
**Priority:** P0
**Phase:** P2

### [x] triaged → Phase 1 #1 TASK-11: Add the remesh stage to the pipeline state machine
**Description:** Insert `remesh` into `StageId` / `PIPELINE_STAGES` / `STAGE_CREDITS` (5c, total 55) and `LINEAR_STAGES`; chain remesh off refine and rig off remesh, `target_polycount: 30000` (spike-validated). Extend the fixture-transport tests to the 6-stage linear head. Blocks any live-generation UI: rig 400s on raw refine output (day-0 spike, ARCHITECTURE §4 + Trade-off log 2026-08-03).
**Acceptance criteria:**
- [ ] `createPipeline()` drives preview → refine → remesh → rig → animate ×5; happy-path, failure, 429, and resume tests cover the remesh stage
- [ ] `STAGE_CREDITS` totals 55 and stale "50 total" comments in `lib/meshy/` are gone
**Priority:** P0
**Phase:** P1
**Notes:** kind will be `backend` at triage. Surfaced by architecture-reviewer during TASK-05 kickoff.

### [x] triaged → Phase 1 #2.1, #2.2 US-01: Control a character in the playground scene
**As a** cold visitor, **I want** to walk/run/jump/emote a character around an atmospheric stage the moment the page loads, **so that** I feel the payoff before reading anything.
**Acceptance criteria:**
- [ ] WASD/arrows + jump + emote with camera follow; movement feel polished (blend between clips, no foot-sliding at walk/run speeds)
- [ ] Default character is controllable within 15s of cold page load
- [ ] Idle animation always playing — no frozen character, ever
**Priority:** P0
**Phase:** P1
**Notes:** PRD capability #1 and primary success metric. Scene is a playground, NOT a game (PRD §4). Split at triage: scene+idle (2.1) / controller+locomotion (2.2).

### [x] triaged → Phase 1 #3.1, #3.2 TASK-06: Pregen script + gallery assets
**Description:** `scripts/pregen/` runs the shared pipeline for a curated prompt list, downloads GLBs immediately, optimizes via gltf-transform (meshopt), writes `public/gallery/` + manifest with receipts. Publishable example code (PRD capability #4's sibling artifact).
**Acceptance criteria:**
- [ ] 8+ optimized characters committed; per-character GLB small enough that first playable frame stays <5s
- [ ] Manifest carries prompt, per-stage credits, total time, poly count
**Priority:** P0
**Phase:** P1
**Notes:** Split at triage: script+optimizer+manifest, offline-verified (3.1) / live 8+-character run (3.2, blocked on credit top-up — email drafted in `scripts/spike/README.md`).

### [x] triaged → Phase 1 #4 US-02: Browse the gallery and swap characters
**As a** visitor, **I want** to flip through pre-generated characters with their prompt, credit cost, and generation time, **so that** I see the range and the real price of what Meshy makes.
**Acceptance criteria:**
- [ ] 8+ characters from `public/gallery/manifest.json`; swap without reload; receipts (prompt, credits, time) visible per character
**Priority:** P1
**Phase:** P1

### [x] triaged → Phase 1 #5.1, #5.2 US-03: Generate a character live with my own key
**As a** dev with a Meshy key, **I want** to enter my key and a prompt and watch the stage rail run preview → texture → rig → animate with real progress, **so that** I believe the pipeline is real and worth integrating.
**Acceptance criteria:**
- [ ] Key entry (sessionStorage, clearable); biped prompt guidance; stage rail with live progress ring per stage and intermediate artifact previews as each stage lands
- [ ] Mid-generation page refresh resumes from stored task ids
- [ ] Total credit + elapsed-time readout matches reality
**Priority:** P0
**Phase:** P1
**Notes:** Split at triage: key/prompt/store/resume plumbing (5.1) / stage-rail UI (5.2).

### [x] triaged → Phase 1 #6 US-04: See the API call behind every stage
**As a** developer, **I want** each stage to show the actual request that produced it (endpoint, params, credits), **so that** the demo teaches me the integration while I wait.
**Acceptance criteria:**
- [ ] Per-stage panel with real path (v2 vs v1 visible), request body, credit cost; copyable
**Priority:** P1
**Phase:** P1
**Notes:** The DevRel differentiator — mono type per DESIGN.md.

### [x] triaged → Phase 1 #7 US-05: Play the character I just made, then download it
**As a** key-holder, **I want** my finished character to drop into the playground and be downloadable as a GLB, **so that** the loop closes: type it, play it, keep it.
**Acceptance criteria:**
- [ ] Pipeline completion swaps my character into the scene with all 5 clips bound
- [ ] Download button delivers the rigged animated GLB (fetched before Meshy's 3-day expiry window matters)
**Priority:** P0
**Phase:** P1

### [x] triaged → Phase 1 #8 US-06: Understand failures without leaving the page
**As a** key-holder, **I want** honest, specific feedback when a stage fails or Meshy is busy, **so that** a hiccup doesn't read as a broken product.
**Acceptance criteria:**
- [ ] Stage failure shows Meshy's `task_error` + "failed tasks auto-refund" note + retry affordance reusing completed upstream stages
- [ ] `RateLimitExceeded` (auto-backoff) vs `NoMoreConcurrentTasks` ("queue full — waiting") get distinct copy/behavior
- [ ] Rig-stage failure explains the biped/pose requirement in plain words
**Priority:** P1
**Phase:** P1

### [x] triaged → Phase 0 #1 TASK-02: Scaffold app shell with DESIGN.md tokens and deploy
**Description:** Next.js App Router + Tailwind v4 project; fonts (Bricolage Grotesque, IBM Plex Sans/Mono) and full `@theme` token set from DESIGN.md in `app/globals.css`; deployed to Vercel with a token-styled placeholder page.
**Acceptance criteria:**
- [ ] `npm run dev/lint/typecheck/test` all run; `scripts/check-tokens.sh` passes
- [ ] Vercel production URL serves the placeholder styled entirely from tokens
**Priority:** P0
**Phase:** P0

### [x] triaged → Phase 0 #2 TASK-03: Typed Meshy client + pipeline state machine (`lib/meshy/`)
**Description:** Isomorphic typed client (v2 text-to-3d, v1 rigging/animations/remesh/balance) with swappable transport; state machine for preview → refine → rig → animate×5 with ~4s polling, per-stage credit tracking, and `localStorage` resume. Fixture transports per `claude-code-resources/print-pipeline.fixtures.ts` pattern.
**Acceptance criteria:**
- [ ] Vitest covers: happy path, stage failure, `RateLimitExceeded`, `NoMoreConcurrentTasks`, resume-from-storage
- [ ] Same module importable from both the app and a Node script
**Priority:** P0
**Phase:** P0

### [x] triaged → Phase 0 #3 TASK-04: Meshy passthrough proxy (`app/api/meshy/[...path]`)
**Description:** Path-allowlisted passthrough; rewrites `x-meshy-key` → `Authorization: Bearer`; `no-store`; passes Meshy error bodies through untouched; `{ proxyError }` only for its own failures. No logging of keys.
**Acceptance criteria:**
- [ ] Test-mode key completes a task round-trip through the proxy
- [ ] Non-Meshy paths rejected; missing key → clean 401
**Priority:** P0
**Phase:** P0

### [x] triaged → Phase 0 #4 TASK-05: Day-0 spike — full pipeline + 5-clip merge validation
**Description:** Run one biped prompt through the real pipeline via the typed client; bind all 5 animation clips to the rigged skeleton in a minimal R3F harness. THE de-risk gate for the whole build (ARCHITECTURE §5 bets). Check credit balance against gallery plan while at it.
**Acceptance criteria:**
- [ ] 5 clips play on one skeleton in the harness, OR fallback ladder invoked and logged in ARCHITECTURE Trade-off log
- [ ] Remesh-stage and controller-library deferred decisions resolved and logged
- [ ] Credit budget confirmed or credit-request email sent
**Priority:** P0
**Phase:** P0

### [x] 2026-08-03 TASK-01: Define ROADMAP and phase files
**Description:** Add `docs/ROADMAP.md` and split backlog into phase files matching your delivery plan.
**Priority:** P0
**Resolution:** Bootstrap scaffolding — done via `prd-grill` → `architecture-md-builder` → `design-md-builder` → ROADMAP, 2026-08-03.
