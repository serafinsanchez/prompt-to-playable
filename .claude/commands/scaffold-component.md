---
description: Scaffold a new UI primitive with full state coverage, story file, and variant matrix README. Use for design-system atoms.
argument-hint: <ComponentName> [variants comma-sep] [sizes comma-sep]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Scaffold Component: $ARGUMENTS

Create a fully-formed UI primitive consumable by the rest of the app. Three files, one component.

## Steps

1. **Read `DESIGN.md`.** Stop if absent.
2. **Parse `$ARGUMENTS`.** Extract component name and (optional) variant + size lists. If only the name was given, propose a sensible matrix in one sentence and confirm before continuing.
3. **Read `components/ui/`** to match existing patterns: how does the project use CVA, forwardRef, slot composition, naming conventions? Mirror them.
4. **Generate three files.**

### File 1: `components/ui/<name>.tsx`

- Use `class-variance-authority` for variants. No ad-hoc `if/else` style props.
- `forwardRef` for any interactive primitive.
- Use semantic tokens only. No literal Tailwind colors, hex values, or hardcoded spacing that bypasses the scale.
- Define every state explicitly:
  - `:hover` — visible affordance, never decorative scale > 1.02
  - `:focus-visible` — 3:1 contrast indicator, use accent ring or outline
  - `:active` — pressed state
  - `:disabled` — `pointer-events-none`, reduced opacity, cursor-not-allowed
  - Loading prop and visual treatment if applicable
  - Error prop and visual treatment if applicable
  - Empty state if applicable (selects, lists)
- Honor `prefers-reduced-motion` for any motion in the component.
- Use semantic HTML first. Add ARIA only when semantics aren't enough.

### File 2: `components/ui/<name>.stories.tsx`

- One story per variant.
- One story per state: Default, Hover (use `parameters.pseudo`), Focus, Active, Disabled, Loading, Error, Empty.
- A `Matrix` story that renders the full variant × state grid for visual regression.

### File 3: `components/ui/<name>.md`

A short README documenting:

- Purpose in one sentence.
- Variant matrix as a table.
- Props table with types and defaults.
- Composition examples (when to use, when not to).
- Accessibility notes (keyboard interactions, ARIA, focus behavior).

## After scaffolding

5. **Run the token check.** Execute `bash scripts/check-tokens.sh components/ui/<name>.tsx`. If it fails, fix and rerun.
6. **Suggest review.** End with a one-liner suggesting the user invoke the design-reviewer subagent on the new component.

## Hard rules

- No raw color literals. No raw spacing literals outside the scale. Token-mapped utilities only.
- Every variant has a story.
- Every state is reachable in Storybook.
- Forward refs on interactive elements.
- If you cannot satisfy a rule (e.g., the spec demands a non-token color), stop and ask the user whether to update DESIGN.md or change the spec.
