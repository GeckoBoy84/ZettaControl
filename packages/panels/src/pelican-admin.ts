// Pelican application API (/api/application), with an application key (papp_).
// Started as a copy of pterodactyl1-admin.ts. Pelican splits the port Wings listens on
// from the port the panel connects to (daemon_connect), has no locations, and renamed
// the user 2fa field. The application API cannot see node usage, so the bot pings Wings.

import { collectPages, parseFractalErrors, type FractalItem, type FractalList } from './fractal.ts';
import { HttpClient } from './http.ts';
import { PanelError } from './errors.ts';
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

interface PelicanNode {
	id: number;
	name: string;
	description: string | null;
	fqdn: string;
	scheme: string;
	daemon_listen: number;
	/** The port the panel connects to. Older Pelican versions only have daemon_listen. */
	daemon_connect?: number;
	maintenance_mode: boolean;
	memory: number;
	disk: number;
	allocated_resources?: { memory: number; disk: number };
}

interface PelicanAdminServer {
	id: number;
	identifier: string;
	name: string;
	description: string | null;
	status: string | null;
	suspended: boolean;
	limits: { memory: number; disk: number; cpu: number };
	created_at: string | null;
	relationships?: {
		user?: FractalItem<{ username: string }>;
		node?: FractalItem<{ name: string }>;
	};
}

interface PelicanAdminUser {
	id: number;
	username: string;
	email: string;
	root_admin: boolean;
	'2fa_enabled'?: boolean;
	/** Deprecated by Pelican in favour of 2fa_enabled. */
	'2fa'?: boolean;
	created_at: string | null;
}

const DEFAULT_PAGE_SIZE = 25;

export class PelicanAdminClient implements AdminClient {
	readonly kind = 'pelican';
	readonly capabilities: AdminCapabilities = {
		nodeStats: false,
		suspendServers: true,
		reinstallServers: true,
		suspendUsers: false,
	};
	readonly #http: HttpClient;

	constructor(options: PanelClientOptions) {
		this.#http = new HttpClient(options, parseFractalErrors);
	}

	get url(): string {
		return this.#http.baseUrl;
	}

	/** One item per page is enough to read the total from the pagination meta. */
	async #total(path: string): Promise<number> {
		const list = await this.#http.request<FractalList<unknown>>(path, { query: { per_page: 1 } });
		return list.meta?.pagination?.total ?? list.data.length;
	}

	async getTotals(): Promise<PanelTotals> {
		const [users, servers, nodes] = await Promise.all([
			this.#total('/api/application/users'),
			this.#total('/api/application/servers'),
			this.#total('/api/application/nodes'),
		]);
		return { users, servers, nodes };
	}

	async listNodes(): Promise<AdminNode[]> {
		const nodes = await collectPages((page) => this.#http.request<FractalList<PelicanNode>>('/api/application/nodes', { query: { page, per_page: 100 } }));
		return nodes
			.map((node) => ({
				id: String(node.id),
				name: node.name,
				description: node.description || null,
				wingsUrl: `${node.scheme}://${node.fqdn}:${node.daemon_connect ?? node.daemon_listen}`,
				maintenance: node.maintenance_mode,
				memoryMib: node.memory,
				diskMib: node.disk,
				allocated: node.allocated_resources ? { memoryMib: node.allocated_resources.memory, diskMib: node.allocated_resources.disk } : null,
			}))
			.toSorted((a, b) => a.name.localeCompare(b.name));
	}

	async getNodeStats(_nodeId: string): Promise<NodeStats> {
		throw new PanelError('unsupported', 'The Pelican application API does not report node usage.');
	}

	async listServers(options: AdminListOptions = {}): Promise<AdminPage<AdminServer>> {
		const list = await this.#http.request<FractalList<PelicanAdminServer>>('/api/application/servers', {
			query: { per_page: options.perPage ?? DEFAULT_PAGE_SIZE, include: 'user,node', 'filter[name]': options.search || undefined },
		});
		return { items: list.data.map((item) => toServer(item.attributes)), total: list.meta?.pagination?.total ?? list.data.length };
	}

	async getServer(id: string): Promise<AdminServer> {
		const { attributes } = await this.#http.request<FractalItem<PelicanAdminServer>>(`/api/application/servers/${encodeURIComponent(id)}`, {
			query: { include: 'user,node' },
		});
		return toServer(attributes);
	}

	async setServerSuspended(id: string, suspended: boolean): Promise<void> {
		await this.#http.request(`/api/application/servers/${encodeURIComponent(id)}/${suspended ? 'suspend' : 'unsuspend'}`, { method: 'POST' });
	}

	async reinstallServer(id: string): Promise<void> {
		await this.#http.request(`/api/application/servers/${encodeURIComponent(id)}/reinstall`, { method: 'POST' });
	}

	async listUsers(options: AdminListOptions = {}): Promise<AdminPage<AdminUser>> {
		const list = await this.#http.request<FractalList<PelicanAdminUser>>('/api/application/users', {
			query: { per_page: options.perPage ?? DEFAULT_PAGE_SIZE, 'filter[username]': options.search || undefined },
		});
		return { items: list.data.map((item) => toUser(item.attributes)), total: list.meta?.pagination?.total ?? list.data.length };
	}

	async getUser(id: string): Promise<AdminUser> {
		const { attributes } = await this.#http.request<FractalItem<PelicanAdminUser>>(`/api/application/users/${encodeURIComponent(id)}`);
		return toUser(attributes);
	}

	async setUserSuspended(_id: string, _suspended: boolean): Promise<void> {
		throw new PanelError('unsupported', 'Pelican cannot suspend users.');
	}
}

function toServer(server: PelicanAdminServer): AdminServer {
	return {
		id: String(server.id),
		shortId: server.identifier,
		name: server.name,
		description: server.description || null,
		owner: server.relationships?.user?.attributes.username ?? null,
		node: server.relationships?.node?.attributes.name ?? null,
		suspended: server.suspended || server.status === 'suspended',
		status: server.status === 'suspended' ? null : server.status,
		limits: { memoryMib: server.limits.memory, diskMib: server.limits.disk, cpuPercent: server.limits.cpu },
		createdAt: server.created_at,
	};
}

function toUser(user: PelicanAdminUser): AdminUser {
	return {
		id: String(user.id),
		username: user.username,
		email: user.email,
		admin: user.root_admin,
		suspended: null,
		twoFactor: user['2fa_enabled'] ?? user['2fa'] ?? false,
		createdAt: user.created_at,
	};
}
