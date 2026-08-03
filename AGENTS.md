## Learned User Preferences

- Prefers tracking work in the in-repo markdown backlog (`docs/backlog.md` inbox plus `docs/backlog/phase-*.md`) as the task system of record, aligned with backlog-intake / backlog-triage skills.
- Frontend UI work uses `/craft-ui` (visual review gate at 4 viewports); backend / infra work uses `kickoff-spec` (tests-pass gate). Triage tags each spec with `kind: ui | backend | infra` so dispatch is unambiguous.
- `DESIGN.md` at repo root is the source of truth for visual decisions (brand, tokens, type, motion, forbidden defaults). `CLAUDE.md` covers code; `DESIGN.md` covers pixels. Don't overload one with the other.
- If `DESIGN.md` does not exist, run the `design-md-builder` skill **before** any UI work. `/craft-ui` Phase 0 will halt without it.
- After any UI change, invoke the `design-reviewer` subagent ("have the design-reviewer check this"). It is read-only and produces a structured PASS / NEEDS CHANGES / FAIL report against `DESIGN.md`. Apply its diff suggestions, re-invoke, repeat until PASS.
- The Stop hook in `.claude/settings.json` runs `scripts/check-tokens.sh` automatically. If the script fails, fix the violations or update `DESIGN.md` via `/forbid` if the rule itself is wrong.

## Learned Workspace Facts

- Next.js App Router + React Three Fiber + Tailwind v4 on Vercel; no database, no auth — the only persistence is Meshy task ids in `localStorage` and the visitor's API key in `sessionStorage`.
- Meshy API is CORS-blocked from browsers by design: all calls go through the `app/api/meshy/[...path]` passthrough proxy (path-allowlisted, key header rewritten, nothing stored). Text to 3D is v2, every other endpoint v1; full behavior reference in `../claude-code-resources/MESHY_CLAUDE.md`.

<!-- Add only durable, high-signal facts (not one-off debugging). Exclude secrets. -->
