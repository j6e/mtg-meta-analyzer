import { getFrontFace } from "../../src/lib/utils/card-normalizer";
import { OMENPATHS_TO_PAPER } from "./omenpaths-catalog";

export interface OmenpathsCardFace {
	name: string;
	printed_name?: string;
}

export interface OmenpathsCard extends OmenpathsCardFace {
	card_faces?: OmenpathsCardFace[];
}

export type OmenpathsDirection = "to-paper" | "to-online";

export function parseOmenpathsDirection(arg: string): OmenpathsDirection | undefined {
	if (arg === "--to-paper") return "to-paper";
	if (arg === "--to-online") return "to-online";
	return undefined;
}

export interface OmenpathsNameMaps {
	/** MTGO/online display name → Scryfall's canonical paper name. */
	toPaper: Map<string, string>;
	/** Scryfall's canonical paper name → MTGO/online display name. */
	toOnline: Map<string, string>;
}

/** Load the checked-in, bidirectional Omenpaths catalog without network access. */
export function getOmenpathsNameMaps(): OmenpathsNameMaps {
	const toPaper = new Map(OMENPATHS_TO_PAPER);
	const toOnline = new Map<string, string>();

	for (const [onlineName, paperName] of toPaper) {
		const existingOnline = toOnline.get(paperName);
		if (existingOnline && existingOnline !== onlineName) {
			throw new Error(
				`Ambiguous Through the Omenpaths paper name ${JSON.stringify(paperName)}: ${existingOnline} / ${onlineName}`,
			);
		}
		toOnline.set(paperName, onlineName);
	}

	return { toPaper, toOnline };
}

/**
 * Build the reversible name maps from Scryfall's Through the Omenpaths cards.
 * Scryfall stores the paper name in `name` and the MTGO-only name in
 * `printed_name`.
 */
export function buildOmenpathsNameMaps(cards: OmenpathsCard[]): OmenpathsNameMaps {
	const toPaper = new Map<string, string>();
	const toOnline = new Map<string, string>();

	for (const card of cards) {
		const names = [card, ...(card.card_faces ?? [])];
		for (const face of names) {
			if (!face.printed_name || face.printed_name === face.name) continue;

			const paperName = getFrontFace(face.name);
			const onlineName = getFrontFace(face.printed_name);
			const existingPaper = toPaper.get(onlineName);
			const existingOnline = toOnline.get(paperName);

			if (existingPaper && existingPaper !== paperName) {
				throw new Error(
					`Ambiguous Through the Omenpaths online name ${JSON.stringify(onlineName)}: ${existingPaper} / ${paperName}`,
				);
			}
			if (existingOnline && existingOnline !== onlineName) {
				throw new Error(
					`Ambiguous Through the Omenpaths paper name ${JSON.stringify(paperName)}: ${existingOnline} / ${onlineName}`,
				);
			}

			toPaper.set(onlineName, paperName);
			toOnline.set(paperName, onlineName);
		}
	}

	return { toPaper, toOnline };
}

export function convertOmenpathsName(
	name: string,
	maps: OmenpathsNameMaps,
	direction: OmenpathsDirection,
): string {
	const frontFace = getFrontFace(name);
	return (
		(direction === "to-paper" ? maps.toPaper : maps.toOnline).get(frontFace) ?? name
	);
}

/**
 * Normalize a card name received from an ingestion source into the canonical
 * paper/front-face name used by the application.
 *
 * The catalog is checked in and loaded locally so tournament fetching never
 * depends on Scryfall availability or rate limits.
 */
export function normalizeImportedCardName(name: string): string {
	const frontFace = getFrontFace(name);
	return OMENPATHS_TO_PAPER.get(frontFace) ?? frontFace;
}
