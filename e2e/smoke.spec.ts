import { expect, test } from '@playwright/test';

test.describe('BpmnBuilder E2E Smoke & Auth Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Acquire session token via test auth endpoint using page.request so cookies are stored in browser context
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
    await expect(page).toHaveTitle(/BPMN.*Builder/i);
    await expect(page.locator('header')).toContainText('BPMN');
  });

  test('creates a new blank process and loads editor canvas', async ({ page }) => {
    await page.click('button:has-text("New blank")');
    await expect(page.locator('.bpmn-canvas-host')).toBeVisible();
    await expect(page.locator('.bpmn-canvas-host .djs-shape').first()).toBeVisible();
    expect(await page.locator('.bpmn-canvas-host .djs-shape').count()).toBeGreaterThan(0);
  });
});
