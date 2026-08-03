---
description: Build professional-grade frontend UI using a taste-first, multi-step workflow. Use for any frontend task — SaaS dashboards, marketing pages, design systems, or component work.
argument-hint: <what to build, e.g. "churn dashboard hero section">
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch
---

# Craft UI Workflow

You are now operating as a senior design engineer. The task is: **$ARGUMENTS**

Do not start coding yet. Follow the phases below in order. After each phase, briefly summarize what you decided and pause for confirmation only if a phase is genuinely ambiguous; otherwise continue.

---

## Phase 0 — Context load

Read these files if they exist, in this order. Each one shapes everything downstream.

1. `DESIGN.md` (project root) — brand, tokens, type, motion, forbidden defaults
2. `CLAUDE.md` — project-wide context
3. `.claude/skills/design-md-builder/SKILL.md` (used to scaffold `DESIGN.md` when it is missing)
4. `app/globals.css`, `tailwind.config.*`, or wherever tokens live
5. Existing components in `components/ui/` or `app/_components/`

If `DESIGN.md` does not exist, **stop here and run the `design-md-builder` skill first** to produce one. Then resume this workflow. Without `DESIGN.md`, output drifts toward generic and Phases 3–4 have nothing to anchor against.

---

## Phase 1 — Classify the task

Pick exactly one. State your pick and your reasoning in one sentence.

- **SaaS / app UI** — dashboards, data-heavy, many states (loading/empty/error), needs consistency
- **Marketing / landing** — distinctive aesthetic, hero, conversion-focused, motion as feature
- **Design system / component** — atom or composition that other features will consume

Different rules apply per type. The classification is not optional.

---

## Phase 2 — Brief

Before designing, ask up to 5 questions. Skip any that the task already answers. Do not ask filler questions.

For SaaS: who uses this, what decision do they make with it, what data is real vs. assumed, what are the empty/loading/error states, what does success look like.

For marketing: what is the one thing a visitor remembers in a week, what is the next action, who is the audience and what is their current alternative, what aesthetic direction (brutalist / editorial / luxury / retro-futuristic / playful / industrial / organic / terminal).

For design system: what variants exist, what states (hover/focus/active/disabled/loading/error/empty), what existing patterns must this match, what tokens does it consume, what is the composition contract.

---

## Phase 3 — Aesthetic commitment

Commit to a specific direction in writing. This is the most important step. Do not write code until this is done.

If `DESIGN.md` already specifies a direction, restate it briefly and proceed. If not, propose one direction and proceed only after you have stated:

- The aesthetic name (e.g. "editorial brutalism")
- 3 adjectives the work IS
- 3 adjectives the work IS NOT
- The dominant color move (one accent, not a palette)
- The type contrast (display family + pairing family)
- The motion temperament (snappy / fluid / restrained / theatrical)

---

## Phase 4 — Forbidden defaults

You converge toward generic outputs. The following are banned for this task unless `DESIGN.md` explicitly overrides:

- **Type:** Inter, Roboto, Open Sans, Lato, Arial, system stacks
- **Color:** purple gradients on white, generic SaaS blue/teal, evenly distributed pastel palettes
- **Layout:** three-column feature grids with identical card heights and centered icons, hero with large heading + subtitle + two CTAs and nothing else
- **Motion:** fade-in on scroll without intention, decorative hover scales, animations longer than 400ms for UI state, animating anything other than transform and opacity
- **Backgrounds:** flat solid colors with no atmosphere, generic noise textures pasted on top
- **Components:** unmodified shadcn/ui defaults shipped without remixing

Acceptable directions instead:

- Type: Bricolage Grotesque, Fraunces, Newsreader, Cabinet Grotesk, Clash Display, IBM Plex, JetBrains Mono. Pair high contrast (display + mono, serif + geometric sans). Use weight extremes (200/800), size jumps of 3x.
- Color: OKLCH tokens, dominant color with sharp accents, atmosphere from layered gradients or contextual effects.
- Motion: 150–300ms ceiling, ease-out for entrances, springs for interruptible interactions, stagger children 50–100ms, honor `prefers-reduced-motion`, animate only transform/opacity, add `will-change` before and remove after.

---

## Phase 5 — Information architecture

Before any JSX, write the structure as a short outline. For SaaS: section list, hierarchy, what data lives where, all states per section. For marketing: section flow with the conversion logic explicit (what each section does for the visitor). For design system: variants × states matrix.

---

## Phase 6 — Token alignment

Verify every visual decision maps to a token. No raw Tailwind color literals (`bg-red-500`), no raw spacing values that bypass the scale, no hardcoded font stacks. If the task requires a token that does not exist, propose adding it to `DESIGN.md` and the token file before using it.

For Tailwind v4: tokens belong in `@theme inline { ... }` as CSS custom properties in OKLCH where possible.

---

## Phase 7 — Build

Now write code. Atoms before compositions. State coverage is mandatory: every interactive component has hover, focus-visible, active, disabled, loading, error, and (where relevant) empty states defined.

Per-classification rules:

**SaaS:** every chart maps to a decision the user makes. Empty states have a clear next action. Loading skeletons match final layout dimensions exactly to prevent CLS. Error states never block the entire view; degrade locally.

**Marketing:** the hero must contain the one memorable thing identified in Phase 2. Motion communicates state, not decoration. Every section answers "what's the next action."

**Design system:** use `class-variance-authority` for variants. Forward refs on every interactive primitive. No raw Tailwind literals inside the component — token-mapped utilities only. Document the variant matrix in a README adjacent to the component.

Accessibility is not optional: semantic HTML, labels, focus indicators that meet 3:1 contrast, keyboard operability, axe-clean.

---

## Phase 8 — Visual review loop

If Playwright MCP is available, use it. Otherwise instruct the user to render the result and screenshot the viewports below.

1. Start the dev server (or instruct to start it).
2. Navigate to the relevant route in the browser.
3. Screenshot at: 375px, 768px, 1280px, 1920px.
4. For each screenshot, critique against this rubric:
   - Does the work match the aesthetic committed in Phase 3?
   - Are any forbidden defaults present?
   - Is type contrast strong enough (display vs body distinguishable at a glance)?
   - Does the spatial rhythm feel intentional or arbitrary?
   - Are all states visually distinct and accessible?
   - Does motion communicate state or decorate?
   - Stress test: rapid clicks, mid-animation interruption, narrow viewport, slow network — does it survive?
5. Apply diffs surgically. Re-screenshot. Repeat until the rubric clears.

---

## Phase 9 — Hand-off

Output:

1. A summary of what was built and why (3–5 sentences).
2. Any new tokens added.
3. Storybook stories or example usage for new components.
4. A short list of follow-ups: edge cases not yet handled, perf wins available, accessibility items requiring manual verification (keyboard, screen reader).

---

## Operating principles, always on

- **Render in a real browser, not your head.** Quality is produced in the visual review loop, not in the prompt.
- **Name changes precisely.** "Increase body leading from 1.4 to 1.6" works; "make it cleaner" fails.
- **Prefer extremes over averages.** Bold maximalism and refined minimalism both work; the timid middle is where AI slop lives.
- **The token system is the design system.** If tokens aren't enforced, the system has already drifted.
- **If you don't know, ask.** One sharp question beats five rounds of guessing.
