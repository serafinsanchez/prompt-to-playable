---
name: prd-revise
description: Detect drift between docs/PRD.md and the actual product being built, then walk the user through deliberate PRD updates with an append-only revision log. Use at phase boundaries, when a material decision in docs/ARCHITECTURE.md trade-off log changes scope assumptions, when the user notices their mental model no longer matches the PRD, or whenever the inbox starts producing items that don't trace cleanly to a PRD capability. Triggers on phrases like "revise the PRD", "PRD review", "is the PRD still accurate", "update the PRD", "PRD drift check", "let's check the product doc", "what have we learned that changes the PRD".
---

# PRD Revise

Your job is to keep `docs/PRD.md` honest as the build progresses. The PRD written in week 1 starts to lie by week 6 — capabilities ship that aren't documented, items in the PRD get silently descoped, assumptions get invalidated by architectural decisions, and nobody updates the doc.

This skill is **refinement, not creation.** It assumes a PRD already exists. The output is a deliberately-updated PRD plus an append-only **PRD revision log** entry that future-you (and future agents) can read to understand how the product evolved.

## Operating principle

You are not the product owner — the user is. Your job is to **surface drift,** not to decide what's right.

For each drift signal you find, propose options and ask the user to choose:
- "We shipped X but it's not in the PRD. Should the PRD include it now, or was X scope creep that should be reverted?"
- "The PRD says V1 includes Y but no spec was triaged for it. Was Y silently descoped, or did we forget?"

Don't editorialize. Don't make value judgments about whether shipped work was good. Catch the drift, surface it cleanly, let the user decide.

## When to use this skill

Trigger it when any of:

- A phase just shipped (`[x]` row added in a phase file).
- A new entry in `docs/ARCHITECTURE.md` §6 (Trade-off log) materially affects scope.
- The user is about to triage a fresh batch of inbox items and wants to make sure they're judging against the latest PRD.
- The user notices their mental model has drifted from the written PRD.
- Cadence-based: every N shipped specs (default: every 5–10), or every phase boundary, whichever comes first.

**Don't run it:**
- More than once per phase under normal conditions (PRD churn is a smell).
- During active spec execution (it produces context noise mid-implementation).
- On thin projects with a 1-page PRD and <5 specs total — there's nothing to drift yet.

## Phase 0 — Preflight

1. Verify `docs/PRD.md` exists and is non-empty. If missing or still has `{{PLACEHOLDER}}` markers, STOP — the user needs to write the PRD first by running `prd-grill`.
2. Verify there's something to compare against. At minimum:
   - At least one spec marked `[x]` in `docs/backlog/phase-*.md`, OR
   - At least one entry in `docs/ARCHITECTURE.md` §6 Trade-off log, OR
   - User has surfaced specific drift to investigate.
   If none of these, STOP — there's no signal to refine against. Tell the user to ship some work first.
3. Locate the PRD's existing **Revision log** section (typically at the bottom). If absent, plan to create one (skeleton in `references/revision-log-format.md`).

## Phase 1 — Gather inputs

Read, in order:

1. `docs/PRD.md` — the current state to refine.
2. `docs/ROADMAP.md` — to ground capabilities against phases.
3. `docs/ARCHITECTURE.md` (if it exists) — especially §5 (Bets / Deferred) and §6 (Trade-off log) for the last 30–60 days.
4. Last 5–10 shipped specs from `docs/specs/`. Read their TASK lines and ACCEPTANCE CRITERIA, not the implementation notes.
5. Open inbox items in `docs/backlog.md` Inbox section.
6. The PRD's existing Revision log (if any).

Note timestamps. If the PRD was last revised >30 days ago and >10 specs have shipped since, drift risk is high.

## Phase 2 — Detect drift in three dimensions

For each dimension, list every signal you find. Don't filter yet.

### A. Shipped capabilities not in PRD

For each shipped spec (`[x]`), trace it back to a PRD capability. If it doesn't trace, flag it.

- Did this ship to support a PRD capability we just didn't articulate well? (Update PRD to articulate.)
- Did this ship as scope creep? (Decide: keep + add to PRD, or revert + file as a non-goal.)
- Did this ship as a side-effect of necessary infra work? (Note in PRD as supporting capability.)

