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
| P1 | The demo — playable gallery + live generation | **Open** — 2 open / 10 done, triaged 2026-08-03 | `docs/backlog/phase-1-the-demo.md` |
| P2 | Polish + content + ship | **Open** — 5 open / 0 done, triaged 2026-08-03 | `docs/backlog/phase-2-ship.md` |

## Inbox

_Untriaged items land here first._

_P0 items triaged 2026-08-03 → `docs/backlog/phase-0-foundation.md` #1–#4. P1 items triaged 2026-08-03 → `docs/backlog/phase-1-the-demo.md` #1–#8. P2 items triaged 2026-08-03 → `docs/backlog/phase-2-ship.md` #1–#5 (originals in `docs/backlog/inbox-archive.md`)._

_(empty)_
