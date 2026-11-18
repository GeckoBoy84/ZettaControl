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

describe('panel depth', () => {
	it('reads and writes files as plain text on Calagopus', async () => {
		let written: { type: string | undefined; body: unknown } | null = null;
		mockFetch((url, init) => {
			if (url.pathname.endsWith('/files/contents')) {
				assert.equal(url.searchParams.get('file'), '/server.properties');
				return { body: 'motd=hello' };
			}
			written = { type: (init.headers as Record<string, string>)['Content-Type'], body: init.body };
			return { body: {} };
		});
		const client = new CalagopusClient({ url: 'https://panel.test', apiKey: 'k' });
		// The mock JSON encodes bodies, so the text comes back quoted.
		assert.equal(await client.readFile('uuid-1', '/server.properties'), '"motd=hello"');
		await client.writeFile('uuid-1', '/server.properties', 'motd=bye');
		assert.deepEqual(written, { type: 'text/plain', body: 'motd=bye' });
	});

	it('walks Calagopus pages for file lists', async () => {
		mockFetch((url) => {
			const page = Number(url.searchParams.get('page'));
			const entry = { name: `f${page}`, directory: page === 1, size: 10, modified: null };
			return { body: { entries: { total: 101, per_page: 100, page, data: [entry] } } };
		});
		const files = await new CalagopusClient({ url: 'https://panel.test', apiKey: 'k' }).listFiles('uuid-1', '/');
		assert.deepEqual(
			files.map((file) => [file.name, file.directory]),
			[
				['f1', true],
				['f2', false],
			],
		);
	});

	it('maps Pterodactyl backups and execute schedules', async () => {
		const calls: string[] = [];
		mockFetch((url, init) => {
			calls.push(`${init.method} ${url.pathname}`);
			if (url.pathname.endsWith('/backups')) {
				return {
					body: {
						object: 'list',
						data: [
							{
								object: 'backup',
								attributes: { uuid: 'b1', name: 'Nightly', is_successful: true, is_locked: false, bytes: 2048, created_at: 'x', completed_at: 'y' },
							},
						],
					},
				};
			}
			return { body: undefined };
		});
		const client = new Pterodactyl1Client({ url: 'https://panel.test', apiKey: 'k' });
		assert.deepEqual(await client.listBackups('abc'), [
			{ id: 'b1', name: 'Nightly', bytes: 2048, successful: true, locked: false, createdAt: 'x', completedAt: 'y' },
		]);
		await client.runSchedule('abc', '7');
		assert.deepEqual(calls, ['GET /api/client/servers/abc/backups', 'POST /api/client/servers/abc/schedules/7/execute']);
	});

	it('marks crash logs unsupported outside Calagopus', async () => {
		const client = new Pterodactyl1Client({ url: 'https://panel.test', apiKey: 'k' });
		assert.equal(client.capabilities.crashLogs, false);
		await assert.rejects(client.listCrashes('abc'), (error: unknown) => error instanceof PanelError && error.code === 'unsupported');
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
