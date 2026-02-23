import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock localStorage before importing the store
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store[key] ?? null,
	setItem: (key: string, value: string) => {
		store[key] = value;
	},
	removeItem: (key: string) => {
		delete store[key];
	},
});

// Dynamic import so the mock is in place before module initialization
const {
	savedConfigs,
	activeConfigId,
	activeArchetypeYaml,
	activeArchetypeDefs,
	builtinArchetypeYaml,
	BUILTIN_CONFIG_ID,
	saveConfig,
	updateConfig,
	deleteConfig,
	setActiveConfig,
	renameConfig,
} = await import('../../src/lib/stores/archetype-configs');

const validYaml = `
format: Test
date: "2026-01-01"
archetypes:
  - name: TestArch
    signatureCards:
      - name: TestCard
        minCopies: 4
`;

beforeEach(() => {
	// Reset stores to default state
	savedConfigs.set([]);
	activeConfigId.set(BUILTIN_CONFIG_ID);
	// Clear mock localStorage
	for (const key of Object.keys(store)) delete store[key];
});

describe('archetype-configs store', () => {
	it('defaults to built-in config', () => {
		expect(get(activeConfigId)).toBe(BUILTIN_CONFIG_ID);
		expect(get(activeArchetypeYaml)).toBe(builtinArchetypeYaml);
	});

	it('activeArchetypeDefs parses built-in YAML into definitions', () => {
		const defs = get(activeArchetypeDefs);
		expect(defs.length).toBeGreaterThan(0);
		expect(defs[0].name).toBeTruthy();
		expect(defs[0].signatureCards).toBeInstanceOf(Array);
	});

	it('saveConfig creates a new config', () => {
		const id = saveConfig('My Config', 'Standard', validYaml);
		const configs = get(savedConfigs);
		expect(configs).toHaveLength(1);
		expect(configs[0].id).toBe(id);
		expect(configs[0].name).toBe('My Config');
		expect(configs[0].format).toBe('Standard');
		expect(configs[0].yamlContent).toBe(validYaml);
	});

	it('updateConfig modifies YAML content', () => {
		const id = saveConfig('Config', 'Standard', validYaml);
		const originalYaml = get(savedConfigs)[0].yamlContent;
		const updated = validYaml.replace('TestArch', 'UpdatedArch');
		updateConfig(id, updated);
		const configs = get(savedConfigs);
		expect(configs[0].yamlContent).toBe(updated);
		expect(configs[0].yamlContent).not.toBe(originalYaml);
		expect(configs[0].updatedAt).toBeTruthy();
	});

	it('renameConfig changes the name', () => {
		const id = saveConfig('OldName', 'Standard', validYaml);
		renameConfig(id, 'NewName');
		expect(get(savedConfigs)[0].name).toBe('NewName');
	});

	it('deleteConfig removes the config', () => {
		const id = saveConfig('ToDelete', 'Standard', validYaml);
		expect(get(savedConfigs)).toHaveLength(1);
		deleteConfig(id);
		expect(get(savedConfigs)).toHaveLength(0);
	});

	it('deleteConfig falls back to built-in when deleting active config', () => {
		const id = saveConfig('Active', 'Standard', validYaml);
		setActiveConfig(id);
		expect(get(activeConfigId)).toBe(id);
		deleteConfig(id);
		expect(get(activeConfigId)).toBe(BUILTIN_CONFIG_ID);
	});

	it('activeArchetypeYaml returns user config YAML when set', () => {
		const id = saveConfig('Custom', 'Standard', validYaml);
		setActiveConfig(id);
		expect(get(activeArchetypeYaml)).toBe(validYaml);
	});

	it('activeArchetypeDefs returns parsed definitions for user config', () => {
		const id = saveConfig('Custom', 'Standard', validYaml);
		setActiveConfig(id);
		const defs = get(activeArchetypeDefs);
		expect(defs).toHaveLength(1);
		expect(defs[0].name).toBe('TestArch');
	});

	it('activeArchetypeDefs returns empty array for invalid YAML', () => {
		const id = saveConfig('Bad', 'Standard', 'not: [valid yaml');
		setActiveConfig(id);
		const defs = get(activeArchetypeDefs);
		expect(defs).toEqual([]);
	});

	it('activeArchetypeYaml falls back to built-in for unknown config ID', () => {
		activeConfigId.set('nonexistent-id');
		expect(get(activeArchetypeYaml)).toBe(builtinArchetypeYaml);
	});

	it('persists configs to localStorage', () => {
		saveConfig('Persisted', 'Standard', validYaml);
		const stored = JSON.parse(store['mtg-archetype-configs']);
		expect(stored).toHaveLength(1);
		expect(stored[0].name).toBe('Persisted');
	});

	it('persists active config ID to localStorage', () => {
		const id = saveConfig('Test', 'Standard', validYaml);
		setActiveConfig(id);
		expect(store['mtg-active-config-id']).toBe(id);
	});
});
