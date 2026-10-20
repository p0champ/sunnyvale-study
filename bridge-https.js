// A WebSocket-shaped adapter using authenticated HTTPS requests. Nothing is
// stored in cookies, URLs, browser history or server logs.
export class HttpsBridgeSocket {
  readyState = 0; session = null; outgoing = Promise.resolve(); controller = new AbortController();
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
    if (JSON.parse(data).type === 'pair') return;
    this.outgoing = this.outgoing.then(() => this.readyState === 1 && this.request('send', this.session, { data }))
      .catch(error => { if (this.readyState === 1) this.fail(error); });
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
