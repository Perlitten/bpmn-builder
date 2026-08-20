import { expect, test } from '@playwright/test';

test.describe('BpmnBuilder E2E Smoke & Auth Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Acquire session token via test auth endpoint on page.request so session cookies attach to browser context
    const res = await page.request.post('/api/auth/test-session', {
      data: {
        email: 'e2e-user@example.com',
        name: 'E2E Test User',
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto('/');
  });

  test('loads home process list page and verifies shell header', async ({ page }) => {
    await expect(page).toHaveTitle(/BPMN (?:2\.0 )?Builder/i);
    await expect(page.locator('body')).toContainText('Processes');
  });

  test('creates a new blank process and loads editor canvas', async ({ page }) => {
    await page.click('button:has-text("New blank"), button:has-text("Create blank"), button:has-text("Create process")');
    await expect(page.locator('main, .bpmn-editor')).toBeVisible();
  });
});
