# Prompt to Playable

This file is **session memory**. Read it before doing anything else. Deep detail lives in `/docs/` when you add it.

## What this product actually is

A browser demo that turns a text prompt into a playable game character via the Meshy API: preview mesh → PBR texture → rig → animate, then the character drops into a third-person playground scene. A pre-generated gallery gives cold visitors payoff in ~10 seconds; a BYO Meshy API key unlocks live generation with every API call shown on screen. Built as a Meshy DevRel take-home — the demo must *teach the API while it entertains*. No accounts, no database, no gameplay objectives. Meshy API behavior reference: `llms-full.txt` (Meshy's published docs dump) and https://docs.meshy.ai.

## Project Context

### Stack

- **Framework:** Next.js App Router (latest stable), React 19, TypeScript, ESM
- **3D:** React Three Fiber + drei + three (character controller decision logged in `docs/ARCHITECTURE.md`)
- **Styling:** Tailwind v4 with `@theme inline` tokens in `app/globals.css`
- **Components:** hand-rolled — the UI surface is small and bespoke; shadcn/ui only if a spec explicitly authorizes it
- **State:** Zustand (single pipeline store; task ids mirrored to `localStorage`)
- **Testing:** Vitest (state machine w/ fixture transports) + Playwright + `@axe-core/playwright`

### Commands

- **Dev:** `npm run dev`
- **Lint:** `npm run lint`
- **Type check:** `npm run typecheck`
- **Test:** `npm run test`
- **A11y:** `npx playwright test tests/a11y.spec.ts`
- **Token check:** `bash scripts/check-tokens.sh`

### Rules (always on)

- **Always consult `DESIGN.md`** before generating any UI. It is the source of truth for type, color, spacing, motion, voice, and forbidden defaults.
- **Always consult `docs/ARCHITECTURE.md`** before making architectural decisions (schema changes, service boundaries, auth, caching, migrations, new cross-cutting libraries). For decisions not yet resolved there, run the `architecture-review` skill before triaging the spec. If `docs/ARCHITECTURE.md` doesn't exist yet for an architecturally-loaded project, run `architecture-md-builder` after the PRD and before backlog triage.
- **Treat `docs/PRD.md` as living, not static.** At every phase boundary (or after any material trade-off log entry that affects scope), run the `prd-revise` skill to detect drift between the PRD and what's actually shipped. Update the PRD deliberately and capture changes in its Revision log. Do not silently re-interpret the PRD spec-by-spec when reality diverges — surface the divergence and update the doc.
- **Use semantic tokens only.** No `bg-red-500`, `text-blue-700`, hex literals in `className`, or hardcoded px values that bypass the spacing scale.
- **Every interactive component must define** `hover`, `focus-visible`, `active`, `disabled`, `loading`, `error`, and (where applicable) `empty` states.
- **Honor `prefers-reduced-motion` strictly.** Animate only `transform` and `opacity`.
- **After any UI change**, invoke the `design-reviewer` subagent before considering the work done. You may invoke it directly via the Agent tool — there is no behavioral difference between user-triggered and agent-triggered invocations. Only ask the user to invoke it when you genuinely need them to look at the UI first (e.g. visual judgment calls that depend on what they see). For routine review against `DESIGN.md`, just run it.
- **After any architecturally-loaded change** (schema, service boundaries, auth, caching, queues, migrations, public APIs, new cross-cutting libraries), invoke the `architecture-reviewer` subagent before considering the work done. It anchors against `docs/ARCHITECTURE.md` and produces a structured report with severities. Like `design-reviewer`, you may invoke it directly via the Agent tool — no need to bounce through the user. Routine code-shape changes (function signatures, internal helpers) do NOT trigger this; only changes that touch the system shape do.
- **After any database schema migration** is added or modified, invoke the `migration-reviewer` subagent before considering the work done. It does per-statement DDL safety review (lock acquisition, backfill cost, index hygiene, NOT NULL adds, FK adds, rename safety, rollback) anchored against `docs/ARCHITECTURE.md` §1 and §4. Run it in addition to `architecture-reviewer` — they cover different layers (architecture-reviewer does the strategic level, migration-reviewer does the per-line DDL level). 🔴 findings block the kickoff verification gate.
- **After any HTTP endpoint, server action, RPC handler, or webhook receiver** is added or modified, invoke the `api-reviewer` subagent before considering the work done. It does per-endpoint completeness review (authorization granularity, input validation, idempotency, rate limiting, error envelope, status codes, mass-assignment safety, open-redirect/SSRF, webhook signature verification, audit logging) anchored against `docs/ARCHITECTURE.md` §3 and §4. Run it in addition to `architecture-reviewer` — they cover different layers (architecture-reviewer does the strategic API design, api-reviewer does the per-endpoint completeness check). 🔴 findings block the kickoff verification gate.
- **Run `bash scripts/check-tokens.sh`** before declaring a task complete. It must pass.
- **No new packages without explicit spec authorization.** If a spec's CONSTRAINTS section doesn't list a package under "Allowed packages," do not install it. Tiny utilities (date formatting, classname concat, debounce) almost always belong as 10 lines of code, not a dependency. If you genuinely need a package, stop and surface it to the user for approval before running `npm install` / `pnpm add` / `yarn add`.

### File locations

- Brand source of truth: `DESIGN.md`
- Tokens: [`app/globals.css` | `src/styles/tokens.css`]
- UI primitives: `components/ui/`
- Commands: `.claude/commands/`
- Subagents: `.claude/agents/`
- Skills: `.claude/skills/`

## Project structure

```
app/                  page, layout, globals.css (tokens)
app/api/meshy/        [...path] passthrough proxy (allowlist + key header rewrite)
lib/meshy/            typed client, pipeline state machine, polling — isomorphic
components/pipeline/  stage rail, API panel, key entry
components/scene/     R3F canvas, playground, character controller, clip binding
scripts/pregen/       gallery generation + gltf-transform optimization → public/gallery/
docs/                 PRD, ARCHITECTURE, ROADMAP, backlog
```

One concept per file. Avoid large god-files; split when a file grows past ~250 lines.

## Conventions

- Chain Meshy stages by `input_task_id` / `preview_task_id` — never download-and-reupload. Text to 3D is **v2**; everything else is **v1**.
- The proxy mirrors Meshy's real REST paths and stays a dumb passthrough — no invented API surface, no server-side orchestration, no server-held keys.
- The user's API key: React state + `sessionStorage` only; sent as `x-meshy-key`; never logged, never in URLs. Dev/CI use the test-mode key (`msy_dummy_api_key_for_test_mode_12345678`, zero credits).
- Poll tasks every ~4s; treat `RateLimitExceeded` (back off) and `NoMoreConcurrentTasks` (wait, keep polling) as different states with different copy.
- Download Meshy assets immediately on `SUCCEEDED` — signed URLs die after 3 days; never persist a Meshy URL as if permanent.
- All pipeline/API/credit UI text is mono (`DESIGN.md`); numbers are copy ("50 credits. About 4 minutes.").

## What success looks like

- Cold visitor controls a character within **15s** of page load (no key, no instructions).
- BYO-key visitor: prompt → playing their own character in one sitting; the wait itself entertains (no dead spinners, every stage shows progress + its API call).
- First playable frame **<5s** on ordinary broadband — guard the bundle and asset sizes.

## Anti-patterns

- NOT a game: no objectives, combat, scoring, or win state — the scene is a character playground by deliberate PRD decision.
- NOT a Meshy dashboard: no task lists, account management, or credit top-up UI.
- NOT a generic model viewer: the playable scene is the point, never orbit-controls-around-a-static-mesh.
- NOT an AI chat product: no chat UI, no assistant surface.
- No accounts/auth, no database, no image-to-3D, no engine plugins/tutorials, no mobile touch controls (full list + reasons: PRD §4).
- No full-screen spinners and no toasts for pipeline events — the stage rail owns all pipeline status (`DESIGN.md`).

## Frontend aesthetics

**Always consult `DESIGN.md` before generating UI.** It overrides this section. If `DESIGN.md` is missing, run the `design-md-builder` skill before any UI work.

You converge toward generic, "on-distribution" outputs. In frontend design, this creates the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight.

### Typography

- Never use: Inter, Roboto, Open Sans, Lato, Arial, system defaults.
- Use distinctive choices: Bricolage Grotesque, Fraunces, Newsreader, Space Grotesk paired with a mono, IBM Plex, Cabinet Grotesk, Clash Display.
- Pair high contrast: display + monospace, serif + geometric sans.
- Use weight extremes (100/200 vs 800/900), not 400 vs 600.
- Size jumps of 3x+, not 1.5x.

### Color & theme

- Commit to a cohesive aesthetic via CSS custom properties.
- Dominant colors with sharp accents > timid evenly-distributed palettes.
- Avoid clichés: purple gradients on white, generic blue/teal SaaS palettes.
- Draw from IDE themes, editorial design, brand systems, cultural aesthetics.

### Motion

- Animations should feel intentional, not decorative.
- 150–300ms for UI transitions; ease-out for entrances, ease-in for exits.
- Animate only `transform` and `opacity`; add `will-change` for both.
- Honor `prefers-reduced-motion`.
- Stagger child animations by 50–100ms (Disney "Follow-Through" principle).

### Backgrounds

- Create atmosphere: layered gradients, geometric patterns, noise textures, contextual effects. Not flat solid colors.

### Before coding, commit to a SPECIFIC aesthetic direction

`brutalist | maximalist | retro-futuristic | luxury | playful | editorial | art-deco | industrial | organic | terminal/IDE-inspired`

## Reference docs

- `DESIGN.md` (project root) — brand, tokens, type, motion, forbidden defaults. Source of truth for any UI work. Run `design-md-builder` if missing.
- `docs/PRD.md` — scope and MVP. Source of truth for what V1 is and isn't. Run `prd-grill` to scaffold (one-question-at-a-time interrogation with recommended answers and emphasis on non-goals); run `prd-revise` to keep it honest as the build progresses.
- `docs/ARCHITECTURE.md` — system shape, stack, schema, cross-cutting concerns, trade-off log. Source of truth for any architectural decision. Run `architecture-md-builder` if missing for an architecturally-loaded project; run `architecture-review` for individual decisions.
- `docs/ROADMAP.md` — phasing of what ships when.
- `docs/backlog.md` — Inbox + phase index. Phase files at `docs/backlog/phase-*.md`.
