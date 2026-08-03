# Example DESIGN.md files

Three worked examples in different directions. Use as reference points when the user is unsure. Never copy verbatim; the value of a DESIGN.md is that it's specific to one project.

---

## Example 1 — Editorial brutalism

For a B2B analytics tool that wants to feel like a Bloomberg terminal designed by an editorial magazine.

```markdown
# DESIGN.md

## Brand identity

- **Name:** Ledger
- **Tagline:** The numbers, told straight.
- **Aesthetic direction:** Editorial brutalism
- **The brand IS:** declarative, dense, unsentimental
- **The brand IS NOT:** friendly, decorative, reassuring
- **One thing visitors remember:** the typography looks like a printed financial daily.

## Type system

- **Display:** GT Sectra, weights 400/700
- **Body:** GT America, weights 400/600
- **Mono:** Berkeley Mono
- **Modular scale:** base 16px, ratio 1.414
  - 11 / 14 / 16 / 23 / 32 / 45 / 64 / 90
- **Tracking:**
  - Display: -0.04em
  - Body: -0.005em
  - Mono: 0
  - Caps: +0.06em

## Color (OKLCH tokens)

```css
@theme inline {
  --color-bg:             oklch(0.98 0.005 85);   /* warm cream */
  --color-bg-elevated:    oklch(1 0 0);
  --color-fg:             oklch(0.15 0.01 85);
  --color-fg-muted:       oklch(0.45 0.01 85);
  --color-border:         oklch(0.12 0.01 85);    /* near-black borders */
  --color-accent:         oklch(0.55 0.22 25);    /* terminal red */

  --color-success:        oklch(0.55 0.18 145);
  --color-warning:        oklch(0.75 0.18 75);
  --color-error:          oklch(0.55 0.22 25);
}
```

**Color philosophy:**
- Dominant move: black 1px borders everywhere; accent red used only for negative numbers and destructive actions.
- Forbidden combinations: red on red, any gradient, any color outside this palette.

## Space and shape

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128
- **Radius scale:** sm: 0, md: 0, lg: 2px, xl: 4px, full: 9999px (reserved for badges only)
- **Shadow philosophy:** flat. No shadows. Borders do all separation.
- **Layout:** max 1280px, 32px gutter, 12 columns.

## Motion

- **Easing:** `--ease-out: cubic-bezier(0.2, 0, 0, 1)` (snappy, near-linear out)
- **Durations:** fast 100ms, normal 160ms, slow 220ms
- **Springs:** none. Brutalism is durations only.
- **Stagger:** 60ms.
- **Properties animated:** transform, opacity.
- **prefers-reduced-motion:** strict.

## Voice

- **Sentence length:** punchy.
- **Personality knobs:** formal, serious, technical.
- **Voice references:** Bloomberg, FT Alphaville.
- **Forbidden words:** effortlessly, seamlessly, journey, magic, beautiful, delight.

## Forbidden defaults

- All universal defaults from the /craft-ui command.
- No purple anywhere. No blue.
- No rounded cards. Squares with borders only.
- No gradients of any kind.
- No glassmorphism, backdrop-blur, or transparency stacks.
- No emoji in product UI.
```

---

## Example 2 — Warm terminal

For a developer tool that wants the warmth of a writing app and the density of an IDE.

