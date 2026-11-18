// Pterodactyl 2.x application API (/api/application), with an application key.
// Started as a copy of pterodactyl1-admin.ts. 2.x renders with Laravel resources but
// keeps the { object, attributes } shape, caps per_page at 100 and replaces nests with
// tags. Its /api/admin is for extensions and themes, not this. Change freely as 2.x moves.
// The application API cannot see node usage, so the bot pings Wings itself.

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

interface PteroNode {
	id: number;
	name: string;
	description: string | null;
	fqdn: string;
	scheme: string;
	daemon_listen: number;
	maintenance_mode: boolean;
	memory: number;
	disk: number;
	allocated_resources?: { memory: number; disk: number };
}

interface PteroAdminServer {
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

interface PteroAdminUser {
	id: number;
	username: string;
	email: string;
	root_admin: boolean;
	'2fa': boolean;
	created_at: string | null;
}

const DEFAULT_PAGE_SIZE = 25;

export class Pterodactyl2AdminClient implements AdminClient {
	readonly kind = 'pterodactyl2';
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
		const nodes = await collectPages((page) => this.#http.request<FractalList<PteroNode>>('/api/application/nodes', { query: { page, per_page: 100 } }));
		return nodes
			.map((node) => ({
				id: String(node.id),
				name: node.name,
				description: node.description || null,
				wingsUrl: `${node.scheme}://${node.fqdn}:${node.daemon_listen}`,
				maintenance: node.maintenance_mode,
				memoryMib: node.memory,
				diskMib: node.disk,
				allocated: node.allocated_resources ? { memoryMib: node.allocated_resources.memory, diskMib: node.allocated_resources.disk } : null,
			}))
			.toSorted((a, b) => a.name.localeCompare(b.name));
	}

	async getNodeStats(_nodeId: string): Promise<NodeStats> {
		throw new PanelError('unsupported', 'The Pterodactyl application API does not report node usage.');
	}

	async listServers(options: AdminListOptions = {}): Promise<AdminPage<AdminServer>> {
		const list = await this.#http.request<FractalList<PteroAdminServer>>('/api/application/servers', {
			query: { per_page: options.perPage ?? DEFAULT_PAGE_SIZE, include: 'user,node', 'filter[name]': options.search || undefined },
		});
		return { items: list.data.map((item) => toServer(item.attributes)), total: list.meta?.pagination?.total ?? list.data.length };
	}

	async getServer(id: string): Promise<AdminServer> {
		const { attributes } = await this.#http.request<FractalItem<PteroAdminServer>>(`/api/application/servers/${encodeURIComponent(id)}`, {
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
		const list = await this.#http.request<FractalList<PteroAdminUser>>('/api/application/users', {
			query: { per_page: options.perPage ?? DEFAULT_PAGE_SIZE, 'filter[username]': options.search || undefined },
		});
		return { items: list.data.map((item) => toUser(item.attributes)), total: list.meta?.pagination?.total ?? list.data.length };
	}

	async getUser(id: string): Promise<AdminUser> {
		const { attributes } = await this.#http.request<FractalItem<PteroAdminUser>>(`/api/application/users/${encodeURIComponent(id)}`);
		return toUser(attributes);
	}

	async setUserSuspended(_id: string, _suspended: boolean): Promise<void> {
		throw new PanelError('unsupported', 'Pterodactyl cannot suspend users.');
	}
}

function toServer(server: PteroAdminServer): AdminServer {
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

function toUser(user: PteroAdminUser): AdminUser {
	return {
		id: String(user.id),
		username: user.username,
		email: user.email,
		admin: user.root_admin,
		suspended: null,
		twoFactor: user['2fa'],
		createdAt: user.created_at,
	};
}
