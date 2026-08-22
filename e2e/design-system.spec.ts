import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('product design system', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const response = await page.request.post('/api/auth/test-session', {
      data: {
        email: `design-system-${testInfo.project.name}-${testInfo.workerIndex}@example.com`,
        name: 'Design System User',
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto('/');
    await page.getByRole('button', { name: 'Create process' }).click();
    await expect(page.locator('.bpmn-canvas-host .djs-shape').first()).toBeVisible();
  });

  test('keeps editor geometry, states, and accessibility on the shared contract', async ({ page }, testInfo) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    const rail = page.locator('.palette-rail');
    const inspector = page.locator('.element-inspector');
    const railBox = await rail.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    expect(railBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();

    if (viewport!.width <= 560) {
      expect(railBox!.width).toBe(viewport!.width);
      expect(railBox!.height).toBe(56);
      expect(inspectorBox!.width).toBe(viewport!.width);
      await expect(page.locator('.editor-onboarding')).toContainText('Tap a shape');
      await expect(page.locator('.editor-onboarding')).not.toContainText(/Double-click|Space/);
    } else {
      expect(railBox!.width).toBe(64);
      expect(inspectorBox!.width).toBe(252);
      await expect(page.locator('.editor-onboarding')).toContainText('Double-click a shape');
      await expect(page.locator('.editor-onboarding')).toContainText('hold Space');
    }

    const back = page.getByRole('button', { name: 'Back to process list' });
    await expect(back).toBeVisible();
    const geometry = await back.evaluate((element) => {
      const button = getComputedStyle(element);
      const visual = getComputedStyle(element, '::before');
      return {
        hitHeight: element.getBoundingClientRect().height,
        visualHeight: visual.height,
        radius: visual.borderRadius,
        shadow: button.boxShadow,
      };
    });
    expect(geometry.hitHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.visualHeight).toBe('26px');
    expect(geometry.radius).toBe('0px');
    expect(geometry.shadow).toBe('none');

    await page.getByRole('button', { name: /Simulate BPMN tokens/ }).click();
    await expect(page.locator('.ui-mode-bar')).toContainText('Simulating');
    await expect(page.locator('.ui-mode-bar')).toContainText('Read-only');

    if (process.env.CAPTURE_DESIGN_SYSTEM === '1') {
      await page.screenshot({ path: testInfo.outputPath('editor-contract.png'), animations: 'disabled' });
    }

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
