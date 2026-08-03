---
name: architecture-md-builder
description: Create, scaffold, or upgrade a project's ARCHITECTURE.md file — the system-design source-of-truth that captures stack decisions, data model, service boundaries, cross-cutting concerns, and the rationale behind each. Use when the user wants to commit to an architecture before writing code, document the system shape for future-self and AI agents, scaffold a new project's design after the PRD is written, or harden a vague existing ARCHITECTURE.md. Triggers on requests like "create an ARCHITECTURE.md", "design the system", "decide the stack", "lock in the schema", "scaffold the architecture", "what should the data model look like", or any architecturally-loaded planning work that should happen before /backlog-triage produces specs.
---

# ARCHITECTURE.md Builder

Your job is to produce a `docs/ARCHITECTURE.md` file that is specific enough to actually constrain implementation. A vague ARCHITECTURE.md is worse than none — it gives false confidence while specs drift toward incompatible choices.

The work is mostly interrogation, like `design-md-builder`. Anyone can copy a stack template; your value is pushing the user past their first answer until they've decided something an executor can act on without re-asking.

## Operating principle

When the user gives a vague answer, push back with specifics. Examples:

- User says "Postgres" → ask which flavor and host: managed (Neon, Supabase, RDS), self-hosted, edge (Turso, PlanetScale). Each has different operational and consistency properties.
- User says "we'll use Stripe for payments" → ask which integration shape: Checkout (hosted), Elements (embedded), Connect (multi-party). Each has different data flow and webhook surface.
- User says "auth with Clerk" → ask which session model: short-lived JWTs only, or long-lived sessions with refresh; whether organizations are needed; SSO scope.
- User says "we'll cache things" → ask what (queries, page output, computed values), where (in-process, Redis, edge), and the invalidation model (TTL, tag-based, manual).
- User says "REST API" → ask the resource shape, auth scheme, error envelope, pagination style, idempotency strategy. "REST" alone doesn't constrain anything.

If the user resists specificity after two pushes, accept their answer, note it as deferred in the **Trade-off log**, and move on. Don't be precious.

## Phase 0 — Diagnose

First, check the project state. Three things matter:

1. **PRD exists.** Read `docs/PRD.md`. If it's missing or still has `{{PLACEHOLDER}}` markers, STOP — architecture without product context produces wrong choices. Tell the user to fill in the PRD first.
2. **`docs/ARCHITECTURE.md` already exists.** Three sub-states:
   - **No file.** Greenfield. Run the full interrogation.
   - **File exists, vague.** Read it, identify which sections are too generic to act on (e.g. "uses Postgres" with no host or schema), run interrogation only on those.
   - **File exists, specific.** Confirm with the user what they want changed. Don't rewrite what isn't broken.
3. **Existing code in the repo.** Look at `package.json`, lockfiles, top-level folders. If a stack is already partially in place, treat those as **constraints**, not blank-slate decisions. Capture them in Phase 1 verbatim.

## Phase 1 — Stack decisions

For each row, get a *named, specific* answer. "TBD" is acceptable but must be logged in the Trade-off log with the deadline by which it must be decided.

| Decision | Push past vague answers like... |
|---|---|
| **Language / runtime** | "TypeScript" → which Node version, ESM/CJS |
| **Framework** | "Next.js" → which router (App / Pages), version, rendering mode default |
| **Hosting / deploy target** | "Vercel" → fluid compute / edge / sandbox; preview-deploy strategy |
| **Database** | "Postgres" → host, version, connection pooler, branching strategy |
| **ORM / query layer** | "Drizzle" → migrations tool, schema location, transaction patterns |
| **Auth** | "Clerk" → session model, organizations, JWT vs cookie |
| **Payments / billing** | "Stripe" → integration shape, webhook handler location, customer model |
| **Storage / files** | "Vercel Blob" → public/private split, signed URL strategy |
| **Email / notifications** | "Resend" → transactional vs marketing split, templates location |
| **Background jobs / queues** | "Vercel Queues" → at-least-once acceptance, idempotency keys |
| **Search** | "Postgres FTS" → if scaled, what's the migration path |
| **Analytics / observability** | "PostHog + Sentry" → what's tracked vs sampled |

Capture stack decisions in the Trade-off log as you go: name the decision, name the alternative considered, name the reason chosen.

## Phase 2 — Data model

This is the most expensive section to get wrong. Push hard.

1. **Entities.** List every persisted entity. For each: a one-sentence purpose and the 3–7 fields that matter most.
2. **Relationships.** For each FK: cardinality (1:1, 1:N, N:M), ON DELETE behavior (cascade, restrict, set null), and whether soft-delete applies.
3. **Identity strategy.** UUIDs (which version), nanoids, sequential ints, or composite keys. Name the choice and why.
4. **Multi-tenancy model.** None, row-level (tenant_id column), schema-per-tenant, or DB-per-tenant. If the PRD implies multi-user-but-isolated, force this decision now.
5. **Soft-delete vs hard-delete policy.** Per-entity if mixed.
6. **Audit / history.** Which entities need change history, and where it lives (separate table, JSON column, event log).
7. **Time fields.** Standard `created_at` / `updated_at` / `deleted_at`? Timezone storage? Use `timestamptz` or `timestamp`?

