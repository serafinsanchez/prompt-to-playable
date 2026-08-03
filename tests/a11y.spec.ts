import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
