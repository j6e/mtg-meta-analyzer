export interface SignatureCard {
	name: string;
	minCopies?: number;
	exactCopies?: number;
}

export interface ArchetypeDefinition {
	name: string;
	signatureCards: SignatureCard[];
	strictMode?: boolean;
}

export interface ArchetypeYaml {
	format: string;
	date: string;
	archetypes: ArchetypeDefinition[];
}
