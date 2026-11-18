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
}

export interface PanelClientOptions {
	url: string;
	apiKey: string;
	/** Per request timeout in ms. */
	timeoutMs?: number;
	userAgent?: string;
}
