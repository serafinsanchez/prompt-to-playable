---
name: design-md-builder
description: Create, scaffold, or upgrade a project's DESIGN.md file — the brand and aesthetic source-of-truth that AI coding agents read before generating UI. Use when the user wants to define their visual identity, document their brand, set up design tokens for AI tools, scaffold a new project's design language, or fix a vague existing DESIGN.md. Triggers on requests like "create a DESIGN.md", "define our brand for Claude", "set up design tokens", "document our aesthetic", "scaffold the brand file", or any setup work the /craft-ui command depends on.
---

# DESIGN.md Builder

Your job is to produce a `DESIGN.md` file at the project root that is specific enough to actually constrain AI-generated UI. A vague DESIGN.md is worse than none — it gives false confidence while output drifts toward generic.

The work is mostly interrogation. Anyone can copy a template; your value is pushing the user past their first answer until they've decided something a model can act on.

## Operating principle

When the user gives a vague descriptor, push back with specifics. Examples:

- User says "modern and clean" → ask which kind: Apple/Linear restraint, brutalist swiss, editorial NYT, terminal/IDE, Japanese ma, mid-century printed, Bauhaus geometric. Or request 2–3 reference screenshots.
- User says "friendly approachable colors" → ask which brand's colors they would kill to have. Stripe approachable is not Notion approachable is not Linear approachable.
- User says "smooth animations" → ask which kind: Apple physical (springs, follow-through), Linear precise (200ms ease-out, near-invisible), Notion playful (soft overshoot), brutalist (instant, no motion), Disney (anticipation, squash).
- User says "professional" → ask for the anti-version. Professional like a law firm is not professional like Stripe is not professional like Bloomberg.

If the user resists specificity after two pushes, accept their answer and move on. Don't be precious.

## Phase 0 — Diagnose

First, check the project for an existing `DESIGN.md`. Three states:

1. **No file.** Greenfield. Run the full interrogation.
2. **File exists, vague.** Read it, identify which sections are too generic to act on, run interrogation only on those.
3. **File exists, specific.** Confirm with the user what they want changed. Don't rewrite what isn't broken.

Also read `package.json`, `tailwind.config.*`, and `app/globals.css` (or equivalent) to detect the stack. Tailwind v4 changes the token format. Note what you find.

## Phase 1 — Reference gathering

Before any abstract questions, ask for concrete references. The order matters: visual references first, words second.

Ask the user to provide:

1. **3 sites whose visual design they would steal if they could.** Real URLs.
2. **2 sites in their space whose design they actively dislike, and why.** This is often more diagnostic than the love list.
3. **Optional: 2–3 screenshots** they can paste directly. If they paste images, study spatial rhythm, type contrast, color dominance, and motion language. Tell them you will match those qualities, not copy literal layouts or branding.

If the user has nothing to point to, offer a short menu of named aesthetic directions they can pick from (see `references/examples.md`).

## Phase 2 — Brand identity

Get these decided in writing before moving on:

- **Name and one-line tagline.** Both verbatim from the user.
- **Aesthetic direction.** One named direction. Not a list. Not "modern minimalist." Examples that pass: "editorial brutalism," "warm terminal/IDE," "Japanese ma minimalism," "Stripe-Press editorial," "playful Memphis revival," "industrial Bauhaus."
- **3 adjectives the brand IS.** Specific, testable. "Confident" passes. "Good" doesn't.
- **3 adjectives the brand IS NOT.** This list is more useful than the IS list. Forces the user to reject something.
- **The single thing a visitor remembers in a week.** One sentence. If they can't answer, the brand isn't decided yet.

## Phase 3 — Type system

Push past Inter. The default font in 80% of AI-generated sites is Inter or Roboto. Forbid both unless the user explicitly insists with reasoning.

Decide:

- **Display family.** Bricolage Grotesque, Fraunces, Newsreader, Cabinet Grotesk, Clash Display, IBM Plex Sans, Söhne, GT America, or something distinctive from the user's reference set.
- **Body family.** Should contrast with display. If display is geometric sans, try a transitional serif. If display is editorial serif, pair with a clean sans or mono.
- **Mono family.** JetBrains Mono, IBM Plex Mono, Berkeley Mono, Geist Mono, or Commit Mono.
- **Weight extremes used.** 200/800 contrast hits harder than 400/600. State which weights are in play.
- **Modular scale.** Pick a ratio: 1.25 (conservative), 1.333 (balanced), 1.414 (editorial), 1.5+ (dramatic). Generate the scale from a base size.
- **Tracking rules.** Tight on display (-0.02 to -0.04em), zero on body, slightly open on caps and mono.

