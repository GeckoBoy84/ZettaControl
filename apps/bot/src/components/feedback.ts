import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
} from 'discord.js';
import { brand } from '../brand.ts';
import { emit, hasHook, type FeedbackKind } from '../hooks.ts';
import { customId, type ComponentHandler } from '../interactions.ts';
import { embed, UserFacingError } from '../lib/replies.ts';

export const FEEDBACK_PREFIX = 'feedback';

const KINDS: Record<FeedbackKind, string> = {
	bug: 'Something is broken',
	idea: 'An idea or feature request',
	question: 'A question',
	other: 'Something else',
};
const COOLDOWN_MS = 2 * 60_000;
const lastSent = new Map<string, number>();

/** Opens the feedback form, or points to the support server when this build has nowhere to send it. */
export async function openFeedback(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
	if (!hasHook('onFeedback')) {
		await interaction.reply({
			flags: MessageFlags.Ephemeral,
			embeds: [embed().setDescription('Tell us in the support server, or open an issue on GitHub.')],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder().setURL(brand.support).setLabel('Support').setStyle(ButtonStyle.Link),
					new ButtonBuilder().setURL(`${brand.source}/issues`).setLabel('GitHub issues').setStyle(ButtonStyle.Link),
				),
			],
		});
		return;
	}

	await interaction.showModal(
		new ModalBuilder()
			.setCustomId(customId(FEEDBACK_PREFIX, 'submit'))
			.setTitle(`Feedback for ${brand.name}`)
			.addLabelComponents(
				new LabelBuilder()
					.setLabel('What is it about?')
					.setStringSelectMenuComponent(
						new StringSelectMenuBuilder()
							.setCustomId('kind')
							.addOptions(Object.entries(KINDS).map(([value, label]) => ({ label, value, default: value === 'idea' }))),
					),
				new LabelBuilder()
					.setLabel('Your feedback')
					.setDescription('The team reads every message. Do not include API keys or passwords.')
					.setTextInputComponent(
						new TextInputBuilder().setCustomId('message').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1_500).setRequired(true),
					),
			),
	);
}

export const feedbackHandler: ComponentHandler = {
	prefix: FEEDBACK_PREFIX,

	async handle(interaction, [action]) {
		if (action !== 'submit' || !interaction.isModalSubmit()) return;

		const last = lastSent.get(interaction.user.id) ?? 0;
		if (Date.now() - last < COOLDOWN_MS) {
			throw new UserFacingError(`Thanks, we got your last message. You can send more <t:${Math.ceil((last + COOLDOWN_MS) / 1000)}:R>.`);
		}
		lastSent.set(interaction.user.id, Date.now());

		const picked = interaction.fields.getStringSelectValues('kind')[0];
		emit('onFeedback', {
			kind: picked && picked in KINDS ? (picked as FeedbackKind) : 'other',
			message: interaction.fields.getTextInputValue('message').trim(),
			userId: interaction.user.id,
			userTag: interaction.user.tag,
			guildId: interaction.guildId,
		});
		await interaction.reply({
			flags: MessageFlags.Ephemeral,
			embeds: [embed().setDescription(`Thanks! Your feedback went straight to the ${brand.name} team. For anything urgent, ask in the [support server](${brand.support}).`)],
		});
	},
};
