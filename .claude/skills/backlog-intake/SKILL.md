---
name: backlog-intake
description: >-
  Convert rough user input into a formatted user story, bug report, or task
  and append it to the project backlog inbox. Use when the user describes
  something to build, reports a problem, or mentions work that needs doing.
  Triggers on "add to backlog", "new story", "new bug", "new task", "file a
  bug", "I need", "we should", "this is broken", "it should", or any
  description of desired behavior, observed defects, or work items.
---

# Backlog Intake

Take what the user says and turn it into a structured backlog item, then
append it to the project's backlog inbox.

## Workflow

### 1. Classify the item

Read the user's input and determine the type:

| Type | Signal | Use when... |
|------|--------|-------------|
| **User Story** | describes desired capability from a user's perspective | new feature or behavior someone will experience |
| **Bug** | describes something broken — gap between actual and expected | existing behavior is wrong |
| **Task** | describes internal work that isn't user-facing | migrations, config, cleanup, docs, infra |

If ambiguous, ask the user with the `AskUserQuestion` tool:

```
"What type of backlog item is this?"
Options: User Story, Bug, Task
```

### 2. Extract and structure

**User Story** — identify the role, capability, and benefit:
```
### US-[next number]: [concise title]
**As a** [role], **I want** [capability], **so that** [benefit].
**Acceptance criteria:**
- [ ] [testable outcome 1]
- [ ] [testable outcome 2]
**Priority:** [P0 | P1 | P2]
**Notes:** [any context from the user's input]
```

**Bug** — identify observed, expected, and repro steps:
```
### BUG-[next number]: [concise title]
**Observed:** [what actually happens]
**Expected:** [what should happen]
**Repro steps:**
1. [step]
2. [step]
**Error:** [exact error message if provided, otherwise omit this line]
**Priority:** [P0 | P1 | P2]
```

**Task** — identify what needs to happen and how to verify:
```
### TASK-[next number]: [concise title]
**Description:** [what needs to happen]
**Acceptance criteria:**
- [ ] [verifiable outcome]
**Priority:** [P0 | P1 | P2]
```

### 3. Fill gaps with reasonable defaults

- If the user didn't specify priority, default to **P1**.
- If the user didn't specify a role for a story, infer from context
  (usually "practitioner" or "franchise operator" for this project).
- If a bug report is missing repro steps or error messages, ask the user
  for them — don't invent them.
- Write acceptance criteria as concrete, testable statements.

### 4. Number the item

Grep **both** `docs/backlog.md` (current inbox) and
`docs/backlog/inbox-archive.md` (previously triaged items) for the prefix
matching the item type (`US-`, `BUG-`, or `TASK-`). Take the highest
number found and increment by 1. If no items of that type exist yet,
start at 01.

Do **not** grep the phase files for these prefixes — phase items use
their own numbering scheme (`m##`, `w##`, `i##`, `bug-##`) assigned
during triage.

### 5. Append to backlog

Add the formatted item to the **Inbox** section of `docs/backlog.md`,
just above the `*No items in inbox.*` line (or at the end of existing
inbox items if that line has been removed). Do **not** write to any file
under `docs/backlog/` — those are managed by triage, not intake.

### 6. Confirm

Tell the user what was added, showing the formatted item. If anything
looks wrong they can correct it and you update the backlog.

## Rules

- One item per intake. If the user describes multiple things, process
  each separately.
- Never triage into a phase file automatically — that is the
  `backlog-triage` skill's job. Just put it in the inbox.
- Never create a spec file during intake — that happens during triage.
- Keep titles under 10 words, in imperative voice ("Add X", "Fix Y",
  "Remove Z") rather than descriptive ("X is broken", "Y needs updating").
- Keep acceptance criteria to 2-5 items. More than 5 suggests the item
  should be split.
- Do not add the item if it's a duplicate of something already in the
  backlog. Check: the Inbox in `docs/backlog.md`, every phase file under
  `docs/backlog/phase-*.md`, and `docs/backlog/inbox-archive.md`. Tell
  the user it already exists and point to where.
