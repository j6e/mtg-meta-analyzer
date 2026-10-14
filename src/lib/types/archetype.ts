export interface SignatureCard {
	name: string;
	minCopies?: number;
	exactCopies?: number;
	usedAsCommander?: boolean;
	usedInSideboard?: boolean;
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
	format: string;
	archetypes: ArchetypeDefinition[];
	nameEqualsCommander: boolean;
}
