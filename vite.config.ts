import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Make tournament data available as fetchable static assets in the build
 * output: copy data/ → build/data after adapter-static has written build/
 * (closeBundle hooks run in plugin order, sveltekit()'s adapter first).
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
			copyOnClose = config.command === "build" && !config.build.ssr;
		},
		async closeBundle() {
			if (!copyOnClose) return;
			await cp(resolve("data"), resolve("build/data"), { recursive: true });
			console.log("copy-tournament-data: copied data/ → build/data");
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
