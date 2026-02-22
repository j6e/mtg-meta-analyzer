export interface SignatureCard {
	name: string;
	minCopies: number;
}

export interface ArchetypeDefinition {
	name: string;
	signatureCards: SignatureCard[];
}

export interface ArchetypeYaml {
	format: string;
	date: string;
	archetypes: ArchetypeDefinition[];
}
