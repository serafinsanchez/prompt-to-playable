---
name: ship-followup
description: >-
  Process the items surfaced by `ship-spec` (deferred review findings,
  spec inconsistencies, FILES TOUCHED deviations, operational chores,
  workflow gaps) into either fix-in-place edits, new inbox items, or
  flagged-for-human-review notes. Per-item confirmation always; never
  auto-edits other skills. Use when `ship-spec` has just finished and
  surfaced 🟡 / 🟢 findings or workflow notes, or when the user says
  "follow up on [spec]", "post-ship cleanup", "process the ship
  report", "what's left from [spec]", or "handle the deferred items".
---

# Ship Followup

After `ship-spec` lands a spec on main, items often surface that
the review pass deferred or the merge couldn't address: 🟡
suggestions left for later, 🟢 nice-to-haves, FILES TOUCHED
deviations, spec inconsistencies discovered during execution,
operational chores, and workflow gaps that hint at skill
amendments.

This skill is the **router** for those items. It does not decide
on its own — every disposition requires explicit per-item
confirmation. Workflow gaps that touch skill files are **flagged
only**, never auto-amended.

## Inputs

The user supplies one of:

- **A row ID** (e.g. `P0 #1`) whose `ship-spec` recently completed
  in this session. The skill reads the earlier ship-spec output
  from session history.
- **A pasted ship-spec report**. If the run is older than the
  current session, ask the user to paste it instead of guessing.

If neither is supplied, refuse — do not auto-detect "the most
recent ship". Magic detection picks the wrong thing too often.

## Workflow

### 1. Read the ship-spec report

Locate the ship-spec output for the supplied row. Sources, in
order:

1. The current session's earlier `ship-spec` invocation output.
2. A pasted report from the user.

Extract:
- Row ID and spec path
- 🔴 / 🟡 / 🟢 findings (categorized)
- The "Deviations from `## FILES TOUCHED`" section
- "Other small choices" / "Deferred" / "Working tree note"
  callouts
- Any explicit "Notes" or "Workflow note" callouts (e.g. a
  bootstrap-spec exception bundle)

If the report cannot be located, refuse and ask the user to paste
it.

### 2. Categorize every surfaced item

For each line / bullet in the report, assign one of the five
categories below. Items that don't fit get surfaced at the end
under "Uncategorized — needs your input".

| Category | Signal | Default recommendation |
|----------|--------|------------------------|
| ⚙️ **Workflow gap** | Skill behavior didn't match the situation; the run had to deviate | **Flag for human review only.** Never auto-edit. |
| 📝 **Spec inconsistency** | Spec said X but reality / sibling sections say Y | Tiny → fix-in-place; larger → file as TASK |
| 🔧 **Operational chore** | Small repo-hygiene thing surfaced (gitignore, env, formatting) | Tiny → fix-in-place; larger → file as TASK |
| 🟢 **Deferred nice-to-have** | Review item marked optional / nice-to-have | File in inbox via `backlog-intake` |
| 📁 **FILES TOUCHED deviation** | Execution touched files not listed, or skipped listed files | 3-way: accept silently / amend spec / file as concern |

**Unaddressed 🟡 suggestions** (review marked them "consider" and
they were not addressed pre-merge) are treated like deferred 🟢s —
file as TASK in inbox unless the user explicitly drops them.

### 3. Tiny vs not-tiny

A disposition is **tiny** only if all of these hold:

- Single file edit
- Single line, or block under ~5 lines
- No scope expansion beyond the literal item
- No new dependencies, no new directories

Anything else is **not tiny** — file as a TASK in the inbox via
`backlog-intake` so it gets the next triage pass.

When in doubt, treat as not-tiny. The cost of an extra inbox
entry is far lower than the cost of a sneaky scope expansion in
a "tiny" fix.

### 4. Per-item presentation and confirmation

Process items one at a time, in this order:

1. ⚙️ Workflow gaps (flag-only — show first so the user sees them)
2. 📝 Spec inconsistencies
3. 🔧 Operational chores
4. 🟢 Deferred nice-to-haves and unaddressed 🟡 suggestions
5. 📁 FILES TOUCHED deviations

For each item, present in this format:

```
[N/M] <emoji + category>
  <verbatim text from the ship-spec report>

Recommendation: <disposition + one-line rationale>
<For tiny fix-in-place: show the exact diff>

Apply? [y / n / skip / change]
```

