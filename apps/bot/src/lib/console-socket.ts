// A reconnecting client for the Wings console websocket that Pterodactyl, Pelican and
// Calagopus all use: `{ event, args }` JSON frames, a short lived JWT sent with `auth`,
// and `token expiring` asking for a fresh one. Knows nothing about Discord.

import { PanelError, type ConsoleCredentials } from '@zettako/panels';
import { logger } from '../logger.ts';
import { assertPublicUrl } from './network.ts';

const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
/** Panel errors that will not fix themselves by retrying soon. */
const FATAL: readonly string[] = ['unauthorized', 'forbidden', 'not_found'];

export interface ConsoleSocketHandlers {
	output(line: string): void;
	status(state: string): void;
	/** Something the people watching should know, such as a lost connection. */
	notice(message: string): void;
}

interface Frame {
	event: string;
	args?: unknown[];
}

export class ConsoleSocket {
	readonly #credentials: () => Promise<ConsoleCredentials>;
	readonly #origin: string;
	readonly #handlers: ConsoleSocketHandlers;
	#socket: WebSocket | null = null;
	#stopped = false;
	#retryMs = MIN_RETRY_MS;
	#retryTimer: NodeJS.Timeout | null = null;
	#backfill: boolean;
	#connectedOnce = false;
	#lastNotice = '';

	/**
	 * @param origin The panel URL. Wings only accepts sockets whose Origin matches it.
	 * @param backfill Ask for recent output on the first connect, for a freshly opened thread.
	 */
	constructor(credentials: () => Promise<ConsoleCredentials>, origin: string, handlers: ConsoleSocketHandlers, backfill: boolean) {
		this.#credentials = credentials;
		this.#origin = origin;
		this.#handlers = handlers;
		this.#backfill = backfill;
	}

	start(): void {
		void this.#connect();
	}

	stop(): void {
		this.#stopped = true;
		if (this.#retryTimer) clearTimeout(this.#retryTimer);
		this.#socket?.close();
		this.#socket = null;
	}

	async #connect(): Promise<void> {
		if (this.#stopped) return;
		let credentials: ConsoleCredentials;
		try {
			credentials = await this.#credentials();
			// The socket URL comes from the panel, which anyone can point the bot at.
			await assertPublicUrl(credentials.socketUrl.replace(/^ws/, 'http'));
		} catch (error) {
			const fatal = error instanceof PanelError && FATAL.includes(error.code);
			this.#notice(fatal ? `The panel refused the console: ${error.message}` : 'Could not reach the panel. Retrying.');
			this.#retry(fatal ? MAX_RETRY_MS : undefined);
			return;
		}
		if (this.#stopped) return;

		const socket = new WebSocket(credentials.socketUrl, { headers: { Origin: this.#origin } });
		this.#socket = socket;
		socket.onopen = () => this.#send({ event: 'auth', args: [credentials.token] });
		socket.onmessage = (message) => this.#receive(message.data);
		socket.onclose = () => {
			if (this.#socket !== socket) return;
			this.#socket = null;
			if (!this.#stopped) {
				this.#notice('Lost the connection to the server console. Reconnecting.');
				this.#retry();
			}
		};
		socket.onerror = () => logger.debug({ origin: this.#origin }, 'Console socket error');
	}

	#retry(delay = this.#retryMs): void {
		if (this.#stopped) return;
		this.#retryTimer = setTimeout(() => void this.#connect(), delay);
		this.#retryMs = Math.min(this.#retryMs * 2, MAX_RETRY_MS);
	}

	#send(frame: Frame): void {
		if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(frame));
	}

	#notice(message: string): void {
		// Say each problem once, not on every retry.
		if (message === this.#lastNotice) return;
		this.#lastNotice = message;
		this.#handlers.notice(message);
	}

	#receive(data: unknown): void {
		let frame: Frame;
		try {
			frame = JSON.parse(String(data)) as Frame;
		} catch {
			return;
		}
		const first = typeof frame.args?.[0] === 'string' ? frame.args[0] : '';

		switch (frame.event) {
			case 'auth success':
				this.#retryMs = MIN_RETRY_MS;
				if (this.#connectedOnce && this.#lastNotice) this.#handlers.notice('Reconnected to the server console.');
				this.#lastNotice = '';
				if (this.#backfill && !this.#connectedOnce) this.#send({ event: 'send logs', args: [null] });
				this.#connectedOnce = true;
				return;
			case 'console output':
			case 'install output':
				this.#handlers.output(first);
				return;
			case 'daemon message':
				this.#handlers.output(`[daemon] ${first}`);
				return;
			case 'status':
				this.#handlers.status(first);
				return;
			case 'token expiring':
				void this.#credentials()
					.then((credentials) => this.#send({ event: 'auth', args: [credentials.token] }))
					.catch(() => undefined);
				return;
			case 'token expired':
			case 'jwt error':
				this.#socket?.close();
				return;
		}
	}
}
