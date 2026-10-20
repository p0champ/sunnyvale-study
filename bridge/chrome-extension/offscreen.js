const captures = new Map();
function base64(buffer) {
  const bytes = new Uint8Array(buffer); let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text);
}
async function stop(tabId) {
  const capture = captures.get(tabId); if (!capture) return;
  captures.delete(tabId); capture.stream.getTracks().forEach(track => track.stop()); await capture.context.close();
}
async function start(tabId, streamId) {
  await stop(tabId);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }, video: false });
  const context = new AudioContext();
  await context.audioWorklet.addModule('pcm-worklet.js');
  const source = context.createMediaStreamSource(stream), processor = new AudioWorkletNode(context, 'bridge-pcm');
  captures.set(tabId, { stream, context });
  processor.port.onmessage = event => chrome.runtime.sendMessage({ target: 'background-audio', type: 'pcm', tabId, rate: 24000, data: base64(event.data) }).catch(() => {});
  source.connect(processor); processor.connect(context.destination); await context.resume();
  stream.getAudioTracks()[0].onended = () => {
    stop(tabId); chrome.runtime.sendMessage({ target: 'background-audio', type: 'ended', tabId }).catch(() => {});
  };
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id || m.target !== 'offscreen-audio') return;
  const operation = m.type === 'start' ? start(m.tabId, m.streamId) : stop(m.tabId);
  operation.then(() => reply({ ok: true })).catch(error => reply({ error: error.message })); return true;
});
