---
name: backlog-triage
description: >-
  Triage backlog inbox items into phased, spec'd work. Use when the user says
  "triage", "triage the inbox", "triage US-01", "process the inbox",
  "create specs for inbox items", "scope this out", or when there are
  untriaged items in the inbox that need to become actionable work.
---

# Backlog Triage

Evaluate inbox items, explore the codebase for context, create properly
sized spec files, and slot work into the right phase.

The backlog is split across files: `docs/backlog.md` is the thin index
(agent instructions, status key, Phases table, Inbox, templates) and
`docs/backlog/` holds phase files, an already-built reference, and an
inbox archive. This skill reads the inbox from `docs/backlog.md` and
writes rows into the phase files under `docs/backlog/`.

Paired with `backlog-intake` (which adds new items to the inbox) — this
skill is the next stage.

## Workflow

### 1. Read the inbox

Read the Inbox section of `docs/backlog.md` and identify every item that
is not already marked `[x]` or `[!]`. If the user named a specific item
(e.g. "triage US-01"), process only that one. Otherwise process all
untriaged items.

If the same item has sat untriaged across 2+ triage passes with no new
information, flag it for the user rather than re-attempting triage —
it likely needs clarification or a product decision.

### 2. Classify each item

For each inbox item, decide the disposition. The primary test is
**"does this fit in one agent session?"** (CLAUDE.md's learned
preference: agent-sized spec chunks, one session each). File count is
a fallback heuristic, not the rule.

| Size | Signal | Action |
|------|--------|--------|
| **Tiny** | Single-file fix, trivially testable, no new components | Fix it now, mark `[x]` in inbox |
| **Small** | Fits one session comfortably; 1-2 files | Create one spec, add to phase file |
| **Medium** | Fits one session with focus; one feature area | Create one spec, add to phase file |
| **Large** | Does NOT fit one session; multiple feature areas or new tables | Split into sub-specs (a/b/c), add multiple rows |

### 3. Explore the codebase

**This is the most important step.** Before writing any spec, gather
real context from the repo:

1. **Find related code.** Search for existing components, queries,
   fixtures, and types that the work will touch or extend. Use Grep
   and Glob to find them — don't assume file locations.

