import { ActionRowBuilder, type ButtonBuilder, type InteractionEditReplyOptions } from 'discord.js';
import { truncate } from '../lib/format.ts';
import { backButton, sectionEmbed, serverPageUrl, type ServerContext } from './sections.ts';

// Read only sections: network allocations and subusers. Changing them is left to the panel.

export async function renderNetwork(ctx: ServerContext): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, allocations] = await Promise.all([client.getServer(serverId), client.listAllocations(serverId)]);

	const lines = allocations
		.toSorted((a, b) => Number(b.primary) - Number(a.primary))
		.map((allocation) => {
			const address = `\`${allocation.alias ?? allocation.ip}:${allocation.port}\``;
			return [allocation.primary ? `⭐ ${address} (primary)` : address, allocation.notes ? `· ${allocation.notes}` : null].filter(Boolean).join(' ');
		});

	return {
		embeds: [
			sectionEmbed('network', panel, server).setDescription(
				truncate(lines.length ? `${lines.join('\n')}\n\nManage ports [in the panel](${serverPageUrl(panel, server, '/network')}).` : 'No allocations.', 4_096),
			),
		],
		components: [new ActionRowBuilder<ButtonBuilder>().addComponents(backButton(panel, serverId))],
	};
}

export async function renderSubusers(ctx: ServerContext): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, subusers] = await Promise.all([client.getServer(serverId), client.listSubusers(serverId)]);

	const lines = subusers.map((user) => `**${user.username}**${user.email ? ` · ${user.email}` : ''} · ${user.permissions.length} permissions`);
	return {
		embeds: [
			sectionEmbed('users', panel, server).setDescription(
				truncate(lines.length ? `${lines.join('\n')}\n\nAdd or remove users [in the panel](${serverPageUrl(panel, server, '/users')}).` : 'No subusers. Only the owner can use this server.', 4_096),
			),
		],
		components: [new ActionRowBuilder<ButtonBuilder>().addComponents(backButton(panel, serverId))],
	};
}
