# Getting started — first session in a new project

> Read this once after running `agent-workflow`. Delete it (or move it to `docs/`) when you don't need it anymore.

The kit gives you the **shape** of an agent workflow. This file walks you through filling it in for the first time. The whole loop is **PRD → (ARCHITECTURE) → ROADMAP → seed backlog → triage → kickoff → ship**.

ARCHITECTURE is parenthesized because it's optional for thin projects (static sites, content sites, simple CLIs) and load-bearing for anything else (anything with a database, auth, payments, multi-tenancy, or cross-cutting concerns).

---

## The mental model (read this first)

Three documents, three jobs. Don't conflate them:

| Doc | Lives at | Length | Job |
|---|---|---|---|
| `CLAUDE.md` | repo root | ~1 paragraph + bullets | Session memory. What agents read every turn. |
| `DESIGN.md` | repo root | scaffolded by `design-md-builder` | Brand, tokens, type, motion, forbidden defaults. Required before any UI work. |
| `docs/PRD.md` | `docs/` | 2–10 pages | The comprehensive product doc. Scope, users, MVP, non-goals. |
| `docs/ARCHITECTURE.md` | `docs/` | 5–8 pages, scaffolded by `architecture-md-builder` | Stack, data model, service shape, cross-cutting concerns, trade-off log. Required for architecturally-loaded projects. |
| `docs/ROADMAP.md` | `docs/` | short | Phases (P0/P1/P2…). What ships when, in what order. |

The backlog has three stages of the same item:

```
Raw idea  ──/backlog-intake──▶  Inbox item  ──/backlog-triage──▶  Phase spec
(one-liner)                     (US-/BUG-/TASK-)                   (in docs/backlog/phase-*.md)
```

---

## Step-by-step

### 1. Write the PRD (the comprehensive product doc)

Open Claude Code in this folder and run:

```
prd-grill
```

This is the kit's relentless one-question-at-a-time PRD interrogation. It explores the codebase before asking when it can answer itself, recommends an answer with every question (so you react instead of starting blank), and spends the most time on **non-goals** — the section AI agents most need to read.

It produces a structured `docs/PRD.md` plus a Revision log skeleton ready for `prd-revise` later.

You'll be answering across these six dimensions:

1. **Who is this for?** (one specific user, not "everyone")
2. **What problem does it solve?** (in their words)
3. **What does V1 do?** (3–7 user-visible capabilities)
4. **What does V1 explicitly NOT do?** (the non-goals — most important section)
5. **What does success look like?** (1–2 measurable outcomes)
6. **Constraints** (stack, deadlines, integrations, anti-patterns)

> **Spend more time on non-goals than features.** Agents are very good at building things and very bad at *not* building things. That's where scope creep lives.

### 2. (Architecturally-loaded projects only) Lock in the architecture

If your project has any of: a database, auth, payments, multi-tenancy, background jobs, caching, or any non-trivial cross-cutting concerns — run:

```
architecture-md-builder
```

It interrogates you across stack, data model, service boundaries, cross-cutting concerns, evolution bets, and trade-offs, then writes `docs/ARCHITECTURE.md`.

**Skip this step if** the project is a static site, content site, simple CLI, library, or anything else without state and integrations. You can always add ARCHITECTURE.md later when complexity grows.

> **Why before ROADMAP?** Roadmap phases assume a stack. If you don't know whether you're using Drizzle or Prisma, you can't sensibly phase "set up DB layer."

For individual architectural decisions later (a new service, a schema migration, a caching strategy), use `/architecture-review` rather than re-running the full builder.

### 3. (Projects with any UI) Lock in the design language

If your project has *any* user-facing surface — even a single landing page — run:

```
design-md-builder
```

It interrogates you across visual references, brand identity, typography, color, motion, and forbidden defaults, then writes `DESIGN.md` at the repo root. Every subsequent UI spec anchors against this file via `/craft-ui` and `design-reviewer`.

**Skip this step if** your project has zero user-facing surface (pure CLI, library, internal script). You can always add `DESIGN.md` later when UI work appears — `/craft-ui` will halt and tell you to run `design-md-builder` if it's needed.

> **Why before ROADMAP?** Roadmap phases assume an aesthetic direction. If you don't know whether the product is "editorial brutalism" or "Apple restraint," you can't sensibly phase the UI work. More importantly: **without DESIGN.md, AI agents drift toward generic "AI slop" aesthetics** by default. Locking in the design language up front is the single biggest defense against that.

