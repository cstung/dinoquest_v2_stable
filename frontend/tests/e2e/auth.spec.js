import { test, expect } from '@playwright/test';
import { setupApiMocks, setupCommonBrowserMocks, setAuthenticatedToken } from './support/mockApi';

test.describe('Authentication Flow', () => {
  test('login success with valid credentials', async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setupApiMocks(page, {
      authUser: { id: 10, username: 'demo', display_name: 'Demo User', role: 'parent', avatar_config: {} },
      loginShouldSucceed: true,
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('demo');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('ChoreQuest').first()).toBeVisible();
  });

  test('login failure with invalid credentials', async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setupApiMocks(page, {
      authUser: null,
      loginShouldSucceed: false,
      loginError: 'Invalid credentials',
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('baduser');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('empty form validation', async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setupApiMocks(page, { authUser: null });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Username is required')).toBeVisible();
  });

  test('logout flow', async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setAuthenticatedToken(page);
    await setupApiMocks(page, {
      authUser: { id: 12, username: 'demo', display_name: 'Demo User', role: 'parent', avatar_config: {} },
    });

    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign Out' }).click();

    await expect(page).toHaveURL(/\/login$/);
  });
});
