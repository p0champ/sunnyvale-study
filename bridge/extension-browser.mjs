import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./chrome-extension/manifest.json', import.meta.url), 'utf8'));
const digest = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16);
export const extensionId = [...digest].map(b => String.fromCharCode(97 + (b >> 4), 97 + (b & 15))).join('');

export class ExtensionBrowser extends EventEmitter {
  socket = null; sequence = 0; pending = new Map(); pages = new Map();
  get connected() { return this.socket?.readyState === 1; }
  accept(ws) {
    if (this.connected) { ws.close(1008, 'Chrome is already connected'); return; }
    this.socket = ws;
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { ws.close(1008); return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'ping') { ws.send('{"type":"pong"}'); return; }
      if (m.type === 'result') {
        const p = this.pending.get(m.request); if (!p) return;
        this.pending.delete(m.request); clearTimeout(p.timer);
        if (m.error) p.reject(Error(String(m.error))); else p.resolve(m.result || {});
      }
      if (m.type === 'event') {
        const page = this.pages.get(m.id); if (!page) return;
        if (m.method === 'Page.frameNavigated' && m.params?.frame?.url) {
          page.currentURL = m.params.frame.url; page.emit('framenavigated', page.frame);
        }
        if (m.method === 'detached') { page.emit('detached'); return; }
        if (m.method === 'bridge.audio') { page.emit('audio', m.params); return; }
        if (m.method === 'bridge.audio-status') { page.audioEnabled = !!m.params?.enabled; page.emit('audio-status', page.audioEnabled); return; }
        if (m.method === 'Page.screencastFrame') page.cdp.emit(m.method, m.params);
      }
    });
    ws.on('close', () => {
      if (this.socket !== ws) return;
      this.socket = null;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error('Chrome extension disconnected.')); }
      this.pending.clear(); this.pages.clear(); this.emit('disconnected');
    });
    ws.on('error', () => {});
    ws.send('{"type":"ready"}'); this.emit('connected');
  }
  request(command, params = {}) {
    if (!this.connected) return Promise.reject(Error('Connect the Sunnyvale extension in Google Chrome first.'));
    const request = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(request); reject(Error('Chrome did not respond. Check its extension connection.')); }, 15000);
      this.pending.set(request, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ type: 'command', request, command, ...params }));
    });
  }
  async newPage() {
    const id = 'chrome-' + (++this.sequence);
    const page = new EventEmitter(); page.frame = {}; page.currentURL = ''; page.cdp = new EventEmitter();
    this.pages.set(id, page);
    const cdp = (method, params) => this.request('cdp', { id, method, params });
    page.attach = async url => {
      try { const result = await this.request('open', { id, url }); page.currentURL = result.url; page.currentTitle = result.title; page.audioEnabled = result.audioEnabled; }
      catch (error) { this.pages.delete(id); throw error; }
    };
    page.cdp.send = (method, params) => method === 'Page.screencastFrameAck' ? Promise.resolve() : cdp(method, params);
    page.mainFrame = () => page.frame;
    page.url = () => page.currentURL;
    page.info = async () => { const info = await this.request('page-info', { id }); page.currentURL = info.url; page.currentTitle = info.title; return info; };
    page.goto = async url => {
      const result = await cdp('Page.navigate', { url }); if (result.errorText) throw Error(result.errorText);
    };
    page.close = async () => { this.pages.delete(id); await this.request('release', { id }); };
    page.reload = () => cdp('Page.reload');
    page.startAudio = () => this.request('audio-start', { id });
    page.stopAudio = () => this.request('audio-stop', { id });
    page.startMic = () => this.request('mic-start', { id });
    page.stopMic = () => this.request('mic-stop', { id });
    page.sendMic = (data, rate) => this.request('mic-data', { id, data, rate });
    const history = async step => {
      const h = await cdp('Page.getNavigationHistory'); const entry = h.entries[h.currentIndex + step];
      if (entry) await cdp('Page.navigateToHistoryEntry', { entryId: entry.id });
    };
    page.goBack = () => history(-1); page.goForward = () => history(1);
    page.keyboard = { press: async key => {
      const codes = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, ArrowLeft: 37, ArrowRight: 39 };
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codes[key], ...(key === 'Enter' ? { text: '\r' } : {}) });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codes[key] });
    } };
    return page;
  }
}
