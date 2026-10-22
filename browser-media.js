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
  timelines = new Map(); lastUnderrun = new Map(); audibleUntil = new Map(); spokenUntil = new Map();
  voiceStats = { packets: 0, underruns: 0, dropped: 0, maxGap: 0, lastAt: 0, lead: .3 };
  waitingAudio = [];
  constructor(send, report) { this.send = send; this.report = report; }
  async unlock() {
    this.context ||= new AudioContext();
    await this.context.resume();
    if (this.context.state === 'running') {
      const waiting = this.waitingAudio.splice(0);
      for (const packet of waiting) this.play(...packet);
    }
  }
  // Claude's voice arrives in 0.1 s pieces. Network and headset hiccups make pieces arrive in bursts, so the
  // player keeps a small lead. Each time it runs dry (a gap you'd hear), it keeps a bit more lead for the
  // rest of the conversation (0.3 s up to 1.2 s), so a choppy link becomes slightly later but smooth speech.
  play(id, data, rate) {
    if (rate !== 24000 || typeof data !== 'string' || data.length > 20000) return;
    if (!this.context || this.context.state !== 'running') {
      if (!this.waitingAudio.length) this.report('Sound is paused by the browser. Tap Sound or Connect to hear Claude.');
      if (this.waitingAudio.length >= 256) this.waitingAudio.shift();
      this.waitingAudio.push([id, data, rate]); return;
    }
    try {
      const samples = decodePCM(data);
      if (!samples.length) return;
      let energy = 0; for (const sample of samples) energy += sample * sample;
      const level = Math.sqrt(energy / samples.length);
      const buffer = this.context.createBuffer(1, samples.length, rate);
      buffer.copyToChannel(samples, 0);
      const now = this.context.currentTime, st = this.voiceStats;
      st.packets++; const at = performance.now(); if (st.lastAt) st.maxGap = Math.max(st.maxGap, at - st.lastAt); st.lastAt = at;
      let lead = this.leads.get(id) || .3, next = this.nextAudio.get(id) || 0;
      if (now - (this.lastUnderrun.get(id) ?? now) > 60 && lead > .3) {
        lead = Math.max(.3, lead - .15); this.leads.set(id, lead); this.lastUnderrun.set(id, now);
      }
      // Real silence can be omitted while catching up. The low threshold is
      // deliberately separate from speech detection so soft consonants remain.
      if (next > now + lead + .15 && level < .0005) { st.silentSkipped = (st.silentSkipped || 0) + 1; return; }
      if (next > now + 8) {
        // Keep a bounded queue, but never flush the whole conversation. At an
        // exceptional >8 s backlog, trim only the oldest not-yet-played pieces
        // and reschedule every retained piece without cutting current audio.
        const pending = (this.timelines.get(id) || []).filter(piece => piece.start > now + .005);
        let duration = pending.reduce((sum, piece) => sum + piece.buffer.duration, buffer.duration);
        let trim = 0;
        while (trim < pending.length && duration > 8) { duration -= pending[trim++].buffer.duration; st.dropped++; }
        for (const piece of pending) { try { piece.source.stop(); } catch {} this.sources.get(id)?.delete(piece.source); }
        const current = (this.timelines.get(id) || []).filter(piece => !pending.includes(piece));
        this.timelines.set(id, current);
        next = Math.max(now + lead, ...current.map(piece => piece.end));
        for (const piece of pending.slice(trim)) next = this.scheduleAudio(id, piece.buffer, piece.level, next);
      }
      if (next < now) {
        if (next) { st.underruns++; lead = Math.min(1.2, lead + .15); this.leads.set(id, lead); this.lastUnderrun.set(id, now); }
        next = now + lead;
      }
      st.lead = lead;
      this.nextAudio.set(id, this.scheduleAudio(id, buffer, level, next));
    } catch { /* Ignore damaged audio without stopping the browser connection. */ }
  }
  scheduleAudio(id, buffer, level, start) {
    const source = this.context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = 1; source.connect(this.context.destination);
    const piece = { source, buffer, level, start, end: start + buffer.duration };
    if (!this.sources.has(id)) this.sources.set(id, new Set());
    if (!this.timelines.has(id)) this.timelines.set(id, []);
    this.sources.get(id).add(source); this.timelines.get(id).push(piece);
    source.onended = () => {
      if (this.sources.get(id)?.has(source) && level > .008 && this.context.currentTime >= piece.start) this.spokenUntil.set(id, Math.max(this.spokenUntil.get(id) || 0, piece.end));
      this.sources.get(id)?.delete(source);
      const timeline = this.timelines.get(id), index = timeline?.indexOf(piece) ?? -1;
      if (index >= 0) timeline.splice(index, 1);
    };
    source.start(start);
    if (level > .008) this.audibleUntil.set(id, piece.end);
    return piece.end;
  }
  voiceLevel(id) {
    const now = this.context?.currentTime ?? 0;
    const piece = this.timelines.get(id)?.find(item => item.start <= now && item.end > now);
    return piece ? Math.min(1, piece.level * 4) : 0;
  }
  speakingNow(id) {
    if (!this.context) return false;
    const now = this.context.currentTime;
    for (const piece of this.timelines.get(id) || []) if (piece.level > .008 && piece.start <= now) this.spokenUntil.set(id, Math.max(this.spokenUntil.get(id) || 0, piece.end));
    return this.spokenUntil.has(id) && this.spokenUntil.get(id) > now - .5;
  }
  spokeWithin(id, milliseconds = 10000) { return !!this.context && (this.audibleUntil.get(id) || -Infinity) > this.context.currentTime - milliseconds / 1000; }
  takeVoiceStats() { const s = this.voiceStats; this.voiceStats = { packets: 0, underruns: 0, dropped: 0, maxGap: 0, lastAt: s.lastAt, lead: s.lead }; return s; }
  async toggleMic(id) {
    if (this.microphone?.id === id) { this.stopMic(); return; }
    this.stopMic();
    const generation = this.micGeneration; let stream;
    try {
      await this.unlock();
      if (generation !== this.micGeneration) return;
      this.send({ type: 'audio-start', id });
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
    this.waitingAudio = this.waitingAudio.filter(packet => packet[0] !== id);
    for (const source of this.sources.get(id) || []) { try { source.stop(); } catch {} }
    this.sources.delete(id); this.nextAudio.delete(id);
    this.timelines.delete(id); this.leads.delete(id); this.lastUnderrun.delete(id); this.audibleUntil.delete(id); this.spokenUntil.delete(id);
  }
  stopAll() { this.waitingAudio.length = 0; this.stopMic(); for (const id of this.sources.keys()) this.stop(id); }
}
