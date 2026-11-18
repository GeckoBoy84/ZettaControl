import { resolveServer } from '../commands/shared.ts';
import type { ComponentHandler } from '../interactions.ts';
import { serverRef } from '../lib/panels.ts';
import { updateMessage } from '../lib/replies.ts';
import { renderRunConfirm, renderSchedules, SCHEDULES_PREFIX } from '../views/schedules.ts';
import { requireSection } from '../views/sections.ts';

export const schedulesHandler: ComponentHandler = {
	prefix: SCHEDULES_PREFIX,

	async handle(interaction, [action = '', panelId = '', serverId = '', scheduleId = '']) {
		const needed = action === 'list' ? 'view' : 'power';
		const ctx = await resolveServer(interaction, serverRef(panelId, serverId), needed);
		requireSection(ctx, 'schedules', needed);

		switch (action) {
			case 'list':
				await updateMessage(interaction, () => renderSchedules(ctx));
				return;

			case 'pick': {
				if (!interaction.isStringSelectMenu()) return;
				const picked = interaction.values[0] ?? '';
				await updateMessage(interaction, () => renderRunConfirm(ctx, picked));
				return;
			}

			case 'run':
				await updateMessage(interaction, async () => {
					await ctx.client.runSchedule(serverId, scheduleId);
					return renderSchedules(ctx, `▶️ Schedule started by <@${interaction.user.id}>.`);
				});
				return;
		}
	},
};
