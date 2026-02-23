/**
 * Build-time data loading via Vite's import.meta.glob.
 * Tournament JSON files are eagerly imported at build time — no runtime fetches needed.
 */
import type { TournamentData } from '../types/tournament';

const tournamentModules = import.meta.glob<TournamentData>('/data/tournaments/*.json', {
	eager: true,
	import: 'default',
});

/** All loaded tournaments, keyed by tournament ID. */
export function loadTournaments(): Map<number, TournamentData> {
	const map = new Map<number, TournamentData>();
	for (const [path, data] of Object.entries(tournamentModules)) {
		const match = path.match(/(\d+)\.json$/);
		if (match) {
			map.set(parseInt(match[1], 10), data);
		}
	}
	return map;
}
