import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import http from 'node:http';

test('headset audio: real microphone worklet, PCM playback, stop, cancelled permission and denial', { timeout: 60000 }, async (t) => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  let server;
  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const media = await readFile(new URL('../browser-media.js', import.meta.url), 'utf8');
    const worklet = await readFile(new URL('./chrome-extension/pcm-worklet.js', import.meta.url), 'utf8');
    server = http.createServer((request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
      if (path.endsWith('browser-media.js')) return response.end(media);
      if (path.endsWith('pcm-worklet.js')) return response.end(worklet);
      response.end('<button>Start</button><script type="module">import {BrowserMedia} from "./browser-media.js"; window.packets=[];window.notices=[];window.media=new BrowserMedia(m=>packets.push(m),m=>notices.push(m));document.querySelector("button").onclick=()=>media.toggleMic("claude");</script>');
    });
    await new Promise(resolve => server.listen(18161, '127.0.0.1', resolve));
    await page.goto('http://127.0.0.1:18161/'); await page.waitForFunction(() => window.media); t.diagnostic('media module loaded');
    await page.getByRole('button').click();
    await page.waitForFunction(() => media.microphone?.pending || notices.length);
    assert.equal(await page.evaluate(() => !!media.microphone?.pending), true, (await page.evaluate(() => notices)).join(' ')); t.diagnostic('microphone acquired');
    await page.evaluate(() => media.micReady('claude', true));
    await page.waitForFunction(() => packets.filter(p => p.type === 'mic-data').length >= 3); t.diagnostic('PCM captured');
    assert.equal(await page.evaluate(() => packets.filter(p => p.type === 'mic-start').length), 1);
    await page.waitForFunction(() => packets.some(p => p.type === 'mic-data' && atob(p.data).split('').some(c => c.charCodeAt(0) !== 0)), { timeout: 5000 });
    await page.evaluate(() => {
      window.meter = media.context.createAnalyser(); const create = media.context.createBufferSource.bind(media.context);
      media.context.createBufferSource = () => { const source = create(); source.connect(meter); return source; };
      const pcm = new Int16Array(2400); for (let i=0;i<pcm.length;i++) pcm[i]=Math.round(Math.sin(i*2*Math.PI*440/24000)*16000);
      const bytes = new Uint8Array(pcm.buffer); window.tone=btoa(String.fromCharCode(...bytes));
      window.playback=setInterval(()=>media.play('claude',tone,24000),100);
    });
    await page.waitForFunction(() => { const a = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(a); return a.some(x => Math.abs(x) > .1); });
    t.diagnostic('PCM playback audible in analyser');
    await page.evaluate(() => { clearInterval(playback); window.track = media.microphone.stream.getTracks()[0]; media.stopAll(); });
    assert.equal(await page.evaluate(() => track.readyState), 'ended');
    assert.equal(await page.evaluate(() => media.sources.size), 0);
    const count = await page.evaluate(() => packets.length); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => packets.length), count, 'No microphone packets after stop');
    await page.evaluate(async () => {
      window.originalGet = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.delayed = await originalGet({audio:true});
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => window.allowLater=resolve);
      window.pendingMic = media.toggleMic('claude');
    });
    await page.waitForFunction(() => window.allowLater);
    await page.evaluate(async () => { media.stopAll(); allowLater(delayed); await pendingMic; });
    assert.equal(await page.evaluate(() => delayed.getTracks()[0].readyState), 'ended', 'Permission arriving after disconnect never leaves microphone live');
    assert.equal(await page.evaluate(() => media.microphone), null);
    await page.evaluate(async () => { navigator.mediaDevices.getUserMedia = async () => { throw Error('Permission denied'); }; await media.toggleMic('claude'); });
    assert.ok(await page.evaluate(() => notices.at(-1).includes('Microphone unavailable')));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server?.close(); }
});
