import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STORAGE_KEY as RUN_STORAGE_KEY, STORAGE_VERSION } from '../lib/meshy/storage';

// Edit this list to cover your key routes.
const ROUTES = ['/'];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
];

async function setup(page: Page, route: string, viewport: { width: number; height: number }) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(route);
  await page.waitForLoadState('networkidle');
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`a11y: ${route} @ ${viewport.name}`, async ({ page }) => {
      await setup(page, route, viewport);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      if (results.violations.length > 0) {
        console.error(
          `\n❌ a11y violations on ${route} @ ${viewport.name}:\n` +
            JSON.stringify(results.violations, null, 2)
        );
      }

      expect(results.violations).toEqual([]);
    });

    test(`keyboard focus indicators: ${route} @ ${viewport.name}`, async ({ page }) => {
      await setup(page, route, viewport);

      // Tab through up to 25 elements; verify each focused element has a visible indicator.
      let missingIndicator: string | null = null;

      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');

        const result = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const styles = window.getComputedStyle(el);
          const tag = el.tagName.toLowerCase();
          const text = (el.textContent || '').slice(0, 40).trim();

          const hasOutline = styles.outline !== 'none' && styles.outlineWidth !== '0px';
          const hasBoxShadow = styles.boxShadow !== 'none';
          const hasBorderChange = styles.borderWidth !== '0px';

          return {
            tag,
            text,
            hasIndicator: hasOutline || hasBoxShadow || hasBorderChange,
          };
        });

        if (!result) break; // Reached end of tab order
        if (!result.hasIndicator) {
          missingIndicator = `<${result.tag}> "${result.text}"`;
          break;
        }
      }

      expect(missingIndicator, `Focusable element has no visible focus indicator: ${missingIndicator}`).toBeNull();
    });
  }
}

// US-08: the lightbox only exists after a click, so the route-level scans
// above never see it. Seed a run with two landed mesh stages, open the dialog,
// and scan the page in that state.
const LIGHTBOX_VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'desktop', width: 1280, height: 720 },
];

for (const viewport of LIGHTBOX_VIEWPORTS) {
  test(`a11y: artifact lightbox @ ${viewport.name}`, async ({ page }) => {
    const now = Date.now();
    const stage = (id: string, credits: number) => ({
      status: 'succeeded',
      taskId: id,
      progress: 100,
      precedingTasks: null,
      creditCost: credits,
      modelUrl: `https://assets.meshy.test/${id}.glb`,
      thumbnailUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO48kIbK2IYWhIAvMl5wfWTQdgAAAAASUVORK5CYII=',
      startedAt: now - 300_000,
      completedAt: now - 218_000,
      error: null,
    });
    const pending = (id: string) => ({
      stage: id,
      status: 'pending',
      taskId: null,
      progress: 0,
      precedingTasks: null,
      creditCost: null,
      modelUrl: null,
      thumbnailUrl: null,
      startedAt: null,
      completedAt: null,
      error: null,
    });
    const run = {
      prompt: 'a bronze knight with a tower shield',
      status: 'running',
      stages: {
        preview: { ...pending('preview'), ...stage('preview-0001', 20) },
        refine: { ...pending('refine'), ...stage('refine-0002', 10) },
        remesh: pending('remesh'),
        rig: pending('rig'),
        'animate:idle': pending('animate:idle'),
        'animate:walk': pending('animate:walk'),
        'animate:run': pending('animate:run'),
        'animate:jump': pending('animate:jump'),
        'animate:emote': pending('animate:emote'),
      },
      startedAt: now - 300_000,
      completedAt: null,
      creditsSpent: 30,
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

    await page.getByTestId('enlarge-preview').click();
    await expect(page.getByTestId('artifact-lightbox')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.error(
        `\n❌ a11y violations with the lightbox open @ ${viewport.name}:\n` +
          JSON.stringify(results.violations, null, 2),
      );
    }

    expect(results.violations).toEqual([]);
  });
}

// US-09: the completion card (playground CTA included) only renders for a
// succeeded run — seed one and scan the page in that state.
for (const viewport of LIGHTBOX_VIEWPORTS) {
  test(`a11y: completion card @ ${viewport.name}`, async ({ page }) => {
    const now = Date.now();
    const completedAt = now - 60_000;
    const startedAt = completedAt - 360_000;
    const glb: Record<string, string> = {
      rig: '/gallery/goblin-scout/rig.f4e1834c.glb',
      'animate:idle': '/gallery/goblin-scout/idle.ce259443.glb',
      'animate:walk': '/gallery/goblin-scout/walk.eaf2f2b2.glb',
      'animate:run': '/gallery/goblin-scout/run.ca988cf8.glb',
      'animate:jump': '/gallery/goblin-scout/jump.7dc8c128.glb',
      'animate:emote': '/gallery/goblin-scout/emote.f590fd73.glb',
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
    // Let the card's entrance fade finish — axe's contrast check reads
    // mid-transition opacity as a real violation.
    await expect(page.getByTestId('completion')).toHaveCSS('opacity', '1');

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
