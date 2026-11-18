import { MessageFlags } from 'discord.js';
import { eq } from 'drizzle-orm';
import { PANEL_KIND_LABELS } from '@zettako/panels';
import { brand, zettako } from '../brand.ts';
import { db } from '../db/client.ts';
import { panels } from '../db/schema.ts';
import { emit } from '../hooks.ts';
import type { Command } from '../interactions.ts';
import { ACCESS_LEVEL_LABELS, accessiblePanels, managedPanels, resolveActor } from '../lib/access.ts';
import { forgetClient } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';
import { renderLinkPrompt } from '../views/link-panel.ts';
import { managedPanelAutocomplete, slashCommand } from './shared.ts';

export const panelCommand: Command = {
	data: slashCommand('panel', 'Link and manage your panels')
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Link a Zettako, Calagopus, Pterodactyl or Pelican panel')
				.addStringOption((option) =>
					option
						.setName('for')
						.setDescription('Who can use it (default: just you)')
						.addChoices({ name: 'Just me, everywhere including DMs', value: 'user' }, { name: 'This Discord server', value: 'guild' }),
				),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('Panels you can use here'))
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Unlink a panel and delete its stored API key')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true)),
		),

	async autocomplete(interaction) {
		await managedPanelAutocomplete(interaction);
	},

	async execute(interaction) {
		const actor = await resolveActor(interaction);
		switch (interaction.options.getSubcommand()) {
			case 'add': {
				const scope = (interaction.options.getString('for') ?? 'user') as 'user' | 'guild';
				if (scope === 'guild' && !actor.isManager) {
					throw new UserFacingError(
						actor.guildId
							? 'Only panel managers can link a panel for this server: members with Manage Server, or a manager role set with `/access managers`.'
							: `Server panels need ${brand.name} added to the server. You can still link one for just yourself.`,
					);
				}

				await interaction.reply(renderLinkPrompt(scope));
				return;
			}

			case 'list': {
				const rows = await accessiblePanels(actor);
				if (rows.length === 0) {
					await interaction.reply({
						flags: MessageFlags.Ephemeral,
						embeds: [embed().setDescription(`No panels linked yet. Use \`/panel add\` to link one.\n\nNeed a server? [Try ${zettako.name}](${zettako.affiliateUrl}).`)],
					});
					return;
				}
				const lines = rows.map(({ panel, all, servers }) => {
					const owner = panel.scope === 'guild' ? 'this server' : 'personal';
					const yours = all ? ACCESS_LEVEL_LABELS[all] : `${servers.size} server${servers.size === 1 ? '' : 's'}`;
					return `**${panel.name}** · ${PANEL_KIND_LABELS[panel.kind]} · ${owner} · your access: ${yours}\n${panel.url} as \`${panel.panelUsername}\``;
				});
				await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed().setTitle('Your panels').setDescription(lines.join('\n\n'))] });
				return;
			}

			case 'remove': {
				const panelId = interaction.options.getString('panel', true);
				const panel = (await managedPanels(actor)).find((row) => row.id === panelId);
				if (!panel) throw new UserFacingError('Pick a panel from the list. You can only remove your own panels, or this server\'s if you are a panel manager.');

				await db.delete(panels).where(eq(panels.id, panel.id));
				forgetClient(panel.id);
				emit('onPanelUnlinked', { kind: panel.kind, scope: panel.scope });
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					embeds: [embed().setDescription(`Unlinked **${panel.name}** and deleted its stored key and role access. You may also want to delete the key on the panel itself.`)],
				});
				return;
			}
		}
	},
};
