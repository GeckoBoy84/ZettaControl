// Calagopus client API. Reference: https://<panel>/api (OpenAPI at /openapi.json).
// Unlike Pterodactyl, responses are plain JSON wrapped in a named key
// ({ server }, { servers: { data } }) and errors are { errors: string[] }.

import { HttpClient } from './http.ts';
import type {
	ConsoleCredentials,
	PanelAccount,
	PanelCapabilities,
	PanelClient,
	PanelClientOptions,
	PowerAction,
	ServerResources,
	ServerState,
	ServerSummary,
} from './types.ts';

interface CalagopusServer {
	uuid: string;
	uuid_short: string;
	name: string;
	description: string | null;
	node_name: string;
	is_owner: boolean;
	is_suspended: boolean;
	is_transferring: boolean;
	status: string | null;
	limits: { cpu: number; memory: number; disk: number };
}

interface CalagopusPage<T> {
	total: number;
	per_page: number;
	page: number;
	data: T[];
}

interface CalagopusResources {
	state: string;
	cpu_absolute: number;
	memory_bytes: number;
	disk_bytes: number;
	network: { rx_bytes: number; tx_bytes: number };
	uptime: number;
}

interface CalagopusUser {
	uuid: string;
	username: string;
	email: string;
	admin: boolean;
}

const PER_PAGE = 100;
const MAX_PAGES = 20;
const STATES: readonly ServerState[] = ['offline', 'starting', 'stopping', 'running'];

export function parseCalagopusErrors(body: unknown): string[] {
	if (typeof body !== 'object' || body === null || !('errors' in body) || !Array.isArray(body.errors)) return [];
	return body.errors.map(String);
}

export class CalagopusClient implements PanelClient {
	readonly kind = 'calagopus';
	readonly capabilities: PanelCapabilities = {
		power: true,
		command: true,
		resources: true,
		console: true,
		backups: false,
		files: false,
		schedules: false,
		databases: false,
		subusers: false,
	};
	readonly #http: HttpClient;

	constructor(options: PanelClientOptions) {
		this.#http = new HttpClient(options, parseCalagopusErrors);
	}

	get url(): string {
		return this.#http.baseUrl;
	}

	async getAccount(): Promise<PanelAccount> {
		const { user } = await this.#http.request<{ user: CalagopusUser }>('/api/client/account');
		return { id: user.uuid, username: user.username, email: user.email, admin: user.admin };
	}

	async listServers(options: { search?: string } = {}): Promise<ServerSummary[]> {
		const servers: CalagopusServer[] = [];
		for (let page = 1; page <= MAX_PAGES; page++) {
			const { servers: result } = await this.#http.request<{ servers: CalagopusPage<CalagopusServer> }>('/api/client/servers', {
				query: { page, per_page: PER_PAGE, search: options.search || undefined, other: false },
			});
			servers.push(...result.data);
			if (page * result.per_page >= result.total || result.data.length === 0) break;
		}
		return servers.map(toSummary);
	}

	async getServer(id: string): Promise<ServerSummary> {
		const { server } = await this.#http.request<{ server: CalagopusServer }>(`/api/client/servers/${encodeURIComponent(id)}`);
		return toSummary(server);
	}

	async getResources(id: string): Promise<ServerResources> {
		const { resources } = await this.#http.request<{ resources: CalagopusResources }>(
			`/api/client/servers/${encodeURIComponent(id)}/resources`,
		);
		return {
			state: STATES.includes(resources.state as ServerState) ? (resources.state as ServerState) : 'unknown',
			cpuPercent: resources.cpu_absolute,
			memoryBytes: resources.memory_bytes,
			diskBytes: resources.disk_bytes,
			networkRxBytes: resources.network.rx_bytes,
			networkTxBytes: resources.network.tx_bytes,
			uptimeMs: resources.uptime,
		};
	}

	async power(id: string, action: PowerAction): Promise<void> {
		await this.#http.request(`/api/client/servers/${encodeURIComponent(id)}/power`, { method: 'POST', body: { action } });
	}

	async sendCommand(id: string, command: string): Promise<void> {
		await this.#http.request(`/api/client/servers/${encodeURIComponent(id)}/command`, { method: 'POST', body: { command } });
	}

	async getConsoleCredentials(id: string): Promise<ConsoleCredentials> {
		const { token, url } = await this.#http.request<{ token: string; url: string }>(
			`/api/client/servers/${encodeURIComponent(id)}/websocket`,
		);
		return { socketUrl: url, token };
	}
}

function toSummary(server: CalagopusServer): ServerSummary {
	return {
		id: server.uuid,
		shortId: server.uuid_short,
		name: server.name,
		description: server.description,
		node: server.node_name,
		limits: { memoryMib: server.limits.memory, diskMib: server.limits.disk, cpuPercent: server.limits.cpu },
		suspended: server.is_suspended,
		status: server.status ?? (server.is_transferring ? 'transferring' : null),
		isOwner: server.is_owner,
	};
}
