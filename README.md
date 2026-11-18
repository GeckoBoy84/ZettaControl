# ZettaControl

Control your game servers from Discord. Works with **Calagopus**, **Pterodactyl 1.x and 2.x**, and **Pelican**.

Built and hosted by [Zettako](https://zettako.net). Formerly PteroControl: v2 is a full rewrite and is in alpha. The old v1 bot lives on the [`v1` branch](https://github.com/GeckoBoy84/PteroControl/tree/v1).

## Features (so far)

- Link panels with a modal. API keys never touch chat and are stored encrypted (AES-256-GCM).
- One click setup for Zettako; auto-detection for every other panel.
- Panels for **just you** (usable in DMs and any server, including as a user-installed app) or for a **whole Discord server**.
- Role based access for server panels: Manage Server is a manager by default, `/access managers` adds manager roles, and `/access grant` gives any role View, Power or Full access to a whole panel or to single game servers.
- `/server view`: live CPU, memory, disk, network and uptime with start, restart, stop, kill and console command buttons.
- Server autocomplete across every panel you can use.

See [ROADMAP.md](ROADMAP.md) for what is coming.

## Layout

```
apps/bot/            the Discord bot (discord.js 14, TypeScript)
packages/panels/     one client interface for every supported panel
private.example/     template for deployment-only hooks (copy to private/, which git ignores)
```

TypeScript runs directly on Node 25.9+ (type stripping), so there is no build step.

## Self-hosting

You need Node.js 25.9 or newer and a Postgres database. The easiest route is a [Zettako](https://zettako.net) Discord bot server, which includes a free Postgres database.

The start file is **`index.js`**. On every start it updates the database and registers the slash commands if they changed, so you never need to type commands into a console.

### On a game panel (Zettako, Calagopus, Pterodactyl, Pelican)

1. Create a server with a Node.js egg on Node 25.9 or newer.
2. Upload this repository (or set the egg's git repo to it).
3. Copy `.env.example` to `.env` and fill it in through the file manager.
4. Set the start file to `index.js` and start the server. The egg's `npm install` on start installs everything.

### Anywhere else

```sh
npm install
cp .env.example .env      # fill it in
npm start                 # same as: node index.js
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
