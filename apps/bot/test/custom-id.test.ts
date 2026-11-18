import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { customId, fitsCustomId, packArg, unpackArg } from '../src/interactions.ts';

const UUID = '9b8d2caa-881d-4238-9862-a32c4b11d1bb';

describe('custom IDs', () => {
	it('packs UUIDs to 23 characters and back', () => {
		const packed = packArg(UUID);
		assert.equal(packed.length, 23);
		assert.ok(packed.startsWith('~'));
		assert.equal(unpackArg(packed), UUID);
	});

	it('leaves everything else alone', () => {
		for (const arg of ['abc123', 'start', '42', '', '~short']) {
			assert.equal(packArg(arg), arg);
			assert.equal(unpackArg(arg), arg);
		}
	});

	it('fits a panel, a server and an item in one ID', () => {
		const id = customId('bk', 'restoreyes', UUID, UUID, UUID);
		assert.ok(id.length <= 100);
		assert.deepEqual(id.split(':').slice(2).map(unpackArg), [UUID, UUID, UUID]);
	});

	it('reports IDs that would be too long', () => {
		assert.equal(fitsCustomId('st', 'save', UUID, UUID, 'A'.repeat(60)), false);
		assert.throws(() => customId('st', 'save', UUID, UUID, 'A'.repeat(60)));
	});
});
