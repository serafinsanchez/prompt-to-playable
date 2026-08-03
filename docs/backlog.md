# Backlog

Single source of truth for **what we might build**, **what is scheduled**, and **what is done**. Phase goals and acceptance criteria can live in `docs/ROADMAP.md` when you add it; this file tracks **work items** and **status**.

## How to use

1. **New ideas, bugs, chores** → add to **Inbox** below (or ask an agent to use backlog intake). Use prefixes `US-`, `BUG-`, `TASK-` and increment numbers per type.
2. **Triage** → move inbox items into the right **phase file** under `docs/backlog/`, or archive small fixes in `docs/backlog/inbox-archive.md`. During triage, tag every spec with a `kind:` so kickoff dispatches the right execution lane.
3. **Status** → update checkboxes / tables when work moves.

## Spec `kind`

Every triaged spec gets one. Drives which execution skill runs and which verification gate applies.

| `kind` | Use for | Execution | Verification gate |
|--------|---------|-----------|-------------------|
| `ui` | Visible interface work — pages, components, design system | `/craft-ui` | Visual review loop (4 viewports, rubric pass) |
| `backend` | API routes, data, business logic, server code | `kickoff-spec` | Tests pass |
| `infra` | Build, deploy, tooling, CI, dependencies | `kickoff-spec` | Tests pass + smoke check |

## Status key

| Marker | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done |
| `[!]` | Blocked |

## Phases

