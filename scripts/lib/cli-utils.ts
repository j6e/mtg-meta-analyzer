/** Parse a --flag value argument from argv. */
export function parseArgValue(args: string[], flag: string): string | null {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}
