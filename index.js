// Start file for hosting panels (Calagopus, Pterodactyl, Pelican): `node index.js`.
//
// On start this loads .env if there is one, updates the database, registers the
// slash commands if they changed, then starts the bot. No console commands needed.
// Plain JavaScript on purpose so any Node egg can run it; it hands over to the
// TypeScript sources, which Node 25.9+ runs directly.

import { existsSync } from 'node:fs';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 25 || (major === 25 && minor < 9)) {
	console.error(`ZettaControl needs Node.js 25.9 or newer. This server runs ${process.version}. Change the Docker image or Node version in your panel.`);
	process.exit(1);
}

const envFile = new URL('./.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

await import('./apps/bot/src/index.ts');
