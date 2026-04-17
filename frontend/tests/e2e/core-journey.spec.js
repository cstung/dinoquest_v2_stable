import { test, expect } from '@playwright/test';
import { setupApiMocks, setupCommonBrowserMocks, setAuthenticatedToken } from './support/mockApi';

test.describe('Core User Journey', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setAuthenticatedToken(page);
    await setupApiMocks(page, {
      authUser: { id: 20, username: 'parent1', display_name: 'Parent One', role: 'parent', avatar_config: {} },
    });
  });

  test('landing page loads and navigation between main pages works', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('ChoreQuest').first()).toBeVisible();

    await page.getByRole('button', { name: 'Quests' }).click();
    await expect(page).toHaveURL(/\/chores$/);

    await page.getByRole('button', { name: 'Rewards' }).click();
    await expect(page).toHaveURL(/\/rewards$/);

    await page.getByRole('button', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/calendar$/);

    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('key buttons are clickable and form submission works on login route', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Username').fill('demo');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/$/);
  });
});
