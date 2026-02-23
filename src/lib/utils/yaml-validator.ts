import { parse as parseYaml } from 'yaml';

export interface ValidationResult {
	ok: boolean;
	archetypeCount: number;
	errors: string[];
	warnings: string[];
}

/**
 * Validate archetype YAML content with structured error/warning output.
 */
export function validateArchetypeYaml(yamlContent: string): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Parse YAML
	let data: unknown;
	try {
		data = parseYaml(yamlContent);
	} catch (e) {
		return {
			ok: false,
			archetypeCount: 0,
			errors: [`YAML syntax error: ${(e as Error).message}`],
			warnings: [],
		};
	}

	if (data == null || typeof data !== 'object') {
		return { ok: false, archetypeCount: 0, errors: ['YAML must be an object'], warnings: [] };
	}

	const obj = data as Record<string, unknown>;

	// Warn on missing top-level fields
	if (!obj.format) warnings.push('Missing "format" field');
	if (!obj.date) warnings.push('Missing "date" field');

	// Validate archetypes array
	if (!Array.isArray(obj.archetypes)) {
		return {
			ok: false,
			archetypeCount: 0,
			errors: ['"archetypes" must be an array'],
			warnings,
		};
	}

	if (obj.archetypes.length === 0) {
		return {
			ok: false,
			archetypeCount: 0,
			errors: ['"archetypes" array is empty'],
			warnings,
		};
	}

	const seenNames = new Set<string>();

	for (let i = 0; i < obj.archetypes.length; i++) {
		const arch = obj.archetypes[i] as Record<string, unknown>;
		const prefix = `archetypes[${i}]`;

		if (!arch || typeof arch !== 'object') {
			errors.push(`${prefix}: must be an object`);
			continue;
		}

		// Name
		if (!arch.name || typeof arch.name !== 'string') {
			errors.push(`${prefix}: missing or invalid "name"`);
		} else {
			if (seenNames.has(arch.name)) {
				warnings.push(`Duplicate archetype name: "${arch.name}"`);
			}
			seenNames.add(arch.name);
		}

		// Signature cards
		if (!Array.isArray(arch.signatureCards)) {
			errors.push(`${prefix} (${arch.name ?? '?'}): "signatureCards" must be an array`);
			continue;
		}

		for (let j = 0; j < arch.signatureCards.length; j++) {
			const card = arch.signatureCards[j] as Record<string, unknown>;
			const cardPrefix = `${prefix}.signatureCards[${j}]`;

			if (!card || typeof card !== 'object') {
				errors.push(`${cardPrefix}: must be an object`);
				continue;
			}

			if (!card.name || typeof card.name !== 'string') {
				errors.push(`${cardPrefix}: missing or invalid "name"`);
			}

			const hasMin = card.minCopies !== undefined;
			const hasExact = card.exactCopies !== undefined;

			if (!hasMin && !hasExact) {
				warnings.push(
					`${cardPrefix} (${card.name ?? '?'}): no minCopies or exactCopies (defaults to minCopies: 1)`,
				);
			}
		}
	}

	return {
		ok: errors.length === 0,
		archetypeCount: obj.archetypes.length,
		errors,
		warnings,
	};
}
