export type PanelErrorCode =
	| 'unauthorized'
	| 'forbidden'
	| 'not_found'
	| 'rate_limited'
	| 'conflict'
	| 'validation'
	| 'unreachable'
	| 'timeout'
	| 'server_error'
	| 'unsupported'
	| 'unknown';

/**
 * Every adapter throws this, so callers can show one friendly message per code
 * without knowing which panel they talk to.
 */
export class PanelError extends Error {
	readonly code: PanelErrorCode;
	readonly status: number | null;
	/** Messages the panel returned, if any. Safe to show to the key's owner. */
	readonly details: string[];

	constructor(code: PanelErrorCode, message: string, status: number | null = null, details: string[] = []) {
		super(message);
		this.name = 'PanelError';
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

export function codeForStatus(status: number): PanelErrorCode {
	if (status === 401) return 'unauthorized';
	if (status === 403) return 'forbidden';
	if (status === 404) return 'not_found';
	if (status === 409) return 'conflict';
	if (status === 400 || status === 422) return 'validation';
	if (status === 429) return 'rate_limited';
	if (status >= 500) return 'server_error';
	return 'unknown';
}
