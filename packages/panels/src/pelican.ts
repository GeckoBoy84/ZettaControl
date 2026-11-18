// Pelican client API.
// Pelican is a Pterodactyl fork and its client API still matches Pterodactyl
// 1.x for everything used here. This started as a copy of pterodactyl1.ts and
// is meant to drift with Pelican (no nests or locations in its application API).

import { collectPages, parseFractalErrors, type FractalItem, type FractalList } from './fractal.ts';
import { HttpClient } from './http.ts';
import { PanelError } from './errors.ts';
import type {
	Allocation,
	Backup,
	ConsoleCredentials,
	CrashLog,
	Database,
	FileEntry,
	PanelAccount,
	PanelCapabilities,
	PanelClient,
	PanelClientOptions,
	PowerAction,
	Schedule,
	ServerResources,
	ServerState,
	ServerSummary,
	StartupVariable,
	Subuser,
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

interface PelicanBackup {
	uuid: string;
	name: string;
	is_successful: boolean;
	is_locked: boolean;
	bytes: number;
	created_at: string;
	completed_at: string | null;
}

interface PelicanFile {
	name: string;
	size: number;
	is_file: boolean;
	modified_at: string | null;
}

interface PelicanSchedule {
	id: number;
	name: string;
	cron: { minute: string; hour: string; day_of_month: string; month: string; day_of_week: string };
	is_active: boolean;
	last_run_at: string | null;
	next_run_at: string | null;
}

interface PelicanDatabase {
	id: string;
	name: string;
	username: string;
	host: { address: string; port: number };
	relationships?: { password?: FractalItem<{ password: string }> };
}

interface PelicanSubuser {
	uuid: string;
	username: string;
	email: string;
	permissions: string[];
}

interface PelicanAllocation {
	id: number;
	ip: string;
	ip_alias: string | null;
	port: number;
	notes: string | null;
	is_default: boolean;
}

interface PelicanVariable {
	name: string;
	description: string;
	env_variable: string;
	default_value: string;
	server_value: string | null;
	is_editable: boolean;
}

const STATES: readonly ServerState[] = ['offline', 'starting', 'stopping', 'running'];

export class PelicanClient implements PanelClient {
	readonly kind = 'pelican';
	readonly capabilities: PanelCapabilities = {
		power: true,
		command: true,
		resources: true,
		console: true,
		backups: true,
		files: true,
		schedules: true,
		databases: true,
		subusers: true,
		network: true,
		startup: true,
		crashLogs: false,
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

	#server(id: string): string {
		return `/api/client/servers/${encodeURIComponent(id)}`;
	}

	async listBackups(id: string): Promise<Backup[]> {
		const backups = await collectPages((page) => this.#http.request<FractalList<PelicanBackup>>(`${this.#server(id)}/backups`, { query: { page, per_page: 50 } }));
		return backups.map(toBackup);
	}

	async createBackup(id: string, name?: string): Promise<Backup> {
		const { attributes } = await this.#http.request<FractalItem<PelicanBackup>>(`${this.#server(id)}/backups`, {
			method: 'POST',
			body: name ? { name } : {},
		});
		return toBackup(attributes);
	}

	async deleteBackup(id: string, backupId: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/backups/${encodeURIComponent(backupId)}`, { method: 'DELETE' });
	}

	async restoreBackup(id: string, backupId: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/backups/${encodeURIComponent(backupId)}/restore`, { method: 'POST', body: { truncate: false } });
	}

	async getBackupDownloadUrl(id: string, backupId: string): Promise<string> {
		const { attributes } = await this.#http.request<FractalItem<{ url: string }>>(`${this.#server(id)}/backups/${encodeURIComponent(backupId)}/download`);
		return attributes.url;
	}

	async listFiles(id: string, directory: string): Promise<FileEntry[]> {
		const { data } = await this.#http.request<FractalList<PelicanFile>>(`${this.#server(id)}/files/list`, { query: { directory } });
		return data.map(({ attributes: file }) => ({ name: file.name, directory: !file.is_file, size: file.size, modifiedAt: file.modified_at }));
	}

	readFile(id: string, path: string): Promise<string> {
		return this.#http.requestText(`${this.#server(id)}/files/contents`, { query: { file: path } });
	}

	async writeFile(id: string, path: string, content: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/files/write`, { method: 'POST', query: { file: path }, text: content });
	}

	async getFileDownloadUrl(id: string, path: string): Promise<string> {
		const { attributes } = await this.#http.request<FractalItem<{ url: string }>>(`${this.#server(id)}/files/download`, { query: { file: path } });
		return attributes.url;
	}

	async listSchedules(id: string): Promise<Schedule[]> {
		const { data } = await this.#http.request<FractalList<PelicanSchedule>>(`${this.#server(id)}/schedules`);
		return data.map(({ attributes: schedule }) => ({
			id: String(schedule.id),
			name: schedule.name,
			enabled: schedule.is_active,
			trigger: `cron ${[schedule.cron.minute, schedule.cron.hour, schedule.cron.day_of_month, schedule.cron.month, schedule.cron.day_of_week].join(' ')}`,
			lastRunAt: schedule.last_run_at,
			nextRunAt: schedule.next_run_at,
		}));
	}

	async runSchedule(id: string, scheduleId: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/schedules/${encodeURIComponent(scheduleId)}/execute`, { method: 'POST' });
	}

	async #databases(id: string, withPasswords: boolean): Promise<PelicanDatabase[]> {
		const { data } = await this.#http.request<FractalList<PelicanDatabase>>(`${this.#server(id)}/databases`, {
			query: { include: withPasswords ? 'password' : undefined },
		});
		return data.map((item) => item.attributes);
	}

	async listDatabases(id: string): Promise<Database[]> {
		return (await this.#databases(id, false)).map((database) => ({
			id: database.id,
			name: database.name,
			username: database.username,
			host: database.host.address,
			port: database.host.port,
		}));
	}

	async getDatabasePassword(id: string, databaseId: string): Promise<string | null> {
		const database = (await this.#databases(id, true)).find((row) => row.id === databaseId);
		if (!database) throw new PanelError('not_found', 'That database no longer exists.', 404);
		return database.relationships?.password?.attributes.password ?? null;
	}

	async rotateDatabasePassword(id: string, databaseId: string): Promise<string | null> {
		const { attributes } = await this.#http.request<FractalItem<PelicanDatabase>>(
			`${this.#server(id)}/databases/${encodeURIComponent(databaseId)}/rotate-password`,
			{ method: 'POST' },
		);
		return attributes.relationships?.password?.attributes.password ?? null;
	}

	async listSubusers(id: string): Promise<Subuser[]> {
		const { data } = await this.#http.request<FractalList<PelicanSubuser>>(`${this.#server(id)}/users`);
		return data.map(({ attributes: user }) => ({ id: user.uuid, username: user.username, email: user.email, permissions: user.permissions }));
	}

	async listAllocations(id: string): Promise<Allocation[]> {
		const { data } = await this.#http.request<FractalList<PelicanAllocation>>(`${this.#server(id)}/network/allocations`);
		return data.map(({ attributes: allocation }) => ({
			id: String(allocation.id),
			ip: allocation.ip,
			alias: allocation.ip_alias,
			port: allocation.port,
			notes: allocation.notes,
			primary: allocation.is_default,
		}));
	}

	async listStartupVariables(id: string): Promise<StartupVariable[]> {
		const { data } = await this.#http.request<FractalList<PelicanVariable>>(`${this.#server(id)}/startup`);
		return data.map(({ attributes: variable }) => ({
			key: variable.env_variable,
			name: variable.name,
			description: variable.description || null,
			value: variable.server_value ?? '',
			defaultValue: variable.default_value,
			editable: variable.is_editable,
			secret: false,
		}));
	}

	async setStartupVariable(id: string, key: string, value: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/startup/variable`, { method: 'PUT', body: { key, value } });
	}

	async listCrashes(_id: string): Promise<CrashLog[]> {
		throw new PanelError('unsupported', 'Pelican has no crash log API.');
	}
}

function toBackup(backup: PelicanBackup): Backup {
	return {
		id: backup.uuid,
		name: backup.name,
		bytes: backup.bytes,
		successful: backup.is_successful,
		locked: backup.is_locked,
		createdAt: backup.created_at,
		completedAt: backup.completed_at,
	};
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
