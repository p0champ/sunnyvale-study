function decodePCM(data) {
  const raw = atob(data);
  if (raw.length % 2 || raw.length > 15000) throw Error('Invalid sound packet');
  const samples = new Float32Array(raw.length / 2);
  for (let i = 0; i < samples.length; i++) {
    const n = raw.charCodeAt(i * 2) | raw.charCodeAt(i * 2 + 1) << 8;
    samples[i] = (n >= 32768 ? n - 65536 : n) / 32768;
  }
  return samples;
}
function encodePCM(buffer) {
  let text = ''; for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte); return btoa(text);
}
export class BrowserMedia {
  context = null; microphone = null; workletReady = null; micGeneration = 0; nextAudio = new Map(); sources = new Map(); leads = new Map();
  voiceStats = { packets: 0, underruns: 0, dropped: 0, maxGap: 0, lastAt: 0, lead: .3 };
  constructor(send, report) { this.send = send; this.report = report; }
  async unlock() {
    this.context ||= new AudioContext();
    await this.context.resume();
  }
  // Claude's voice arrives in 0.1 s pieces. Network and headset hiccups make pieces arrive in bursts, so the
  // player keeps a small lead. Each time it runs dry (a gap you'd hear), it keeps a bit more lead for the
  // rest of the conversation (0.3 s up to 1.2 s), so a choppy link becomes slightly later but smooth speech.
  play(id, data, rate) {
    if (!this.context || this.context.state !== 'running' || rate !== 24000 || typeof data !== 'string' || data.length > 20000) return;
    try {
      const samples = decodePCM(data), buffer = this.context.createBuffer(1, samples.length, rate);
      buffer.copyToChannel(samples, 0);
      const now = this.context.currentTime, st = this.voiceStats;
      st.packets++; const at = performance.now(); if (st.lastAt) st.maxGap = Math.max(st.maxGap, at - st.lastAt); st.lastAt = at;
      let lead = this.leads.get(id) || .3, next = this.nextAudio.get(id) || 0;
      if (next > now + lead + 2) { this.stopAudio(id); next = 0; st.dropped++; }
      if (next < now) {
        if (next) { st.underruns++; lead = Math.min(1.2, lead + .15); this.leads.set(id, lead); }
        next = now + lead;
      }
      st.lead = lead;
      const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination);
      source.start(next); this.nextAudio.set(id, next + buffer.duration);
      if (!this.sources.has(id)) this.sources.set(id, new Set());
      this.sources.get(id).add(source); source.onended = () => this.sources.get(id)?.delete(source);
    } catch { /* Ignore damaged audio without stopping the browser connection. */ }
  }
  takeVoiceStats() { const s = this.voiceStats; this.voiceStats = { packets: 0, underruns: 0, dropped: 0, maxGap: 0, lastAt: s.lastAt, lead: s.lead }; return s; }
  async toggleMic(id) {
    if (this.microphone?.id === id) { this.stopMic(); return; }
    this.stopMic();
    const generation = this.micGeneration; let stream;
    try {
      await this.unlock();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (generation !== this.micGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
      this.workletReady ||= this.context.audioWorklet.addModule(new URL('./bridge/chrome-extension/pcm-worklet.js?v=20261021-media-1', import.meta.url));
      await this.workletReady;
      if (generation !== this.micGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
      const source = this.context.createMediaStreamSource(stream), processor = new AudioWorkletNode(this.context, 'bridge-pcm');
      const mic = { id, stream, source, processor, pending: true }; this.microphone = mic;
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => {
        if (this.microphone === mic) { this.stopMic(); this.report('Headset microphone sharing stopped. Tap Mic to enable it again.'); }
      });
      this.changed?.();
      processor.port.onmessage = event => {
        if (this.microphone !== mic || mic.pending) return;
        this.send({ type: 'mic-data', id, rate: 24000, data: encodePCM(event.data) });
      };
      source.connect(processor); processor.connect(this.context.destination);
      this.send({ type: 'mic-start', id }); this.report('Connecting the headset microphone to Claude…');
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop()); this.workletReady = null;
      this.stopMic(); this.report('Microphone unavailable. Before entering VR, use Allow microphone on the page and approve the headset microphone. ' + error.message);
    }
  }
  micReady(id, enabled) {
    if (enabled && this.microphone?.id === id) {
      this.microphone.pending = false;
      this.changed?.();
      this.report('Headset microphone on. Tap Claude’s own voice button to start speaking. Tap Mic again to stop sharing.');
    } else if (!enabled && this.microphone?.id === id) this.stopMic(false);
  }
  stopMic(notify = true) {
    this.micGeneration++;
    const mic = this.microphone; if (!mic) return;
    this.microphone = null; mic.stream.getTracks().forEach(track => track.stop());
    this.changed?.();
    mic.source.disconnect(); mic.processor.disconnect();
    if (notify) this.send({ type: 'mic-stop', id: mic.id });
  }
  stop(id) {
    if (this.microphone?.id === id) this.stopMic();
    this.stopAudio(id);
  }
  stopAudio(id) {
    for (const source of this.sources.get(id) || []) { try { source.stop(); } catch {} }
    this.sources.delete(id); this.nextAudio.delete(id);
  }
  stopAll() { this.stopMic(); for (const id of this.sources.keys()) this.stop(id); }
}
