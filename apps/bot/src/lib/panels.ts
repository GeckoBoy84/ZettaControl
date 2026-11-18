import { createPanelClient, type PanelClient, type ServerSummary } from '@zettako/panels';
import { brand } from '../brand.ts';
import type { PanelRow } from '../db/schema.ts';
import { decryptSecret } from './crypto.ts';

// Panel clients, a short lived server list cache, and server references.
// Who may use a panel is decided in access.ts.

const SERVER_CACHE_TTL_MS = 30_000;

const clients = new Map<string, { updatedAt: number; client: PanelClient }>();

export function clientFor(panel: PanelRow): PanelClient {
	const cached = clients.get(panel.id);
	if (cached && cached.updatedAt === panel.updatedAt.getTime()) return cached.client;

	const client = createPanelClient(panel.kind, {
		url: panel.url,
		apiKey: decryptSecret(panel.apiKeyEncrypted, panel.id),
		userAgent: `${brand.name} (+${brand.source})`,
	});
	clients.set(panel.id, { updatedAt: panel.updatedAt.getTime(), client });
	return client;
}

export function forgetClient(panelId: string): void {
	clients.delete(panelId);
	serverCache.delete(panelId);
}

const serverCache = new Map<string, { expires: number; servers: Promise<ServerSummary[]> }>();

/** Server lists are cached briefly so autocomplete does not hit the panel on every keystroke. */
export function listServersCached(panel: PanelRow): Promise<ServerSummary[]> {
	const cached = serverCache.get(panel.id);
	if (cached && cached.expires > Date.now()) return cached.servers;

	const servers = clientFor(panel).listServers();
	serverCache.set(panel.id, { expires: Date.now() + SERVER_CACHE_TTL_MS, servers });
	servers.catch(() => serverCache.delete(panel.id));
	return servers;
}

/** Server references in autocomplete values and custom IDs: `<panelId>:<serverId>`. */
export function serverRef(panelId: string, serverId: string): string {
	return `${panelId}:${serverId}`;
}

export function parseServerRef(ref: string): { panelId: string; serverId: string } | null {
	const separator = ref.indexOf(':');
	if (separator <= 0 || separator === ref.length - 1) return null;
	return { panelId: ref.slice(0, separator), serverId: ref.slice(separator + 1) };
}
