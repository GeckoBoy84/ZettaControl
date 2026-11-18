// Pure uptime logic for panel stats boards: turns this minute's checks into what each
// board remembers (online or not, and since when) and the up and down alerts to send.
// A status only flips after FLIP_CHECKS checks in a row disagree, so one dropped
// request does not post "node offline" and then "back online" a minute later.

import type { PanelStatsState, TrackedStatus } from '../db/schema.ts';

export const FLIP_CHECKS = 2;

export interface StatsObservation {
	/** null when we cannot tell, for example the admin key was rejected. */
	panelOnline: boolean | null;
	/** null when the panel did not answer, so nodes keep what we knew. A node's `online` is null when it could not be checked. */
	nodes: { id: string; name: string; online: boolean | null }[] | null;
}

export interface StatsEvent {
	target: 'panel' | 'node';
	name: string;
	online: boolean;
	/** When the state that just ended began, to say how long it lasted. */
	previousSince: string;
	/** When the new state began: the first of the checks that disagreed. */
	since: string;
}

export function track(previous: TrackedStatus | null | undefined, observed: boolean | null, now: string): { next: TrackedStatus | null; flipped: boolean } {
	if (observed === null) return { next: previous ?? null, flipped: false };
	// The first sighting is a baseline. A node that is already down is not news.
	if (!previous) return { next: { online: observed, since: now, misses: 0, missSince: null }, flipped: false };
	if (observed === previous.online) return { next: { ...previous, misses: 0, missSince: null }, flipped: false };

	const misses = previous.misses + 1;
	const missSince = previous.missSince ?? now;
	if (misses < FLIP_CHECKS) return { next: { ...previous, misses, missSince }, flipped: false };
	return { next: { online: observed, since: missSince, misses: 0, missSince: null }, flipped: true };
}

export function advance(state: PanelStatsState | null, observation: StatsObservation, now: string): { state: PanelStatsState; events: StatsEvent[] } {
	const events: StatsEvent[] = [];

	const panel = track(state?.panel, observation.panelOnline, now);
	if (panel.flipped && panel.next && state?.panel) {
		events.push({ target: 'panel', name: 'Panel', online: panel.next.online, previousSince: state.panel.since, since: panel.next.since });
	}

	let nodes = state?.nodes ?? {};
	if (observation.nodes) {
		// Rebuilt from what the panel listed, so deleted nodes are forgotten.
		nodes = {};
		for (const node of observation.nodes) {
			const previous = state?.nodes[node.id];
			const result = track(previous, node.online, now);
			if (result.next) nodes[node.id] = { ...result.next, name: node.name };
			if (result.flipped && result.next && previous) {
				events.push({ target: 'node', name: node.name, online: result.next.online, previousSince: previous.since, since: result.next.since });
			}
		}
	}

	return { state: { panel: panel.next, nodes }, events };
}
