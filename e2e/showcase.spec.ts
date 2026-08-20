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

    await expect(page.locator('h1')).toContainText('Describe processes in plain words');
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
});
