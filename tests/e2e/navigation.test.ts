import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('homepage loads with navigation links', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h1')).toHaveText('MTG Meta Analyzer');

		// Nav links present
		await expect(page.locator('nav a', { hasText: 'Metagame' })).toBeVisible();
		await expect(page.locator('nav a', { hasText: 'Tournaments' })).toBeVisible();
		await expect(page.locator('nav a', { hasText: 'Archetypes' })).toBeVisible();
	});

	test('navigate to metagame page', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav a', { hasText: 'Metagame' }).click();
		await expect(page).toHaveURL(/\/metagame/);
		await expect(page.locator('h1')).toHaveText('Metagame');
	});

	test('navigate to tournaments page', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav a', { hasText: 'Tournaments' }).click();
		await expect(page).toHaveURL(/\/tournaments/);
		await expect(page.locator('h1')).toHaveText('Tournaments');
	});

	test('navigate to archetypes page', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav a', { hasText: /^Archetypes$/ }).click();
		await expect(page).toHaveURL(/\/archetypes$/);
		await expect(page.locator('h1')).toHaveText('Archetypes');
	});

	test('navigate to archetype cleaner page', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav a', { hasText: 'Archetype Cleaner' }).click();
		await expect(page).toHaveURL(/\/archetype-cleaner/);
		await expect(page.locator('h1')).toHaveText('Archetype Cleaner');
	});

	test('tournaments page shows tournament list with links', async ({ page }) => {
		await page.goto('/tournaments');

		// Wait for table rows to appear
		await expect(page.locator('tbody tr').first()).toBeVisible();

		// Tournament links should point to melee.gg
		const firstLink = page.locator('tbody tr').first().locator('a');
		await expect(firstLink).toHaveAttribute('href', /melee\.gg/);
	});

	test('archetypes page shows archetype table', async ({ page }) => {
		await page.goto('/archetypes');

		// Wait for table rows to appear
		await expect(page.locator('tbody tr').first()).toBeVisible();

		// Click an archetype to go to detail page
		const firstLink = page.locator('tbody tr').first().locator('a');
		const archetypeName = await firstLink.textContent();
		await firstLink.click();

		await expect(page).toHaveURL(/\/archetypes\//);
		await expect(page.locator('h1')).toHaveText(archetypeName!);
	});

	test('archetype detail page shows stats and matchups', async ({ page }) => {
		await page.goto('/archetypes');
		await page.locator('tbody tr').first().locator('a').click();

		// Stat cards should be visible
		await expect(page.locator('.stat-card').first()).toBeVisible();

		// Matchups tab should be active by default and table visible
		await expect(page.locator('.tab-btn', { hasText: 'Matchups' })).toBeVisible();
		await expect(page.locator('.tab-content table').first()).toBeVisible();
	});

	test('archetype detail page shows decklists via tab', async ({ page }) => {
		await page.goto('/archetypes');
		await page.locator('tbody tr').first().locator('a').click();

		// Tab bar should be present
		await expect(page.locator('.tab-bar')).toBeVisible();

		// Click the Decklists tab
		await page.locator('.tab-btn', { hasText: 'Decklists' }).click();

		// At least one decklist should render
		await expect(page.locator('.decklist').first()).toBeVisible();
	});

	test('non-existent archetype shows not found', async ({ page }) => {
		await page.goto('/archetypes/NonExistentArchetype12345');
		await expect(page.locator('.not-found')).toBeVisible();
	});

	test('logo navigates back to home', async ({ page }) => {
		await page.goto('/metagame');
		await page.locator('.logo').click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('h1')).toHaveText('MTG Meta Analyzer');
	});
});
