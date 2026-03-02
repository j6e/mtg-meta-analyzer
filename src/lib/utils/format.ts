/** Color gradient: red (≤30%) → gray (48-52%) → green (≥70%). */
export function winrateColor(wr: number): string {
	const red: [number, number, number] = [220, 160, 160];
	const neutral: [number, number, number] = [245, 245, 245];
	const green: [number, number, number] = [160, 220, 165];

	let from: [number, number, number];
	let to: [number, number, number];
	let t: number;

	if (wr <= 0.30) {
		return `rgb(${red[0]}, ${red[1]}, ${red[2]})`;
	} else if (wr <= 0.48) {
		from = red; to = neutral;
		t = (wr - 0.30) / 0.18;
	} else if (wr <= 0.52) {
		return `rgb(${neutral[0]}, ${neutral[1]}, ${neutral[2]})`;
	} else if (wr <= 0.70) {
		from = neutral; to = green;
		t = (wr - 0.52) / 0.18;
	} else {
		return `rgb(${green[0]}, ${green[1]}, ${green[2]})`;
	}

	const r = Math.round(from[0] + (to[0] - from[0]) * t);
	const g = Math.round(from[1] + (to[1] - from[1]) * t);
	const b = Math.round(from[2] + (to[2] - from[2]) * t);
	return `rgb(${r}, ${g}, ${b})`;
}

/** Format a 0-1 fraction as a percentage string. */
export function pct(n: number | null, decimals = 1): string {
	if (n === null) return '—';
	return (n * 100).toFixed(decimals) + '%';
}