> **Order matters.** Do this *after* architecture (step 2) so the stack is known before tokens are committed (Tailwind v4 vs v3 changes the format), but *before* ROADMAP so phasing reflects an aesthetic direction.

### 4. Draft the ROADMAP

Use the prompt at `prompts/prompt-roadmap.md`:

```
> Read docs/PRD.md and (if it exists) docs/ARCHITECTURE.md, then follow
> prompts/prompt-roadmap.md to draft docs/ROADMAP.md.
```

Iterate until you're happy. 2–4 phases, each shippable on its own.

### 5. Fill in CLAUDE.md placeholders

Distill the PRD down. Each `{{PLACEHOLDER}}` should be 1–3 lines, **not** a paragraph:

- `{{ONE_PARAGRAPH_PRODUCT}}` — what this is, in one paragraph
- `{{CONVENTIONS_DO_AND_DONT}}` — short bulleted list
- `{{SUCCESS_METRICS}}` — what "done" looks like
- `{{ANTI_PATTERNS}}` — what *not* to do

Reference `docs/PRD.md` for detail; don't duplicate it into `CLAUDE.md`.

> The kit ships with `TASK-01: Define ROADMAP` in the Inbox. **Don't triage it through the spec system** — it's bootstrap scaffolding, not real work. Just delete it or check it off `[x]` once steps 1–5 are done.

### 6. Seed the backlog

Use the prompt at `prompts/prompt-seed-backlog.md`:

```
> Read docs/PRD.md and docs/ROADMAP.md and follow prompts/prompt-seed-backlog.md
> to populate the Inbox in docs/backlog.md.
```

This produces already-classified `US-###` (capabilities) and `TASK-###` (setup/infra) items grouped by phase. You'll rarely have `BUG-###` items at this stage — bugs only exist once you've shipped something that can break.

### 7. (Optional) Tidy with backlog-intake

If the seed output is rough, run:

```
/backlog-intake
```

Per-item to polish formatting and acceptance criteria. If the seed output already looks clean, skip this and go straight to triage.

### 8. Triage into phases

```
/backlog-triage
```

Moves items from Inbox into `docs/backlog/phase-*.md` files and tags each with `kind: ui | backend | infra`. The `kind` tag is what `/kickoff-spec` reads later to dispatch correctly:

- `kind: ui` → executes via `/craft-ui` (visual review gate, 4 viewports)
- `kind: backend` or `kind: infra` → executes via `/kickoff-spec` (tests-pass gate)

### 9. Pick + ship

```
/pick-next-task         # recommend next unblocked item
/kickoff-spec <ID>      # validate, flip to in-progress, dispatch, gate on tests
/ship-spec <ID>         # review → human merge confirmation → push + cleanup
/ship-followup <ID>     # process deferred items (optional)
```

Loop step 9 forever. If a triage flags an architecturally-loaded inbox item without a clear answer in `docs/ARCHITECTURE.md`, run `/architecture-review` mid-loop before proceeding — see "When to run /architecture-review" below.

---

## When to run `/prd-revise`

The PRD written in week 1 starts to lie by week 6. Capabilities ship that aren't documented, items in the PRD get silently descoped, assumptions get invalidated by architectural decisions. `/prd-revise` keeps the doc honest.

Run it when any of:

- A phase just shipped (a row flipped to `[x]` and bumped the Phases counts).
- A new entry in `docs/ARCHITECTURE.md` Trade-off log materially affects scope.
- You're about to triage a fresh batch of inbox items and want to make sure they're judged against current product intent.
- You notice your mental model has drifted from the written PRD.
- Cadence: every 5–10 shipped specs or every phase boundary, whichever comes first.

The skill detects drift in three dimensions:

1. **Shipped but not in PRD** — was it scope creep or legitimate evolution?
2. **In PRD but not shipped or scheduled** — was it silently descoped or forgotten?
3. **Invalidated assumptions** — did an architectural decision contradict something the PRD assumed?

For each finding, you decide what to do — the skill never edits the PRD without your approval. Updates land with an append-only **Revision log** entry at the bottom of the PRD, mirroring how `ARCHITECTURE.md` keeps a Trade-off log.

**Don't run it:**
- Mid-spec execution (it produces context noise during implementation).
- More than once per phase under normal conditions (PRD churn is a smell).
- On thin projects with <5 specs total — there's nothing to drift yet.

---

## When to run `/architecture-review`

Run it mid-workflow whenever a decision touches one of:

- New persisted entity, FK, or schema change
- New service or module boundary
- Auth, authorization, or session model change
- Caching strategy (what to cache, where, invalidation)
- Background job / queue introduction
- New tech-stack pick for a cross-cutting concern (auth, payments, email, search, observability, queueing)
- Migration or rollout strategy (backfill, dual-write, etc.)
- New public API surface or breaking API change

