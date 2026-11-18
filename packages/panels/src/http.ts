import { codeForStatus, PanelError } from './errors.ts';
import type { PanelClientOptions } from './types.ts';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RATE_LIMIT_RETRIES = 2;

export type ErrorParser = (body: unknown) => string[];

export interface RequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	/** Sent as text/plain instead of a JSON body. */
	text?: string;
}

/** Strips trailing slashes and a pasted `/api...` suffix, and requires http(s). */
export function normalisePanelUrl(input: string): string {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		throw new PanelError('validation', 'That is not a valid URL.');
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new PanelError('validation', 'The panel URL must start with https://');
	}
	const path = url.pathname.replace(/\/api(\/.*)?$/, '').replace(/\/+$/, '');
	return `${url.origin}${path}`;
}

/**
 * Small fetch wrapper shared by every adapter: bearer auth, JSON, timeouts,
 * a couple of retries on 429, and errors mapped to PanelError.
 */
export class HttpClient {
	readonly baseUrl: string;
	readonly #apiKey: string;
	readonly #timeoutMs: number;
	readonly #userAgent: string;
	readonly #parseErrors: ErrorParser;

	constructor(options: PanelClientOptions, parseErrors: ErrorParser) {
		this.baseUrl = normalisePanelUrl(options.url);
		this.#apiKey = options.apiKey;
		this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.#userAgent = options.userAgent ?? '@zettako/panels';
		this.#parseErrors = parseErrors;
	}

	request<T>(path: string, options: RequestOptions = {}): Promise<T> {
		return this.#send(path, options, (response) => this.#handle<T>(response));
	}

	/** For endpoints that answer with raw text, such as file contents. */
	requestText(path: string, options: RequestOptions = {}): Promise<string> {
		return this.#send(path, options, (response) => this.#handleText(response));
	}

	async #send<T>(path: string, options: RequestOptions, handle: (response: Response) => Promise<T>): Promise<T> {
		const url = new URL(this.baseUrl + path);
		for (const [key, value] of Object.entries(options.query ?? {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}

		for (let attempt = 0; ; attempt++) {
			const response = await this.#fetch(url, options);
			if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
				await sleep(retryAfterMs(response));
				continue;
			}
			return handle(response);
		}
	}

	async #fetch(url: URL, options: RequestOptions): Promise<Response> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.#apiKey}`,
			Accept: 'application/json',
			'User-Agent': this.#userAgent,
		};
		if (options.body !== undefined) headers['Content-Type'] = 'application/json';
		if (options.text !== undefined) headers['Content-Type'] = 'text/plain';

		try {
			return await fetch(url, {
				method: options.method ?? 'GET',
				headers,
				body: options.text ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
				signal: AbortSignal.timeout(this.#timeoutMs),
				redirect: 'error',
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === 'TimeoutError') {
				throw new PanelError('timeout', 'The panel took too long to respond.');
			}
			throw new PanelError('unreachable', 'Could not reach the panel. Check the URL and that it is online.');
		}
	}

	async #handle<T>(response: Response): Promise<T> {
		const text = await response.text();
		let body: unknown = null;
		if (text.length > 0) {
			try {
				body = JSON.parse(text);
			} catch {
				// A panel behind a proxy or login page can return HTML. Treat it as unknown below.
			}
		}

		if (response.ok) {
			if (text.length > 0 && body === null) {
				throw new PanelError('unknown', 'The panel returned something that is not JSON. Is this the right URL?', response.status);
			}
			return body as T;
		}

		throw this.#error(response.status, body);
	}

	async #handleText(response: Response): Promise<string> {
		const text = await response.text();
		if (response.ok) return text;
		let body: unknown = null;
		try {
			body = JSON.parse(text);
		} catch {
			// Not JSON, so there are no details to show.
		}
		throw this.#error(response.status, body);
	}

	#error(status: number, body: unknown): PanelError {
		const details = body === null ? [] : this.#parseErrors(body);
		return new PanelError(codeForStatus(status), details[0] ?? `The panel returned HTTP ${status}.`, status, details);
	}
}

function retryAfterMs(response: Response): number {
	const header = Number(response.headers.get('retry-after'));
	return Number.isFinite(header) && header > 0 ? Math.min(header, 10) * 1000 : 1000;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
