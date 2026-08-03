---
name: kickoff-spec
description: >-
  Execute a triaged spec end-to-end: validate dependencies, flip the
  backlog row to in-progress, dispatch the right execution skill,
  enforce a tests-pass verification gate, then auto-flip the row to
  done and update the Phases summary counts. Also reopens
  previously-shipped/done rows for a fix cycle via `--reopen <ID>`
  (handles the `[x] → [~]` flip + Phases-count decrement atomically).
  Use when the user says "kick off [spec ID]", "start [spec]",
  "execute [spec]", "implement [spec]", "ship [spec]", "reopen [spec]",
  "run kickoff", or hands the agent a spec ID returned by
  `pick-next-task`.
---

# Kickoff Spec

Take a triaged spec (or a parallel-safe set of specs from
`pick-next-task`), drive it to a green verification gate, and update
the backlog state correctly. Mutates backlog files — be careful with
the order of operations.

This skill enforces the **non-negotiable rule**: a row never flips
to `[x]` without observable green output for typecheck, tests, and
lint. False-positive completions are worse than no automation.

## Inputs

The user supplies one of:

- **A single phase row ID** (e.g. `P0 #3`, `m42a`) — single-spec mode.
- **A comma-separated set of phase row IDs** — parallel mode.
- **`--reopen <row ID>`** (or `reopen <ID>`) — reopen mode. Row must
  currently be `[x]`. Used when `ship-spec` surfaces a 🔴 Critical
  finding on a shipped/done row and the user needs a fix cycle.
  Flips `[x]` → `[~]` and decrements `Done` / increments `Open` in
  the Phases summary as an atomic backlog mutation, then runs the
  normal kickoff flow. Single-row only (no parallel reopens).
- **No ID** — recommend running `pick-next-task` first; do not guess.