The skill reads `docs/PRD.md` and `docs/ARCHITECTURE.md`, frames the decision honestly, surfaces trade-offs, and recommends a path. It appends the resolved decision to ARCHITECTURE.md's Trade-off log so future-you (and future agents) know why.

**Don't run it for** reversible code-shape decisions (function signatures, internal helper organization, UI patterns). Test: if the decision turns out wrong, would reversing it cost more than an afternoon? If yes, run the review. If no, the executor decides.

If `/backlog-triage` flags an inbox item as architecturally loaded and `docs/ARCHITECTURE.md` doesn't resolve the question, it will recommend running `/architecture-review` before completing triage. Take the recommendation — specs written before the architectural decision is logged tend to need rework.

---

## Rule of thumb: when do I need a spec?

Run the spec → kickoff loop only when **all three** are true:

- Touches code (not docs/planning).
- Has a verifiable "done" (tests, visual rubric, smoke check).
- Would lose context if it sat in the queue for days.

**Things that DON'T need a spec:** writing the PRD, drafting the ROADMAP, filling `CLAUDE.md` placeholders, renaming a folder, one-line config tweaks. Just do them in conversation.

---

## Common stumbles

| Symptom | Fix |
|---|---|
| Agent keeps inventing features not in scope | Tighten the **non-goals** section in the PRD; surface them in `CLAUDE.md` `{{ANTI_PATTERNS}}` |
| Backlog is 30+ items per phase | Sizing is too granular. Merge anything <30min into a parent item |
| Backlog is 1 item per phase | Sizing is too coarse. Split anything >1 day |
| `/kickoff-spec` runs the wrong execution lane | Spec is missing `kind:` tag — re-run `/backlog-triage` |
| Stuck at "blank page" on PRD | Run `prd-grill` — interrogates one question at a time with recommended answers |
| Specs keep needing rework after-the-fact because schema/auth/etc. choices were wrong | Run `architecture-md-builder` (once, after PRD) and `/architecture-review` (per decision) — both feed into triage |
| Triage refuses to write a spec citing "architectural load" | Take the hint — run `/architecture-review` and append the decision to ARCHITECTURE.md, then resume triage |
| The PRD no longer matches reality after a phase or two | Run `/prd-revise` — surfaces drift in three dimensions and lets you update the PRD with an append-only Revision log |
| Inbox keeps producing items that don't trace to the PRD | Same — run `/prd-revise` before triaging the next batch so triage judges against current product intent |
| `agent-workflow: command not found` | Add `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc` |

---

## Files this kit dropped in your project

```
CLAUDE.md                                          ← session memory (fill placeholders)
AGENTS.md                                          ← Cursor agent prefs (fill placeholders)
GETTING-STARTED.md                                 ← this file
prompts/
  ├── prompt-roadmap.md                            ← roadmap drafting prompt
  └── prompt-seed-backlog.md                       ← backlog seeding prompt
docs/
  ├── backlog.md                                   ← Inbox + phase index
  └── agent-workflow-skills.md                     ← skill reference
.claude/
  ├── commands/                                    ← /craft-ui, /scaffold-component, /forbid
  ├── agents/                                      ← design-reviewer, architecture-reviewer, migration-reviewer, api-reviewer, agents-memory-updater
  ├── skills/                                      ← prd-grill, design-md-builder, architecture-md-builder, architecture-review, prd-revise, continual-learning
  ├── hooks/                                       ← Stop-hook for continual learning
  └── settings.json                                ← project Claude settings
.cursor/
  ├── rules/project-memory.mdc                     ← always-read rule for Cursor
  └── hooks/state/continual-learning-index.json    ← transcript mining starter
scripts/check-tokens.sh                            ← token-violation check
tests/a11y.spec.ts                                 ← accessibility smoke test
```

---

## Where the source of truth lives

- **Code conventions:** `CLAUDE.md`
- **Visual / brand:** `DESIGN.md` (run `design-md-builder` skill before any UI work if missing)
- **System shape, schema, cross-cutting:** `docs/ARCHITECTURE.md` (run `architecture-md-builder` if missing for an architecturally-loaded project; run `architecture-review` for individual decisions)
- **Scope:** `docs/PRD.md`
- **Order:** `docs/ROADMAP.md`
- **Work queue:** `docs/backlog.md` + `docs/backlog/phase-*.md`
- **Skills available:** `docs/agent-workflow-skills.md`
