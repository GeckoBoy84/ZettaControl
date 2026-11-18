import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { brand, zettako } from '../brand.ts';
import type { Command } from '../interactions.ts';
import { embed } from '../lib/replies.ts';
import { slashCommand } from './shared.ts';

export const aboutCommand: Command = {
	data: slashCommand('about', `About ${brand.name}`),

	async execute(interaction) {
		const client = interaction.client;
		await interaction.reply({
			flags: MessageFlags.Ephemeral,
			embeds: [
				embed()
					.setTitle(brand.name)
					.setThumbnail(client.user.displayAvatarURL())
					.setDescription(
						[
							'Control your game servers from Discord. Works with Calagopus, Pterodactyl 1.x and 2.x, and Pelican.',
							'',
							`Built and hosted by **[${zettako.name}](${zettako.website})**. Open source under AGPL-3.0.`,
							'',
							`Want your own copy? It runs on the smallest ${zettako.name} bot plan, free Postgres included.`,
						].join('\n'),
					)
					.addFields(
						{ name: 'Servers', value: String(client.guilds.cache.size), inline: true },
						{ name: 'Online since', value: `<t:${Math.floor((Date.now() - (client.uptime ?? 0)) / 1000)}:R>`, inline: true },
					),
			],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder().setURL(brand.website).setLabel('Website').setStyle(ButtonStyle.Link),
					new ButtonBuilder().setURL(brand.support).setLabel('Support').setStyle(ButtonStyle.Link),
					new ButtonBuilder().setURL(brand.source).setLabel('Source').setStyle(ButtonStyle.Link),
					new ButtonBuilder().setURL(zettako.affiliateUrl).setLabel(`Host it on ${zettako.name}`).setStyle(ButtonStyle.Link),
				),
			],
		});
	},
};