### B. PRD capabilities not yet shipped (and not on the active roadmap)

For each capability listed in the PRD, check if there's a corresponding spec (shipped, in-progress, or in a current phase file). If none, flag it.

- Was it silently descoped? (Move to non-goals or to a deferred phase.)
- Was it forgotten? (File as an inbox item.)
- Has the PRD been over-specified relative to V1 reality? (Trim.)

### C. Invalidated assumptions

For each notable claim or constraint in the PRD, check whether anything in `ARCHITECTURE.md` §5 (Bets) or §6 (Trade-off log) contradicts it.

- The PRD assumed Postgres but architecture chose SQLite for V1 — what implications does that have for capabilities?
- The PRD assumed multi-tenancy from day one but architecture deferred it — does V1 still match the PRD?
- A bet logged in §5 conflicts with PRD success metrics — which is current?

## Phase 3 — Surface findings to the user

Present findings as a structured table, one row per drift signal. **Do not edit anything yet.**

```
## PRD Drift Report — {YYYY-MM-DD}

### A. Shipped but not in PRD ({count})
| Spec | What shipped | In PRD? | Recommendation |
|---|---|---|---|
| P0 #4 | Reaction emoji on tasks | No | User decides: add to PRD §3 or note as creep |

### B. In PRD but not shipped or scheduled ({count})
| PRD line | Status | Recommendation |
|---|---|---|
| "V1 includes shareable public profile pages" | No spec; not in current phase files | User decides: descope to non-goal, defer to P3, or file inbox item |

### C. Invalidated assumptions ({count})
| PRD claim | Conflicts with | Recommendation |
|---|---|---|
| "User accounts created instantly" | ARCHITECTURE.md §6: chose Clerk with email verification | User decides: update PRD to "verification required" or reconsider Clerk |
```

Wait for the user to walk through each finding with you. **Do not batch-update.**

## Phase 4 — Apply updates (one at a time, with explicit confirmation)

For each finding the user wants to act on:

1. Read the affected PRD section.
2. Propose the smallest possible diff to address the finding.
3. Show it to the user.
4. On approval, edit the PRD.
5. Track the change for the revision log.

If a finding requires action *outside* the PRD (e.g. file an inbox item, update ROADMAP, add a non-goal), do that as a separate step and note it in the revision log entry as "Related actions."

## Phase 5 — Append a revision log entry

After all approved updates are applied, append a single entry to PRD §**Revision log**. One entry per revision pass, even if multiple findings were addressed.

Format (see `references/revision-log-format.md` for skeleton):

```markdown
### {YYYY-MM-DD} — Phase {N} revision pass

**Triggered by:** {phase boundary | trade-off log entry | user-noticed drift | cadence}

**Drift addressed:**
- {one bullet per finding, with the action taken}

**Updates applied to PRD:**
- §{section} — {one-line summary of edit}

**Related actions:**
- {filed INBOX-X for missed PRD capability, if any}
- {moved Y to non-goals}
- {none}

**Carried forward:**
- {findings the user chose not to act on yet, with why}
```

## Phase 6 — Summary print

After writing, print:

1. Number of drift signals surfaced (by dimension).
2. Number addressed in this pass.
3. Number carried forward (not yet acted on).
4. Whether ROADMAP, ARCHITECTURE.md, or backlog need follow-up edits the user should consider.

If meaningful changes were made, suggest re-running `/backlog-triage` on any open inbox items — they should be judged against the freshly-updated PRD.

## What you never do

- **Edit the PRD without explicit user approval per change.** This is a deliberate-update skill, not an autonomous one.
- **Manufacture drift.** If the PRD and shipped reality match, say so and stop. The right outcome of a clean revision pass is "no drift detected." Don't invent issues.
- **Make value judgments about scope creep vs. legitimate evolution.** Surface the signal, name the options, let the user decide.
- **Touch the Revision log retroactively.** It's append-only. If a past entry was wrong, write a new entry that supersedes it.
- **Run during active spec execution.** Wait for a quiet moment.
- **Combine this with PRD authoring.** If the PRD doesn't exist, send the user to `prd-grill`. This skill assumes a PRD to refine.

## Reference files

- `references/revision-log-format.md` — skeleton for the Revision log section to add to PRDs that don't have one yet.
