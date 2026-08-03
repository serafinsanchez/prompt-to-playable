---
name: ship-spec
description: >-
  Integrate a green, kicked-off spec into main: run code review,
  pause for human merge confirmation, then execute the merge
  mechanics (rebase + push for worktree mode, push for direct-on-main
  mode) and clean up worktrees. Use when the user says "ship [spec]",
  "ship P0 #3", "merge [spec]", "integrate [spec]", "review and merge",
  "send it", "wrap up [spec]", or hands the agent row IDs that
  `kickoff-spec` recently flipped to `[x]`.
---

# Ship Spec

Take a spec that `kickoff-spec` has gated green, run a code review,
pause for explicit human confirmation, then execute the merge
mechanics and worktree cleanup. Mutates git state — be careful with
the order of operations.

This skill is the **integration boundary**. The non-negotiable rule:
no merge without explicit human confirmation, even on a clean review.
The cost of a bad merge to main on a solo direct-to-main project is
high — the gate exists to catch the cases where review came back
clean but the change still shouldn't ship right now.

Designed for the solo + skip-PRs + direct-to-main workflow. If you
adopt PRs later, this skill needs reworking.

## Inputs

The user supplies one or more **phase row IDs** whose status is
already `[x]` and whose work is unintegrated. Typically these are
the same IDs they just kicked off — `kickoff-spec` flipped the
status, but the implementation commits still need to land on main.

Process row IDs **sequentially**, never in parallel. Review focus
and merge atomicity both benefit. If the user passes 3 IDs, ship
them one at a time.

If no IDs are supplied, refuse — do not auto-detect unintegrated
work. Auto-detection is wrong half the time and the wrong-half is
where you ship something the user wasn't ready to ship.

## Workflow

### 1. Validate every input row

For each row ID, do all of:

1. Find the row in the appropriate `docs/backlog/phase-N-*.md`. If
   it doesn't exist or its status is not `[x]`, refuse and tell
   the user. `ship-spec` only operates on completed work.
2. Open the linked spec under `docs/specs/`. Confirm it exists.
3. Determine **where the work lives**:
   - Run `git worktree list --porcelain`. For each worktree,
     check recent commits on its branch for the row ID or spec
     filename. If found → **worktree mode** for this spec.
   - Otherwise → **single-spec mode** (work is on the current
     branch in the main checkout, typically `main` itself).

If validation fails for any row, abort the whole batch.

### 2. Per-row processing (sequential)

For each row, in the order the user supplied:

#### 2a. Locate the diff

- **Single-spec mode:** the diff is `git log origin/main..HEAD` on
  the main checkout (commits not yet pushed).
- **Worktree mode:** the diff is `git log main..<feature-branch>`
  in the worktree's checkout.

If there are no commits to integrate, refuse — the spec was
flipped `[x]` but no implementation work exists. Surface this as a
data-quality issue.

#### 2b. Run code review

Invoke `pre-commit-review` with explicit caller context — this points
it at the committed work (not the working tree, which is clean after
kickoff) and skips its spec-discovery search:

- `spec_id`: the row ID
- `spec_path`: the path to the spec file under `docs/specs/`
- `diff_range`:
  - **Single-spec mode:** `origin/main..HEAD`
  - **Worktree mode:** `main..<feature-branch>`

PCR will review `git diff <diff_range>` instead of `git diff HEAD`.
Without `diff_range`, PCR sees a clean working tree and finds nothing
to review — this handoff is load-bearing, not optional.

The review should cover:
- Correctness against the spec's `## ACCEPTANCE CRITERIA`
- The `## CONSTRAINTS` re-stated in the spec
- The CLAUDE.md non-negotiables (especially for changes touching
  the agent loop, generation, storage, or auth)
- General code quality, naming, error handling

PCR returns findings classified as **Blockers / Should-fix / Nits**.
Map them to ship-spec's gate vocab:

| PCR class | Ship-spec class | Action |
|-----------|-----------------|--------|
| Blocker | 🔴 Critical | Hard-stop merge (see 2c) |
| Should-fix | 🟡 Suggestion | Surface to user, proceed |
| Nit | 🟢 Nice to have | Note, proceed |

#### 2c. Apply the review gate

| Finding severity | Action |
|------------------|--------|
| Any 🔴 Critical | **Stop.** Leave on branch. Report findings. User addresses via `kickoff-spec --reopen <row ID>` — that handles the `[x] → [~]` flip and Phases-count decrement atomically. After fix + re-gate, the user re-runs `ship-spec`. Do not flip the row status backwards from this skill. |
| 🟡 / 🟢 only, or no findings | Present findings, proceed to 2d. |

Critical findings hard-stop the merge for **this row only**. If
the batch has other rows, continue with them after the user
acknowledges.

#### 2d. Pause for human confirmation

Present the human with:
- The row ID and spec title
- A one-line summary of the diff (files changed, lines added/removed)
- Any 🟡 / 🟢 findings worth eyeballing
- A clear merge prompt:

```
Ready to merge <row ID> (<spec title>) into main?
Mode: <single-spec | worktree>
Diff: <N files changed, +X/-Y>
Reply "yes" to merge and push, "no" to leave on branch.
```

**Wait for explicit "yes".** Anything else (including silence,
"looks good", "proceed", "ship it") — re-prompt with the exact
question. The human-confirmation gate is the entire reason this
skill exists; don't infer consent from ambiguous responses.

