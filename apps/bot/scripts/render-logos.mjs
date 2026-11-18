// Renders the ZettaControl logos in apps/bot/assets/brand: the Zettako icon with a
// badge in the bottom right. The badge sits inside Discord's circle crop, and the gap
// around it is cut out of the icon, so the transparent versions work on any background.
//
//   npm run brand:logos
//
// Writes, for each variant:
//   zettacontrol-<variant>.png              1024px on the dark background (avatars, app icons)
//   zettacontrol-<variant>-transparent.png  1024px, transparent background
// and logo.png (the chosen variant), which the tutorial images use.
// Needs Chrome or Edge (set CHROME to its path if it is not found).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BRAND = resolve(import.meta.dirname, '../assets/brand');
const ICON = pathToFileURL(join(BRAND, 'zettako-icon.png')).href;
const LOGO_VARIANT = 'power';
const WORK = mkdtempSync(join(tmpdir(), 'logos-'));

const CHROME = [
	process.env.CHROME,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
].find((path) => path && existsSync(path));
if (!CHROME) throw new Error('Chrome or Edge not found. Set CHROME to its path.');

const TEAL = '#63bebd';
const DARK = '#0d1719';

// Glyphs are drawn in a 100x100 box over the badge disc. `fg` is the glyph colour.
const servers = (fg, dot) => [24, 43, 62].map((y) => `<rect x="20" y="${y}" width="60" height="14" rx="4" fill="${fg}"/><circle cx="69" cy="${y + 7}" r="3.6" fill="${dot}"/>`).join('');
const power = (fg) =>
	`<path d="M35 33 A24 24 0 1 0 65 33" fill="none" stroke="${fg}" stroke-width="10" stroke-linecap="round"/><line x1="50" y1="22" x2="50" y2="50" stroke="${fg}" stroke-width="10" stroke-linecap="round"/>`;
const terminal = (fg) =>
	`<path d="M26 34 L44 50 L26 66" fill="none" stroke="${fg}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><line x1="52" y1="67" x2="74" y2="67" stroke="${fg}" stroke-width="9" stroke-linecap="round"/>`;

/** Teal discs with a dark glyph, or "dark" discs with a teal ring and glyph. */
const VARIANTS = {
	servers: { fill: TEAL, glyph: servers(DARK, TEAL) },
	'servers-dark': { fill: DARK, ring: TEAL, glyph: servers(TEAL, DARK) },
	power: { fill: TEAL, glyph: power(DARK) },
	'power-dark': { fill: DARK, ring: TEAL, glyph: power(TEAL) },
	terminal: { fill: DARK, ring: TEAL, glyph: terminal(TEAL) },
};

// Layout as shares of the canvas.
const ICON_BOX = { left: 0.06, top: 0.05, size: 0.8 };
const BADGE_CENTRE = 0.7; // keeps the badge inside a circle crop
const BADGE_RADIUS = 0.16;
const GAP = 0.03;

function mark(variant, size) {
	const centre = BADGE_CENTRE * size;
	const radius = BADGE_RADIUS * size;
	const cut = radius + GAP * size;
	const iconLeft = ICON_BOX.left * size;
	const iconTop = ICON_BOX.top * size;
	const mask = `radial-gradient(circle at ${centre - iconLeft}px ${centre - iconTop}px, transparent ${cut}px, #000 ${cut + 0.5}px)`;
	return `<img src="${ICON}" style="position:absolute;left:${iconLeft}px;top:${iconTop}px;width:${ICON_BOX.size * size}px;height:${ICON_BOX.size * size}px;-webkit-mask:${mask};mask:${mask}">
<svg viewBox="0 0 100 100" style="position:absolute;left:${centre - radius}px;top:${centre - radius}px;width:${radius * 2}px;height:${radius * 2}px">
<circle cx="50" cy="50" r="${variant.ring ? 47.5 : 50}" fill="${variant.fill}"${variant.ring ? ` stroke="${variant.ring}" stroke-width="5"` : ''}/>${variant.glyph}</svg>`;
}

function shoot(name, background) {
	const variant = VARIANTS[name.replace(/-transparent$/, '').replace(/^zettacontrol-/, '')];
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:1024px;height:1024px;overflow:hidden;background:${background};position:relative}</style></head><body>${mark(variant, 1024)}</body></html>`;
	const file = join(WORK, `${name}.html`);
	writeFileSync(file, html);
	execFileSync(
		CHROME,
		['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--default-background-color=00000000', '--window-size=1024,1024', `--screenshot=${join(BRAND, `${name}.png`)}`, pathToFileURL(file).href],
		{ stdio: 'ignore' },
	);
	console.log(`rendered ${name}.png`);
}

for (const key of Object.keys(VARIANTS)) {
	shoot(`zettacontrol-${key}`, DARK);
	shoot(`zettacontrol-${key}-transparent`, 'transparent');
}
copyFileSync(join(BRAND, `zettacontrol-${LOGO_VARIANT}.png`), join(BRAND, 'logo.png'));
console.log(`logo.png is ${LOGO_VARIANT}`);
rmSync(WORK, { recursive: true, force: true });