If `pick-next-task` recommended a parallel-safe set, the user can
hand that whole set in. Trust the picker's parallel-safety analysis
(don't recompute), but still re-validate dependencies per spec.

## Workflow

### 1. Validate every input spec

For each row ID, do all of:

1. Find the row in the appropriate `docs/backlog/phase-N-*.md`.
   If the row doesn't exist, refuse and tell the user. Do not
   create rows here — that is `backlog-triage`'s job.
2. Confirm the row's status is `[ ]`. If `[~]`, ask the user
   whether to resume. If `[!]`, refuse — blocked. If `[x]`:
   - In **reopen mode**, proceed — Step 3 will flip `[x]` → `[~]`
     and decrement the Phases `Done` count.
   - Otherwise refuse — already done. If the user wants a fix
     cycle, suggest `kickoff-spec --reopen <ID>`.
3. Open the linked spec under `docs/specs/`. Confirm it exists.
   If not, refuse.
4. Read the spec's `## DEPENDENCIES` section. For every listed
   dependency, look up that row's status in the same phase file.
   If any dep is not `[x]`, refuse the kickoff and report which
   deps are missing. Suggest running `pick-next-task` to find an
   unblocked starting point.
5. Read the spec's `kind:` field (frontmatter or near the top).
   - `kind: ui` → **halt now**, before any state change. Use the
     message in Step 4. This skill is for `backend|infra`; UI specs
     run via `/craft-ui`.
   - `kind: backend` or `kind: infra` → continue.
   - missing `kind:` → refuse. Spec is untriaged; tell the user to
     run `backlog-triage` first.

If any spec fails validation, abort the whole batch — no partial
kickoffs. The row stays `[ ]`; no commits are made.

### 2. Confirm the working tree is clean and green

Before flipping any status, verify the project is in a state where
the post-kickoff verification gate will isolate this work:

- `git status` shows a clean working tree (or only the user's
  unrelated WIP that they explicitly OK'd).
- `npx tsc --noEmit` exits 0.
- `npm run test` exits 0.
- `npm run lint` exits 0.

**Bootstrap baseline skip.** If `package.json` does not exist at
the repo root, there is no Node toolchain yet — **skip** the three
checks `npx tsc --noEmit`, `npm run test`, and `npm run lint`. Note
the skip in the kickoff report. For `git status`: if `.git` exists,
the working tree must still be clean (or only user-OK'd WIP). If
`.git` does not exist yet, **skip** `git status` — there is no
repository to query until the bootstrap commit creates one. This
pairs with the **Bootstrap-spec exception** under Step 3 (same
greenfield situation).

If any check that **applies** fails, **stop**. The current branch is
already broken — fixing those issues is upstream work, not this
kickoff. Surface exactly what failed and let the user decide.

### 3. Flip status to in-progress

For every spec in the batch, edit its phase row in
`docs/backlog/phase-N-*.md` from `[ ]` to `[~]` (or `Todo` to
`Doing` in tabular phase files). **Normal mode:** do not touch the
`## Phases` counts in `docs/backlog.md` — `[~]` is still "open".

**Reopen mode** — the source state is `[x]`, not `[ ]`, so the row
was previously counted as done. In addition to the row flip:
- Edit the phase row `[x]` → `[~]`.
- In `docs/backlog.md`, find the matching row in the `## Phases`
  summary table. **Decrement** `Done` by 1, **increment** `Open`
  by 1. Verify against the phase file.

Commit this status flip alone, before any implementation:

```
chore(backlog): mark <row IDs> in progress    # normal mode
chore(backlog): reopen <row IDs>              # reopen mode
```

This makes the kickoff observable in git history and gives the
verification gate a clean diff to validate against.

**Bootstrap-spec exception.** If the spec is a foundational
bootstrap that creates the repo or package manifest itself (no
prior `.git`, no `package.json`), there is nothing to commit to
yet. In that case:

- Skip the standalone `[~]` commit (it is impossible).
- Bundle the `[~]` flip into the first implementation commit that
  creates `.git` / `package.json` / the scaffold.
- Keep the `[x]` flip + Phases-counts bump as its own separate
  commit per Step 7a.
- Note the deviation in the per-spec report so the workflow
  divergence is visible in the session summary.

This exception applies only to genuinely greenfield specs. After
the first spec lands, the standard pattern (standalone `[~]`
commit before implementation) resumes.

### 4. Route by `kind:` — UI specs use a different lane

Before picking an execution shape, read each spec's `kind:` field
(checked at triage time; lives in the spec file's frontmatter or near
the top). Different `kind:` values dispatch to different execution
lanes and verification gates:

| `kind:` | Execution lane | Verification gate | What to do here |
|---------|----------------|-------------------|-----------------|
| `ui` | `/craft-ui` | Visual review (4 viewports + design-reviewer) | **Halt.** This skill does not run the visual gate — see below. |
| `backend` | continues in this skill | Tests pass (typecheck + tests + lint) | Proceed to Step 4a. |
| `infra` | continues in this skill | Tests pass + smoke check | Proceed to Step 4a. |
| _(missing)_ | n/a | n/a | Refuse. Tell the user the spec is untriaged; run `backlog-triage` to add `kind:` first. |

**If `kind: ui`, halt at Step 1 with this exact message and do not proceed:**

```
This is a UI spec (kind: ui). It needs the visual review gate, not
the tests-pass gate.

Run `/craft-ui <SPEC-ID>` instead. That command runs the taste-first
multi-step workflow and ends with a design-reviewer pass against
DESIGN.md — the lane this spec was triaged into.

No state has been changed. The row is still `[ ]` and there are no
new commits. Just re-invoke with /craft-ui.
```

Do not auto-invoke `/craft-ui` from here. The user pivots manually so
the dispatch boundary stays explicit and the row state stays
unambiguous.

**If a parallel-mode batch contains a mix of `kind: ui` and
`kind: backend|infra`**, refuse the whole batch and tell the user to
run them separately. Mixing lanes in one batch defeats the per-lane
gate and produces a kickoff report that can't be reasoned about.

### 4a. Pick the execution shape (`backend` / `infra` only)

| Situation | Execution skill | Notes |
|-----------|-----------------|-------|
| Single spec, fits one session | `executing-plans` | Default path |
| Single spec, contains independent sub-tasks | `subagent-driven-development` | Spec lists 3+ disjoint requirements |
| Set of 2-3 parallel-safe specs | `dispatching-parallel-agents` + `worktree-manager` | One worktree per spec |

`test-driven-development` is **always on** per the user's project
rules. Apply it inside whichever execution shape you picked: write
failing test(s) first, then implementation, then refactor.

### 5. Run the kickoff prompt

For each spec being executed, hand the executing agent this prompt
(adapt the path; for parallel mode, give one prompt per worktree):

```
Execute the spec at `docs/specs/<id>-<slug>.md`.

Workflow:
- Read the spec end-to-end before touching code. Re-read CLAUDE.md
  and AGENTS.md for the project-level non-negotiables.
- Re-read the spec's CONSTRAINTS section before any tool call that
  generates, stores, or composites assets.
- TDD: write failing test(s) first, then minimal implementation.
- One prompt = one commit. Stage exactly the work this spec
  describes; do not sweep neighboring files.

When implementation is complete:
- Run `npx tsc --noEmit`, `npm run test`, `npm run lint`. Paste
  the green output verbatim before claiming done.
- Do NOT edit any file under `docs/backlog/` or `docs/backlog.md`.
  The kickoff-spec orchestrator handles status flips and Phases
  counts after verifying your output.
```

The executor agent is explicitly forbidden from touching the
backlog. This skill (the orchestrator) owns all backlog mutations.

### 6. Verification gate (mandatory)

After the executing agent reports done, run all of these yourself
— do not trust the agent's claim:

1. `npx tsc --noEmit` — must exit 0.
2. `npm run test` — must exit 0.
3. `npm run lint` — must exit 0.
4. **Acceptance criteria check.** Open the spec's
   `## ACCEPTANCE CRITERIA` section. For each criterion, confirm
   it is observably met. Skip criteria that explicitly say "manual
   visual inspection" — note them as needing human review.

If any of 1-3 exits non-zero, the gate **fails**.

If any acceptance criterion is not observably met, the gate
**fails**.

### 7a. On gate green: flip done and bump counts

Atomic update:

1. In the phase file, change the row from `[~]` to `[x]` (or
   `Doing` to `Done`).
2. In `docs/backlog.md`, find the matching row in the `## Phases`
   summary table. Decrement `Open` by 1, increment `Done` by 1.
   Verify the new counts match reality by re-reading the phase
   file.
3. Commit:

```
chore(backlog): mark <row IDs> done
```

For parallel batches, update one row + one count pair at a time.
Each spec is atomic; one failing one shouldn't roll back successful
siblings.

### 7b. On gate red: leave in-progress, surface failure

1. Do **not** flip `[x]`.
2. Do **not** bump Phases counts.
3. Leave the row at `[~]`.
4. Report exactly which check failed and the relevant output. Do
   not summarize — paste it.
5. If `git status` shows uncommitted work from the executor, leave
   it for the user to inspect. Do not auto-revert.

The user decides whether to keep iterating in this session, hand
off to a follow-up session, or roll back the work.

### 8. Report

After the batch completes (gate green or red on each spec),
summarize:

- Which row IDs were kicked off
- Which finished green and were flipped to `[x]`
- Which are still `[~]` and why (paste the failing check name +
  exit code)
- The new Phases summary counts for the affected phase
- Any acceptance criteria that need manual visual inspection

## Rules

- **Never flip `[x]` without paste-able green output.** This is
  the rule the entire skill exists to enforce.
- **Never edit backlog files from inside an executor agent.** The
  orchestrator owns all backlog mutations.
- **Never bump `## Phases` counts without verifying against the
  phase file.** Counts that drift from reality break the picker
  and undermine the entire backlog as source of truth.
- **Refuse if dependencies aren't satisfied.** Don't try to "be
  helpful" by also kicking off the deps — that violates one
  prompt = one commit and tangles two specs into one history.
- **Refuse if the working tree is broken before kickoff.** A red
  baseline makes verification meaningless — **except** for the
  **Bootstrap baseline skip** under Step 2 (no `package.json` yet,
  and optionally no `.git` yet).
- **Cap parallel kickoffs at 3.** Past 3, context-switching cost
  outweighs throughput.
- **No retries on gate failure.** A failed gate is a signal to
  diagnose, not to re-run blindly. Tell the user; let them decide.
- **Standalone `[~]` commit before implementation is the default,
  but not for bootstrap specs** — see the **Bootstrap-spec
  exception** under Step 3. Greenfield repos cannot commit until
  the scaffold exists.
- **CLAUDE.md non-negotiables apply inside the executor.** The
  kickoff prompt explicitly tells the executor to re-read them.
  Don't try to enforce them from this skill — that's the
  executor's job.

## Common patterns

**Single foundational spec, cold project.** Validate, apply
**Bootstrap baseline skip** in Step 2 if no `package.json` (and
skip `git status` if no `.git`). Flip `[~]` (standalone commit if
`.git` exists; else bundle into scaffold commit per **Bootstrap-spec
exception** in Step 3), hand to `executing-plans`, run gate, flip
`[x]`, bump counts. Boring is good.

**Parallel-safe pair from `pick-next-task`.** Spawn two worktrees
via `worktree-manager`. Flip both rows to `[~]` in the main
checkout (commit once). Dispatch one executor per worktree via
`dispatching-parallel-agents`. As each finishes, run its gate; on
green, switch to main, flip its row to `[x]`, bump counts, commit,
push. Sibling worktree work continues independently.

**Spec with internal sub-tasks.** Switch to
`subagent-driven-development` for the inner execution but treat the
outer spec as a single unit for status — one `[~]` flip at start,
one `[x]` flip at the final green gate, one count bump.

**Gate fails on tests but passes on lint and typecheck.** Leave
`[~]`, paste the failing test output, stop. Do not flip `[x]` even
"to make progress visible" — the row is honest about state.

**User asks to skip the gate.** Refuse. The gate is the entire
reason this skill exists. If the user really wants to flip `[x]`
without verification, they can edit the phase file by hand — that
is a deliberate, visible action, not an automation.