If the user says no, leave the work where it is and move to the
next row in the batch.

#### 2e. Execute the merge mechanics

On confirmation:

**Single-spec mode:**
1. Verify still on the expected branch (`git branch --show-current`).
2. `git push` — that's it. The work is already on main, just unpushed.

**Worktree mode:**
1. Switch to the main checkout (`cd` to the repo root, not the
   worktree).
2. Ensure main is up to date: `git pull --ff-only origin main`. If
   this fails (main moved and you have local commits), stop —
   needs manual resolution.
3. Rebase the feature branch onto main:
   `git rebase main <feature-branch>` from inside the worktree, or
   equivalent. Backlog files won't conflict (executor never
   touched them per `kickoff-spec`'s rules), but other files
   might if main moved during the worktree's lifetime. On
   conflict, stop and surface — do not auto-resolve.
4. Fast-forward merge the rebased branch into main:
   `git merge --ff-only <feature-branch>` from main.
5. Push: `git push origin main`.
6. Delete the feature branch: `git branch -d <feature-branch>`.
7. Clean up the worktree via `worktree-manager` (or
   `git worktree remove <path>` if `worktree-manager` is
   unavailable).

#### 2f. Post-merge verification

Run on main, after the push:
- `npx tsc --noEmit` — must exit 0
- `npm run test` — must exit 0
- `npm run lint` — must exit 0

If any check fails, the rebase or merge introduced a regression
that the per-spec gate couldn't catch. **Stop.** Surface the
failure. Do **not** auto-revert — let the user inspect and decide.
Don't move to the next row in the batch until this is resolved.

For single-spec mode where the commits were already on main and
gated green by `kickoff-spec`, this verification is technically
redundant — but run it anyway as a cheap sanity check (typecheck +
test + lint takes seconds and catches the rare case where someone
else pushed to main between the gate and the push).

#### 2g. Per-row report

Emit a short summary for the row:
- Row ID + title
- Mode (single-spec / worktree)
- Review summary (counts by severity)
- Merge outcome (merged + pushed / left on branch / blocked)
- Worktree status (cleaned up / N/A)

### 3. Batch report

After all rows processed, summarize:
- Which shipped successfully
- Which had Critical findings (still on branch, awaiting fix cycle)
- Which the user declined to merge (still on branch)
- Which failed post-merge verification (main may be in a degraded
  state — surface loudly)

## Rules

- **No merge without explicit "yes".** Not on a clean review, not
  on a thumbs-up emoji, not on "looks good". The human types
  "yes". This is the rule the skill exists to enforce.
- **No auto-detection of unintegrated work.** The user always
  supplies row IDs. Magic detection picks the wrong thing too
  often.
- **Sequential, never parallel.** One row at a time. Reviews need
  focus; merges need atomicity.
- **Critical findings hard-stop merge for that row.** Report,
  move on to the next row in the batch. Do not flip the row's
  status backwards — that's `kickoff-spec`'s job on the next
  cycle.
- **Never auto-resolve git conflicts.** Rebase conflict → stop and
  surface. Merge conflict → stop and surface. Conflict resolution
  is a human decision.
- **Never auto-revert on post-merge gate failure.** Main is now
  red and the user needs to see exactly what failed. Reverting
  hides the signal.
- **Worktree cleanup happens after merge, not before.** Removing
  a worktree before its branch is merged loses work.
- **Backlog files were never touched by the executor**, so they
  won't conflict during merge. If they do, something violated
  `kickoff-spec`'s rules — surface it as a serious anomaly.
- **No PR creation.** This skill is for the solo direct-to-main
  workflow. If the user wants PRs, they should use
  `ce-commit-push-pr` instead and skip `ship-spec`.

## Common patterns

**Single solo spec on main.** User just kicked off `P0 #3` working
directly on main. Review finds no Critical issues, user confirms,
`git push`, post-push gate green, done. Two minutes of skill time.

**One worktree, clean review, clean rebase.** Row was kicked off
in a worktree because it was risky. Review finds one 🟡
suggestion. User confirms merge anyway. Rebase onto main is
clean (no conflicts), fast-forward merge, push, delete branch,
worktree-manager cleanup. Done.

**Critical finding stops the merge.** Review surfaces a 🔴: the
spec said the locked logo must not be redrawn, but the executor's
diff includes a path that calls `gpt-image-2` on logo data. Stop.
Report. User opens a new `kickoff-spec` cycle on the same row to
fix, then re-runs `ship-spec`.

**Rebase conflict.** Worktree has been open for a week and main
has moved significantly. Rebase hits conflicts in shared files.
Stop. Tell the user exactly which files conflicted. Do not
auto-resolve. User resolves manually, then re-runs `ship-spec`.

**Post-merge verification fails.** Rebase resolved cleanly but
introduced a subtle bug — type changed in main, the spec's code
typechecked against the old type but not the new one. Stop. Main
is now red. Surface the typecheck output. Let the user decide
between forward fix and revert; do not choose for them.

**Batch of three from a parallel kickoff.** User kicks off
`P0 #6, P0 #7, P0 #8` in three worktrees, all gate green. They
run `ship-spec P0 #6, P0 #7, P0 #8`. Skill processes #6: review
clean, user confirms, merge, push, cleanup. Then #7: review finds
🔴, stop on this row, move on. Then #8: review clean, user
confirms, merge fails post-gate, stop. Final report: #6 shipped,
#7 needs a fix cycle, #8 broke main and needs immediate
attention.
