---
name: pick-next-task
description: >-
  Recommend the next backlog task(s) to work on by reading the phased
  backlog, parsing spec dependencies, and identifying parallel-safe
  sets. Read-only — never mutates backlog files. Use when the user
  says "what should I work on", "what's next", "pick next task",
  "what can I do in parallel", "what's unblocked", or otherwise asks
  the agent to recommend the next chunk of backlog work.
---

# Pick Next Task

Read the project backlog, find the next task to work on, and identify
which other tasks (if any) can run in parallel with it. Strictly
read-only — this skill never edits any backlog file. Pair with
`kickoff-spec` (the executor that actually starts work and flips
status).

Scope is **the lowest open phase only**. Do not surface candidates
from other phases — `ROADMAP.md` is explicit that phases are gates,
not aspirations. If the user wants to override that, they will
explicitly say so.

## Workflow

### 1. Find the lowest open phase

Read `docs/backlog.md`. Look at the `## Phases` summary table. The
target phase is the row with the **lowest phase number where
`Open > 0`**. If every phase shows `Open = 0`, stop and tell the
user there is nothing to do — likely all triaged work is done and
either fresh triage or fresh inbox items are needed.

If the only open work is **inbox items** (no rows in any phase
file), do not recommend any of them. Tell the user the inbox is
untriaged and recommend running `backlog-triage` first.

### 2. List candidates from that phase

Read the phase file (`docs/backlog/phase-N-*.md`). Collect every
row whose status is `[~]` or `[ ]` (or `Doing` / `Todo` in tabular
phase files). Skip `[!]` blocked rows but report them at the end so
the user knows they exist.

For each candidate, capture:
- The phase row ID (e.g. `P0 #3`, `m42a`)
- The original backlog title (e.g. `TASK-01: Bootstrap Next.js 15`)
- The current status marker
- The spec link (relative path under `docs/specs/`)
- The priority from the spec or the row notes

If a candidate row has no spec link, flag it as untriaged and skip it.

### 3. Parse each spec for dependencies and files touched

For every candidate, read its spec file. Extract two sections:

**`## DEPENDENCIES`** — list of phase row IDs that must be `[x]`
before this spec can start. Format is bullet lines like:

```
- P0 #3 — needs the Inngest client wired
- P0 #5 — needs Stripe webhook persisting projects
```

If the section is missing or says `None`, treat as no dependencies.

**`## FILES TOUCHED`** — list of files or directories the spec
will create or modify. Format is bullet lines of paths.

If the section is missing, treat the candidate's parallel-safety as
**unknown** — it cannot be paired with anything for parallel work.

### 4. Resolve dependency status

For each candidate's listed dependencies:
- Look up that phase row ID in the same phase file.
- If the row's status is `[x]` (or `Done`), the dep is **satisfied**.
- Otherwise the dep is **unsatisfied** — record it.

A candidate is **ready** if all dependencies are satisfied.
A candidate is **blocked** if any dependency is unsatisfied.

Cross-phase dependencies should not exist (this skill's scope is one
phase) — if you find one, surface it as a warning and treat it as
unsatisfied unless the referenced phase shows `Open = 0` in the
Phases table.

### 5. Rank ready candidates

Apply in order:

1. **In-progress first.** Any `[~]` row outranks any `[ ]` row.
   Finishing in-flight work beats starting new work.
2. **Priority.** P0 > P1 > P2. Read the priority from the spec or
   the original inbox item. Default to P1 if unspecified.
3. **Upstream-dependency count.** A spec that other ready specs
   depend on outranks one that nothing depends on. Counts only
   downstream candidates within the same phase.
4. **Smaller / better-specified.** If two are otherwise equal,
   prefer the spec with the more concrete acceptance criteria.

Pick the top-ranked candidate as **next-up alone**.

### 6. Identify parallel-safe sets

After picking the next-up candidate, look for other ready
candidates that can run in parallel with it. Two candidates A and
B are parallel-safe if **all** of these hold:

- Neither lists the other in `## DEPENDENCIES`.
- Both have a `## FILES TOUCHED` section (no unknowns).
- Their `## FILES TOUCHED` lists are **disjoint** — no exact
  string match, no parent-directory overlap. Treat
  `lib/storage/client.ts` and `lib/storage/` as overlapping.

For a set of more than two, every pair must satisfy the above.
Greedy is fine — try the highest-ranked unpaired ready candidate
next, add it if parallel-safe with everything already in the set,
otherwise skip it.

Cap parallel sets at 3 candidates by default. Past 3, the cost of
context-switching across worktrees outweighs the throughput.

### 7. Emit the recommendation

Output in this structure (markdown, concise, scannable):

```markdown
## Picked from Phase N (X open / Y done / Z blocked)

### Do next, alone
**[row ID] — [original backlog title]**
- Spec: `docs/specs/[spec file]`
- Status: `[ ]` or `[~]`
- Priority: P0/P1/P2
- Blocks: [downstream row IDs in this phase, or "nothing yet"]
- Why this one: [one line tying back to the ranking rule]

### Parallel-safe with the above (optional)
**[row ID] — [title]**
- Spec: `docs/specs/[spec file]`
- Disjoint from next-up: [list the non-overlapping file scopes]

(Repeat for each parallel-safe candidate, max 3 total in the set
including the next-up.)

### In progress (these outrank new work)
**[row ID] — [title]** — status: `[~]`

### Blocked
**[row ID] — [title]** — blocked by: [missing dep IDs]

### Recommendation
[One sentence: kick off X alone, or kick off X + Y in parallel
worktrees, or finish in-progress Z first.]
```

If there are no in-progress, no parallel-safe matches, or no blocked
items, omit those sections entirely. Do not pad with `None`
placeholders.

### 8. Stop

Do not flip any status. Do not edit any backlog file. Do not start
implementing. Hand off to the user — they decide whether to run
`kickoff-spec` against the recommendation or do something else.

## Rules

- **Read-only.** Never write to `docs/backlog.md`, any
  `docs/backlog/phase-*.md`, any spec file, or any source file.
- **One phase only.** Never recommend cross-phase work. Surface a
  warning if cross-phase dependencies appear in a spec.
- **Inbox items are not candidates.** If the only open work is in
  the `Inbox` of `docs/backlog.md`, recommend `backlog-triage`.
- **Missing `## FILES TOUCHED` blocks parallel pairing.** Don't
  guess. Recommend it as a single next-up only.
- **Don't recommend `[!]` blocked rows.** Surface them in the
  blocked section but never as next-up.
- **Don't pick `[x]` rows.** They're done. If you find a `[x]` with
  unsatisfied downstream, surface it as a data-quality warning, not
  a candidate.
- **Re-rank fresh every invocation.** This skill has no memory; the
  state lives in the backlog files. If two invocations recommend
  different next-ups, the backlog changed in between.

## Common patterns

**Phase 0 cold start.** Every Phase 0 row is `[ ]`. The first
foundation task (usually a project bootstrap or schema migration)
will outrank everything else because everything in Phase 0 depends
on it. Recommend it alone.

**Mid-phase steady state.** Several `[ ]` rows, no in-progress, no
blockage. Pick by priority, then by downstream dependency count.
Look for parallel-safe pairs in the same priority band.

**Stalled in-progress.** A `[~]` row sits unfinished. Always
recommend finishing it first. Do not start new work parallel to a
stalled in-flight task — diagnose why it stalled instead.

**Everything blocked.** All ready candidates depend on one
unfinished `[ ]` row. Recommend that bottleneck row, even if its
priority is lower than the blocked candidates'.
