# US-09: Playground CTA on the Completion Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A quiet link at the bottom of the completion card that best-effort copies the run's prompt to the clipboard and opens Meshy's Text to 3D API playground in a new tab.

**Architecture:** One exported constant in the pure completion module (`components/pipeline/completion.ts`), one anchor with a clipboard `onClick` side effect plus a 2-second transient caption in `components/pipeline/completion-actions.tsx`. No new files, no state-machine or proxy changes. The anchor renders in **all three** completion branches (normal, expired, empty-plan), so it sits after the branch conditional as the card's last child.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4 semantic tokens, Playwright (`tests/completion.spec.ts`, `tests/a11y.spec.ts` with `@axe-core/playwright`).

**Spec:** `docs/specs/us-09-playground-cta.md` — read it first.

## Global Constraints

- Repo quirk: `docs/` is gitignored — commit docs with `git add -f`.
- No new packages (CLAUDE.md; spec CONSTRAINTS).
- Semantic tokens only — no hex literals, no raw px, mono for all pipeline/API text (`DESIGN.md`).
- No toast/portal for the copied feedback — inline on the card only.
- Never pass the prompt via URL params (playground ignores them); never block/delay navigation on the clipboard promise.
- Do not touch `lib/meshy/`, the CLI (`../claude-code-resources/print-pipeline.ts`), gallery cards, or per-stage rows.
- Motion: transform/opacity only, `--duration-*`/`--ease-stage`, honor `prefers-reduced-motion`.
- Playwright tests run against the dev server config already in `playwright.config.ts` (Chromium); run with `npx playwright test <file>`.

---

### Task 1: `PLAYGROUND_URL` + the CTA anchor (rendering only)

**Files:**
- Modify: `components/pipeline/completion.ts` (append constant at top-level, after `ASSET_EXPIRY_MS`)
- Modify: `components/pipeline/completion-actions.tsx` (anchor after the branch conditional, ~line 137)
- Test: `tests/completion.spec.ts`

**Interfaces:**
- Consumes: existing `seedRun`/`makeSucceededRun` helpers in `tests/completion.spec.ts`; existing card markup in `CompletionActions`.
- Produces: `PLAYGROUND_URL: string` exported from `components/pipeline/completion.ts`; `data-testid="playground-cta"` anchor and `data-testid="playground-cta-caption"` span, which Task 2 wires to the clipboard and Task 3 scans.

- [ ] **Step 1: Write the failing tests**

Append to `tests/completion.spec.ts`:

```ts
test("completion card links out to the API playground", async ({ page }) => {
  await seedRun(page, makeSucceededRun(60_000));
  await page.goto("/");

  const cta = page.getByTestId("playground-cta");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute(
    "href",
    "https://www.meshy.ai/api-playground/text-to-3d/preview",
  );
  await expect(cta).toHaveAttribute("target", "_blank");
  await expect(cta).toHaveAttribute("rel", "noopener");
  await expect(page.getByTestId("playground-cta-caption")).toHaveText(
    "Click copies your prompt",
  );
});
```

And add one line to the existing test `"a run past Meshy's 3-day retention shows honest copy, no dead buttons"`, after the `start-over` assertion:

```ts
  // US-09: the playground CTA is the one action that survives expiry.
  await expect(page.getByTestId("playground-cta")).toBeVisible();
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx playwright test tests/completion.spec.ts -g "playground|retention"`
Expected: FAIL — `playground-cta` locator resolves to 0 elements in both tests.

- [ ] **Step 3: Add the constant to `completion.ts`**

