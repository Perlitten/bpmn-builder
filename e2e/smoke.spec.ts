import { expect, test } from '@playwright/test';

test.describe('BpmnBuilder E2E Smoke & Auth Flows', () => {
  test.beforeEach(async ({ page, request, context }) => {
    // Acquire session token via test auth endpoint
    const res = await request.post('/api/auth/test-session', {
      data: {
        email: 'e2e-user@example.com',
        name: 'E2E Test User',
      },
    });
    expect(res.ok()).toBeTruthy();

    const setCookie = res.headers()['set-cookie'];
    if (setCookie) {
      const match = setCookie.match(/bpmn_session=([^;]+)/);
      if (match?.[1]) {
        await context.addCookies([
          {
            name: 'bpmn_session',
            value: match[1],
            domain: 'localhost',
            path: '/',
          },
        ]);
      }
    }

    await page.goto('/');
  });

  test('loads home process list page and verifies shell header', async ({ page }) => {
    await expect(page).toHaveTitle(/BPMN 2\.0 Builder|BPMN Builder/i);
    await expect(page.locator('header')).toContainText('BPMN');
  });

  test('creates a new blank process and loads editor canvas', async ({ page }) => {
    await page.click('button:has-text("New blank")');
    await expect(page.locator('main, .bpmn-editor')).toBeVisible();
  });
});
