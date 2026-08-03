# Worked examples

Two example `ARCHITECTURE.md` excerpts to illustrate what "specific enough" looks like. These are **not** templates to fill in — they're samples to calibrate against.

---

## Example A — Solo SaaS (a small CRM-like app)

### 1. Stack (excerpt)

| Layer | Choice | Notes |
|---|---|---|
| Language / runtime | TypeScript on Node 24 LTS, ESM only | No CJS in this repo |
| Framework | Next.js 16 App Router on Vercel | Server Components default; `'use client'` only for interactivity |
| Database | Neon Postgres 16 with branching | One branch per Vercel preview; main is prod |
| ORM | Drizzle, schema in `db/schema.ts`, migrations in `db/migrations/` | Use `drizzle-kit push` only on local; CI runs migrations |
| Auth | Clerk, organizations enabled | Cookie sessions; JWT for backend-to-backend |
| Payments | Stripe Checkout (hosted), webhook handler at `/api/webhooks/stripe` | One Customer per org; no Connect for V1 |
| Storage | Vercel Blob, private by default with signed URLs (10 min TTL) | Public assets in `/public` only |

### 4. Cross-cutting (excerpts)

**Auth.** RBAC with three roles: `owner`, `admin`, `member`. Checks live in the query layer (Drizzle wrappers in `lib/db/queries.ts`); route handlers trust the queries. Public routes are explicitly enumerated in `proxy.ts`.

**Error handling.** Five classes: `ValidationError`, `AuthError`, `NotFoundError`, `ConflictError`, `ServerError`. All surface as `{ error: { code, message, fields? } }`. Server logs include `requestId`; response envelope includes `requestId` so support can correlate.

**Database in tests.** Real Postgres via Neon dev branch. No mocking. Slower but catches migration bugs that mocks miss. (See CLAUDE.md feedback memory: "got burned last quarter when mocked tests passed but the prod migration failed.")

### 5. Evolution

**Bet:** users won't exceed 50k contacts per org for the first 12 months. **Revisit if:** any single org crosses 25k contacts; pagination and search will need indices we don't have.

**Deferred:** full-text search across notes. Using `ILIKE` for V1. Revisit at P3 (post-launch) — likely Postgres FTS, possibly Typesense if we cross 100k notes.

### 6. Trade-off log (excerpt)

#### 2026-04-12 — Auth provider
- **Chose:** Clerk
- **Considered:** Auth.js (free, more code), Supabase Auth (couples us to Supabase), build-our-own (no)
- **Reason:** organizations + SSO out of the box; we'll need both within 6 months
- **Reversibility:** medium — user data is exportable but org/role mapping would need migration
- **Related:** P0 #2

---

## Example B — Static content site (a docs / marketing site)

### 1. Stack (excerpt)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Astro 5, content collections | Markdown for prose, MDX where components are needed |
| Hosting | Vercel, fully prerendered | No DB, no functions for V1 |
| Search | Pagefind (build-time index) | No server search; revisit if index >5MB |
| Analytics | Plausible | Self-hosted EU instance |

### 2. Data model

No persistent data store. Content lives as Markdown in `content/` directories, validated by Astro content collections schemas. Author/tag metadata lives in frontmatter.

### 3. Service shape

Single static deploy. No API surface. No backend.

### 4. Cross-cutting (excerpts)

**Auth.** None. Site is fully public.

**Error handling.** Astro 404 + 500 pages. No structured errors.

**Caching.** CDN does it. No app-layer cache.

**Testing.** Build-time only. No runtime tests beyond link-checking.

### 5. Evolution

**Bet:** content stays small enough that build time stays under 60s through V1. **Revisit if:** build crosses 5 minutes; consider incremental builds via Astro's content layer.

**Deferred:** comments. Considered Giscus (GitHub-backed) and Cusdis (privacy-friendly). Not shipping for V1 — revisit at 6-month mark based on engagement.

---

## What both examples have in common

- **Specific products named.** Not "Postgres," but "Neon Postgres 16 with branching."
- **Integration shape stated.** Not "Stripe," but "Stripe Checkout (hosted), webhook at `/api/webhooks/stripe`."
- **Trade-offs surfaced.** Reasons logged so future-you doesn't re-litigate.
- **Bets made explicit.** With concrete triggers to revisit.
- **No code.** Schemas yes (DDL or Mermaid). Implementation no.
- **Concise.** Each is ~5–8 pages. Long ARCHITECTURE.md is procrastination.

## Common mistakes

- **Listing technology categories without committing** ("we'll use a database, an auth provider, and a payment processor"). Useless.
- **Documenting code, not decisions.** ARCHITECTURE.md isn't an API doc.
- **No Trade-off log.** Decisions without rationale rot fast.
- **Ignoring the PRD.** Architecture without product context produces wrong choices.
