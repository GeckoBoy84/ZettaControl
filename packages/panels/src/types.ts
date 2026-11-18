export const PANEL_KINDS = ['calagopus', 'pterodactyl1', 'pterodactyl2', 'pelican'] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

export const PANEL_KIND_LABELS: Record<PanelKind, string> = {
	calagopus: 'Calagopus',
	pterodactyl1: 'Pterodactyl 1.x',
	pterodactyl2: 'Pterodactyl 2.x',
	pelican: 'Pelican',
};

export type PowerAction = 'start' | 'stop' | 'restart' | 'kill';

/** Normalised run state. Panels that report something else map it to `unknown`. */
export type ServerState = 'offline' | 'starting' | 'stopping' | 'running' | 'unknown';

/**
 * What an adapter can do. The bot hides buttons for anything that is false, so
 * a panel never shows an action it cannot perform.
 */
export interface PanelCapabilities {
	power: boolean;
	command: boolean;
	resources: boolean;
	console: boolean;
	backups: boolean;
	files: boolean;
	schedules: boolean;
	databases: boolean;
	subusers: boolean;
	/** Allocations (IP and port) of a server. */
	network: boolean;
	/** Startup variables, read and edit. */
	startup: boolean;
	/** A crash log the bot can poll, for crash alerts. Without it alerts only see "went offline". */
	crashLogs: boolean;
}

export interface PanelAccount {
	id: string;
	username: string;
	email: string;
	admin: boolean;
}

/** Limits are in MiB (memory, disk) and percent of one core (cpu). 0 means unlimited. */
export interface ServerLimits {
	memoryMib: number;
	diskMib: number;
	cpuPercent: number;
}

export interface ServerSummary {
	/** The ID the panel's client API expects in URLs. */
	id: string;
	/** A short human friendly ID, shown to users. */
	shortId: string;
	name: string;
	description: string | null;
	node: string | null;
	limits: ServerLimits;
	suspended: boolean;
	/** Panel specific transitional status, for example `installing`. null when idle. */
	status: string | null;
	isOwner: boolean;
}

export interface ServerResources {
	state: ServerState;
	cpuPercent: number;
	memoryBytes: number;
	diskBytes: number;
	networkRxBytes: number;
	networkTxBytes: number;
	uptimeMs: number;
}

export interface ConsoleCredentials {
	socketUrl: string;
	token: string;
}

/** Dates are ISO 8601 strings as the panel sent them. */
export interface Backup {
	id: string;
	name: string;
	bytes: number;
	successful: boolean;
	locked: boolean;
	createdAt: string;
	/** null while the backup is still running. */
	completedAt: string | null;
}

export interface FileEntry {
	name: string;
	directory: boolean;
	size: number;
	modifiedAt: string | null;
}

export interface Schedule {
	id: string;
	name: string;
	enabled: boolean;
	/** Human readable trigger, for example a cron expression. */
	trigger: string | null;
	lastRunAt: string | null;
	nextRunAt: string | null;
}

export interface Database {
	id: string;
	name: string;
	username: string;
	host: string;
	port: number;
}

export interface Subuser {
	id: string;
	username: string;
	email: string | null;
	permissions: string[];
}

export interface Allocation {
	id: string;
	ip: string;
	alias: string | null;
	port: number;
	notes: string | null;
	primary: boolean;
}

export interface StartupVariable {
	/** The environment variable name, used to update it. */
	key: string;
	name: string;
	description: string | null;
	value: string;
	defaultValue: string | null;
	editable: boolean;
	/** The panel hides the value. */
	secret: boolean;
}

export interface CrashLog {
	id: string;
	at: string;
	exitCode: number;
	outOfMemory: boolean;
}

/**
 * Every method exists on every adapter. Methods behind a capability that is false
 * throw PanelError('unsupported').
 */
export interface PanelClient {
	readonly kind: PanelKind;
	readonly url: string;
	readonly capabilities: PanelCapabilities;

	getAccount(): Promise<PanelAccount>;
	listServers(options?: { search?: string }): Promise<ServerSummary[]>;
	getServer(id: string): Promise<ServerSummary>;
	getResources(id: string): Promise<ServerResources>;
	power(id: string, action: PowerAction): Promise<void>;
	sendCommand(id: string, command: string): Promise<void>;
	getConsoleCredentials(id: string): Promise<ConsoleCredentials>;

	listBackups(id: string): Promise<Backup[]>;
	createBackup(id: string, name?: string): Promise<Backup>;
	deleteBackup(id: string, backupId: string): Promise<void>;
	restoreBackup(id: string, backupId: string): Promise<void>;
	/** A short lived signed link. Treat it like a password. */
	getBackupDownloadUrl(id: string, backupId: string): Promise<string>;

	/** `directory` is absolute, for example `/` or `/plugins`. */
	listFiles(id: string, directory: string): Promise<FileEntry[]>;
	readFile(id: string, path: string): Promise<string>;
	writeFile(id: string, path: string, content: string): Promise<void>;
	/** A short lived signed link. Treat it like a password. */
	getFileDownloadUrl(id: string, path: string): Promise<string>;

	listSchedules(id: string): Promise<Schedule[]>;
	runSchedule(id: string, scheduleId: string): Promise<void>;

	listDatabases(id: string): Promise<Database[]>;
	getDatabasePassword(id: string, databaseId: string): Promise<string | null>;
	rotateDatabasePassword(id: string, databaseId: string): Promise<string | null>;

	listSubusers(id: string): Promise<Subuser[]>;
	listAllocations(id: string): Promise<Allocation[]>;

	listStartupVariables(id: string): Promise<StartupVariable[]>;
	setStartupVariable(id: string, key: string, value: string): Promise<void>;

	/** Newest first. */
	listCrashes(id: string): Promise<CrashLog[]>;
}

export interface PanelClientOptions {
	url: string;
	apiKey: string;
	/** Per request timeout in ms. */
	timeoutMs?: number;
	userAgent?: string;
}
