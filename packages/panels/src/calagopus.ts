// Calagopus client API. Reference: https://<panel>/api (OpenAPI at /openapi.json).
// Unlike Pterodactyl, responses are plain JSON wrapped in a named key
// ({ server }, { servers: { data } }) and errors are { errors: string[] }.

import { PanelError } from './errors.ts';
import { HttpClient } from './http.ts';
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

interface CalagopusBackup {
	uuid: string;
	name: string;
	is_successful: boolean;
	is_locked: boolean;
	bytes: number;
	completed: string | null;
	created: string;
}

interface CalagopusFile {
	name: string;
	directory: boolean;
	size: number;
	modified: string | null;
}

interface CalagopusTrigger {
	type: string;
	schedule?: string;
	action?: string;
	state?: string;
	contains?: string;
}

interface CalagopusSchedule {
	uuid: string;
	name: string;
	enabled: boolean;
	triggers: CalagopusTrigger[];
	last_run: string | null;
}

interface CalagopusDatabase {
	uuid: string;
	name: string;
	username: string;
	host: string;
	port: number;
	password: string | null;
}

interface CalagopusSubuser {
	user: { uuid: string; username: string };
	permissions: string[];
}

interface CalagopusAllocation {
	uuid: string;
	ip: string;
	ip_alias: string | null;
	port: number;
	notes: string | null;
	is_primary: boolean;
}

interface CalagopusVariable {
	name: string;
	description: string | null;
	env_variable: string;
	default_value: string | null;
	value: string;
	is_editable: boolean;
	is_secret: boolean;
}

interface CalagopusCrash {
	id: number;
	timestamp: string;
	exit_code: number;
	oom_killed: boolean;
}

