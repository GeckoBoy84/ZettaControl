// Pterodactyl 2.x client API.
// Started as a copy of pterodactyl1.ts. 2.x keeps the 1.x client API and key
// format, but list endpoints reject per_page above 100, nests are replaced by
// tags (application API only), and there is a new /api/admin. Change this file
// freely as 2.x moves; pterodactyl1.ts stays frozen.

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

interface PteroServer {
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

interface PteroStats {
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

interface PteroAccount {
	id: number;
	admin: boolean;
	username: string;
	email: string;
}

const STATES: readonly ServerState[] = ['offline', 'starting', 'stopping', 'running'];

export class Pterodactyl2Client implements PanelClient {
	readonly kind = 'pterodactyl2';
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
		const { attributes } = await this.#http.request<FractalItem<PteroAccount>>('/api/client/account');
		return { id: String(attributes.id), username: attributes.username, email: attributes.email, admin: attributes.admin };
	}

	async listServers(options: { search?: string } = {}): Promise<ServerSummary[]> {
		const servers = await collectPages((page) =>
			this.#http.request<FractalList<PteroServer>>('/api/client', {
				query: { page, per_page: 100, 'filter[*]': options.search || undefined },
			}),
		);
		return servers.map(toSummary);
	}

	async getServer(id: string): Promise<ServerSummary> {
		const { attributes } = await this.#http.request<FractalItem<PteroServer>>(`/api/client/servers/${encodeURIComponent(id)}`);
		return toSummary(attributes);
	}

	async getResources(id: string): Promise<ServerResources> {
		const { attributes } = await this.#http.request<FractalItem<PteroStats>>(`/api/client/servers/${encodeURIComponent(id)}/resources`);
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

function toSummary(server: PteroServer): ServerSummary {
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
