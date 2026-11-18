import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PanelRow, RoleGrantRow } from '../src/db/schema.ts';
import { atLeast, computeAccess, levelFor, type Actor } from '../src/lib/access-rules.ts';

const GUILD = 'guild-1';

function panel(overrides: Partial<PanelRow> = {}): PanelRow {
	return {
		id: 'panel-1',
		scope: 'guild',
		ownerId: GUILD,
		name: 'Main',
		kind: 'calagopus',
		url: 'https://panel.test',
		apiKeyEncrypted: 'x',
		adminKeyEncrypted: null,
		panelUsername: 'koen',
		createdBy: 'user-1',
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function actor(overrides: Partial<Actor> = {}): Actor {
	return { userId: 'user-2', guildId: GUILD, roleIds: [], hasManageServer: false, isManager: false, ...overrides };
}

function grant(roleId: string, level: RoleGrantRow['level'], serverId = '*'): RoleGrantRow {
	return { id: `${roleId}-${serverId}`, panelId: 'panel-1', roleId, serverId, serverName: null, level, createdBy: 'user-1', createdAt: new Date() };
}

describe('computeAccess', () => {
	it('gives personal panels to their owner only', () => {
		const own = panel({ scope: 'user', ownerId: 'user-2' });
		assert.equal(computeAccess(actor(), own, [])?.all, 'full');
		assert.equal(computeAccess(actor({ userId: 'someone-else' }), own, []), null);
	});

	it('gives managers full access to their guild panels only', () => {
		assert.equal(computeAccess(actor({ isManager: true }), panel(), [])?.all, 'full');
		assert.equal(computeAccess(actor({ isManager: true, guildId: 'other-guild' }), panel(), []), null);
	});

	it('denies members without a matching grant', () => {
		assert.equal(computeAccess(actor({ roleIds: ['role-a'] }), panel(), [grant('role-b', 'full')]), null);
	});

	it('uses the highest level across roles', () => {
		const access = computeAccess(actor({ roleIds: ['role-a', 'role-b'] }), panel(), [grant('role-a', 'view'), grant('role-b', 'power')]);
		assert.equal(access?.all, 'power');
	});

	it('limits server grants to that server, and lets them raise a panel wide level', () => {
		const access = computeAccess(actor({ roleIds: ['role-a', 'role-b'] }), panel(), [grant('role-a', 'view'), grant('role-b', 'full', 'smp')]);
		assert.ok(access);
		assert.equal(levelFor(access, 'smp'), 'full');
		assert.equal(levelFor(access, 'creative'), 'view');
	});

	it('gives no access to other servers when only one server is granted', () => {
		const access = computeAccess(actor({ roleIds: ['role-a'] }), panel(), [grant('role-a', 'power', 'smp')]);
		assert.ok(access);
		assert.equal(access.all, null);
		assert.equal(levelFor(access, 'smp'), 'power');
		assert.equal(levelFor(access, 'creative'), null);
	});

	it('ignores grants from other panels', () => {
		const other = { ...grant('role-a', 'full'), panelId: 'panel-2' };
		assert.equal(computeAccess(actor({ roleIds: ['role-a'] }), panel(), [other]), null);
	});

	it('ignores guild panels when the bot is not installed in this guild', () => {
		assert.equal(computeAccess(actor({ guildId: null, roleIds: ['role-a'] }), panel(), [grant('role-a', 'full')]), null);
	});
});

describe('atLeast', () => {
	it('orders view < power < full', () => {
		assert.ok(atLeast('full', 'power'));
		assert.ok(atLeast('power', 'power'));
		assert.ok(!atLeast('view', 'power'));
		assert.ok(!atLeast(null, 'view'));
	});
});
