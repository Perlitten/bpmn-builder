import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Showcase Pre-login Sandbox Demo', () => {
  test('renders showcase demo without session and updates diagram on example click without calling API', async ({
    page,
  }) => {
    const processApiRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/processes')) {
        processApiRequests.push(req.url());
      }
    });

    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Turn plain-language processes into clean BPMN 2.0.');
    await expect(page.locator('#showcase-description')).toBeVisible();
    await expect(page.locator('.djs-shape').first()).toBeVisible();
    await expect(page.locator('h2')).toContainText('Sign in to save processes');

    // Scan only after authentication state and the showcase viewer have settled.
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

    await expect(page.locator('.djs-shape .djs-visual > polygon')).toHaveCount(0);

    const decisionBtn = page.getByRole('button', { name: 'Decision flow' });
    await expect(decisionBtn).toBeVisible();
    await decisionBtn.click();

    const textareaValue = await page.locator('#showcase-description').inputValue();
    // Adjusted check to match the new string
    expect(textareaValue).toContain('If the candidate is qualified');

    await expect(page.locator('.djs-shape .djs-visual > polygon')).toHaveCount(2);

    expect(processApiRequests).toEqual([]);
  });

  test('Keyboard test: activate each example and focus the textarea via Try the live demo', async ({ page }) => {
    await page.goto('/');

    // Focus "Try the live demo" button
    await page.getByRole('button', { name: 'Try the live demo' }).focus();
    await page.keyboard.press('Enter');

    // Check if textarea is focused
    await expect(page.locator('#showcase-description')).toBeFocused();

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
    await expect(page.locator('.djs-shape').first()).toBeVisible();

    // Assert no horizontal document overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    // Readability affordance: Fullscreen button should be visible on mobile
    const fullscreenBtn = page.getByRole('button', { name: 'View fullscreen' });
    await expect(fullscreenBtn).toBeVisible();

    // Click it and check if it switches to 'Close'
    await fullscreenBtn.click();
    await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  });
});
