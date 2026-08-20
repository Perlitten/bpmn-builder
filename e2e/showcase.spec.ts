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

    const decisionBtn = page.getByRole('button', { name: 'Decision flow' });
    await expect(decisionBtn).toBeVisible();
    await decisionBtn.click();

    const textareaValue = await page.locator('#showcase-description').inputValue();
    expect(textareaValue).toContain('If candidate is qualified');

    await expect(page.locator('.djs-shape').first()).toBeVisible();
    expect(await page.locator('.djs-shape').count()).toBeGreaterThan(0);

    expect(processApiRequests).toEqual([]);

    await expect(page.locator('h2')).toContainText('Sign in to save processes');
  });
});
