import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../playwright.config';

// The main flow: sign in, log a plan, record its entry and exit, see the
// result, and sign out.
test('a trade from plan to result', async ({ page }) => {
  await page.goto('/journal');
  await expect(page).toHaveURL(/\/login\?next=%2Fjournal$/);

  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/journal$/);

  await page.getByRole('button', { name: 'New entry' }).click();
  await page.getByRole('tab', { name: 'Log a plan' }).click();
  const plan = page.locator('form', { has: page.getByRole('heading', { name: 'Log a plan' }) });
  await plan.getByLabel('Mode').selectOption('paper');
  await plan.getByLabel('Symbol').fill('SPY');
  await plan.getByLabel('Quantity').fill('10');
  await plan.getByLabel('Planned entry').fill('500');
  await plan.getByLabel('Initial stop').fill('498');
  await plan.getByLabel('Target').fill('506');
  await plan.getByLabel('Notes').fill('E2E breakout over 500.');
  await plan.getByRole('button', { name: 'Save plan' }).click();

  // Saving closes the drawer, back to the list.
  await expect(page.getByRole('dialog', { name: 'New entry' })).toBeHidden();
  const entry = page.locator('li', { hasText: 'E2E breakout over 500.' });
  await expect(entry.getByText('Planned')).toBeVisible();

  await entry.getByRole('button', { name: 'Record entry' }).click();
  await entry.getByLabel('Fill price').fill('500');
  await entry.getByRole('button', { name: 'Save entry' }).click();
  await expect(entry.getByText('Open', { exact: true })).toBeVisible();

  await entry.getByRole('button', { name: 'Record exit' }).click();
  await entry.getByLabel('Exit price').fill('504');
  await entry.getByLabel('Reason').selectOption('target');
  await entry.getByRole('group', { name: 'Did you follow your plan?' }).getByLabel('Yes').check();
  await entry.getByRole('button', { name: 'Save exit' }).click();

  // 10 shares from 500 to 504 with 2 of risk a share: +$40.00, +2.0R.
  await expect(entry.getByText('Closed')).toBeVisible();
  await expect(entry.getByText('+$40.00')).toBeVisible();
  await expect(entry.getByText('+2.0R')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/journal');
  await expect(page).toHaveURL(/\/login\?next=%2Fjournal$/);
});
