import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { brand, zettako } from '../brand.ts';
import { customId } from '../interactions.ts';
import { embed } from '../lib/replies.ts';

export const TUTORIAL_PREFIX = 'tutorial';

/** What a "Try it" button runs. Each opens a separate ephemeral reply so the tutorial stays put. */
export type TutorialTry = 'link' | 'server' | 'feedback';

interface Step {
	title: string;
	body: string[];
	/** File in apps/bot/assets/tutorial. */
	image?: string;
	try?: { action: TutorialTry; label: string };
}

export const TUTORIAL_STEPS: readonly Step[] = [
	{
		title: `Welcome to ${brand.name}`,
		image: 'welcome.png',
		body: [
			`${brand.name} lets you start, stop and watch your game servers without leaving Discord. It works with ${zettako.name}, Calagopus, Pterodactyl 1.x and 2.x, and Pelican.`,
			'',
			'This tour takes about a minute. Use **Next** and **Back** to move around. Buttons marked **Try it** run the real thing, and only you can see what they show.',
		],
	},
	{
		title: 'Step 1: Link a panel',
		image: 'link-panel.png',
		body: [
			'Everything starts with `/panel add`.',
			'',
			`**On ${zettako.name}?** Pick ${zettako.name} and paste a client API key from [your account](${zettako.apiKeysUrl}).`,
			'**Another panel?** Paste its URL and a client API key from Account > API Keys.',
			'',
			'Link it for **just you** (works everywhere, even in DMs) or for **this Discord server** with `/panel add for: This Discord server`. Keys are encrypted and never shown again.',
		],
		try: { action: 'link', label: 'Try it: link a panel' },
	},
	{
		title: 'Step 2: Control a server',
		image: 'server-view.png',
		body: [
			'`/server view` and start typing a server name. You get live stats and buttons to start, restart, stop and send console commands.',
			'',
			'In a hurry? `/server power` and `/server command` do it in one go.',
		],
		try: { action: 'server', label: 'Try it: open one of my servers' },
	},
	{
		title: 'Step 3: Backups, files and more',
		image: 'sections.png',
		body: [
			'The **More** menu under a server opens backups, files, schedules, databases, network, subusers and startup variables.',
			'',
			'Each one has its own command too, like `/server files` or `/server backups`. What shows up depends on your panel and your access.',
		],
		try: { action: 'server', label: 'Try it: open one of my servers' },
	},
	{
		title: 'Step 4: Share with your team',
		image: 'access.png',
		body: [
			'For a server panel, members with **Manage Server** are panel managers. Add more manager roles with `/access managers`.',
			'',
			'Give any other role access with `/access grant`, to the whole panel or to one game server:',
			'**View** sees status and stats. **Power** can also start, stop, restart and kill. **Full** can do everything, including the console.',
			'',
			'`/access list` shows who has what.',
		],
	},
	{
		title: 'Step 5: Live in your channels',
		image: 'live.png',
		body: [
			`These need ${brand.name} added to your Discord server, and are set up by panel managers.`,
			'',
			'`/console open` streams a server console into a private thread. Type commands right there.',
			'`/status post` posts a status board that updates every minute.',
			'`/alerts add` posts when a server crashes, goes offline or runs hot, and can ping a role.',
		],
	},
	{
		title: 'You are all set',
		body: [
			'Run `/help` any time for the full command list, or `/tutorial` to see this again.',
			'',
			`Something broken, or an idea? Send it with \`/feedback\`, it goes straight to the team.`,
			'',
			`Need a server to control? ${zettako.name} hosts game servers and runs ${brand.name}.`,
		],
		try: { action: 'feedback', label: 'Send feedback' },
	},
];

const ASSETS = resolve(import.meta.dirname, '../../assets/tutorial');
const images = new Map<string, Buffer>();

function image(name: string): AttachmentBuilder {
	let data = images.get(name);
	if (!data) {
		data = readFileSync(resolve(ASSETS, name));
		images.set(name, data);
	}
	return new AttachmentBuilder(data, { name });
}

export function renderTutorialStep(index: number) {
	const current = Math.min(Math.max(index, 0), TUTORIAL_STEPS.length - 1);
	const step = TUTORIAL_STEPS[current]!;
	const last = current === TUTORIAL_STEPS.length - 1;

	const view = embed()
		.setTitle(step.title)
		.setDescription(step.body.join('\n'))
		.setFooter({ text: `${brand.name} tutorial · ${current + 1} of ${TUTORIAL_STEPS.length}` });
	if (step.image) view.setImage(`attachment://${step.image}`);

	const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(customId(TUTORIAL_PREFIX, 'step', String(current - 1)))
			.setLabel('Back')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(current === 0),
		new ButtonBuilder()
			.setCustomId(customId(TUTORIAL_PREFIX, 'step', String(last ? 0 : current + 1)))
			.setLabel(last ? 'Start over' : 'Next')
			.setStyle(last ? ButtonStyle.Secondary : ButtonStyle.Primary),
	);
	if (step.try) {
		nav.addComponents(new ButtonBuilder().setCustomId(customId(TUTORIAL_PREFIX, 'try', step.try.action)).setLabel(step.try.label).setStyle(ButtonStyle.Success));
	}

	const components = [nav];
	if (last) {
		components.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setURL(brand.website).setLabel('Docs').setStyle(ButtonStyle.Link),
				new ButtonBuilder().setURL(brand.support).setLabel('Support').setStyle(ButtonStyle.Link),
				new ButtonBuilder().setURL(zettako.affiliateUrl).setLabel(`Get a server on ${zettako.name}`).setStyle(ButtonStyle.Link),
			),
		);
	}

	return { embeds: [view], components, files: step.image ? [image(step.image)] : [] };
}
