import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Showcase Pre-login Sandbox Demo', () => {
  test('renders showcase demo without session and updates diagram on example click without calling API', async ({
    page,
  }) => {
    const processApiRequests: string[] = [];
    const sessionProbeRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/processes')) {
        processApiRequests.push(req.url());
      }
      if (new URL(req.url()).pathname === '/api/auth/me') sessionProbeRequests.push(req.url());
    });

    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Describe processes in plain words');
    await expect(page.locator('#showcase-description')).toBeVisible();
    await expect(page.getByTestId('showcase-preview')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Sign in to save processes');
    await expect(page.locator('[aria-busy="false"]')).toBeVisible();

    // Scan only after authentication state and the showcase viewer have settled.
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

    await expect(page.getByTestId('showcase-preview').locator('polygon')).toHaveCount(0);

    const decisionBtn = page.getByRole('button', { name: 'Decision flow' });
    await expect(decisionBtn).toBeVisible();
    await decisionBtn.click();

    const textareaValue = await page.locator('#showcase-description').inputValue();
    // Adjusted check to match the new string
    expect(textareaValue).toContain('If the candidate is qualified');

    await expect(page.getByTestId('showcase-preview').locator('polygon')).toHaveCount(2);

    expect(processApiRequests).toEqual([]);
    expect(sessionProbeRequests).toEqual([]);
  });

  test('Keyboard test: activate the primary action and each example', async ({ page }) => {
    await page.goto('/');

    const primaryAction = page.getByRole('link', { name: 'PRESS START' });
    await primaryAction.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#signin$/);
    await expect(page.locator('#signin')).toBeInViewport();

    // Tab through examples
    await page.getByRole('button', { name: 'Linear process' }).focus();
    await page.keyboard.press('Enter');
    let textareaValue = await page.locator('#showcase-description').inputValue();
    expect(textareaValue).toContain('Submit order');

    await page.getByRole('button', { name: 'Decision flow' }).focus();
    await page.keyboard.press('Enter');
    textareaValue = await page.locator('#showcase-description').inputValue();
    expect(textareaValue).toContain('If the candidate is qualified');

    await page.getByRole('button', { name: 'Parallel work' }).focus();
    await page.keyboard.press('Enter');
    textareaValue = await page.locator('#showcase-description').inputValue();
    expect(textareaValue).toContain('meanwhile');
  });

  test('Mobile test: document width and readability affordance', async ({ page }) => {
    // Set viewport to a common mobile size (e.g. iPhone 12/13/14)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // Wait for the diagram to render
    await expect(page.getByTestId('showcase-preview')).toBeVisible();

    // Assert no horizontal document overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    // Readability affordance: Fullscreen button should be visible on mobile
    const fullscreenBtn = page.getByRole('button', { name: 'View fullscreen' });
    await expect(fullscreenBtn).toBeVisible();

    // The fullscreen surface behaves as a modal and survives a responsive resize.
    await fullscreenBtn.click();
    const dialog = page.getByRole('dialog', { name: 'Fullscreen process preview' });
    const closeBtn = page.getByRole('button', { name: 'Exit fullscreen' });
    await expect(dialog).toBeVisible();
    await expect(closeBtn).toBeFocused();
    await expect(page.locator('main')).toHaveCSS('overflow', 'hidden');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await expect.poll(() => page.locator('header').evaluate((element) => element.inert)).toBe(true);

    await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator(':focus')).toBeVisible();

    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.locator('header').evaluate((element) => element.inert)).toBe(false);

    await page.setViewportSize({ width: 390, height: 844 });
    await fullscreenBtn.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(fullscreenBtn).toBeFocused();
  });
});
