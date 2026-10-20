// A WebSocket-shaped adapter using authenticated HTTPS requests. Nothing is
// stored in cookies, URLs, browser history or server logs.
export class HttpsBridgeSocket {
  readyState = 0; session = null; outgoing = []; flushing = false; controller = new AbortController();
  constructor(url, token) {
    this.base = new URL(url); this.base.protocol = this.base.protocol === 'wss:' ? 'https:' : 'http:';
    this.base.pathname = '/bridge/http/'; this.base.search = ''; this.base.hash = '';
    this.start(token);
  }
  async request(path, credential, body) {
    const response = await fetch(new URL(path, this.base), {
      method: 'POST', credentials: 'omit', cache: 'no-store', signal: this.controller.signal,
      headers: { Authorization: 'Bearer ' + credential, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'The secure PC request failed.');
    return result;
  }
  async start(token) {
    try {
      const result = await this.request('connect', token);
      if (this.readyState !== 0) return;
      this.session = result.session; this.readyState = 1;
      this.onopen?.(); await this.poll();
    } catch (error) { if (this.readyState < 2) this.fail(error); }
  }
  async poll() {
    while (this.readyState === 1) {
      const result = await this.request('poll', this.session);
      if (this.readyState !== 1) return;
      for (const message of result.messages || []) this.onmessage?.({ data: JSON.stringify(message) });
      if (result.closed) { this.fail(Error('The PC closed the connection.')); return; }
    }
  }
  send(data) {
    if (this.readyState !== 1) return;
    // Pairing was already authenticated during the HTTPS connection request.
    const message = JSON.parse(data);
    if (message.type === 'pair') return;
    if (message.type === 'mic-stop') this.outgoing = this.outgoing.filter(value => { const queued = JSON.parse(value); return queued.type !== 'mic-data' || queued.id !== message.id; });
    if (this.outgoing.length >= 64) {
      const old = this.outgoing.findIndex(value => JSON.parse(value).type === 'mic-data');
      if (old >= 0) this.outgoing.splice(old, 1); else { this.fail(Error('The PC connection is too slow. Reconnect and try again.')); return; }
    }
    this.outgoing.push(data); this.flush();
  }
  async flush() {
    if (this.flushing || this.readyState !== 1) return;
    this.flushing = true;
    try {
      while (this.outgoing.length && this.readyState === 1) {
        const messages = [];
        while (this.outgoing.length && messages.length < 12 && new TextEncoder().encode(JSON.stringify({ messages: [...messages, this.outgoing[0]] })).length < 60000) messages.push(this.outgoing.shift());
        if (!messages.length) throw Error('Browser input message is too large.');
        await this.request('send', this.session, { messages });
      }
    } catch (error) { if (this.readyState === 1) this.fail(error); }
    finally { this.flushing = false; }
  }
  fail(error) {
    if (this.readyState >= 2) return;
    this.onerror?.({ message: error.message }); this.close();
  }
  close() {
    if (this.readyState >= 2) return;
    this.readyState = 3; this.controller.abort();
    if (this.session) fetch(new URL('close', this.base), {
      method: 'POST', credentials: 'omit', cache: 'no-store', keepalive: true,
      headers: { Authorization: 'Bearer ' + this.session },
    }).catch(() => {});
    this.onclose?.({ code: 1000 });
  }
}
