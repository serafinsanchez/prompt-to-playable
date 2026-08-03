# US-02: Browse the gallery and swap characters

**kind:** ui

## TASK

Build the gallery UI: flip through every character in `public/gallery/manifest.json` with its prompt, credit cost, and generation time visible, swapping the playground character without a reload.

## DEPENDENCIES

- P1 #2.1
- P1 #3.1 (manifest schema + at least the knight entry; the 8+ count lands with P1 #3.2 and needs no UI change)

## FILES TOUCHED

- `components/gallery/` (new: gallery strip/cards, receipts display)
- `components/scene/` (character-swap wiring in the character slot only)
- `app/page.tsx`
- `tests/` (Playwright: swap without reload)

## CONTEXT

- Data source: `public/gallery/manifest.json`, shape `GalleryEntry` (`docs/ARCHITECTURE.md` §2 — `slug`, `prompt`, `glbPath`, `creditTotal`, `generationSeconds`, per-stage credits, poly count). Render **all** manifest entries — never a hard-coded subset; the count grows from 1 → 8+ when TASK-06b lands.
- Receipts are the DevRel point: prompt, credit cost, generation time visible per character — "the real price of what Meshy makes." Numbers are copy (DESIGN.md Voice): "55 credits. About 6 minutes."
- All pipeline/credit/stat text is mono (DESIGN.md type system — the mono voice is load-bearing).
- Swap mechanics: US-01a's character loader is manifest-shaped by construction (its CONSTRAINTS require it). Swapping = pointing the character slot at another entry's GLBs; controller and camera (US-01b, if landed) must survive the swap — idle starts immediately, never a frozen character. Preload on hover/focus so the swap feels instant; drei's `useGLTF.preload` is the pattern (see `app/spike/page.tsx` imports).
- Layout: overlay content per DESIGN.md — scene stays full-bleed hero; gallery is a thin receding overlay (strip or rail), max-width 1280px, 24px gutters. Stagger 60ms between cards. No three-column feature grid.
- Gallery cards are interactive components: hover, focus-visible, active, disabled (while its GLB loads), loading, error states all defined (CLAUDE.md rule).

## REQUIREMENTS

1. Gallery component renders one card per manifest entry (all of them), with thumbnail or slug, prompt, credit total, generation time; per-stage credit breakdown available (expand/hover — your call within DESIGN.md).
2. Selecting a card swaps the playground character in place — no navigation, no reload, no full-screen loading state; the outgoing character stays until the incoming one is ready (or a DESIGN.md-voiced inline state covers the gap).
3. Idle plays on the swapped-in character immediately; if US-01b has landed, controls keep working across swaps.
4. Keyboard path: cards reachable by Tab, activatable by Enter/Space; focus ring uses the accent token.
5. Manifest fetch failure or empty manifest shows an honest inline empty state (DESIGN.md voice), not a crash.
6. Playwright test: load page, click second gallery card (test fixture manifest with 2 entries if the real one still has 1), assert the character slot's source changed without a page navigation.

## CONSTRAINTS

- Do NOT rebuild the scene or character loader — extend the slot US-01a exposes.
- Do NOT hand-author gallery data in components; the manifest is the only source (CLAUDE.md data-completeness rule: render the full dataset).
- Do NOT modify `lib/meshy/`, the proxy, or `scripts/pregen/`.
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work
- [ ] Rendered card count === manifest entry count (state both numbers when reporting done)
- [ ] design-reviewer pass

## DONE DEFINITION

Mark P1 #4 `[x]` in `docs/backlog/phase-1-the-demo.md`.
