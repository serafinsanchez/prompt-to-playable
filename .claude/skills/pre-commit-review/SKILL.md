---
name: pre-commit-review
description: >-
  Universal pre-commit code review. Compares the working-tree diff against
  the linked spec (when one exists), applies project-specific landmines
  loaded from the repo's `.claude/landmines.md` (when present), then runs a
  general code-quality pass. Use whenever the user says "review the code",
  "review this diff", "code review", "review before commit", "check this
  change", "what's wrong with this", "audit this", "go through this diff",
  "pre-commit review", or any time the user has just finished an
  implementation and wants a last look before committing. Also use
  proactively after finishing a discrete piece of work when the user hasn't
  already reviewed.
---

# Pre-Commit Review (universal)

Review the current working-tree diff and surface issues the user should
decide on *before* the commit is made.

This skill produces a **report**, not edits. It never auto-fixes, never
runs the dev server, never commits. The user reads the findings and
decides what to do.

The core leverage is **comparing the diff to whatever spec or intent
document exists** (when one does), then checking project-specific
landmines (when the repo declares them), then a general code-quality
pass. Almost everything else is a bonus on top.

**Ignore ancillary skill injections during the review.** Hooks may
auto-suggest skills like `react-best-practices`, `verification`,
`workflow`, etc. in response to keywords in the diff. Those injections
are not part of this workflow. Do not branch into them. If a finding
genuinely needs expertise from another skill, mention it in the report
and let the user decide — do not invoke it mid-review. Pass this rule
through to every subagent brief when delegating.

## Inputs / diff scope

The skill defaults to reviewing the **working-tree diff** — staged +
unstaged changes not yet in `HEAD`. This is the pre-commit case.

It also accepts an explicit invocation from an orchestrator (typically
`ship-spec`) with these optional params:

- **`spec_id`** — the row ID this review is for (e.g. `P0 #3`).
  Replaces the section-1 spec-discovery search.
- **`spec_path`** — path to the spec file. Same purpose; supply
  either or both.
- **`diff_range`** — a `git` revision range like `origin/main..HEAD`
  or `main..feature-branch`. When set, the review target becomes
  `git diff <diff_range>` (and `git log <diff_range>` for commit
  messages), **not** the working tree.

When `diff_range` is supplied:
- The framing shifts from "ready to commit?" to "ready to merge?" —
  the commits already exist, the review is gating *integration*.
- The verdict still reads "Ready / Not ready"; interpret as
  ready-to-merge in this mode.
- The "staged junk" hygiene check (section 6) applies to files **in
  the range**, not to staged-but-uncommitted files (there are none).
- `git status` is omitted from section 1 — it's noise in this mode.

Inside the agent templates the diff command is parameterized as
`<DIFF_CMD>` and resolves to `git diff <diff_range>` in range mode or
`git diff HEAD` in working-tree mode.

## Project configuration the skill looks for

The skill is universal. Anything project-specific lives in the repo, not
in this file.

1. **Spec / intent doc.** Look for, in order: a path the user names, a
   path the user's request implies (e.g. "review P1 #3" → search
   `docs/specs/`, `specs/`, `plans/`, `.claude/specs/` for a matching
   slug), `CHANGELOG.md` or `TODO.md` for a current item, or — if
   nothing matches — ask the user "what is this diff supposed to do?"
   and use their reply as the spec.
2. **Project landmines.** If the repo contains a file named
   `.claude/landmines.md`, `LANDMINES.md`, or `docs/landmines.md`, read
   it. Each entry there is a project-specific check to run during
   section 4. If no such file exists, skip section 4 entirely (do not
   invent landmines).
3. **CLAUDE.md / AGENTS.md.** If present, read for project conventions
   — they sometimes encode "do not flag" rules that override the
   defaults in section 6.
