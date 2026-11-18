# ZettaControl

Control your game servers from Discord. Works with **Calagopus**, **Pterodactyl 1.x and 2.x**, and **Pelican**.

Built and hosted by [Zettako](https://zettako.net). Formerly PteroControl: v2 is a full rewrite and is in alpha. The old v1 bot lives on the [`v1` branch](https://github.com/GeckoBoy84/PteroControl/tree/v1).

## Features (so far)

- Link panels with a modal. API keys never touch chat and are stored encrypted (AES-256-GCM).
- One click setup for Zettako; auto-detection for every other panel.
- Panels for **just you** (usable in DMs and any server, including as a user-installed app) or for a **whole Discord server**.
- Role based access for server panels: Manage Server is a manager by default, `/access managers` adds manager roles, and `/access grant` gives any role View, Power or Full access to a whole panel or to single game servers.
- `/server view`: live CPU, memory, disk, network and uptime with start, restart, stop, kill and console command buttons.
- Panel depth from the server view's **More** menu or `/server <section>`: backups (create, restore, download, delete), files (browse, read, edit, download), schedules (run now), databases (connection details, show or rotate the password), network, subusers and startup variables. Each panel shows only what its API supports.
- `/console open`: streams a server's console into a private thread. Send commands with a button, or by typing in the thread with `CONSOLE_TYPED_COMMANDS=true`.
- `/status post`: a channel message that shows every server's state and updates every minute.
- `/alerts add`: posts when a server goes offline, crashes (Calagopus crash log) or runs above a CPU, memory or disk threshold, with an optional role ping.
- `/stats post`: a panel stats board, like a status page for the whole panel. Panel and node uptime, live node CPU, memory and disk on Calagopus, allocated resources elsewhere, and optional posts when the panel or a node goes down or comes back. A node only counts as down after two failed checks in a row.
- `/admin`: with an admin key (`/admin key`), find any server or user on the panel, suspend or unsuspend servers, reinstall them, and suspend users on Calagopus. Only panel managers can use it.
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

**Discord permissions.** Slash commands need no permissions. Console threads, status boards, panel stats boards and alerts post on their own, so for those the bot has to be in the server with the `bot` scope and these channel permissions:

| Scope | Permissions |
|---|---|
| Guild Install | `applications.commands`, `bot` with View Channel, Send Messages, Embed Links, Create Private Threads, Send Messages in Threads (permissions integer `343597403136`) |
| User Install | `applications.commands` |

The bot links to an invite with exactly these when a live feature needs it. It only uses the `Guilds` intent. With `CONSOLE_TYPED_COMMANDS=true` it also uses `GuildMessages` and the privileged **Message Content** intent, which you switch on under **Bot** in the Developer Portal.

If your panel or its nodes are on your own network (for example `192.168.x.x`), set `ALLOW_PRIVATE_PANEL_URLS=true`. Without it, panel stats boards show nodes on private addresses as unknown instead of pinging them.

**Admin keys.** `/admin` and `/stats` use the panel's admin API. On Pterodactyl and Pelican that needs an application key (admin area > Application API), set with `/admin key`. Give it read access to users, servers and nodes, and write access to servers if you want to suspend or reinstall from Discord. On Calagopus the linked key works if its account and key have admin permissions; `/admin key` can set a separate one.

## Development

```sh
npm run dev           # restarts on changes
npm run typecheck
npm test
npm run db:generate   # after changing apps/bot/src/db/schema.ts
```

## License

AGPL-3.0. If you run a modified version for others, you must publish your changes.
