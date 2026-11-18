// Pelican client API.
// Pelican is a Pterodactyl fork and its client API still matches Pterodactyl
// 1.x for everything used here. This started as a copy of pterodactyl1.ts and
// is meant to drift with Pelican (no nests or locations in its application API).

import { collectPages, parseFractalErrors, type FractalItem, type FractalList } from './fractal.ts';
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

interface PelicanServer {
	server_owner: boolean;
	identifier: string;
	uuid: string;
	name: string;
	node: string;
	description: string | null;
	limits: { memory: number; disk: number; cpu: number };
	is_suspended: boolean;
	is_installing: boolean;
	is_transferring: boolean;
	status: string | null;
}

interface PelicanStats {
	current_state: string;
	is_suspended: boolean;
	resources: {
		memory_bytes: number;
		cpu_absolute: number;
		disk_bytes: number;
		network_rx_bytes: number;
		network_tx_bytes: number;
		uptime: number;
	};
}

interface PelicanAccount {
	id: number;
	admin: boolean;
	username: string;
	email: string;
}

const STATES: readonly ServerState[] = ['offline', 'starting', 'stopping', 'running'];

export class PelicanClient implements PanelClient {
	readonly kind = 'pelican';
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
		this.#http = new HttpClient(options, parseFractalErrors);
	}

	get url(): string {
		return this.#http.baseUrl;
	}

	async getAccount(): Promise<PanelAccount> {
		const { attributes } = await this.#http.request<FractalItem<PelicanAccount>>('/api/client/account');
		return { id: String(attributes.id), username: attributes.username, email: attributes.email, admin: attributes.admin };
	}

	async listServers(options: { search?: string } = {}): Promise<ServerSummary[]> {
		const servers = await collectPages((page) =>
			this.#http.request<FractalList<PelicanServer>>('/api/client', {
				query: { page, per_page: 100, 'filter[*]': options.search || undefined },
			}),
		);
		return servers.map(toSummary);
	}

	async getServer(id: string): Promise<ServerSummary> {
		const { attributes } = await this.#http.request<FractalItem<PelicanServer>>(`/api/client/servers/${encodeURIComponent(id)}`);
		return toSummary(attributes);
	}

	async getResources(id: string): Promise<ServerResources> {
		const { attributes } = await this.#http.request<FractalItem<PelicanStats>>(`/api/client/servers/${encodeURIComponent(id)}/resources`);
		const r = attributes.resources;
		return {
			state: STATES.includes(attributes.current_state as ServerState) ? (attributes.current_state as ServerState) : 'unknown',
			cpuPercent: r.cpu_absolute,
			memoryBytes: r.memory_bytes,
			diskBytes: r.disk_bytes,
			networkRxBytes: r.network_rx_bytes,
			networkTxBytes: r.network_tx_bytes,
			uptimeMs: r.uptime,
		};
	}

	async power(id: string, action: PowerAction): Promise<void> {
		await this.#http.request(`/api/client/servers/${encodeURIComponent(id)}/power`, { method: 'POST', body: { signal: action } });
	}

	async sendCommand(id: string, command: string): Promise<void> {
		await this.#http.request(`/api/client/servers/${encodeURIComponent(id)}/command`, { method: 'POST', body: { command } });
	}

	async getConsoleCredentials(id: string): Promise<ConsoleCredentials> {
		const { data } = await this.#http.request<{ data: { token: string; socket: string } }>(
			`/api/client/servers/${encodeURIComponent(id)}/websocket`,
		);
		return { socketUrl: data.socket, token: data.token };
	}
}

function toSummary(server: PelicanServer): ServerSummary {
	return {
		id: server.identifier,
		shortId: server.identifier,
		name: server.name,
		description: server.description || null,
		node: server.node,
		limits: { memoryMib: server.limits.memory, diskMib: server.limits.disk, cpuPercent: server.limits.cpu },
		suspended: server.is_suspended,
		status: server.status ?? (server.is_installing ? 'installing' : server.is_transferring ? 'transferring' : null),
		isOwner: server.server_owner,
	};
}