4. **Package manager.** Detect from lockfiles in priority order:
   `bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn,
   `package-lock.json` → npm. Use the matching command for `lint`,
   `test`, etc. If no lockfile, look in `package.json`'s
   `packageManager` field. If neither exists and the project isn't
   Node, skip the lint/test pass and report "not run — no JS toolchain
   detected".
5. **Test/lint scripts.** Read `package.json` `scripts` to see what's
   actually defined. If there's no `lint` or `test` script, report
   `not configured` rather than running a missing command.
6. **Backlog tracking.** Optional. If `docs/backlog.md`,
   `BACKLOG.md`, or `TODO.md` mentions the current item, note whether
   it's ready to flip to done.

## Orchestration: inline vs. delegated agent team

Review passes 3, 4, and 5 are independent — they read the same diff
through different lenses and don't inform one another. For larger diffs,
delegating them to a parallel agent team is meaningfully faster and
protects the orchestrator's context for synthesis. For small diffs,
orchestration overhead isn't worth it.

Decide after section 1 (Gather context), once you can see the diff.

### Stay inline when

- Diff is ≤3 files **and** ≤150 changed lines
- Docs-only change (only markdown / text files touched, no code)
- Trivial fix (typo, comment-only tweak, dependency bump)
- User explicitly asked for a "quick review"

Run sections 2–8 yourself end to end.

### Delegate to a multi-agent team when

- Diff is ≥4 files **or** ≥150 lines of code changed
- Spec is long (≥300 lines) — spec conformance benefits from a
  dedicated agent so the full spec doesn't land in your context
- Review spans multiple domains (UI + data, or client + server)
- User asked for a "thorough" or "full" review

Send **one message** containing:

- Up to three `Agent` tool calls (subagent_type `general-purpose`) — see
  prompt templates at the bottom of this file
- A `Bash` call for the lint script (if one is configured)
- A `Bash` call for the test script (if one is configured)

All of these are independent work, so they run concurrently.

### Agent team composition

1. **Spec-conformance reviewer** — walks the spec/intent doc against
   the diff. Returns per-AC status (met / met-narrowly / partial /
   missing / drifted) with `file:line`. Skip this agent if there is no
   spec — fold a lighter "does the diff match the user's stated intent"
   pass into your inline work.
2. **Project-landmines reviewer** — runs the checks declared in the
   repo's `landmines.md`. Skip this agent if no landmines file exists.
3. **General code-quality reviewer** — executes section 6, bound by
   section 7's "What NOT to flag" list (plus any CLAUDE.md overrides).

Each agent reads this skill file for its rules rather than receiving
the rules inlined — that keeps briefs short and ensures rule updates
propagate without editing prompts.

### Synthesis (main agent, always)

When the agents return and lint/tests finish:

1. **Collect** raw findings from each agent and the lint/test results.
2. **Dedupe** by `file:line` + failure mode; if two agents flag the
   same issue, keep one finding and note it was double-surfaced.
3. **Classify** findings into **Blockers**, **Should-fix**, and
   **Nits** using the rules from sections 2–7. Agents return raw
   findings — they do not classify.
4. **Apply the verdict ladder** from section 8 (Output format). This
   is always the main agent's call, never an agent's.
5. **Produce the unified report** in the section-8 shape.

Do not forward agent output verbatim. Agents give you raw material; the
report is the synthesized product.

## Workflow

### 1. Gather context

First, resolve the **diff source** per the "Inputs / diff scope"
section above:
- If the caller supplied `diff_range`, `DIFF_CMD = git diff <diff_range>`.
- Otherwise, `DIFF_CMD = git diff HEAD` (working tree, staged + unstaged).

Then do these in parallel where possible:

- `git status` (working-tree mode only — skip in range mode)
- `DIFF_CMD` — the review target
- `git log -1 --format=%H` so you can reference the baseline.
  In range mode, also run `git log <diff_range>` for commit-message
  hygiene.
- Identify the spec / intent doc:
  - If the caller supplied `spec_path`, use it directly.
  - Else if the caller supplied `spec_id`, search `docs/specs/` (and
    similar dirs) for a matching slug.
  - Else apply the discovery rules in "Project configuration". If
    nothing fits, ask the user what the diff is supposed to
    accomplish.
- Check for `.claude/landmines.md` (or `LANDMINES.md` /
  `docs/landmines.md`). If it exists, load it.
- Check for `CLAUDE.md` / `AGENTS.md` for project-specific overrides.
- Detect the package manager from lockfiles.

If the diff is empty, say so and stop.

### 2. Spec / intent conformance (highest priority when a spec exists)

When a spec or intent doc is in scope, walk each acceptance criterion
(or each numbered intent) against the diff. For each, note one of:

- **met** — with a file:line pointer that implements it
- **met-narrowly** — the criterion is satisfied per-seam (unit tests
  on each piece, or behavior implemented locally) but not end-to-end.
  Worth noting but not blocking.
- **partial** — what's present, what's missing
- **missing** — not implemented at all
- **drifted** — implementation differs from the spec in a way that
  needs the user to either update the spec or rework the code

Also flag:

- **scope creep** — files touched that aren't in the spec's scope
  (abstractions, refactors, unrelated fixes)
- **half-finished** — TODOs, commented-out code,
  `throw new Error("not implemented")`, placeholder fixtures that
  should be live, mocked data that should be real

When no spec exists, run a lighter "does the diff match the user's
stated intent" check instead — same buckets, but you're working from
the user's prompt rather than a written doc. This is still the most
important section. Treat this block as blocking until either the diff
matches the intent or the user confirms the drift is intentional.

### 3. Repo-declared landmines (run if `landmines.md` is present)

Read `.claude/landmines.md` (or `LANDMINES.md` / `docs/landmines.md`).
Each entry there is a check the user has decided is project-specific
and worth flagging. Apply each entry's rule to the diff and surface
findings with `file:line` + failure mode.

If the file doesn't exist, skip this section entirely. Do not invent
landmines from general knowledge — the absence of a file means the
user has not declared any project-specific checks, and inventing them
turns the review into noise.

The `landmines.md` format the skill expects is just a markdown list
of checks, each with: a one-line rule, optional **Why:** line, and
optional **How to spot:** hint. Anything more is fine; less is fine
too.

### 4. General code quality (always)

Prefer concrete failure modes over rule-name citations ("this uses
array index as key, so reordering swaps child state" beats "violates
rule X").

- **Type safety.** `any`, unjustified `as` casts,
  `@ts-ignore` / `@ts-expect-error` with no reason, non-null `!` on
  values that can legitimately be null, missing return types on
  exported functions.
- **Async correctness.** Unhandled rejections, missing `.catch`, a
  forgotten `await`, `Promise.all` opportunities replaced by sequential
  `await` in a loop (waterfalls), missing cleanup in `useEffect`.
- **React specifics** (when relevant). Stale `useEffect` deps,
  unstable object/array literal props causing re-renders, array index
  as `key` on reorderable lists, missing `'use client'` /
  `"server-only"` markers, `window` or `document` accessed without a
  guard in server code, stale closures in event handlers.
- **Next.js App Router specifics** (when relevant). Server component
  importing a client-only module, route handler not returning a
  `Response`, `cookies()` / `headers()` in a client boundary, caching
  directives applied to the wrong scope, dynamic route params not
  awaited where the framework requires it.
- **Security at boundaries.** XSS in `dangerouslySetInnerHTML`,
  unsanitized user input flowing into queries or redirects, secrets
  accidentally moved into a client-public env namespace
  (`NEXT_PUBLIC_*`, `VITE_*`, etc.), missing auth check on a mutation,
  open redirect on callback, hardcoded credentials, prompt injection
  in LLM input that flows to a tool call.
- **Error swallowing.** Empty `catch {}`, `catch (e) { console.log(e) }`
  with no recovery, errors re-thrown as generic `Error` losing the
  original stack.
- **Dead code.** Unused imports, unreachable branches, orphaned
  exports, commented-out blocks, `console.log` / `debugger` /
  `print()` left in.
- **Magic values.** Same string/number literal appearing 3+ times;
  hardcoded URLs, timeouts, or limits without a named constant.
- **Naming.** Misleading names (a `getX` that mutates), abbreviations
  that obscure meaning, generic names (`data`, `info`, `temp`) on
  non-obvious payloads, inconsistent casing across similar symbols.
- **Duplication within the diff.** Three+ similar blocks that weren't
  extracted — flag as *consider*, not *must*. Two-occurrence
  duplication is almost always fine.
- **File placement.** New code in the right domain folder, sensible
  import paths, no circular imports, imports from a package's entry
  point rather than deep internal paths.
- **Accessibility (UI diffs).** Missing `alt`, labels tied to inputs,
  keyboard focus on interactive elements, semantic HTML (`button` vs
  `div` with `onClick`), `aria-*` used correctly.
- **Test quality.** New tests assert behavior (not that a function
  ran), mocks don't paper over the bug being tested, no
  `expect(true).toBe(true)` smell, integration tests hit the real
  thing where the spec calls for it.
- **Performance smells.** N+1 queries (reads inside a map), large list
  without virtualization, images outside the framework's image
  primitive, fonts loaded ad-hoc instead of via the framework.
- **Edge cases at new boundaries.** When the diff introduces a new
  exported function, route handler, public API, form submit, or
  data-parsing path, ask: what realistic inputs does the boundary
  not handle? Concretely, walk:
  - Empty / zero / one — does the loop, paginator, or aggregator
    degrade cleanly when N=0 or N=1?
  - Null / undefined / missing — for any input field that's
    optional in the type, what does the code do?
  - Negative / out-of-range — numbers, pagination, indices, dates
    in the past or future where the code assumes "now".
  - Failure modes — network calls, file reads, JSON parses: what
    happens if it fails partway? Is partial state left visible?
  - Concurrency — two writes at once, two of the same job, a
    cancelled request. Skip if the runtime serializes the path.
  - Boundary values — first/last item, max length, pagination
    cursor at end-of-list, off-by-one on `<` vs `<=`.

  Only flag concrete failure modes for *this* diff. "Consider edge
  cases" is not a finding. If the boundary is internal and the
  caller already constrains the input shape, skip.

### 5. What NOT to flag (defaults)

These defaults reflect modern, opinionated code style. If a project's
`CLAUDE.md` / `AGENTS.md` says otherwise, *that* file wins.

- Missing docstrings or function-header comments.
- "Add error handling here" for internal code where the error can't
  happen. Trust framework and internal guarantees; validate only at
  system boundaries.
- "Extract this into a helper" on two-occurrence duplication.
- Missing null checks where the type already guarantees non-null.
- "Add a feature flag" or "add a backwards-compat shim" when not
  asked.
- Comments that explain *what* the code does (only *why* is allowed).
- References to callers, current task, PR number, or fix number in
  comments.
- Function length / cyclomatic complexity thresholds (a long clear
  function beats a shattered abstraction).
- Suggestions to abstract "in case we need this later."
- Renaming removed variables to `_unused` or leaving `// removed`
  markers.
