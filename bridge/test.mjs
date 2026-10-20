import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';

test('private pairing, streamed tabs, click, keyboard, scroll, close, invalid URLs', { timeout: 90000 }, async () => {
  const dir = fileURLToPath(new URL('./private/test-profile', import.meta.url));
  await mkdir(dir, { recursive: true });
  let received = [];
  const fixture = http.createServer((req, res) => {
    if (req.url.startsWith('/event')) { received.push(decodeURIComponent(req.url)); res.end('ok'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<body style="margin:0;height:3000px;background:#375"><input style="position:absolute;left:20px;top:20px;width:300px;height:60px" oninput="fetch('/event?text='+encodeURIComponent(this.value))"><button style="position:absolute;left:20px;top:100px;width:300px;height:60px" onclick="fetch('/event?click=yes')">Click</button><script>onscroll=()=>fetch('/event?scroll='+scrollY)</script>`);
  });
  await new Promise(r => fixture.listen(18131, '127.0.0.1', r));
  const process = spawn(globalThis.process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('.', import.meta.url)), windowsHide: true,
    env: { ...globalThis.process.env, BRIDGE_PORT: '18130', BRIDGE_PRIVATE_DIR: dir, BRIDGE_TUNNEL: '0', BRIDGE_BROWSER: 'playwright' }, stdio: 'ignore' });
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn) { for (let i = 0; i < 300; i++) { const v = await fn(); if (v) return v; await pause(100); } throw Error('Timed out'); }
  let ws;
  try {
    await until(async () => { try { return (await fetch('http://127.0.0.1:18130/health')).ok; } catch { return false; } });
    const token = (await readFile(dir + '/pairing.txt', 'utf8')).trim();
    const bad = new WebSocket('ws://localhost:18130/bridge', { origin: 'http://localhost:8123' });
    await new Promise(r => bad.once('open', r)); bad.send(JSON.stringify({ type: 'pair', token: 'wrong' }));
    assert.equal(await new Promise(r => bad.once('close', r)), 1008);
    ws = new WebSocket('ws://localhost:18130/bridge', { origin: 'http://localhost:8123' });
    let messages = [];
    ws.on('message', raw => { const m = JSON.parse(raw); messages.push(m); if (m.type === 'frame') ws.send(JSON.stringify({ type: 'ack', id: m.id })); });
    await new Promise(r => ws.once('open', r));
    const send = m => ws.send(JSON.stringify(m));
    send({ type: 'pair', token }); await until(() => messages.find(m => m.type === 'ready'));
    send({ type: 'open', url: 'file:///C:/Windows/win.ini' });
    await until(() => messages.find(m => m.type === 'error'));
    send({ type: 'open', url: 'http://127.0.0.1:18131' });
    const tab = await until(() => messages.find(m => m.type === 'tab'));
    const frame = await until(() => messages.find(m => m.type === 'frame'));
    assert.ok([137, 255].includes(Buffer.from(frame.data, 'base64')[0]));
    await pause(1000);
    send({ type: 'click', id: tab.id, x: 90, y: 130 }); await until(() => received.find(x => x.includes('click=yes')));
    send({ type: 'click', id: tab.id, x: 90, y: 40 }); send({ type: 'text', id: tab.id, text: 'Sunnyvale test' });
    await until(() => received.find(x => x.includes('Sunnyvale test')));
    send({ type: 'scroll', id: tab.id, x: 640, y: 400, delta: 600 }); await until(() => received.find(x => x.includes('scroll=600')));
    send({ type: 'open', url: 'http://127.0.0.1:18131/second' }); await until(() => messages.filter(m => m.type === 'tab').length === 2);
    send({ type: 'close', id: tab.id }); send({ type: 'text', id: tab.id, text: 'closed' });
    await until(() => messages.find(m => m.type === 'error' && m.message.includes('closed')));
    assert.ok(received.length >= 3);
  } finally {
    ws?.close(); process.kill(); fixture.close();
    // Test profile is private and ignored, retained for diagnosing failed browser starts.
  }
});
