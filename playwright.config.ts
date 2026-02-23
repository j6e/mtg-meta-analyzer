import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.test.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	use: {
		baseURL: 'http://localhost:4173'
	},
	webServer: {
		command: 'bunx --bun vite build && bunx --bun vite preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	}
});