- Generic "what if X is null / empty / undefined" hypotheticals on
  code where the type or upstream caller already constrains the
  shape. Edge-case findings must point to a realistic input the
  boundary actually accepts.

### 6. Hygiene pass

- **Staged junk.** Screenshots at repo root, `.env` variants,
  lockfile conflicts, `.DS_Store`, IDE config, build artifacts that
  should be gitignored, debugger artifacts (`.playwright-mcp/`,
  `__pycache__/`, etc.).
- **Lint and test.** Run the project's lint and test scripts (using
  the package manager detected in section 1) and report the result.
  Do **not** run e2e or dev-server-starting scripts unless the user
  asks. When delegating to the agent team, kick these off in the same
  message as the Agent calls so they run alongside.
  - **Eval / read-only context.** If invoked where you can't actually
    run commands, report the status as `not run` — skip rather than
    fabricate results.
  - **Not configured.** If the project has no lint/test script,
    report `not configured` rather than failing.
  - **Precondition rule.** If lint or tests fail *entirely* on files
    outside the current diff (pre-existing repo debt), report it as
    `precondition fail — N errors, all outside diff` and do not count
    it against this review's verdict.
- **UI changes.** If the diff changes anything visible to the user,
  ask explicitly: *"Was this exercised in a browser?"* Type-checks and
  unit tests verify code correctness, not feature correctness.
