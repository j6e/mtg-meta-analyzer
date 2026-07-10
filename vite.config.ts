import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Make tournament data available as fetchable static assets in the build
 * output: copy data/ → build/data after adapter-static has written build/.
 * SvelteKit runs the adapter in the SSR build's closeBundle, so we hook the
 * same build; plugin order (sveltekit() first) puts our hook after it.
 *
 * No dev-server counterpart is needed: data/ sits under the project root
 * and server.fs.allow covers it, so Vite already serves GET /data/* raw.
 * (A middleware here would actually break the bundled per-format indexes —
 * it would answer their module-import requests with plain JSON.)
 */
function copyDataPlugin(): Plugin {
	let copyOnClose = false;
	return {
		name: "copy-tournament-data",
		configResolved(config) {
			copyOnClose = config.command === "build" && !!config.build.ssr;
		},
		closeBundle: {
			sequential: true,
			async handler() {
				if (!copyOnClose) return;
				await cp(resolve("data"), resolve("build/data"), { recursive: true });
				console.log("copy-tournament-data: copied data/ → build/data");
			},
		},
	};
}

export default defineConfig({
	plugins: [sveltekit(), copyDataPlugin()],
	server: {
		fs: {
			allow: ["data"],
		},
	},
});
