# Phase 0 — Foundation: prove the pipeline, stand the stage

> Theme: the risky bets resolve before any product UI exists. Acceptance criteria for the phase as a whole: `docs/ROADMAP.md` §P0. P1 triage is blocked on #4 (the spike).

| # | Status | Kind | Item | Spec |
|---|--------|------|------|------|
| 1 | `[x]` | infra | TASK-02: Scaffold app shell with DESIGN.md tokens and deploy | [task-02-scaffold-app-shell.md](../specs/task-02-scaffold-app-shell.md) |
| 2 | `[x]` | backend | TASK-03: Typed Meshy client + pipeline state machine | [task-03-meshy-client-state-machine.md](../specs/task-03-meshy-client-state-machine.md) |
| 3 | `[ ]` | backend | TASK-04: Meshy passthrough proxy | [task-04-meshy-proxy.md](../specs/task-04-meshy-proxy.md) |
| 4 | `[ ]` | backend | TASK-05: Day-0 spike — full pipeline + 5-clip merge validation | [task-05-day0-spike.md](../specs/task-05-day0-spike.md) |

**Dependency notes:** #2, #3 depend on #1. #4 depends on #1 + #2 (not #3 — the spike uses the direct transport). #2 and #3 are parallel-safe after #1 (disjoint FILES TOUCHED). #4 needs the real `MESHY_API_KEY` and spends ~50–150 credits.
