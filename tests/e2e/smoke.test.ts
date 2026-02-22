import { test, expect } from '@playwright/test';

test('homepage has content', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});
