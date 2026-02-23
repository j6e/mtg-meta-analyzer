/**
 * Demo: run winrate calculator against real tournament data.
 * Usage: bun run scripts/demo-winrate.ts
 */
import { readFileSync } from 'fs';
import type { TournamentData } from '../src/lib/types/tournament';
import { parseArchetypeYaml, classifyAll } from '../src/lib/algorithms/archetype-classifier';
import { buildPlayerArchetypeMap, buildMatchupMatrix, computeMetagameStats } from '../src/lib/utils/winrate-calculator';

const data: TournamentData = JSON.parse(readFileSync('data/tournaments/392401.json', 'utf-8'));
const yaml = readFileSync('data/archetypes/standard.yaml', 'utf-8');
const archetypeDefs = parseArchetypeYaml(yaml);

console.log(`Tournament: ${data.meta.name}`);
console.log(`Players: ${Object.keys(data.players).length}`);
console.log(`Decklists: ${Object.keys(data.decklists).length}`);
console.log(`Rounds: ${Object.keys(data.rounds).length}`);
console.log();

// Step 1: Classify decklists
const classResults = classifyAll(data.decklists, archetypeDefs, { k: 5, minConfidence: 0.3 });

// Step 2: Build player → archetype map
const playerArchetypes = buildPlayerArchetypeMap(data, classResults);

// Step 3: Metagame stats
console.log('=== Metagame Breakdown ===');
const stats = computeMetagameStats([data], playerArchetypes);
console.log(`${'Archetype'.padEnd(25)} ${'Players'.padStart(8)} ${'Share'.padStart(7)} ${'Matches'.padStart(8)} ${'Winrate'.padStart(8)}`);
console.log('-'.repeat(58));
for (const s of stats) {
	console.log(
		`${s.name.padEnd(25)} ${String(s.playerCount).padStart(8)} ${(s.metagameShare * 100).toFixed(1).padStart(6)}% ${String(s.totalMatches).padStart(8)} ${s.totalMatches > 0 ? (s.overallWinrate * 100).toFixed(1).padStart(7) + '%' : '     N/A'}`,
	);
}

// Step 4: Matchup matrix
console.log('\n=== Matchup Matrix (top 5 archetypes, excl. mirrors) ===');
const { matrix } = buildMatchupMatrix([data], playerArchetypes, {
	excludeMirrors: true,
	topN: 5,
});

// Header row
const colWidth = 14;
const headerRow = ''.padEnd(20) + matrix.archetypes.map((a) => a.slice(0, colWidth).padStart(colWidth)).join('');
console.log(headerRow);
console.log('-'.repeat(20 + colWidth * matrix.archetypes.length));

for (let i = 0; i < matrix.archetypes.length; i++) {
	const row = matrix.archetypes[i].padEnd(20);
	const cells = matrix.archetypes.map((_, j) => {
		const cell = matrix.cells[i][j];
		if (cell.total === 0) return '—'.padStart(colWidth);
		const wr = (cell.winrate! * 100).toFixed(1) + '%';
		return `${wr} (${cell.total})`.padStart(colWidth);
	});
	console.log(row + cells.join(''));
}

// Step 5: Notable matchups
console.log('\n=== Notable Matchups (min 10 matches) ===');
const notable: { a: string; b: string; wr: number; total: number }[] = [];
for (let i = 0; i < matrix.archetypes.length; i++) {
	for (let j = i + 1; j < matrix.archetypes.length; j++) {
		const cell = matrix.cells[i][j];
		if (cell.total >= 10) {
			notable.push({
				a: matrix.archetypes[i],
				b: matrix.archetypes[j],
				wr: cell.winrate!,
				total: cell.total,
			});
		}
	}
}
notable.sort((a, b) => Math.abs(b.wr - 0.5) - Math.abs(a.wr - 0.5));
for (const n of notable.slice(0, 10)) {
	const bar = n.wr > 0.5 ? '▓'.repeat(Math.round(n.wr * 20)) + '░'.repeat(20 - Math.round(n.wr * 20)) : '░'.repeat(Math.round(n.wr * 20)) + '▓'.repeat(20 - Math.round(n.wr * 20));
	console.log(`  ${n.a} vs ${n.b}: ${(n.wr * 100).toFixed(1)}% [${bar}] (${n.total} matches)`);
}