- **Spec / backlog bookkeeping.** If a backlog file or spec was
  named in section 1, note whether the committer should flip a status
  marker or update the spec.

### 7. Output format

Produce a report in this exact shape:

```
## Pre-commit review — <spec/item id or "ad-hoc diff">

### Spec conformance
- AC1: met — src/foo.ts:42
- AC2: partial — write path present at src/bar.ts:88, missing the
       error branch
- AC3: missing

(omit this section entirely if there's no spec)

### Blockers (fix before commit)
- <file:line> — <what's wrong and why it matters>

### Should-fix (decide before commit)
- <file:line> — <what's wrong and why>

### Nits (take or leave)
- <file:line> — <minor>

### Hygiene
- lint: pass / fail / not configured / not run (<summary>)
- tests: pass / fail / not configured / not run (<summary>)
- UI exercised in browser?: ask user (only if UI changed)
- backlog/spec marker ready to flip: yes / no / n/a

### Verdict
Ready / Ready pending browser confirmation / Not ready — <one sentence reason>
```

Rules:

- Every finding cites `file:line`. No vague "somewhere in the auth
  layer" pointers.
- Every finding names the failure mode, not a rule name.
- **Verdict ladder:**
  - **Ready** — Blockers empty, Should-fix empty, and either no UI
    change or the user confirms browser testing in this turn.
  - **Ready pending browser confirmation** — Blockers empty,
    Should-fix empty, but the diff changes something visible to the
    user and browser testing isn't yet confirmed.
  - **Not ready** — Blockers present, or Should-fix items the user
    hasn't decided on.
