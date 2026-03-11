export interface SignatureCard {
	name: string;
	minCopies?: number;
	exactCopies?: number;
	usedAsCommander?: boolean;
}

export interface ArchetypeDefinition {
	name: string;
	signatureCards: SignatureCard[];
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