| Phase | Theme | Status | Work items |
|-------|-------|--------|------------|
| P0 | Foundation — prove the pipeline, stand the stage | **Complete** — 0 open / 4 done | `docs/backlog/phase-0-foundation.md` |
| P1 | The demo — playable gallery + live generation | Planned — items in Inbox, **ready for re-triage** (P0 #4 landed 2026-08-03) | — |
| P2 | Polish + content + ship | Planned — items in Inbox | — |

## Inbox

_Untriaged items land here first._

_P0 items triaged 2026-08-03 → `docs/backlog/phase-0-foundation.md` #1–#4 (originals in `docs/backlog/inbox-archive.md`)._

### Phase 1 — The demo `[!]` (waiting for P0 #4 — the spike's outcome feeds these specs; re-triage when it lands)

### US-01: Control a character in the playground scene
**As a** cold visitor, **I want** to walk/run/jump/emote a character around an atmospheric stage the moment the page loads, **so that** I feel the payoff before reading anything.
**Acceptance criteria:**
- [ ] WASD/arrows + jump + emote with camera follow; movement feel polished (blend between clips, no foot-sliding at walk/run speeds)
- [ ] Default character is controllable within 15s of cold page load
- [ ] Idle animation always playing — no frozen character, ever
**Priority:** P0
**Phase:** P1
**Notes:** PRD capability #1 and primary success metric. Scene is a playground, NOT a game (PRD §4).

### US-02: Browse the gallery and swap characters
**As a** visitor, **I want** to flip through pre-generated characters with their prompt, credit cost, and generation time, **so that** I see the range and the real price of what Meshy makes.
**Acceptance criteria:**
- [ ] 8+ characters from `public/gallery/manifest.json`; swap without reload; receipts (prompt, credits, time) visible per character
**Priority:** P1
**Phase:** P1

### TASK-11: Add the remesh stage to the pipeline state machine
**Description:** Insert `remesh` into `StageId` / `PIPELINE_STAGES` / `STAGE_CREDITS` (5c, total 55) and `LINEAR_STAGES`; chain remesh off refine and rig off remesh, `target_polycount: 30000` (spike-validated). Extend the fixture-transport tests to the 6-stage linear head. Blocks any live-generation UI: rig 400s on raw refine output (day-0 spike, ARCHITECTURE §4 + Trade-off log 2026-08-03).
**Acceptance criteria:**
- [ ] `createPipeline()` drives preview → refine → remesh → rig → animate ×5; happy-path, failure, 429, and resume tests cover the remesh stage
- [ ] `STAGE_CREDITS` totals 55 and stale "50 total" comments in `lib/meshy/` are gone
**Priority:** P0
**Phase:** P1
**Notes:** kind will be `backend` at triage. Surfaced by architecture-reviewer during TASK-05 kickoff.

### TASK-06: Pregen script + gallery assets
**Description:** `scripts/pregen/` runs the shared pipeline for a curated prompt list, downloads GLBs immediately, optimizes via gltf-transform (meshopt), writes `public/gallery/` + manifest with receipts. Publishable example code (PRD capability #4's sibling artifact).
**Acceptance criteria:**
- [ ] 8+ optimized characters committed; per-character GLB small enough that first playable frame stays <5s
- [ ] Manifest carries prompt, per-stage credits, total time, poly count
**Priority:** P0
**Phase:** P1

### US-03: Generate a character live with my own key
**As a** dev with a Meshy key, **I want** to enter my key and a prompt and watch the stage rail run preview → texture → rig → animate with real progress, **so that** I believe the pipeline is real and worth integrating.
**Acceptance criteria:**
- [ ] Key entry (sessionStorage, clearable); biped prompt guidance; stage rail with live progress ring per stage and intermediate artifact previews as each stage lands
- [ ] Mid-generation page refresh resumes from stored task ids
- [ ] Total credit + elapsed-time readout matches reality
**Priority:** P0
**Phase:** P1

### US-04: See the API call behind every stage
**As a** developer, **I want** each stage to show the actual request that produced it (endpoint, params, credits), **so that** the demo teaches me the integration while I wait.
**Acceptance criteria:**
- [ ] Per-stage panel with real path (v2 vs v1 visible), request body, credit cost; copyable
**Priority:** P1
**Phase:** P1
**Notes:** The DevRel differentiator — mono type per DESIGN.md.

### US-05: Play the character I just made, then download it
**As a** key-holder, **I want** my finished character to drop into the playground and be downloadable as a GLB, **so that** the loop closes: type it, play it, keep it.
**Acceptance criteria:**
- [ ] Pipeline completion swaps my character into the scene with all 5 clips bound
- [ ] Download button delivers the rigged animated GLB (fetched before Meshy's 3-day expiry window matters)
**Priority:** P0
**Phase:** P1

### US-06: Understand failures without leaving the page
**As a** key-holder, **I want** honest, specific feedback when a stage fails or Meshy is busy, **so that** a hiccup doesn't read as a broken product.
**Acceptance criteria:**
- [ ] Stage failure shows Meshy's `task_error` + "failed tasks auto-refund" note + retry affordance reusing completed upstream stages
- [ ] `RateLimitExceeded` (auto-backoff) vs `NoMoreConcurrentTasks` ("queue full — waiting") get distinct copy/behavior
- [ ] Rig-stage failure explains the biped/pose requirement in plain words
**Priority:** P1
**Phase:** P1

### Phase 2 — Polish + content + ship `[!]` (waiting for P1)

### US-07: Feel the signature stage-completion moment
**As a** visitor watching a generation, **I want** each stage completion to land as a designed beat (ring fills, tick, artifact clips in, rail advances), **so that** the minutes-long wait feels alive.
**Acceptance criteria:**
- [ ] Matches DESIGN.md motion spec incl. reduced-motion behavior; design-reviewer PASS
**Priority:** P1
**Phase:** P2

### TASK-07: Performance + a11y budget pass
**Description:** Verify <5s first playable frame on throttled broadband; bundle/asset audit; kit a11y spec + keyboard path + reduced-motion pass.
**Acceptance criteria:**
- [ ] Measured first-frame <5s (throttled); `tests/a11y.spec.ts` green
**Priority:** P1
**Phase:** P2

### TASK-08: README as landing page + repo publish
**Description:** Hero shot/GIF, live Vercel link up top, 60-second quickstart, how-the-pipeline-works with real API calls, credit-cost table, MIT license. Decide final public repo name (lean: `prompt-to-playable`) and publish.
**Acceptance criteria:**
- [ ] A dev who only reads the README can run it locally and knows what the API costs
- [ ] Repo public, MIT, final name
**Priority:** P0
**Phase:** P2

### TASK-09: Demo video (2–3 min), ready-to-publish
**Description:** Record and edit: cold-open on gameplay (<10s in), live generation with the rail, API panel beat, download beat, closer. Script tight; captions.
**Acceptance criteria:**
- [ ] Watchable without audio; gameplay appears in the first 10 seconds; publish-ready export
**Priority:** P0
**Phase:** P2

### TASK-10: Distribution plan + submission bundle
**Description:** 1–2 paragraph distribution plan (communities, positioning, existing presence). Run the cold-visitor test with 2–3 people (15s metric). Check every line of the assignment PDF; send.
**Acceptance criteria:**
- [ ] 15s metric verified with real people; all three deliverables (project, content, plan) bundled and submitted
**Priority:** P0
**Phase:** P2
