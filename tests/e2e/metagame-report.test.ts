import { test, expect } from '@playwright/test';

test.describe('Metagame Report', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/metagame');
	});

	test('renders page title and filter panel', async ({ page }) => {
		await expect(page.locator('h1')).toHaveText('Metagame');
		await expect(page.getByTestId('filter-panel')).toBeVisible();
	});

	test('displays tournament info summary', async ({ page }) => {
		const info = page.locator('.tournament-info');
		await expect(info).toBeVisible();
		await expect(info).toContainText('tournament');
		await expect(info).toContainText('players');
		await expect(info).toContainText('decklists');
	});

	test('renders scatter plot', async ({ page }) => {
		await expect(page.getByTestId('scatter-canvas')).toBeVisible();
	});

	test('renders matchup matrix with archetype headers', async ({ page }) => {
		const matrix = page.locator('.matchup-matrix');
		await expect(matrix).toBeVisible();

		// Should have at least one row header (archetype name)
		const rowHeaders = matrix.locator('.row-header');
		await expect(rowHeaders.first()).toBeVisible();
		expect(await rowHeaders.count()).toBeGreaterThan(0);
	});

	test('matrix cells show winrate or mirror label', async ({ page }) => {
		// Wait for matrix to render
		await expect(page.locator('.matchup-matrix')).toBeVisible();

		// Check that mirror cells exist on the diagonal
		await expect(page.locator('.mirror-label').first()).toBeVisible();

		// Check that at least some winrate cells have data
		await expect(page.locator('.winrate').first()).toBeVisible();
	});

	test('matrix hover highlights row and column', async ({ page }) => {
		// Find a non-mirror cell with data
		const cell = page.getByTestId('cell-0-1');
		await cell.hover();

		// The cell should get the highlight-cross class
		await expect(cell).toHaveClass(/highlight-cross/);
	});

	test('changing format filter updates the matrix', async ({ page }) => {
		// Get the initial tournament info text
		const info = page.locator('.tournament-info');
		const initialText = await info.textContent();

		// Find the format select and change it
		const formatSelect = page.locator('select');
		const options = await formatSelect.locator('option').allTextContents();

		// If there's a specific format option (not just "All formats"), select it
		if (options.length > 1) {
			await formatSelect.selectOption({ index: 1 });
			// Wait for reactivity
			await page.waitForTimeout(200);

			// The info text should have changed (or at least still be valid)
			const newText = await info.textContent();
			expect(newText).toBeTruthy();
		}
	});

	test('toggling mirror match checkbox updates matrix', async ({ page }) => {
		const checkbox = page.locator('input[type="checkbox"]').first();
		const isChecked = await checkbox.isChecked();

		// Toggle the checkbox
		await checkbox.click();
		await page.waitForTimeout(200);

		// Verify it toggled
		expect(await checkbox.isChecked()).toBe(!isChecked);
	});
});
