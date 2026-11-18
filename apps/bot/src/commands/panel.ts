import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { eq } from 'drizzle-orm';
import { PANEL_KIND_LABELS } from '@zettako/panels';
import { brand, zettako } from '../brand.ts';
import { db } from '../db/client.ts';
import { panels } from '../db/schema.ts';
import { emit } from '../hooks.ts';
import { customId, type Command } from '../interactions.ts';
import { accessiblePanels, canManageGuildPanels, forgetClient, guildContext } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';
import { PANEL_LINK_PREFIX } from '../components/panel-link.ts';
import { managedPanelAutocomplete, managedPanels, slashCommand } from './shared.ts';

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
		)
		.addSubcommand((sub) =>
			sub
				.setName('access')
				.setDescription('Allow or disallow a role to use one of this server\'s panels')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addRoleOption((option) => option.setName('role').setDescription('Role to toggle').setRequired(true)),
		),

	async autocomplete(interaction) {
		const sub = interaction.options.getSubcommand();
		await managedPanelAutocomplete(interaction, sub === 'access' ? (panel) => panel.scope === 'guild' : undefined);
	},

	async execute(interaction) {
		switch (interaction.options.getSubcommand()) {
			case 'add': {
				const scope = (interaction.options.getString('for') ?? 'user') as 'user' | 'guild';
				if (scope === 'guild' && !canManageGuildPanels(interaction)) {
					throw new UserFacingError(
						guildContext(interaction)
							? 'You need the Manage Server permission to link a panel for this server.'
							: `Server panels need ${brand.name} added to the server. You can still link one for just yourself.`,
					);
				}

				const who = scope === 'guild' ? 'everyone you allow on this Discord server' : 'only you, in any server or DM';
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					embeds: [
						embed()
							.setTitle('Link a panel')
							.setDescription(
								[
									`This panel will be usable by ${who}.`,
									'',
									`**On ${zettako.name}?** Pick ${zettako.name} and paste an API key from [your account](${zettako.apiKeysUrl}). That is it.`,
									'',
									'**Another panel?** You will need its URL and a client API key (Account > API Keys). Admin or application keys will not work.',
									'',
									'Your key is encrypted before it is stored and is never shown again.',
								].join('\n'),
							),
					],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder().setCustomId(customId(PANEL_LINK_PREFIX, 'open', scope, 'zettako')).setLabel(zettako.name).setStyle(ButtonStyle.Primary),
							new ButtonBuilder().setCustomId(customId(PANEL_LINK_PREFIX, 'open', scope, 'custom')).setLabel('Another panel').setStyle(ButtonStyle.Secondary),
							new ButtonBuilder().setURL(zettako.affiliateUrl).setLabel(`Get a server on ${zettako.name}`).setStyle(ButtonStyle.Link),
						),
					],
				});
				return;
			}

			case 'list': {
				const rows = await accessiblePanels(interaction);
				if (rows.length === 0) {
					await interaction.reply({
						flags: MessageFlags.Ephemeral,
						embeds: [embed().setDescription(`No panels linked yet. Use \`/panel add\` to link one.\n\nNeed a server? [Try ${zettako.name}](${zettako.affiliateUrl}).`)],
					});
					return;
				}
				const lines = rows.map((panel) => {
					const owner = panel.scope === 'guild' ? 'this server' : 'personal';
					const roles = panel.scope === 'guild' && panel.allowedRoleIds.length > 0 ? ` · roles: ${panel.allowedRoleIds.map((id) => `<@&${id}>`).join(' ')}` : '';
					return `**${panel.name}** · ${PANEL_KIND_LABELS[panel.kind]} · ${owner}\n${panel.url} as \`${panel.panelUsername}\`${roles}`;
				});
				await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed().setTitle('Your panels').setDescription(lines.join('\n\n'))] });
				return;
			}

			case 'remove': {
				const panelId = interaction.options.getString('panel', true);
				const panel = (await managedPanels(interaction)).find((row) => row.id === panelId);
				if (!panel) throw new UserFacingError('Pick a panel from the list. You can only remove your own panels, or this server\'s with Manage Server.');

				await db.delete(panels).where(eq(panels.id, panel.id));
				forgetClient(panel.id);
				emit('onPanelUnlinked', { kind: panel.kind, scope: panel.scope });
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					embeds: [embed().setDescription(`Unlinked **${panel.name}** and deleted its stored key. You may also want to delete the key on the panel itself.`)],
				});
				return;
			}

			case 'access': {
				const panelId = interaction.options.getString('panel', true);
				const role = interaction.options.getRole('role', true);
				const panel = (await managedPanels(interaction)).find((row) => row.id === panelId && row.scope === 'guild');
				if (!panel) throw new UserFacingError('Pick one of this server\'s panels. You need Manage Server to change access.');

				const allowed = panel.allowedRoleIds.includes(role.id);
				const allowedRoleIds = allowed ? panel.allowedRoleIds.filter((id) => id !== role.id) : [...panel.allowedRoleIds, role.id];
				await db.update(panels).set({ allowedRoleIds, updatedAt: new Date() }).where(eq(panels.id, panel.id));
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					embeds: [
						embed().setDescription(
							allowed
								? `<@&${role.id}> can no longer use **${panel.name}**.`
								: `<@&${role.id}> can now use **${panel.name}**: view servers, power actions and console commands. Members with Manage Server always have access.`,
						),
					],
				});
				return;
			}
		}
	},
};
