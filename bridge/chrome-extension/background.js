importScripts('remote-microphone.js');
let socket, heartbeat, reconnect, connecting = false, offscreenCreating;
let message = 'Not connected. Choose your pairing file, then Connect.';
const tabs = new Map();
const audioTabs = new Map();
const send = value => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
async function ensureOffscreen() {
  if (offscreenCreating) return offscreenCreating;
  offscreenCreating = (async () => {
    if (!(await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length) {
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Send explicitly enabled tab sound to the paired Quest headset.' });
    }
  })();
  try { await offscreenCreating; } finally { offscreenCreating = null; }
}
function audioStatus(tabId, enabled) {
  const item = [...tabs].find(([, tab]) => tab.tabId === tabId);
  if (item) send({ type: 'event', id: item[0], method: 'bridge.audio-status', params: { enabled } });
}
async function startAudio(tabId) {
  if (audioTabs.has(tabId)) return;
  const current = await chrome.tabs.get(tabId), record = [...tabs.values()].find(tab => tab.tabId === tabId);
  webURL(current.url);
  const originalMuted = record?.muted ?? current.mutedInfo?.muted;
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  await chrome.tabs.update(tabId, { muted: false });
  const result = await chrome.runtime.sendMessage({ target: 'offscreen-audio', type: 'start', tabId, streamId });
  if (result?.error) { await chrome.tabs.update(tabId, { muted: current.mutedInfo?.muted || false }); throw Error(result.error); }
  audioTabs.set(tabId, originalMuted); audioStatus(tabId, true);
}
async function stopAudio(tabId) {
  if (!audioTabs.has(tabId)) return;
  const muted = audioTabs.get(tabId); audioTabs.delete(tabId);
  await chrome.runtime.sendMessage({ target: 'offscreen-audio', type: 'stop', tabId }).catch(() => {});
  const attached = [...tabs.values()].some(tab => tab.tabId === tabId);
  await chrome.tabs.update(tabId, { muted: attached || muted || false }).catch(() => {}); audioStatus(tabId, false);
}
async function detachAll() {
  const attached = [...tabs.values()]; tabs.clear();
  for (const tab of attached) await detach(tab);
  for (const tabId of [...audioTabs.keys()]) await stopAudio(tabId);
}
// Shared tabs are shown at double sharpness with a real 200% page zoom: the page is drawn twice as big
// (pictures of 2560x1600) but laid out at its normal 1280x800 size. Clicks are sent in those layout
// pixels, so they stay exact (an emulated pixel ratio of 2 made real Chrome misplace them, and a saved
// site zoom such as claude.ai at 75% made them land short). The zoom is for that tab only; the site's
// own zoom comes back when sharing stops.
const READ_ZOOM = 2;
async function holdZoom(tabId) {
  await chrome.tabs.setZoomSettings(tabId, { scope: 'per-tab' }).catch(() => {});
  if (await chrome.tabs.getZoom(tabId).catch(() => 1) !== READ_ZOOM) await chrome.tabs.setZoom(tabId, READ_ZOOM).catch(() => {});
}
chrome.tabs.onZoomChange.addListener(({ tabId, newZoomFactor }) => {
  if (newZoomFactor !== READ_ZOOM && [...tabs.values()].some(tab => tab.tabId === tabId)) holdZoom(tabId);
});
async function detach(tab) {
  clearTimeout(tab.frameTimer); tab.latestFrame = null;
  await chrome.tabs.setZoomSettings(tab.tabId, { scope: 'per-origin' }).catch(() => {});
  const target = { tabId: tab.tabId };
  await stopAudio(tab.tabId);
  if (tab.micScript) await chrome.debugger.sendCommand(target, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: tab.micScript }).catch(() => {});
  await chrome.debugger.sendCommand(target, 'Runtime.evaluate', { expression: 'window.__sunnyvaleMicrophone?.stop()', awaitPromise: true }).catch(() => {});
  await chrome.debugger.sendCommand(target, 'Page.stopScreencast').catch(() => {});
  await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
  await chrome.debugger.detach(target).catch(() => {});
  if (tab.muted !== undefined) await chrome.tabs.update(tab.tabId, { muted: tab.muted }).catch(() => {});
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), ms); })]).finally(() => clearTimeout(timer));
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
async function recoverTab(tab) {
  if (![...tabs.values()].includes(tab)) throw Error('Chrome sharing was stopped. Reopen the window from Sunnyvale.');
  if (tab.recovering) return tab.recovering;
  tab.recovering = (async () => {
    const current = await chrome.tabs.get(tab.tabId); webURL(current.url);
    await chrome.tabs.update(tab.tabId, { active: true });
    if (![...tabs.values()].includes(tab)) throw Error('Chrome sharing was stopped.');
    try { await chrome.debugger.attach({ tabId: tab.tabId }, '1.3'); }
    catch (error) { if (!/already attached/i.test(error.message)) throw error; }
    await withTimeout(chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.enable'), 8000, 'The tab is still waking up.');
    await holdZoom(tab.tabId);
    await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Emulation.setDeviceMetricsOverride', tab.viewport || viewportParams({ width:1280, height:800, mobile:false }));
    if (tab.cast) await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.startScreencast', tab.cast).catch(error => { if (!/already active/i.test(error.message)) throw error; });
    if (tab.micScript && ['claude.ai','www.claude.ai','localhost','127.0.0.1'].includes(new URL(current.url).hostname)) {
      await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: tab.micScript }).catch(() => {});
      const source = '(' + installRemoteMicrophone.toString() + ')();';
      tab.micScript = (await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
      await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Runtime.evaluate', { expression: source, userGesture: true });
    }
    tab.needsAttach = false;
  })();
  try { await tab.recovering; } finally { tab.recovering = null; }
}
// Real Chrome can place clicks using the screen's own pixel ratio instead of an emulated one, so with an
// emulated ratio of 2 on a normal screen clicks landed at half the distance (far above and left of the cursor).
// The page keeps the screen's own pixel ratio; its window is READ_ZOOM times the layout size the headset asks for
// (a scaled screenshot clip would also look sharper, but Chrome then returns stale pictures).
const viewportParams = params => ({ ...params, width: params.width * READ_ZOOM, height: params.height * READ_ZOOM, deviceScaleFactor: 0 });
async function sendCDP(tab, method, params = {}) {
  if (method === 'Emulation.setDeviceMetricsOverride') tab.viewport = params = viewportParams(params);
  // At 200% zoom a wheel step scrolls half as far, so scroll twice as much to feel the same
  if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseWheel') params = { ...params, deltaX: (params.deltaX || 0) * READ_ZOOM, deltaY: (params.deltaY || 0) * READ_ZOOM };
  if (method === 'Page.startScreencast') tab.cast = params;
  if (method === 'Page.stopScreencast') tab.cast = null;
  try {
    if (tab.needsAttach) await recoverTab(tab);
    return await chrome.debugger.sendCommand({ tabId: tab.tabId }, method, params);
  } catch (error) {
    if (!/not attached|not attached to an active page|no target with given id|session closed/i.test(error.message)) throw error;
    await recoverTab(tab);
    return chrome.debugger.sendCommand({ tabId: tab.tabId }, method, params);
  }
}
async function command(m) {
  if (m.command === 'open') {
    if (tabs.size >= 4) throw Error('Close a Sunnyvale browser window first (maximum four).');
    const u = webURL(m.url);
    // Same-origin tabs reuse the user's session and current conversation; unrelated tabs are untouched.
    const candidates = await chrome.tabs.query({});
    const used = new Set([...tabs.values()].map(t => t.tabId));
    // Skip tabs Chrome has put to sleep (discarded/frozen): they can stall the connection. Use a fresh tab instead.
    let tab = candidates.find(t => { try { return !used.has(t.id) && !t.discarded && !t.frozen && new URL(t.url).origin === u.origin; } catch { return false; } });
    if (!tab) tab = await chrome.tabs.create({ url: u.href, active: true });
    // Wake the tab up before connecting to it (background tabs can be paused by Chrome).
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    try { await chrome.debugger.attach({ tabId: tab.id }, '1.3'); }
    catch (error) {
      // A previous session may still be attached (for example after a bridge restart): let go and try again.
      if (!/already attached/i.test(error.message)) throw error;
      await chrome.debugger.detach({ tabId: tab.id }).catch(() => {});
      await chrome.debugger.attach({ tabId: tab.id }, '1.3');
    }
    const viewport = viewportParams({ width: 1280, height: 800, mobile: false });
    tabs.set(m.id, { tabId: tab.id, muted: tab.mutedInfo?.muted, viewport });
    try {
      await chrome.tabs.update(tab.id, { active: true, muted: !audioTabs.has(tab.id) });
      await withTimeout(chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable'), 8000, 'The tab is still waking up.');
      await holdZoom(tab.id);
      await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.setDeviceMetricsOverride', viewport);
      return { tabId: tab.id, url: tab.url || u.href, title: tab.title || '', audioEnabled: audioTabs.has(tab.id) };
    } catch (error) { const record = tabs.get(m.id); tabs.delete(m.id); await detach(record); throw error; }
  }
  const tab = tabs.get(m.id); if (!tab) throw Error('Chrome tab is no longer attached. Reopen it from Sunnyvale.');
  if (m.command === 'release') { tabs.delete(m.id); await detach(tab); return {}; }
  if (m.command === 'page-info') {
    // Fixed read-only inspection, limited to the already shared tab. Input
    // values, cookies, storage and passwords are deliberately not inspected.
    const expression = `JSON.stringify({url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,8000),width:innerWidth,height:innerHeight,dpr:devicePixelRatio})`;
    const result = await sendCDP(tab, 'Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw Error('The page is navigating. Try looking at it again.');
    return JSON.parse(result.result.value);
  }
  if (m.command === 'audio-start') { await startAudio(tab.tabId); return {}; }
  if (m.command === 'audio-stop') { await stopAudio(tab.tabId); return {}; }
  if (m.command === 'mic-start') {
    const source = '(' + installRemoteMicrophone.toString() + ')();';
    if (!tab.micScript) tab.micScript = (await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
    const result = await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Runtime.evaluate', { expression: source, userGesture: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error('Headset voice is available on Claude. Open Claude and try Mic again.');
    return {};
  }
  if (m.command === 'mic-stop') {
    if (tab.micScript) await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: tab.micScript });
    tab.micScript = null;
    await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Runtime.evaluate', { expression: 'window.__sunnyvaleMicrophone?.stop()', awaitPromise: true }); return {};
  }
  if (m.command === 'mic-data') {
    if (!tab.micScript || m.rate !== 24000 || typeof m.data !== 'string' || m.data.length > 20000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(m.data)) throw Error('Invalid microphone packet.');
    await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Runtime.evaluate', { expression: 'window.__sunnyvaleMicrophone?.push(' + JSON.stringify(m.data) + ',24000)', userGesture: true }); return {};
  }
  if (m.command !== 'cdp' || !permittedCommands.has(m.method)) throw Error('Unsupported browser command.');
  if (m.method === 'Page.navigate') webURL(m.params.url);
  let result = await sendCDP(tab, m.method, m.params || {});
  if (m.method === 'Page.captureScreenshot' && result.data?.length > 3000000) result = await sendCDP(tab, m.method, { ...m.params, format: 'jpeg', quality: 95 });
  return result;
}
chrome.debugger.onEvent.addListener((source, method, params) => {
  const item = [...tabs].find(([, tab]) => tab.tabId === source.tabId);
  if (!item) return;
  if (method === 'Page.screencastFrame') {
    const tab = item[1]; tab.latestFrame = params.data;
    const flush = () => {
      tab.frameTimer = null;
      if (!tabs.has(item[0]) || !tab.latestFrame) return;
      if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 512000) {
        send({ type: 'event', id: item[0], method, params: { data: tab.latestFrame } }); tab.latestFrame = null;
      }
      if (tab.latestFrame) tab.frameTimer = setTimeout(flush, 66);
    };
    if (!tab.frameTimer) tab.frameTimer = setTimeout(flush, 66);
    chrome.debugger.sendCommand({ tabId: source.tabId }, 'Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
  }
  if (method === 'Page.frameNavigated' && !params.frame.parentId) send({ type: 'event', id: item[0], method, params });
});
chrome.debugger.onDetach.addListener(async (source, reason) => {
  const item = [...tabs].find(([, tab]) => tab.tabId === source.tabId);
  if (!item) return;
  if (reason !== 'canceled_by_user') {
    const current = await chrome.tabs.get(source.tabId).catch(() => null);
    if (current && tabs.has(item[0])) { item[1].needsAttach = true; return; }
  }
  tabs.delete(item[0]); stopAudio(source.tabId); send({ type: 'event', id: item[0], method: 'detached', params: {} });
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
  if (m.target === 'offscreen-audio') return;
  if (m.target === 'background-audio') {
    const item = [...tabs].find(([, tab]) => tab.tabId === m.tabId);
    if (m.type === 'pcm' && item && audioTabs.has(m.tabId) && m.rate === 24000 && typeof m.data === 'string' && m.data.length <= 20000 && socket?.bufferedAmount < 1024000) {
      send({ type: 'event', id: item[0], method: 'bridge.audio', params: { rate: m.rate, data: m.data } });
    }
    if (m.type === 'ended') stopAudio(m.tabId);
    return;
  }
  if (m.type === 'audio-current' || m.type === 'audio-stop-current') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async selected => {
      if (!selected[0]?.id) throw Error('Open the Chrome tab you want to hear first.');
      if (m.type === 'audio-current') await startAudio(selected[0].id); else await stopAudio(selected[0].id);
      reply({ ok: true });
    }).catch(error => reply({ error: error.message })); return true;
  }
  if (m.type === 'status') { reply({ message }); return; }
  if (m.type === 'connect') { connect().then(() => reply({ ok: true })); return true; }
  if (m.type === 'disconnect') {
    clearTimeout(reconnect); socket?.close(); detachAll().then(() => reply({ ok: true })); return true;
  }
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
