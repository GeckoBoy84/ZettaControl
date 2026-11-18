import { CalagopusClient, parseCalagopusErrors } from './calagopus.ts';
import { CalagopusAdminClient } from './calagopus-admin.ts';
import { PanelError } from './errors.ts';
import { parseFractalErrors } from './fractal.ts';
import { HttpClient } from './http.ts';
import { PelicanClient } from './pelican.ts';
import { PelicanAdminClient } from './pelican-admin.ts';
import { Pterodactyl1Client } from './pterodactyl1.ts';
import { Pterodactyl1AdminClient } from './pterodactyl1-admin.ts';
import { Pterodactyl2Client } from './pterodactyl2.ts';
import { Pterodactyl2AdminClient } from './pterodactyl2-admin.ts';
import type { AdminClient, PanelAccount, PanelClient, PanelClientOptions, PanelKind, PanelTotals } from './types.ts';

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

export function createAdminClient(kind: PanelKind, options: PanelClientOptions): AdminClient {
	switch (kind) {
		case 'calagopus':
			return new CalagopusAdminClient(options);
		case 'pterodactyl1':
			return new Pterodactyl1AdminClient(options);
		case 'pterodactyl2':
			return new Pterodactyl2AdminClient(options);
		case 'pelican':
			return new PelicanAdminClient(options);
	}
}

const CLIENT_KEY_PREFIXES = ['ptlc_', 'pacc_'];

/**
 * Checks an admin key before it is stored. Calagopus has one kind of key, so any key
 * from an account with admin permissions works; elsewhere it must be an application key.
 */
export async function validateAdminKey(kind: PanelKind, options: PanelClientOptions): Promise<{ client: AdminClient; totals: PanelTotals }> {
	if (kind !== 'calagopus' && CLIENT_KEY_PREFIXES.some((prefix) => options.apiKey.startsWith(prefix))) {
		throw new PanelError('validation', 'That is a client key. Create an application key in the admin area instead.');
	}
	const client = createAdminClient(kind, options);
	return { client, totals: await client.getTotals() };
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
