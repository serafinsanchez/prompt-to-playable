# Architecture — Prompt to Playable

> Source of truth for system shape, stack decisions, data model, and cross-cutting concerns. Read before triaging architecturally-loaded specs. Append to the Trade-off log when material decisions change.
>
> **Slim by design.** This is a 3-day, no-database, no-auth demo; the one architecturally load-bearing area is the Meshy pipeline orchestration (§3–§4). Companion reference for API behavior: `../../claude-code-resources/MESHY_CLAUDE.md` (v1/v2 split, task model, credits, gotchas).

**Last updated:** 2026-08-03
**Status:** Frozen for V1

---

## 0. Context

See `docs/PRD.md`. Browser demo for indie web-game devs: text prompt → Meshy pipeline (preview → refine → rig → animate) → playable third-person character. Pre-generated gallery gives instant payoff; BYO Meshy API key unlocks live generation. No accounts, no persistence beyond the visitor's browser.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language / runtime | TypeScript, Node 20+, ESM | |
| Framework | Next.js App Router (latest stable), React 19 | Static-first; the app is one page + API proxy |
| 3D | React Three Fiber + drei + three | Character controller via drei/ecctrl or hand-rolled on rapier — decided at spec time by spike outcome |
| Styling | Tailwind v4, `@theme inline` tokens in `app/globals.css` | Per kit conventions; DESIGN.md governs |
| State | Zustand (pipeline store) | Single store; no server state |
| Hosting / deploy | Vercel | Preview deploys per PR; prod = submission link |
| Database | **None** | Task ids in `localStorage` are the only persistence |
| Auth | **None** | BYO Meshy key, session-local (see §4) |
| Storage / files | Repo `public/gallery/` for pregenerated GLBs | Meshy assets expire in 3 days → download at pregen time, self-host |
| Asset pipeline | @gltf-transform/core + /functions, programmatic NodeIO API (meshopt, prune, resize textures, KTX2) | Runs in pregen script; guards the <5s first-frame counter-metric. Tool of record settled by day-0 spike — not the CLI |
| Background jobs / queues | **None** | Client orchestrates; serverless functions stay short-lived |
| Observability | Vercel defaults + structured `console.error` in proxy (no key/PII) | Nothing more for a 3-day demo |
| Testing | Vitest (state machine, fixture transports), Playwright a11y smoke, Meshy test-mode key for live smoke | Pattern proven in `claude-code-resources/print-pipeline.ts`. **Limit (day-0 spike):** the test-mode key cannot exercise rig/animate — its dummy mesh fails pose estimation — so fixture transports are the only full-graph coverage; zero-credit live smoke stops at refine |

---

## 2. Data model

No persisted entities. Three client-side shapes matter:

| Shape | Lives in | Purpose / key fields |
|---|---|---|
| `PipelineRun` | Zustand + `localStorage` | One generation attempt: `prompt`, per-stage `{taskId, status, progress, creditCost, modelUrl}` for preview / refine / rig / animate×5, timestamps. Task ids make runs resumable after refresh (Meshy chains by task id). |
| `GalleryEntry` | `public/gallery/manifest.json` (build-time) | `slug`, `prompt`, `glbPath`, `creditTotal`, `generationSeconds`, per-stage credit breakdown, poly count. Written by pregen script only. |
| `MeshyTask` | transient (API responses) | Mirror of Meshy's task object: `id`, `status` (PENDING → IN_PROGRESS → SUCCEEDED/FAILED/CANCELED), `progress`, `model_urls`, `task_error`. Typed once in `lib/meshy/types.ts`. |

Conventions: no soft-delete, no audit, no multi-tenancy — nothing to apply them to. `localStorage` schema carries a `version` field so a breaking change can just invalidate old runs.

---

## 3. Service shape

- **Topology:** single Next.js app; all real logic client-side; serverless functions are a passthrough layer.
- **Modules:**

| Module | Owns | Exposes | Callers |
|---|---|---|---|
| `lib/meshy/` | Typed Meshy client, pipeline state machine, polling loop | `runPipeline()`, `resumePipeline()`, stage/task types | Web app, `scripts/pregen/`, `scripts/spike/` (isomorphic — any Node script via the direct transport; the pregen script doubles as the "integration code" teaching artifact) |
| `app/api/meshy/[...path]/` | Proxy: header rewrite, passthrough, error mapping | Same surface as Meshy REST (v1 + v2) | `lib/meshy/` client (browser transport) |
| `components/pipeline/` | Stage rail UI, API-call panel, key entry | React components | `app/page.tsx` |
| `components/scene/` | R3F canvas, playground, character controller, clip binding | `<Playground character={...}>` | `app/page.tsx` |
| `scripts/pregen/` | Gallery generation + gltf-transform optimization + manifest | `npm run pregen` | Build-time only |

- **API style:** the proxy mirrors Meshy's REST exactly — no invented surface. `POST/GET /api/meshy/openapi/v2/text-to-3d[...]` etc. Rationale: the on-screen API panel shows *real Meshy paths*, and the proxy stays a 30-line passthrough instead of a bespoke API.
- **Error envelope:** Meshy's own error bodies pass through untouched; proxy adds `{ proxyError }` only for its own failures (missing key header, network).
- **Public/internal split:** everything public; the proxy refuses requests without a key header and allowlists Meshy paths only (no open proxy).

