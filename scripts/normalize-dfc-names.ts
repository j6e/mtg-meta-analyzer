/**
 * Data migration: normalize DFC card names in all tournament JSON files.
 * Replaces full DFC names like "Hearth Elemental // Stoke Genius"
 * with front-face-only names like "Hearth Elemental".
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TournamentData } from "../src/lib/types/tournament";
import { getFrontFace } from "../src/lib/utils/card-normalizer";

const DATA_DIR = join(import.meta.dir, "../data");
const DFC_PATTERN = /\s*\/\/\s*/;

function normalizeEntries(entries: { cardName: string; quantity: number }[]): boolean {
	let changed = false;
	for (const entry of entries) {
		if (DFC_PATTERN.test(entry.cardName)) {
			entry.cardName = getFrontFace(entry.cardName);
			changed = true;
		}
	}
	return changed;
}

async function main() {
	const formats = readdirSync(DATA_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name !== "tournaments")
		.map((d) => d.name);

	let totalFiles = 0;
	let modifiedFiles = 0;
	let totalCards = 0;

	for (const format of formats) {
		const formatDir = join(DATA_DIR, format);
		const months = readdirSync(formatDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);

		for (const month of months) {
			const monthDir = join(formatDir, month);
			const files = readdirSync(monthDir).filter((f) => f.endsWith(".json"));

			for (const file of files) {
				const filePath = join(monthDir, file);
				const data: TournamentData = await Bun.file(filePath).json();
				let fileChanged = false;

				for (const decklist of Object.values(data.decklists)) {
					const mbChanged = normalizeEntries(decklist.mainboard);
					const sbChanged = normalizeEntries(decklist.sideboard);
					if (mbChanged || sbChanged) {
						fileChanged = true;
						totalCards++;
					}
				}

				totalFiles++;
				if (fileChanged) {
					writeFileSync(filePath, JSON.stringify(data, null, 2));
					modifiedFiles++;
					console.log(`  normalized: ${format}/${month}/${file}`);
				}
			}
		}
	}

	console.log(
		`\nScanned ${totalFiles} files, modified ${modifiedFiles} (${totalCards} decklists with DFC names).`,
	);
}

main().catch(console.error);
