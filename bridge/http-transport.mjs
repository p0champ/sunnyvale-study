import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

// The same authenticated bridge protocol over ordinary HTTPS, for clients whose
// network/browser cannot establish a WebSocket. Credentials never go in URLs.
class HttpSocket extends EventEmitter {
  readyState = 1; queue = []; bytes = 0; waiter = null; polling = false; lastUsed = Date.now();
  constructor() {
    super();
    this.paired = new Promise((resolve, reject) => { this.pairOK = resolve; this.pairFailed = reject; });
  }
  get bufferedAmount() { return this.bytes; }
  send(raw) {
    if (this.readyState !== 1) return;
    const message = JSON.parse(raw);
    if (message.type === 'ready') this.pairOK();
    // Retain only the newest frame for a tab if a headset poll is delayed.
    if (message.type === 'frame') {
      const old = this.queue.findIndex(m => m.type === 'frame' && m.id === message.id);
      if (old >= 0) this.queue.splice(old, 1);
    }
    if (message.type === 'audio') {
      const packets = this.queue.filter(m => m.type === 'audio' && m.id === message.id);
      if (packets.length >= 10) this.queue.splice(this.queue.indexOf(packets[0]), 1);
    }
    this.queue.push(message);
    this.bytes = Buffer.byteLength(JSON.stringify(this.queue));
    if (this.bytes > 4 * 1024 * 1024 || this.queue.length > 200) { this.close(1009, 'Headset is not receiving updates'); return; }
    this.waiter?.();
  }
  async receive() {
    if (this.polling) throw Error('A receive request is already active');
    this.polling = true;
    try {
      if (!this.queue.length && this.readyState === 1) await new Promise(resolve => {
        const timeout = setTimeout(finish, 15000);
        const self = this;
        function finish() { clearTimeout(timeout); self.waiter = null; resolve(); }
        this.waiter = finish;
      });
      this.lastUsed = Date.now();
      // Sound first: Claude's voice must not wait behind a browser picture in the same reply.
      const messages = [...this.queue.filter(m => m.type === 'audio'), ...this.queue.filter(m => m.type !== 'audio')]; this.queue = []; this.bytes = 0;
      return { messages, closed: this.readyState !== 1 };
    } finally { this.polling = false; }
  }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.readyState = 3; this.pairFailed(Error(reason || 'Connection closed'));
    this.waiter?.(); this.emit('close', code, reason);
  }
}

export function createHttpTransport({ allowedOrigins, validToken, isBusy, onConnection }) {
  const sessions = new Map();
  const cleanup = setInterval(() => {
    for (const [key, socket] of sessions) if (Date.now() - socket.lastUsed > 45000) {
      socket.close(1001, 'Connection expired'); sessions.delete(key);
    }
  }, 5000);
  cleanup.unref();
  function response(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
  async function readJSON(req) {
    let text = '';
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > 65536) throw Error('Message too large');
    }
    return JSON.parse(text);
  }
  return {
    async handle(req, res) {
      const origin = req.headers.origin;
      if (!allowedOrigins.has(origin)) { response(res, 403, { error: 'This page is not allowed to connect.' }); return; }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.method !== 'POST') { response(res, 405, { error: 'Use POST.' }); return; }
      const credential = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      if (req.url === '/bridge/http/connect') {
        if (!validToken(credential)) { response(res, 401, { error: 'The PC rejected the pairing code.' }); return; }
        if (isBusy() || sessions.size) { response(res, 409, { error: 'Another Sunnyvale page is connected. Disconnect that page; keep the Chrome extension connected.' }); return; }
        const key = randomBytes(32).toString('base64url'), socket = new HttpSocket();
        sessions.set(key, socket);
        socket.once('close', () => sessions.delete(key));
        onConnection(socket);
        socket.emit('message', JSON.stringify({ type: 'pair', token: credential }));
        try { await socket.paired; response(res, 200, { session: key }); }
        catch { response(res, 409, { error: 'Pairing did not finish. Disconnect other Sunnyvale pages and retry.' }); }
        return;
      }
      const socket = sessions.get(credential);
      if (!socket || socket.readyState !== 1) { response(res, 401, { error: 'The connection expired. Press Connect again.' }); return; }
      socket.lastUsed = Date.now();
      try {
        if (req.url === '/bridge/http/poll') { response(res, 200, await socket.receive()); return; }
        if (req.url === '/bridge/http/close') { socket.close(); response(res, 200, { ok: true }); return; }
        if (req.url === '/bridge/http/send') {
          const body = await readJSON(req);
          const messages = Array.isArray(body.messages) ? body.messages : [body.data];
          if (!messages.length || messages.length > 12 || messages.some(data => typeof data !== 'string' || Buffer.byteLength(data) > 65536)) throw Error('Invalid message');
          for (const data of messages) socket.emit('message', data);
          response(res, 200, { ok: true }); return;
        }
        response(res, 404, { error: 'Unknown connection request.' });
      } catch (error) { response(res, 400, { error: error.message }); }
    },
    close() { clearInterval(cleanup); for (const socket of sessions.values()) socket.close(); sessions.clear(); },
  };
}
