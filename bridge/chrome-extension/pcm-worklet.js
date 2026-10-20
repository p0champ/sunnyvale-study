class BridgePCM extends AudioWorkletProcessor {
  samples = [];
  phase = 0;
  process(inputs, outputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const step = sampleRate / 24000;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      this.phase++;
      if (this.phase >= step) {
        this.phase -= step; this.samples.push(Math.max(-1, Math.min(1, value / channels.length)));
        if (this.samples.length === 2400) {
          const pcm = new Int16Array(this.samples.map(x => Math.round(x * (x < 0 ? 32768 : 32767))));
          this.port.postMessage(pcm.buffer, [pcm.buffer]); this.samples = [];
        }
      }
    }
    // Keep the capture graph alive without playing a duplicate on the PC.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    return true;
  }
}
registerProcessor('bridge-pcm', BridgePCM);
