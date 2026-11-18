import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type InteractionReplyOptions } from 'discord.js';
import { zettako } from '../brand.ts';
import { PANEL_LINK_PREFIX } from '../components/panel-link.ts';
import { customId } from '../interactions.ts';
import { embed } from '../lib/replies.ts';

/** The first step of linking a panel, shared by `/panel add` and the tutorial. */
export function renderLinkPrompt(scope: 'user' | 'guild'): InteractionReplyOptions & { flags: MessageFlags.Ephemeral } {
	const who = scope === 'guild' ? 'panel managers, and the roles you grant with `/access grant`' : 'only you, in any server or DM';
	return {
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
	};
}
