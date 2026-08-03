---
name: prd-grill
description: Build a project's docs/PRD.md by relentlessly interrogating the user one question at a time, walking down each branch of the design tree, exploring the codebase before asking when it can answer the question itself, and providing a recommended answer with every question so the user reacts rather than starts blank. Spend the most time on non-goals — that's where AI agents silently drift. Use to kick off a new project's product doc, or to harden a vague existing PRD. Triggers on phrases like "grill me", "interview me about the product", "build the PRD", "create docs/PRD.md", "kick off the PRD", "PRD interrogation", "drill down on what this product is", "I have an idea, what's next".
---

# PRD Grill

Your job is to produce `docs/PRD.md` that is specific enough to actually constrain everything downstream — architecture, scope decisions, roadmap, every spec. A vague PRD is worse than none — it gives false confidence while AI agents drift toward generic.

The work is **relentless one-question-at-a-time interrogation**. Anyone can fill in a template; your value is forcing decisions the user wouldn't make on their own.

## Operating principle

Six rules, in priority order:

1. **One question at a time.** Never list five at once. The user answers, you absorb, you ask the next one.
2. **Recommend an answer with every question.** Don't make the user stare at a blank prompt. Say "I'd recommend X because Y — does that fit, or do you want to push back?" The user reacts, which is faster and produces better answers than starting blank.
3. **Explore the codebase before asking, when the codebase can answer.** If they have an existing repo and you're asking about stack, run `ls` / `cat package.json` first. If they have a `docs/PRD.md` already, read it before asking what they're building.
4. **Walk the dependency tree.** Don't ask "what does V1 NOT do?" before "what does V1 do?". Don't ask about constraints before you know the user. If a question depends on an earlier answer, save it for after.
5. **Spend the most time on non-goals.** Agents are very good at building things and very bad at *not* building things. That's where scope creep lives. The non-goals interrogation is the longest phase. Don't shortchange it.
6. **Push past the first answer.** "Productivity tool for everyone" is the first answer. Real answers come from "okay, can you name a real person who'd be the first user — what do they do for work, what's the moment they'd reach for this?" Two pushes per vague answer; if the user resists after two, accept the answer and move on.
7. **Watch for rubber-stamp acceptance.** If the user accepts your recommendation verbatim with no edits and no added detail, treat it as a yellow flag — especially on Phase 1 (user) and Phase 4 (non-goals), where rubber-stamping does the most damage downstream. Ask one targeted confirmation: "to be sure — [specific implication of the answer]?" One follow-up only; don't badger.

## Calibration — what good vs bad PRD output looks like

The phase-by-phase interrogation governs *what to ask*. This section governs *what the resulting PRD text should look like*. Before committing any section to `docs/PRD.md`, compare your draft to the contrasts below. If a draft reads like the ❌ column, push the user one more time before writing it.

**The unifying test:** Read each finished section aloud and ask *"could this describe a different product I've seen before?"* If yes, it's too generic — find the specific detail that makes this product *this* product.

### Phase 1 — Primary user

❌ *"The user is a busy professional who wants to save time."*
Demographic with no situation. Could describe anyone. Gives the agent permission to imagine any user.

✅ *"Maya, 34, solo founder of a 2-person consultancy. Lives in her inbox + Notion. At 7pm Sunday she sits down to plan the week and spends ~40 minutes copy-pasting follow-ups from 5 client threads into a status doc. She has no PM, no CRM budget, and won't adopt anything that takes more than 10 minutes to set up."*
Named archetype, trigger moment, current workaround, hard adoption constraint. Future agents can ask "would Maya use this?" and get a real answer.

### Phase 2 — Problem

