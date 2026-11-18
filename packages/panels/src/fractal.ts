// Wire format used by Pterodactyl and Pelican (league/fractal):
// { object, attributes } for single items and { object: 'list', data, meta } for lists.
// This format has been stable since Pterodactyl 0.7, so the Pterodactyl and
// Pelican adapters share these helpers while keeping their own endpoint code.

export interface FractalItem<T> {
	object: string;
	attributes: T;
}

export interface FractalList<T> {
	object: 'list';
	data: FractalItem<T>[];
	meta?: {
		pagination?: {
			total: number;
			count: number;
			per_page: number;
			current_page: number;
			total_pages: number;
		};
	};
}

/** Pterodactyl and Pelican error body: { errors: [{ code, status, detail }] } */
export function parseFractalErrors(body: unknown): string[] {
	if (typeof body !== 'object' || body === null || !('errors' in body) || !Array.isArray(body.errors)) return [];
	return body.errors
		.map((error: unknown) => (typeof error === 'object' && error !== null && 'detail' in error ? String(error.detail) : null))
		.filter((detail): detail is string => detail !== null);
}

/** Walks every page of a paginated list endpoint. */
export async function collectPages<T>(
	fetchPage: (page: number) => Promise<FractalList<T>>,
	maxPages = 20,
): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const list = await fetchPage(page);
		items.push(...list.data.map((item) => item.attributes));
		const totalPages = list.meta?.pagination?.total_pages ?? 1;
		if (page >= totalPages) break;
	}
	return items;
}
