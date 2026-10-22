import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { extensionId } from './extension-browser.mjs';
import { BrowserMedia } from '../browser-media.js';
import { createAudioReceiver } from '../browser-voice-link.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async check => { for (let n = 0; n < 200; n++) { if (await check()) return; await pause(25); } throw Error('Voice fixture timed out'); };
const bridgeRoot = fileURLToPath(new URL('.', import.meta.url));
async function freePort() { const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }

async function simulate({ speech, film = false, duration = 2200 }) {
  const root = await mkdtemp(join(tmpdir(), 'sunnyvale-voice-'));
  const port = await freePort(), sockets = [], timers = new Set(), captures = [], arrivals = [];
  const proxy = http.createServer(), proxyWss = new WebSocketServer({ noServer: true });
  let child, extension, headset, audio, cast, pcm, buildClient, buildJob;
  let extensionTab, browserTab, sent = 0, playing = true, frames = 0, rttPeak = 0;
  const extensionTabs = [];
  const send = (socket, packet) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(packet)); };
  const media = new BrowserMedia(() => {}, () => {}), started = performance.now();
  media.context = { state: 'running', get currentTime() { return (performance.now() - started) / 1000; }, destination: {},
    createBuffer: (_channels, count, rate) => ({ duration: count / rate, copyToChannel() {} }),
    createBufferSource: () => ({ playbackRate: { value: 1 }, connect() {},
      start(at) { const timer = setTimeout(() => { timers.delete(timer); this.onended?.(); }, Math.max(0, at + this.buffer.duration / this.playbackRate.value - media.context.currentTime) * 1000); timers.add(timer); this.timer = timer; },
      stop() { clearTimeout(this.timer); timers.delete(this.timer); this.onended?.(); } }) };
  try {
    child = spawn(process.execPath, ['server.mjs'], { cwd: bridgeRoot, windowsHide: true, stdio: 'ignore', env: { ...process.env, BRIDGE_PRIVATE_DIR: root, BRIDGE_PORT: String(port), BRIDGE_BROWSER: 'extension', BRIDGE_TUNNEL: '0' } });
    await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { return false; } });
    const token = (await readFile(join(root, 'pairing.txt'), 'utf8')).trim();
    extension = new WebSocket(`ws://127.0.0.1:${port}/browser`, { origin: `chrome-extension://${extensionId}` }); sockets.push(extension);
    extension.on('message', raw => {
      const m = JSON.parse(raw); if (m.type !== 'command') return;
      let result = {};
      if (m.command === 'open') { extensionTabs.push(m.id); extensionTab ||= m.id; result = { url: m.url, title: 'Synthetic voice fixture', audioEnabled: true }; }
      if (m.method === 'Page.captureScreenshot') {
        captures.push({ at: performance.now(), format: m.params.format });
        result = { data: Buffer.alloc(m.params.format === 'png' ? 500000 : 60000, 65 + captures.length % 20).toString('base64') };
      }
      send(extension, { type: 'result', request: m.request, result });
    });
    await once(extension, 'open'); const extensionReady = once(extension, 'message'); send(extension, { type: 'pair-browser', token }); await extensionReady;
    proxy.on('upgrade', (req, socket, head) => proxyWss.handleUpgrade(req, socket, head, downstream => {
      const upstream = new WebSocket(`ws://127.0.0.1:${port}${req.url}`, { origin: 'http://localhost:18123' }); sockets.push(downstream, upstream);
      const queue = []; let flushing = false;
      const flush = async () => {
        if (flushing) return; flushing = true;
        while (queue.length && downstream.readyState === WebSocket.OPEN) {
          const packet = queue.shift(), speed = speech ? (req.url === '/bridge-audio' ? 85000 : 150000) : 2500000;
          await pause(packet.length / speed * 1000);
          if (downstream.readyState === WebSocket.OPEN) downstream.send(packet);
        }
        flushing = false;
      };
      upstream.on('message', packet => { queue.push(packet); flush(); });
      downstream.on('message', packet => { if (upstream.readyState === WebSocket.OPEN) upstream.send(packet); else upstream.once('open', () => upstream.send(packet)); });
      for (const peer of [upstream, downstream]) peer.on('error', () => {});
      upstream.on('close', () => downstream.close()); downstream.on('close', () => upstream.close());
    }));
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const base = `ws://127.0.0.1:${proxy.address().port}`;
    let ready;
    const receiver = createAudioReceiver({ play: packet => { arrivals.push(performance.now()); media.play(packet.id, packet.data, packet.rate); }, acknowledge: seq => send(headset, { type: 'audio-ack', seq }) });
    headset = new WebSocket(base + '/bridge', { origin: 'http://localhost:18123' }); sockets.push(headset);
    headset.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.type === 'ready') ready = m;
      if (m.type === 'tab') browserTab ||= m.id;
      if (m.type === 'frame') { frames++; send(headset, { type: 'ack', id: m.id }); }
      if (m.type === 'rtt-ping') { rttPeak = Math.max(rttPeak, Date.now() - m.t); send(headset, { type: 'rtt-pong', t: m.t }); }
      if (m.type === 'audio') receiver(m);
      if (m.type === 'world-call') setTimeout(() => send(headset, { type: 'world-result', reqId: m.reqId, ok: true, result: 'Synthetic build finished' }), 30);
    });
    await once(headset, 'open'); send(headset, { type: 'pair', token, audioProtocol: 1 }); await until(() => ready);
    let audioReady = false;
    audio = new WebSocket(base + '/bridge-audio', { origin: 'http://localhost:18123' }); sockets.push(audio);
    audio.on('message', raw => { const packet = JSON.parse(raw); if (packet.type === 'audio-ready') audioReady = true; if (packet.type === 'audio') receiver(packet); });
    await once(audio, 'open'); send(audio, { type: 'pair-audio', token, key: ready.audioKey }); await until(() => audioReady);
    send(headset, { type: 'open', url: film ? 'https://youtube.com/fixture' : 'https://claude.ai/fixture' }); await until(() => browserTab);
    const samples = Buffer.alloc(4800); for (let n = 0; n < 2400; n++) samples.writeInt16LE(Math.round(9000 * Math.sin(n / 8)), n * 2);
    const tone = samples.toString('base64'), silence = Buffer.alloc(4800).toString('base64');
    pcm = setInterval(() => { sent++; send(extension, { type: 'event', id: extensionTab, method: 'bridge.audio', params: { rate: 24000, data: playing && (speech || film) ? tone : silence } }); }, 100);
    cast = setInterval(() => { for (const id of extensionTabs) send(extension, { type: 'event', id, method: 'Page.screencastFrame', params: {} }); }, 100);
    if (speech) {
      const openOthers = setTimeout(() => { timers.delete(openOthers); for (let n = 0; n < 3; n++) send(headset, { type: 'open', url: `https://fixture.invalid/window-${n}` }); }, 200);
      timers.add(openOthers);
      const secret = (await readFile(join(root, 'connector.txt'), 'utf8')).trim();
      buildClient = new Client({ name: 'isolated-voice-build-fixture', version: '1' });
      await buildClient.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer ' + secret } } }));
      buildJob = Promise.all(Array.from({ length: 12 }, (_, n) => buildClient.callTool({ name: 'add_note', arguments: { text: `Synthetic note ${n}: ` + 'fixture '.repeat(400) } })));
      await pause(duration - 2000); playing = false; await pause(2000); await buildJob;
    } else await pause(duration);
    clearInterval(pcm); pcm = null; clearInterval(cast); cast = null;
    await until(() => arrivals.length === sent);
    const gaps = arrivals.slice(1).map((at, n) => at - arrivals[n]);
    return { windows: extensionTabs.length, packets: sent, received: arrivals.length, maxGap: Math.round(Math.max(0, ...gaps)), underruns: media.voiceStats.underruns, dropped: media.voiceStats.dropped, frames, captures: captures.length, formats: [...new Set(captures.map(item => item.format))], rttPeak: Math.round(rttPeak) };
  } finally {
    clearInterval(pcm); clearInterval(cast); media.stopAll();
    for (const timer of timers) clearTimeout(timer);
    await buildClient?.close().catch(() => {});
    for (const socket of sockets) socket.terminate(); proxyWss.close(); await new Promise(resolve => proxy.close(resolve));
    child?.kill(); await pause(250);
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test('voice survives a shaped picture stream and concurrent world builds without missing packets or words', { timeout: 40000 }, async t => {
  const result = await simulate({ speech: true, duration: 9500 }); t.diagnostic(JSON.stringify(result));
  assert.equal(result.windows, 4);
  assert.equal(result.received, result.packets); assert.ok(result.maxGap < 300); assert.equal(result.underruns, 0); assert.equal(result.dropped, 0);
  assert.ok(result.frames >= 2); assert.ok(result.formats.includes('jpeg')); assert.ok(result.rttPeak > 700, 'The fixture must really congest the picture stream');
  const folder = new URL('./private/', import.meta.url); await mkdir(folder, { recursive: true }); await writeFile(new URL('voice-simulation-latest.json', folder), JSON.stringify({ at: new Date().toISOString(), scenario: 'four busy windows, 150 KB/s pictures, 85 KB/s voice, twelve concurrent world tools', ...result }, null, 2));
});

for (const film of [false, true]) test(film ? 'ordinary movie sound does not activate Claude picture throttling' : 'Sound ON with silence leaves the normal sharp picture path active', { timeout: 15000 }, async () => {
  const result = await simulate({ speech: false, film }); assert.ok(result.captures >= 5); assert.deepEqual(result.formats, ['png']);
});
