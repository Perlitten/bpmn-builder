import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Process List workbench', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const email = `process-list-${testInfo.project.name}-${testInfo.workerIndex}@example.com`;
    const session = await page.request.post('/api/auth/test-session', {
      data: { email, name: 'Process List QA' },
    });
    expect(session.ok()).toBeTruthy();

    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const first = await page.request.post('/api/processes', {
      data: {
        name: `Invoice approval ${suffix}`,
        description: 'Receive invoice. Review details. If approved, pay the supplier, otherwise request a revision.',
        templateId: 'starter:approval',
      },
    });
    const second = await page.request.post('/api/processes', {
      data: {
        name: `Employee onboarding ${suffix}`,
        description: 'Collect details, provision access, and welcome the new employee.',
        templateId: 'starter:onboarding',
      },
    });
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();
    await page.goto('/');
  });

  test('selects a real diagram preview without navigating away from the list', async ({ page }, testInfo) => {
    const target = page.getByRole('button', { name: /Preview Invoice approval/ }).first();
    await expect(target).toBeVisible();
    await target.click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('article', { name: /Preview of Invoice approval/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /Start.*Review request/i })).toBeVisible();

    if (testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: 'Back to processes' }).click();
      await expect(target).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /Open in editor/ })).toBeVisible();
    }
  });

  test('has no serious accessibility violations in the populated list', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Preview Invoice approval/ }).first()).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('exports the selected BPMN from the detail panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'Desktop detail action coverage');
    await page.getByRole('button', { name: /Preview Invoice approval/ }).first().click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^Invoice-approval-.*\.bpmn$/);
  });

  test('collapses the desktop preview into a full-width list and reopens it from a row', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'Desktop split-view coverage');
    const workbench = page.locator('.process-workbench');
    const selectedRow = page.locator('.process-index-row[aria-pressed="true"]');

    await expect(selectedRow).toHaveCount(1);
    const target = page.getByRole('button', { name: await selectedRow.getAttribute('aria-label') ?? '' });
    await expect(page.getByRole('button', { name: 'Close preview' })).toBeVisible();
    await page.getByRole('button', { name: 'Close preview' }).click();

    await expect(workbench).toHaveClass(/is-list-only/);
    await expect(page.locator('.process-detail')).toHaveCount(0);
    await expect(target).toHaveAttribute('aria-pressed', 'false');
    await expect(target).toBeFocused();

    await target.click();
    await expect(workbench).not.toHaveClass(/is-list-only/);
    await expect(page.getByRole('article', { name: /Preview of/ })).toBeVisible();
  });

  test('keeps process management available in the mobile detail header', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'Mobile detail action coverage');
    await page.getByRole('button', { name: /Preview Invoice approval/ }).first().click();

    const menu = page.getByRole('button', { name: /More actions for Invoice approval/ });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  });

  test('captures a process from the mobile composer and opens the real editor', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'Mobile capture coverage');
    await page.getByLabel('Describe a new process').click();
    const dialog = page.getByRole('dialog', { name: 'New process' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Describe the new process').fill(
      'Customer sends a request. Review the request. If approved, archive it, otherwise ask for clarification.',
    );
    await dialog.getByRole('button', { name: 'Create process' }).click();
    await expect(page.locator('.bpmn-canvas-host')).toBeVisible();
  });
});
