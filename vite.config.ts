import { createReadStream, existsSync, statSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

const DATA_DIR = resolve("data");

/**
 * Serve tournament data over HTTP instead of bundling it:
 * - dev: middleware answering GET /data/* from the repo data/ dir
 * - build: copy data/ → build/data after adapter-static has written build/
 *   (closeBundle hooks run in plugin order, sveltekit()'s adapter first)
 */
function serveDataPlugin(): Plugin {
	let copyOnClose = false;
	return {
		name: "serve-tournament-data",
		configResolved(config) {
			copyOnClose = config.command === "build" && !config.build.ssr;
		},
		configureServer(server) {
			server.middlewares.use("/data", (req, res, next) => {
				const urlPath = decodeURIComponent((req.url ?? "").split("?")[0]);
				const filePath = resolve(join(DATA_DIR, urlPath));
				if (
					!filePath.startsWith(`${DATA_DIR}/`) ||
					!existsSync(filePath) ||
					!statSync(filePath).isFile()
				) {
					next();
					return;
				}
				res.setHeader("Content-Type", "application/json");
				createReadStream(filePath).pipe(res);
			});
		},
		async closeBundle() {
			if (!copyOnClose) return;
			await cp(DATA_DIR, resolve("build/data"), { recursive: true });
			console.log("serve-tournament-data: copied data/ → build/data");
		},
	};
}

export default defineConfig({
	plugins: [sveltekit(), serveDataPlugin()],
	server: {
		fs: {
			allow: ["data"],
		},
	},
});
