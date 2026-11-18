import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ServerResources } from '@zettako/panels';
import { evaluate, HOT_TICKS, type Observation, type RuleSettings, type ServerMemory } from '../src/lib/alert-state.ts';
import { chunkLines, cleanConsoleLine } from '../src/lib/console-text.ts';

describe('cleanConsoleLine', () => {
	it('strips colours', () => {
		assert.equal(cleanConsoleLine('4 \u001b[33m\u001b[1mmoderate\u001b[22m\u001b[39m severity'), '4 moderate severity');
	});

	it('keeps only what is left after a spinner redraws the line', () => {
		assert.equal(cleanConsoleLine('\\\u001b[1G\u001b[0K15 packages are looking for funding'), '15 packages are looking for funding');
		assert.equal(cleanConsoleLine('\\\u001b[1G\u001b[0K|\u001b[1G\u001b[0K/\u001b[1G\u001b[0K'), null);
		assert.equal(cleanConsoleLine('50%\r100%'), '100%');
	});

	it('keeps deliberate empty lines', () => {
		assert.equal(cleanConsoleLine(''), '');
	});
});

describe('chunkLines', () => {
	it('packs lines under the limit and keeps the newest chunks', () => {
		const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`.padEnd(20, '.'));
		const { chunks, skipped } = chunkLines(lines, 50, 2);
		assert.ok(chunks.every((chunk) => chunk.length <= 50));
		assert.equal(chunks.length, 2);
		assert.ok(chunks.at(-1)?.includes('line 9'));
		assert.equal(skipped, 6);
	});

	it('breaks code fences so they cannot end the block', () => {
		const { chunks } = chunkLines(['say ```hi```'], 100, 1);
		assert.ok(!chunks[0]?.includes('```'));
	});
});

function resources(overrides: Partial<ServerResources> = {}): ServerResources {
	return { state: 'running', cpuPercent: 10, memoryBytes: 100 * 1024 * 1024, diskBytes: 0, networkRxBytes: 0, networkTxBytes: 0, uptimeMs: 1, ...overrides };
}

function observe(overrides: Partial<ServerResources> = {}, latestCrash: Observation['latestCrash'] = null): Observation {
	return { resources: resources(overrides), limits: { memoryMib: 1024, diskMib: 0, cpuPercent: 100 }, latestCrash };
}

const ALL: RuleSettings = { events: ['offline', 'crash', 'resources'], threshold: 90 };

function run(observations: Observation[], rule = ALL) {
	let memory: ServerMemory | undefined;
	return observations.map((observation) => {
		const result = evaluate(memory, observation, rule);
		memory = result.next;
		return result.alerts.map((alert) => alert.kind);
	});
}

describe('alert evaluation', () => {
	it('treats the first sighting as a baseline', () => {
		assert.deepEqual(run([observe({ state: 'offline' })]), [[]]);
	});

	it('alerts when a running server goes offline, then when it is back', () => {
		assert.deepEqual(run([observe(), observe({ state: 'offline' }), observe({ state: 'starting' }), observe()]), [[], ['offline'], [], ['online']]);
	});

	it('prefers a crash over offline when the crash log has a new entry', () => {
		const crash = { id: 'c2', at: 'x', exitCode: 1, outOfMemory: false };
		const old = { ...crash, id: 'c1' };
		assert.deepEqual(run([observe({}, old), observe({ state: 'offline' }, crash), observe({}, crash)]), [[], ['crash'], ['online']]);
	});

	it('catches crashes the server already restarted from', () => {
		const old = { id: 'c1', at: 'x', exitCode: 1, outOfMemory: false };
		assert.deepEqual(run([observe({}, old), observe({}, { ...old, id: 'c2' })]), [[], ['crash']]);
	});

	it('needs sustained high usage and fires once until it calms down', () => {
		const hot = observe({ cpuPercent: 95 });
		const calm = observe({ cpuPercent: 10 });
		const results = run([calm, ...Array.from({ length: HOT_TICKS + 2 }, () => hot), calm, hot, hot]);
		assert.equal(results.flat().filter((kind) => kind === 'resources').length, 2);
		assert.deepEqual(results[HOT_TICKS], ['resources']);
	});

	it('ignores events the rule did not ask for', () => {
		assert.deepEqual(run([observe(), observe({ state: 'offline' })], { events: ['resources'], threshold: 90 }), [[], []]);
	});

	it('stays quiet when the panel does not answer', () => {
		assert.deepEqual(run([observe(), { ...observe(), resources: null }, observe()]), [[], [], []]);
	});
});
