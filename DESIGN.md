# DESIGN.md — Prompt to Playable

> Aesthetic source of truth. Read before generating ANY UI. `/craft-ui` and `design-reviewer` anchor here.

## Brand identity

- **Name:** Prompt to Playable
- **Tagline:** Type a character. Play it.
- **Aesthetic direction:** **Dark stage** — the 3D scene is the hero; UI is thin overlays that recede; the pipeline reads like a beautiful build log; one electric accent does all the work.
- **IS:** cinematic, precise, alive
- **IS NOT:** corporate, cluttered, cute
- **Remembered in a week:** "I typed a sentence and then I was *playing* it — and I watched every API call that made it happen."
- **References:** Lusion.co (restraint around 3D), threejs-journey.com (dev credibility), Linear dark (precision). Match qualities, never copy layouts.

## Type system

- **Display:** Bricolage Grotesque — weights 200 and 800 only. Tracking −0.03em.
- **Body:** IBM Plex Sans — 400/500. Tracking 0.
- **Mono:** IBM Plex Mono — 400/600. Labels/caps at +0.06em, uppercase, small sizes. The mono voice is load-bearing: pipeline rail, API panel, credit counts, stats are ALWAYS mono.
- **Scale:** 1.414 ratio from 16px base → 16 / 22.6 / 32 / 45 / 64 / 90. Hero moments jump 3×+, not 1.5×.

## Color (Tailwind v4 `@theme`, OKLCH, dark-only)

- `--color-background: oklch(0.15 0.008 80)` — warm charcoal, never pure black
- `--color-surface: oklch(0.20 0.01 80)` — panels, overlays
- `--color-elevated: oklch(0.24 0.01 80)` — modals, popped cards
- `--color-border: oklch(0.30 0.012 80)`
- `--color-foreground: oklch(0.93 0.005 80)` — warm off-white
- `--color-muted: oklch(0.65 0.01 80)` — secondary text
- `--color-accent: oklch(0.87 0.24 128)` — electric chartreuse. THE color. CTAs, active pipeline stage, focus rings, key stats.
- `--color-accent-foreground: oklch(0.17 0.02 128)` — text on accent
- `--color-success: oklch(0.75 0.17 150)` / `--color-warning: oklch(0.80 0.15 80)` / `--color-error: oklch(0.65 0.20 25)`
- Accent discipline: chartreuse is never decorative. If everything glows, nothing does.

## Space & shape

- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128.
- **Radius:** sharp — sm 2px, md 4px, lg 8px, pills `full` for stage chips only. Nothing pillowy.
- **Shadows:** none. Depth comes from surface steps + borders. One exception: a soft accent glow (`box-shadow` with accent at low alpha) allowed ONLY on the active pipeline stage and the primary CTA.
- **Layout:** scene canvas is full-bleed edge-to-edge; overlay content max-width 1280px, 24px gutters; pipeline rail docks left on desktop, bottom-sheet on small screens.

## Motion

- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` everywhere. Material's default curve is forbidden.
- **Durations:** fast 120ms (hover, focus) / normal 220ms (open, close, swap) / slow 380ms (stage transitions, character swap-in). Nothing over 400ms except in-scene camera moves.
- **Springs:** reserved for the 3D world (camera, character). DOM UI uses durations.
- **Stagger:** 60ms between children (gallery cards, rail stages).
- **Only `transform` and `opacity`.** `will-change` applied before, removed after.
- **Signature moment:** a pipeline stage completing — progress ring fills, tick lands, artifact thumbnail clips in from below (220ms), rail advances. Spend polish here; it's the emotional beat of the wait.
- **`prefers-reduced-motion`:** strict — durations→0, stagger→0, camera cuts instead of glides. The character's own idle animation may keep playing (it's content, not chrome).

## Voice

- Short sentences. Confident, technical-plain, a dry half-smile. Linear-changelog meets charm.sh README.
- Numbers are copy: "50 credits. About 4 minutes. Yours to download."
- **Forbidden words:** effortlessly, seamlessly, leverage, empower, unleash, revolutionize, magic, supercharge, blazingly.

## Forbidden defaults (project-specific)

- ❌ No purple, no gradients-as-identity — not another purple SaaS, and no Meshy brand mimicry.
- ❌ No light mode, no theme toggle. One committed look.
- ❌ No glassmorphism, no `backdrop-blur` cards.
- ❌ No three-column feature grids with centered icons. This is a demo, not a landing page.
- ❌ No Inter, Roboto, Open Sans, or system default fonts.
- ❌ No full-screen spinners, ever — loading IS the pipeline rail with real progress.
- ❌ No toasts for pipeline events — the rail owns all pipeline status.
- ❌ No dead 3D: the scene never shows a frozen character. Idle animation always plays.
- ❌ No Material easing `cubic-bezier(0.4, 0, 0.2, 1)`.
