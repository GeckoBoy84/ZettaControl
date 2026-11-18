# PteroControl v2

Control your game servers from Discord. Works with **Calagopus**, **Pterodactyl 1.x and 2.x**, and **Pelican**.

Built and hosted by [Zettako](https://zettako.net). v2 is a full rewrite and is in alpha. The old v1 bot lives on the [`v1` branch](https://github.com/GeckoBoy84/PteroControl/tree/v1).

> The name is temporary. A rename is planned before the v2.0.0 release.

## Features (so far)

- Link panels with a modal. API keys never touch chat and are stored encrypted (AES-256-GCM).
- One click setup for Zettako; auto-detection for every other panel.
- Panels for **just you** (usable in DMs and any server, including as a user-installed app) or for a **whole Discord server**, with role based access.
- `/server view`: live CPU, memory, disk, network and uptime with start, restart, stop, kill and console command buttons.
- Server autocomplete across every panel you can use.

See [ROADMAP.md](ROADMAP.md) for what is coming.

## Layout

```
apps/bot/            the Discord bot (discord.js 14, TypeScript)
packages/panels/     one client interface for every supported panel
private.example/     template for deployment-only hooks (copy to private/, which git ignores)
WEBSITE/             the website
```

TypeScript runs directly on Node 26 (type stripping), so there is no build step.

## Self-hosting

You need Node.js 26+ and a Postgres database. The easiest route is a [Zettako](https://zettako.net) Discord bot server, which includes a free Postgres database.

```sh
npm install
cp .env.example .env      # fill it in
npm run db:migrate
npm run deploy-commands
npm start
```

Create the bot at <https://discord.com/developers/applications>. Under **Installation**, enable both **Guild Install** and **User Install** so people can use it in DMs.

If your panel is on your own network (for example `192.168.x.x`), set `ALLOW_PRIVATE_PANEL_URLS=true`.

## Development

```sh
npm run dev           # restarts on changes
npm run typecheck
npm test
npm run db:generate   # after changing apps/bot/src/db/schema.ts
```

## License

AGPL-3.0. If you run a modified version for others, you must publish your changes.
