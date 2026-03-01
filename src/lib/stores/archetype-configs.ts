/**
 * Archetype configuration store — manages built-in and user-saved archetype
 * YAML configs with localStorage persistence.
 */
import { writable, derived, get } from 'svelte/store';
import { parseArchetypeYaml } from '../algorithms/archetype-classifier';
import type { ArchetypeDefinition } from '../types/archetype';
// --- Built-in config auto-discovery ---

export interface BuiltinArchetypeConfig {
	id: string;
	filename: string;
	displayName: string;
	yamlContent: string;
}

const builtinModules = import.meta.glob<string>('/data/archetypes/*.yaml', {
	eager: true,
	query: '?raw',
	import: 'default',
});

function stemToDisplayName(stem: string): string {
	return stem.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const BUILTIN_CONFIGS: BuiltinArchetypeConfig[] = Object.entries(builtinModules)
	.map(([path, yamlContent]) => {
		const filename = path.split('/').pop()!;
		const stem = filename.replace(/\.yaml$/, '');
		return {
			id: `builtin:${stem}`,
			filename,
			displayName: stemToDisplayName(stem),
			yamlContent: yamlContent.replace(/\r\n/g, '\n'),
		};
	})
	.sort((a, b) => {
		if (a.filename === 'standard.yaml') return -1;
		if (b.filename === 'standard.yaml') return 1;
		return a.filename.localeCompare(b.filename);
	});

// --- Constants ---

export const DEFAULT_BUILTIN_ID = 'builtin:standard';
/** @deprecated Use DEFAULT_BUILTIN_ID and BUILTIN_CONFIGS instead. */
export const BUILTIN_CONFIG_ID = DEFAULT_BUILTIN_ID;
/** @deprecated Use BUILTIN_CONFIGS instead. */
export const builtinArchetypeYaml: string =
	BUILTIN_CONFIGS.find((c) => c.id === DEFAULT_BUILTIN_ID)?.yamlContent ?? '';

const CONFIGS_KEY = 'mtg-archetype-configs';
const ACTIVE_KEY = 'mtg-active-config-id';

// --- Types ---

export interface SavedArchetypeConfig {
	id: string;
	name: string;
	format: string;
	yamlContent: string;
	createdAt: string;
	updatedAt: string;
}

// --- localStorage helpers ---

function hasStorage(): boolean {
	return typeof globalThis.localStorage !== 'undefined';
}

function loadConfigs(): SavedArchetypeConfig[] {
	if (!hasStorage()) return [];
	try {
		const raw = localStorage.getItem(CONFIGS_KEY);
		return raw ? (JSON.parse(raw) as SavedArchetypeConfig[]) : [];
	} catch {
		return [];
	}
}

function loadActiveId(): string {
	if (!hasStorage()) return BUILTIN_CONFIG_ID;
	try {
		return localStorage.getItem(ACTIVE_KEY) ?? BUILTIN_CONFIG_ID;
	} catch {
		return BUILTIN_CONFIG_ID;
	}
}

function persistConfigs(configs: SavedArchetypeConfig[]): void {
	if (!hasStorage()) return;
	try {
		localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
	} catch {
		// quota exceeded or unavailable — silently ignore
	}
}

function persistActiveId(id: string): void {
	if (!hasStorage()) return;
	try {
		localStorage.setItem(ACTIVE_KEY, id);
	} catch {
		// silently ignore
	}
}

// --- Stores ---

/** All user-saved archetype configs. */
export const savedConfigs = writable<SavedArchetypeConfig[]>(loadConfigs());

/** ID of the currently active config (built-in or user-saved). */
export const activeConfigId = writable<string>(loadActiveId());

// Persist on change
savedConfigs.subscribe(persistConfigs);
activeConfigId.subscribe(persistActiveId);

/** The raw YAML content of the active config. */
export const activeArchetypeYaml = derived(
	[activeConfigId, savedConfigs],
	([$id, $configs]): string => {
		const builtin = BUILTIN_CONFIGS.find((c) => c.id === $id);
		if (builtin) return builtin.yamlContent;
		const config = $configs.find((c) => c.id === $id);
		return config?.yamlContent ?? builtinArchetypeYaml;
	},
);

/** Parsed archetype definitions from the active config. Returns [] on parse failure. */
export const activeArchetypeDefs = derived(
	activeArchetypeYaml,
	($yaml): ArchetypeDefinition[] => {
		try {
			return parseArchetypeYaml($yaml);
		} catch {
			return [];
		}
	},
);

// --- Actions ---

/** Create a new saved config. Returns its ID. */
export function saveConfig(name: string, format: string, yamlContent: string): string {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const config: SavedArchetypeConfig = {
		id,
		name,
		format,
		yamlContent,
		createdAt: now,
		updatedAt: now,
	};
	savedConfigs.update((configs) => [...configs, config]);
	return id;
}

/** Update an existing config's YAML content. */
export function updateConfig(id: string, yamlContent: string): void {
	savedConfigs.update((configs) =>
		configs.map((c) =>
			c.id === id ? { ...c, yamlContent, updatedAt: new Date().toISOString() } : c,
		),
	);
}

/** Rename an existing config. */
export function renameConfig(id: string, name: string): void {
	savedConfigs.update((configs) =>
		configs.map((c) =>
			c.id === id ? { ...c, name, updatedAt: new Date().toISOString() } : c,
		),
	);
}

/** Delete a config. If it was the active one, fall back to built-in. */
export function deleteConfig(id: string): void {
	savedConfigs.update((configs) => configs.filter((c) => c.id !== id));
	if (get(activeConfigId) === id) {
		activeConfigId.set(BUILTIN_CONFIG_ID);
	}
}

/** Set which config is active for classification. */
export function setActiveConfig(id: string): void {
	activeConfigId.set(id);
}
