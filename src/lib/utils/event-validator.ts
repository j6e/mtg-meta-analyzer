import { parse as parseYaml } from "yaml";

export interface EventValidationResult {
	ok: boolean;
	rewardTierCount: number;
	errors: string[];
	warnings: string[];
}

/**
 * Validate event YAML content with structured error/warning output.
 */
export function validateEventYaml(yamlContent: string): EventValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	let data: unknown;
	try {
		data = parseYaml(yamlContent);
	} catch (e) {
		return {
			ok: false,
			rewardTierCount: 0,
			errors: [`YAML syntax error: ${(e as Error).message}`],
			warnings: [],
		};
	}

	if (data == null || typeof data !== "object") {
		return {
			ok: false,
			rewardTierCount: 0,
			errors: ["YAML must be an object"],
			warnings: [],
		};
	}

	const obj = data as Record<string, unknown>;

	// Required: name
	if (!obj.name || typeof obj.name !== "string") {
		errors.push('Missing or invalid "name" (must be a string)');
	}

	// Required: entry
	if (!obj.entry || typeof obj.entry !== "object") {
		errors.push('Missing or invalid "entry" (must be an object)');
	} else {
		const entry = obj.entry as Record<string, unknown>;
		if (typeof entry.amount !== "number") {
			errors.push('"entry.amount" must be a number');
		}
		if (typeof entry.currency !== "string") {
			errors.push('"entry.currency" must be a string');
		}
	}

	// Required: max_wins
	if (typeof obj.max_wins !== "number" || obj.max_wins < 1) {
		errors.push('"max_wins" must be a positive integer');
	}

	// Optional: max_losses (warn if missing)
	if (obj.max_losses === undefined) {
		warnings.push('"max_losses" not specified, defaulting to 3');
	} else if (typeof obj.max_losses !== "number" || obj.max_losses < 1) {
		errors.push('"max_losses" must be a positive integer');
	}

	// Optional: format
	if (obj.format !== undefined && typeof obj.format !== "string") {
		warnings.push('"format" should be a string');
	}

	// Rewards
	if (!obj.rewards || typeof obj.rewards !== "object") {
		errors.push('Missing or invalid "rewards" (must be an object)');
	} else {
		const rewards = obj.rewards as Record<string, unknown>;
		const seenWins = new Set<number>();
		let tierCount = 0;

		for (const key of Object.keys(rewards)) {
			const rangeMatch = String(key).match(/^(\d+)-(\d+)$/);
			if (rangeMatch) {
				const lo = parseInt(rangeMatch[1], 10);
				const hi = parseInt(rangeMatch[2], 10);
				if (lo > hi) {
					errors.push(`Range key "${key}": start (${lo}) must be ≤ end (${hi})`);
					continue;
				}
				for (let w = lo; w <= hi; w++) {
					if (seenWins.has(w)) {
						errors.push(
							`Overlapping reward key: wins=${w} is covered by multiple keys`,
						);
					}
					seenWins.add(w);
					tierCount++;
				}
			} else {
				const n = parseInt(String(key), 10);
				if (Number.isNaN(n) || n < 0) {
					errors.push(
						`Invalid reward key "${key}": must be a non-negative integer or N-M range`,
					);
					continue;
				}
				if (seenWins.has(n)) {
					errors.push(`Overlapping reward key: wins=${n} is covered by multiple keys`);
				}
				seenWins.add(n);
				tierCount++;
			}

			// Check reward value is an object
			const val = rewards[key];
			if (val !== null && val !== undefined && typeof val !== "object") {
				errors.push(`Reward at "${key}" must be an object (or empty)`);
			} else if (
				val &&
				typeof val === "object" &&
				Object.keys(val as object).length === 0
			) {
				// Empty reward is fine (no reward for this tier)
			}
		}

		return {
			ok: errors.length === 0,
			rewardTierCount: tierCount,
			errors,
			warnings,
		};
	}

	return {
		ok: errors.length === 0,
		rewardTierCount: 0,
		errors,
		warnings,
	};
}
