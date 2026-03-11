import { parse as parseYaml } from "yaml";
import type {
	ArchetypeDefinition,
	ArchetypeYaml,
	ParsedArchetypeConfig,
} from "../types/archetype";
import type { CardEntry, DecklistInfo } from "../types/decklist";
import { getCommanderShortName, getFrontFace } from "../utils/card-normalizer";
import { knnClassify, type LabeledPoint } from "./knn";
import { buildCorpus, vectorize } from "./tfidf";

export interface ClassificationResult {
	decklistId: string;
	archetype: string;
	method: "signature" | "knn" | "commander" | "unknown";
	confidence: number; // 1.0 for signature match, KNN confidence for knn, 0 for unknown
	neighbors?: { archetype: string; similarity: number }[]; // only present for method === "knn"
	representativeCard?: string; // full card name for art lookup (commander method)
}

/**
 * Parse archetype YAML content into a ParsedArchetypeConfig.
 */
export function parseArchetypeYaml(yamlContent: string): ParsedArchetypeConfig {
	const data = parseYaml(yamlContent) as ArchetypeYaml;
	return {
		archetypes: data.archetypes ?? [],
		nameEqualsCommander: data.nameEqualsCommander ?? false,
	};
}

/**
 * Rule-based classification: check if a decklist contains all signature cards
 * at the required minimum copies.
 *
 * Returns the archetype name if matched, null otherwise.
 * If multiple archetypes match, returns the one with the most signature card matches.
 */
export function classifyBySignatureCards(
	mainboard: CardEntry[],
	commanders: CardEntry[] | null,
	archetypeDefs: ArchetypeDefinition[],
): string | null {
	const cardQuantities = new Map<string, number>();
	for (const entry of mainboard) {
		const name = getFrontFace(entry.cardName);
		cardQuantities.set(name, (cardQuantities.get(name) ?? 0) + entry.quantity);
	}

	const commanderNames = new Set<string>();
	if (commanders) {
		for (const entry of commanders) {
			commanderNames.add(getFrontFace(entry.cardName));
		}
	}

	let bestMatch: string | null = null;
	let bestMatchCount = 0;

	for (const archetype of archetypeDefs) {
		const allMatch = archetype.signatureCards.every((sig) => {
			if (sig.usedAsCommander) {
				return commanderNames.has(sig.name);
			}
			const qty = cardQuantities.get(sig.name) ?? 0;
			if (sig.exactCopies !== undefined) {
				return qty === sig.exactCopies;
			}
			return qty >= (sig.minCopies ?? 1);
		});

		if (allMatch && archetype.signatureCards.length > bestMatchCount) {
			bestMatch = archetype.name;
			bestMatchCount = archetype.signatureCards.length;
		}
	}

	return bestMatch;
}

interface DeterministicResult {
	results: ClassificationResult[];
	classified: Map<string, string>; // decklistId → archetype
	unclassifiedIds: string[];
}

/**
 * Run deterministic classification passes (signature cards + commander name).
 * Returns classified results and the list of still-unclassified decklist IDs.
 */
function classifyDeterministic(
	decklists: Record<string, DecklistInfo>,
	archetypeDefs: ArchetypeDefinition[],
	nameEqualsCommander: boolean,
): DeterministicResult {
	const results: ClassificationResult[] = [];
	const classified = new Map<string, string>();
	let unclassifiedIds: string[] = [];

	// Pass 1: Signature card matching
	for (const [id, decklist] of Object.entries(decklists)) {
		const archetype = classifyBySignatureCards(
			decklist.mainboard,
			decklist.commanders,
			archetypeDefs,
		);
		if (archetype) {
			classified.set(id, archetype);
			results.push({
				decklistId: id,
				archetype,
				method: "signature",
				confidence: 1.0,
			});
		} else {
			unclassifiedIds.push(id);
		}
	}

	// Pass 2: Commander name fallback
	if (nameEqualsCommander && unclassifiedIds.length > 0) {
		const stillUnclassified: string[] = [];
		for (const id of unclassifiedIds) {
			const decklist = decklists[id];
			const commanders = decklist.commanders;
			if (commanders && commanders.length > 0) {
				const isPartners = commanders.length > 1;
				const commanderName = isPartners
					? commanders
							.map((c) => getCommanderShortName(c.cardName))
							.sort()
							.join(" & ")
					: getFrontFace(commanders[0].cardName);
				const representativeCard = getFrontFace(commanders[0].cardName);
				classified.set(id, commanderName);
				results.push({
					decklistId: id,
					archetype: commanderName,
					method: "commander",
					confidence: 1.0,
					representativeCard,
				});
			} else {
				stillUnclassified.push(id);
			}
		}
		unclassifiedIds = stillUnclassified;
	}

	return { results, classified, unclassifiedIds };
}

/**
 * Classify all decklists using a multi-pass approach:
 * 1. Signature card matching (rule-based)
 * 2. Commander name fallback (if nameEqualsCommander is enabled)
 * 3. KNN classification for remaining unclassified decklists
 */