type Query = Record<string, string | number | boolean | undefined>;

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
		backups: true,
		files: true,
		schedules: true,
		databases: true,
		subusers: true,
		network: true,
		startup: true,
		crashLogs: true,
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

	/** Walks a paginated list wrapped in `{ [key]: { total, per_page, page, data } }`. */
	async #collect<T>(path: string, key: string, query: Query = {}): Promise<T[]> {
		const items: T[] = [];
		for (let page = 1; page <= MAX_PAGES; page++) {
			const body = await this.#http.request<Record<string, CalagopusPage<T> | undefined>>(path, { query: { ...query, page, per_page: PER_PAGE } });
			const result = body[key];
			if (!result) break;
			items.push(...result.data);
			if (page * result.per_page >= result.total || result.data.length === 0) break;
		}
		return items;
	}

	#server(id: string): string {
		return `/api/client/servers/${encodeURIComponent(id)}`;
	}

	async listServers(options: { search?: string } = {}): Promise<ServerSummary[]> {
		const servers = await this.#collect<CalagopusServer>('/api/client/servers', 'servers', { search: options.search || undefined, other: false });
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

	async listBackups(id: string): Promise<Backup[]> {
		const backups = await this.#collect<CalagopusBackup>(`${this.#server(id)}/backups`, 'backups', { ungrouped: false, kind: 'server' });
		return backups.map(toBackup);
	}

	async createBackup(id: string, name?: string): Promise<Backup> {
		const { backup } = await this.#http.request<{ backup: CalagopusBackup }>(`${this.#server(id)}/backups`, {
			method: 'POST',
			body: { name: name ?? null, ignored_files: [] },
		});
		return toBackup(backup);
	}

	async deleteBackup(id: string, backupId: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/backups/${encodeURIComponent(backupId)}`, { method: 'DELETE' });
	}

	async restoreBackup(id: string, backupId: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/backups/${encodeURIComponent(backupId)}/restore`, {
			method: 'POST',
			body: { truncate_directory: false },
		});
	}

	async getBackupDownloadUrl(id: string, backupId: string): Promise<string> {
		const { url } = await this.#http.request<{ url: string }>(`${this.#server(id)}/backups/${encodeURIComponent(backupId)}/download`, {
			query: { archive_format: 'tar_gz' },
		});
		return url;
	}

	async listFiles(id: string, directory: string): Promise<FileEntry[]> {
		const files = await this.#collect<CalagopusFile>(`${this.#server(id)}/files/list`, 'entries', { directory });
		return files.map((file) => ({ name: file.name, directory: file.directory, size: file.size, modifiedAt: file.modified }));
	}

	readFile(id: string, path: string): Promise<string> {
		return this.#http.requestText(`${this.#server(id)}/files/contents`, { query: { file: path } });
	}

	async writeFile(id: string, path: string, content: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/files/write`, { method: 'POST', query: { file: path }, text: content });
	}

	async getFileDownloadUrl(id: string, path: string): Promise<string> {
		const split = path.lastIndexOf('/');
		const { url } = await this.#http.request<{ url: string }>(`${this.#server(id)}/files/download`, {
			query: { root: path.slice(0, split) || '/', files: path.slice(split + 1), directory: false, archive_format: 'zip' },
		});
		return url;
	}

	async listSchedules(id: string): Promise<Schedule[]> {
		const schedules = await this.#collect<CalagopusSchedule>(`${this.#server(id)}/schedules`, 'schedules');
		return schedules.map((schedule) => ({
			id: schedule.uuid,
			name: schedule.name,
			enabled: schedule.enabled,
			trigger: schedule.triggers.map(describeTrigger).join(', ') || null,
			lastRunAt: schedule.last_run,
			nextRunAt: null,
		}));
	}

	async runSchedule(id: string, scheduleId: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/schedules/${encodeURIComponent(scheduleId)}/trigger`, {
			method: 'POST',
			body: { skip_condition: false },
		});
	}

	async listDatabases(id: string): Promise<Database[]> {
		const databases = await this.#collect<CalagopusDatabase>(`${this.#server(id)}/databases`, 'databases', { include_password: false });
		return databases.map((database) => ({
			id: database.uuid,
			name: database.name,
			username: database.username,
			host: database.host,
			port: database.port,
		}));
	}

	async getDatabasePassword(id: string, databaseId: string): Promise<string | null> {
		const databases = await this.#collect<CalagopusDatabase>(`${this.#server(id)}/databases`, 'databases', { include_password: true });
		const database = databases.find((row) => row.uuid === databaseId);
		if (!database) throw new PanelError('not_found', 'That database no longer exists.', 404);
		return database.password;
	}

	async rotateDatabasePassword(id: string, databaseId: string): Promise<string | null> {
		const { password } = await this.#http.request<{ password?: string | null }>(
			`${this.#server(id)}/databases/${encodeURIComponent(databaseId)}/rotate-password`,
			{ method: 'POST' },
		);
		return password ?? null;
	}

	async listSubusers(id: string): Promise<Subuser[]> {
		const subusers = await this.#collect<CalagopusSubuser>(`${this.#server(id)}/subusers`, 'subusers');
		return subusers.map((subuser) => ({ id: subuser.user.uuid, username: subuser.user.username, email: null, permissions: subuser.permissions }));
	}

	async listAllocations(id: string): Promise<Allocation[]> {
		const allocations = await this.#collect<CalagopusAllocation>(`${this.#server(id)}/allocations`, 'allocations');
		return allocations.map((allocation) => ({
			id: allocation.uuid,
			ip: allocation.ip,
			alias: allocation.ip_alias,
			port: allocation.port,
			notes: allocation.notes,
			primary: allocation.is_primary,
		}));
	}

	async listStartupVariables(id: string): Promise<StartupVariable[]> {
		const { variables } = await this.#http.request<{ variables: CalagopusVariable[] }>(`${this.#server(id)}/startup/variables`);
		return variables.map((variable) => ({
			key: variable.env_variable,
			name: variable.name,
			description: variable.description || null,
			value: variable.value,
			defaultValue: variable.default_value,
			editable: variable.is_editable,
			secret: variable.is_secret,
		}));
	}

	async setStartupVariable(id: string, key: string, value: string): Promise<void> {
		await this.#http.request(`${this.#server(id)}/startup/variables`, { method: 'PUT', body: { variables: [{ env_variable: key, value }] } });
	}

	async listCrashes(id: string): Promise<CrashLog[]> {
		const { crashes } = await this.#http.request<{ crashes: CalagopusCrash[] }>(`${this.#server(id)}/logs/crashes`);
		return crashes
			.map((crash) => ({ id: String(crash.id), at: crash.timestamp, exitCode: crash.exit_code, outOfMemory: crash.oom_killed }))
			.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
	}
}

function toBackup(backup: CalagopusBackup): Backup {
	return {
		id: backup.uuid,
		name: backup.name,
		bytes: backup.bytes,
		successful: backup.is_successful,
		locked: backup.is_locked,
		createdAt: backup.created,
		completedAt: backup.completed,
	};
}

function describeTrigger(trigger: CalagopusTrigger): string {
	switch (trigger.type) {
		case 'cron':
			return `cron ${trigger.schedule ?? ''}`.trim();
		case 'power_action':
			return `on ${trigger.action ?? 'power action'}`;
		case 'server_state':
			return `when ${trigger.state ?? 'state changes'}`;
		case 'console_line':
			return `console line "${trigger.contains ?? ''}"`;
		default:
			return trigger.type.replaceAll('_', ' ');
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