Append after `ASSET_EXPIRY_MS` (keep the module's doc-comment style):

```ts
/**
 * Meshy's Text to 3D playground. Its form state ignores URL params entirely
 * (verified against production in the CLI's --playground work) — the prompt
 * travels via clipboard, never the URL.
 */
export const PLAYGROUND_URL =
  "https://www.meshy.ai/api-playground/text-to-3d/preview";
```

- [ ] **Step 4: Render the anchor in `completion-actions.tsx`**

Add `PLAYGROUND_URL` to the existing import from `./completion`:

```ts
import {
  completionReceipt,
  downloadPlan,
  generatedCharacterSource,
  PLAYGROUND_URL,
  runAssetsExpired,
} from "./completion";
```

Insert the anchor as the **last child of the card `<div>`** — after the closing of the `expired ? … : plan.length === 0 ? … : <>…</>` conditional (currently line 138), so it renders in every branch:

```tsx
      {/* US-09: the "go deeper" nudge — a real link (cmd-click, a11y) whose
          clipboard handoff is best-effort. The playground ignores URL params,
          so the clipboard is the only way the prompt travels. */}
      <a
        href={PLAYGROUND_URL}
        target="_blank"
        rel="noopener"
        data-testid="playground-cta"
        className="group flex flex-col gap-0.5 rounded-sm border-t border-border px-1 pt-2 pb-1 font-mono text-xs transition-transform duration-(--duration-fast) ease-(--ease-stage) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-[0.98] motion-reduce:transition-none"
      >
        <span className="text-foreground group-hover:text-accent">
          Explore more in the API Playground <span aria-hidden="true">↗</span>
        </span>
        <span data-testid="playground-cta-caption" className="text-muted">
          Click copies your prompt
        </span>
      </a>
```

(The caption is static in this task; Task 2 makes it react to the copy.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test tests/completion.spec.ts`
Expected: ALL PASS (the whole file — the new anchor must not break the five existing tests).

- [ ] **Step 6: Commit**

```bash
git add components/pipeline/completion.ts components/pipeline/completion-actions.tsx tests/completion.spec.ts
git commit -m "feat: playground CTA link on the completion card (US-09)"
```

---

### Task 2: Clipboard handoff + transient "Prompt copied" feedback

**Files:**
- Modify: `components/pipeline/completion-actions.tsx`
- Test: `tests/completion.spec.ts`

**Interfaces:**
- Consumes: the `playground-cta` anchor and `playground-cta-caption` span from Task 1; `run.prompt` (always non-empty for a completed run).
- Produces: exported `COPIED_FEEDBACK_MS = 2000` from `completion-actions.tsx`; caption text contract `"Click copies your prompt"` ↔ `"Prompt copied"`.

- [ ] **Step 1: Write the failing test**

Append to `tests/completion.spec.ts`:

```ts
// Clipboard APIs need explicit permissions (Chromium) — scoped to this block.
test.describe("playground CTA clipboard handoff", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("clicking copies the run's prompt and confirms inline", async ({ page }) => {
    // Keep CI hermetic: the new tab must never actually load meshy.ai.
    await page.context().route("https://www.meshy.ai/**", (route) => route.abort());
    await seedRun(page, makeSucceededRun(60_000));
    await page.goto("/");

    const popupPromise = page.waitForEvent("popup");
    await page.getByTestId("playground-cta").click();
    const popup = await popupPromise;
    await popup.close();

    await page.bringToFront(); // clipboard.readText needs the focused document
    await expect(page.getByTestId("playground-cta-caption")).toHaveText(
      "Prompt copied",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "a bronze knight with a tower shield",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/completion.spec.ts -g "clipboard"`
Expected: FAIL — caption still reads "Click copies your prompt" (no handler yet).

- [ ] **Step 3: Wire the handler and transient state**

In `completion-actions.tsx`:

Change the react import to include `useRef`:

```ts
import { useEffect, useId, useRef, useState } from "react";
```

Add below `EXPIRED_COPY`:

```ts
/** How long the "Prompt copied" confirmation holds before reverting. */
export const COPIED_FEEDBACK_MS = 2000;
```

Add state + handler inside `CompletionActions`, next to the existing `downloadsOpen` state:

```tsx
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  // Clear a pending revert if the card unmounts mid-feedback.
  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  // Best-effort: never preventDefault, never block navigation on the promise
  // (spec CONSTRAINTS). If clipboard is unavailable or rejects, the link has
  // already navigated — silence is the correct feedback.
  const handlePlaygroundClick = () => {
    navigator.clipboard?.writeText(run.prompt).then(
      () => {
        setCopied(true);
        if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(
          () => setCopied(false),
          COPIED_FEEDBACK_MS,
        );
      },
      () => {},
    );
  };
```

Update the anchor from Task 1 — add the handler and make the caption reactive (re-mount via `key` so the swap gets the card's standard opacity entrance; reduced-motion removes it):

```tsx
      <a
        href={PLAYGROUND_URL}
        target="_blank"
        rel="noopener"
        data-testid="playground-cta"
        onClick={handlePlaygroundClick}
        className="group flex flex-col gap-0.5 rounded-sm border-t border-border px-1 pt-2 pb-1 font-mono text-xs transition-transform duration-(--duration-fast) ease-(--ease-stage) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-[0.98] motion-reduce:transition-none"
      >
        <span className="text-foreground group-hover:text-accent">
          Explore more in the API Playground <span aria-hidden="true">↗</span>
        </span>
        <span
          key={copied ? "copied" : "hint"}
          data-testid="playground-cta-caption"
          className="text-muted transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none"
        >
          {copied ? "Prompt copied" : "Click copies your prompt"}
        </span>
      </a>
```

- [ ] **Step 4: Run the whole completion suite**

Run: `npx playwright test tests/completion.spec.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add components/pipeline/completion-actions.tsx tests/completion.spec.ts
git commit -m "feat: playground CTA copies the prompt with inline feedback (US-09)"
```

---

### Task 3: A11y scan, verification gates, screenshots, backlog

**Files:**
- Modify: `tests/a11y.spec.ts`
- Modify: `docs/backlog/phase-2-ship.md` (flip P2 #7 to `[x]` — `git add -f`, docs/ is gitignored)

**Interfaces:**
- Consumes: `playground-cta` testid from Task 1; `LIGHTBOX_VIEWPORTS` and the seeding pattern already in `tests/a11y.spec.ts`.
- Produces: nothing downstream — this is the closing gate.

- [ ] **Step 1: Write the a11y test (fails only on violations — verify it runs)**

The route-level scans never see the completion card (it needs a seeded succeeded run). Append to `tests/a11y.spec.ts`, after the lightbox block, reusing `LIGHTBOX_VIEWPORTS`:

```ts
// US-09: the completion card (playground CTA included) only renders for a
// succeeded run — seed one and scan the page in that state.
for (const viewport of LIGHTBOX_VIEWPORTS) {
  test(`a11y: completion card @ ${viewport.name}`, async ({ page }) => {
    const now = Date.now();
    const completedAt = now - 60_000;
    const startedAt = completedAt - 360_000;
    const glb: Record<string, string> = {
      rig: '/gallery/goblin-scout/rig.dbdf23df.glb',
      'animate:idle': '/gallery/goblin-scout/idle.ac8005c8.glb',
      'animate:walk': '/gallery/goblin-scout/walk.60033e63.glb',
      'animate:run': '/gallery/goblin-scout/run.d48f78c2.glb',
      'animate:jump': '/gallery/goblin-scout/jump.618f4e1a.glb',
      'animate:emote': '/gallery/goblin-scout/emote.1b9c887c.glb',
    };
    const stages = Object.fromEntries(
      [
        'preview',
        'refine',
        'remesh',
        'rig',
        'animate:idle',
        'animate:walk',
        'animate:run',
        'animate:jump',
        'animate:emote',
      ].map((stage, index) => [
        stage,
        {
          stage,
          status: 'succeeded',
          taskId: `${stage}-task`,
          progress: 100,
          precedingTasks: null,
          creditCost: index === 0 ? 20 : 5,
          modelUrl: glb[stage] ?? null,
          startedAt: startedAt + index * 30_000,
          completedAt: startedAt + index * 30_000 + 25_000,
          error: null,
        },
      ]),
    );
    const run = {
      prompt: 'a bronze knight with a tower shield',
      status: 'succeeded',
      stages,
      startedAt,
      completedAt,
      creditsSpent: 55,
      waitingForQueue: false,
      rateLimitBackoffMs: null,
      nextPollAt: null,
    };

    await page.addInitScript(
      ([key, envelope]) => {
        window.localStorage.setItem(key, envelope);
      },
      [RUN_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, run })] as const,
    );

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('playground-cta')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.error(
        `\n❌ a11y violations on the completion card @ ${viewport.name}:\n` +
          JSON.stringify(results.violations, null, 2),
      );
    }

    expect(results.violations).toEqual([]);
  });
}
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/a11y.spec.ts -g "completion card"`
Expected: PASS (2 tests). If axe reports violations, fix the CTA markup — likely candidates are contrast on `text-muted` (already used for identical caption text elsewhere on the card, so a new violation means the markup diverged from the plan).

- [ ] **Step 3: Full verification gates**

Run each; all must pass before proceeding:

```bash
npm run typecheck
npm run lint
npm run test
bash scripts/check-tokens.sh
npx playwright test tests/completion.spec.ts tests/a11y.spec.ts
```

- [ ] **Step 4: Screenshots at 1280 and 375**

Start `npm run dev`, then use browser tooling (Playwright MCP or Chrome extension) against it: seed a succeeded run in the console before load —

```js
localStorage.setItem(
  "prompt-to-playable:pipeline-run",
  JSON.stringify({ version: 3, run: /* the `run` object from Step 1, with fresh Date.now()-based timestamps */ }),
);
```

— reload, confirm the completion card shows the CTA, and capture the card at 1280×720 and 375×667 to `../../us09-cta-1280.png` and `../../us09-cta-375.png` (repo-root screenshot convention, alongside the existing `us05-*.png`). Also click the CTA once and capture the `Prompt copied` state at 1280.

- [ ] **Step 5: design-reviewer subagent**

Invoke the project's `design-reviewer` agent (CLAUDE.md rule — direct Agent-tool invocation is fine) on the completion-card change, anchored against `DESIGN.md`. Address any 🔴 findings before closing.

- [ ] **Step 6: Flip the backlog row and commit**

In `docs/backlog/phase-2-ship.md`, change P2 #7's status from `[ ]` to `[x]`.

```bash
git add tests/a11y.spec.ts
git add -f docs/backlog/phase-2-ship.md
git commit -m "test: a11y scan of the completion card; close US-09 (P2 #7)"
```
