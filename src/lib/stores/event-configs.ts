/**
 * Event configuration store — manages built-in and user-saved event
 * YAML configs with localStorage persistence.
 * Follows the same pattern as archetype-configs.ts.
 */
import { derived, get, writable } from "svelte/store";

// --- Built-in config auto-discovery ---

export interface BuiltinEventConfig {
	id: string;
	filename: string;
	displayName: string;
	yamlContent: string;
}

const builtinModules = import.meta.glob<string>("/data/events/*.yaml", {
	eager: true,
	query: "?raw",
	import: "default",
});

function stemToDisplayName(stem: string): string {
	return stem.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const BUILTIN_EVENT_CONFIGS: BuiltinEventConfig[] = Object.entries(
	builtinModules,
)
	.map(([path, yamlContent]) => {
		const filename = path.split("/").pop()!;
		const stem = filename.replace(/\.yaml$/, "");
		return {
			id: `builtin:${stem}`,
			filename,
			displayName: stemToDisplayName(stem),
			yamlContent: yamlContent.replace(/\r\n/g, "\n"),
		};
	})
	.sort((a, b) => a.filename.localeCompare(b.filename));

// --- Constants ---

export const DEFAULT_EVENT_ID =
	BUILTIN_EVENT_CONFIGS.length > 0 ? BUILTIN_EVENT_CONFIGS[0].id : "";

const CONFIGS_KEY = "mtg-event-configs";
const ACTIVE_KEY = "mtg-active-event-id";

// --- Types ---

export interface SavedEventConfig {
	id: string;
	name: string;
	yamlContent: string;
	createdAt: string;
	updatedAt: string;
}

// --- localStorage helpers ---

function hasStorage(): boolean {
	return typeof globalThis.localStorage !== "undefined";
}

function loadConfigs(): SavedEventConfig[] {
	if (!hasStorage()) return [];
	try {
		const raw = localStorage.getItem(CONFIGS_KEY);
		return raw ? (JSON.parse(raw) as SavedEventConfig[]) : [];
	} catch {
		return [];
	}
}

function loadActiveId(): string {
	if (!hasStorage()) return DEFAULT_EVENT_ID;
	try {
		return localStorage.getItem(ACTIVE_KEY) ?? DEFAULT_EVENT_ID;
	} catch {
		return DEFAULT_EVENT_ID;
	}
}

function persistConfigs(configs: SavedEventConfig[]): void {
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

/** All user-saved event configs. */
export const savedEventConfigs = writable<SavedEventConfig[]>(loadConfigs());

/** ID of the currently active event config. */
export const activeEventId = writable<string>(loadActiveId());

// Persist on change
savedEventConfigs.subscribe(persistConfigs);
activeEventId.subscribe(persistActiveId);

/** The raw YAML content of the active event config. */
export const activeEventYaml = derived(
	[activeEventId, savedEventConfigs],
	([$id, $configs]): string => {
		const builtin = BUILTIN_EVENT_CONFIGS.find((c) => c.id === $id);
		if (builtin) return builtin.yamlContent;
		const config = $configs.find((c) => c.id === $id);
		return config?.yamlContent ?? BUILTIN_EVENT_CONFIGS[0]?.yamlContent ?? "";
	},
);

// --- Actions ---

/** Create a new saved event config. Returns its ID. */
export function saveEventConfig(name: string, yamlContent: string): string {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const config: SavedEventConfig = {
		id,
		name,
		yamlContent,
		createdAt: now,
		updatedAt: now,
	};
	savedEventConfigs.update((configs) => [...configs, config]);
	return id;
}

/** Update an existing event config's YAML content. */
export function updateEventConfig(id: string, yamlContent: string): void {
	savedEventConfigs.update((configs) =>
		configs.map((c) =>
			c.id === id ? { ...c, yamlContent, updatedAt: new Date().toISOString() } : c,
		),
	);
}

/** Delete an event config. If it was the active one, fall back to default. */
export function deleteEventConfig(id: string): void {
	savedEventConfigs.update((configs) => configs.filter((c) => c.id !== id));
	if (get(activeEventId) === id) {
		activeEventId.set(DEFAULT_EVENT_ID);
	}
}

/** Set which event config is active. */
export function setActiveEvent(id: string): void {
	activeEventId.set(id);
}
