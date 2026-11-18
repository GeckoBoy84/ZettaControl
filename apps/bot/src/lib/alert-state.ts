// Pure alert logic: compares what the monitor saw this minute with what it remembers
// and decides which alerts to send. No Discord or database imports, so it is easy to test.

import type { CrashLog, ServerLimits, ServerResources, ServerState } from '@zettako/panels';
import type { AlertEvent } from '../db/schema.ts';

/** What the monitor knows about one server this tick. `resources` is null when the panel did not answer. */
export interface Observation {
	resources: ServerResources | null;
	limits: ServerLimits;
	/** Newest crash, when the panel has a crash log and the rule wants crashes. */
	latestCrash: CrashLog | null;
}

export interface ServerMemory {
	state: ServerState;
	lastCrashId: string | null;
	/** Consecutive ticks above the threshold. */
	hotTicks: number;
	hotAlerted: boolean;
	/** An offline or crash alert went out and the server has not come back yet. */
	downAlerted: boolean;
}

export type Alert =
	| { kind: 'offline' }
	| { kind: 'crash'; crash: CrashLog }
	| { kind: 'online' }
	| { kind: 'resources'; metrics: { name: 'CPU' | 'Memory' | 'Disk'; percent: number }[] };

export interface RuleSettings {
	events: AlertEvent[];
	threshold: number;
}

/** Ticks in a row above the threshold before alerting, so a short spike stays quiet. */
export const HOT_TICKS = 2;
/** How far below the threshold usage has to drop before another resource alert can fire. */
const HYSTERESIS = 5;
const MIB = 1024 * 1024;

export function usage(resources: ServerResources, limits: ServerLimits): { name: 'CPU' | 'Memory' | 'Disk'; percent: number }[] {
	const metrics: { name: 'CPU' | 'Memory' | 'Disk'; percent: number }[] = [];
	// CPU and memory only mean something while the server runs. A limit of 0 is unlimited.
	const running = resources.state === 'running';
	if (running && limits.cpuPercent > 0) metrics.push({ name: 'CPU', percent: (resources.cpuPercent / limits.cpuPercent) * 100 });
	if (running && limits.memoryMib > 0) metrics.push({ name: 'Memory', percent: (resources.memoryBytes / (limits.memoryMib * MIB)) * 100 });
	if (limits.diskMib > 0) metrics.push({ name: 'Disk', percent: (resources.diskBytes / (limits.diskMib * MIB)) * 100 });
	return metrics;
}

export function evaluate(previous: ServerMemory | undefined, observation: Observation, rule: RuleSettings): { next: ServerMemory | undefined; alerts: Alert[] } {
	const { resources, latestCrash } = observation;
	// The panel did not answer: remember what we knew and say nothing.
	if (!resources) return { next: previous, alerts: [] };

	const state = resources.state;
	const crashId = latestCrash?.id ?? null;
	// The first sighting is a baseline. A server that is already offline is not news.
	if (!previous) return { next: { state, lastCrashId: crashId, hotTicks: 0, hotAlerted: false, downAlerted: false }, alerts: [] };

	const alerts: Alert[] = [];
	const next: ServerMemory = { ...previous, state, lastCrashId: crashId ?? previous.lastCrashId };

	const crashed = latestCrash !== null && crashId !== previous.lastCrashId && rule.events.includes('crash');
	if (crashed) {
		alerts.push({ kind: 'crash', crash: latestCrash });
		next.downAlerted = true;
	} else if (rule.events.includes('offline') && state === 'offline' && (previous.state === 'running' || previous.state === 'starting')) {
		alerts.push({ kind: 'offline' });
		next.downAlerted = true;
	} else if (previous.downAlerted && state === 'running') {
		alerts.push({ kind: 'online' });
		next.downAlerted = false;
	}

	if (rule.events.includes('resources')) {
		const metrics = usage(resources, observation.limits);
		const hot = metrics.filter((metric) => metric.percent >= rule.threshold);
		if (hot.length > 0) {
			next.hotTicks = previous.hotTicks + 1;
			if (next.hotTicks >= HOT_TICKS && !previous.hotAlerted) {
				alerts.push({ kind: 'resources', metrics: hot });
				next.hotAlerted = true;
			}
		} else {
			next.hotTicks = 0;
			if (metrics.every((metric) => metric.percent < rule.threshold - HYSTERESIS)) next.hotAlerted = false;
		}
	}

	return { next, alerts };
}
