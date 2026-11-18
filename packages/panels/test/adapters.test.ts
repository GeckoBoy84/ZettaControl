import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { CalagopusClient, detectPanel, normalisePanelUrl, PanelError, Pterodactyl1Client } from '../src/index.ts';

type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown };

function mockFetch(route: Route) {
	return mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit = {}) => {
		const { status = 200, body } = route(new URL(input), init);
		return new Response(body === undefined ? '' : JSON.stringify(body), { status });
	});
}

afterEach(() => mock.restoreAll());

describe('normalisePanelUrl', () => {
	it('strips trailing slashes and pasted API paths', () => {
		assert.equal(normalisePanelUrl('https://panel.example.com/'), 'https://panel.example.com');
		assert.equal(normalisePanelUrl(' https://panel.example.com/api/client '), 'https://panel.example.com');
		assert.equal(normalisePanelUrl('https://example.com/panel/'), 'https://example.com/panel');
	});

	it('rejects non http URLs', () => {
		assert.throws(() => normalisePanelUrl('ftp://example.com'), PanelError);
		assert.throws(() => normalisePanelUrl('not a url'), PanelError);
	});
});

describe('Pterodactyl1Client', () => {
	it('maps the fractal server list and sends bearer auth', async () => {
		const fetchMock = mockFetch((url, init) => {
			assert.equal(url.pathname, '/api/client');
			assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer ptlc_test');
			return {
				body: {
					object: 'list',
					data: [
						{
							object: 'server',
							attributes: {
								server_owner: true,
								identifier: 'abc123',
								uuid: 'abc123-uuid',
								name: 'SMP',
								node: 'Node 1',
								description: '',
								limits: { memory: 4096, disk: 10240, cpu: 200 },
								is_suspended: false,
								is_installing: false,
								is_transferring: false,
								status: null,
							},
						},
					],
					meta: { pagination: { total: 1, count: 1, per_page: 100, current_page: 1, total_pages: 1 } },
				},
			};
		});

		const servers = await new Pterodactyl1Client({ url: 'https://panel.test', apiKey: 'ptlc_test' }).listServers();
		assert.equal(fetchMock.mock.callCount(), 1);
		assert.deepEqual(servers[0], {
			id: 'abc123',
			shortId: 'abc123',
			name: 'SMP',
			description: null,
			node: 'Node 1',
			limits: { memoryMib: 4096, diskMib: 10240, cpuPercent: 200 },
			suspended: false,
			status: null,
			isOwner: true,
		});
	});

	it('turns error bodies into PanelError', async () => {
		mockFetch(() => ({ status: 403, body: { errors: [{ code: 'Forbidden', status: '403', detail: 'Nope.' }] } }));
		await assert.rejects(new Pterodactyl1Client({ url: 'https://panel.test', apiKey: 'x' }).power('abc', 'start'), (error: unknown) => {
			assert.ok(error instanceof PanelError);
			assert.equal(error.code, 'forbidden');
			assert.deepEqual(error.details, ['Nope.']);
			return true;
		});
	});
});

describe('CalagopusClient', () => {
	it('sends power actions in its own body shape', async () => {
		let sent: unknown;
		mockFetch((url, init) => {
			assert.equal(url.pathname, '/api/client/servers/uuid-1/power');
			sent = JSON.parse(String(init.body));
			return { body: {} };
		});
		await new CalagopusClient({ url: 'https://panel.test', apiKey: 'k' }).power('uuid-1', 'restart');
		assert.deepEqual(sent, { action: 'restart' });
	});

	it('maps resources', async () => {
		mockFetch(() => ({
			body: {
				resources: {
					state: 'running',
					cpu_absolute: 12.5,
					memory_bytes: 1024,
					memory_limit_bytes: 2048,
					disk_bytes: 4096,
					trash_bytes: 0,
					network: { rx_bytes: 1, rx_packets: 1, tx_bytes: 2, tx_packets: 1 },
					cpu_limit_absolute: 100,
					uptime: 60_000,
				},
			},
		}));
		const resources = await new CalagopusClient({ url: 'https://panel.test', apiKey: 'k' }).getResources('uuid-1');
		assert.equal(resources.state, 'running');
		assert.equal(resources.networkTxBytes, 2);
	});
});

describe('detectPanel', () => {
	it('detects Calagopus from the account shape', async () => {
		mockFetch(() => ({ body: { user: { uuid: 'u', username: 'koen', email: 'k@example.com', admin: false } } }));
		const detected = await detectPanel({ url: 'https://panel.test', apiKey: 'key' });
		assert.equal(detected.kind, 'calagopus');
		assert.equal(detected.account.username, 'koen');
	});

	it('tells Pterodactyl 1.x and 2.x apart by /api/admin', async () => {
		const account = { object: 'user', attributes: { id: 1, admin: false, username: 'koen', email: 'k@example.com' } };
		mockFetch((url) => (url.pathname === '/api/admin' ? { status: 404, body: { errors: [] } } : { body: account }));
		assert.equal((await detectPanel({ url: 'https://panel.test', apiKey: 'ptlc_x' })).kind, 'pterodactyl1');

		mock.restoreAll();
		mockFetch((url) => (url.pathname === '/api/admin' ? { status: 403, body: { errors: [] } } : { body: account }));
		assert.equal((await detectPanel({ url: 'https://panel.test', apiKey: 'ptlc_x' })).kind, 'pterodactyl2');
	});

	it('rejects application keys before calling the panel', async () => {
		const fetchMock = mockFetch(() => ({ body: {} }));
		await assert.rejects(detectPanel({ url: 'https://panel.test', apiKey: 'ptla_abc' }), PanelError);
		assert.equal(fetchMock.mock.callCount(), 0);
	});
});
