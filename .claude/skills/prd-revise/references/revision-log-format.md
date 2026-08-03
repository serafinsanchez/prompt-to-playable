# PRD Revision log — skeleton and format

Append-only section at the bottom of `docs/PRD.md`. One entry per `/prd-revise` pass. Newest entries at the top.

If the PRD doesn't have a Revision log section, add this skeleton just before any final references:

```markdown
---

## Revision log

> Append-only record of deliberate PRD changes. Newest at the top. Each entry corresponds to one `/prd-revise` pass.
```

## Entry format

```markdown
### YYYY-MM-DD — short title (e.g. "Phase 1 revision pass" or "post-architecture decision")

**Triggered by:**
- phase boundary | trade-off log entry | user-noticed drift | cadence

**Drift addressed:**
- A1 — Reaction emoji on tasks shipped (P0 #4) without PRD entry → added to PRD §3 as a P1 capability
- B2 — "Public shareable profile" in PRD §3 has no spec → moved to PRD §6 (non-goals) for V1
- C1 — PRD claimed instant signup, Clerk requires verification → updated PRD §3 to "email-verified signup"

**Updates applied to PRD:**
- §3 (V1 capabilities) — added "Reaction emoji on tasks"
- §3 (V1 capabilities) — clarified signup as "email-verified"
- §6 (Non-goals) — added "Public shareable profile pages (deferred to post-V1)"

**Related actions:**
- Filed INBOX-23 to revisit shareable profile in roadmap planning post-V1
- Updated `docs/ROADMAP.md` P1 to reflect verified-signup as the canonical flow

**Carried forward (not addressed this pass):**
- B5 — "Bulk import" in PRD §3 — no spec yet, but user wants to keep the goal; revisit at P2 boundary
```

## Worked example

```markdown
### 2026-05-12 — P1 revision pass

**Triggered by:**
- phase boundary (P1 just shipped)

**Drift addressed:**
- A1 — Email digest shipped (P1 #6) but PRD only mentioned "notifications" generically → PRD §3 now names the digest specifically
- B3 — PRD §3 listed "in-app onboarding tour" but no spec exists, no phase row → moved to non-goals for V1, will revisit if user-research signal emerges
- C2 — PRD assumed in-process queue; ARCHITECTURE.md §6 chose Vercel Queues → PRD success metrics around delivery latency relaxed from "<5s" to "<60s p95"

**Updates applied to PRD:**
- §3 — replaced "notifications" with "weekly email digest + in-app inbox"
- §3 — removed "in-app onboarding tour"; §6 added it under non-goals
- §5 — relaxed delivery-latency success metric

**Related actions:**
- None (all changes are PRD-internal)

**Carried forward:**
- A4 — Admin dashboard route (P1 #9) shipped but PRD never mentioned admin features. User wants to think about this more before deciding whether admin is in PRD scope or a separate product surface. Revisit next pass.
```

## What the log is for

- **Future you in 6 months** can read it and reconstruct the product's evolution.
- **Future agents** working on the project can see why the PRD says what it says.
- **Triage** can refer back to revision-log entries when an inbox item looks like a re-surfacing of something already decided.

## What it isn't

- Not a changelog of shipped features (that's the backlog / git log).
- Not a strategy document (it captures decisions, not direction).
- Not a place to argue. Each entry is past tense. If you disagree with an old entry, write a new one that supersedes it.
