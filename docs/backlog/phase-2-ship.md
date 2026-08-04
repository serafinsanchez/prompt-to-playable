# Phase 2 — Polish + content + ship: the submission bundle

> Theme: P2 adds zero capabilities (ROADMAP §P2). Polish the signature moment, verify the budgets, then produce and submit the three deliverables. Triaged 2026-08-03 while P1 #8 (US-06) was in progress.

| # | Status | Kind | Item | Spec |
|---|--------|------|------|------|
| 1 | `[ ]` | ui | US-07: The signature stage-completion moment | [us-07-signature-completion-moment.md](../specs/us-07-signature-completion-moment.md) |
| 2 | `[ ]` | infra | TASK-07: Performance + accessibility budget pass | [task-07-perf-a11y-budget.md](../specs/task-07-perf-a11y-budget.md) |
| 3 | `[ ]` | infra | TASK-08: README as landing page + repo publish (repo already public under final name) | [task-08-readme-landing-publish.md](../specs/task-08-readme-landing-publish.md) |
| 4 | `[ ]` | infra | TASK-09: Demo video (2–3 min), ready to publish | [task-09-demo-video.md](../specs/task-09-demo-video.md) |
| 5 | `[ ]` | infra | TASK-10: Distribution plan + submission bundle | [task-10-distribution-submission.md](../specs/task-10-distribution-submission.md) |
| 6 | `[x]` | ui | US-08: Enlarge a stage's mesh artifact (lightbox) | [us-08-artifact-lightbox.md](../specs/us-08-artifact-lightbox.md) |
| 7 | `[x]` | ui | US-09: "Explore more in the API Playground" CTA on the completion card | [us-09-playground-cta.md](../specs/us-09-playground-cta.md) |

**Dependency notes:** #1 ← P1 #8 (US-06, in progress — shared `components/pipeline/` files, not parallel-safe with it). #6 ← #1 (shares `stage-rail.tsx` and `artifact-thumbnail.tsx` with the completion beat — sequence after, not alongside). #2 ← #1 and #6 (budget pass measures the final UI). #3 ← #1 (hero GIF shows the polished beat; README text can draft earlier). #4 ← #1 (recording waits for the beat; script/shot-list can draft earlier). #5 ← #2 + #3 + #4 (submission bundles everything). #3 and #4 are parallel-safe with each other (disjoint FILES TOUCHED: repo root docs vs. `docs/video/`); both can overlap #2 except where TASK-07 fixes touch components mid-recording.

**Human-owned steps flagged at triage:** #4 recording/editing/export; #5 cold-visitor sessions and the actual submission send. Agent side of those specs is the kit (script, shot list, captions, checklist, plan draft).

**Ordering intent:** #1 → #6 → #7 → #2 → (#3 ∥ #4) → #5, mirroring ROADMAP's polish → content → ship. #6 was added 2026-08-04 (brainstormed, not triaged from inbox) and belongs in the polish block with #1. #7 was added 2026-08-04 (brainstormed, not triaged from inbox); it touches `completion-actions.tsx`, so it is not parallel-safe with #1 (US-07) — sequence it in the polish block.
