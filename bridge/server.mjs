import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { ExtensionBrowser, extensionId } from './extension-browser.mjs';
import { createHttpTransport } from './http-transport.mjs';

const root = process.env.BRIDGE_PRIVATE_DIR || fileURLToPath(new URL('./private/', import.meta.url));
await mkdir(root, { recursive: true });
let token;
try { token = (await readFile(root + '/pairing.txt', 'utf8')).trim(); }
catch { token = randomBytes(24).toString('base64url'); await writeFile(root + '/pairing.txt', token); }
const port = Number(process.env.BRIDGE_PORT || 8130);
const allowedOrigins = new Set(['https://p0champ.github.io', 'http://localhost:8123', 'http://127.0.0.1:8123', 'http://localhost:18123', 'http://127.0.0.1:18123']);
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/bridge/http/')) {
    httpTransport.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
    return;
  }
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, browser: useExtension ? 'chrome-extension' : 'test-chromium' })); }
  else { res.writeHead(404); res.end(); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
const browserWss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
const extension = new ExtensionBrowser();
const useExtension = process.env.BRIDGE_BROWSER !== 'playwright';
let active = null, context = null;
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
  const send = data => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const timer = setTimeout(() => { if (!paired) ws.close(1008, 'Pairing required'); }, 5000);
  async function addTab(url) {
    if (tabs.size >= 4) throw Error('Close a browser window first (maximum four).');
    if (!useExtension && !context) context = await chromium.launchPersistentContext(root + '/profile', {
      headless: process.env.BRIDGE_HEADLESS !== '0', viewport: { width: 1280, height: 800 },
      args: ['--mute-audio'], acceptDownloads: false,
    });
    if (closed) return;
    if (useExtension && !extension.connected) throw Error('Connect the Sunnyvale extension in Google Chrome first.');
    const page = await (useExtension ? extension.newPage() : context.newPage()), id = randomBytes(8).toString('hex');
    if (useExtension) await page.attach(url);
    const cdp = useExtension ? page.cdp : await context.newCDPSession(page);
    if (closed) { await page.close(); return; }
    const tab = { page, cdp, waiting: false, sentAt: 0, latest: null, timer: null }; tabs.set(id, tab);
    tab.flush = () => {
      clearTimeout(tab.timer); tab.timer = null;
      if (closed || !tabs.has(id) || !tab.latest || tab.waiting) return;
      const delay = Math.max(0, 40 - (Date.now() - tab.sentAt));
      if (delay || ws.bufferedAmount > 256000) { tab.timer = setTimeout(tab.flush, delay || 100); return; }
      tab.waiting = true; tab.sentAt = Date.now();
      send({ type: 'frame', id, data: tab.latest }); tab.latest = null;
    };
    page.on('popup', popup => { const u = popup.url(); popup.close().catch(() => {}); if (/^https?:/.test(u)) addTab(u).catch(e => send({ type: 'error', message: e.message })); });
    page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) send({ type: 'location', id, url: page.url() }); });
    page.on('detached', () => send({ type: 'error', message: 'Chrome stopped sharing this tab. Reopen it from the menu. Your Chrome tab stays open.' }));
    send({ type: 'tab', id, url });
    cdp.on('Page.screencastFrame', async frame => {
      // Bound both network queues and headset decoding: never build up old frames.
      tab.latest = frame.data; tab.flush();
      await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
    if (useExtension) send({ type: 'location', id, url: page.url() });
    else await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => send({ type: 'error', message: 'Page is still loading or could not be reached.' }));
    return id;
  }
  async function command(m) {
    if (closed) return;
    if (!paired) {
      if (m.type !== 'pair' || !validToken(m.token) || (active && active !== ws)) { ws.close(1008, 'Pairing failed or already connected'); return; }
      paired = true; active = ws; clearTimeout(timer); send({ type: 'ready', browserReady: !useExtension || extension.connected }); return;
    }
    if (m.type === 'open') { await addTab(webURL(m.url)); return; }
    const tab = tabs.get(m.id); if (!tab) throw Error('Browser window is closed.');
    const { page, cdp } = tab;
    if (m.type === 'ack') { tab.waiting = false; return; }
    if (m.type === 'close') { clearTimeout(tab.timer); tabs.delete(m.id); await page.close(); return; }
    if (m.type === 'navigate') { await page.goto(webURL(m.url), { waitUntil: 'domcontentloaded' }); return; }
    if (m.type === 'back') { await page.goBack(); return; }
    if (m.type === 'forward') { await page.goForward(); return; }
    if (m.type === 'reload') { await page.reload(); return; }
    if (m.type === 'text') { await cdp.send('Input.insertText', { text: String(m.text).slice(0, 8000) }); return; }
    if (m.type === 'key' && ['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(m.key)) { await page.keyboard.press(m.key); return; }
    const x = Math.max(0, Math.min(1279, Number(m.x))), y = Math.max(0, Math.min(799, Number(m.y)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Invalid pointer position.');
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
    if (++pending > 100) { ws.close(1008, 'Too many queued inputs'); return; }
    sequence = sequence.then(() => command(m)).catch(e => send({ type: 'error', message: e.message })).finally(() => pending--);
  });
  ws.on('error', () => {});
  ws.on('close', () => {
    closed = true; clearTimeout(timer); if (active === ws) active = null;
    for (const t of tabs.values()) { clearTimeout(t.timer); t.page.close().catch(() => {}); }
    tabs.clear();
  });
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Sunnyvale browser bridge ready on http://127.0.0.1:${port}`);
  console.log('Your private pairing code is saved in bridge/private/pairing.txt');
  console.log('PC test: ws://localhost:' + port + '/bridge');
  console.log('Quest: use a secure tunnel to this port, then wss://YOUR-TUNNEL/bridge');
  console.log(useExtension ? 'Browser: your regular Google Chrome, through the Sunnyvale extension.' : 'Browser: isolated test Chromium.');
});
// Optional HTTPS relay. Only the authenticated WebSocket is exposed, never project files.
let tunnel;
const tunnelExe = fileURLToPath(new URL('./bin/cloudflared.exe', import.meta.url));
if (process.env.BRIDGE_TUNNEL === '1' && existsSync(tunnelExe)) {
  tunnel = spawn(tunnelExe, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { windowsHide: true });
  tunnel.stderr.on('data', async data => {
    const match = String(data).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!match) return;
    const link = 'https://p0champ.github.io/sunnyvale-study/#' + new URLSearchParams({ bridge: match[0].replace('https:', 'wss:') + '/bridge', pair: token });
    await writeFile(root + '/Open Sunnyvale.url', '[InternetShortcut]\r\nURL=' + link + '\r\n');
    console.log('Your private Quest link is ready: bridge/private/Open Sunnyvale.url');
    console.log('Keep this link private. It pairs the headset without typing the code.');
  });
  tunnel.on('error', () => console.log('Secure relay could not start. Restart the bridge.'));
}
async function shutdown() { tunnel?.kill(); httpTransport.close(); for (const ws of wss.clients) ws.close(); for (const ws of browserWss.clients) ws.close(); await context?.close(); server.close(); }
process.on('SIGINT', () => shutdown().finally(() => process.exit()));