2. **Read the patterns.** Open the files you found. Understand:
   - What data shapes exist (TypeScript types, fixture structures)
   - What component patterns are used (props, composition, file layout)
   - What screen query pattern is used (`cache()`, fixture fallback)
   - What test patterns are used (what's in `__tests__/` nearby)

3. **Check constraints.** Read relevant sections of:
   - `CLAUDE.md` — architecture, auth model, database privileges
   - `docs/product-bible.md` — feature scope, business rules
   - `docs/specs/_prompt-anatomy.md` — spec format reference
   - Existing spec files in `docs/specs/` — for style and depth

4. **Identify dependencies.** Does this work depend on a phase table
   item that isn't done yet? Does it need a database migration? Does
   it need a table that doesn't exist?

   Capture each dependency as a **phase row ID** (e.g. `P0 #3` or
   `m42a`) — the same format used in `docs/backlog/phase-N-*.md`.
   These get written into the spec's `## DEPENDENCIES` section so
   `pick-next-task` can detect blockage and `kickoff-spec` can
   refuse a kickoff with unsatisfied deps.

   When triaging several inbox items in a single pass, assign all
   row IDs first (numbering them in the phase file), then write
   specs — that way later specs in the batch can reference earlier
   ones by their just-assigned ID.

4a. **Check for architectural load.** Before writing the spec, scan
   the inbox item for signals that the work touches an
   architecturally-loaded decision:

   - New persisted entity, FK, or schema change
   - New service or module boundary
   - Auth, authorization, or session model change
   - Caching strategy (what to cache, where, invalidation)
   - Background job / queue introduction
   - New tech-stack pick for a cross-cutting concern (auth provider,
     payments, email, search, observability, queueing)
   - Migration or rollout strategy (backfill, dual-write, etc.)
   - New public API surface or breaking API change

   If any of these apply:
   - **If `docs/ARCHITECTURE.md` exists and resolves the question** —
     proceed to step 5. Cite the relevant ARCHITECTURE.md section in
     the spec's CONTEXT.
   - **If `docs/ARCHITECTURE.md` doesn't resolve the question** —
     stop. Recommend the user run `/architecture-review` (or
     `architecture-md-builder` if no ARCHITECTURE.md exists yet)
     before completing triage. The decision needs to be made and
     logged before specs that depend on it can be written reliably.
   - **If the user wants to proceed without a review** — proceed,
     but explicitly note in the spec's CONSTRAINTS section: "this
     spec made an architectural choice that wasn't reviewed; if the
     decision turns out wrong, follow-up work will be required."

   Reversible code-shape decisions (function signatures, internal
   helper organization, etc.) are NOT architectural load. Don't
   over-trigger this. The test: if the decision is wrong, would
   reversing it cost more than an afternoon? If yes, it's
   architectural.

5. **Identify files touched.** Best-effort enumeration of the files
   the spec will create or substantially modify. Used by
   `pick-next-task` to detect parallel-safe specs (two specs are
   parallel-safe only if their file lists are disjoint).

   Conservative is fine. If exact files are unknowable upfront, list
   directories instead (e.g. `lib/storage/`). Under-listing causes
   false parallelism conflicts later; over-listing just blocks
   parallel pairing.

### 4. Determine the phase

Phases are **project-specific**. Do NOT assume a universal "Phase 1 =
frontend, Phase 2 = data, Phase 3 = integration" mapping — every project
plans its own phase themes (e.g. `phase-6-demo`, `phase-7-polish`,
`phase-7-sarah-enhancements`, `phase-8-verification`).

**Discover the project's phase structure first.** Before deciding where
anything goes:

1. Read the `## Phases` table in `docs/backlog.md` to learn each
   phase's theme, scope, and status (Open / Done / Future / Planned).
2. List `docs/backlog/phase-*.md` to see which phase files exist on
   disk and read each file's heading and intro to confirm its theme.
3. Identify the **current active phase**: the lowest-numbered phase
   that is in progress or open for new work. Anything higher-numbered
   is a **future phase** and is off-limits for triage routing unless
   the user explicitly says otherwise.

**Routing rules:**

- If the item's nature **matches the theme of the current active
  phase**, route it there.
- If the item is a **standalone bug, chore, copy fix, or small
  refactor** with no specific phase theme, route it to the current
  active phase (or a `standalone` / misc bucket if the project uses
  one). Default for unscoped bug fixes is the **current** active
  phase, never a future polish/eval/cleanup phase.
- If the item's nature **only matches a future phase's theme**
  (e.g. it's observability work and only `phase-9-observability`
  exists in the table, but the current active phase is 6), **STOP**.
  Do not route into the future phase. Instead either:
  - Leave the item in the inbox with `[!] (waiting for phase N)`
    and a note explaining which future phase it's queued for, or
  - Ask the user whether to fold it into the current phase, hold
    it for the future phase, or keep it in the inbox until that
    phase is being planned.
- If no phase clearly matches and you're unsure, **ask the user** —
  do not guess into the next-available phase file just because it
  exists.

**Hard prohibitions:**

- Never auto-create a new phase file during triage. Phases are
  planned deliberately by the user; triage is downstream of that.
- Never write rows into a phase file whose number is higher than
  the current active phase, unless the user explicitly authorized
  it for this triage pass.
- A phase file existing with a themed name (e.g. `phase-7-polish.md`)
  does NOT mean it is open for new triage routing. Check the Phases
  table status. If it's empty, "future," or hasn't been planned yet,
  treat it as off-limits.

If an item spans phases (e.g. needs both UI scaffolding now and a
data wiring step later), split it: the part that fits the current
active phase goes in now; the deferred part either waits in the
inbox or is filed against the matching future phase only with the
user's explicit OK.

### 5. Size and split

Primary test: **does this fit in one agent session?** If not, split.

Fallback heuristic: the **3-file rule** — if a spec would require
creating or substantially modifying more than 3 files, it's probably
not going to fit.

Splitting follows natural seams:
- **Data / UI / Test**: fixture + screen query, then components + page, then interactions + test
- **By section**: if a page has 4 sections, split into 2+2
- **By step**: if a flow has 5 steps, split into groups of 2-3
- **By page**: if the work involves 2 separate routes, one spec per route

Each sub-spec must produce something **visually verifiable** on its own.
Don't split so that part A produces nothing visible — it should at least
render a page skeleton.

### 6. Write the spec(s)

Follow `docs/specs/_prompt-anatomy.md` format:

- **TASK**: one sentence
- **DEPENDENCIES**: phase row IDs that must be `[x]` before kickoff,
  one per line. Use the IDs captured in step 3 (`P0 #3`, `m42a`,
  etc.). If none, write `None`. Read by `pick-next-task` and
  enforced by `kickoff-spec` — never skip this section.
- **FILES TOUCHED**: best-effort list of files (or directories if
  unknowable) the spec will create or modify, captured in step 3.
  Used by `pick-next-task` for parallel-safety detection. Specs
  missing this section can never be paired with another spec for
  parallel work, so always write it even if approximate.
- **CONTEXT**: cite actual file paths and patterns you found in step 3.
  Don't write generic context — write "the existing pattern in
  `src/lib/queries/dashboard-screen.ts` wraps fixtures in `cache()`"
- **REQUIREMENTS**: numbered, each one testable
- **CONSTRAINTS**: what not to do — always include scope limits, always
  include "do NOT modify [unrelated files]". Package handling uses an
  explicit allow-list pattern:
  - **Default:** include the line `do NOT install new packages.`
  - **If this spec genuinely needs new packages** (bootstrap, new
    integration, tech-stack pivot), replace the default with both:
    `Forbidden: install packages other than those listed under
    "Allowed packages" below.` and `Allowed packages: <comma-separated
    list, e.g. stripe, @stripe/stripe-js>`. Be specific — don't write
    "any auth library." Triage authorizes named packages.
  - **For bootstrap specs only** (fresh repo, no `package.json` yet):
    `Allowed packages: <full list to scaffold the project>`.
  This way the executor reads the spec and can install only what was
  authorized; anything else is creep.
- **ACCEPTANCE CRITERIA**: observable, binary. Always include:
  - TypeScript compiles (`npx tsc --noEmit`)
  - Tests pass (`npm run test`)
  - A test file exists for the new work
- **DONE DEFINITION**: which backlog row to update

**Before writing, check for collisions.** Glob `docs/specs/` for the
filename you're about to use (e.g. `m42*`, `w15*`, `bug-14-*`) and pick
the next free number. Don't reuse numbers — existing phase files have
gaps, so "next available" means the max+1 of same-prefix specs.

Save specs to `docs/specs/` using the naming convention from the
backlog workflow rule.

### 7. Update the backlog

1. **Add row(s) to the phase file you identified in Step 4.** Do not
   hardcode filenames — every project's phase files are named for
   their themes (e.g. `phase-6-demo.md`, `phase-7-polish.md`,
   `phase-2-data-wiring.md`). Use the exact file path you confirmed
   in Step 4.

   Do not write to a phase file whose theme doesn't match the work,
   even if it happens to be the next-numbered file on disk.

   Use the next available number in that phase (max+1 of existing row
   numbers). For sub-specs, use decimal notation in the backlog row
   (`42.1`, `42.2`) but letter suffixes in the spec filenames
   (`m42a-...md`, `m42b-...md`) — this is the convention existing
   phase files use.

   Spec link paths in phase files are relative: use
   `[m42-thing.md](../specs/m42-thing.md)` (the phase file is one
   level below `docs/`, so specs are `../specs/`).

2. **Bump the Phases table in `docs/backlog.md`.** The Open / Done /
   Blocked counts in the `## Phases` summary table must match reality.
   Increment the Open count for the phase you added rows to.

3. **Move the inbox item to the archive.** Don't leave `[x] triaged`
   entries in `docs/backlog.md` — they bloat the index.
   - Append a new entry to `docs/backlog/inbox-archive.md` with the
     original item body and a header of
     `### [x] triaged → Phase X #Y.Z US-NN: [original title]`
     (or `#Y.1, #Y.2, #Y.3` if split).
   - Remove the item from the Inbox section of `docs/backlog.md`.
   - For tiny fixes handled in-place: skip the phase-file step and
     append to the archive with `### [x] YYYY-MM-DD US-NN: ...` plus
     a **Resolution:** line describing what changed.

### 8. Report to the user

After triaging, summarize what you did:
- Which items you triaged, and how many specs were created
- Which phase each landed in (with the new row number, e.g. "P1 #52")
- Any items you fixed immediately (tiny fixes)
- Any items you couldn't triage (missing info, ambiguous scope)
- **The updated Phases table counts** — so the user can confirm the
  index stayed in sync. Example: "Phase 1 now 19 open / 55 done."

## Rules

- Never start coding during triage. Triage produces specs, not code.
- Never auto-create a new phase file. Phases are planned deliberately
  by the user; triage only fills in phases that already exist and are
  open for new work.
- Never route an item into a future-numbered phase just because it's
  the next file on disk. A phase being "next available" by number is
  not authorization to use it — its theme must match the work, and
  the Phases table must show it as open/active. When in doubt, ask.
- Never triage into a phase that has unfinished dependencies unless the
  user explicitly asks to work out of order.
- If an inbox item is unclear or missing information, ask the user
  rather than guessing. Flag it as `[!] (needs clarification)`.
- If an inbox item duplicates existing backlog work, point it out
  and mark it `[x] duplicate of #N`.
- Product decision documents (like `docs/referral-adendum-3.md`) are
  reference material, not backlog items. Decompose them into individual
  stories/tasks during triage, then reference the source doc in each
  spec's CONTEXT section.
