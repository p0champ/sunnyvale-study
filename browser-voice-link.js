// This connection carries only paired tab audio. Closing the parent headset
// connection also cancels every reconnect timer owned by this link.
export function openVoiceLink({ url, token, key, isCurrent, onAudio, Socket = WebSocket }) {
  if (typeof key !== 'string' || !key) return () => {};
  let stopped = false, socket, retry, timeout, wait = 1000;
  const address = new URL(url); address.pathname = '/bridge-audio';
  function connect() {
    if (stopped || !isCurrent()) return;
    const current = new Socket(address.href); socket = current;
    let paired = false;
    timeout = setTimeout(() => current.close(), 5000);
    current.onopen = () => {
      if (stopped || socket !== current || !isCurrent()) { current.close(); return; }
      current.send(JSON.stringify({ type: 'pair-audio', token, key }));
    };
    current.onmessage = event => {
      if (stopped || socket !== current || !isCurrent()) return;
      let packet; try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.type === 'audio-ready') { clearTimeout(timeout); paired = true; wait = 1000; }
      if (paired && packet.type === 'audio') onAudio(packet);
    };
    current.onerror = () => {};
    current.onclose = event => {
      clearTimeout(timeout);
      if (socket !== current) return;
      socket = null;
      // A refusal needs a new parent session; repeatedly pairing with the
      // same rejected session key cannot repair it.
      if (event.code === 1008) { stopped = true; return; }
      if (!stopped && isCurrent()) { retry = setTimeout(connect, wait); wait = Math.min(30000, wait * 2); }
    };
  }
  connect();
  return () => {
    stopped = true; clearTimeout(retry); clearTimeout(timeout);
    const current = socket; socket = null; current?.close();
  };
}

// Both transports feed this one receiver. On migration, the server replays
// unacknowledged packets; duplicates and reordered old-stream packets never
// get appended to the wrong place in the spoken sentence.
export function createAudioReceiver({ play, acknowledge }) {
  let next = 1;
  const pending = new Map();
  return packet => {
    if (packet.seq === undefined) { play(packet); return; } // older bridge
    const seq = packet.seq;
    if (!Number.isSafeInteger(seq) || seq < 1 || seq >= next + 256) return;
    if (seq >= next) pending.set(seq, packet);
    while (pending.has(next)) { const item = pending.get(next); pending.delete(next++); play(item); }
    acknowledge(next - 1);
  };
}
