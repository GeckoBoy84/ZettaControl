import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type InteractionEditReplyOptions } from 'discord.js';
import type { Schedule } from '@zettako/panels';
import { customId } from '../interactions.ts';
import { atLeast } from '../lib/access.ts';
import { discordTime, truncate } from '../lib/format.ts';
import { UserFacingError } from '../lib/replies.ts';
import { backButton, sectionEmbed, type ServerContext } from './sections.ts';

export const SCHEDULES_PREFIX = 'sc';

function describe(schedule: Schedule): string {
	return [
		`${schedule.enabled ? '🟢' : '⚪'} **${schedule.name}**${schedule.enabled ? '' : ' (disabled)'}`,
		schedule.trigger ? `Runs: \`${schedule.trigger}\`` : null,
		`Last run: ${discordTime(schedule.lastRunAt)}${schedule.nextRunAt ? ` · next: ${discordTime(schedule.nextRunAt)}` : ''}`,
	]
		.filter(Boolean)
		.join('\n');
}

export async function renderSchedules(ctx: ServerContext, notice?: string): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId, level } = ctx;
	const [server, schedules] = await Promise.all([client.getServer(serverId), client.listSchedules(serverId)]);

	const view = sectionEmbed('schedules', panel, server).setDescription(
		truncate([notice, schedules.length ? schedules.map(describe).join('\n\n') : 'No schedules on this server.'].filter(Boolean).join('\n\n'), 4_096),
	);

	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
	// Running a schedule can do anything its steps do (commands, power, backups), so it needs Power.
	if (schedules.length > 0 && atLeast(level, 'power')) {
		components.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(customId(SCHEDULES_PREFIX, 'pick', panel.id, serverId))
					.setPlaceholder('Run a schedule now')
					.addOptions(schedules.slice(0, 25).map((schedule) => ({ label: truncate(schedule.name, 100), description: schedule.trigger ? truncate(schedule.trigger, 100) : undefined, value: schedule.id }))),
			),
		);
	}
	components.push(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(customId(SCHEDULES_PREFIX, 'list', panel.id, serverId)).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
			backButton(panel, serverId),
		),
	);
	return { embeds: [view], components };
}

export async function renderRunConfirm(ctx: ServerContext, scheduleId: string): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, schedules] = await Promise.all([client.getServer(serverId), client.listSchedules(serverId)]);
	const schedule = schedules.find((row) => row.id === scheduleId);
	if (!schedule) throw new UserFacingError('That schedule no longer exists.');

	return {
		embeds: [sectionEmbed('schedules', panel, server).setDescription(`${describe(schedule)}\n\nRun every step of this schedule now?`)],
		components: [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId(customId(SCHEDULES_PREFIX, 'run', panel.id, serverId, schedule.id)).setLabel('Run now').setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId(customId(SCHEDULES_PREFIX, 'list', panel.id, serverId)).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
			),
		],
	};
}
