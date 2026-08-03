# Prompt: seed the backlog Inbox from PRD + ROADMAP

## Preflight (do this first, fail loud if anything is off)

1. Verify `docs/PRD.md` and `docs/ROADMAP.md` both exist and are non-empty.
2. Verify neither file still contains `{{PLACEHOLDER}}` markers or boilerplate template text.
3. Verify `docs/backlog.md` exists and has an `## Inbox` section.
4. If any check fails, STOP and tell the user what's missing. Do not proceed against unfilled docs.

---

Read `docs/PRD.md` and `docs/ROADMAP.md`. Append already-classified items to the **Inbox** section of `docs/backlog.md`. Do not modify any other section.

## What to generate

For each phase in the ROADMAP, produce items that cover its acceptance criteria.

- **`US-###`** — one per user-visible capability in the PRD/ROADMAP.
- **`TASK-###`** — one per setup/infra item implied by the stack (deps install, env vars, deploy config, CI, tokens, etc.).
- **No `BUG-###`** at this stage. Bugs only exist once something has shipped.

## Numbering

Continue from the highest existing number in `docs/backlog.md`. If empty, start at `US-01` and `TASK-01`.

## Format (must match `/backlog-intake` output so triage works downstream)

### User Story

```markdown
### US-{n}: {concise title}
**As a** {role}, **I want** {capability}, **so that** {benefit}.
**Acceptance criteria:**
- [ ] {testable outcome}
- [ ] {testable outcome}
**Priority:** {P0 | P1 | P2}
**Phase:** {P0/P1/P2/P3}
**Notes:** {any context from the PRD}
```

### Task

```markdown
### TASK-{n}: {concise title}
**Description:** {what needs to happen}
**Acceptance criteria:**
- [ ] {verifiable outcome}
**Priority:** {P0 | P1 | P2}
**Phase:** {P0/P1/P2/P3}
```

## Sizing heuristics

- If an item would take **>1 day**, split it.
- If an item would take **<30 minutes**, fold it into a parent item.
- Aim for **5–15 items per phase**. If you're producing 25+, you're over-decomposing.
- One concept per item. If the title needs "and", it's two items.

## Priorities

- Default to **P1** unless the PRD or ROADMAP explicitly marks something P0 (blocking) or P2 (polish/optional).
- Items in the earliest phase (usually P0) tend to be P0 priority. Items in stretch phases tend to be P2.

## Grouping

Group items in the Inbox under phase headers so triage is easy:

```markdown
## Inbox

### Phase 0 — Setup
[US-01, TASK-01, ...]

### Phase 1 — Core
[US-02, US-03, ...]
```

## What NOT to invent

- Do not add features that aren't in the PRD or implied by the ROADMAP.
- Do not add `kind:` tags — that's `/backlog-triage`'s job.
- Do not move anything out of the Inbox into phase files — also triage's job.
- If the PRD is ambiguous, list questions at the bottom of the Inbox under `### Open questions` rather than guessing.

## Final step

After appending, print a short summary: total items added, broken down by phase and by type (US vs TASK).
