import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import { extensionId } from './extension-browser.mjs';

test('real extension reuses Chrome session, streams, clicks, types, scrolls, and preserves tab on close', { timeout: 90000 }, async () => {
  const dir = fileURLToPath(new URL('./private/extension-test', import.meta.url));
  const extensionPath = fileURLToPath(new URL('./chrome-extension', import.meta.url));
  await mkdir(dir, { recursive: true });
  const events = [];
  const fixture = http.createServer((req, res) => {
    if (req.url.startsWith('/event')) { events.push({ url: decodeURIComponent(req.url), cookie: req.headers.cookie }); res.end('ok'); return; }
    res.setHeader('Content-Type', 'text/html'); res.setHeader('Set-Cookie', 'test_session=remembered; Path=/; SameSite=Lax');
    res.end(`<body style="margin:0;height:3000px;background:#375"><input style="position:absolute;left:20px;top:20px;width:300px;height:60px" oninput="fetch('/event?text='+encodeURIComponent(this.value))"><button style="position:absolute;left:20px;top:100px;width:300px;height:60px" onclick="fetch('/event?click=yes')">Click</button><script>onscroll=()=>fetch('/event?scroll='+scrollY)</script>`);
  });
  await new Promise(r => fixture.listen(18141, '127.0.0.1', r));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('.', import.meta.url)), windowsHide: true,
    env: { ...process.env, BRIDGE_PORT: '18140', BRIDGE_PRIVATE_DIR: dir, BRIDGE_TUNNEL: '0', BRIDGE_BROWSER: 'extension' }, stdio: 'ignore' });
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn) { for (let i = 0; i < 250; i++) { const result = await fn(); if (result) return result; await pause(100); } throw Error('Timed out'); }
  let context, ws;
  try {
    await until(async () => { try { return (await fetch('http://127.0.0.1:18140/health')).ok; } catch { return false; } });
    const token = (await readFile(dir + '/pairing.txt', 'utf8')).trim();
    const bad = new WebSocket('ws://127.0.0.1:18140/browser', { origin: 'chrome-extension://' + extensionId });
    await new Promise(r => bad.once('open', r)); bad.send(JSON.stringify({ type: 'pair-browser', token: 'wrong' }));
    assert.equal(await new Promise(r => bad.once('close', r)), 1008, 'Browser connection requires private pairing');
    context = await chromium.launchPersistentContext(dir + '/chrome-' + Date.now(), { channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const existing = await context.newPage(); await existing.goto('http://127.0.0.1:18141/already-open');
    await existing.evaluate(() => { localStorage.setItem('remember-me', 'yes'); window.retainedTab = true; });
    await worker.evaluate(async ({ token }) => { await chrome.storage.local.set({ token, port: 18140, enabled: true }); await Promise.all([connect(), connect()]); }, { token });
    await until(() => worker.evaluate(() => message.startsWith('Connected.'))).catch(async error => {
      throw Error(error.message + ': ' + await worker.evaluate(() => message));
    });
    const messages = [];
    ws = new WebSocket('ws://127.0.0.1:18140/bridge', { origin: 'http://localhost:8123' });
    ws.on('message', raw => { const m = JSON.parse(raw); messages.push(m); if (m.type === 'frame') ws.send(JSON.stringify({ type: 'ack', id: m.id })); });
    await new Promise(r => ws.once('open', r));
    const send = m => ws.send(JSON.stringify(m));
    send({ type: 'pair', token }); await until(() => messages.find(m => m.type === 'ready' && m.browserReady));
    send({ type: 'open', url: 'http://127.0.0.1:18141/new-request' });
    const tab = await until(() => messages.find(m => m.type === 'tab'));
    await until(() => messages.find(m => m.type === 'frame'));
    assert.equal(await existing.evaluate(() => window.retainedTab), true, 'Existing tab was reused without a reload');
    assert.equal(context.pages().filter(p => p.url().includes(':18141')).length, 1);
    assert.equal(await worker.evaluate(async () => { const t = [...tabs.values()][0]; return (await chrome.tabs.get(t.tabId)).mutedInfo.muted; }), true);
    send({ type: 'click', id: tab.id, x: 90, y: 130 }); await until(() => events.find(e => e.url.includes('click=yes')));
    send({ type: 'click', id: tab.id, x: 90, y: 40 }); send({ type: 'text', id: tab.id, text: 'Remembered Chrome' });
    await until(() => events.find(e => e.url.includes('Remembered Chrome')));
    send({ type: 'scroll', id: tab.id, x: 640, y: 400, delta: 600 }); await until(() => events.find(e => e.url.includes('scroll=600')));
    assert.ok(events.every(e => e.cookie?.includes('test_session=remembered')));
    send({ type: 'close', id: tab.id });
    await until(() => worker.evaluate(() => tabs.size === 0));
    assert.equal(existing.isClosed(), false); assert.equal(await existing.evaluate(() => localStorage.getItem('remember-me')), 'yes');
    assert.equal(await worker.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url.includes(':18141')).mutedInfo.muted), false);
    send({ type: 'open', url: 'http://127.0.0.1:18141/reopen' });
    await until(() => messages.filter(m => m.type === 'tab').length === 2);
    assert.equal(await existing.evaluate(() => window.retainedTab), true);
  } finally {
    ws?.close(); await context?.close(); child.kill(); fixture.close();
  }
});
