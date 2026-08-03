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
| P1 | The demo — playable gallery + live generation | **Open** — 8 open (1 blocked on credits) / 2 done, triaged 2026-08-03 | `docs/backlog/phase-1-the-demo.md` |
| P2 | Polish + content + ship | Planned — items in Inbox | — |

## Inbox

_Untriaged items land here first._

_P0 items triaged 2026-08-03 → `docs/backlog/phase-0-foundation.md` #1–#4. P1 items triaged 2026-08-03 → `docs/backlog/phase-1-the-demo.md` #1–#8 (originals in `docs/backlog/inbox-archive.md`)._

### TASK-12: Collapse per-stage dispatch into a stage-descriptor table
**Description:** Adding remesh (TASK-11) required six coordinated edits across `lib/meshy/types.ts` + `pipeline.ts` (`StageId`, `PIPELINE_STAGES`, `STAGE_CREDITS`, plus the `createStageTask`/`pollStageTask` if-chains), and the if-chains fall through to the animate default with no compiler protection. Replace them with a single per-stage descriptor table (credits + create/poll lambdas) so adding a stage is a one-row change. Behavior-preserving refactor.
**Acceptance criteria:**
- [ ] `createStageTask`/`pollStageTask` if-chains replaced by table dispatch; existing 44 tests pass unchanged
- [ ] A stage exists in exactly one declaration site (credits, create, poll together)
**Priority:** P1
**Notes:** From the 2026-08-03 thermo-nuclear review of TASK-11. Schedule before or with US-06 (stage retry) — it's the next spec that touches this dispatch and will otherwise grow the if-chains again.

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
