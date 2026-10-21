import { HttpsBridgeSocket } from './bridge-https.js?v=20261021-media-1';
import { BrowserMedia } from './browser-media.js?v=20261021-media-1';
// Private connection details stay in this browser, never in the repository.
export function installBrowserBridge({ THREE, scene, camera, renderer, panels, closeButtons, touchables,
  makeWindow, position, faceViewer, closeWindow, shown, styleWindow, status, worldTool }) {
  let socket, ready = false, focused, keyboard, addressMode = false, address = '', uppercase = false, pendingType = null, pendingMic = false;
  const tabs = new Map();
  const normalFoveation = renderer?.xr?.getFoveation?.() ?? 1;
  const updateReadingQuality = () => renderer?.xr?.setFoveation?.(tabs.size ? 0 : normalFoveation);
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
    for (const [id, tab] of tabs) tab.micButton?.userData.label(media.microphone?.id === id ? (media.microphone.pending ? 'Mic …' : 'Mic ON') : 'Mic');
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
    panel.userData.title = 'Browser - grab the frame'; panel.userData.kind = 'browser'; panel.userData.browserId = m.id;
    panel.userData.baseScale = 1.8; panel.scale.setScalar(1.8); faceViewer(panel); styleWindow(panel);
    const canvas = document.createElement('canvas'); canvas.width = 2560; canvas.height = 1600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = '32px sans-serif'; ctx.fillText('Loading browser…', 30, 70);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
    const content = new THREE.Mesh(new THREE.PlaneGeometry(.72, .45), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    content.position.set(0, -.025, .006); panel.add(content);
    const tab = { panel, content, canvas, ctx, texture, url: m.url, decoding: false, width: m.width || 1280, height: m.height || 800, audioEnabled: !!m.audioEnabled }; tabs.set(m.id, tab);
    updateReadingQuality();
    button(panel, 'Back', -.32, .235, .09, () => send({ type: 'back', id: m.id }));
    button(panel, 'Next', -.22, .235, .09, () => send({ type: 'forward', id: m.id }));
    button(panel, 'Reload', -.12, .235, .09, () => send({ type: 'reload', id: m.id }));
    button(panel, 'URL', -.02, .235, .09, () => { focused = m.id; addressMode = true; address = ''; showKeyboard(m.id); keyboard.visible = true; status('Type a website address, then Enter'); });
    button(panel, 'Keys', .08, .235, .09, () => { addressMode = false; showKeyboard(m.id); });
    button(panel, 'New', .18, .235, .09, () => send({ type: 'open', url: 'https://example.com' }));
    button(panel, 'Up', -.17, -.29, .16, () => send({ type: 'scroll', id: m.id, x: 640, y: 400, delta: -550 }));
    button(panel, 'Down', .02, -.29, .16, () => send({ type: 'scroll', id: m.id, x: 640, y: 400, delta: 550 }));
    button(panel, 'Text +', -.28, -.36, .16, () => send({ type: 'text-scale', id: m.id, delta: 1 }));
    button(panel, 'Text -', -.09, -.36, .16, () => send({ type: 'text-scale', id: m.id, delta: -1 }));
    tab.micButton = button(panel, 'Mic', .1, -.36, .16, () => media.toggleMic(m.id));
    tab.soundButton = button(panel, tab.audioEnabled ? 'Sound ON' : 'Sound', .29, -.36, .16, async () => {
      try { await media.unlock(); send({ type: tab.audioEnabled ? 'audio-stop' : 'audio-start', id: m.id }); }
      catch { status('Allow sound on the Sunnyvale page before entering VR.'); }
    });
    focused = m.id;
  }
  function disconnect() {
    media.stopAll();
    ready = false; const old = socket; socket = null; old?.close();
    for (const t of [...tabs.values()]) closeWindow(t.panel);
    tabs.clear(); updateReadingQuality(); report('Disconnected. Reconnect before using the browser buttons.');
  }
  document.getElementById('bridgeDisconnect').onclick = disconnect;
  window.addEventListener('pagehide', () => { media.stopAll(); ready = false; socket?.close(); });
  document.getElementById('bridgeConnect').onclick = () => {
    media.unlock().catch(() => {});
    disconnect();
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
      let failure = '', pairingTimer;
      const clearTimers = () => { clearTimeout(connectionTimer); clearTimeout(pairingTimer); };
      const fail = message => {
        if (socket !== current || ready) return;
        failure = message; clearTimers(); report(message);
        try { current.close(); } catch { /* connection already closed */ }
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
        current.send(JSON.stringify({ type: 'pair', token }));
      };
      current.onmessage = async event => {
        if (socket !== current || failure) return;
        let m; try { m = JSON.parse(event.data); } catch { fail('The secure address returned an unexpected response. Check that you used the current PC bridge address.'); return; }
        if (m.type === 'world-call') {                                    // a command from the user's Claude connector
          Promise.resolve().then(() => worldTool(String(m.name), m.input || {}))
            .then(result => send({ type: 'world-result', reqId: m.reqId, ok: true, result: String(result) }))
            .catch(e => send({ type: 'world-result', reqId: m.reqId, ok: false, error: String(e?.message || e) }));
          return;
        }
        if (m.type === 'ready') { clearTimers(); ready = true; report(m.browserReady === false ? 'Headset connected. Connect the Sunnyvale extension in Google Chrome on your PC next.' : (https ? 'Connected through secure HTTPS. Claude and the heart use your PC browser.' : 'Connected. Claude and the heart use your PC browser.')); }
        if (m.type === 'browser-status') { if (!m.connected) media.stopAll(); report(m.connected ? 'Connected to your Google Chrome. Claude and the heart open inside the world.' : 'Chrome disconnected. Reconnect the Sunnyvale extension on the PC.'); }
        if (m.type === 'sharing-stopped') media.stop(m.id);
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
          if (pendingMic && /claude\.ai/.test(m.url || '')) { pendingMic = false; setTimeout(() => media.toggleMic(m.id), 4000); }
        }
        if (m.type === 'location' && tabs.has(m.id)) tabs.get(m.id).url = m.url;
        if (m.type === 'viewport' && tabs.has(m.id)) { tabs.get(m.id).width = m.width; tabs.get(m.id).height = m.height; }
        if (m.type === 'audio') media.play(m.id, m.data, m.rate);
        if (m.type === 'audio-status' && tabs.has(m.id)) { const tab = tabs.get(m.id); tab.audioEnabled = m.enabled; tab.soundButton.userData.label(m.enabled ? 'Sound ON' : 'Sound'); if (!m.enabled) media.stopAudio(m.id); }
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
                t.texture.minFilter = THREE.LinearMipmapLinearFilter; t.texture.generateMipmaps = true; t.texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
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
        clearTimers();
        if (socket !== current) return;
        if (!https && !ready && !failure && event.code !== 1008) { fallback(); return; }
        ready = false;
        media.stopAll();
        report(failure || (event.code === 1008
          ? 'The PC rejected pairing. Check the full pairing code and disconnect any other Sunnyvale page. Keep the Chrome extension connected.'
          : 'Bridge disconnected. Start it on the PC and reconnect.'));
        status('Browser bridge disconnected');
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
  };
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
    open(url) { if (!ready) return false; send({ type: 'open', url }); return true; },
    urlOf(id) { return tabs.get(id)?.url || ''; },
    isReady() { return ready; },
    // Open a page (e.g. docs.new) and type text into it once it has loaded (used to export the thesis)
    openAndType(url, text) {
      if (!ready) return false;
      pendingType = { text: String(text) };
      send({ type: 'open', url });
      return true;
    },
    // Start sharing the headset microphone with the Claude tab (opens Claude first if needed)
    claudeMic() {
      const entry = [...tabs].find(([, t]) => /claude\.ai/.test(t.url || ''));
      if (!entry) { if (ready) { pendingMic = true; send({ type: 'open', url: 'https://claude.ai/new' }); } return; }
      if (media.microphone?.id !== entry[0]) media.toggleMic(entry[0]);
    },
    hit(raycaster, scroll = 0) {
      const hit = raycaster.intersectObjects([...tabs.values()].map(t => t.content).filter(shown), false)[0];
      if (!hit) return false;
      const panel = hit.object.parent, id = panel.userData.browserId;
      if (panel.userData.locked) return false;          // locked windows can be moved, but not clicked
      focused = id; addressMode = false;
      const tab = tabs.get(id);
      send({ type: scroll ? 'scroll' : 'click', id, x: Math.round(hit.uv.x * (tab.width - 1)), y: Math.round((1 - hit.uv.y) * (tab.height - 1)), delta: scroll });
      return true;
    },
    touch(point, state) {
      for (const [id, t] of tabs) {
        if (!shown(t.content) || t.panel.userData.locked) continue;
        const p = t.content.worldToLocal(point.clone());
        if (Math.abs(p.z) < .018 && Math.abs(p.x) < .36 && Math.abs(p.y) < .225) {
          if (state.bridgeTouch !== id) { state.bridgeTouch = id; focused = id; send({ type: 'click', id, x: (p.x / .72 + .5) * (t.width - 1), y: (.5 - p.y / .45) * (t.height - 1) }); }
          return;
        }
      }
      state.bridgeTouch = null;
    },
    closed(panel) {
      media.stop(panel.userData.browserId);
      if (panel === keyboard) keyboard = null;
      if (['browser', 'browser-keyboard'].includes(panel.userData.kind)) for (const child of panel.children) {
        if (child === panel.userData.closeButton) continue;
        child.geometry?.dispose(); child.material?.map?.dispose(); child.material?.dispose();
      }
      const id = panel.userData.browserId, t = tabs.get(id);
      if (!t) return;
      send({ type: 'close', id }); tabs.delete(id); updateReadingQuality();
    },
    get connected() { return ready; },
  };
}
