import { ActionRowBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { zettako } from '../brand.ts';
import { accessibleServers, resolveServer, serverChoiceName } from '../commands/shared.ts';
import { customId, type ComponentHandler } from '../interactions.ts';
import { resolveActor } from '../lib/access.ts';
import { serverRef } from '../lib/panels.ts';
import { embed, updateMessage } from '../lib/replies.ts';
import { renderLinkPrompt } from '../views/link-panel.ts';
import { renderServerView } from '../views/server.ts';
import { renderTutorialStep, TUTORIAL_PREFIX } from '../views/tutorial.ts';
import { openFeedback } from './feedback.ts';

export const tutorialHandler: ComponentHandler = {
	prefix: TUTORIAL_PREFIX,

	async handle(interaction, [action, arg = '']) {
		switch (action) {
			case 'step': {
				if (!interaction.isButton()) return;
				// attachments: [] drops the previous step's image before the new one is added.
				await interaction.update({ ...renderTutorialStep(Number(arg) || 0), attachments: [] });
				return;
			}

			case 'try': {
				if (!interaction.isButton()) return;
				if (arg === 'link') {
					await interaction.reply(renderLinkPrompt('user'));
				} else if (arg === 'feedback') {
					await openFeedback(interaction);
				} else if (arg === 'server') {
					await interaction.deferReply({ flags: MessageFlags.Ephemeral });
					const { servers, multiplePanels } = await accessibleServers(await resolveActor(interaction));
					if (servers.length === 0) {
						await interaction.editReply({
							embeds: [embed().setDescription(`No servers yet. Link a panel first with \`/panel add\`, or the **Try it** button on step 1.\n\nNeed a server? [Try ${zettako.name}](${zettako.affiliateUrl}).`)],
						});
						return;
					}
					await interaction.editReply({
						embeds: [embed().setDescription(`Pick a server. This opens the same view as \`/server view\`, with working buttons.${servers.length > 25 ? '\nShowing the first 25. `/server view` can search them all.' : ''}`)],
						components: [
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								new StringSelectMenuBuilder()
									.setCustomId(customId(TUTORIAL_PREFIX, 'pick'))
									.setPlaceholder('Choose a server')
									.addOptions(
										servers
											.map(({ panel, server }) => ({ label: serverChoiceName(panel, server, multiplePanels), value: serverRef(panel.id, server.id) }))
											.filter((option) => option.value.length <= 100)
											.slice(0, 25),
									),
							),
						],
					});
				}
				return;
			}

			case 'pick': {
				if (!interaction.isStringSelectMenu()) return;
				const ctx = await resolveServer(interaction, interaction.values[0] ?? '', 'view');
				await updateMessage(interaction, async () => {
					const [server, resources] = await Promise.all([ctx.client.getServer(ctx.serverId), ctx.client.getResources(ctx.serverId).catch(() => null)]);
					return renderServerView({ panel: ctx.panel, server, resources, level: ctx.level, capabilities: ctx.client.capabilities });
				});
				return;
			}
		}
	},
};
