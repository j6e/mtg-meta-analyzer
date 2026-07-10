import { cp, readFile } from "node:fs/promises";
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
		// vite preview serves .svelte-kit/output (not build/), and SvelteKit's
		// preview middlewares end in a terminal catch-all, so serve /data/*
		// here — hook-body middlewares run before all returned post-hooks.
		configurePreviewServer(server) {
			server.middlewares.use("/data", async (req, res, next) => {
				const urlPath = decodeURIComponent((req.url ?? "").split("?")[0]);
				if (urlPath.includes("..")) return next();
				try {
					const content = await readFile(resolve("data") + urlPath);
					res.setHeader(
						"Content-Type",
						urlPath.endsWith(".json") ? "application/json" : "application/octet-stream",
					);
					res.end(content);
				} catch {
					next();
				}
			});
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