---

## 4. Cross-cutting concerns

### Key handling (the auth section of this project)
- Key entered client-side; held in React state, mirrored to `sessionStorage` (survives reload, dies with the tab session; one keystroke to clear).
- Sent per request as `x-meshy-key`; proxy rewrites to `Authorization: Bearer` and forwards. Never stored, never logged, never in URLs.
- Dev/CI use Meshy's test-mode key (`msy_dummy_api_key_for_test_mode_12345678`) — zero credits consumed.

### Pipeline orchestration (the load-bearing area)
- Stage graph: `preview(20c) → refine+PBR(10c) → remesh(5c) → rig(5c) → animate ×5 clips(3c each)` = **55 credits/character**. Remesh is mandatory, not optional — refine outputs ~583k tris and rigging rejects >300k faces (day-0 spike, Trade-off log 2026-08-03). **Implementation status:** `lib/meshy/pipeline.ts` runs the full 6-stage graph (preview → refine → remesh → rig → animate ×5, 55c) as of TASK-11 — remesh is created with `target_polycount: 30000` and rig chains from the remesh task id. `STORAGE_VERSION` is 2; stale 4-stage runs are discarded on load.
- Chaining is always by task id (`preview_task_id` / `input_task_id` / `rig_task_id` for animations) — never download-and-reupload.
- **Progress: poll every ~4s** through the proxy; Meshy's 0–100 `progress` field animates the stage rail. SSE consciously rejected (see Trade-off log).
- Failure at any stage: halt pipeline, surface Meshy's `task_error` verbatim + note that failed tasks auto-refund (a DevEx teaching moment). Retry = re-run stage; upstream completed stages are reusable via stored task ids.
- 429 handling distinguishes `RateLimitExceeded` (exponential back-off, auto-retry) from `NoMoreConcurrentTasks` (surface "Meshy queue full — waiting", keep polling). Different copy, different behavior.
- Rigging gotcha encoded: rig requires textured bipedal humanoid; prompt UI nudges toward bipeds (PRD non-goal) and rig-stage failure copy explains why ("pose estimation failed" ≠ bug).

### Caching
- Gallery GLBs: immutable static assets, long-lived cache headers (hashed filenames).
- Proxy responses: `no-store` — task state must always be fresh.

### Rate limiting (ours)
- None for V1. The proxy only forwards to Meshy with the caller's own key; Meshy's per-account limits are the real limiter. Revisit only if the demo goes viral enough to get the proxy abused as an open relay — path allowlist already blocks non-Meshy targets.

