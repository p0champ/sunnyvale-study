import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { ExtensionBrowser, extensionId } from './extension-browser.mjs';
import { createHttpTransport } from './http-transport.mjs';
import { createConnector } from './connector.mjs';
import { createBackup } from './backup.mjs';

const root = process.env.BRIDGE_PRIVATE_DIR || fileURLToPath(new URL('./private/', import.meta.url));
await mkdir(root, { recursive: true });
let token;
try { token = (await readFile(root + '/pairing.txt', 'utf8')).trim(); }
catch { token = randomBytes(24).toString('base64url'); await writeFile(root + '/pairing.txt', token); }
// A separate secret for the Claude connector (typed into Claude's connector settings by the user).
let connectorSecret;
try { connectorSecret = (await readFile(root + '/connector.txt', 'utf8')).trim(); }
catch { connectorSecret = randomBytes(32).toString('base64url'); await writeFile(root + '/connector.txt', connectorSecret); }
let activeConnection = null;   // the paired Sunnyvale page, used by the Claude connector
const connectorLog = line => appendFile(root + '/connector.log', line + '\n').catch(() => {});
const connector = createConnector({ secret: connectorSecret, getConnection: () => activeConnection, log: connectorLog });
const port = Number(process.env.BRIDGE_PORT || 8130);
const allowedOrigins = new Set(['https://p0champ.github.io', 'http://localhost:8123', 'http://127.0.0.1:8123', 'http://localhost:18123', 'http://127.0.0.1:18123']);
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/bridge/http/')) {
    httpTransport.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
    return;
  }
  if (req.url === '/mcp' || req.url?.startsWith('/mcp?') || req.url?.startsWith('/mcp/')) {
    connector(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
    return;
  }
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, browser: useExtension ? 'chrome-extension' : 'test-chromium', extensionConnected: useExtension ? !!extension.connected : true })); }
  else {
    if (/^\/(\.well-known|mcp|register|authorize|token|sse)/.test(req.url || '')) connectorLog(`${new Date().toISOString()} ${req.method} ${req.url} -> 404 (not handled)`);
    res.writeHead(404); res.end();
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
const browserWss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
const extension = new ExtensionBrowser();
const useExtension = process.env.BRIDGE_BROWSER !== 'playwright';
let active = null, context = null;
const backup = createBackup({ root });
const httpTransport = createHttpTransport({ allowedOrigins, validToken, isBusy: () => !!active, onConnection: socket => wss.emit('connection', socket) });
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/browser') {
    if (req.headers.origin !== 'chrome-extension://' + extensionId || req.headers.host !== '127.0.0.1:' + port) { socket.destroy(); return; }
    browserWss.handleUpgrade(req, socket, head, ws => {
      const timeout = setTimeout(() => ws.close(1008, 'Pairing required'), 5000);
      ws.on('error', () => {});
      ws.once('message', raw => {
        clearTimeout(timeout);
        let m; try { m = JSON.parse(raw); } catch { ws.close(1008); return; }
        if (m?.type !== 'pair-browser' || !validToken(m.token)) { ws.close(1008, 'Pairing failed'); return; }
        extension.accept(ws);
      });
    });
    return;
  }
  if (req.url !== '/bridge' || !allowedOrigins.has(req.headers.origin)) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