## Phase 4 — Color

Push past purple-on-white. The default AI palette is a generic SaaS blue or purple gradient on white. Forbid these unless the user has a real reason.

Decide in OKLCH (Tailwind v4 native, perceptually uniform, gamut-aware):

- **Background.** Light or dark base. If light, what tint (warm cream? cool gray? pure white only if you mean it).
- **Foreground.** Body text color. Not pure black unless brutalist.
- **Surface / elevated.** Cards, modals.
- **Border.** Often within 0.05 lightness of background.
- **Muted foreground.** Secondary text.
- **One dominant accent.** Not a palette of equal-weight colors. One accent that does the work.
- **Status colors.** Success, warning, error. These don't need to be branded; they need to be unambiguous.

Format every value as `oklch(L C H)` so it pastes directly into Tailwind v4 `@theme`.

## Phase 5 — Space and shape

- **Spacing scale.** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 is standard. Skip if you have reason; deviations should be intentional.
- **Border radius scale.** sm / md / lg / xl / full. Decide if the brand is sharp (0–4px), soft (8–16px), or pillowy (20px+).
- **Shadow philosophy.** Flat (no shadows, borders only), subtle (one elevation level), layered (Material-style multiple elevations), or atmospheric (large soft shadows for depth).
- **Layout grid.** Max content width, gutter, column count for desktop and mobile.

## Phase 6 — Motion

Push past "smooth." Decide:

- **Easing curve.** ease-out for most UI; specify the cubic-bezier. `cubic-bezier(0.16, 1, 0.3, 1)` is a common "expressive" ease-out.
- **Duration tiers.** fast (100–150ms), normal (200–250ms), slow (350–400ms). Anything over 400ms for state change is wrong.
- **Spring vs. duration.** Springs for interruptible interactions (drags, gestures). Durations for state change (open/close, fade).
- **Stagger rhythm.** Children animate 50–100ms apart. State the value.
- **What animates.** Only `transform` and `opacity`. Add `will-change` before, remove after.
- **`prefers-reduced-motion`.** Strict respect. State this explicitly so the agent encodes it.

## Phase 7 — Voice (optional but valuable)

If the project has marketing surface, decide:

- **Sentence length.** Punchy short, or long and considered.
- **Personality knobs.** Formal/casual, serious/playful, technical/plain.
- **Forbidden words.** "Effortlessly," "seamlessly," "leverage," "empower," "revolutionize," and any other words that immediately mark copy as AI or generic SaaS.
- **Voice references.** 1–2 brands whose copy voice the user wants to echo.

## Phase 8 — Forbidden defaults (project-specific)

This section is what makes the file actually work. Restate the universal forbidden defaults from the `/craft-ui` command, then add anything specific to this project's anti-personality. Examples:

- "No purple anywhere. We are not another purple SaaS."
- "No glassmorphism. No backdrop-blur on cards."
- "No three-column feature grids with centered icons."
- "No `cubic-bezier(0.4, 0, 0.2, 1)` (Material default). Use ours."

This list should grow over time as the team finds patterns the agent reaches for that don't fit.

## Phase 9 — Write the file

Use `references/template.md` as your structural target. Fill it with the decisions made above. Do not invent values for sections the user didn't decide; either ask or omit.

Show the user the full file in chat before writing to disk. Ask if they want changes. Apply them, then write to `DESIGN.md` at the project root.

After writing:

1. Confirm the file is consumable by the `/craft-ui` command (the section headers should match what the command's Phase 0 looks for).
2. Suggest two follow-ups: (a) drop forbidden-defaults additions into the file as patterns emerge, (b) re-read this file every time you start a new project surface, since it gets stale.

## Output format

Always show the file inline in the chat as a fenced markdown block before writing it to disk. The user should be able to copy-paste even if they don't want you to write the file.

## What this skill does NOT do

- Generate logos, illustrations, or visual assets.
- Pick fonts the user doesn't recognize. If the user says "I have no idea about fonts," show them three options with example contexts (an editorial site, a SaaS dashboard, a terminal-aesthetic landing) and let them pick by feel.
- Lock in choices. The user can come back any time and run this skill again on individual sections.

## Reference files

- `references/template.md` — the canonical structure to fill in.
- `references/examples.md` — three worked DESIGN.md files in different aesthetic directions for inspiration.
