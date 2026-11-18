import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PanelStatsState } from '../src/db/schema.ts';
import { advance, FLIP_CHECKS, type StatsEvent, type StatsObservation } from '../src/lib/stats-state.ts';

const minute = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();

function up(nodeOnline: boolean | null = true): StatsObservation {
	return { panelOnline: true, nodes: [{ id: 'n1', name: 'Node 1', online: nodeOnline }] };
}

const PANEL_DOWN: StatsObservation = { panelOnline: false, nodes: null };

/** Feeds one observation per minute and returns the events of each. */
function run(observations: StatsObservation[]): { events: StatsEvent[][]; state: PanelStatsState | null } {
	let state: PanelStatsState | null = null;
	const events = observations.map((observation, i) => {
		const result = advance(state, observation, minute(i));
		state = result.state;
		return result.events;
	});
	return { events, state };
}

describe('panel stats state', () => {
	it('treats the first check as a baseline, even when a node is down', () => {
		const { events, state } = run([up(false)]);
		assert.deepEqual(events, [[]]);
		assert.deepEqual(state?.nodes.n1 && [state.nodes.n1.online, state.nodes.n1.since], [false, minute(0)]);
	});

	it(`ignores a single failed check and flips after ${FLIP_CHECKS} in a row`, () => {
		const blip = run([up(), up(false), up()]);
		assert.deepEqual(blip.events.flat(), []);
		assert.equal(blip.state?.nodes.n1?.since, minute(0));

		const outage = run([up(), up(false), up(false)]);
		assert.deepEqual(outage.events[2], [{ target: 'node', name: 'Node 1', online: false, previousSince: minute(0), since: minute(1) }]);
	});

	it('reports recovery with when the outage began', () => {
		const { events, state } = run([up(), up(false), up(false), up(), up()]);
		assert.deepEqual(events[4], [{ target: 'node', name: 'Node 1', online: true, previousSince: minute(1), since: minute(3) }]);
		assert.equal(state?.nodes.n1?.since, minute(3));
	});

	it('keeps node memory while the panel is down and alerts on the panel instead', () => {
		const { events, state } = run([up(), PANEL_DOWN, PANEL_DOWN]);
		assert.deepEqual(
			events[2]?.map((event) => [event.target, event.online]),
			[['panel', false]],
		);
		assert.equal(state?.nodes.n1?.online, true);
	});

	it('does not change anything for checks that could not tell', () => {
		const { events, state } = run([up(), up(null), up(null), { panelOnline: null, nodes: null }]);
		assert.deepEqual(events.flat(), []);
		assert.equal(state?.panel?.online, true);
		assert.equal(state?.nodes.n1?.online, true);
	});

	it('forgets nodes the panel no longer lists', () => {
		const { state } = run([up(), { panelOnline: true, nodes: [] }]);
		assert.deepEqual(state?.nodes, {});
	});
});
