// Renders the /tutorial step images in apps/bot/assets/tutorial: Zettako branded
// scenes with Discord style mockups of the bot's real messages. Re-run after changing
// the branding, the logo or what a view looks like, and keep the text in sync with
// the views it copies (views/server.ts, views/sections.ts, views/status-board.ts...).
//
//   npm run tutorial:images
//
// Needs Chrome or Edge (set CHROME to its path if it is not found). Drop a square logo
// at apps/bot/assets/brand/logo.png (or set LOGO) to replace the "Z" placeholder in
// the header and the bot avatar.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../assets/tutorial'));
const WORK = mkdtempSync(join(tmpdir(), 'tutorial-images-'));
mkdirSync(OUT, { recursive: true });

const CHROME = [
	process.env.CHROME,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
].find((path) => path && existsSync(path));
if (!CHROME) throw new Error('Chrome or Edge not found. Set CHROME to its path.');

const LOGO_PATH = resolve(process.env.LOGO ?? resolve(import.meta.dirname, '../assets/brand/logo.png'));
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const logo = existsSync(LOGO_PATH) ? `data:${MIME[extname(LOGO_PATH).toLowerCase()] ?? 'image/png'};base64,${readFileSync(LOGO_PATH).toString('base64')}` : null;

/** The brand mark in the header (`logo`) and as the bot's avatar (`av`). */
function mark(cls) {
	return logo ? `<img class="${cls}" src="${logo}" alt="">` : `<div class="${cls}">Z</div>`;
}

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:675px;overflow:hidden}
body{font-family:'Segoe UI','gg sans',system-ui,sans-serif;color:#dbdee1;
 background:radial-gradient(900px 500px at 85% -10%,rgba(99,190,189,.35),transparent 60%),
 radial-gradient(700px 420px at -5% 110%,rgba(99,190,189,.22),transparent 60%),#0d1719;}
.top{position:absolute;left:44px;right:44px;top:30px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:12px}
.logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#7fd6d5,#3f9e9d);display:grid;place-items:center;font-weight:800;color:#0d1719;font-size:22px}
.brand b{font-size:21px;color:#fff;letter-spacing:.2px}
.brand span{font-size:14px;color:#8fb7b6;margin-left:4px}
.pill{font-size:14px;color:#0d1719;background:#63bebd;border-radius:999px;padding:6px 14px;font-weight:700}
.stage{position:absolute;left:44px;right:44px;top:92px;bottom:56px;display:flex;gap:28px;align-items:center}
.foot{position:absolute;left:44px;right:44px;bottom:20px;font-size:13px;color:#6f8f8e;display:flex;justify-content:space-between}
.chat{background:#313338;border-radius:14px;padding:18px 20px;box-shadow:0 18px 50px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.04)}
.msg{display:flex;gap:14px}
.av{flex:none;width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#7fd6d5,#3f9e9d);display:grid;place-items:center;font-weight:800;color:#0d1719;font-size:20px}
img.logo,img.av{background:none;object-fit:cover}
.av.user{background:#f0b232;color:#3a2a00}
.who{font-size:15px;margin-bottom:4px}.who b{color:#fff;font-weight:600}
.app{background:#5865f2;color:#fff;font-size:10px;font-weight:700;border-radius:3px;padding:1px 4px;margin:0 6px;vertical-align:2px}
.time{color:#949ba4;font-size:12px}
.eph{color:#949ba4;font-size:12px;margin-top:8px}
.cmdline{color:#949ba4;font-size:13px;margin-bottom:6px}.cmdline b{color:#c9cdfb;font-weight:500}
.embed{background:#2b2d31;border-left:4px solid #63bebd;border-radius:4px;padding:12px 16px 14px;max-width:520px}
.embed.red{border-color:#e5645f}.embed.amber{border-color:#f4b740}
.et{color:#fff;font-weight:700;font-size:16px;margin-bottom:6px}.et.link{color:#00a8fc}
.ed{font-size:14px;line-height:1.45;white-space:pre-line}
.ed code{background:#1e1f22;border-radius:3px;padding:0 4px;font-family:Consolas,monospace;font-size:13px}
.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 18px;margin-top:10px}
.f h4{font-size:13px;color:#fff;font-weight:700;margin-bottom:1px}.f p{font-size:14px}
.ef{font-size:12px;color:#949ba4;margin-top:10px}
.row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.btn{font-size:14px;font-weight:500;color:#fff;border-radius:8px;padding:6px 14px;background:#4e5058}
.btn.p{background:#5865f2}.btn.g{background:#248046}.btn.r{background:#da373c}.btn.off{opacity:.45}
.btn.l::after{content:' ↗';opacity:.8}
.select{margin-top:8px;background:#1e1f22;border:1px solid #1a1b1e;border-radius:8px;padding:9px 12px;font-size:14px;color:#949ba4;width:520px;display:flex;justify-content:space-between}
.menu{background:#2b2d31;border:1px solid #1e1f22;border-radius:8px;margin-top:4px;width:520px;overflow:hidden}
.menu div{padding:4px 12px;border-bottom:1px solid #26282c}.menu b{display:block;color:#fff;font-weight:500;font-size:14px}.menu span{font-size:12.5px;color:#949ba4}
.menu div.hl{background:#35373c}
.hero h1{font-size:48px;line-height:1.08;color:#fff;font-weight:800;letter-spacing:-.5px}
.hero h1 em{font-style:normal;color:#63bebd}
.hero p{font-size:19px;color:#b5c7c6;margin-top:16px;line-height:1.45}
.chips{display:flex;gap:8px;margin-top:22px;flex-wrap:wrap}
.chip{border:1px solid rgba(99,190,189,.5);color:#bfe7e6;border-radius:999px;padding:6px 13px;font-size:14px}
.picker{background:#2b2d31;border-radius:12px;width:470px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden}
.picker .it{display:flex;gap:12px;align-items:center;padding:10px 14px}.picker .it.hl{background:#35373c}
.picker .it .av{width:28px;height:28px;font-size:14px}
.picker b{color:#fff;font-weight:600;font-size:15px}.picker span{color:#949ba4;font-size:13px;display:block}
.input{background:#383a40;border-radius:8px;padding:12px 14px;font-size:15px;margin-top:8px;color:#dbdee1}
.input .tok{background:#4e5058;border-radius:4px;padding:1px 6px;margin-left:6px;font-size:13.5px}
.modal{background:#313338;border-radius:12px;width:380px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.55)}
.modal h3{color:#fff;font-size:19px;margin-bottom:14px}
.modal label{display:block;font-size:12px;font-weight:700;color:#b5bac1;text-transform:uppercase;margin:12px 0 6px}
.modal .box{background:#1e1f22;border-radius:6px;padding:10px;font-size:14px;color:#6d6f78}
.modal .box.v{color:#dbdee1}
.modal .acts{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
.levels{display:flex;flex-direction:column;gap:10px;width:330px}
.lv{background:rgba(43,45,49,.85);border:1px solid rgba(99,190,189,.25);border-radius:12px;padding:14px 16px}
.lv b{color:#fff;font-size:16px}.lv p{font-size:14px;color:#b5bac1;margin-top:3px}
.lv i{font-style:normal;color:#63bebd;font-weight:700;margin-right:8px}
.thread{white-space:pre-line;background:#2b2d31;border-radius:8px;padding:10px 12px;font-family:Consolas,monospace;font-size:12.5px;line-height:1.5;color:#b5bac1;margin-top:8px;max-width:520px}
.label{font-size:13px;color:#8fb7b6;margin:0 0 8px 2px;font-weight:600;letter-spacing:.3px;text-transform:uppercase}
.col{display:flex;flex-direction:column;gap:16px}
.mention{background:rgba(88,101,242,.3);color:#c9cdfb;border-radius:3px;padding:0 2px}
`;

const bot = (time = 'Today at 12:00') => `<div class="who"><b>ZettaControl</b><span class="app">APP</span><span class="time">${time}</span></div>`;
const eph = '<div class="eph">👁 Only you can see this · Dismiss message</div>';

function page(step, title, body) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="top"><div class="brand">${mark("logo")}<b>ZettaControl</b><span>by Zettako</span></div><div class="pill">${step}</div></div>
<div class="stage">${body}</div>
<div class="foot"><span>${title}</span><span>zettako.net</span></div></body></html>`;
}

const serverEmbed = `
<div class="embed"><div class="et link">Survival SMP</div>
<div class="ed">🟢 Running</div>
<div class="fields">
<div class="f"><h4>CPU</h4><p>34% / 200%</p></div><div class="f"><h4>Memory</h4><p>3.1 GiB / 6 GiB</p></div><div class="f"><h4>Disk</h4><p>8.4 GiB / 20 GiB</p></div>
<div class="f"><h4>Network</h4><p>↓ 1.2 GiB  ↑ 380 MiB</p></div><div class="f"><h4>Uptime</h4><p>2d 4h</p></div><div class="f"><h4>Node</h4><p>EU-1</p></div>
</div><div class="ef">Zettako · Calagopus · a1b2c3d4 • Today at 12:00</div></div>`;

const scenes = {
	welcome: page('Welcome', 'Your game servers, right inside Discord', `
<div class="hero" style="width:560px">
<h1>Control your game servers <em>from Discord.</em></h1>
<p>Start, stop and watch your servers. Browse files, run backups, stream the console and get alerts, without opening the panel.</p>
<div class="chips"><span class="chip">Zettako</span><span class="chip">Calagopus</span><span class="chip">Pterodactyl 1.x and 2.x</span><span class="chip">Pelican</span></div>
</div>
<div>
<div class="picker">
<div class="it hl">${mark("av")}<div><b>/server view</b><span>Live stats and controls for a server</span></div></div>
<div class="it">${mark("av")}<div><b>/panel add</b><span>Link a Zettako, Calagopus, Pterodactyl or Pelican panel</span></div></div>
<div class="it">${mark("av")}<div><b>/console open</b><span>Open a private thread with the live console of a server</span></div></div>
<div class="it">${mark("av")}<div><b>/status post</b><span>Post a status board in this channel</span></div></div>
<div class="it">${mark("av")}<div><b>/access grant</b><span>Give a role access to a panel, or to one game server</span></div></div>
</div>
<div class="input" style="width:470px">/server<span class="tok">server: Survival SMP</span></div>
</div>`),

	'link-panel': page('Step 1 · Link a panel', '/panel add links your panel. Your API key is encrypted and never shown again.', `
<div class="chat" style="width:640px"><div class="msg">${mark("av")}<div>
${bot()}
<div class="embed"><div class="et">Link a panel</div>
<div class="ed">This panel will be usable by only you, in any server or DM.

<b>On Zettako?</b> Pick Zettako and paste an API key from <span style="color:#00a8fc">your account</span>. That is it.

<b>Another panel?</b> You will need its URL and a client API key (Account &gt; API Keys). Admin or application keys will not work.

Your key is encrypted before it is stored and is never shown again.</div></div>
<div class="row"><span class="btn p">Zettako</span><span class="btn">Another panel</span><span class="btn l">Get a server on Zettako</span></div>
${eph}</div></div></div>
<div class="modal"><h3>Link Zettako</h3>
<label>Client API key</label><div class="box v">ptlc_••••••••••••••••••••</div>
<label>Name</label><div class="box">Zettako</div>
<div class="acts"><span class="btn" style="background:transparent">Cancel</span><span class="btn p">Submit</span></div></div>`),

	'server-view': page('Step 2 · Control a server', '/server view: live stats, power buttons and everything else in one message.', `
<div class="chat" style="width:620px"><div class="msg">${mark("av")}<div>
${bot()}${serverEmbed}
<div class="row"><span class="btn g off">Start</span><span class="btn p">Restart</span><span class="btn">Stop</span><span class="btn r">Kill</span></div>
<div class="row"><span class="btn">Send command</span><span class="btn">Refresh</span><span class="btn l">Open in panel</span></div>
<div class="select"><span>More: backups, files, schedules...</span><span>⌄</span></div>
</div></div></div>
<div class="col" style="width:420px">
<div class="lv"><b><i>1</i>Live stats</b><p>CPU, memory, disk, network and uptime, straight from the panel.</p></div>
<div class="lv"><b><i>2</i>Power buttons</b><p>Start, restart and stop. Kill asks first, because it skips saving.</p></div>
<div class="lv"><b><i>3</i>Send command</b><p>Run a console command without opening the panel.</p></div>
<div class="lv"><b><i>4</i>More menu</b><p>Backups, files, schedules, databases, network, subusers and startup.</p></div>
</div>`),

	sections: page('Step 3 · The More menu', 'Pick a section from the More menu, or jump straight there with /server files, /server backups...', `
<div class="chat" style="width:600px"><div class="msg">${mark("av")}<div>
${bot()}
<div class="embed" style="padding-bottom:10px"><div class="et link">Survival SMP</div><div class="ed">🟢 Running</div></div>
<div class="select" style="color:#dbdee1;border-color:#63bebd"><span>More: backups, files, schedules...</span><span>⌃</span></div>
<div class="menu">
<div><b>Backups</b><span>Create, restore and download backups</span></div>
<div class="hl"><b>Files</b><span>Browse, read, edit and download files</span></div>
<div><b>Schedules</b><span>See schedules and run them now</span></div>
<div><b>Databases</b><span>Connection details and passwords</span></div>
<div><b>Network</b><span>IP addresses and ports</span></div>
<div><b>Subusers</b><span>Panel users with access to this server</span></div>
<div style="border:0"><b>Startup</b><span>Startup variables</span></div>
</div></div></div></div>
<div class="chat" style="width:440px"><div class="msg">${mark("av")}<div>
${bot()}
<div class="embed" style="width:340px"><div style="font-size:13px;color:#fff;font-weight:600;margin-bottom:4px">/</div><div class="et">Files · Survival SMP</div>
<div class="ed">📁 config/
📁 plugins/
📁 world/
📄 eula.txt · 158 B
📄 latest.log · 82 KiB
📄 server.properties · 1.4 KiB</div>
<div class="ef">Zettako · Calagopus · a1b2c3d4</div></div>
<div class="select" style="width:340px"><span>Open a file or folder</span><span>⌄</span></div>
<div class="row"><span class="btn off">Up</span><span class="btn">Back to server</span></div>
</div></div></div>`),

	access: page('Step 4 · Share access', 'Panel managers decide which roles can do what. Every button re-checks access.', `
<div class="chat" style="width:660px"><div class="msg"><div class="av user">K</div><div>
<div class="who"><b>You</b><span class="time" style="margin-left:6px">Today at 12:01</span></div>
<div class="input" style="margin-top:2px">/access grant<span class="tok">panel: Zettako</span><span class="tok">role: @Moderators</span><span class="tok">level: Power</span></div>
</div></div>
<div class="msg" style="margin-top:18px">${mark("av")}<div>
${bot('Today at 12:01')}
<div class="embed"><div class="ed"><span class="mention">@Moderators</span> now has <b>Power</b> access (see stats, start, stop, restart and kill) to all servers on <b>Zettako</b>.</div></div>
${eph}</div></div></div>
<div class="levels">
<div class="lv"><b><i>View</i></b><p>See status and stats.</p></div>
<div class="lv"><b><i>Power</i></b><p>See stats, start, stop, restart and kill.</p></div>
<div class="lv"><b><i>Full</i></b><p>Everything, including console commands and files.</p></div>
<div class="lv" style="border-style:dashed"><p>Managers (Manage Server, or a role set with <b style="font-size:14px">/access managers</b>) always have full access.</p></div>
</div>`),

	live: page('Step 5 · Live in your channels', 'Status boards update every minute. Alerts and consoles run without anyone typing a command.', `
<div class="col" style="width:560px">
<div class="label"># server-status</div>
<div class="chat"><div class="msg">${mark("av")}<div>
${bot()}
<div class="embed" style="width:440px"><div class="et">Zettako status</div>
<div class="ed">🟢 <b>Survival SMP</b> · CPU 34% · RAM 3.1 GiB / 6 GiB · up 2d 4h
🟢 <b>Creative</b> · CPU 6% · RAM 1.8 GiB / 4 GiB · up 5h 12m
🟢 <b>Lobby</b> · CPU 2% · RAM 512 MiB / 1 GiB · up 9d 1h
🔴 <b>Modded</b> · offline</div>
<div class="fields" style="grid-template-columns:1fr"><div class="f"><h4>Online</h4><p>3 of 4</p></div></div>
<div class="ef">Calagopus · ZettaControl updates this every minute • Today at 12:00</div></div>
</div></div></div></div>
<div class="col" style="width:520px">
<div class="label"># alerts</div>
<div class="chat"><div class="msg">${mark("av")}<div>
${bot('Today at 11:58')}
<div class="cmdline"><span class="mention">@Admins</span></div>
<div class="embed red" style="width:380px"><div class="et">💥 Modded crashed</div><div class="ed">Exit code <code>137</code>. It ran out of memory.</div>
<div class="ef">Zettako · Calagopus · 9f8e7d6c</div></div>
</div></div></div>
<div class="label" style="margin-top:2px">🧵 console Survival SMP</div>
<div class="chat" style="padding:12px 16px"><div class="thread" style="margin:0">[12:00:41] Steve joined the game
[12:00:52] &lt;Steve&gt; anyone up for the nether?
[12:01:03] Saving the game (this may take a moment!)
[12:01:04] Saved the game</div></div>
</div>`),
};

for (const [name, html] of Object.entries(scenes)) {
	const file = join(WORK, `${name}.html`);
	writeFileSync(file, html);
	execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,675', `--screenshot=${join(OUT, `${name}.png`)}`, pathToFileURL(file).href], { stdio: 'ignore' });
	console.log(`rendered ${name}.png`);
}
rmSync(WORK, { recursive: true, force: true });
console.log(logo ? `Used logo ${LOGO_PATH}` : 'No logo file found, used the Z placeholder');
