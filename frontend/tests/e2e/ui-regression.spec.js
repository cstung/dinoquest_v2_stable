import { test, expect } from '@playwright/test';
import { setupApiMocks, setupCommonBrowserMocks, setAuthenticatedToken } from './support/mockApi';

test.describe('UI Regression Checks', () => {
  test('important components render and no console errors on load', async ({ page }) => {
    await setupCommonBrowserMocks(page);
    await setAuthenticatedToken(page);
    await setupApiMocks(page, {
      authUser: { id: 2, username: 'parent', display_name: 'Parent', role: 'parent', avatar_config: {} },
    });

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
          consoleErrors.push(text);
        }
      }
    });

    await page.goto('/');

    await expect(page.getByText('ChoreQuest').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quests' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rewards' })).toBeVisible();

    await expect(consoleErrors).toEqual([]);
  });
});
