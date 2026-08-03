# Recommended skills (optional)

Install skills **once** on your machine so every repo can use them, or vendor copies under `.claude/skills/` for a fully self-contained clone.

Paths below assume [Claude Code / Cursor skill layout](https://docs.anthropic.com): each skill is a folder containing `SKILL.md`.

## Backlog and execution (matches `AGENTS.md` backlog workflow)

| Skill | Purpose |
|-------|---------|
| `backlog-intake` | Turn rough notes into inbox items. |
| `backlog-triage` | Move inbox items into phased backlog files. Tags each spec with `kind: ui \| backend \| infra`. |
| `pick-next-task` | Read phased backlog and suggest next work. |
| `kickoff-spec` | Execute a triaged spec with tests-pass verification gate. Used for `kind: backend` and `kind: infra`. |
| `plan-refine` | Stress-test a draft plan before implementation. |
| `ship-spec` | Merge / integrate completed spec (if you use that flow). |

## Slash commands (bootstrapped into the repo)

| Command | Purpose |
|---------|---------|
| `/craft-ui <what to build>` | Taste-first multi-phase frontend workflow with a visual review gate at 4 viewports. Used for `kind: ui` specs in place of the generic kickoff executor. |
| `/scaffold-component <Name> [variants] [sizes]` | Scaffold a UI primitive with full state coverage, story file, and variant matrix README. Used for design-system atoms. Runs `check-tokens.sh` automatically before exit. |
| `/forbid <pattern> — <reason>` | Append a project-specific forbidden default to `DESIGN.md`. Refuses vague forbids ("no ugly stuff") and demands a reason. Builds taste rules over time. |

All three live at `.claude/commands/` after bootstrap.

## Subagents (bootstrapped into the repo)

| Subagent | Purpose |
|----------|---------|
| `design-reviewer` | Read-only design critic. Takes screenshots at 4 viewports via Playwright MCP, critiques against `DESIGN.md`, returns specific diff suggestions. Never edits code. Invoke explicitly: "have the design-reviewer check this" after any UI change. |

Lives at `.claude/agents/design-reviewer.md` after bootstrap. Requires Playwright MCP (`claude mcp add playwright -- npx @playwright/mcp@latest`) for the visual half.

## Project-scoped skills (bootstrapped into the repo)

| Skill | Purpose |
|-------|---------|
| `design-md-builder` | Interrogate the user and produce a specific, non-generic `DESIGN.md` at the project root. Auto-invoked by `/craft-ui` Phase 0 when `DESIGN.md` is missing. |

Lives at `.claude/skills/design-md-builder/` after bootstrap (with `SKILL.md` + `references/template.md` + `references/examples.md`). Run it once at project setup, then re-run on individual sections when the brand sharpens.

## Token discipline + a11y gate (bootstrapped into the repo)

| File | Purpose |
|------|---------|
| `scripts/check-tokens.sh` | Bash linter that fails on raw Tailwind color literals (`bg-red-500`), hex codes in `className`, forbidden default fonts (Inter/Roboto/etc), and Material default easing. Runs on every Stop hook. |
| `.claude/settings.json` | Wires `scripts/check-tokens.sh` to the Stop hook. **Only written if missing**; if you have a settings.json already, merge the `hooks.Stop` block manually. |
| `tests/a11y.spec.ts` | Playwright + axe-core spec. Tests WCAG 2.1 AA + visible focus indicators across mobile/tablet/desktop viewports. Edit the `ROUTES` array to match your routes. Requires `npm i -D @axe-core/playwright @playwright/test`. |

## The closed loop

The bootstrapped pieces fit together as one workflow:

```
setup (once)
   ├─ design-md-builder skill   →  DESIGN.md
   ├─ claude mcp add playwright (manual)
   └─ npm i -D @axe-core/playwright @playwright/test (manual, for a11y gate)

build (per UI spec)
   ├─ /craft-ui  OR  /scaffold-component
   ├─ Stop hook runs check-tokens.sh    →  fails build on token violations
   └─ design-reviewer subagent          →  PASS / NEEDS CHANGES / FAIL

evolve
   ├─ /forbid <pattern>                 →  appends to DESIGN.md
   └─ tests/a11y.spec.ts in CI          →  catches WCAG regressions
```

## Execution dispatch

Triage tags each spec with a `kind`. Kickoff branches off it:

```
ready spec
   │
   ├─ kind: ui            → /craft-ui   (visual review gate)
   ├─ kind: backend       → kickoff-spec       (tests-pass gate)
   └─ kind: infra         → kickoff-spec       (tests-pass + smoke)
```

The verification gates are non-substitutable. A green test run does not prove a UI is good; a clean visual rubric does not prove a backend is correct.

Typical global locations (create if missing):

- `~/.claude/skills/<skill-name>/SKILL.md` — Claude Code
- `~/.cursor/skills/<skill-name>/SKILL.md` — Cursor (if you mirror skills there)

Compound / community skills often live under:

- `~/.cursor/plugins/.../skills/` — plugin bundles

## Continual learning / memory (bootstrapped into the repo)

Ported from the Cursor `continual-learning` plugin to the Claude Code stop-hook contract. Three pieces, all installed at the project level under `.claude/`:

| Piece | Path | Role |
|-------|------|------|
| Skill | `.claude/skills/continual-learning/SKILL.md` | Orchestration. Delegates to the subagent and returns the result. |
| Subagent | `.claude/agents/agents-memory-updater.md` | Mines transcript deltas, updates `AGENTS.md`, refreshes the index. Only writes `## Learned User Preferences` and `## Learned Workspace Facts`. |
| Stop hook | `.claude/hooks/continual-learning-stop.ts` | Bun TypeScript. Tracks cadence; on eligible Stop events emits `{"decision":"block","reason":"..."}` to inject a follow-up that runs the skill. |

Wired into `.claude/settings.json` Stop hook block alongside `check-tokens.sh`. Hook state lives at `.claude/hooks/state/` — gitignore that directory.

**Default cadence:** ≥10 turns + ≥120 min since last run + transcript mtime advanced.

**Trial mode** (≥3 turns, ≥15 min, expires after 24h) — set `CONTINUAL_LEARNING_TRIAL_MODE=1` in your env to enable while verifying the loop.

**Loop guard:** `stop_hook_active === true` short-circuits the hook to prevent infinite stop-block loops.

**Manual trigger:** invoke the `continual-learning` skill any time, or call `agents-memory-updater` directly.

**Cursor users:** the kit also seeds `.cursor/hooks/state/continual-learning-index.json` for the original Cursor plugin. Both paths are harmless if you only use one client.

## Minimal viable set

If you only want the **markdown workflow** without extra automation:

1. Use `CLAUDE.md` + `AGENTS.md` + `docs/backlog.md` only.
2. Add skills later when you want intake/triage automation.
