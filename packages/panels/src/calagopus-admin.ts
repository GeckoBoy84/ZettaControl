// Calagopus admin API (/api/admin). Calagopus has no separate application keys: an
// account API key with admin permissions reaches these endpoints. Unlike the other
// panels it reads node usage from Wings for us (system/overview and system/stats).

import { parseCalagopusErrors } from './calagopus.ts';
import { PanelError } from './errors.ts';
import { HttpClient } from './http.ts';
import type {
	AdminCapabilities,
	AdminClient,
	AdminListOptions,
	AdminNode,
	AdminPage,
	AdminServer,
	AdminUser,
	NodeStats,
	PanelClientOptions,
	PanelTotals,
} from './types.ts';

interface CalagopusPage<T> {
	total: number;
	per_page: number;
	page: number;
	data: T[];
}

interface CalagopusNode {
	uuid: string;
	name: string;
	description: string | null;
	maintenance_enabled: boolean;
	url: string;
	memory: number;
	disk: number;
}

interface CalagopusOverview {
	version: string;
	servers: { total: number; online: number; offline: number };
}

interface CalagopusStats {
	cpu: { used: number; threads: number };
	memory: { used: number; total: number };
	disk: { used: number; total: number };
}

interface CalagopusAdminServer {
	uuid: string;
	uuid_short: string;
	name: string;
	description: string | null;
	node: { name: string };
	owner: { username: string };
	is_suspended: boolean;
	is_transferring: boolean;
	status?: unknown;
	limits: { cpu: number; memory: number; disk: number };
	created: string;
}

interface CalagopusAdminUser {
	uuid: string;
	username: string;
	email: string;
	admin: boolean;
	suspended: boolean;
	totp_enabled: boolean;
	created: string;
}

type Query = Record<string, string | number | boolean | undefined>;

const PER_PAGE = 100;
const MAX_PAGES = 20;
const DEFAULT_PAGE_SIZE = 25;

export class CalagopusAdminClient implements AdminClient {
	readonly kind = 'calagopus';
	readonly capabilities: AdminCapabilities = {
		nodeStats: true,
		suspendServers: true,
		reinstallServers: false,
		suspendUsers: true,
	};
	readonly #http: HttpClient;

	constructor(options: PanelClientOptions) {
		this.#http = new HttpClient(options, parseCalagopusErrors);
	}

	get url(): string {
		return this.#http.baseUrl;
	}

	async #page<T>(path: string, key: string, query: Query): Promise<CalagopusPage<T>> {
		const body = await this.#http.request<Record<string, CalagopusPage<T> | undefined>>(path, { query });
		return body[key] ?? { total: 0, per_page: 0, page: 1, data: [] };
	}

	async getTotals(): Promise<PanelTotals> {
		const { stats } = await this.#http.request<{ stats: PanelTotals }>('/api/admin/stats/general');
		return { users: stats.users, servers: stats.servers, nodes: stats.nodes };
	}

	async listNodes(): Promise<AdminNode[]> {
		const nodes: CalagopusNode[] = [];
		for (let page = 1; page <= MAX_PAGES; page++) {
			const result = await this.#page<CalagopusNode>('/api/admin/nodes', 'nodes', { page, per_page: PER_PAGE });
			nodes.push(...result.data);
			if (page * result.per_page >= result.total || result.data.length === 0) break;
		}
		return nodes
			.map((node) => ({
				id: node.uuid,
				name: node.name,
				description: node.description || null,
				wingsUrl: node.url,
				maintenance: node.maintenance_enabled,
				memoryMib: node.memory,
				diskMib: node.disk,
				allocated: null,
			}))
			.toSorted((a, b) => a.name.localeCompare(b.name));
	}

	async getNodeStats(nodeId: string): Promise<NodeStats> {
		const node = `/api/admin/nodes/${encodeURIComponent(nodeId)}/system`;
		const [overview, { stats }] = await Promise.all([
			this.#http.request<CalagopusOverview>(`${node}/overview`),
			this.#http.request<{ stats: CalagopusStats }>(`${node}/stats`),
		]);
		return {
			version: overview.version,
			cpuPercent: stats.cpu.used,
			cpuThreads: stats.cpu.threads,
			memoryUsedBytes: stats.memory.used,
			memoryTotalBytes: stats.memory.total,
			diskUsedBytes: stats.disk.used,
			diskTotalBytes: stats.disk.total,
			servers: { total: overview.servers.total, online: overview.servers.online },
		};
	}

	async listServers(options: AdminListOptions = {}): Promise<AdminPage<AdminServer>> {
		const result = await this.#page<CalagopusAdminServer>('/api/admin/servers', 'servers', {
			page: 1,
			per_page: options.perPage ?? DEFAULT_PAGE_SIZE,
			search: options.search || undefined,
		});
		return { items: result.data.map(toServer), total: result.total };
	}

	async getServer(id: string): Promise<AdminServer> {
		const { server } = await this.#http.request<{ server: CalagopusAdminServer }>(`/api/admin/servers/${encodeURIComponent(id)}`);
		return toServer(server);
	}

	async setServerSuspended(id: string, suspended: boolean): Promise<void> {
		await this.#http.request(`/api/admin/servers/${encodeURIComponent(id)}`, { method: 'PATCH', body: { suspended } });
	}

	async reinstallServer(_id: string): Promise<void> {
		throw new PanelError('unsupported', 'The Calagopus admin API cannot reinstall servers.');
	}

	async listUsers(options: AdminListOptions = {}): Promise<AdminPage<AdminUser>> {
		const result = await this.#page<CalagopusAdminUser>('/api/admin/users', 'users', {
			page: 1,
			per_page: options.perPage ?? DEFAULT_PAGE_SIZE,
			search: options.search || undefined,
		});
		return { items: result.data.map(toUser), total: result.total };
	}

	async getUser(id: string): Promise<AdminUser> {
		const { user } = await this.#http.request<{ user: CalagopusAdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`);
		return toUser(user);
	}

	async setUserSuspended(id: string, suspended: boolean): Promise<void> {
		await this.#http.request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { suspended } });
	}
}

function toServer(server: CalagopusAdminServer): AdminServer {
	return {
		id: server.uuid,
		shortId: server.uuid_short,
		name: server.name,
		description: server.description || null,
		owner: server.owner.username,
		node: server.node.name,
		suspended: server.is_suspended,
		status: typeof server.status === 'string' ? server.status : server.is_transferring ? 'transferring' : null,
		limits: { memoryMib: server.limits.memory, diskMib: server.limits.disk, cpuPercent: server.limits.cpu },
		createdAt: server.created,
	};
}

function toUser(user: CalagopusAdminUser): AdminUser {
	return {
		id: user.uuid,
		username: user.username,
		email: user.email,
		admin: user.admin,
		suspended: user.suspended,
		twoFactor: user.totp_enabled,
		createdAt: user.created,
	};
}
