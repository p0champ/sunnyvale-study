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
    res.end(`<title>Bridge fixture</title><body style="margin:0;height:3000px;background:#375"><input style="position:absolute;left:20px;top:20px;width:300px;height:60px" oninput="fetch('/event?text='+encodeURIComponent(this.value))"><button style="position:absolute;left:20px;top:100px;width:300px;height:60px" onclick="fetch('/event?click=yes')">Click</button><p style="position:absolute;left:400px;top:300px">Visible study text</p><script>onmousemove=e=>window.lastMove={x:e.clientX,y:e.clientY};onscroll=()=>fetch('/event?scroll='+scrollY)</script>`);
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
    context = await chromium.launchPersistentContext(dir + '/chrome-' + Date.now(), { channel: 'chromium', headless: true, ignoreDefaultArgs: ['--mute-audio'],
      // Only this disposable Chromium test permits capture without a toolbar click.
      // Real Chrome requires the user's extension action; production never uses this flag.
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, `--allowlisted-extension-id=${extensionId}`] });
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
    send({type:'move',id:tab.id,x:90,y:140});await until(()=>existing.evaluate(()=>window.lastMove?.x===90&&window.lastMove?.y===140));
    send({type:'page-info',id:tab.id,reqId:'fixture-info'});
    const info=await until(()=>messages.find(m=>m.type==='page-info'&&m.reqId==='fixture-info'));
    assert.equal(info.title,'Bridge fixture');assert.ok(info.text.includes('Visible study text'));
    assert.ok(!info.text.includes('Remembered Chrome'),'Text inspection excludes input values');
    assert.equal(await worker.evaluate(async()=>{
      const original=chrome.debugger.sendCommand.bind(chrome.debugger);let failed=false;
      chrome.debugger.sendCommand=async(target,method,params)=>{if(method==='Page.captureScreenshot'&&!failed){failed=true;throw Error('Not attached to an active page');}return original(target,method,params);};
      try{const shot=await sendCDP([...tabs.values()][0],'Page.captureScreenshot',{format:'png'});return failed&&shot.data.startsWith('iVBOR');}finally{chrome.debugger.sendCommand=original;}
    }),true,'Screenshot retries exactly once after a missing-page attachment');
    const still = await until(() => messages.find(m => m.type === 'frame' && m.data.startsWith('iVBOR')));
    const png = Buffer.from(still.data, 'base64');
    assert.equal(png.readUInt32BE(16), 1280, 'Idle text is sent losslessly at the page size');
    assert.equal(await existing.evaluate(() => devicePixelRatio), 1, 'The page keeps the screen pixel ratio, so clicks are not scaled');
    assert.equal(png.readUInt32BE(20), 800);
    const beforeAnimation = messages.length;
    await existing.evaluate(() => {
      const box = document.createElement('div'); box.style.cssText = 'position:fixed;right:20px;top:200px;width:32px;height:32px'; document.body.append(box);
      window.busyAnimation = setInterval(() => { box.style.background = `rgb(${Math.floor(Math.random()*255)},20,30)`; }, 60);
    });
    await until(() => messages.slice(beforeAnimation).filter(m => m.type === 'frame').length >= 4);
    for (const image of messages.slice(beforeAnimation).filter(m => m.type === 'frame')) {
      const data = Buffer.from(image.data, 'base64');
      assert.ok(image.data.startsWith('iVBOR'), 'Animations never substitute the low-resolution cast JPEG');
      assert.equal(data.readUInt32BE(16), 1280, 'Animated pages retain full-resolution text');
    }
    await existing.evaluate(() => clearInterval(busyAnimation));
    send({ type: 'text-scale', id: tab.id, delta: 1 });
    await until(() => messages.find(m => m.type === 'viewport' && m.width === 1120));
    await until(() => messages.find(m => m.type === 'frame' && m.data.startsWith('iVBOR') && Buffer.from(m.data, 'base64').readUInt32BE(16) === 1120));
    send({ type: 'mic-start', id: tab.id });
    await until(() => messages.find(m => m.type === 'mic-status' && m.enabled));
    await existing.evaluate(async () => {
      window.originalMedia = navigator.mediaDevices.getUserMedia;
      window.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      window.voiceContext = new AudioContext(); await voiceContext.resume();
      window.voiceMeter = voiceContext.createAnalyser(); voiceContext.createMediaStreamSource(voiceStream).connect(voiceMeter);
    });
    const samples = Buffer.alloc(4800);
    for (let i = 0; i < 2400; i++) samples.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 24000) * 16000), i * 2);
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      send({ type: 'mic-data', id: tab.id, rate: 24000, data: samples.toString('base64') });
      await pause(100);
      peak = Math.max(peak, await existing.evaluate(() => { const values = new Float32Array(voiceMeter.fftSize); voiceMeter.getFloatTimeDomainData(values); return Math.max(...values.map(Math.abs)); }));
    }
    assert.ok(peak > .1, 'Remote microphone reaches the website as a live audio track');
    send({ type: 'mic-stop', id: tab.id }); await until(() => messages.find(m => m.type === 'mic-status' && !m.enabled));
    assert.equal(await existing.evaluate(() => voiceStream.getTracks()[0].readyState), 'ended', 'Stopping sharing ends website microphone tracks');
    assert.equal(await existing.evaluate(() => !!window.__sunnyvaleMicrophone), false);
    await worker.evaluate(async () => { const item = [...tabs.values()][0]; await startAudio(item.tabId); });
    await existing.evaluate(async () => { window.toneContext = new AudioContext(); await toneContext.resume(); window.tone = toneContext.createOscillator(); tone.connect(toneContext.destination); tone.start(); });
    const audio = await until(() => messages.find(m => m.type === 'audio' && Buffer.from(m.data, 'base64').some(x => x !== 0))).catch(async error => {
      throw Error(error.message + ': audio packets=' + messages.filter(m => m.type === 'audio').length + ' capture=' + JSON.stringify(await worker.evaluate(async () => ({ captures: await chrome.tabCapture.getCapturedTabs(), tabs: (await chrome.tabs.query({})).map(t => ({ muted: t.mutedInfo, audible: t.audible })), contexts: (await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length }))));
    });
    assert.equal(audio.rate, 24000, 'Real captured tab sound reaches the authenticated headset connection');
    await existing.evaluate(() => { tone.stop(); toneContext.close(); voiceContext.close(); });
    send({ type: 'close', id: tab.id });
    await until(() => worker.evaluate(() => tabs.size === 0));
    assert.equal(existing.isClosed(), false); assert.equal(await existing.evaluate(() => localStorage.getItem('remember-me')), 'yes');
    assert.equal(await worker.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url.includes(':18141')).mutedInfo.muted), false);
    send({ type: 'open', url: 'http://127.0.0.1:18141/reopen' });
    await until(() => messages.filter(m => m.type === 'tab').length === 2);
    assert.equal(await existing.evaluate(() => window.retainedTab), true);
    send({ type: 'close', id: messages.filter(m => m.type === 'tab')[1].id }); await until(() => worker.evaluate(() => tabs.size === 0));
    await new Promise(resolve => { ws.once('close', resolve); ws.close(); }); await pause(100);
    // Exercise the same media over the HTTPS-fallback protocol used on Quest.
    let session;
    const request = async (path, body = {}) => {
      const response = await fetch('http://127.0.0.1:18140/bridge/http/' + path, { method: 'POST', headers: { Origin: 'http://localhost:8123', Authorization: 'Bearer ' + (session || token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200); return response.json();
    };
    session = (await request('connect')).session;
    const received = [];
    const httpSend = (...items) => request('send', { messages: items.map(item => JSON.stringify(item)) });
    const receive = async check => {
      for (let i = 0; i < 20; i++) {
        const result = await request('poll'); received.push(...result.messages);
        const acks = result.messages.filter(m => m.type === 'frame').map(m => ({ type: 'ack', id: m.id })); if (acks.length) await httpSend(...acks);
        if (check()) return check();
      }
      throw Error('Expected media over HTTPS fallback');
    };
    await request('poll'); await httpSend({ type: 'open', url: 'http://127.0.0.1:18141' });
    const httpTab = await receive(() => received.find(m => m.type === 'tab'));
    await httpSend({ type: 'mic-start', id: httpTab.id }); await receive(() => received.find(m => m.type === 'mic-status' && m.enabled));
    await existing.evaluate(async () => { window.httpVoice = await navigator.mediaDevices.getUserMedia({audio:true}); window.httpContext = new AudioContext(); await httpContext.resume(); window.httpMeter = httpContext.createAnalyser(); httpContext.createMediaStreamSource(httpVoice).connect(httpMeter); });
    await httpSend(...Array.from({length:3}, () => ({ type: 'mic-data', id: httpTab.id, rate: 24000, data: samples.toString('base64') })));
    await existing.waitForFunction(() => { const a = new Float32Array(httpMeter.fftSize); httpMeter.getFloatTimeDomainData(a); return a.some(v => Math.abs(v) > .1); });
    await httpSend({ type: 'audio-start', id: httpTab.id }); await receive(() => received.find(m => m.type === 'audio-status' && m.enabled));
    await existing.evaluate(async () => { window.httpToneContext = new AudioContext(); await httpToneContext.resume(); window.httpTone = httpToneContext.createOscillator(); httpTone.connect(httpToneContext.destination); httpTone.start(); });
    await receive(() => received.find(m => m.type === 'audio' && Buffer.from(m.data, 'base64').some(x => x !== 0)));
    await existing.evaluate(() => { httpTone.stop(); httpToneContext.close(); httpContext.close(); });
    await request('close'); await until(() => worker.evaluate(() => tabs.size === 0));
    await until(() => existing.evaluate(() => httpVoice.getTracks()[0].readyState === 'ended'));
    assert.equal(await existing.evaluate(() => httpVoice.getTracks()[0].readyState), 'ended', 'HTTPS disconnection stops the remote microphone');
  } finally {
    ws?.close(); await context?.close(); child.kill(); fixture.close();
  }
});
