import { expect, test } from '@playwright/test';

test.describe('visual regression', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const response = await page.request.post('/api/auth/test-session', {
      data: {
        email: `visual-${testInfo.project.name}@example.com`,
        name: 'Visual Regression User',
      },
    });
    expect(response.ok()).toBeTruthy();

    await page.goto('/');
    await expect(page.locator('header')).toContainText('BPMN');
    await page.evaluate(() => document.fonts.ready);
  });

  test('keeps the empty process list stable', async ({ page }) => {
    await expect(page).toHaveScreenshot('process-list.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
      maxDiffPixelRatio: 0.005,
    });
  });
});
