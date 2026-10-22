import { WebSocket, WebSocketServer } from 'ws';
import { timingSafeEqual } from 'node:crypto';

// An independent TCP stream prevents a browser screenshot from blocking audio
// packets behind it. The normal headset connection still owns this channel.
export function createVoiceChannel({ allowedOrigins, validToken, getOwner }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const flows = new WeakMap();
  function flowFor(owner) {
    let flow = flows.get(owner); if (flow) return flow;
    flow = { next: 0, acked: 0, sent: 0, bytes: 0, packets: new Map(), route: null, timer: null };
    flows.set(owner, flow);
    owner.once('close', () => { clearTimeout(flow.timer); flow.packets.clear(); flow.bytes = 0; flows.delete(owner); });
    return flow;
  }
  function pump(owner) {
    const flow = flows.get(owner); if (!flow || owner.readyState !== WebSocket.OPEN) return;
    clearTimeout(flow.timer); flow.timer = null;
    const route = owner.audioSocket?.readyState === WebSocket.OPEN ? owner.audioSocket : owner;
    if (flow.route !== route) { flow.route = route; flow.sent = flow.acked; }
    for (const [seq, item] of flow.packets) {
      if (seq <= flow.sent) continue;
      if (seq > flow.acked + 20) break; // measured delivery, including invisible tunnel queues
      if ((route.bufferedAmount || 0) > 128000) {
        flow.timer = setTimeout(() => pump(owner), 50); flow.timer.unref?.(); break;
      }
      route.send(item.wire); flow.sent = seq;
    }
  }
  const equalKey = (actual, expected) => {
    if (typeof actual !== 'string' || typeof expected !== 'string') return false;
    const a = Buffer.from(actual), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  function upgrade(req, socket, head) {
    if (req.url !== '/bridge-audio') return false;
    if (!allowedOrigins.has(req.headers.origin)) { socket.destroy(); return true; }
    wss.handleUpgrade(req, socket, head, audio => {
      audio.on('error', () => {});
      const timeout = setTimeout(() => audio.close(1008, 'Pairing required'), 5000);
      audio.once('message', raw => {
        clearTimeout(timeout);
        let message; try { message = JSON.parse(raw); } catch { audio.close(1008); return; }
        const owner = getOwner();
        if (!owner || owner.readyState !== WebSocket.OPEN || message?.type !== 'pair-audio'
          || !validToken(message.token) || !equalKey(message.key, owner.audioKey)) {
          audio.close(1008, 'Pairing failed'); return;
        }
        // One channel per owner. Refuse replacement rather than interrupting
        // an already paired conversation with a competing connection.
        if (owner.audioSocket?.readyState === WebSocket.OPEN) { audio.close(1013, 'Audio reconnect pending'); return; }
        owner.audioSocket = audio;
        let alive = true;
        const ownerClosed = () => { audio.close(); };
        const heartbeat = setInterval(() => {
          if (!alive || getOwner() !== owner || owner.readyState !== WebSocket.OPEN) { audio.terminate(); return; }
          alive = false; audio.ping();
        }, 5000);
        audio.on('pong', () => { alive = true; });
        audio.on('message', () => { audio.close(1008, 'Audio channel is receive only'); });
        audio.on('close', () => {
          clearInterval(heartbeat);
          owner.removeListener('close', ownerClosed);
          if (owner.audioSocket === audio) owner.audioSocket = null;
          pump(owner);
        });
        owner.once('close', ownerClosed);
        audio.send(JSON.stringify({ type: 'audio-ready' }));
        pump(owner);
      });
      audio.once('close', () => clearTimeout(timeout));
    });
    return true;
  }
  function send(owner, packet) {
    if (owner.readyState !== WebSocket.OPEN) return false;
    if (owner.reliableAudio) {
      const flow = flowFor(owner), seq = ++flow.next, wire = JSON.stringify({ ...packet, seq });
      const bytes = Buffer.byteLength(wire);
      // This limit is outside ordinary speech bursts. Explicitly reconnect a
      // stalled session rather than silently losing whole queues or growing
      // process memory forever. The UI reports the reconnect reason.
      if (flow.packets.size >= 256 || flow.bytes + bytes > 2 * 1024 * 1024) {
        owner.close(1013, 'Voice connection fell behind'); return false;
      }
      flow.packets.set(seq, { wire, bytes }); flow.bytes += bytes; pump(owner);
      return owner.audioSocket?.readyState === WebSocket.OPEN;
    }
    const channel = owner.audioSocket;
    if (channel?.readyState === WebSocket.OPEN) { channel.send(JSON.stringify(packet)); return true; }
    if (owner.readyState === WebSocket.OPEN) { owner.send(JSON.stringify(packet)); return false; }
    return false;
  }
  function acknowledge(owner, seq) {
    const flow = flows.get(owner);
    if (!flow || !Number.isSafeInteger(seq) || seq <= flow.acked || seq > flow.sent) return;
    for (const [n, item] of flow.packets) { if (n > seq) break; flow.bytes -= item.bytes; flow.packets.delete(n); }
    flow.acked = seq; pump(owner);
  }
  return { upgrade, send, acknowledge, close() { for (const socket of wss.clients) socket.close(); } };
}

export function isClaudePage(url) {
  try { return ['claude.ai', 'www.claude.ai'].includes(new URL(url).hostname); } catch { return false; }
}

// PCM silence is sent continuously by tab capture. It must not suspend normal
// pictures or backups simply because the Sound switch is enabled.
export function audiblePCM(data) {
  if (typeof data !== 'string' || data.length > 20000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return false;
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length % 2) return false;
  let energy = 0;
  for (let i = 0; i < bytes.length; i += 2) { const sample = bytes.readInt16LE(i) / 32768; energy += sample * sample; }
  return Math.sqrt(energy / (bytes.length / 2)) > .008;
}
