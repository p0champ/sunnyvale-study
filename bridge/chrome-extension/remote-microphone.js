// This function is installed only in an explicitly shared tab after the user
// enables the headset microphone. It never reads the PC microphone.
function installRemoteMicrophone() {
  if (window.__sunnyvaleMicrophone) return;
  const allowed = ['claude.ai', 'www.claude.ai', 'localhost', '127.0.0.1'].includes(location.hostname);
  if (!allowed) throw Error('Headset voice is currently available for Claude only.');
  const devices = navigator.mediaDevices;
  const original = devices.getUserMedia;
  const context = new AudioContext({ sampleRate: 24000 });
  const output = context.createMediaStreamDestination();
  let next = 0, enabled = true; const tracks = new Set(), sources = new Set();
  const replacement = async constraints => {
    if (!enabled || !constraints?.audio) return original.call(devices, constraints);
    await context.resume();
    const stream = new MediaStream(output.stream.getAudioTracks().map(track => track.clone()));
    stream.getAudioTracks().forEach(track => { tracks.add(track); track.onended = () => tracks.delete(track); });
    if (constraints.video) {
      const video = await original.call(devices, { video: constraints.video });
      video.getVideoTracks().forEach(track => stream.addTrack(track));
    }
    return stream;
  };
  devices.getUserMedia = replacement;
  window.__sunnyvaleMicrophone = {
    push(data, rate) {
      if (!enabled || rate !== 24000 || typeof data !== 'string' || data.length > 20000) return;
      const raw = atob(data), pcm = new Int16Array(raw.length / 2);
      for (let i = 0; i < pcm.length; i++) { const n = raw.charCodeAt(i * 2) | raw.charCodeAt(i * 2 + 1) << 8; pcm[i] = n; }
      const buffer = context.createBuffer(1, pcm.length, rate), samples = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(output);
      if (next > context.currentTime + 1.5) { for (const old of sources) { try { old.stop(); } catch {} } sources.clear(); next = 0; }
      if (next < context.currentTime) next = context.currentTime + .25;
      source.start(next); next += buffer.duration; sources.add(source); source.onended = () => sources.delete(source);
    },
    async stop() {
      enabled = false;
      if (devices.getUserMedia === replacement) devices.getUserMedia = original;
      for (const track of tracks) track.stop(); tracks.clear();
      output.stream.getTracks().forEach(track => track.stop()); await context.close(); delete window.__sunnyvaleMicrophone;
    },
  };
  context.resume();
}
