// Users type in panel URLs, so without this check the public bot could be
// pointed at addresses on its own host network (SSRF). Self-hosters whose panel
// is on their LAN can turn this off with ALLOW_PRIVATE_PANEL_URLS=true.

import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { env } from '../env.ts';
import { UserFacingError } from './replies.ts';

const blocked = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['224.0.0.0', 4],
] as const) {
	blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
	['::', 128],
	['::1', 128],
	['fc00::', 7],
	['fe80::', 10],
	// No ::ffff:0:0/96 rule: BlockList matches every IPv4 address against it. IPv4-mapped
	// addresses are already checked against the IPv4 rules above.
] as const) {
	blocked.addSubnet(network, prefix, 'ipv6');
}

/**
 * Where a URL points. Also used for Wings addresses, which come from the panel rather
 * than the user but are just as able to point inside the bot's network.
 */
export async function checkUrl(url: string): Promise<'public' | 'private' | 'unresolved'> {
	if (env.ALLOW_PRIVATE_PANEL_URLS) return 'public';

	const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
	const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true }).catch(() => null);
	if (!addresses) return 'unresolved';
	return addresses.some(({ address, family }) => blocked.check(address, family === 6 ? 'ipv6' : 'ipv4')) ? 'private' : 'public';
}

export async function assertPublicUrl(url: string): Promise<void> {
	switch (await checkUrl(url)) {
		case 'unresolved':
			throw new UserFacingError(`Could not find **${new URL(url).hostname}**. Check the panel URL.`);
		case 'private':
			throw new UserFacingError('That panel URL points to a private or local address, which this bot cannot reach.');
	}
}
