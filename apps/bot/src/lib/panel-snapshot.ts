// One look at a panel through its admin API: totals and every node's status. Calagopus
// reports node usage itself; elsewhere the bot pings Wings, after the same SSRF check
// panel URLs get, since node addresses come from whoever runs the panel.

import { PanelError, pingWings, type AdminClient, type AdminNode, type NodeStats, type PanelTotals } from '@zettako/panels';
import { forEachLimit } from './concurrency.ts';
import { checkUrl } from './network.ts';
import { describeAdminError } from './replies.ts';

/** Discord embeds hold 25 fields. */
export const MAX_NODES = 24;
const CONCURRENCY = 5;

export type NodeStatus = 'online' | 'offline' | 'unknown';

export interface NodeSnapshot {
	node: AdminNode;
	status: NodeStatus;
	stats: NodeStats | null;
	/** Why the status is unknown. */
	note: string | null;
}

export type PanelSnapshot =
	| { ok: true; latencyMs: number; totals: PanelTotals; nodes: NodeSnapshot[]; hidden: number }
	/** `down` is true when the panel did not answer at all, rather than refusing the key. */
	| { ok: false; down: boolean; error: string };

const DOWN_CODES = new Set(['unreachable', 'timeout', 'server_error']);

export async function collectSnapshot(admin: AdminClient): Promise<PanelSnapshot> {
	const started = performance.now();
	let totals: PanelTotals;
	let nodes: AdminNode[];
	try {
		[totals, nodes] = await Promise.all([admin.getTotals(), admin.listNodes()]);
	} catch (error) {
		return { ok: false, down: error instanceof PanelError && DOWN_CODES.has(error.code), error: describeAdminError(error) };
	}
	const latencyMs = Math.round(performance.now() - started);

	const snapshots: NodeSnapshot[] = nodes.slice(0, MAX_NODES).map((node) => ({ node, status: 'unknown', stats: null, note: null }));
	await forEachLimit(snapshots, CONCURRENCY, async (snapshot) => {
		Object.assign(snapshot, await checkNode(admin, snapshot.node));
	});
	return { ok: true, latencyMs, totals, nodes: snapshots, hidden: nodes.length - snapshots.length };
}

async function checkNode(admin: AdminClient, node: AdminNode): Promise<Omit<NodeSnapshot, 'node'>> {
	if (admin.capabilities.nodeStats) {
		try {
			return { status: 'online', stats: await admin.getNodeStats(node.id), note: null };
		} catch (error) {
			if (error instanceof PanelError && (error.code === 'unauthorized' || error.code === 'forbidden')) {
				return { status: 'unknown', stats: null, note: 'no permission to read node stats' };
			}
			// The panel answered the node list, so a failure here is the panel failing to reach Wings.
			return { status: 'offline', stats: null, note: null };
		}
	}

	if (!node.wingsUrl) return { status: 'unknown', stats: null, note: 'no Wings address' };
	const where = await checkUrl(node.wingsUrl).catch(() => 'invalid' as const);
	if (where === 'invalid') return { status: 'unknown', stats: null, note: 'invalid Wings address' };
	if (where === 'private') return { status: 'unknown', stats: null, note: 'private address' };
	if (where === 'unresolved') return { status: 'offline', stats: null, note: null };
	return { status: (await pingWings(node.wingsUrl)).online ? 'online' : 'offline', stats: null, note: null };
}
