import { parse as parseYaml } from 'yaml';
import type { ArchetypeDefinition, ArchetypeYaml } from '../types/archetype';
import type { CardEntry, DecklistInfo } from '../types/decklist';
import { buildCorpus, vectorize, type SparseVector } from './tfidf';
import { knnClassify, type LabeledPoint } from './knn';
import { getFrontFace } from '../utils/card-normalizer';

export interface ClassificationResult {
	decklistId: string;
	archetype: string;
	method: 'signature' | 'knn' | 'unknown';
	confidence: number; // 1.0 for signature match, KNN confidence for knn, 0 for unknown
}

/**
 * Parse archetype YAML content into ArchetypeDefinition[].
 */
export function parseArchetypeYaml(yamlContent: string): ArchetypeDefinition[] {
	const data = parseYaml(yamlContent) as ArchetypeYaml;
	return data.archetypes ?? [];
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
	archetypeDefs: ArchetypeDefinition[],
): string | null {
	const cardQuantities = new Map<string, number>();
	for (const entry of mainboard) {
		const name = getFrontFace(entry.cardName);
		cardQuantities.set(name, (cardQuantities.get(name) ?? 0) + entry.quantity);
	}

	let bestMatch: string | null = null;
	let bestMatchCount = 0;

	for (const archetype of archetypeDefs) {
		const allMatch = archetype.signatureCards.every((sig) => {
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

/**
 * Classify all decklists using a two-pass approach:
 * 1. Signature card matching (rule-based)
 * 2. KNN classification for remaining unclassified decklists
 */
export function classifyAll(
	decklists: Record<string, DecklistInfo>,
	archetypeDefs: ArchetypeDefinition[],
	options: { k?: number; minConfidence?: number } = {},
): ClassificationResult[] {
	const { k = 5, minConfidence = 0.3 } = options;
	const results: ClassificationResult[] = [];

	const decklistEntries = Object.entries(decklists);

	// Pass 1: Signature card matching
	const classified = new Map<string, string>(); // decklistId → archetype
	const unclassifiedIds: string[] = [];

	for (const [id, decklist] of decklistEntries) {
		const archetype = classifyBySignatureCards(decklist.mainboard, archetypeDefs);
		if (archetype) {
			classified.set(id, archetype);
			results.push({ decklistId: id, archetype, method: 'signature', confidence: 1.0 });
		} else {
			unclassifiedIds.push(id);
		}
	}

	// If no unclassified decklists or no labeled data, done
	if (unclassifiedIds.length === 0 || classified.size === 0) {
		for (const id of unclassifiedIds) {
			results.push({ decklistId: id, archetype: 'Unknown', method: 'unknown', confidence: 0 });
		}
		return results;
	}

	// Pass 2: KNN classification
	// Build TF-IDF corpus from all decklists
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
				method: 'knn',
				confidence: knnResult.confidence,
			});
		} else {
			results.push({
				decklistId: id,
				archetype: 'Unknown',
				method: 'unknown',
				confidence: knnResult?.confidence ?? 0,
			});
		}
	}

	return results;
}
