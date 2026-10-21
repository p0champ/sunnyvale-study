import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

test('HTTPS transport: auth, CORS, pairing, streaming, input, close, and actual browser fallback', { timeout: 90000 }, async () => {
  const dir = fileURLToPath(new URL('./private/http-test-' + Date.now(), import.meta.url)); await mkdir(dir, { recursive: true });
  const events = [];
  const fixture = http.createServer((req, res) => {
    if (req.url.startsWith('/event')) { events.push(decodeURIComponent(req.url)); res.end('ok'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<body style="margin:0;height:3000px;background:#375"><input style="position:absolute;left:20px;top:20px;width:300px;height:60px" oninput="fetch('/event?text='+encodeURIComponent(this.value))"><button style="position:absolute;left:20px;top:100px;width:300px;height:60px" onclick="fetch('/event?click=yes')">Click</button><script>onscroll=()=>fetch('/event?scroll='+scrollY)</script>`);
  });
  await new Promise(r => fixture.listen(18151, '127.0.0.1', r));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('.', import.meta.url)), windowsHide: true,
    env: { ...process.env, BRIDGE_PORT: '18150', BRIDGE_PRIVATE_DIR: dir, BRIDGE_TUNNEL: '0', BRIDGE_BROWSER: 'playwright' }, stdio: 'ignore' });
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn) { for (let i = 0; i < 250; i++) { const result = await fn(); if (result) return result; await pause(100); } throw Error('Timed out'); }
  const base = 'http://127.0.0.1:18150/bridge/http/';
  async function request(path, credential, body, origin = 'http://localhost:18123') {
    return fetch(base + path, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer ' + credential, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }
  let browser, session;
  try {
    await until(async () => { try { return (await fetch('http://127.0.0.1:18150/health')).ok; } catch { return false; } });
    const token = (await readFile(dir + '/pairing.txt', 'utf8')).trim();
    assert.equal((await request('connect', 'wrong')).status, 401);
    assert.equal((await request('connect', token, {}, 'https://untrusted.example')).status, 403);
    const preflight = await fetch(base + 'connect', { method: 'OPTIONS', headers: { Origin: 'http://localhost:18123', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'http://localhost:18123');
    const response = await request('connect', token); assert.equal(response.status, 200); session = (await response.json()).session;
    assert.notEqual(session, token); assert.equal((await request('connect', token)).status, 409);
    assert.equal((await request('poll', 'wrong')).status, 401);
    const first = await (await request('poll', session)).json(); assert.equal(first.messages[0].type, 'ready');
    const messages = [];
    async function pollUntil(check) {
      for (let i = 0; i < 15; i++) {
        const result = await (await request('poll', session)).json(); messages.push(...result.messages);
        for (const m of result.messages) if (m.type === 'frame') await send({ type: 'ack', id: m.id });
        const match = check(); if (match) return match;
      }
      throw Error('Expected bridge message not received');
    }
    async function send(data) { assert.equal((await request('send', session, { data: JSON.stringify(data) })).status, 200); }
    await send({ type: 'open', url: 'http://127.0.0.1:18151' });
    const tab = await pollUntil(() => messages.find(m => m.type === 'tab'));
    const frame = await pollUntil(() => messages.find(m => m.type === 'frame')); assert.ok([137, 255].includes(Buffer.from(frame.data, 'base64')[0]));
    await pause(300);
    await send({ type: 'click', id: tab.id, x: 90, y: 130 }); await until(() => events.includes('/event?click=yes'));
    await send({ type: 'click', id: tab.id, x: 90, y: 40 }); await send({ type: 'text', id: tab.id, text: 'HTTPS fallback' });
    await until(() => events.some(e => e.includes('HTTPS fallback')));
    await send({ type: 'scroll', id: tab.id, x: 640, y: 400, delta: 600 }); await until(() => events.includes('/event?scroll=600'));
    assert.equal((await request('close', session)).status, 200); assert.equal((await request('poll', session)).status, 401); session = null;
    // Run the real browser client with WebSocket intentionally unable to open.
    browser = await chromium.launch(); const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const timer = setTimeout.bind(window); window.setTimeout = (fn, ms, ...args) => timer(fn, ms === 5000 ? 30 : ms, ...args);
      window.WebSocket = class { static OPEN = 1; readyState = 0; close() { this.readyState = 3; this.onclose?.({ code: 1000 }); } };
    });
    const client = await readFile(new URL('../browser-bridge.js', import.meta.url), 'utf8');
    const https = await readFile(new URL('../bridge-https.js', import.meta.url), 'utf8');
    const media = await readFile(new URL('../browser-media.js', import.meta.url), 'utf8');
    // Model the public HTTPS relay. Direct cross-origin loopback fetches are
    // deliberately restricted by newer Chrome and aren't our production route.
    await page.route('https://bridge.test/bridge/http/**', async route => {
      const request = route.request();
      const headers = new Headers(request.headers()); headers.set('Origin', 'http://localhost:18123');
      const response = await fetch('http://127.0.0.1:18150' + new URL(request.url()).pathname, {
        method: request.method(), headers, body: request.postData() || undefined,
      });
      const body = await response.text();
      if (!page.isClosed()) await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    });
    await page.route('http://localhost:18123/browser-bridge.js', r => r.fulfill({ body: client, contentType: 'application/javascript' }));
    await page.route('http://localhost:18123/bridge-https.js*', r => r.fulfill({ body: https, contentType: 'application/javascript' }));
    await page.route('http://localhost:18123/browser-media.js*', r => r.fulfill({ body: media, contentType: 'application/javascript' }));
    await page.route('http://localhost:18123/', r => r.fulfill({ contentType: 'text/html', body: `<details id="bridgeSettings"></details><script type="module">import {installBrowserBridge} from './browser-bridge.js';window.bridge=installBrowserBridge({status:()=>{}});</script>` }));
    await page.goto('http://localhost:18123/', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.bridge);
    await page.evaluate(token => { document.getElementById('bridgeURL').value = 'wss://bridge.test/bridge'; document.getElementById('bridgeToken').value = token; document.getElementById('bridgeConnect').click(); }, token);
    await page.waitForFunction(() => window.bridge.connected, null, { timeout: 15000 }).catch(async error => {
      throw Error(error.message + ': ' + await page.locator('#bridgeStatus').textContent() + '; page errors: ' + JSON.stringify(errors));
    });
    assert.match(await page.locator('#bridgeStatus').textContent(), /Connected through secure HTTPS/);
    assert.deepEqual(errors, []);
    await page.locator('#bridgeDisconnect').evaluate(e => e.click());
  } finally {
    if (session) await request('close', session).catch(() => {});
    await browser?.close(); child.kill(); fixture.close();
  }
});
