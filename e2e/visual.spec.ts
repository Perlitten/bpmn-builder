import { expect, test } from '@playwright/test';

test.describe('landing page visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: {
          configured: false,
          error: 'Google OAuth is not configured for this visual test.',
          callbackUrl: 'http://localhost:5173/api/auth/google/callback',
        },
      });
    });
  });

  test('landing page at desktop (1440x1000)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.locator('header')).toContainText('BPMN');
    await expect(page.locator('[aria-busy="false"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Wait for the showcase viewer to render
    await expect(page.getByTestId('showcase-preview')).toBeVisible();
    await expect(page).toHaveScreenshot('landing-desktop.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
      maxDiffPixelRatio: 0.005,
    });
  });

  test('landing page at mobile (390x844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('header')).toContainText('BPMN');
    await expect(page.locator('[aria-busy="false"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('showcase-preview')).toBeVisible();
    await expect(page).toHaveScreenshot('landing-mobile.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
      maxDiffPixelRatio: 0.005,
    });
  });
});

test.describe('authenticated visual regression', () => {
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
    await expect(page.getByRole('heading', { name: 'Describe a process in plain sentences' })).toBeVisible();
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