for (const event of ['connected', 'disconnected']) extension.on(event, () => {
  if (active?.readyState === WebSocket.OPEN) active.send(JSON.stringify({ type: 'browser-status', connected: extension.connected }));
});
function validToken(value) {
  const a = Buffer.from(String(value || '')), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function webURL(value) {
  const u = new URL(String(value));
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('Use a normal http or https web address.');
  return u.href;
}
wss.on('connection', ws => {
  let paired = false, closed = false, pending = 0, tabs = new Map(), sequence = Promise.resolve();
  const worldCalls = new Map();
  let voice = { packets: 0, maxGap: 0, last: 0, frames: 0, frameKB: 0, maxBuffered: 0 };   // PC side of the voice diagnostics
  const send = data => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const timer = setTimeout(() => { if (!paired) ws.close(1008, 'Pairing required'); }, 5000);
  // Heartbeat: a headset that vanished (Wi-Fi dropped, headset asleep) is let go within about 30 seconds,
  // so the headset can reconnect instead of being refused as "already connected".
  let alive = true;
  const heartbeat = setInterval(() => {
    if (paired) send({ type: 'heartbeat' });          // the page watches for this (it can't see WebSocket pings)
    if (typeof ws.ping !== 'function') return;        // the HTTPS backup connection has its own timeouts
    if (!alive) { ws.terminate(); return; }
    alive = false; try { ws.ping(); } catch { /* closing */ }
  }, 15000);
  ws.on?.('pong', () => { alive = true; });
  async function addTab(url) {
    if (tabs.size >= 4) throw Error('Close a browser window first (maximum four).');
    if (!useExtension && !context) context = await chromium.launchPersistentContext(root + '/profile', {
      headless: process.env.BRIDGE_HEADLESS !== '0', viewport: { width: 1280, height: 800 },
      args: ['--mute-audio'], deviceScaleFactor: 2, acceptDownloads: false,
    });
    if (closed) return;
    if (useExtension && !extension.connected) throw Error('Connect the Sunnyvale extension in Google Chrome first.');
    let page = await (useExtension ? extension.newPage() : context.newPage());
    const id = randomBytes(8).toString('hex');
    if (useExtension) {
      // Chrome sometimes doesn't answer the first time (a sleeping tab); a second try usually works, so retry once.
      try { await page.attach(url); }
      catch (error) {
        if (!/did not respond|waking up/i.test(error.message)) throw error;
        page = await extension.newPage();
        await page.attach(url);
      }
    }
    const cdp = useExtension ? page.cdp : await context.newCDPSession(page);
    if (!useExtension) await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
    if (closed) { await page.close(); return; }
    const tab = { page, cdp, waiting: false, sentAt: 0, latest: null, timer: null, stillTimer: null, dirty: true, capturedAt: 0, lastImage: null, zoom: 0, width: 1280, height: 800, micEnabled: false, micPending: 0 }; tabs.set(id, tab);
    // Voice (headset mic or tab sound) shares this connection with the pictures. A big sharp picture sent
    // ahead of the sound makes Claude's voice arrive late and get cut, so while voice is on the window
    // updates once a second with a smaller JPEG picture, and sound always goes first.
    tab.voice = () => tab.micEnabled || !!page.audioEnabled || Date.now() - (tab.soundAt || 0) < 3000;
    tab.schedule = () => {
      if (closed || !tabs.has(id) || !tab.dirty || tab.waiting || tab.capturing || tab.resizing || tab.stillTimer) return;
      tab.stillTimer = setTimeout(() => { tab.stillTimer = null; tab.still(); }, Math.max(0, (tab.voice() ? 1000 : 250) - (Date.now() - tab.capturedAt)));
    };
    tab.still = async () => {
      if (closed || !tabs.has(id)) return;
      tab.dirty = true;
      if (tab.capturing || tab.waiting || tab.resizing) return;
      clearTimeout(tab.stillTimer); tab.stillTimer = null;
      tab.capturing = true; tab.dirty = false; tab.capturedAt = Date.now();
      tab.captureComplete = new Promise(resolve => { tab.captureFinished = resolve; });
      try {
        let shot = await cdp.send('Page.captureScreenshot', tab.voice() ? { format: 'jpeg', quality: 70, captureBeyondViewport: false, fromSurface: true } : { format: 'png', captureBeyondViewport: false, fromSurface: true });
        if (shot.data.length > 3000000) shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, captureBeyondViewport: false, fromSurface: true });
        if (tabs.has(id) && shot.data !== tab.lastImage) { tab.lastImage = shot.data; tab.latest = shot.data; tab.flush(); }
      } catch { /* Navigating tabs may not be ready for a still image yet. */ }
      finally { tab.capturing = false; tab.captureFinished(); tab.schedule(); }
    };
    tab.flush = () => {
      clearTimeout(tab.timer); tab.timer = null;
      if (closed || !tabs.has(id) || tab.waiting) return;
      if (!tab.latest) { tab.schedule(); return; }
      const delay = Math.max(0, 40 - (Date.now() - tab.sentAt));
      if (delay || ws.bufferedAmount > (tab.voice() ? 64000 : 1024000)) { tab.timer = setTimeout(tab.flush, delay || 100); return; }
      tab.waiting = true; tab.sentAt = Date.now();
      voice.frames++; voice.frameKB += tab.latest.length / 1024;
      send({ type: 'frame', id, data: tab.latest }); tab.latest = null;
    };
    page.on('popup', popup => { const u = popup.url(); popup.close().catch(() => {}); if (/^https?:/.test(u)) addTab(u).catch(e => send({ type: 'error', message: e.message })); });
    page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) send({ type: 'location', id, url: page.url() }); });
    page.on('detached', () => { tab.micEnabled = false; send({ type: 'sharing-stopped', id }); send({ type: 'error', id, message: 'Chrome stopped sharing this tab. Reopen it from the menu. Your Chrome tab stays open.' }); });
    page.on('audio', packet => {
      if (!closed && tabs.has(id) && packet?.rate === 24000 && typeof packet.data === 'string' && packet.data.length <= 20000) { const now = Date.now(); if (voice.last) voice.maxGap = Math.max(voice.maxGap, now - voice.last); voice.last = now; voice.packets++; voice.maxBuffered = Math.max(voice.maxBuffered, ws.bufferedAmount || 0); tab.soundAt = now; send({ type: 'audio', id, rate: packet.rate, data: packet.data }); }
    });
    page.on('audio-status', enabled => send({ type: 'audio-status', id, enabled }));
    send({ type: 'tab', id, url, title: page.currentTitle || '', width: tab.width, height: tab.height, audioEnabled: !!page.audioEnabled });
    cdp.on('Page.screencastFrame', async frame => {
      // Cast images can be low resolution even with a high maximum size. Use
      // them only as change notifications, then capture the actual HiDPI page.
      // Continuous cursors/spinners must not postpone sharp text indefinitely.
      tab.dirty = true; tab.schedule();
      await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    if (!useExtension) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => send({ type: 'error', message: 'Page is still loading or could not be reached.' }));
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 30, maxWidth: 64, maxHeight: 40, everyNthFrame: 2 });
    tab.schedule();
    if (useExtension) send({ type: 'location', id, url: page.url() });
    return id;
  }
  async function command(m) {
    if (closed) return;
    if (!paired) {
      if (m.type !== 'pair' || !validToken(m.token)) { ws.close(1008, 'Pairing failed'); return; }
      if (active && active !== ws) { ws.close(4001, 'Another Sunnyvale page is connected'); return; }
      paired = true; active = ws; clearTimeout(timer); send({ type: 'ready', browserReady: !useExtension || extension.connected });
      activeConnection = {
        tabs,
        // Browser commands from Claude go through the same queue as the headset's own clicks.
        run(m) { const job = sequence.then(() => command(m)); sequence = job.catch(() => {}); return job; },
        openTab: url => { const job = sequence.then(() => addTab(webURL(url))); sequence = job.catch(() => {}); return job; },
        // World tools run inside the Sunnyvale page; wait for its answer.
        world(name, input) {
          return new Promise((resolve, reject) => {
            if (worldCalls.size >= 32) { reject(Error('Sunnyvale is busy. Wait for the current tools to finish.')); return; }
            const reqId = randomBytes(8).toString('hex');
            const expiresAt = Date.now() + 60000;
            const t = setTimeout(() => { worldCalls.delete(reqId); reject(Error('Sunnyvale did not answer within 60 seconds. Check the headset connection, then retry. Approval in Claude is controlled by Claude, not Sunnyvale.')); }, 60000);
            worldCalls.set(reqId, { resolve, reject, t });
            send({ type: 'world-call', reqId, name, input, expiresAt });
          });
        }
      };
      return;
    }
    if (m.type === 'open') { await addTab(webURL(m.url)); return; }
    const tab = tabs.get(m.id); if (!tab) throw Error('Browser window is closed.');
    const { page, cdp } = tab;
    if (m.type === 'page-info') {
      const info = page.info ? await page.info() : { url: page.url(), title: await page.title(), text: (await page.locator('body').innerText({timeout:4000})).slice(0,8000) };
      send({ type: 'page-info', id: m.id, reqId: String(m.reqId).slice(0,80), url: info.url, title: info.title, text: info.text }); return;
    }
    if (m.type === 'ack') { tab.waiting = false; return; }
    if (m.type === 'close') { clearTimeout(tab.timer); clearTimeout(tab.stillTimer); tabs.delete(m.id); await page.close(); return; }
    if (m.type === 'audio-start') {
        try { if (!page.startAudio) throw Error('Chrome extension required'); await page.startAudio(); send({ type: 'audio-status', id: m.id, enabled: true }); }
      catch { send({ type: 'error', message: 'On the PC, open this website in Chrome, click the Sunnyvale extension, then Enable sound for this tab. Chrome needs that one-time click.' }); }
      return;
    }
    if (m.type === 'audio-stop') { await page.stopAudio?.(); send({ type: 'audio-status', id: m.id, enabled: false }); return; }
    if (m.type === 'mic-start') {
      if (!page.startMic) throw Error('Headset voice needs the updated Chrome extension.');
      await page.startMic(); tab.micEnabled = true; send({ type: 'mic-status', id: m.id, enabled: true }); return;
    }
    if (m.type === 'mic-stop') { tab.micEnabled = false; await page.stopMic?.(); send({ type: 'mic-status', id: m.id, enabled: false }); return; }
    if (m.type === 'text-scale') {
      tab.zoom = Math.max(0, Math.min(3, tab.zoom + (m.delta > 0 ? 1 : -1)));
      tab.width = [1280, 1120, 960, 800][tab.zoom]; tab.height = Math.round(tab.width * .625);
      tab.resizing = true;
      try {
        if (tab.capturing) await tab.captureComplete;
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: tab.width, height: tab.height, deviceScaleFactor: 2, mobile: false });
      } finally { tab.resizing = false; }
      send({ type: 'viewport', id: m.id, width: tab.width, height: tab.height }); await tab.still(); return;
    }
    if (m.type === 'navigate') { await page.goto(webURL(m.url), { waitUntil: 'domcontentloaded' }); return; }
    if (m.type === 'back') { await page.goBack(); return; }
    if (m.type === 'forward') { await page.goForward(); return; }
    if (m.type === 'reload') { await page.reload(); return; }
    if (m.type === 'text') { await cdp.send('Input.insertText', { text: String(m.text).slice(0, 8000) }); return; }
    if (m.type === 'key' && ['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(m.key)) { await page.keyboard.press(m.key); return; }
    const x = Math.max(0, Math.min(tab.width - 1, Number(m.x))), y = Math.max(0, Math.min(tab.height - 1, Number(m.y)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Invalid pointer position.');
    if (m.type === 'move') { await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y }); return; }
    if (m.type === 'click') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    if (m.type === 'scroll') await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: Math.max(-1600, Math.min(1600, Number(m.delta) || 0)) });
  }
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { ws.close(1008); return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.type !== 'string') { ws.close(1008); return; }
    // Frame acknowledgements must not wait behind slow website navigation.
    if (paired && m.type === 'ack') { const t = tabs.get(m.id); if (t) { t.waiting = false; t.flush(); } return; }
    if (paired && m.type === 'world-result') {
      const call = worldCalls.get(m.reqId);
      if (call) { worldCalls.delete(m.reqId); clearTimeout(call.t); m.ok === false ? call.reject(Error(String(m.error || 'Failed'))) : call.resolve(String(m.result ?? 'Done.')); }
      return;
    }
    if (paired && (m.type.startsWith('backup-') || m.type === 'restore-part')) {
      backup.handle(m, data => send({ type: 'reply', reqId: m.reqId, ok: true, ...data }))
        .catch(e => send({ type: 'reply', reqId: m.reqId, ok: false, error: e.message }));
      return;
    }
    if (paired && m.type === 'voice-stats') {
      const pc = voice; voice = { packets: 0, maxGap: 0, last: voice.last, frames: 0, frameKB: 0, maxBuffered: 0 };
      const line = new Date().toISOString() + ' headset ' + JSON.stringify({ packets: m.packets, underruns: m.underruns, dropped: m.dropped, maxGap: m.maxGap, lead: m.lead, stall: m.stall, transport: m.transport })
        + ' pc ' + JSON.stringify({ packets: pc.packets, maxGap: pc.maxGap, frames: pc.frames, frameKB: Math.round(pc.frameKB), maxBuffered: pc.maxBuffered }) + '\n';
      appendFile(root + '/voice.log', line).catch(() => {});
      return;
    }
    if (paired && m.type === 'mic-data') {
      const t = tabs.get(m.id);
      if (t?.micEnabled && t.page.sendMic && t.micPending < 20 && m.rate === 24000 && typeof m.data === 'string' && m.data.length <= 20000 && /^[A-Za-z0-9+/]*={0,2}$/.test(m.data)) {
        t.micPending++; t.page.sendMic(m.data, m.rate).catch(() => {}).finally(() => t.micPending--);
      }
      return;
    }
    if (++pending > 100) { ws.close(1008, 'Too many queued inputs'); return; }
    sequence = sequence.then(() => command(m)).catch(e => send({ type: 'error', id: m.id, message: e.message })).finally(() => pending--);
  });
  ws.on('error', () => {});
  ws.on('close', () => {
    closed = true; clearTimeout(timer); clearInterval(heartbeat);
    if (active === ws) { active = null; activeConnection = null; }
    for (const call of worldCalls.values()) { clearTimeout(call.t); call.reject(Error('Sunnyvale disconnected.')); }
    worldCalls.clear();
    for (const t of tabs.values()) { clearTimeout(t.timer); clearTimeout(t.stillTimer); t.page.close().catch(() => {}); }
    tabs.clear();
  });
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') { console.log('The bridge is already running (port ' + port + ' is taken). You can close this window.'); process.exit(3); }
  throw error;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Sunnyvale browser bridge ready on http://127.0.0.1:${port}`);
  console.log('Your private pairing code is saved in bridge/private/pairing.txt');
  console.log('PC test: ws://localhost:' + port + '/bridge');
  console.log('Quest: use a secure tunnel to this port, then wss://YOUR-TUNNEL/bridge');
  console.log(useExtension ? 'Browser: your regular Google Chrome, through the Sunnyvale extension.' : 'Browser: isolated test Chromium.');
  console.log('Claude connector: https://YOUR-TUNNEL/mcp (its secret is in bridge/private/connector.txt)');
});
// The public address the Quest and Claude use. Only the authenticated WebSocket and connector are exposed, never project files.
// A permanent address (Tailscale Funnel) is used when bridge/private/public-address.txt holds it, for example
// https://sunnyvale.example.ts.net: it never changes, so a restart breaks nothing. Without one, a temporary
// cloudflared quick tunnel is used (its address changes on every restart).
async function writeQuestLink(base) {
  const link = 'https://p0champ.github.io/sunnyvale-study/#' + new URLSearchParams({ bridge: base.replace(/^https:/, 'wss:') + '/bridge', pair: token });
  await writeFile(root + '/Open Sunnyvale.url', '[InternetShortcut]\r\nURL=' + link + '\r\n');
  console.log('Your private Quest link is ready: bridge/private/Open Sunnyvale.url');
  console.log('Keep this link private. It pairs the headset without typing the code.');
}
let tunnel;
const permanent = (await readFile(root + '/public-address.txt', 'utf8').catch(() => '')).trim().replace(/\/+$/, '');
const tailscaleExe = (process.env.ProgramFiles || 'C:\\Program Files') + '\\Tailscale\\tailscale.exe';
const tunnelExe = fileURLToPath(new URL('./bin/cloudflared.exe', import.meta.url));
if (/^https:\/\/[a-z0-9.-]+$/i.test(permanent)) {
  // Make sure Tailscale Funnel still points at this bridge (it normally stays on by itself)
  if (process.env.BRIDGE_TUNNEL !== '0' && existsSync(tailscaleExe)) {
    const tryFunnel = (attempt = 1) => {
      const funnel = spawn(tailscaleExe, ['funnel', '--bg', String(port)], { windowsHide: true });
      funnel.on('error', () => console.log('Could not check Tailscale Funnel. Is Tailscale running and signed in?'));
      funnel.on('exit', code => {
        if (code === 0) console.log('Permanent address: ' + permanent);
        else if (attempt < 6) setTimeout(() => tryFunnel(attempt + 1), 10000);
        else console.log('Tailscale Funnel did not start. Open Tailscale and check it is connected.');
      });
    };
    tryFunnel();
  }
  await writeQuestLink(permanent);
  backup.saveKeys();
} else if (process.env.BRIDGE_TUNNEL === '1' && existsSync(tunnelExe)) {
  tunnel = spawn(tunnelExe, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { windowsHide: true });
  tunnel.stderr.on('data', async data => {
    const match = String(data).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) await writeQuestLink(match[0]);
  });
  tunnel.on('error', () => console.log('Secure relay could not start. Restart the bridge.'));
}
async function shutdown() { tunnel?.kill(); httpTransport.close(); for (const ws of wss.clients) ws.close(); for (const ws of browserWss.clients) ws.close(); await context?.close(); server.close(); }
process.on('SIGINT', () => shutdown().finally(() => process.exit()));
