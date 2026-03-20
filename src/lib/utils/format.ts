/** Color gradient: red (≤30%) → gray (48-52%) → green (≥70%).
 * @param ciWidth - Width of the 95% CI (0–1). Wider CI fades the color toward neutral gray. */
export function winrateColor(wr: number, ciWidth = 0): string {
	const red: [number, number, number] = [220, 160, 160];
	const neutral: [number, number, number] = [245, 245, 245];
	const green: [number, number, number] = [160, 220, 165];

	let from: [number, number, number];
	let to: [number, number, number];
	let t: number;
	let r: number, g: number, b: number;

	if (wr <= 0.3) {
		[r, g, b] = red;
	} else if (wr <= 0.48) {
		from = red;
		to = neutral;
		t = (wr - 0.3) / 0.18;
		r = Math.round(from[0] + (to[0] - from[0]) * t);
		g = Math.round(from[1] + (to[1] - from[1]) * t);
		b = Math.round(from[2] + (to[2] - from[2]) * t);
	} else if (wr <= 0.52) {
		[r, g, b] = neutral;
	} else if (wr <= 0.7) {
		from = neutral;
		to = green;
		t = (wr - 0.52) / 0.18;
		r = Math.round(from[0] + (to[0] - from[0]) * t);
		g = Math.round(from[1] + (to[1] - from[1]) * t);
		b = Math.round(from[2] + (to[2] - from[2]) * t);
	} else {
		[r, g, b] = green;
	}

	if (ciWidth > 0) {
		const fade = Math.min(ciWidth, 0.6);
		r = Math.round(r * (1 - fade) + neutral[0] * fade);
		g = Math.round(g * (1 - fade) + neutral[1] * fade);
		b = Math.round(b * (1 - fade) + neutral[2] * fade);
	}

	return `rgb(${r}, ${g}, ${b})`;
}

/** Format a 0-1 fraction as a percentage string. */
export function pct(n: number | null, decimals = 1): string {
	if (n === null) return "—";
	return `${(n * 100).toFixed(decimals)}%`;
}