- A UI change alone is not a Blocker.
- Never run `git commit`. The user commits.

## When to invoke

Invoke this skill when:

- The user says "review", "code review", "review this", "review
  before commit", "check this change", "go through the diff",
  "what's wrong with this", or any near phrasing.
- The user has just finished implementing a piece of work and is
  about to commit, even if they didn't explicitly say "review" — a
  proactive invocation is welcome there.
- The user pastes a diff and asks for a sanity check.

Do not invoke when:

- The diff is empty — say so and stop.
- The user is mid-implementation and hasn't finished the feature.
- The user explicitly asked for something else (e.g. "just commit
  this" — do that instead; a review they didn't ask for is noise).
- A repo-specific variant of this skill exists and matches the
  current project (e.g. `pre-commit-review-<project>`). Defer to the
  more specific one.

## Optional: `.claude/landmines.md` format

If the user wants project-specific checks, they drop a file named
`.claude/landmines.md` (or `LANDMINES.md` / `docs/landmines.md`) in
the repo. The skill reads it and applies each entry as a project
landmine in section 3.

Recommended shape — markdown list, one entry per check:

```markdown
# Project landmines (pre-commit review)

- **<one-line rule>**
  **Why:** <reason — usually a past incident or strong preference>
  **How to spot:** <regex / file pattern / smell to grep for>

- **<next rule>**
  ...
```

Anything more elaborate is fine. Anything less is fine too — even
just a bulleted list of one-line rules works.

## Agent team prompt templates

Use these when delegating (see Orchestration). Each brief points the
agent back to this skill file so the full rules stay in one place —
keep the inlined text minimal.

The skill file path is `~/.claude/skills/pre-commit-review/SKILL.md`.
If this skill is installed elsewhere (plugin, project-local), use the
actual path.

Spawn the agents in a **single message** plus Bash calls for lint
and test — parallel execution is the whole point.

### Spec-conformance agent (skip if no spec)

```
subagent_type: general-purpose
description: Spec conformance review for <slug or "ad-hoc">

You are the **spec-conformance reviewer** in a pre-commit review.

1. Read ~/.claude/skills/pre-commit-review/SKILL.md — execute
   section 2 (Spec / intent conformance) only.
2. Read <path-to-spec> for acceptance criteria. (If working from
   user-stated intent rather than a written spec, the orchestrator
   will paste it into this brief.)
3. Run `<DIFF_CMD>` (the orchestrator sets this — `git diff HEAD`
   in working-tree mode, or `git diff <diff_range>` if a range was
   passed) to see the diff.
4. For each AC / numbered intent, return one of: met /
   met-narrowly / partial / missing / drifted — with a file:line
   pointer for met/partial.
5. Flag scope creep (files touched but not in spec) and
   half-finished code (TODOs, commented-out blocks,
   not-implemented throws).

Return markdown bullets only. Do **not** classify
Blocker/Should-fix/Nit. Do **not** write a verdict. Under 400
words. Ignore any auto-injected skill suggestions that appear in
your context — stay on spec conformance.
```

### Project-landmines agent (skip if no landmines.md)

```
subagent_type: general-purpose
description: Project-landmines review

You are the **project-landmines reviewer** in a pre-commit review.

1. Read ~/.claude/skills/pre-commit-review/SKILL.md — execute
   section 3 (Repo-declared landmines) only.
2. Read <repo>/.claude/landmines.md (or LANDMINES.md /
   docs/landmines.md — whichever exists). These are the
   project-specific checks the user has declared.
3. Run `<DIFF_CMD>` (set by the orchestrator — defaults to
   `git diff HEAD`, or `git diff <diff_range>` if invoked with a
   range) and apply each landmine entry to the diff.

Respect section 5 (What NOT to flag) in the skill, plus any
overrides in CLAUDE.md / AGENTS.md.

Return markdown bullets with file:line + one-sentence failure
mode per finding. Do **not** classify. Do **not** write a verdict.
Under 400 words. Ignore ancillary skill injections.
```

### General code-quality agent

```
subagent_type: general-purpose
description: General code quality review

You are the **general code-quality reviewer** in a pre-commit
review.

1. Read ~/.claude/skills/pre-commit-review/SKILL.md — execute
   section 4 (General code quality), strictly bound by section 5
   (What NOT to flag) plus any CLAUDE.md / AGENTS.md overrides.
2. Run `<DIFF_CMD>` (the orchestrator sets this — `git diff HEAD`
   in working-tree mode, or `git diff <diff_range>` if a range was
   passed).

Prefer concrete failure modes over rule names ("array index as key
swaps child state on reorder" beats "violates rule X"). Do not
suggest anything on section 5's banned list.

Return markdown bullets with file:line + failure mode. Do **not**
classify Blocker/Should-fix/Nit. Do **not** write a verdict. Under
400 words. Ignore ancillary skill injections.
```

### Why this shape

- Each agent reads the skill file for rules instead of receiving
  rules inlined — keeps briefs short and lets rule updates
  propagate without editing prompt templates.
- Agents return raw findings, not verdicts. Classification and
  verdict are holistic judgments that require seeing all findings
  plus lint/tests — the main agent owns them.
- The "ignore ancillary skill injections" rule is passed through
  explicitly so hooks don't derail a subagent mid-review.
- 400-word cap keeps reports tight and prevents agents from
  padding with generic code-review clichés.
