# TASK-08: README as landing page + repo publish

**kind:** infra

## TASK

Write the README as a landing page — hero GIF, live link up top, 60-second quickstart, how-the-pipeline-works with real API calls, credit-cost table — add the MIT license, and finish the publish checklist for the already-public repo.

## DEPENDENCIES

- P2 #1 (the hero shot/GIF captures the signature moment — shoot it after the polish lands)

## FILES TOUCHED

- `README.md` (new)
- `LICENSE` (new)
- `public/` or `docs/` (hero GIF/screenshot asset — pick one home, keep it out of the app bundle)
- `.github/` (only if a social-preview note is needed; optional)

## CONTEXT

- **The repo is ALREADY PUBLIC** at `github.com/serafinsanchez/prompt-to-playable` with the final lean name and a description ("Type a character. Play it."). The inbox item's "decide final name and publish" is done; what's missing is everything a visitor sees: there is **no `README.md` and no `LICENSE`** at the repo root today.
- **Because it's already public, do a history hygiene check first:** confirm no `.env`, API key, or `.pregen/` state ever hit a commit (`git log --all --diff-filter=A -- .env* .pregen/` plus a grep of history for `msy_` key prefixes; the only key that may legitimately appear is the documented test-mode key `msy_dummy_api_key_for_test_mode_12345678`). `.gitignore` covers `.env*`, `.vercel/`, `spike-output/`, `.pregen/` — verify nothing predates those rules. If anything real leaked, STOP and surface it (rotation + history rewrite is a user decision).
- **Live link:** the Vercel project `prompt-to-playable` is linked (`.vercel/project.json`). Verify a production deployment exists and loads before putting the URL in the README; if there's no prod deploy yet, run one (`vercel --prod` / the vercel:deploy flow) — the README's first CTA is the live demo.
- **Quickstart source material exists:** `GETTING-STARTED.md` at repo root already covers local setup — distill to 60 seconds (clone → `npm i` → `npm run dev`; note the zero-credit test-mode key for keyless dev, per CLAUDE.md conventions). Link out to GETTING-STARTED.md for depth rather than duplicating it.
- **How-the-pipeline-works with real API calls:** the source of truth is `components/pipeline/api-descriptor.ts` (US-04) — it derives every stage's real request from `lib/meshy/client.ts` constants and is sync-tested against the client, so quote it rather than hand-writing curl. Credit table: `STAGE_CREDITS` in `lib/meshy/types.ts` (55 total: preview → refine → remesh → rig → animate ×5). Voice per DESIGN.md: numbers are copy — "55 credits. About 6 minutes."
- **Hero:** a GIF of the signature stage-completion beat or the type-it-play-it loop. Keep it small (<5MB ideally); a static hero shot + short GIF is fine. Existing capture tooling: Playwright screenshots were used for US-05 review (see repo-root `us05-*.png` in the parent workspace for the flavor).
- **Audience per PRD §context:** dual — the developer it targets and the Meshy hiring team evaluating whether it would convert that developer. The README *is* deliverable #2's centerpiece.

## REQUIREMENTS

1. History hygiene check per CONTEXT runs first and comes back clean (or stops the task).
2. `README.md`: hero shot/GIF + one-line pitch, live Vercel link in the first screenful, 60-second quickstart, how-the-pipeline-works section showing the real per-stage API calls, credit-cost table (55 total), link to `GETTING-STARTED.md`, MIT badge/mention, brief "built with" (Next.js, R3F, Meshy API).
3. `LICENSE`: MIT, current year, user's name.
4. Verified live production URL in the README (click it after writing it).
5. Every API path/credit number in the README traces to `api-descriptor.ts` / `STAGE_CREDITS` — no hand-typed drift.
6. GitHub repo About section: description already set; add the live URL as the website field.

## CONSTRAINTS

- Do NOT modify app code, `lib/meshy/`, or components — this is a docs/publish task.
- Do NOT commit the hero asset into a path that ships in the app bundle unnecessarily (`docs/` or a README-referenced `public/` path is fine; keep it out of first-load).
- Do NOT rewrite git history or rotate keys unilaterally if the hygiene check finds something — surface it.
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] A dev who only reads the README can run it locally and knows what the API costs (self-review against this sentence)
- [ ] `README.md` renders correctly on GitHub (check the live rendering, including the GIF)
- [ ] `LICENSE` present; repo public under final name (already true — re-verify)
- [ ] History hygiene check documented as run, with result
- [ ] `npm run test` still green (nothing should have changed, prove it)

## DONE DEFINITION

Mark P2 #3 `[x]` in `docs/backlog/phase-2-ship.md`.
