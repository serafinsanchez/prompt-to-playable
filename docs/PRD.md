# Prompt to Playable — PRD

> Source of truth for **what V1 is and isn't**. Read before triaging any spec. Updated deliberately via `/prd-revise` — never silently re-interpreted.

**Version:** 1.0
**Last updated:** 2026-08-03
**Status:** Greenfield, frozen for V1 (3-day take-home window)

**Context:** This is the project deliverable for a Meshy Developer Experience Manager take-home assignment. The submission bundle is (1) this app, live on Vercel + public GitHub repo, (2) ready-to-publish content (video + README-as-landing-page), (3) a distribution plan. The PRD below governs the app; the content and distribution plan are tracked in the roadmap, not here. The demo has a dual audience — the developer it targets and the Meshy hiring team evaluating whether it would convert that developer — and every scope decision favors the developer experience, because that *is* what's being evaluated.

---

## 1. Primary user

The indie web-game developer: builds prototypes and game-jam entries solo in Three.js/React Three Fiber (or is engine-curious and lives in the browser), ships a new experiment every few weekends, and follows gamedev Twitter/Reddit for tools. They can code movement, cameras, and game logic in a weekend, but they cannot model, texture, rig, or animate a character — there is no character artist and no budget for one.

The moment they'd reach for this product: their prototype works, but the player is a gray capsule, and the project dies a little every time they look at it. Their current workarounds are asset-store characters (generic, never match the game's idea), commissioning (weeks and hundreds of dollars), or learning Blender rigging (a months-long detour they've started and abandoned before). They judge new tools by one criterion: *can I see it doing the real thing, in my browser, in under a minute.*

Secondary audience (constraint, not user): the Meshy hiring team, who will experience the demo exactly the way the primary user does — by clicking a link.

---

## 2. Problem

"I can build the whole game — movement, camera, logic — in a weekend. But the character is a gray capsule. I can't model, rig, or animate; asset-store characters never match my game's idea and all look the same; commissioning an artist is $300+ and weeks I don't have; and learning Blender rigging is a months-long detour. So my prototypes ship with placeholder cubes, they feel dead, and I lose motivation to finish them."

The character-shaped hole in every solo prototype: they can code it, they can't art it, and every workaround is generic, slow, or expensive.

---

## 3. V1 capabilities (6)

Ordered by load-bearing weight — most-noticed first.

1. **Play instantly.** Open the site, pick a character from the pre-generated gallery, and control it in a small third-person scene (walk/run/jump/emote) — no API key, no install, payoff in ~10 seconds.
2. **Generate live.** Enter a Meshy API key and a character prompt, then watch each pipeline stage complete in real time — preview mesh → textured → rigged → animated — with each intermediate artifact viewable in 3D as it lands.
3. **Play what you made.** The finished character drops straight into the same playable scene.
4. **See the API as you go.** Every stage shows the actual request that produced it (endpoint, params, credit cost), so the demo teaches the integration while it entertains.
5. **Download the GLB.** Grab the final rigged, animated model — works in any engine.
6. **Browse the gallery with receipts.** Each pre-generated character shows its prompt, generation time, and total credit cost.

All six are facets of one page, one scene, one pipeline — not separate features.

---

## 4. V1 non-goals

The most important section. Every "out" has a one-sentence reason. Out is the default; capabilities only got in via §3.

### Explicitly out for V1

- ❌ Accounts / auth of any kind. *BYO Meshy API key, held client-side for the session, never stored server-side — an account system adds a day of work and zero demo power.*
- ❌ Image-to-3D mode. *One input (text), one story; image-to-3D is flakier and splits the narrative — it's the best follow-up content, not V1.*
- ❌ Non-humanoid characters (quadrupeds, vehicles, limbless monsters). *Meshy auto-rigging targets humanoids; off-path results would make the API look bad in our own demo — prompt guidance steers to bipeds.*
- ❌ Gameplay depth — combat, enemies, objectives, scoring, physics puzzles. *The #1 scope magnet in the project; the scene is a character playground and the pipeline is the story. Position defended knowingly against "cool, but it's not a game" comments.*
- ❌ Persistent user-generated gallery / share links. *Generated characters are session-local; publishing user content means moderation, storage, and legal surface.*
- ❌ Scene/character editing (materials, retargeting, color pickers). *Meshy's output should stand on its own.*
- ❌ Mobile touch controls. *Target user is at a desk; the site is responsive for browsing, gameplay is desktop WASD.*
- ❌ FBX/USDZ/other export formats. *GLB is the web-native answer and imports into engines anyway.*
- ❌ Engine-specific content (Unity/Unreal/Godot import tutorials, FBX paths, plugins). *Web-first V1 per the primary-user decision; engines get at most a "the GLB works in your engine too" mention.*
- ❌ Own API, webhooks, admin tools, notifications, search, offline support, real-time collaboration, i18n. *None earn their keep in a 3-day demo.*
- ❌ Onboarding tour / separate docs site. *The page is the onboarding; the README is the docs.*

### Punted, will revisit after submission

- ⏸ Image-to-3D ("photo → playable") mode. *Revisit as follow-up content; strongest widening move once the core demo is out.*
- ⏸ Community gallery of user-generated characters. *Revisit only with real usage and a moderation answer.*
- ⏸ Mobile touch controls. *Revisit only if evaluator/community feedback demands it.*

---

## 5. Success metrics

- **Primary:** a cold visitor (no instructions, no API key) is controlling a character within **15 seconds** of page load. Verified before submission by watching 2–3 people try the link unprompted.
- **Secondary:** a developer with a Meshy key goes from typing a prompt to playing their own character in **one sitting (~10 minutes**, dominated by Meshy generation time), and the pipeline view keeps them on the page for the whole wait — no dead spinners; every stage shows progress and its API call.
- **Counter-metric:** first playable frame in **under 5 seconds** on ordinary broadband — guards against the 3D-site failure mode (a 50 MB bundle) that would kill the first impression the primary metric depends on.

---

## 6. Constraints

### Stack

- Next.js App Router + TypeScript, React Three Fiber + drei (+ rapier or drei ecctrl for the character controller), Tailwind. Deployed on Vercel. The builder's home stack — chosen for polish speed, not exploration.
- Thin edge route proxies Meshy API calls (browser can't call the API cross-origin); it passes the user's key through per-request and never stores it. No database.
- Full architecture detail belongs in `docs/ARCHITECTURE.md`.

### Deadlines

- **Hard: 3 days from API access** (assignment window). Working split: ~2 days build, ~1 day content (video, README polish, distribution plan). Gallery generation happens early — it burns credits and wall-clock and gates the "play instantly" capability.

### Mandatory integrations (V1)

- Meshy API only: Text to 3D (v2 preview + refine), Rig, Animate, and Remesh if needed to hit a poly budget. Nothing else.

### Budget / team

- Solo build. Higher-tier trial credits fund the gallery plus a few full on-camera pipeline runs.

### Open-source posture

- Public GitHub repo, MIT license — the repo is itself a deliverable and marketing surface.

### Anti-patterns — what this product is NOT

- ❌ This is NOT a Meshy dashboard clone — no task lists, no account management, no credit top-up UI.
- ❌ This is NOT a generic 3D model viewer — the playable scene is the point, not orbit controls around a static mesh.
- ❌ This is NOT a game engine or editor — no scene editing, no asset browser, no inspector panels.
- ❌ This is NOT an AI chat product — no chat UI, no "ask the assistant" surface, no agent loop in the product.
- ❌ This is NOT a finished game — no objectives, no win state (see non-goals; playground by deliberate choice).

---

## Revision log

> Append-only record of deliberate PRD changes. Newest at the top. Each entry corresponds to one `/prd-revise` pass.

### 2026-08-03 — Initial PRD

**Triggered by:** `prd-grill` (project kickoff)

**Drift addressed:** N/A (initial draft)

**Updates applied to PRD:**
- All sections drafted from interrogation across user / problem / capabilities / non-goals / success metrics / constraints.
- Product named "Prompt to Playable"; lives in the `character-pipeline-demo/` folder — public repo name to be finalized at publish time (lean: `prompt-to-playable`).

**Carried forward:**
- Image-to-3D mode, community gallery, mobile controls — all punted with revisit conditions in §4.
