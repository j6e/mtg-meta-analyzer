import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['tests/**/*.test.ts'],
		exclude: ['tests/e2e/**'],
		environment: 'node',
		environmentMatchGlobs: [['tests/component/**', 'jsdom']],
		setupFiles: ['tests/setup.ts']
	},
	resolve: {
		conditions: ['browser']
	}
});