### Secrets
- Server env: none required for runtime (proxy uses caller's key). Pregen script reads `MESHY_API_KEY` from local env only; never deployed.

### Testing
- Unit (Vitest): pipeline state machine against fixture transports — every branch: happy path, stage failure, both 429 flavors, resume-from-localStorage.
- Live smoke: test-mode key through the real proxy.
- E2E: kit's `tests/a11y.spec.ts` + one Playwright flow (load → gallery character controllable).
- No mocking of the state machine itself; only the transport is swapped.

### Migration & deploy
- No schema, no migrations. Deploy = Vercel push; rollback = redeploy previous build.

---

## 5. Evolution

### Reversibility map

| Decision | Reverse cost |
|---|---|
| Poll vs SSE | easy — transport is isolated in `lib/meshy/` |
| Client-side orchestration (no server jobs) | medium — server orchestration would need a queue + state store |
| Proxy mirrors Meshy paths (no bespoke API) | easy |
| Self-hosted pregen gallery | easy |
| 5-clip merge onto one skeleton | **hard mid-build** — the controller, scene, and credit budget all assume it → de-risked by day-0 spike |

### Bets we're making

- **Bet:** AnimationClips from 5 separate Meshy animation tasks on the same rigged model bind cleanly to one skeleton client-side. *Trigger:* day-0 spike fails → fall back to idle+walk (2 clips) or single showcase animation before any UI is built.
- **Bet:** Meshy text-to-3D + rig succeeds often enough on biped prompts that live generation feels reliable. *Trigger:* pregen session shows <~70% first-try rig success → tighten prompt guidance / add auto-retry copy.
- **Bet:** ~55 credits/character × (gallery of ~8–12 + spike runs + on-camera runs) fits the trial credit grant. *Trigger:* balance check during pregen says otherwise → email hiring team for more credits (explicitly offered) before cutting gallery size. **Fired 2026-08-03:** 55c × 8–12 = 440–660c vs ~130 balance; credit-request email drafted in `scripts/spike/README.md`.

### Deferred decisions

All three resolved by the day-0 spike (2026-08-03) — see the Trade-off log
entry and `scripts/spike/README.md` for evidence.

| Decision | Resolution |
|---|---|
| drei ecctrl vs hand-rolled rapier controller | **ecctrl first.** Clips are clean standard locomotion (idle/walk/run/jump loops on one skeleton, no retargeting, no root-motion surprises) — nothing demands bespoke physics. Hand-rolled rapier remains the documented fallback if ecctrl's clip-blending hooks fight the 5-clip set at scene-spec time. |
| Remesh stage in live pipeline | **Yes — mandatory, not optional.** Refine outputs ~583k tris; rigging hard-rejects >300k faces (400). Live graph is preview → refine → remesh(30k) → rig → animate ×5 = 55c/character. |
| KTX2 texture compression (beyond meshopt) | **Yes for gallery pregen.** Raw GLBs are ~8.5 MB at 29k tris (textures dominate); one character alone busts the <5s first-frame budget on ordinary broadband. Pregen pass: meshopt + texture resize + KTX2. Live-generation downloads stay raw (user already waited minutes; a 8.5 MB fetch is fine). |

### Known wrong choices we're shipping anyway

- `sessionStorage` for the API key is weaker than an httpOnly cookie session — accepted because there are no accounts, the key is the user's own, entered knowingly, scoped to their tab, and the alternative adds a session layer to a 3-day demo. README will say exactly this.
- Polling wastes a few requests vs SSE on minutes-long tasks — accepted for simplicity; 20 req/s account limit makes it harmless.

---

## 6. Trade-off log

Append-only. Newest at the top.

### 2026-08-03 — Day-0 spike outcome: 5-clip merge holds; remesh stage mandatory
- **Chose:** keep the 5-clip plan (idle/walk/run/jump/emote as separate Animation tasks, merged client-side) — validated live, no fallback invoked. Insert remesh(30k) between refine and rig permanently. Pipeline = preview → refine → remesh → rig → animate ×5, **55c/character** (was 50).
- **Evidence:** one knight end-to-end; rig first-try success; all 5 clips bind to the rig skeleton with zero missing track targets and play via one AnimationMixer in `/spike` (`scripts/spike/README.md`).
- **Live-API corrections baked into `lib/meshy/`:** animations create is `{rig_task_id, action_id:int}` (action ids: idle 0, walk 30, run 14, jump 466, emote 28); rig/animate GLBs nest under `result.*` (`taskGlbUrl()` absorbs the shape split); rigging rejects >300k faces.
- **Operational findings:** shared remesh queue can hold a task `PENDING` for hours at peak (`preceding_tasks` 477–532 observed) — the stage rail should surface queue depth; raw GLBs are ~8.5 MB (textures dominate) → gallery pregen gets meshopt + KTX2; test-mode key cannot exercise rig/animate (dummy mesh fails pose estimation).
- **Credit reality:** balance 130 after spike (55c spent). Gallery at 8–12 × 55c = 440–660c does not fit — credit-request email drafted in `scripts/spike/README.md` (bet #3's trigger fired).
- **Deferred:** the remesh stage is documented in §4 but not yet in the state machine (`StageId`, `PIPELINE_STAGES`, `STAGE_CREDITS`, `LINEAR_STAGES` are all still 4-stage/50c). Tracked as TASK-11 in the backlog Inbox; blocks live-generation UI specs.
- **Reversibility:** n/a — evidence entry resolving the three deferred decisions above.

### 2026-08-03 — Progress transport: polling over SSE
- **Chose:** GET task every ~4s through the proxy.
- **Considered:** SSE `/:id/stream` passthrough.
- **Reason:** serverless-simple, resilient, and Meshy's `progress` field animates the UI fine at 4s on minutes-long tasks; SSE-through-proxy adds streaming plumbing plus a fallback poller anyway.
- **Reversibility:** easy. — **Related:** PRD §5 secondary metric.

### 2026-08-03 — Locomotion: 5 animation tasks, clips merged client-side
- **Chose:** idle/walk/run/jump/emote as separate Animation tasks (~15c), all clips bound to the rigged skeleton in the client.
- **Considered:** 2 clips (idle+walk); single showcase animation.
- **Reason:** movement feel is the demo's polish bet (PRD §4 confirmation); sliding-feet locomotion would undercut it.
- **Reversibility:** hard mid-build → de-risked by day-0 spike with explicit fallback ladder. — **Related:** PRD §3 cap. 1.

### 2026-08-03 — Client-orchestrated pipeline, stateless passthrough proxy
- **Chose:** browser runs the state machine; `/api/meshy/[...path]` is a ~30-line header-rewriting passthrough with a Meshy-path allowlist.
- **Considered:** server-side orchestration (queue + state store); direct browser calls (impossible — CORS-blocked by design).
- **Reason:** BYO key, Vercel function time limits, zero persistence requirement, and free resumability via task ids in `localStorage`.
- **Reversibility:** medium. — **Related:** PRD §6 stack constraint.

### 2026-08-03 — Gallery is build-time, self-hosted, meshopt-compressed
- **Chose:** pregen script → download GLBs immediately → gltf-transform → `public/gallery/` + manifest.json.
- **Considered:** hotlinking Meshy asset URLs (expire in 3 days — disqualified); runtime generation for gallery (slow, credit-hungry, kills the 15s metric).
- **Reason:** instant payoff, immutable caching, and the script doubles as published example code.
- **Reversibility:** easy. — **Related:** PRD §5 primary + counter-metric.