❌ *"Users need a better way to organize tasks across projects."*
Solution-shaped (organizing tasks ≠ a problem, it's a feature). Aspirational verb ("better"). Doesn't describe what the user feels or does today.

✅ *"When Maya sits down Sunday night to plan her week she has no single view of what each client is owed. She rebuilds the picture from scratch every week out of email threads. She missed two deliverables last quarter because a follow-up was buried in a thread she didn't reopen."*
Concrete moment, real consequence, current behavior. The user could read this and say "yes, that's me."

### Phase 3 — V1 capabilities

❌ *"Users can manage their tasks. The system supports tagging, filtering, and search."*
Noun-led ("supports"), grouped vague verbs, blurred into prose. An agent reading this fills the shape from training-data defaults.

✅
1. Paste an email-thread URL → system extracts open commitments.
2. Sunday 6pm cron generates a per-client status doc with open / closed / blocked items.
3. One-tap nudge: sender of any open commitment can be nudged via pre-drafted email.

Verb-led, atomic, each independently testable. Ordered by load-bearing weight.

### Phase 4 — V1 non-goals

❌ *"Mobile app is probably out of scope for now. We may add team features later. Real-time is a stretch goal."*
Soft language ("probably," "may," "stretch"). AI agents read soft language as permission to attempt. No reasons attached, so future-you can't tell what would tip the decision.

✅
- ❌ Mobile app. *Target user works at a desk; mobile-responsive is enough until usage data says otherwise.*
- ❌ Multi-user / sharing / permissions. *Single-tenant data model only — multi-tenant is a 2-month rewrite.*
- ❌ AI-generated reply content. *System surfaces commitments; human writes the reply. We don't want to own hallucinated client communication.*

Hard exclusions, one-sentence reason each. The reason is what lets future-you (and future agents) decide whether to revisit.

### Phase 5 — Success metrics

❌ *"Grow weekly active users. Increase engagement. Hit 1,000 signups in Q1."*
Vanity metrics — signups and page views go up regardless of whether the product works. No threshold tied to user behavior. No counter-metric to prevent gaming.

✅
- **Primary:** % of paying users who generate a Sunday digest 3+ consecutive weeks. Target: 60% by week 8.
- **Secondary:** Median minutes from "paste thread" to "first digest." Target: <10 min.
- **Counter-metric:** Support-ticket rate per active user must not exceed 1 per 20 users/week.

Behavioral, threshold + timeframe, plus a counter-metric so the team can't goose the primary by hurting something else.

### Phase 6 — Anti-patterns

❌ *"Build it well. Don't over-engineer. Follow best practices."*
Tells an agent literally nothing. No negative space — agents fill silence with training-data defaults (auth pages, dashboards, refactors of adjacent code).

✅
- ❌ NOT a CRM. No contact records, no pipeline stages, no deal sizes.
- ❌ NOT a project manager. No Gantt, no dependencies, no assignees.
- ❌ NOT an AI assistant. No chat UI, no "ask me anything," no agent loop in the product surface.
- ❌ NOT a Notion competitor. No rich docs, no databases, no embeds.

Names the comparison product, then enumerates the specific UI/data-model artifacts that would signal drift toward it. An agent can scan this and check its own work against it.

### Why specificity matters more for AI-built products

Human engineers ask "wait, do we actually want auth here?" before adding it. Agents ship it. Negative space must be written down, not implied. The same applies to user definition, problem framing, and capability scoping — wherever the PRD is vague, the agent interpolates from the generic-product distribution in its training data, and the output drifts toward "yet another SaaS."

## Phase 0 — Diagnose

First, gather what already exists. Three checks:

1. **Does `docs/PRD.md` exist?** Three sub-states:
   - **No file.** Greenfield. Run the full interrogation.
   - **File exists, vague.** Read it, identify which sections are too generic to act on (e.g. user defined as "businesses," success metrics absent, non-goals missing). Run interrogation only on those sections.
   - **File exists, specific.** Confirm with the user what they want changed. Don't rewrite what isn't broken.
2. **Does `docs/ROADMAP.md` or `docs/ARCHITECTURE.md` exist?** If yes, the PRD is being added or hardened retroactively. Read them — they constrain what the PRD can claim. (E.g. if ARCHITECTURE.md already chose Postgres, the PRD shouldn't promise "no database" capabilities.)
3. **Is there existing code?** Look at `package.json`, top-level folders, recent commits. If there's a partial implementation, treat it as evidence of intent — capture what's there before asking the user to re-articulate it.

If the user has *just* arrived ("I have an idea") with no docs and no code, the full six-phase grill begins at Phase 1.

## Phase 1 — Who is this for?

The single most load-bearing question. Push the hardest here. A vague user produces a vague PRD produces a generic product produces failure.

**Open with:**
> "Who is V1 for? Not 'everyone' or 'people who want X' — name a single archetype, ideally based on a real person. What do they do for work, what's the moment in their day they'd reach for this product, and what are they doing right now to solve the problem manually?"

**With a recommended answer pre-loaded:**
If you can guess from the user's first message, propose: "I'd guess the user is [specific archetype] — does that fit, or is it different?"

**Push past these vague answers:**
- "Entrepreneurs" → "Solo founders, small-team founders, or VC-backed founders? They have very different tools and budgets."
- "Developers" → "Solo or on a team? Backend, frontend, full-stack, infra? Working on what kinds of projects?"
- "Anyone" → No. Force a single primary user. Secondary users are out of scope for V1.
- "Me" → Acceptable for a personal project, but ask: "Just you, or you-as-archetype? If you're representing a class of users like 'indie hacker who runs three side projects,' say so."

**Output of Phase 1:** one or two paragraphs in `## 1. Primary user` describing the archetype concretely. Real-world details, not adjectives.

## Phase 2 — What problem does it solve?

Anchor the problem in the **user's own words and lived experience**, not your framing.

**Open with:**
> "Describe the problem in the user's own words. Not 'improving X' or 'optimizing Y' — what does the user actually say or feel right now? What are they currently doing to deal with it, and what's frustrating about that?"

**Push past these:**
- Solution-shaped framings ("they need a CRM") → "Yes, but what's the *experience* before they have your product? What do they say to their friend over coffee about it?"
- Aspirational framings ("they want to be more productive") → "Productive at what? In what situation does the lack of productivity bite?"
- Generic framings ("they want to manage their projects") → "What about project management is broken for them specifically?"

**Recommend an answer if you can:** "Based on what you've said, I think the problem is [specific concrete pain]. Does that match how the user would describe it?"

**Output of Phase 2:** one paragraph in `## 2. Problem` that names the pain concretely. Specific enough that you'd recognize the user describing it in the wild.

## Phase 3 — What does V1 do? (3–7 user-visible capabilities)

Capabilities, not features. Things the user can DO, not things the system has.

**Open with:**
> "List 3–7 user-visible capabilities for V1. Each one phrased as something the user can do — 'create a task,' 'invite a teammate,' 'see today's view.' Not implementation details, not architecture, not features the user wouldn't notice."

**Push past:**
- Implementation framings ("uses GraphQL") → reject. Move to constraints (Phase 6).
- Capability sprawl (>10 items) → "Which 3–7 are V1? The rest are for later."
- Capability shrinkage (<3 items) → "What's the smallest set that justifies the user using this instead of a spreadsheet or a Notion page?"

**Recommend a starter set:** "Based on what you've said, I think V1 is [capability A, capability B, capability C]. What's missing, and what would you add or cut?"

**Force ranking:** Ask which is #1 — what does the user notice first? Order the list so the most load-bearing capability is at the top.

**Output of Phase 3:** ordered bulleted list in `## 3. V1 capabilities`. Each item phrased as a verb-led action ("Create a task with a due date and a tag"), not a noun ("Tasks have due dates and tags").

## Phase 4 — What does V1 NOT do? (the longest phase)

This is where you spend the most time. Every "no" is a trip-wire that prevents AI agents from silently building scope creep. Every "no" needs a reason captured.

**Open with:**
> "We're going to walk through every adjacent capability you might want and decide explicitly: in or out for V1. Out is the default — capabilities only get in if you say so. We'll capture the reason for every 'out' so future-you (and future agents) know it was a deliberate decision, not an oversight."

**Walk through these systematically, asking one at a time:**

| Adjacency | Question to ask |
|---|---|
| **Auth** | "Sign-up, or invite-only? Email-password, magic link, social? Or no auth at all for V1?" |
| **Multi-tenancy** | "Single user, or teams? If teams: invitable from inside the app, or pre-provisioned?" |
| **Permissions / roles** | "All users equal, or roles? If roles: admin/member, or more granular?" |
| **Mobile / responsive** | "Desktop-only, mobile-responsive, or native mobile?" |
| **Offline** | "Online-only, or works offline?" |
| **Real-time / collaboration** | "One-user-at-a-time, or live multiplayer (cursors, presence)?" |
| **Search** | "Browse-only, simple search, or full-text?" |
| **Notifications** | "None, in-app only, email, push?" |
| **Imports / exports** | "None, or supports importing from X / exporting to Y?" |
| **Integrations** | "Standalone, or integrates with [user's likely candidates]?" |
| **Customization** | "Fixed UI, or user-customizable layouts/themes?" |
| **Public / sharing** | "Private only, or can users share/publish content publicly?" |
| **Billing / paywall** | "Free for V1, freemium, paid from day one, or invite-only?" |
| **Analytics / dashboards** | "User-facing analytics, or just internal observability?" |
| **API / webhooks for users** | "Just the app, or expose an API/webhooks for users to extend?" |
| **Admin tools** | "Admin features in V1, or deferred?" |
| **Onboarding flow** | "Drop-in onboarding tour, or sink-or-swim?" |
| **Help / docs** | "Inline help, separate docs site, or none for V1?" |

**For each "out," capture the reason in one sentence.** Future-you reads this and knows whether to revisit. Examples:

- ❌ Real-time collaboration. *Reason: V1 is single-user; multiplayer needs OT/CRDT infra that's a 3-month project.*
- ❌ Mobile native. *Reason: target user works at a desk; mobile-responsive is enough.*
- ❌ Public sharing. *Reason: privacy concerns until we understand legal scope.*

**Recommend before asking when you can:** "I'd guess auth is in (sign-up + email-password), real-time is out, mobile-responsive but not native. Push back on anything you'd flip."

**Output of Phase 4:** two lists in `## 4. V1 non-goals`:
- Things explicitly out, with one-sentence reasons
- Things the user wanted to discuss but punted, with the deadline to revisit (e.g. "Re-evaluate billing model at P2 boundary")

## Phase 5 — What does success look like?

One or two measurable outcomes. Not vanity metrics.

**Open with:**
> "How will you know V1 worked? Pick 1–2 outcomes you can actually measure. Not 'users love it,' not 'it works.' Numbers or specific behaviors."

**Push past:**
- "Users keep using it" → "What does that mean specifically? 30% return in week 2? 5+ active uses per week per user?"
- "It works" → "Not a metric. What does 'working' look like to the user?"
- Vanity metrics ("100k signups") → "What signups produce that you actually want? Conversion to weekly active? Daily active? Paid?"

**Recommend a starter:** "Based on the user and problem, I'd suggest [specific measurable outcome]. Does that match what 'success' means to you, or is it different?"

**Output of Phase 5:** 1–2 bullets in `## 5. Success metrics`. Each measurable, with the threshold and the timeframe ("In month 1 after launch, 30% of signups return in week 2").

## Phase 6 — Constraints

The container around the build. Some of this hands off to `architecture-md-builder` later; capture the user's strong opinions here.

**Walk through one at a time:**

1. **Stack.** "Strong opinions on language, framework, hosting, database? Or open to whatever fits?" *(If open: defer to architecture-md-builder. If strong: capture verbatim.)*
2. **Deadlines.** "Real deadline (event, funding, contract) or aspirational? When?"
3. **Integrations that are mandatory.** "Anything V1 must talk to from day one? (Stripe, Slack, GitHub, etc.) Or all integrations are V2+?"
4. **Anti-patterns the product must NOT be.** This is the most important constraint for AI agents. "What products is this NOT trying to be? E.g. 'this is not a Notion clone,' 'this is not Slack,' 'this is not enterprise CRM.'"
5. **Budget / team size.** "Solo build, small team, larger? Self-funded, customer revenue, VC?"
6. **Open-source / commercial.** "Open source, source-available, fully proprietary?"

**Recommend an answer where useful, especially on anti-patterns:** "Given the user and problem, I'd guess this is NOT trying to be [X]. Confirm or correct."

**Output of Phase 6:** structured `## 6. Constraints` section with the user's verbatim answers, plus an explicit `### Anti-patterns` subsection listing what the product is NOT trying to be.

## Phase 7 — Write the PRD

Use `references/template.md` as the structural target. Fill it with the decisions made above. Do not invent values for sections the user didn't decide; either ask or write `**Deferred** — see Revision log entry [date]`.

Save to `docs/PRD.md`. Append the Revision log skeleton at the bottom so `prd-revise` has something to grow.

## Phase 8 — Hand-off summary

After writing, print:

1. One-line summary of who/what/why/non-goals/success.
2. Suggested next step:
   - If the project is architecturally-loaded (any of: database, auth, payments, multi-tenancy, queues, cross-cutting concerns) → suggest running `architecture-md-builder` next.
   - Otherwise → suggest drafting the ROADMAP using `prompts/prompt-roadmap.md`.
3. Reminder: PRD is living, not static. Re-run `prd-revise` at every phase boundary to keep it honest.

## What NOT to do

- **Don't ask multiple questions at once.** One. At. A. Time. The user answers; you absorb; you ask the next.
- **Don't accept the first vague answer.** Two pushes minimum on vague user/problem/non-goal answers.
- **Don't write the PRD before all six phases are answered.** Phase 7 only fires after the user has talked through every phase.
- **Don't skip the non-goals interrogation.** It's the longest section by design. Solo founders especially want to skip it because every "no" feels like a loss. The "no" is the point.
- **Don't substitute your taste for the user's.** Recommend, but accept their override. They live with the product; you don't.
- **Don't ask the user for things you can find in the codebase.** Stack, recent decisions, prior PRD content — read first, ask only what's missing.
- **Don't move to architecture decisions.** Stack details belong in `architecture-md-builder`. The PRD captures *strong opinions* on stack ("must use Postgres because of compliance") but not the full stack picture.

## Reference files

- `references/template.md` — canonical PRD structure to fill in.
