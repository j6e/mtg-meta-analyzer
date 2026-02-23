import { describe, it, expect } from 'vitest';
import { validateArchetypeYaml } from '../../src/lib/utils/yaml-validator';

const validYaml = `
format: Standard
date: "2026-01-10"
archetypes:
  - name: Mono Red
    signatureCards:
      - name: Lightning Bolt
        minCopies: 4
      - name: Goblin Guide
        minCopies: 3
  - name: Control
    signatureCards:
      - name: Counterspell
        exactCopies: 3
`;

describe('validateArchetypeYaml', () => {
	it('returns ok for valid YAML', () => {
		const result = validateArchetypeYaml(validYaml);
		expect(result.ok).toBe(true);
		expect(result.archetypeCount).toBe(2);
		expect(result.errors).toHaveLength(0);
	});

	it('returns error for YAML syntax errors', () => {
		const result = validateArchetypeYaml('archetypes:\n  - name: Bad\n  invalid: [');
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toContain('YAML syntax error');
	});

	it('returns error when archetypes is not an array', () => {
		const result = validateArchetypeYaml('archetypes: not-an-array');
		expect(result.ok).toBe(false);
		expect(result.errors).toContain('"archetypes" must be an array');
	});

	it('returns error when archetypes array is empty', () => {
		const result = validateArchetypeYaml('archetypes: []');
		expect(result.ok).toBe(false);
		expect(result.errors).toContain('"archetypes" array is empty');
	});

	it('returns error for archetype without name', () => {
		const yaml = `
archetypes:
  - signatureCards:
      - name: Card A
        minCopies: 4
`;
		const result = validateArchetypeYaml(yaml);
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => e.includes('missing or invalid "name"'))).toBe(true);
	});

	it('returns error for archetype without signatureCards array', () => {
		const yaml = `
archetypes:
  - name: Bad Archetype
    signatureCards: not-an-array
`;
		const result = validateArchetypeYaml(yaml);
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => e.includes('"signatureCards" must be an array'))).toBe(true);
	});

	it('warns on duplicate archetype names', () => {
		const yaml = `
archetypes:
  - name: Duplicate
    signatureCards:
      - name: Card A
        minCopies: 4
  - name: Duplicate
    signatureCards:
      - name: Card B
        minCopies: 3
`;
		const result = validateArchetypeYaml(yaml);
		expect(result.ok).toBe(true);
		expect(result.warnings.some((w) => w.includes('Duplicate archetype name'))).toBe(true);
	});

	it('warns when signature card has neither minCopies nor exactCopies', () => {
		const yaml = `
archetypes:
  - name: Test
    signatureCards:
      - name: Some Card
`;
		const result = validateArchetypeYaml(yaml);
		expect(result.ok).toBe(true);
		expect(result.warnings.some((w) => w.includes('no minCopies or exactCopies'))).toBe(true);
	});

	it('warns on missing format and date fields', () => {
		const yaml = `
archetypes:
  - name: Test
    signatureCards:
      - name: Card A
        minCopies: 1
`;
		const result = validateArchetypeYaml(yaml);
		expect(result.warnings.some((w) => w.includes('Missing "format"'))).toBe(true);
		expect(result.warnings.some((w) => w.includes('Missing "date"'))).toBe(true);
	});

	it('returns error for non-object YAML', () => {
		const result = validateArchetypeYaml('just a string');
		expect(result.ok).toBe(false);
	});
});
