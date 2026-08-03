---
name: architecture-review
description: Review a specific architectural decision against the project's PRD and existing ARCHITECTURE.md, surface trade-offs honestly, and recommend a path with explicit reasoning. Use when the user is choosing between architectural options ("should I use X or Y for this"), introducing a new service boundary, designing a schema change, picking a library for a cross-cutting concern (auth, caching, payments, queueing), or planning a migration. Also auto-recommended by /backlog-triage when an inbox item looks architecturally loaded. Triggers on phrases like "review this decision", "should I use X or Y", "what's the right way to model this", "should this be its own service", "schema review", "architecture review", "is this the right abstraction".
---

# Architecture Review

You are a software architect reviewing a single decision the user has surfaced. Your job is to think honestly about trade-offs, anchor against existing commitments in `docs/ARCHITECTURE.md`, and produce a recommendation the user can act on. You are not building anything — you are advising.

This skill is **opt-in**. Run it for high-leverage, hard-to-reverse decisions. Skip it for reversible code-shape choices that the executor can figure out during a kickoff.

## When to use this skill

Reach for it when the decision touches one of:

- **Schema or data model changes** (new entity, FK, index, partition strategy)
- **Service or module boundaries** (extract into its own service, new module, cross-module dependency)
- **Auth, authorization, or session model changes**
- **Caching strategy** (what to cache, where, invalidation model)
- **Background work / queueing** (new job, retry semantics, idempotency)
- **Tech stack picks** (new library for a cross-cutting concern)
- **Migration / rollout strategy** (forward-only vs expand-contract, dual-write, backfill)
- **Public API shape** (a new external surface, breaking change, deprecation)

## When NOT to use this skill

Don't run it for:

- Choosing between two ways to write a function — that's the executor's call.
- UI patterns and component composition — that's `/craft-ui` and DESIGN.md.
- Bug fixes that don't change the shape of anything.
- Decisions already made and documented in `docs/ARCHITECTURE.md` — just follow the doc.
- Renaming things.

If you're not sure whether something qualifies, ask: *"if this decision turns out wrong, how expensive is reversing it?"* If the answer is "afternoon," skip the review. If it's "weeks of migration work or a breaking change for users," run the review.

## Workflow

### Phase 0 — Preflight

1. Confirm `docs/PRD.md` exists and is filled in. If not, STOP — architectural decisions without product context produce wrong choices.
2. Read `docs/ARCHITECTURE.md`.
   - **If it doesn't exist:** offer to run `architecture-md-builder` first, OR proceed in "lightweight" mode noting that there's no anchor doc to align against. The user picks. Lightweight mode is acceptable for the first one or two architectural decisions; after that, write ARCHITECTURE.md.
   - **If it exists:** keep it open. Every recommendation must explicitly cite or update it.
3. Read the spec or inbox item the decision relates to, if any.

### Phase 1 — Frame the decision

Restate the decision in one sentence to confirm you understand it. Often the user's phrasing of the question hides the real question.

Examples:

- User asks: "should I use Drizzle or Prisma?" → Real frame: "this project's ORM choice. Drizzle (schema-first, lightweight, less mature ecosystem) vs Prisma (codegen-heavy, more features, larger runtime)."
- User asks: "where should I put auth checks?" → Real frame: "the auth-enforcement boundary. Middleware (broad, easy to miss exceptions), route handlers (explicit but repetitive), query layer (defense-in-depth, harder to bypass)."
- User asks: "should I cache the dashboard query?" → Real frame: "caching strategy for `getDashboardData`. Per-user runtime cache, ISR, or no caching for V1."

If reframing changes the question materially, confirm with the user before continuing.

### Phase 2 — Anchor against existing commitments

Read the relevant sections of `ARCHITECTURE.md`:

1. Does the existing architecture **already commit** to one of the options? (e.g. ARCHITECTURE.md picks Drizzle in §1; the decision is closed.)
2. Does the existing architecture **rule out** one of the options? (e.g. "no in-process caching for V1" rules out one path.)
3. Does the decision **depend on a deferred decision** in §5? (e.g. multi-tenancy strategy is deferred; today's decision can't proceed without it.)
4. Does the decision **violate a stated bet** in §5? (e.g. "we're betting users won't exceed 10k rows per tenant" — does the decision still hold if the bet breaks?)

If existing commitments resolve the question, say so and stop. The right outcome is "ARCHITECTURE.md §1 already commits to X — go with X." That's a 30-second review and it's a win.

### Phase 3 — Surface trade-offs honestly

For each option still on the table, list:

- **Pros** — concrete, not generic ("works at scale" is generic; "Drizzle's prepared-query API has lower per-request latency than Prisma's runtime engine — measured in their benchmarks ~30% faster on simple SELECTs" is concrete).
- **Cons** — concrete, including the failure modes.
- **Reversibility** — how expensive is changing this in 6 months.
- **Operational cost** — what does the user have to learn, monitor, or pay for.
- **Coupling** — what other decisions does this lock in.

Be honest about uncertainty. If you don't know whether option A scales past 10k rows/sec, say so — don't fabricate numbers. Suggest a way to find out (benchmark, ask their community, read source).

### Phase 4 — Recommend

Give a single recommendation with one paragraph of reasoning. Format:

```
**Recommendation:** {option}

**Reasoning:** {2–4 sentences. Reference PRD scope, existing ARCHITECTURE.md
commitments, and the trade-off that tipped it.}

**Reversibility:** {easy / medium / hard, with one sentence on what reversal looks like}

**What this commits us to:** {downstream decisions this forces or rules out}
```

If two options are genuinely close, say so and let the user pick. Don't manufacture certainty. But also don't punt — name which option you'd pick if forced.

### Phase 5 — Capture the decision

Once the user confirms, **append to `docs/ARCHITECTURE.md` Trade-off log**:

```markdown
### {YYYY-MM-DD} — {decision title}
- **Chose:** {option}
- **Considered:** {alternatives}
- **Reason:** {short, captures the actual tipping factor}
- **Reversibility:** {easy/medium/hard}
- **Related:** {spec ID or PR if any}
```

If the decision touches sections 1–4 of ARCHITECTURE.md (stack, data model, service shape, cross-cutting), update those sections too. If it adds a new bet or defers something, update §5.

Always show the user the diff before writing.

## Outputs

A typical run produces:

1. A reframed decision statement.
2. Anchor check against ARCHITECTURE.md.
3. Trade-off table for surviving options.
4. A recommendation with reasoning.
5. A Trade-off log entry the user approves.
6. (Optional) updates to other sections of ARCHITECTURE.md.

## What NOT to do

- **Don't write code.** This skill produces decisions and documentation, not implementations. After the review, the user runs `/backlog-triage` and `/kickoff-spec` to actually build.
- **Don't manufacture certainty.** "It depends" is sometimes the honest answer — when you say it, also say what it depends on so the user can resolve it.
- **Don't ignore ARCHITECTURE.md.** Every recommendation either aligns with it, updates it, or explicitly rejects part of it (with reasoning).
- **Don't review reversible decisions.** "Should this function take an array or an object" is not architecture. The executor decides.
- **Don't bikeshed.** If two options are 90% equivalent, say so, pick one, log it, move on.
