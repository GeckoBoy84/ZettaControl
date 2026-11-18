// Everything user facing that names the bot or links somewhere lives here, so
// the rename is a one file change.

export const brand = {
	name: 'PteroControl',
	/** Zettako teal. */
	color: 0x63bebd,
	errorColor: 0xe5645f,
	warningColor: 0xf4b740,
	website: 'https://zettako.net',
	support: 'https://discord.gg/jU4fQvhDCz',
	source: 'https://github.com/GeckoBoy84/PteroControl',
} as const;

export const zettako = {
	name: 'Zettako',
	website: 'https://zettako.net',
	panelUrl: 'https://panel.zettako.net',
	/** Where a client creates an API key on the Zettako Panel. */
	apiKeysUrl: 'https://panel.zettako.net/account/api-keys',
	/** Affiliate link used for "host this bot yourself" upsells. TODO: set the real affiliate code. */
	affiliateUrl: 'https://zettako.net',
} as const;
