# TASK-02: Scaffold app shell with DESIGN.md tokens and deploy

**kind:** infra

## TASK

Stand up the Next.js App Router project in this repo with the full DESIGN.md token system, fonts, verification scripts, and a token-styled placeholder page, deployed to Vercel.

## DEPENDENCIES

None

## FILES TOUCHED

- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint` config, `vitest.config.ts`, `playwright.config.ts`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- `.gitignore` (append build outputs if missing)

## CONTEXT

- The repo root already contains the agent-workflow kit (`CLAUDE.md`, `DESIGN.md`, `docs/`, `.claude/`, `prompts/`, `scripts/check-tokens.sh`, `tests/a11y.spec.ts`). Scaffold **in place** without clobbering any existing file — if `create-next-app` refuses a non-empty dir, scaffold in a temp dir and copy config/app files over.
- Token values, fonts, radii, motion: `DESIGN.md` at repo root. All colors are OKLCH; declare them as Tailwind v4 `@theme inline` custom properties in `app/globals.css`.
- Fonts via `next/font/google`: Bricolage Grotesque (200/800), IBM Plex Sans (400/500), IBM Plex Mono (400/600), each exposed as a CSS variable consumed by the `@theme` font tokens.
- Command names must match `CLAUDE.md` §Commands (`dev`, `lint`, `typecheck`, `test`, a11y via Playwright, token check via `bash scripts/check-tokens.sh`).
- Stack decisions and rationale: `docs/ARCHITECTURE.md` §1.

## REQUIREMENTS

1. Next.js (latest stable) App Router + TypeScript + ESM; React 19; Tailwind v4 wired through PostCSS.
2. `app/globals.css` defines every DESIGN.md token (colors, font families, radius scale, easing, duration tiers) as `@theme` values; no hex literals anywhere in components.
3. `app/layout.tsx` loads the three font families and applies background/foreground tokens; metadata title "Prompt to Playable".
4. `app/page.tsx` placeholder: tagline "Type a character. Play it." in Bricolage 800 at a hero size from the type scale, one mono caption line — styled entirely from tokens. This page is throwaway; do not gold-plate.
5. `package.json` scripts: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run), `test:a11y` (playwright), `check:tokens`.
6. Vitest configured with a trivial passing smoke test so `npm run test` is green from day one; Playwright configured to run `tests/a11y.spec.ts` against the dev server.
7. Deploy to Vercel (project link + production deploy). If Vercel auth requires interactive login, surface the exact command for the user to run rather than skipping silently.

## CONSTRAINTS

- Do NOT modify `CLAUDE.md`, `DESIGN.md`, `docs/**`, `.claude/**`, `prompts/**`, `AGENTS.md`.
- Do NOT add UI beyond the placeholder page. No components/, no scene, no routes.
- No light mode, no theme toggle (DESIGN.md forbidden defaults).
- Forbidden: install packages other than those listed under "Allowed packages" below.
- Allowed packages: `next`, `react`, `react-dom`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `eslint`, `eslint-config-next`, `vitest`, `@playwright/test`, `@axe-core/playwright`, `tsx`

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes (smoke test)
- [ ] `npm run lint` passes; `bash scripts/check-tokens.sh` passes
- [ ] `npm run dev` serves the placeholder styled from tokens (fonts visibly loaded — Bricolage hero, mono caption)
- [ ] Production Vercel URL serves the same page (or the exact blocking auth step is reported)

## DONE DEFINITION

Mark P0 #1 `[x]` in `docs/backlog/phase-0-foundation.md`.
