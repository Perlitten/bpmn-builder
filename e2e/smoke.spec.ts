import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('public API boundaries', () => {
  test('keeps readiness public and protected data private', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(body).toMatchObject({ status: 'ok', database: { status: 'connected' } });
    expect(health.headers()['cache-control']).toContain('no-store');

    const protectedResponse = await request.get('/api/processes');
    expect(protectedResponse.status()).toBe(401);
    await expect(protectedResponse.json()).resolves.toEqual({ error: 'Sign in required' });
  });
});

test.describe('BpmnBuilder critical journeys', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const email = `e2e-${testInfo.project.name}-${testInfo.workerIndex}@example.com`;
    const response = await page.request.post('/api/auth/test-session', {
      data: {
        email,
        name: 'E2E Test User',
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto('/');
  });

  test('loads the process list without serious accessibility violations', async ({ page }) => {
    await expect(page).toHaveTitle(/BPMN.*Builder/i);
    await expect(page.locator('header')).toContainText('BPMN');

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('creates, renames, saves, and reloads a process', async ({ page }) => {
    await page.getByRole('button', { name: 'Create process' }).click();
    await expect(page.locator('.bpmn-canvas-host')).toBeVisible();
    await expect(page.locator('.bpmn-canvas-host .djs-shape').first()).toBeVisible();
    expect(await page.locator('.bpmn-canvas-host .djs-shape').count()).toBeGreaterThan(0);

    const processName = `E2E persisted ${Date.now()}`;
    const nameInput = page.getByLabel('Process name');
    await nameInput.fill(processName);
    const saved = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'PATCH' && /\/api\/processes\/[^/]+$/.test(url.pathname) && response.ok();
    });
    await nameInput.press('Enter');
    await saved;

    await page.reload();
    await expect(page.getByLabel('Process name')).toHaveValue(processName);
  });

  test('isolates a process from a second signed-in user', async ({ browser, page }) => {
    const created = await page.request.post('/api/processes', {
      data: { name: `Private E2E ${Date.now()}` },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();

    const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const otherPage = await otherContext.newPage();
      const session = await otherPage.request.post('/api/auth/test-session', {
        data: { email: `other-${Date.now()}@example.com`, name: 'Other E2E User' },
      });
      expect(session.ok()).toBeTruthy();

      const foreign = await otherPage.request.get(`/api/processes/${createdBody.process.id}`);
      expect(foreign.status()).toBe(404);
      await expect(foreign.json()).resolves.toEqual({ error: 'not found' });
    } finally {
      await otherContext.close();
    }
  });
});
