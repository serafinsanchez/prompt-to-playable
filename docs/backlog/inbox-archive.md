# Inbox archive

Triaged and resolved inbox items, newest first. Original bodies preserved for provenance.

### [x] triaged → Phase 0 #1 TASK-02: Scaffold app shell with DESIGN.md tokens and deploy
**Description:** Next.js App Router + Tailwind v4 project; fonts (Bricolage Grotesque, IBM Plex Sans/Mono) and full `@theme` token set from DESIGN.md in `app/globals.css`; deployed to Vercel with a token-styled placeholder page.
**Acceptance criteria:**
- [ ] `npm run dev/lint/typecheck/test` all run; `scripts/check-tokens.sh` passes
- [ ] Vercel production URL serves the placeholder styled entirely from tokens
**Priority:** P0
**Phase:** P0

### [x] triaged → Phase 0 #2 TASK-03: Typed Meshy client + pipeline state machine (`lib/meshy/`)
**Description:** Isomorphic typed client (v2 text-to-3d, v1 rigging/animations/remesh/balance) with swappable transport; state machine for preview → refine → rig → animate×5 with ~4s polling, per-stage credit tracking, and `localStorage` resume. Fixture transports per `claude-code-resources/print-pipeline.fixtures.ts` pattern.
**Acceptance criteria:**
- [ ] Vitest covers: happy path, stage failure, `RateLimitExceeded`, `NoMoreConcurrentTasks`, resume-from-storage
- [ ] Same module importable from both the app and a Node script
**Priority:** P0
**Phase:** P0

### [x] triaged → Phase 0 #3 TASK-04: Meshy passthrough proxy (`app/api/meshy/[...path]`)
**Description:** Path-allowlisted passthrough; rewrites `x-meshy-key` → `Authorization: Bearer`; `no-store`; passes Meshy error bodies through untouched; `{ proxyError }` only for its own failures. No logging of keys.
**Acceptance criteria:**
- [ ] Test-mode key completes a task round-trip through the proxy
- [ ] Non-Meshy paths rejected; missing key → clean 401
**Priority:** P0
**Phase:** P0

### [x] triaged → Phase 0 #4 TASK-05: Day-0 spike — full pipeline + 5-clip merge validation
**Description:** Run one biped prompt through the real pipeline via the typed client; bind all 5 animation clips to the rigged skeleton in a minimal R3F harness. THE de-risk gate for the whole build (ARCHITECTURE §5 bets). Check credit balance against gallery plan while at it.
**Acceptance criteria:**
- [ ] 5 clips play on one skeleton in the harness, OR fallback ladder invoked and logged in ARCHITECTURE Trade-off log
- [ ] Remesh-stage and controller-library deferred decisions resolved and logged
- [ ] Credit budget confirmed or credit-request email sent
**Priority:** P0
**Phase:** P0

### [x] 2026-08-03 TASK-01: Define ROADMAP and phase files
**Description:** Add `docs/ROADMAP.md` and split backlog into phase files matching your delivery plan.
**Priority:** P0
**Resolution:** Bootstrap scaffolding — done via `prd-grill` → `architecture-md-builder` → `design-md-builder` → ROADMAP, 2026-08-03.
