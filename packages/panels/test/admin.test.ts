import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { CalagopusAdminClient, PanelError, PelicanAdminClient, pingWings, Pterodactyl1AdminClient, validateAdminKey } from '../src/index.ts';

type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown };

function mockFetch(route: Route) {
	return mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit = {}) => {
		const { status = 200, body } = route(new URL(input), init);
		return new Response(body === undefined ? '' : JSON.stringify(body), { status });
	});
}

function fractalList(data: unknown[], total = data.length) {
	return {
		object: 'list',
		data: data.map((attributes) => ({ object: 'item', attributes })),
		meta: { pagination: { total, count: data.length, per_page: 100, current_page: 1, total_pages: 1 } },
	};
}

afterEach(() => mock.restoreAll());

describe('Pterodactyl1AdminClient', () => {
	const client = () => new Pterodactyl1AdminClient({ url: 'https://panel.test', apiKey: 'ptla_test' });

	it('reads totals from the pagination meta, one item per request', async () => {
		const totals: Record<string, number> = { '/api/application/users': 120, '/api/application/servers': 52, '/api/application/nodes': 4 };
		mockFetch((url) => {
			assert.equal(url.searchParams.get('per_page'), '1');
			return { body: fractalList([{}], totals[url.pathname]) };
		});
		assert.deepEqual(await client().getTotals(), { users: 120, servers: 52, nodes: 4 });
	});

	it('maps nodes with their Wings address and allocated resources, sorted by name', async () => {
		mockFetch(() => ({
			body: fractalList([
				{ id: 2, name: 'b-node', description: '', fqdn: 'b.test', scheme: 'https', daemon_listen: 8080, maintenance_mode: true, memory: 4096, disk: 0, allocated_resources: { memory: 1024, disk: 10 } },
				{ id: 1, name: 'a-node', description: 'EU', fqdn: 'a.test', scheme: 'http', daemon_listen: 443, maintenance_mode: false, memory: 8192, disk: 100 },
			]),
		}));
		const nodes = await client().listNodes();
		assert.deepEqual(
			nodes.map((node) => [node.id, node.wingsUrl, node.maintenance, node.allocated]),
			[
				['1', 'http://a.test:443', false, null],
				['2', 'https://b.test:8080', true, { memoryMib: 1024, diskMib: 10 }],
			],
		);
	});

	it('lists servers with owner and node names and treats a suspended status as suspended', async () => {
		mockFetch((url) => {
			assert.equal(url.searchParams.get('include'), 'user,node');
			assert.equal(url.searchParams.get('filter[name]'), 'smp');
			return {
				body: fractalList(
					[
						{
							id: 7,
							identifier: 'abc123',
							name: 'SMP',
							description: null,
							status: 'suspended',
							suspended: false,
							limits: { memory: 2048, disk: 0, cpu: 100 },
							created_at: '2026-01-01T00:00:00+00:00',
							relationships: { user: { object: 'user', attributes: { username: 'steve' } }, node: { object: 'node', attributes: { name: 'a-node' } } },
						},
					],
					31,
				),
			};
		});
		const { items, total } = await client().listServers({ search: 'smp' });
		assert.equal(total, 31);
		assert.deepEqual(items[0] && [items[0].id, items[0].owner, items[0].node, items[0].suspended, items[0].status], ['7', 'steve', 'a-node', true, null]);
	});

	it('suspends with the dedicated endpoint and cannot suspend users', async () => {
		const fetchMock = mockFetch(() => ({ body: undefined }));
		await client().setServerSuspended('7', false);
		const [input, init] = fetchMock.mock.calls[0]?.arguments ?? [];
		assert.equal(new URL(input as string).pathname, '/api/application/servers/7/unsuspend');
		assert.equal(init?.method, 'POST');
		await assert.rejects(client().setUserSuspended('1', true), (error: unknown) => error instanceof PanelError && error.code === 'unsupported');
	});
});