- `y` → execute the disposition
- `n` → record as **declined** (user has reviewed and rejected)
- `skip` → record as **deferred** (user wants to handle later;
  surface in final report so the item doesn't vaporize)
- `change` → user wants a different disposition; ask which from
  the fixed menu: fix-in-place / file-as-TASK / file-as-US /
  file-as-BUG / amend-spec / drop / flag-only

For 📁 **FILES TOUCHED deviations**, the prompt is 3-way fixed:

```
[N/M] 📁 FILES TOUCHED deviation
  <verbatim text>

Options:
  a) Accept silently — execution had a good reason, no follow-up
  b) Amend the spec to reflect what actually happened
  c) File as concern (TASK in inbox) for later investigation

Choose [a / b / c / skip]
```

For ⚙️ **workflow gaps**, the prompt is fixed at flag-only:

```
[N/M] ⚙️ Workflow gap
  <verbatim text>

Recommendation: Flag for human review. This skill does not edit
other skills. Capturing in session report for your follow-up.

Acknowledge [y / skip]
```

### 5. Execute confirmed dispositions

| Disposition | Action |
|-------------|--------|
| Fix-in-place | Show diff first; then edit; one commit per item |
| File as TASK / US / BUG | Hand off to `backlog-intake` with the item text. Capture the new ID. |
| Amend spec | Edit the spec file (now historical — note "(historical)" in the commit message) |
| Drop | Record only; no action |
| Flag-only | Add to session report; no action on disk |
| Declined / skipped | Record only; no action |

For fix-in-place edits, commit each one separately:

```
chore: <one-line description of the tiny fix> (followup to <row ID>)
```

For inbox additions, **do not** commit per-item — `backlog-intake`
writes to `docs/backlog.md`, but multiple additions can batch into
a single commit at the end:

```
chore(backlog): file followup items from <row ID> ship review
```

This avoids polluting history with N micro-commits when the user
files five inbox items in one followup pass.

### 6. Final report

Summarize for the row:

- **Fixed in place** — list with commit SHAs
- **Filed in inbox** — list with new IDs and titles
- **Spec amendments** — list with file path + commit SHA
- **Flagged for human review** — list (workflow gaps, etc.)
- **Declined / dropped** — list (user has decided these don't
  need action)
- **Deferred (skip)** — list — these go nowhere this session;
  surface them so the user remembers to re-run the skill later

If any flag-only items remain, end the report with:

> Skill amendments to consider — open a fresh chat per amendment,
> do not batch. Skill edits need a real conversation, not a quick
> followup.

## Rules

- **Per-item confirmation, always.** No batch confirms, no "apply
  all tiny fixes," no implicit `y`. The friction is the feature —
  it's the difference between a router and a decision-maker.
- **Never edit other skills from this skill.** Workflow gaps are
  flag-only, even with explicit `y`. Skill amendments need a real
  conversation, not a confirmation prompt.
- **No auto-detection of which row to process.** User supplies the
  row ID or pastes the report.
- **Do not modify the spec's row status.** The row is `[x]` and
  shipped. This skill never touches phase files or the Phases
  summary in `docs/backlog.md`.
- **Do not retroactively rewrite `## ACCEPTANCE CRITERIA`.** Spec
  amendments here are for fixing typos and FILES TOUCHED
  accuracy — not rewriting requirements. If a real requirement
  was wrong and the implementation diverged, that's a new spec
  cycle (`backlog-intake` → `backlog-triage`), not a followup
  edit.
- **Do not invent items.** Every processed item must come from
  the ship-spec report, not from re-reading the diff or
  re-reviewing the spec.
- **Do not run the full review again.** Trust the ship-spec
  review's findings. If you don't, that's a `ce-code-review`
  invocation, not a `ship-followup`.
- **`change` only offers the fixed disposition menu.** Do not
  invent new dispositions on the fly.
- **Tiny means tiny.** When in doubt, file as inbox item. Sneaky
  scope expansion under "tiny fix" is the failure mode this rule
  exists to prevent.

## Common patterns

**m01-style report (small).** Three deferred items: AC #10 typo,
.gitignore add, bootstrap-spec exception. Walk: typo (fix-in-place
y → commit), gitignore (fix-in-place y → commit), bootstrap (flag-
only y → captured). Final report: 2 fixed, 0 filed, 1 flagged.
Under a minute.

**Large review with many 🟡s.** Spec touched a complex area;
review returned 5 🟡s addressed pre-merge plus 4 🟢 deferreds.
Walk the 4; user files 2 as TASKs, drops 2. Final report: 0
fixed, 2 filed (with new TASK IDs), 2 dropped.

**FILES TOUCHED deviation, real reason.** Execution created
`lib/utils/colors.ts` not listed in the spec. User picks (b)
"amend the spec" because the deviation was correct and future
specs reading this one as reference will benefit from the
accuracy. Skill edits the spec's `## FILES TOUCHED` section and
commits with `(historical)` in the message.

**Workflow gap the user already fixed by hand.** User says
`change` → `drop` because they already amended the relevant skill
in this same session (like the bootstrap-spec exception fix
earlier). The flag-only safeguard prevented a duplicate
amendment.

**Skip means skip.** User says `skip` on three items because
they're tired and want to come back tomorrow. Final report
surfaces them under "Deferred (skip)" so the user can re-run
`ship-followup` with the same row ID later. The deferred items
don't vaporize.
