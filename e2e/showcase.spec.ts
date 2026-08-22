import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Showcase Pre-login Sandbox Demo', () => {
  test('renders the attract-mode showcase without session and switches scenarios without calling API', async ({
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
    await expect(page.getByTestId('showcase-typed-phrase')).toBeVisible();
    await expect(page.getByTestId('showcase-preview')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Sign in to save processes');
    await expect(page.locator('[aria-busy="false"]')).toBeVisible();

    // Scan only after authentication state and the interactive showcase have settled.
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

    const decisionBtn = page.getByRole('button', { name: 'BRANCH ON AMOUNT' });
    await expect(decisionBtn).toBeVisible();
    await decisionBtn.click();
    await expect(decisionBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('showcase-preview').locator('svg')).toHaveAttribute(
      'aria-label',
      'Animated BPMN preview for: if over 5000, ask the CFO',
    );
    await page.getByRole('button', { name: 'SHOW XML' }).click();
    await expect(page.getByTestId('showcase-xml')).toContainText('bpmn:exclusiveGateway');

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

    // Activate each reference scenario from the keyboard.
    await page.getByRole('button', { name: 'APPROVE & PAY' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('showcase-preview').locator('svg')).toHaveAttribute(
      'aria-label',
      'Animated BPMN preview for: finance approves, then pay',
    );

    await page.getByRole('button', { name: 'BRANCH ON AMOUNT' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('showcase-preview').locator('svg')).toHaveAttribute(
      'aria-label',
      'Animated BPMN preview for: if over 5000, ask the CFO',
    );

    await page.getByRole('button', { name: 'REFUND ALERT' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('showcase-preview').locator('svg')).toHaveAttribute(
      'aria-label',
      'Animated BPMN preview for: on refund, notify support',
    );

    await page.getByRole('button', { name: 'SHIP & INVOICE' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('showcase-preview').locator('svg')).toHaveAttribute(
      'aria-label',
      'Animated BPMN preview for: ship, invoice, then archive',
    );
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

    // The reference keeps a compact, responsive 500:152 stage instead of opening a separate modal.
    await expect(page.getByTestId('showcase-preview').locator('svg')).toHaveAttribute('viewBox', '0 0 500 152');
    await expect(page.getByRole('button', { name: 'SHOW XML' })).toBeVisible();
  });
});
