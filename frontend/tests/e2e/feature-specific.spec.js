import { test, expect } from '@playwright/test';
import { setupApiMocks, setupCommonBrowserMocks, setAuthenticatedToken } from './support/mockApi';

test.describe('Feature-Specific Flows', () => {
  test('invite code CRUD + modal open/close + loading state', async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setAuthenticatedToken(page);
    await setupApiMocks(page, {
      authUser: { id: 1, username: 'admin', display_name: 'Admin', role: 'admin', avatar_config: {} },
      delayedInviteCodes: true,
      inviteCodes: [{ id: 1, code: 'WELCOME123', role: 'kid', times_used: 0, max_uses: 10 }],
    });

    await page.goto('/admin');

    await page.getByRole('button', { name: 'Invite Codes' }).click();
    await expect(page.locator('svg.animate-spin').first()).toBeVisible();
    await expect(page.getByText('WELCOME123')).toBeVisible();

    await page.getByRole('button', { name: 'Create Code' }).click();
    await expect(page.getByRole('heading', { name: 'Create Invite Code' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page.getByRole('heading', { name: 'Create Invite Code' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Create Code' }).click();
    await page.getByLabel('Role').selectOption('parent');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByRole('heading', { name: 'Create Invite Code' })).toHaveCount(0);
    await expect(page.getByText(/CODE\d+/)).toBeVisible();

    await page.locator('button[title="Delete code"]').first().click();
    await expect(page.getByText(/CODE\d+/)).toHaveCount(0);
  });

  test('error state is shown on failed login request', async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setupApiMocks(page, {
      authUser: null,
      loginShouldSucceed: false,
      loginError: 'Invalid credentials',
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('demo');
    await page.getByLabel('Password').fill('bad');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});
