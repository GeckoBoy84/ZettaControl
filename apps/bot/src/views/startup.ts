import { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, type InteractionEditReplyOptions } from 'discord.js';
import type { StartupVariable } from '@zettako/panels';
import { customId, fitsCustomId } from '../interactions.ts';
import { truncate } from '../lib/format.ts';
import { backButton, sectionEmbed, type ServerContext } from './sections.ts';

export const STARTUP_PREFIX = 'st';

export function shownValue(variable: StartupVariable): string {
	if (variable.secret) return '*hidden*';
	return variable.value ? `\`${truncate(variable.value.replaceAll('`', "'"), 200)}\`` : '*empty*';
}

export async function renderStartup(ctx: ServerContext, notice?: string): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, variables] = await Promise.all([client.getServer(serverId), client.listStartupVariables(serverId)]);

	const lines = variables.map((variable) => `**${variable.name}**${variable.editable ? '' : ' 🔒'}\n\`${variable.key}\` = ${shownValue(variable)}`);
	const view = sectionEmbed('startup', panel, server).setDescription(
		truncate([notice, lines.length ? lines.join('\n') : 'This server has no startup variables.'].filter(Boolean).join('\n\n'), 4_096),
	);

	const editable = variables.filter((variable) => variable.editable && fitsCustomId(STARTUP_PREFIX, 'save', panel.id, serverId, variable.key));
	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
	if (editable.length > 0) {
		components.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(customId(STARTUP_PREFIX, 'edit', panel.id, serverId))
					.setPlaceholder('Change a variable')
					.addOptions(editable.slice(0, 25).map((variable) => ({ label: truncate(variable.name, 100), description: truncate(variable.key, 100), value: variable.key }))),
			),
		);
	}
	components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(backButton(panel, serverId)));
	return { embeds: [view], components };
}
