// Pure helpers that turn raw console output into Discord messages. No Discord imports,
// so they are easy to test.

// CSI sequences (colours, cursor moves) and OSC sequences (window titles).
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
// Carriage returns and "cursor to column 1" redraw the line, as progress spinners do.
const LINE_RESET = /\r|\u001b\[1?G/;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Strips colours and keeps only what a terminal would show after redraws. null if nothing is left. */
export function cleanConsoleLine(raw: string): string | null {
	const parts = raw.split(LINE_RESET);
	const visible = (parts.at(-1) ?? '').replace(ANSI, '').replace(CONTROL, '').trimEnd();
	if (visible.length > 0) return visible;
	// An empty line on purpose stays, a line emptied by a redraw does not.
	return parts.length === 1 && raw.replace(ANSI, '').trim().length === 0 ? '' : null;
}

/**
 * Packs lines into code block bodies of at most `max` characters, keeping only the newest
 * `maxChunks`. Returns how many older lines were dropped so the reader knows.
 */
export function chunkLines(lines: string[], max: number, maxChunks: number): { chunks: string[]; skipped: number } {
	const chunks: string[][] = [[]];
	let size = 0;
	for (const original of lines) {
		// Code blocks cannot contain a closing fence, so break it up.
		const line = (original.length > max ? `${original.slice(0, max - 1)}…` : original).replaceAll('```', '`​``');
		const current = chunks.at(-1)!;
		if (size + line.length + 1 > max && current.length > 0) {
			chunks.push([line]);
			size = line.length + 1;
		} else {
			current.push(line);
			size += line.length + 1;
		}
	}
	const kept = chunks.filter((chunk) => chunk.length > 0).slice(-maxChunks);
	const keptLines = kept.reduce((count, chunk) => count + chunk.length, 0);
	return { chunks: kept.map((chunk) => chunk.join('\n')), skipped: lines.length - keptLines };
}
