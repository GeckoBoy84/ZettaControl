// Checks whether a node's Wings daemon is up, for panels whose admin API cannot tell us.
// No daemon token is sent: Wings answers an unauthenticated request with 401, and any
// answer from Wings itself means it is running. A 5xx usually comes from a proxy in
// front of a Wings that is down, so that counts as offline.

const DEFAULT_TIMEOUT_MS = 5_000;

/** TLS errors mean something answered on the port, just with a certificate we cannot verify. */
const CERTIFICATE_ERRORS = new Set([
	'DEPTH_ZERO_SELF_SIGNED_CERT',
	'SELF_SIGNED_CERT_IN_CHAIN',
	'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
	'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
	'CERT_HAS_EXPIRED',
	'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export interface WingsPing {
	online: boolean;
	/** Round trip time, when Wings answered. */
	latencyMs: number | null;
}

export async function pingWings(wingsUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<WingsPing> {
	const started = performance.now();
	try {
		const response = await fetch(new URL('/api/system', wingsUrl), {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'manual',
		});
		await response.body?.cancel();
		return response.status < 500 ? { online: true, latencyMs: Math.round(performance.now() - started) } : { online: false, latencyMs: null };
	} catch (error) {
		const code = error instanceof Error && error.cause instanceof Error ? (error.cause as Error & { code?: string }).code : undefined;
		return code && CERTIFICATE_ERRORS.has(code) ? { online: true, latencyMs: Math.round(performance.now() - started) } : { online: false, latencyMs: null };
	}
}