End Phase 2 with an **entity diagram in Mermaid** inside ARCHITECTURE.md. Even if rough, the visual catches relationship mistakes prose hides.

## Phase 3 — Service shape and boundaries

For most projects this is a one-page section, but skipping it produces tangled code in month 3.

1. **Topology.** Monolith, modular monolith, or services. Default to modular monolith for solo / small-team projects unless there's a specific reason otherwise.
2. **Module boundaries** (within a monolith). Name 3–6 top-level modules and what owns what. For each: which entities it owns, which APIs it exposes, who can call it.
3. **API style.** REST, RPC, GraphQL, server actions, or a mix. If a mix, map which clients use which style and why.
4. **API conventions.** Resource naming, error envelope, pagination, idempotency, versioning. Pick once, document, stop bikeshedding.
5. **Internal vs external API split.** Which routes are public, which are admin-only, which are internal-only. Document the auth boundary at each.

## Phase 4 — Cross-cutting concerns

These don't belong to any one feature spec, so without ARCHITECTURE.md they get reinvented per-spec inconsistently.

1. **Auth & authorization.** Who can do what. Role model (none, simple roles, RBAC, ABAC). Where checks live (middleware, route handlers, query layer).
2. **Error handling.** Error class taxonomy (validation, auth, not-found, conflict, server). How they surface to clients. Logging behavior per class.
3. **Logging / structured events.** What's logged at each level. PII handling. Where logs go.
4. **Observability.** Tracing (none, OpenTelemetry, vendor). Metrics. Alerts.
5. **Caching.** Where, what's cached, TTL/tag strategy, invalidation rules. If "no caching for V1," log that as the decision.
6. **Rate limiting.** Per-route, per-user, global. Backend (in-memory, Redis, edge).
7. **Secrets management.** Where they live, how they're rotated, how they're injected (env, KMS, secret manager).
8. **Background work / scheduled tasks.** Where they run, how failures are handled, how observability works.
9. **Testing strategy.** Unit, integration, e2e split. What's mocked vs real (esp. database — see project's CLAUDE.md feedback memories on this).
10. **Migration & deploy strategy.** How schema changes roll out (forward-only, expand-contract, dual-write). Rollback story.

## Phase 5 — Evolution: what we're betting on, what's deferred

A good ARCHITECTURE.md ages well because it admits what's provisional.

1. **Reversibility map.** For each major decision, mark `easy` / `medium` / `hard` to reverse. The hard-to-reverse ones are where you should have spent the most thought.
2. **Bets we're making.** "We're betting users won't exceed 10k rows per tenant" — explicit, falsifiable. Include the trigger that would force a redesign.
3. **Deferred decisions.** Things you intentionally pushed off, with the deadline by which they must be revisited (usually a phase boundary in `docs/ROADMAP.md`).
4. **Known wrong choices we're shipping anyway.** Anti-pattern but honest. Documenting it prevents the "why did we do this" archaeology in 6 months.

## Phase 6 — Trade-off log

Append-only section at the bottom of ARCHITECTURE.md. Every entry: date, decision, alternatives considered, reason chosen, links to relevant specs/PRs if available.

This is the single highest-leverage section. Future-you (or the AI working on month-3 code) reads this to understand *why* the architecture is shaped the way it is. Without it, every architectural choice gets re-litigated under uncertainty.

## Phase 7 — Write the file

Use `references/template.md` as the structural target. Fill it with the decisions made above. Do not invent values for sections the user didn't decide; either ask or write `**Deferred** — see Trade-off log entry [date]`.

Save to `docs/ARCHITECTURE.md`. After writing:

1. Print a summary of major decisions (one line each).
2. List any sections marked Deferred with their revisit deadline.
3. Suggest the user run `/backlog-triage` on any pending Inbox items now that ARCHITECTURE.md exists — triage is much sharper with architecture context.

## Reference files

- `references/template.md` — the canonical structure to fill in.
- `references/examples.md` — worked ARCHITECTURE.md files for two project shapes (a SaaS app, a content site) for inspiration.

## What NOT to do

- **Don't write code in ARCHITECTURE.md.** Schemas yes (as DDL or Mermaid). Implementation no.
- **Don't make decisions the user hasn't ratified.** If you're guessing, ask.
- **Don't gold-plate.** A V1 architecture document is short and decisive, not exhaustive. If you're writing 50 pages on something with 200 users, you're procrastinating.
- **Don't skip the Trade-off log.** It's the part with the most long-term leverage.
- **Don't proceed without the PRD.** Architecture without product context is theatre.
