# DESIGN.md

> The brand and aesthetic source-of-truth for AI coding agents working on this project.
> Read this before generating any UI. If a decision below contradicts a generic default, the file wins.

---

## Brand identity

- **Name:**
- **Tagline:**
- **Aesthetic direction:**
- **The brand IS:** _, _, _
- **The brand IS NOT:** _, _, _
- **One thing visitors remember:**

---

## Type system

- **Display:** [family], weights [200, 800]
- **Body:** [family], weights [400, 600]
- **Mono:** [family]
- **Modular scale:** base [16px], ratio [1.333]
  - 12 / 14 / 16 / 21 / 28 / 37 / 49 / 65 / 86
- **Tracking:**
  - Display: -0.03em
  - Body: 0
  - Mono: 0
  - Caps: +0.04em

---

## Color (OKLCH tokens)

```css
@theme inline {
  --color-bg:             oklch(_ _ _);
  --color-bg-elevated:    oklch(_ _ _);
  --color-fg:             oklch(_ _ _);
  --color-fg-muted:       oklch(_ _ _);
  --color-border:         oklch(_ _ _);
  --color-accent:         oklch(_ _ _);

  --color-success:        oklch(_ _ _);
  --color-warning:        oklch(_ _ _);
  --color-error:          oklch(_ _ _);
}
```

**Color philosophy:**
- Dominant move: [one sentence describing where the accent appears and where it doesn't]
- Forbidden combinations: [e.g. accent on accent, gradients across hue ranges]

---

## Space and shape

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128
- **Radius scale:**
  - sm: [4px]
  - md: [8px]
  - lg: [12px]
  - xl: [20px]
  - full: 9999px
- **Shadow philosophy:** [flat | subtle | layered | atmospheric]
- **Layout:**
  - Max content width: [1200px]
  - Gutter: [24px desktop, 16px mobile]
  - Columns: [12 desktop, 4 mobile]

---

## Motion

- **Easing:**
  - `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`
  - `--ease-in: cubic-bezier(0.7, 0, 0.84, 0)`
- **Durations:**
  - `--duration-fast: 150ms`
  - `--duration-normal: 220ms`
  - `--duration-slow: 380ms`
- **Springs:** for interruptible interactions only (drags, gestures, reorder)
- **Stagger:** children animate [80ms] apart
- **Properties animated:** `transform`, `opacity` only
- **`prefers-reduced-motion`:** respected strictly. Disable all non-essential motion.

---

## Voice

- **Sentence length:** [punchy | considered | mixed]
- **Personality knobs:** [formal/casual] · [serious/playful] · [technical/plain]
- **Voice references:** [brand 1], [brand 2]
- **Forbidden words:** effortlessly, seamlessly, leverage, empower, revolutionize, [add yours]

---

## Forbidden defaults

These are the AI defaults this project explicitly rejects. Do not use unless this file is updated:

- **Type:** Inter, Roboto, Open Sans, Lato, Arial, system stacks
- **Color:** purple gradients on white, generic SaaS blue/teal
- **Layout:** three-column feature grids with identical card heights and centered icons
- **Motion:** Material default easing, fade-in on scroll without intention, hover scales for decoration, durations over 400ms for state change
- **Backgrounds:** flat solid colors with no atmosphere, generic noise textures
- **Components:** unmodified shadcn/ui defaults shipped without remixing

**Project-specific rejections:**

- [add as patterns emerge]
