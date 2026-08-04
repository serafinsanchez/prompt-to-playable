# US-09: "Explore more in the API Playground" CTA on the completion card

**kind:** ui

## TASK

When a live run finishes, the completion card offers a quiet link-out to Meshy's API playground. Clicking it copies the run's prompt to the clipboard (best-effort) and opens the playground in a new tab, so the visitor can rerun their own prompt against the raw API — the "go deeper" educational beat after the payoff.

## DEPENDENCIES

- P1 #7 (US-05, play + download — done): supplies `components/pipeline/completion-actions.tsx` and `completion.ts`.
- P2 #1 (US-07, signature completion moment — open): also touches `completion-actions.tsx` (motion only). **Not parallel-safe with US-07** — sequence around it.

## FILES TOUCHED

- `components/pipeline/completion.ts` (new exported `PLAYGROUND_URL` const)
- `components/pipeline/completion-actions.tsx` (CTA anchor, clipboard handler, transient feedback state)
- `tests/completion.spec.ts`, `tests/a11y.spec.ts`

## CONTEXT

- The playground URL is `https://www.meshy.ai/api-playground/text-to-3d/preview` — same target the CLI's `--playground` flag opens (`../claude-code-resources/print-pipeline.ts:15`). **The playground's form state ignores URL params entirely** (verified against production in the CLI work), so the prompt cannot be pre-filled via the link; the clipboard handoff is the only mechanism, and it must be best-effort.
- The CTA is an `<a href>` with an `onClick` side effect, not a `<button>` that calls `window.open`. Link semantics survive (cmd-click, middle-click, a11y tree, no popup-blocker involvement), and if `navigator.clipboard` is unavailable or rejects, default navigation still happens — the CTA degrades to a plain working link.
- Placement: bottom of the completion card, below the Play it / Download row (and below the open download list). "Play it" is the payoff US-05 was built around; this CTA is the tertiary "go deeper" nudge and must not compete with it. Visual treatment matches the download-list links: mono, muted → foreground on hover.
- The CTA renders in **every** completion branch, including expired and no-files. After Meshy's 3-day asset expiry the card currently degrades to honest copy with zero actions; the prompt is still valid playground material, so this becomes the one action that still works there.
- Clipboard feedback is a transient inline text swap on the card (~2s), not a toast — CLAUDE.md forbids toasts for pipeline events. `run.prompt` is always non-empty for a completed run (the pipeline can't start without one).
- `DESIGN.md`: pipeline/API text is mono; motion is transform/opacity only on `--duration-*`/`--ease-stage`; `prefers-reduced-motion` strictly honored.

## REQUIREMENTS

1. `completion.ts` exports `PLAYGROUND_URL = "https://www.meshy.ai/api-playground/text-to-3d/preview"`.
2. The completion card renders an anchor: label `Explore more in the API Playground ↗` (arrow `aria-hidden`), sub-caption `Click copies your prompt` in muted mono. `href={PLAYGROUND_URL}`, `target="_blank"`, `rel="noopener"`, `data-testid="playground-cta"`.
3. On click, `navigator.clipboard.writeText(run.prompt)` fires without preventing default navigation. On resolve, the sub-caption swaps to `Prompt copied` for ~2 seconds, then reverts. On reject/unavailable, no feedback change — the link has already navigated.
4. The CTA renders for every succeeded run: normal, expired, and empty-plan branches of `CompletionActions`.
5. States: `hover` (muted → foreground/accent per download-link treatment), `focus-visible` ring, `active` scale — consistent with existing card links. No disabled/loading states (static link, best-effort side effect). Feedback swap is opacity-only motion, removed under `prefers-reduced-motion`.
6. Tests (Playwright, `tests/completion.spec.ts`): CTA present with correct `href`/`target`/`rel` on a completed run; present in the expired branch; with clipboard permissions granted, clicking writes the run's prompt to the clipboard and shows `Prompt copied`. Axe scan in `tests/a11y.spec.ts` still passes with the completion card rendered.

## CONSTRAINTS

- Do NOT pass the prompt via URL params — the playground ignores them; a `?prompt=` that silently does nothing teaches the wrong lesson.
- Do NOT use a toast, portal, or stage-rail message for the copied feedback — inline on the card only.
- Do NOT block or delay navigation on the clipboard promise.
- Do NOT add the CTA to gallery characters' cards or per-stage rows — live-run completion card only; out of scope.
- Do NOT install packages, add non-token styles, or touch `lib/meshy/`.
- Do NOT change the CLI (`print-pipeline.ts`) — its opt-in `--playground` flag stays as is.

## ACCEPTANCE CRITERIA

- [ ] `npm run typecheck` passes; `npm run lint` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] `npx playwright test tests/completion.spec.ts tests/a11y.spec.ts` passes
- [ ] design-reviewer pass
- [ ] Screenshots captured at 1280 and 375 showing the CTA on the completion card
- [ ] Manual: click copies the prompt and the playground opens in a new tab; paste works

## DONE DEFINITION

Mark P2 #7 `[x]` in `docs/backlog/phase-2-ship.md`.