```markdown
# DESIGN.md

## Brand identity

- **Name:** Forge
- **Tagline:** Write code like you mean it.
- **Aesthetic direction:** Warm terminal / IDE-as-editorial
- **The brand IS:** crafted, opinionated, quiet
- **The brand IS NOT:** corporate, gamified, loud
- **One thing visitors remember:** it feels like writing in a leather notebook with a monospace pen.

## Type system

- **Display:** Söhne Breit, weights 300/700
- **Body:** Newsreader, weights 400/600
- **Mono:** Commit Mono, weights 400/700
- **Modular scale:** base 16px, ratio 1.25
  - 13 / 14 / 16 / 20 / 25 / 31 / 39 / 49 / 61
- **Tracking:**
  - Display: -0.02em
  - Body: 0
  - Mono: 0

## Color (OKLCH tokens)

```css
@theme inline {
  --color-bg:             oklch(0.16 0.015 60);   /* warm dark brown */
  --color-bg-elevated:    oklch(0.20 0.015 60);
  --color-fg:             oklch(0.92 0.02 75);    /* cream */
  --color-fg-muted:       oklch(0.62 0.02 75);
  --color-border:         oklch(0.28 0.015 60);
  --color-accent:         oklch(0.78 0.16 65);    /* burnt orange */

  --color-success:        oklch(0.72 0.16 145);
  --color-warning:        oklch(0.78 0.16 65);
  --color-error:          oklch(0.65 0.20 25);
}
```

**Color philosophy:**
- Dominant move: warm dark base, cream type, single orange accent reserved for syntax highlighting and primary CTA only.
- Forbidden combinations: any cool blue, any pure black, any pure white.

## Space and shape

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128
- **Radius scale:** sm: 4, md: 6, lg: 8, xl: 12, full: 9999
- **Shadow philosophy:** subtle. One elevation: `0 1px 0 rgba(0,0,0,0.4)` on cards.
- **Layout:** max 960px (this is a writing-first product), 24px gutter, 8 columns.

## Motion

- **Easing:** `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`
- **Durations:** fast 140ms, normal 200ms, slow 320ms
- **Springs:** for cursor and selection states only.
- **Stagger:** 70ms.
- **Properties animated:** transform, opacity.
- **prefers-reduced-motion:** strict.

## Voice

- **Sentence length:** considered. Short paragraphs. White space matters.
- **Personality knobs:** casual, serious, technical.
- **Voice references:** iA Writer, Stripe Press, Are.na.
- **Forbidden words:** effortlessly, seamlessly, supercharge, AI-powered (in marketing).

## Forbidden defaults

- All universal defaults from the /craft-ui command.
- No light mode unless the user explicitly toggles it. Dark is the brand.
- No gradient buttons. Solid orange or transparent.
- No cool grays. All grays warm-tinted.
- No sans-serif body type.
```

---

## Example 3 — Stripe-Press editorial

For a marketing site that wants the gravitas of a publishing house and the precision of a payments company.

```markdown
# DESIGN.md

## Brand identity

- **Name:** Lattice
- **Tagline:** Infrastructure for serious people.
- **Aesthetic direction:** Stripe-Press editorial
- **The brand IS:** precise, considered, confident
- **The brand IS NOT:** casual, viral, trend-chasing
- **One thing visitors remember:** the type pairing — a humanist serif with a geometric mono.

## Type system

- **Display:** Fraunces, weights 300/700, slight optical sizing on large
- **Body:** Söhne, weights 400/500
- **Mono:** Söhne Mono, weight 400
- **Modular scale:** base 17px, ratio 1.333
  - 13 / 15 / 17 / 23 / 30 / 40 / 53 / 71
- **Tracking:**
  - Display: -0.025em
  - Body: -0.005em
  - Mono: 0
  - Caps: +0.05em

## Color (OKLCH tokens)

```css
@theme inline {
  --color-bg:             oklch(0.99 0.003 95);   /* off-white */
  --color-bg-elevated:    oklch(1 0 0);
  --color-fg:             oklch(0.18 0.01 270);
  --color-fg-muted:       oklch(0.50 0.01 270);
  --color-border:         oklch(0.90 0.01 270);
  --color-accent:         oklch(0.55 0.18 250);   /* deep navy-indigo */

  --color-success:        oklch(0.60 0.16 150);
  --color-warning:        oklch(0.75 0.16 75);
  --color-error:          oklch(0.55 0.22 25);
}
```

**Color philosophy:**
- Dominant move: 95% off-white and ink-black; navy accent appears only on primary actions and editorial pull-quotes.
- Forbidden combinations: navy on any color other than off-white. No tints of accent in backgrounds.

## Space and shape

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 / 192
- **Radius scale:** sm: 2, md: 4, lg: 6, xl: 10, full: 9999
- **Shadow philosophy:** atmospheric. One large soft shadow for elevation: `0 24px 48px -16px rgba(20, 24, 60, 0.12)`.
- **Layout:** max 1180px content, 1440px hero. Generous 64–96px section padding desktop. 12-col grid.

## Motion

- **Easing:** `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (expressive ease-out)
- **Durations:** fast 160ms, normal 240ms, slow 400ms
- **Springs:** for hero parallax and image reveal only.
- **Stagger:** 90ms (slow, considered).
- **Properties animated:** transform, opacity.
- **prefers-reduced-motion:** strict.

## Voice

- **Sentence length:** mixed. Long, considered sentences with short punctuating ones.
- **Personality knobs:** formal, serious, plain.
- **Voice references:** Stripe Press, The Browser, Granta.
- **Forbidden words:** effortlessly, seamlessly, supercharge, magic, journey, unlock, leverage, empower.

## Forbidden defaults

- All universal defaults from the /craft-ui command.
- No card grids on landing. Use editorial layouts: pull-quotes, runaround text, full-bleed images.
- No emoji in marketing copy.
- No gradient buttons. Solid navy or text-only.
- No more than two CTAs visible at once.
- No animations on scroll triggered by initial viewport entry without delay; let content settle first.
```
