import { expect, test } from '@playwright/test';

test.describe('BpmnBuilder E2E Smoke & Auth Flows', () => {
  test.beforeEach(async ({ page, request }) => {
    // Acquire session token via test auth endpoint
    const res = await request.post('/api/auth/test-session', {
      data: {
        email: 'e2e-user@example.com',
        name: 'E2E Test User',
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto('/');
  });

  test('loads home process list page and verifies shell header', async ({ page }) => {
    await expect(page).toHaveTitle(/BPMN Builder/i);
    await expect(page.locator('header')).toContainText('Processes');
  });

  test('creates a new blank process and loads editor canvas', async ({ page }) => {
    await page.click('button:has-text("New Process"), button:has-text("Blank process")');
    await expect(page.locator('main, .bpmn-editor')).toBeVisible();
  });
});
