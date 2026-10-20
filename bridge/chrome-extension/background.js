let socket, heartbeat, reconnect, connecting = false;
let message = 'Not connected. Choose your pairing file, then Connect.';
const tabs = new Map();
const send = value => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
async function detachAll() {
  const attached = [...tabs.values()]; tabs.clear();
  for (const tab of attached) await detach(tab);
}
async function detach(tab) {
  const target = { tabId: tab.tabId };
  await chrome.debugger.sendCommand(target, 'Page.stopScreencast').catch(() => {});
  await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
  await chrome.debugger.detach(target).catch(() => {});
  if (tab.muted !== undefined) await chrome.tabs.update(tab.tabId, { muted: tab.muted }).catch(() => {});
}
function webURL(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('Use an http or https website.');
  return u;
}
const permittedCommands = new Set(['Page.enable', 'Page.startScreencast', 'Page.stopScreencast', 'Page.screencastFrameAck',
  'Page.navigate', 'Page.getNavigationHistory', 'Page.navigateToHistoryEntry', 'Page.reload', 'Page.captureScreenshot',
  'Emulation.setDeviceMetricsOverride', 'Emulation.clearDeviceMetricsOverride', 'Input.dispatchMouseEvent',
  'Input.dispatchKeyEvent', 'Input.insertText']);
async function command(m) {
  if (m.command === 'open') {
    if (tabs.size >= 4) throw Error('Close a Sunnyvale browser window first (maximum four).');
    const u = webURL(m.url);
    // Same-origin tabs reuse the user's session and current conversation; unrelated tabs are untouched.
    const candidates = await chrome.tabs.query({});
    const used = new Set([...tabs.values()].map(t => t.tabId));
    let tab = candidates.find(t => { try { return !used.has(t.id) && new URL(t.url).origin === u.origin; } catch { return false; } });
    if (!tab) tab = await chrome.tabs.create({ url: u.href, active: true });
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');
    tabs.set(m.id, { tabId: tab.id, muted: tab.mutedInfo?.muted });
    try {
      await chrome.tabs.update(tab.id, { active: true, muted: true });
      await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable');
      await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      return { tabId: tab.id, url: tab.url || u.href };
    } catch (error) { const record = tabs.get(m.id); tabs.delete(m.id); await detach(record); throw error; }
  }
  const tab = tabs.get(m.id); if (!tab) throw Error('Chrome tab is no longer attached. Reopen it from Sunnyvale.');
  if (m.command === 'release') { tabs.delete(m.id); await detach(tab); return {}; }
  if (m.command !== 'cdp' || !permittedCommands.has(m.method)) throw Error('Unsupported browser command.');
  if (m.method === 'Page.navigate') webURL(m.params.url);
  return chrome.debugger.sendCommand({ tabId: tab.tabId }, m.method, m.params || {});
}
chrome.debugger.onEvent.addListener((source, method, params) => {
  const item = [...tabs].find(([, tab]) => tab.tabId === source.tabId);
  if (!item) return;
  if (method === 'Page.screencastFrame') {
    if (socket?.bufferedAmount < 256000) send({ type: 'event', id: item[0], method, params: { data: params.data } });
    chrome.debugger.sendCommand({ tabId: source.tabId }, 'Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
  }
  if (method === 'Page.frameNavigated' && !params.frame.parentId) send({ type: 'event', id: item[0], method, params });
});
chrome.debugger.onDetach.addListener(source => {
  const item = [...tabs].find(([, tab]) => tab.tabId === source.tabId);
  if (!item) return;
  tabs.delete(item[0]); send({ type: 'event', id: item[0], method: 'detached', params: {} });
});
async function connect() {
  if (connecting || socket?.readyState === WebSocket.OPEN) return;
  connecting = true;
  const saved = await chrome.storage.local.get(['token', 'port', 'enabled']);
  if (!saved.enabled || !saved.token) { connecting = false; return; }
  clearTimeout(reconnect);
  const current = new WebSocket(`ws://127.0.0.1:${saved.port || 8130}/browser`); socket = current;
  message = 'Connecting to the PC bridge…';
  current.onopen = () => { current.send(JSON.stringify({ type: 'pair-browser', token: saved.token })); };
  current.onmessage = async event => {
    if (socket !== current) return;
    const m = JSON.parse(event.data);
    if (m.type === 'ready') {
      connecting = false; message = 'Connected. Keep Chrome open. Use Claude or the heart inside Sunnyvale.';
      clearInterval(heartbeat); heartbeat = setInterval(() => send({ type: 'ping' }), 20000);
    }
    if (m.type === 'command') {
      try { send({ type: 'result', request: m.request, result: await command(m) }); }
      catch (error) { send({ type: 'result', request: m.request, error: error.message }); }
    }
  };
  current.onclose = async event => {
    if (socket !== current) return;
    connecting = false; socket = null; clearInterval(heartbeat);
    message = event.code === 1008 ? 'Pairing failed. Choose the current pairing.txt and Connect again.' : 'PC bridge disconnected. Start it; this extension reconnects automatically.';
    await detachAll();
    if (event.code !== 1008) reconnect = setTimeout(connect, 3000);
  };
  current.onerror = () => {};
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (m.type === 'status') { reply({ message }); return; }
  if (m.type === 'connect') { connect().then(() => reply({ ok: true })); return true; }
  if (m.type === 'disconnect') {
    clearTimeout(reconnect); socket?.close(); detachAll().then(() => reply({ ok: true })); return true;
  }
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
