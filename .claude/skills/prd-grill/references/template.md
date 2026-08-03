# {{PROJECT_NAME}} — PRD

> Source of truth for **what V1 is and isn't**. Read before triaging any spec. Updated deliberately via `/prd-revise` — never silently re-interpreted.

**Version:** 1.0
**Last updated:** {{DATE}}
**Status:** {{Greenfield | Living | Frozen for V1}}

---

## 1. Primary user

One or two paragraphs. Concrete, real-world details. Name the archetype (ideally based on a real person), describe what they do for work, and the moment in their day they'd reach for this product. What are they currently doing to solve the problem manually?

> Example: "Solo indie hackers running 2–4 side projects in parallel. Most have a day job in software. They use a mix of Linear, Notion, and Apple Notes today, and the friction of context-switching across tools means tasks fall through the cracks. The moment they reach for this product is Monday morning, planning the week's micro-allocations across projects."

---

## 2. Problem

One paragraph in the user's own words and lived experience. Specific enough that you'd recognize the user describing the pain in the wild.

> Example: "They spend 20–30 minutes every Monday morning copying todos out of Slack DMs, Linear, and a paper notebook into a single 'this week' list. By Wednesday the list is wrong because they've added new tasks elsewhere. They feel like they're 'managing the manager' instead of doing work."

---

## 3. V1 capabilities (3–7)

Ordered by load-bearing weight — most-noticed first.

1. {Verb-led action — what the user can do.}
2. {…}
3. {…}

> Example:
> 1. Capture a task in <2 seconds from anywhere (keyboard shortcut → frictionless input).
> 2. See today's list — only what matters today, nothing else.
> 3. Mark a task pinned-for-today, even if its due date is later.
> 4. Move tasks between projects without losing context.
> 5. Quickly review yesterday's incomplete work.

---

## 4. V1 non-goals

The most important section. Every "out" has a one-sentence reason. Future-you (and future agents) read this to know whether to revisit.

### Explicitly out for V1

- ❌ {Thing} — *{one-sentence reason}*
- ❌ {Thing} — *{one-sentence reason}*

> Example:
> - ❌ Real-time multiplayer / collaboration. *V1 is single-user; OT/CRDT is a 3-month project.*
> - ❌ Native mobile. *Target user works at a desk; mobile-responsive is enough.*
> - ❌ Public sharing of tasks. *Privacy concerns until we understand legal scope.*
> - ❌ Custom themes / layouts. *Fixed UI lets us iterate the core experience first.*
> - ❌ User-facing API / webhooks. *Integration story is V2; V1 is the app itself.*
> - ❌ Billing. *Free for V1; revenue model decided post-validation.*

### Punted, will revisit at {phase boundary or date}

- ⏸ {Thing} — *{when to revisit, and what would tip the decision}*

> Example:
> - ⏸ Team / workspace support. *Revisit at P2 boundary if usage data shows users wanting to share lists.*

---

## 5. Success metrics

1–2 measurable outcomes. Each one has a threshold and a timeframe.

- {Outcome with specific number and timeframe.}

> Example:
> - In the first 8 weeks after launch, 30% of users who complete sign-up return in week 2 with at least one captured task.
> - Median time-to-first-task-captured is under 60 seconds from sign-up.

---

## 6. Constraints

### Stack

Strong opinions only. Full stack details captured in `docs/ARCHITECTURE.md` (run `architecture-md-builder`).

- {Verbatim user opinion, e.g. "must be Next.js — that's what the team knows"}
- {…}

### Deadlines

- {Real or aspirational. With date.}

### Mandatory integrations (V1)

- {Service the product must talk to from day one}
- {…}

### Budget / team

- {Solo / small team / larger; funding model}

### Open-source posture

- {Open / source-available / proprietary}

### Anti-patterns — what this product is NOT

The most load-bearing constraint for AI agents. Every line is a wall against scope creep.

- ❌ This is NOT trying to be {X}.
- ❌ This is NOT trying to be {Y}.

> Example:
> - ❌ This is NOT trying to be a Notion clone — no databases, no embed blocks, no nested pages.
> - ❌ This is NOT trying to be Slack — no chat, no channels, no DMs.
> - ❌ This is NOT trying to be enterprise project management — no Gantt charts, no sprint planning, no RACI matrices.

---

## Revision log

> Append-only record of deliberate PRD changes. Newest at the top. Each entry corresponds to one `/prd-revise` pass.

### {{DATE}} — Initial PRD

**Triggered by:** `/prd-grill` (project kickoff)

**Drift addressed:** N/A (initial draft)

**Updates applied to PRD:**
- All sections drafted from interrogation across user / problem / capabilities / non-goals / success metrics / constraints

**Carried forward:**
- {Open questions the user wanted to defer, with revisit deadline}