export function classifyAll(
	decklists: Record<string, DecklistInfo>,
	archetypeDefs: ArchetypeDefinition[],
	options: { k?: number; minConfidence?: number; nameEqualsCommander?: boolean } = {},
): ClassificationResult[] {
	const { k = 5, minConfidence = 0.3, nameEqualsCommander = false } = options;

	const { results, classified, unclassifiedIds } = classifyDeterministic(
		decklists,
		archetypeDefs,
		nameEqualsCommander,
	);

	// If no unclassified decklists or no labeled data, done
	if (unclassifiedIds.length === 0 || classified.size === 0) {
		for (const id of unclassifiedIds) {
			results.push({
				decklistId: id,
				archetype: "Unknown",
				method: "unknown",
				confidence: 0,
			});
		}
		return results;
	}

	// Pass 3: KNN classification
	// Build TF-IDF corpus from all decklists
	const decklistEntries = Object.entries(decklists);
	const allMainboards = decklistEntries.map(([, d]) => d.mainboard);
	const corpus = buildCorpus(allMainboards);

	// Build labeled training set from signature-classified decklists,
	// excluding strict-mode archetypes so KNN cannot produce those labels
	const strictArchetypes = new Set(
		archetypeDefs.filter((d) => d.strictMode).map((d) => d.name),
	);
	const labeledPoints: LabeledPoint[] = [];
	for (const [id, archetype] of classified) {
		if (strictArchetypes.has(archetype)) continue;
		const decklist = decklists[id];
		const vector = vectorize(decklist.mainboard, corpus);
		labeledPoints.push({ vector, label: archetype });
	}

	// Classify unclassified decklists
	for (const id of unclassifiedIds) {
		const decklist = decklists[id];
		const vector = vectorize(decklist.mainboard, corpus);
		const knnResult = knnClassify(vector, labeledPoints, k);

		if (knnResult && knnResult.confidence >= minConfidence) {
			results.push({
				decklistId: id,
				archetype: knnResult.label,
				method: "knn",
				confidence: knnResult.confidence,
				neighbors: knnResult.neighbors.map((n) => ({
					archetype: n.label,
					similarity: n.similarity,
				})),
			});
		} else {
			results.push({
				decklistId: id,
				archetype: "Unknown",
				method: "unknown",
				confidence: knnResult?.confidence ?? 0,
			});
		}
	}

	return results;
}

/**
 * Classify decklists across multiple tournaments with a pooled KNN pass.
 * Pass 1 (signature cards) and Pass 2 (commander name) run per-tournament.
 * Pass 3 (KNN) pools all tournaments: the TF-IDF corpus and training set
 * are built from all tournaments combined, so unclassified decks in small
 * tournaments benefit from labeled decks in other tournaments.
 */
export function classifyAllPooled(
	tournamentDecklists: Map<string, Record<string, DecklistInfo>>,
	archetypeDefs: ArchetypeDefinition[],
	options: { k?: number; minConfidence?: number; nameEqualsCommander?: boolean } = {},
): Map<string, ClassificationResult[]> {
	const { k = 5, minConfidence = 0.3, nameEqualsCommander = false } = options;
	const resultMap = new Map<string, ClassificationResult[]>();

	// Per-tournament deterministic passes
	const allClassified = new Map<string, string>(); // global decklistId → archetype
	const allUnclassified: { tournamentId: string; decklistId: string }[] = [];
	const allDecklists = new Map<string, DecklistInfo>(); // global decklistId → decklist

	for (const [tournamentId, decklists] of tournamentDecklists) {
		const { results, classified, unclassifiedIds } = classifyDeterministic(
			decklists,
			archetypeDefs,
			nameEqualsCommander,
		);
		resultMap.set(tournamentId, results);

		for (const [id, archetype] of classified) {
			allClassified.set(id, archetype);
			allDecklists.set(id, decklists[id]);
		}
		for (const id of unclassifiedIds) {
			allUnclassified.push({ tournamentId, decklistId: id });
			allDecklists.set(id, decklists[id]);
		}
	}

	// Early exit: nothing to KNN-classify or no training data
	if (allUnclassified.length === 0 || allClassified.size === 0) {
		for (const { tournamentId, decklistId } of allUnclassified) {
			resultMap.get(tournamentId)!.push({
				decklistId,
				archetype: "Unknown",
				method: "unknown",
				confidence: 0,
			});
		}
		return resultMap;
	}

	// Build pooled TF-IDF corpus from ALL mainboards across all tournaments
	const allMainboards: CardEntry[][] = [];
	for (const decklist of allDecklists.values()) {
		allMainboards.push(decklist.mainboard);
	}
	const corpus = buildCorpus(allMainboards);

	// Build pooled labeled training set (excluding strictMode archetypes)
	const strictArchetypes = new Set(
		archetypeDefs.filter((d) => d.strictMode).map((d) => d.name),
	);
	const labeledPoints: LabeledPoint[] = [];
	for (const [id, archetype] of allClassified) {
		if (strictArchetypes.has(archetype)) continue;
		const decklist = allDecklists.get(id)!;
		const vector = vectorize(decklist.mainboard, corpus);
		labeledPoints.push({ vector, label: archetype });
	}

	// KNN classify all remaining unclassified decks against the pooled training set
	for (const { tournamentId, decklistId } of allUnclassified) {
		const decklist = allDecklists.get(decklistId)!;
		const vector = vectorize(decklist.mainboard, corpus);
		const knnResult = knnClassify(vector, labeledPoints, k);

		if (knnResult && knnResult.confidence >= minConfidence) {
			resultMap.get(tournamentId)!.push({
				decklistId,
				archetype: knnResult.label,
				method: "knn",
				confidence: knnResult.confidence,
				neighbors: knnResult.neighbors.map((n) => ({
					archetype: n.label,
					similarity: n.similarity,
				})),
			});
		} else {
			resultMap.get(tournamentId)!.push({
				decklistId,
				archetype: "Unknown",
				method: "unknown",
				confidence: knnResult?.confidence ?? 0,
			});
		}
	}

	return resultMap;
}