describe('PelicanAdminClient', () => {
	it('connects to Wings on daemon_connect and reads the new 2fa field', async () => {
		mockFetch((url) =>
			url.pathname === '/api/application/nodes'
				? { body: fractalList([{ id: 1, name: 'n', description: null, fqdn: 'n.test', scheme: 'https', daemon_listen: 8080, daemon_connect: 443, maintenance_mode: false, memory: 0, disk: 0 }]) }
				: { body: { object: 'user', attributes: { id: 3, username: 'alex', email: 'a@test', root_admin: true, '2fa_enabled': true, created_at: null } } },
		);
		const client = new PelicanAdminClient({ url: 'https://panel.test', apiKey: 'papp_test' });
		assert.equal((await client.listNodes())[0]?.wingsUrl, 'https://n.test:443');
		assert.equal((await client.getUser('3')).twoFactor, true);
	});
});

describe('CalagopusAdminClient', () => {
	const client = () => new CalagopusAdminClient({ url: 'https://panel.test', apiKey: 'key' });

	it('reads node usage from the overview and stats endpoints', async () => {
		mockFetch((url) => {
			if (url.pathname === '/api/admin/nodes/n1/system/overview') return { body: { version: '1.4.0', servers: { total: 6, online: 4, offline: 2 } } };
			if (url.pathname === '/api/admin/nodes/n1/system/stats') {
				return { body: { stats: { cpu: { used: 12.5, threads: 8 }, memory: { used: 10, total: 20 }, disk: { used: 30, total: 40 } } } };
			}
			throw new Error(`Unexpected ${url.pathname}`);
		});
		assert.deepEqual(await client().getNodeStats('n1'), {
			version: '1.4.0',
			cpuPercent: 12.5,
			cpuThreads: 8,
			memoryUsedBytes: 10,
			memoryTotalBytes: 20,
			diskUsedBytes: 30,
			diskTotalBytes: 40,
			servers: { total: 6, online: 4 },
		});
	});

	it('suspends users with a PATCH', async () => {
		const fetchMock = mockFetch(() => ({ body: {} }));
		await client().setUserSuspended('u1', true);
		const [, init] = fetchMock.mock.calls[0]?.arguments ?? [];
		assert.equal(init?.method, 'PATCH');
		assert.equal(init?.body, JSON.stringify({ suspended: true }));
	});
});

describe('validateAdminKey', () => {
	it('rejects client keys for application APIs before calling the panel', async () => {
		const fetchMock = mockFetch(() => ({ body: {} }));
		await assert.rejects(validateAdminKey('pterodactyl1', { url: 'https://panel.test', apiKey: 'ptlc_client' }), PanelError);
		assert.equal(fetchMock.mock.callCount(), 0);
	});
});

describe('pingWings', () => {
	it('counts an unauthenticated 401 from Wings as online', async () => {
		mockFetch((url, init) => {
			assert.equal(url.href, 'https://node.test:8080/api/system');
			assert.equal((init.headers as Record<string, string>).Authorization, undefined);
			return { status: 401, body: { error: 'missing auth' } };
		});
		assert.equal((await pingWings('https://node.test:8080')).online, true);
	});

	it('counts a proxy error as offline', async () => {
		mockFetch(() => ({ status: 502, body: undefined }));
		assert.deepEqual(await pingWings('https://node.test:8080'), { online: false, latencyMs: null });
	});

	it('counts a self-signed certificate as reachable and a refused connection as offline', async () => {
		const failWith = (code: string) =>
			mock.method(globalThis, 'fetch', async () => {
				throw new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });
			});
		failWith('DEPTH_ZERO_SELF_SIGNED_CERT');
		assert.equal((await pingWings('https://node.test:8080')).online, true);
		mock.restoreAll();
		failWith('ECONNREFUSED');
		assert.equal((await pingWings('https://node.test:8080')).online, false);
	});
});
