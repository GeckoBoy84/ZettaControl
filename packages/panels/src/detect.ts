import { CalagopusClient, parseCalagopusErrors } from './calagopus.ts';
import { PanelError } from './errors.ts';
import { parseFractalErrors } from './fractal.ts';
import { HttpClient } from './http.ts';
import { PelicanClient } from './pelican.ts';
import { Pterodactyl1Client } from './pterodactyl1.ts';
import { Pterodactyl2Client } from './pterodactyl2.ts';
import type { PanelAccount, PanelClient, PanelClientOptions, PanelKind } from './types.ts';

export function createPanelClient(kind: PanelKind, options: PanelClientOptions): PanelClient {
	switch (kind) {
		case 'calagopus':
			return new CalagopusClient(options);
		case 'pterodactyl1':
			return new Pterodactyl1Client(options);
		case 'pterodactyl2':
			return new Pterodactyl2Client(options);
		case 'pelican':
			return new PelicanClient(options);
	}
}

export interface DetectedPanel {
	kind: PanelKind;
	client: PanelClient;
	account: PanelAccount;
}

// Application (admin) keys cannot use the client API. Catch them early with a clear message.
const APPLICATION_KEY_PREFIXES = ['ptla_', 'papp_'];
const PELICAN_CLIENT_KEY_PREFIX = 'pacc_';

/**
 * Works out which panel a URL and key belong to, and proves the key works.
 * Pass `kind` to skip detection and only validate.
 */
export async function detectPanel(options: PanelClientOptions, kind?: PanelKind): Promise<DetectedPanel> {
	if (APPLICATION_KEY_PREFIXES.some((prefix) => options.apiKey.startsWith(prefix))) {
		throw new PanelError('validation', 'That is an application (admin) key. Create a client API key under Account > API Keys instead.');
	}

	const detectedKind = kind ?? (await guessKind(options));
	const client = createPanelClient(detectedKind, options);
	const account = await client.getAccount();
	return { kind: detectedKind, client, account };
}

async function guessKind(options: PanelClientOptions): Promise<PanelKind> {
	const http = new HttpClient(options, (body) => [...parseCalagopusErrors(body), ...parseFractalErrors(body)]);
	const body = await http.request<Record<string, unknown>>('/api/client/account');

	// Calagopus: { user: {...} }. Pterodactyl and Pelican: { object: 'user', attributes: {...} }.
	if ('user' in body) return 'calagopus';
	if (body.object !== 'user') {
		throw new PanelError('unsupported', 'This does not look like a Calagopus, Pterodactyl or Pelican panel.');
	}

	if (options.apiKey.startsWith(PELICAN_CLIENT_KEY_PREFIX)) return 'pelican';

	// Pterodactyl 2.x added /api/admin. On 1.x that path is an unknown API route and 404s.
	// Best effort: anything other than a 404 (usually 401 or 403 for a client key) means 2.x.
	try {
		await http.request('/api/admin');
		return 'pterodactyl2';
	} catch (error) {
		if (error instanceof PanelError && error.code === 'not_found') return 'pterodactyl1';
		if (error instanceof PanelError && (error.code === 'unreachable' || error.code === 'timeout')) throw error;
		return 'pterodactyl2';
	}
}
