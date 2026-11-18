/** Runs `run` over `items` with at most `limit` in flight, so a big panel is not hit all at once. */
export async function forEachLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const item = items[next++] as T;
			await run(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
