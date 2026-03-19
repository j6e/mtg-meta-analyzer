export interface SignatureCard {
	name: string;
	minCopies?: number;
	exactCopies?: number;
	usedAsCommander?: boolean;
}

export interface AnyOfGroup {
	anyOf: SignatureCard[];
}

export type SignatureEntry = SignatureCard | AnyOfGroup;

export function isAnyOfGroup(entry: SignatureEntry): entry is AnyOfGroup {
	return "anyOf" in entry;
}

export interface ArchetypeDefinition {
	name: string;
	signatureCards: SignatureEntry[];
	strictMode?: boolean;
}

export interface ArchetypeYaml {
	format: string;
	date: string;
	nameEqualsCommander?: boolean;
	archetypes: ArchetypeDefinition[];
}

export interface ParsedArchetypeConfig {
	archetypes: ArchetypeDefinition[];
	nameEqualsCommander: boolean;
}
