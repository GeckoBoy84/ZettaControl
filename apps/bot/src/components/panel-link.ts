import {
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ModalSubmitInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import { detectPanel, normalisePanelUrl, PANEL_KIND_LABELS, PANEL_KINDS, type PanelKind } from '@zettako/panels';
import { brand, zettako } from '../brand.ts';
import { db } from '../db/client.ts';
import { panels } from '../db/schema.ts';
import { emit } from '../hooks.ts';
import { customId, type ComponentHandler } from '../interactions.ts';
import { encryptSecret } from '../lib/crypto.ts';
import { truncate } from '../lib/format.ts';
import { assertPublicUrl } from '../lib/network.ts';
import { canManageGuildPanels, guildContext } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';

export const PANEL_LINK_PREFIX = 'link';

const MAX_PANELS_PER_OWNER = 25;
const AUTO = 'auto';

type Scope = 'user' | 'guild';
type Preset = 'zettako' | 'custom';

function buildModal(scope: Scope, preset: Preset): ModalBuilder {
	const modal = new ModalBuilder()
		.setCustomId(customId(PANEL_LINK_PREFIX, 'submit', scope, preset))
		.setTitle(preset === 'zettako' ? `Link ${zettako.name}` : 'Link a panel');

	if (preset === 'custom') {
		modal.addLabelComponents(
			new LabelBuilder()
				.setLabel('Panel URL')
				.setTextInputComponent(new TextInputBuilder().setCustomId('url').setStyle(TextInputStyle.Short).setPlaceholder('https://panel.example.com').setRequired(true)),
		);
	}

	modal.addLabelComponents(
		new LabelBuilder()
			.setLabel('Client API key')
			.setDescription(preset === 'zettako' ? 'Zettako Panel > Account > API Keys' : 'Account > API Keys on your panel')
			.setTextInputComponent(new TextInputBuilder().setCustomId('key').setStyle(TextInputStyle.Short).setMinLength(16).setMaxLength(200).setRequired(true)),
		new LabelBuilder()
			.setLabel('Name')
			.setDescription('Shown when you pick servers. Optional.')
			.setTextInputComponent(
				new TextInputBuilder()
					.setCustomId('name')
					.setStyle(TextInputStyle.Short)
					.setMaxLength(32)
					.setRequired(false)
					.setPlaceholder(preset === 'zettako' ? zettako.name : 'My panel'),
			),
	);

	if (preset === 'custom') {
		modal.addLabelComponents(
			new LabelBuilder()
				.setLabel('Panel type')
				.setDescription('Leave on auto-detect unless detection gets it wrong.')
				.setStringSelectMenuComponent(
					new StringSelectMenuBuilder()
						.setCustomId('kind')
						.setRequired(false)
						.addOptions(
							{ label: 'Auto-detect', value: AUTO, default: true },
							...PANEL_KINDS.map((kind) => ({ label: PANEL_KIND_LABELS[kind], value: kind })),
						),
				),
		);
	}

	return modal;
}

async function submit(interaction: ModalSubmitInteraction, scope: Scope, preset: Preset): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const ownerId = scope === 'guild' ? guildContext(interaction) : interaction.user.id;
	if (!ownerId || (scope === 'guild' && !canManageGuildPanels(interaction))) {
		throw new UserFacingError('You need the Manage Server permission to link a panel for this server.');
	}

	const apiKey = interaction.fields.getTextInputValue('key').trim();
	const isZettako = preset === 'zettako';
	const url = isZettako ? zettako.panelUrl : normalisePanelUrl(interaction.fields.getTextInputValue('url'));
	const chosenKind = isZettako ? 'calagopus' : interaction.fields.getStringSelectValues('kind')[0];
	const kind = chosenKind && chosenKind !== AUTO ? (chosenKind as PanelKind) : undefined;
	const name = interaction.fields.getTextInputValue('name').trim() || (isZettako ? zettako.name : new URL(url).hostname);

	const [existing] = await db
		.select({ total: count() })
		.from(panels)
		.where(and(eq(panels.scope, scope), eq(panels.ownerId, ownerId)));
	if ((existing?.total ?? 0) >= MAX_PANELS_PER_OWNER) {
		throw new UserFacingError(`You can link up to ${MAX_PANELS_PER_OWNER} panels. Remove one with \`/panel remove\` first.`);
	}

	await assertPublicUrl(url);
	const detected = await detectPanel({ url, apiKey, userAgent: `${brand.name} (+${brand.source})` }, kind);
	const servers = await detected.client.listServers().catch(() => null);

	const id = randomUUID();
	const inserted = await db
		.insert(panels)
		.values({
			id,
			scope,
			ownerId,
			name,
			kind: detected.kind,
			url: detected.client.url,
			apiKeyEncrypted: encryptSecret(apiKey, id),
			panelUsername: detected.account.username,
			createdBy: interaction.user.id,
		})
		.onConflictDoNothing()
		.returning({ id: panels.id });
	if (inserted.length === 0) {
		throw new UserFacingError(`You already have a panel called **${truncate(name, 32)}**. Pick another name or remove the old one first.`);
	}

	emit('onPanelLinked', { kind: detected.kind, scope, isZettako });

	const serverLine = servers === null ? 'Could not list servers yet.' : `Found **${servers.length}** server${servers.length === 1 ? '' : 's'}.`;
	await interaction.editReply({
		embeds: [
			embed()
				.setTitle(`Linked ${name}`)
				.setDescription(
					[
						`${PANEL_KIND_LABELS[detected.kind]} at ${detected.client.url}, signed in as \`${detected.account.username}\`.`,
						serverLine,
						'',
						'Try `/server view` and start typing a server name.',
						scope === 'guild' ? 'Use `/panel access` to let roles use it. Members with Manage Server always can.' : '',
					]
						.filter(Boolean)
						.join('\n'),
				),
		],
	});
}

export const panelLinkHandler: ComponentHandler = {
	prefix: PANEL_LINK_PREFIX,

	async handle(interaction, [action, scope, preset]) {
		if (scope !== 'user' && scope !== 'guild') return;
		if (preset !== 'zettako' && preset !== 'custom') return;

		if (action === 'open' && interaction.isButton()) {
			await interaction.showModal(buildModal(scope, preset));
		} else if (action === 'submit' && interaction.isModalSubmit()) {
			await submit(interaction, scope, preset);
		}
	},
};
