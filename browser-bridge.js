import { HttpsBridgeSocket } from './bridge-https.js?v=20261021-media-1';
import { BrowserMedia } from './browser-media.js?v=build-a-1';
import { BrowserClickInput } from './browser-click-input.js';
import { openVoiceLink, createAudioReceiver } from './browser-voice-link.js?v=build-a-1';
// Private connection details stay in this browser, never in the repository.
export function installBrowserBridge({ THREE, scene, camera, renderer, panels, closeButtons, touchables,
  makeWindow, position, faceViewer, closeWindow, shown, styleWindow, status, worldTool, restorePanel, onConnection }) {
  let socket, ready = false, focused, keyboard, addressMode = false, address = '', uppercase = false, pendingType = null, pendingMic = false, quiescing = false, stopVoiceLink = () => {};
  const tabs = new Map();
  const closedAudioIds = new Set();
  const browserInput = new BrowserClickInput();
  const pinchClosed = state => {
    const tip=state.isHand&&state.hand?.joints?.['index-finger-tip'], thumb=state.hand?.joints?.['thumb-tip'];
    return !!(tip&&thumb&&state.hand.visible&&tip.getWorldPosition(tip.position.clone()).distanceTo(thumb.getWorldPosition(thumb.position.clone()))<.028);
  };
  const restoredPanels = [];
  const descriptions = new Map(); let descriptionCount = 0;
  const calls = new Map(); let callCount = 0;          // requests that wait for an answer from the PC (backups)
  let worldQueue = Promise.resolve();
  const updateReadingQuality = () => {};          // the main page turns foveation off while any window is open
  const send = m => { if (ready && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m)); };
  const fields = document.getElementById('bridgeSettings');
  fields.innerHTML = `<summary><b>PC browser bridge</b></summary>
    <label>Secure bridge address<input id="bridgeURL" placeholder="wss://your-tunnel/bridge"></label>
    <label>Private pairing code<input id="bridgeToken" type="password" autocomplete="off"></label>
    <button id="bridgeConnect">Connect</button> <button id="bridgeDisconnect">Disconnect</button>
    <button id="bridgeMicrophone">Allow headset microphone</button>
    <div id="bridgeStatus">Not connected. Your PC must stay on.</div>`;
  for (const name of ['bridgeURL', 'bridgeToken']) document.getElementById(name).value = localStorage.getItem(name) || '';
  const report = text => { document.getElementById('bridgeStatus').textContent = text; };
  const media = new BrowserMedia(send, message => { report(message); status(message); });
  media.changed = () => {
    for (const [id, tab] of tabs) {
      const mic = media.microphone?.id === id ? media.microphone : null;
      tab.micButton?.userData.label(mic ? (mic.pending ? 'Mic …' : 'Mic ON') : 'Mic');
      if (tab.micIndicator) { tab.micIndicator.visible = !!mic; tab.micIndicator.userData.label(mic?.pending ? 'MIC CONNECTING' : '● LISTENING'); }
      tab.panel.userData.microphoneShared = !!mic;
    }
  };
  document.getElementById('bridgeMicrophone').onclick = async () => {
    try {
      await media.unlock();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      report('Microphone permission allowed. Inside VR, tap Mic on Claude’s window to share it.');
    } catch { report('Microphone permission was not allowed. Use this page’s microphone permission in Quest Browser settings, then try again.'); }
  };
  function button(parent, label, x, y, w, action) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#20170e'; ctx.fillRect(0, 0, 256, 80);
    ctx.strokeStyle = '#ffd27a'; ctx.strokeRect(2, 2, 252, 76);
    ctx.fillStyle = '#ffd27a'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, 128, 50);
    const texture = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, .055), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, .008); parent.add(mesh);
    mesh.userData.label = value => {
      ctx.fillStyle = '#20170e'; ctx.fillRect(0, 0, 256, 80); ctx.strokeStyle = '#ffd27a'; ctx.strokeRect(2, 2, 252, 76);
      ctx.fillStyle = '#ffd27a'; ctx.fillText(value, 128, 50); texture.needsUpdate = true;
    };
    touchables.push({ mesh, w, h: .055, action }); return mesh;
  }
  function key(value) {
    if (!focused) return;
    if (addressMode) {
      if (value === 'Enter') { let url = address.trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url; send({ type: 'navigate', id: focused, url }); addressMode = false; status('Opening page'); }
      else if (value === 'Backspace') address = address.slice(0, -1);
      else address += value;
      if (addressMode) status('Address: ' + address);
    } else send(['Enter', 'Backspace', 'Tab'].includes(value) ? { type: 'key', id: focused, key: value } : { type: 'text', id: focused, text: value });
  }
  function showKeyboard(id) {
    focused = id; if (keyboard) { keyboard.visible = !keyboard.visible; return; }
    keyboard = makeWindow('Browser keyboard', '', position(1)); keyboard.userData.kind = 'browser-keyboard';
    keyboard.userData.baseScale = 1.35; keyboard.scale.setScalar(1.35); faceViewer(keyboard); styleWindow(keyboard);
    const rows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm.,', ':/?&=-_@'];
    rows.forEach((row, r) => [...row].forEach((ch, i) => button(keyboard, ch, (i - (row.length - 1) / 2) * .072, .16 - r * .065, .066, () => key(uppercase ? ch.toUpperCase() : ch))));
    button(keyboard, 'Space', -.23, -.18, .18, () => key(' '));
    button(keyboard, 'Delete', -.02, -.18, .18, () => key('Backspace'));
    button(keyboard, 'Enter', .19, -.18, .18, () => key('Enter'));
    button(keyboard, 'Shift', -.22, -.25, .18, () => { uppercase = !uppercase; status(uppercase ? 'CAPITAL letters' : 'Small letters'); });
    button(keyboard, 'Tab', .02, -.25, .18, () => key('Tab'));
  }
  function newPanel(m) {
    const panel = makeWindow('', '', position(tabs.size));
    if (panel.userData.readButton) panel.userData.readButton.visible = false;     // reading mode is for text windows, not web pages
    panel.userData.title = 'Browser - grab the frame'; panel.userData.kind = 'browser'; panel.userData.browserId = m.id;
    panel.userData.baseScale = 1.8; panel.scale.setScalar(1.8); faceViewer(panel); styleWindow(panel);
    const canvas = document.createElement('canvas'); canvas.width = 2560; canvas.height = 1600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = '32px sans-serif'; ctx.fillText('Loading browser…', 30, 70);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
    const content = new THREE.Mesh(new THREE.PlaneGeometry(.72, .45), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    content.position.set(0, -.025, .006); panel.add(content);
    const tab = { panel, content, canvas, ctx, texture, url: m.url, decoding: false, width: m.width || 1280, height: m.height || 800, audioEnabled: !!m.audioEnabled }; tabs.set(m.id, tab);
    tab.title = m.title || new URL(m.url).hostname; panel.userData.title = tab.title; panel.userData.url = m.url;
    tab.cursor = new THREE.Mesh(new THREE.RingGeometry(.002, .004, 24), new THREE.MeshBasicMaterial({color:0xffd27a,depthTest:false,toneMapped:false}));
    tab.cursor.position.z = .004; tab.cursor.renderOrder = 1001; tab.cursor.visible = false; content.add(tab.cursor);
    const lensCanvas = document.createElement('canvas'); lensCanvas.width = 512; lensCanvas.height = 320;
    tab.lensCanvas = lensCanvas; tab.lensTexture = new THREE.CanvasTexture(lensCanvas); tab.lensTexture.colorSpace = THREE.SRGBColorSpace;
    tab.lens = new THREE.Mesh(new THREE.PlaneGeometry(.2,.125),new THREE.MeshBasicMaterial({map:tab.lensTexture,depthTest:false,toneMapped:false}));
    tab.lens.renderOrder = 1000; tab.lens.visible = false; panel.add(tab.lens);
    updateReadingQuality();
    button(panel, 'Back', -.32, .235, .09, () => send({ type: 'back', id: m.id }));
    button(panel, 'Next', -.22, .235, .09, () => send({ type: 'forward', id: m.id }));
    button(panel, 'Reload', -.12, .235, .09, () => send({ type: 'reload', id: m.id }));
    button(panel, 'URL', -.02, .235, .09, () => { focused = m.id; addressMode = true; address = ''; showKeyboard(m.id); keyboard.visible = true; status('Type a website address, then Enter'); });
    button(panel, 'Keys', .08, .235, .09, () => { addressMode = false; showKeyboard(m.id); });
    button(panel, 'New', .18, .235, .09, () => send({ type: 'open', url: 'https://example.com' }));
    const lensButton = button(panel, 'Lens', .28, .235, .09, () => { tab.lensEnabled = !tab.lensEnabled; lensButton.userData.label(tab.lensEnabled ? 'Lens ON' : 'Lens'); tab.lens.visible = false; });
    button(panel, 'Up', -.17, -.29, .16, () => send({ type: 'scroll', id: m.id, x: 640, y: 400, delta: -550 }));
    button(panel, 'Down', .02, -.29, .16, () => send({ type: 'scroll', id: m.id, x: 640, y: 400, delta: 550 }));
    button(panel, 'Text +', -.28, -.36, .16, () => send({ type: 'text-scale', id: m.id, delta: 1 }));
    button(panel, 'Text -', -.09, -.36, .16, () => send({ type: 'text-scale', id: m.id, delta: -1 }));
    tab.micButton = button(panel, 'Mic', .1, -.36, .16, () => media.toggleMic(m.id));
    tab.micIndicator = button(panel, '● LISTENING', 0, .315, .36, () => media.stopMic()); tab.micIndicator.visible = false;
    tab.soundButton = button(panel, tab.audioEnabled ? 'Sound ON' : 'Sound', .29, -.36, .16, async () => {
      try {
        tab.suppressAudio = tab.audioEnabled;
        if (tab.suppressAudio) media.stopAudio(m.id);
        await media.unlock(); send({ type: tab.audioEnabled ? 'audio-stop' : 'audio-start', id: m.id });
      }
      catch { status('Allow sound on the Sunnyvale page before entering VR.'); }
    });
    focused = m.id;
    const savedIndex = restoredPanels.findIndex(saved => saved.url === m.url);
    if (savedIndex >= 0) restorePanel?.(panel, restoredPanels.splice(savedIndex, 1)[0]);
  }
  function disconnect() {
    quiescing = false; document.getElementById('bridgeConnect').disabled = false;
    stopVoiceLink(); stopVoiceLink = () => {};
    browserInput.reset();
    media.stopAll();
    ready = false; const old = socket; socket = null; old?.close();
    for (const t of [...tabs.values()]) closeWindow(t.panel);
    tabs.clear(); restoredPanels.length = 0; updateReadingQuality(); report('Disconnected. Reconnect before using the browser buttons.');
    for (const job of descriptions.values()) { clearTimeout(job.timer); job.resolve(null); } descriptions.clear();
    for (const c of calls.values()) { clearTimeout(c.timer); c.reject(Error('Disconnected from the PC.')); } calls.clear();
  }
  // Staying connected: after pressing Connect (or opening the private link), a dropped connection is retried
  // by itself, after 2, 4, 8 ... up to 30 seconds, until it's back or you press Disconnect. Browser windows that
  // were open come back in the same places once it reconnects.
  let wanted = false, retryTimer = null, retryDelay = 2000, wasReady = false;
  const setReady = value => { if (ready !== value) ready = value; if (value !== wasReady) { wasReady = value; onConnection?.(value); } };
  function reopenSaved() { for (const saved of restoredPanels) if (!saved.requested) { saved.requested = true; send({ type: 'open', url: saved.url }); } }
  // The PC says "heartbeat" every 15 s; hearing nothing for 40 s means the connection silently died
  let lastHeard = 0;
  // Voice diagnostics: every 10 s while Claude's voice is playing, tell the PC how the sound arrived
  // (pieces, gaps, times the player ran dry) and how long the headset's main thread froze. The PC writes it
  // to bridge/private/voice.log so the voice can be tuned from real numbers. No sound or words are sent.
  let stall = 0, tick = performance.now();
  setInterval(() => { const t = performance.now(); stall = Math.max(stall, t - tick - 100); tick = t; }, 100);
  setInterval(() => {
    const v = media.takeVoiceStats();
    if (ready && v.packets) send({ type: 'voice-stats', packets: v.packets, underruns: v.underruns, dropped: v.dropped, maxGap: Math.round(v.maxGap), lead: v.lead, stall: Math.round(stall), transport: socket instanceof HttpsBridgeSocket ? 'https' : 'wss' });
    stall = 0;
  }, 10000);
  setInterval(() => { if (ready && Date.now() - lastHeard > 40000) { report('Lost contact with the PC.'); try { socket?.close(); } catch { /* already closed */ } } }, 5000);
  function scheduleRetry(reason) {
    if (!wanted || retryTimer) return;                  // already waiting to try again
    const wait = retryDelay; retryDelay = Math.min(30000, retryDelay * 2);
    report(`${reason} Trying again in ${Math.round(wait / 1000)} s…`);
    retryTimer = setTimeout(() => { retryTimer = null; connect(true); }, wait);
  }
  document.getElementById('bridgeDisconnect').onclick = () => { wanted = false; clearTimeout(retryTimer); retryTimer = null; disconnect(); setReady(false); };
  window.addEventListener('pagehide', () => { wanted = false; clearTimeout(retryTimer); retryTimer = null; media.stopAll(); ready = false; socket?.close(); });
  window.addEventListener('pageshow', e => { if (e.persisted && document.getElementById('bridgeURL').value.trim() && document.getElementById('bridgeToken').value.trim()) document.getElementById('bridgeConnect').click(); });
  document.getElementById('bridgeConnect').onclick = () => { if (quiescing) return; wanted = true; retryDelay = 2000; clearTimeout(retryTimer); retryTimer = null; connect(false); };
  function connect(automatic) {
    quiescing = false;
    media.unlock().catch(() => {});
    // Remember the browser windows (address, place, size, lock) so they reopen after reconnecting
    if (automatic) for (const t of tabs.values()) if (t.url) {
      const u = t.panel.userData;
      restoredPanels.push({ url: t.url, locked: !!u.locked, pose: { p: t.panel.position.toArray(), q: t.panel.quaternion.toArray(), s: t.panel.scale.toArray(), baseScale: u.baseScale || 1 } });
    }
    const reopen = automatic ? restoredPanels.slice() : [];
    for (const r of reopen) delete r.requested;          // ask again for windows that didn't make it back last time
    disconnect();
    restoredPanels.push(...reopen);
    let url;
    try { url = new URL(document.getElementById('bridgeURL').value.trim());
      if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['localhost', '127.0.0.1'].includes(url.hostname) && ['localhost', '127.0.0.1'].includes(location.hostname))) throw Error();
      if (url.username || url.password || url.search || url.hash) throw Error();
    } catch { report('Enter a secure wss:// address. PC previews can use ws://localhost:8130/bridge.'); return; }
    const token = document.getElementById('bridgeToken').value.trim();
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) {
      report('The pairing code is missing or incomplete. Use the full code from the PC’s bridge/private/pairing.txt file.'); return;
    }
    if (url.pathname === '/' || url.pathname === '/bridge/') url.pathname = '/bridge';
    if (url.pathname !== '/bridge') { report('The bridge address must end with /bridge.'); return; }
    localStorage.setItem('bridgeURL', url.href); localStorage.setItem('bridgeToken', token);
    function connectTransport(https = false) {
      report(https ? 'Trying the secure HTTPS backup connection…' : 'Connecting to the secure PC address…');
      const current = https ? new HttpsBridgeSocket(url.href, token) : new WebSocket(url.href); socket = current;
      let failure = '', pairingTimer, closeVoice = () => {};
      const receiveAudio = createAudioReceiver({
        play: packet => {
          if (quiescing) return;
          const tab = tabs.get(packet.id);
          // Audio can overtake its panel metadata on the other connection.
          // Only an explicit close/mute suppresses it, not missing metadata.
          if (closedAudioIds.has(packet.id) || tab?.suppressAudio) return;
          media.play(packet.id, packet.data, packet.rate);
          if (tab) tab.soundAt = performance.now();
        },
        acknowledge: seq => { closeVoice.acknowledge?.(seq); send({ type: 'audio-ack', seq }); },
      });
      const clearTimers = () => { clearTimeout(connectionTimer); clearTimeout(pairingTimer); };
      const fail = message => {
        if (socket !== current || ready) return;
        failure = message; clearTimers(); report(message);
        try { current.close(); } catch { /* connection already closed */ }
        scheduleRetry(message);
      };
      const fallback = () => {
        if (socket !== current || ready) return;
        clearTimers(); socket = null;
        try { current.close(); } catch { /* previous connection already closed */ }
        connectTransport(true);
      };
      const connectionTimer = setTimeout(() => {
        if (!https) fallback();
        else fail('The secure HTTPS backup could not connect within 15 seconds. Check the current PC bridge address and try again.');
      }, https ? 15000 : 5000);
      current.onopen = () => {
        if (socket !== current) { current.close(); return; }
        clearTimeout(connectionTimer);
        report('PC reached. Checking the private pairing code…');
        pairingTimer = setTimeout(() => fail('The PC was reached, but pairing did not finish. Disconnect other Sunnyvale pages (keep the Chrome extension connected), then try again.'), 8000);
        current.send(JSON.stringify({ type: 'pair', token, audioProtocol: 1 }));
      };
      current.onmessage = async event => {
        if (socket !== current || failure) return;
        lastHeard = Date.now();
        let m; try { m = JSON.parse(event.data); } catch { fail('The secure address returned an unexpected response. Check that you used the current PC bridge address.'); return; }
        if (quiescing && m.type === 'tab') { send({ type: 'close', id: m.id }); return; }
        if (quiescing && m.type === 'frame') { send({ type: 'ack', id: m.id }); return; }
        if (m.type === 'rtt-ping') { send({ type: 'rtt-pong', t: m.t }); return; }
        if (m.type === 'reply') { const c = calls.get(m.reqId); if (c) { calls.delete(m.reqId); clearTimeout(c.timer); m.ok ? c.resolve(m) : c.reject(Error(m.error || 'The PC could not do that.')); } return; }
        if (m.type === 'world-call') {                                    // a command from the user's Claude connector
          if (quiescing) { send({type:'world-result',reqId:m.reqId,ok:false,error:'Session is logging off.'}); return; }
          if (m.expiresAt && Date.now() > m.expiresAt) { send({type:'world-result',reqId:m.reqId,ok:false,error:'This tool request expired before reaching the headset. Please try again.'}); return; }
          // Yield between builds. A batch of synchronous canvas/window work
          // must not monopolize the same event loop that receives audio.
          worldQueue = worldQueue.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, 0))).then(() => {
            if (socket !== current || !ready || quiescing) throw Error('The headset connection changed or is logging off. Retry this tool.');
            if (m.expiresAt && Date.now() > m.expiresAt) throw Error('This tool request expired. Retry it.');
            return worldTool(String(m.name), m.input || {});
          })
            .then(result => send({ type: 'world-result', reqId: m.reqId, ok: true, result: String(result) }))
            .catch(e => send({ type: 'world-result', reqId: m.reqId, ok: false, error: String(e?.message || e) }));
          return;
        }
        if (m.type === 'ready') {
          clearTimers(); setReady(true); retryDelay = 2000; lastHeard = Date.now();
          closedAudioIds.clear();
          if (!https) {
            closeVoice();
            closeVoice = openVoiceLink({ url: url.href, token, key: m.audioKey, isCurrent: () => socket === current && ready,
              onAudio: receiveAudio });
            stopVoiceLink = closeVoice;
          }
          if (m.browserReady !== false) reopenSaved();
          report(m.browserReady === false ? 'Headset connected. Connect the Sunnyvale extension in Google Chrome on your PC next.' : (https ? 'Connected through secure HTTPS. Claude and the heart use your PC browser.' : 'Connected. Claude and the heart use your PC browser.'));
        }
        if (m.type === 'browser-status' && m.connected) reopenSaved();
        if (m.type === 'browser-status') { if (!m.connected) media.stopAll(); report(m.connected ? 'Connected to your Google Chrome. Claude and the heart open inside the world.' : 'Chrome disconnected. Reconnect the Sunnyvale extension on the PC.'); }
        if (m.type === 'sharing-stopped') { closedAudioIds.add(m.id); media.stop(m.id); }
        if (m.type === 'tab') {
          newPanel(m);
          if (pendingType) {                                            // type the waiting text once the page has had time to load
            const job = pendingType, id = m.id; pendingType = null;
            setTimeout(() => {
              send({ type: 'click', id, x: 640, y: 360 });
              const parts = job.text.match(/[\s\S]{1,1500}/g) || [];
              parts.forEach((part, i) => setTimeout(() => send({ type: 'text', id, text: part }), 600 + i * 450));
              status(`Typing ${parts.length} part${parts.length === 1 ? '' : 's'} into the new document…`);
            }, 8000);
          }
          if (pendingMic && /claude\.ai/.test(m.url || '')) { pendingMic = false; setTimeout(() => { if (wanted && socket === current && ready && tabs.has(m.id)) media.toggleMic(m.id); }, 4000); }
        }
        if (m.type === 'page-info') {
          const t = tabs.get(m.id); if (t) { t.url = m.url; t.title = m.title; t.text = m.text; t.panel.userData.title = m.title; t.panel.userData.url = m.url; }
          const job = descriptions.get(m.reqId); if (job) { descriptions.delete(m.reqId); clearTimeout(job.timer); job.resolve({url:m.url,title:m.title,text:m.text}); }
        }
        if (m.type === 'location' && tabs.has(m.id)) {
          tabs.get(m.id).url = m.url;
          if (media.microphone?.id === m.id && !['claude.ai','www.claude.ai','localhost','127.0.0.1'].includes(new URL(m.url).hostname)) media.stopMic();
        }
        if (m.type === 'viewport' && tabs.has(m.id)) { tabs.get(m.id).width = m.width; tabs.get(m.id).height = m.height; }
        if (m.type === 'audio') receiveAudio(m);
        if (m.type === 'audio-status' && tabs.has(m.id)) { const tab = tabs.get(m.id); tab.audioEnabled = m.enabled; tab.suppressAudio = !m.enabled; tab.soundButton.userData.label(m.enabled ? 'Sound ON' : 'Sound'); if (!m.enabled) media.stopAudio(m.id); }
        if (m.type === 'mic-status') media.micReady(m.id, m.enabled);
        if (m.type === 'error') { if (media.microphone?.pending && (!m.id || m.id === media.microphone.id)) media.stopMic(); report(m.message); status(m.message); }
        if (m.type === 'frame') {
          const t = tabs.get(m.id);
          if (!t || t.decoding) { send({ type: 'ack', id: m.id }); return; }
          t.decoding = true;
          const img = new Image();
          img.onload = () => {
            if (tabs.has(m.id)) {
              if (t.canvas.width !== img.naturalWidth || t.canvas.height !== img.naturalHeight) {
                t.canvas.width = img.naturalWidth; t.canvas.height = img.naturalHeight;
                t.content.material.map.dispose(); t.texture = new THREE.CanvasTexture(t.canvas); t.texture.colorSpace = THREE.SRGBColorSpace;
                t.texture.minFilter = THREE.LinearMipmapLinearFilter; t.texture.generateMipmaps = true; t.texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
                t.content.material.map = t.texture; t.content.material.needsUpdate = true;
              }
              t.ctx.drawImage(img, 0, 0); t.texture.needsUpdate = true;
            }
            t.decoding = false; send({ type: 'ack', id: m.id });
          };
          img.onerror = () => { t.decoding = false; send({ type: 'ack', id: m.id }); };
          img.src = (m.data.startsWith('iVBOR') ? 'data:image/png;base64,' : 'data:image/jpeg;base64,') + m.data;
        }
      };
      current.onclose = event => {
        clearTimers(); closeVoice();
        if (socket !== current) return;
        if (!https && !ready && !failure && event.code !== 1008 && event.code !== 4001) { fallback(); return; }
        const lost = ready;
        setReady(false);
        media.stopAll();
        const why = failure || (event.code === 1008
          ? 'The PC rejected the pairing code. Check the full code from the PC’s bridge/private/pairing.txt.'
          : event.code === 4001 ? 'Another Sunnyvale page, or the old connection, is still connected (an old one is let go within 30 s).'
          : event.code === 1013 ? 'The voice connection fell behind. Reconnecting to the PC bridge…'
          : 'Bridge disconnected.');
        report(why);
        if (lost) status('Browser bridge disconnected');
        scheduleRetry(why);
      };
      current.onerror = event => {
        if (socket !== current) return;
        if (!https && !ready) { fallback(); return; }
        clearTimers();
        failure = failure || (https && event?.message ? event.message : (ready ? 'Lost the secure PC bridge connection. Try Connect again.' : 'Could not reach the secure HTTPS backup. Check the current bridge address and try again.'));
        report(failure);
      };
    }
    connectTransport();
  }
  window.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || !ready || !focused || !tabs.has(focused) || !keyboard?.visible) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 || ['Enter', 'Tab', 'Backspace'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); key(e.key); }
  }, true);
  for (const name of ['bridgeURL', 'bridgeToken']) document.getElementById(name).addEventListener('keydown', e => e.stopPropagation());
  // The one-click launcher supplies credentials in a URL fragment (never sent to GitHub).
  const pairing = new URLSearchParams(location.hash.slice(1));
  if (pairing.has('bridge') && pairing.has('pair')) {
    document.getElementById('bridgeURL').value = pairing.get('bridge');
    document.getElementById('bridgeToken').value = pairing.get('pair');
    history.replaceState(null, '', location.pathname + location.search);
    document.getElementById('bridgeConnect').click();
  } else if (document.getElementById('bridgeURL').value.trim() && document.getElementById('bridgeToken').value.trim()) {
    // Try the saved private connection once. A stale temporary address is
    // reported by the normal connection timeout, without leaving the world.
    setTimeout(() => document.getElementById('bridgeConnect').click(), 0);
  }
  return {
    quietForLogOff() {
      quiescing = true; wanted = false; clearTimeout(retryTimer); retryTimer = null; pendingMic = false; pendingType = null;
      document.getElementById('bridgeConnect').disabled = true;
      stopVoiceLink(); stopVoiceLink = () => {}; media.stopAll();
      for (const tab of [...tabs.values()]) closeWindow(tab.panel);
      if (keyboard?.parent) closeWindow(keyboard); keyboard = null;
    },
    disconnect() { wanted = false; clearTimeout(retryTimer); retryTimer = null; pendingMic = false; pendingType = null; disconnect(); setReady(false); },
    describe(id) {
      const tab = tabs.get(id); if (!tab) return Promise.resolve(null);
      if (!ready) return Promise.resolve({url:tab.url,title:tab.title,text:tab.text||'',stale:true});
      return new Promise(resolve => { const reqId='info-'+(++descriptionCount); const timer=setTimeout(()=>{descriptions.delete(reqId);resolve({url:tab.url,title:tab.title,text:tab.text||'',stale:true});},5000); descriptions.set(reqId,{resolve,timer}); send({type:'page-info',id,reqId}); });
    },
    get microphoneState() { const mic = media.microphone; return mic ? { id: mic.id, pending: mic.pending } : null; },
    // For Claude's avatar: is the mic shared with a Claude tab, and is a Claude tab playing sound (Claude's voice)?
    claudeVoice() {
      const claudeTabs = [...tabs].filter(([, t]) => /(^|\.)claude\.ai$/.test((() => { try { return new URL(t.url).hostname; } catch { return ''; } })()));
      const mic = media.microphone;
      return {
        listening: !!mic && !mic.pending && claudeTabs.some(([id]) => id === mic.id),
        speaking: claudeTabs.some(([id]) => media.speakingNow(id)),
        level: Math.max(0, ...claudeTabs.map(([id]) => media.voiceLevel(id))),
      };
    },
    voiceActive() { return [...tabs].some(([id, tab]) => { try { return ['claude.ai', 'www.claude.ai'].includes(new URL(tab.url).hostname) && media.spokeWithin(id); } catch { return false; } }); },
    open(url, saved) { if (!ready || quiescing) return false; if (saved) restoredPanels.push(saved); send({ type: 'open', url }); return true; },
    urlOf(id) { return tabs.get(id)?.url || ''; },
    isReady() { return ready; },
    // Ask the PC something and wait for its answer (used by backups); messages must stay under about 60 KB
    call(type, payload = {}, timeout = 30000) {
      if (!ready) return Promise.reject(Error('Not connected to the PC.'));
      return new Promise((resolve, reject) => {
        const reqId = 'c' + (++callCount);
        const timer = setTimeout(() => { calls.delete(reqId); reject(Error('The PC did not answer in time.')); }, timeout);
        calls.set(reqId, { resolve, reject, timer });
        send({ ...payload, type, reqId });
      });
    },
    get wanted() { return wanted; },
    clearHover() { for (const tab of tabs.values()) { tab.cursor.visible = false; tab.lens.visible = false; } },
    hover(raycaster) {
      for (const tab of tabs.values()) { tab.cursor.visible = false; tab.lens.visible = false; }
      const hit = raycaster.intersectObjects([...tabs.values()].map(t=>t.content).filter(shown),false)[0];
      if (!hit || hit.object.parent.userData.locked) return false;
      const tab=tabs.get(hit.object.parent.userData.browserId), uv=hit.uv;
      tab.cursor.position.set((uv.x-.5)*.72,(uv.y-.5)*.45,.004); tab.cursor.visible=true;
      if (tab.lensEnabled) {
        tab.lens.visible=true;tab.lens.position.set(Math.max(-.25,Math.min(.25,(uv.x-.5)*.72+.13)),Math.max(-.16,Math.min(.16,(uv.y-.5)*.45+.09)),.022);
        if (!tab.lensAt || performance.now()-tab.lensAt>100) {
          tab.lensAt=performance.now();const g=tab.lensCanvas.getContext('2d'),w=tab.canvas.width*.1,h=w*.625;
          const x=Math.max(0,Math.min(tab.canvas.width-w,uv.x*tab.canvas.width-w/2)),y=Math.max(0,Math.min(tab.canvas.height-h,(1-uv.y)*tab.canvas.height-h/2));
          g.drawImage(tab.canvas,x,y,w,h,0,0,512,320);g.strokeStyle='#ffd27a';g.lineWidth=8;g.strokeRect(4,4,504,312);tab.lensTexture.needsUpdate=true;
        }
      }
      if (!tab.hoverAt || performance.now()-tab.hoverAt>100) { tab.hoverAt=performance.now();send({type:'move',id:hit.object.parent.userData.browserId,x:Math.min(tab.width-1,uv.x*tab.width),y:Math.min(tab.height-1,(1-uv.y)*tab.height)}); }
      return true;
    },
    // Open a page (e.g. docs.new) and type text into it once it has loaded (used to export the thesis)
    openAndType(url, text) {
      if (!ready || quiescing) return false;
      pendingType = { text: String(text) };
      send({ type: 'open', url });
      return true;
    },
    // Start sharing the headset microphone with the Claude tab (opens Claude first if needed)
    claudeMic() {
      if (quiescing) return;
      const entry = [...tabs].find(([, t]) => /claude\.ai/.test(t.url || ''));
      if (!entry) { if (ready) { pendingMic = true; send({ type: 'open', url: 'https://claude.ai/new' }); } return; }
      if (media.microphone?.id !== entry[0]) media.toggleMic(entry[0]);
    },
    beginSelect(state) { return browserInput.begin(state); },
    endSelect(state) { browserInput.end(state, pinchClosed(state)); },
    cancelSelect(state) { browserInput.cancel(state); },
    hit(raycaster, scroll = 0, source) {
      const hit = raycaster.intersectObjects([...tabs.values()].map(t => t.content).filter(shown), false)[0];
      if (!hit) return false;
      const panel = hit.object.parent, id = panel.userData.browserId;
      if (panel.userData.locked) return false;          // locked windows can be moved, but not clicked
      if (!scroll && source && !browserInput.select(source)) return true;
      focused = id; addressMode = false;
      const tab = tabs.get(id);
      send({ type: scroll ? 'scroll' : 'click', id, x: Math.min(tab.width-1,hit.uv.x*tab.width), y: Math.min(tab.height-1,(1-hit.uv.y)*tab.height), delta: scroll });
      return true;
    },
    touch(point, state) {
      browserInput.observe(state,pinchClosed(state));
      if (state.hand?.visible === false) { browserInput.cancel(state); return; }
      // Do not re-arm on tiny depth/edge tracking jitter. A fingertip must
      // leave the wider contact area before another direct tap can click.
      const contact=tabs.get(browserInput.contactOf(state));
      if(contact && shown(contact.content) && !contact.panel.userData.locked) {
        const p=contact.content.worldToLocal(point.clone());
        if(Math.abs(p.z)<.035&&Math.abs(p.x)<.38&&Math.abs(p.y)<.245)return;
      }
      browserInput.leave(state);
      for (const [id, t] of tabs) {
        if (!shown(t.content) || t.panel.userData.locked) continue;
        const p = t.content.worldToLocal(point.clone());
        if (Math.abs(p.z) < .018 && Math.abs(p.x) < .36 && Math.abs(p.y) < .225) {
          if (browserInput.contact(state,id)) { focused = id; send({ type: 'click', id, x: Math.min(t.width-1,(p.x / .72 + .5) * t.width), y: Math.min(t.height-1,(.5 - p.y / .45) * t.height) }); }
          return;
        }
      }
    },
    closed(panel) {
      closedAudioIds.add(panel.userData.browserId);
      media.stop(panel.userData.browserId);
      if (panel === keyboard) keyboard = null;
      if (['browser', 'browser-keyboard'].includes(panel.userData.kind)) for (const child of panel.children) {
        if (child === panel.userData.closeButton) continue;
        child.geometry?.dispose(); child.material?.map?.dispose(); child.material?.dispose();
      }
      const id = panel.userData.browserId, t = tabs.get(id);
      if (!t) return;
      t.cursor.geometry.dispose(); t.cursor.material.dispose();
      t.lens.geometry.dispose(); t.lens.material.dispose(); t.lensTexture.dispose();
      send({ type: 'close', id }); tabs.delete(id); updateReadingQuality();
    },
    get connected() { return ready; },
  };
}
