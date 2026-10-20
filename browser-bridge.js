// Private connection details stay in this browser, never in the repository.
export function installBrowserBridge({ THREE, scene, camera, renderer, panels, closeButtons, touchables,
  makeWindow, position, faceViewer, closeWindow, shown, styleWindow, status }) {
  let socket, ready = false, focused, keyboard, addressMode = false, address = '', uppercase = false;
  const tabs = new Map();
  const send = m => { if (ready && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m)); };
  const fields = document.getElementById('bridgeSettings');
  fields.innerHTML = `<summary><b>PC browser bridge</b></summary>
    <label>Secure bridge address<input id="bridgeURL" placeholder="wss://your-tunnel/bridge"></label>
    <label>Private pairing code<input id="bridgeToken" type="password" autocomplete="off"></label>
    <button id="bridgeConnect">Connect</button> <button id="bridgeDisconnect">Disconnect</button>
    <div id="bridgeStatus">Not connected. Your PC must stay on.</div>`;
  for (const name of ['bridgeURL', 'bridgeToken']) document.getElementById(name).value = localStorage.getItem(name) || '';
  const report = text => { document.getElementById('bridgeStatus').textContent = text; };
  function button(parent, label, x, y, w, action) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#20170e'; ctx.fillRect(0, 0, 256, 80);
    ctx.strokeStyle = '#ffd27a'; ctx.strokeRect(2, 2, 252, 76);
    ctx.fillStyle = '#ffd27a'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, 128, 50);
    const texture = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, .055), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, .008); parent.add(mesh);
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
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, 1280, 800);
    ctx.fillStyle = '#fff'; ctx.font = '32px sans-serif'; ctx.fillText('Loading browser…', 30, 70);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
    const content = new THREE.Mesh(new THREE.PlaneGeometry(.72, .45), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    content.position.set(0, -.025, .006); panel.add(content);
    const tab = { panel, content, canvas, ctx, texture, url: m.url, decoding: false }; tabs.set(m.id, tab);
    button(panel, 'Back', -.32, .235, .09, () => send({ type: 'back', id: m.id }));
    button(panel, 'Next', -.22, .235, .09, () => send({ type: 'forward', id: m.id }));
    button(panel, 'Reload', -.12, .235, .09, () => send({ type: 'reload', id: m.id }));
    button(panel, 'URL', -.02, .235, .09, () => { focused = m.id; addressMode = true; address = ''; showKeyboard(m.id); keyboard.visible = true; status('Type a website address, then Enter'); });
    button(panel, 'Keys', .08, .235, .09, () => { addressMode = false; showKeyboard(m.id); });
    button(panel, 'New', .18, .235, .09, () => send({ type: 'open', url: 'https://example.com' }));
    button(panel, 'Up', -.17, -.29, .16, () => send({ type: 'scroll', id: m.id, x: 640, y: 400, delta: -550 }));
    button(panel, 'Down', .02, -.29, .16, () => send({ type: 'scroll', id: m.id, x: 640, y: 400, delta: 550 }));
    focused = m.id;
  }
  function disconnect() {
    ready = false; const old = socket; socket = null; old?.close();
    for (const t of [...tabs.values()]) closeWindow(t.panel);
    tabs.clear(); report('Disconnected. Reconnect before using the browser buttons.');
  }
  document.getElementById('bridgeDisconnect').onclick = disconnect;
  document.getElementById('bridgeConnect').onclick = () => {
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
    report('Connecting to the secure PC address…'); const current = new WebSocket(url.href); socket = current;
    let failure = '', pairingTimer;
    const clearTimers = () => { clearTimeout(connectionTimer); clearTimeout(pairingTimer); };
    const fail = message => {
      if (socket !== current || ready) return;
      failure = message; clearTimers(); report(message);
      try { current.close(); } catch { /* connection already closed */ }
    };
    const connectionTimer = setTimeout(() => fail('The Quest could not reach the secure PC address within 15 seconds. Check your internet connection and the current bridge address, then try Connect again.'), 15000);
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
      if (m.type === 'ready') { clearTimers(); ready = true; report(m.browserReady === false ? 'Headset connected. Connect the Sunnyvale extension in Google Chrome on your PC next.' : 'Connected. Claude and the heart use your PC browser.'); }
      if (m.type === 'browser-status') report(m.connected ? 'Connected to your Google Chrome. Claude and the heart open inside the world.' : 'Chrome disconnected. Reconnect the Sunnyvale extension on the PC.');
      if (m.type === 'tab') newPanel(m);
      if (m.type === 'location' && tabs.has(m.id)) tabs.get(m.id).url = m.url;
      if (m.type === 'error') { report(m.message); status(m.message); }
      if (m.type === 'frame') {
        const t = tabs.get(m.id);
        if (!t || t.decoding) { send({ type: 'ack', id: m.id }); return; }
        t.decoding = true;
        const img = new Image();
        img.onload = () => { if (tabs.has(m.id)) { t.ctx.drawImage(img, 0, 0, 1280, 800); t.texture.needsUpdate = true; } t.decoding = false; send({ type: 'ack', id: m.id }); };
        img.onerror = () => { t.decoding = false; send({ type: 'ack', id: m.id }); };
        img.src = 'data:image/jpeg;base64,' + m.data;
      }
    };
    current.onclose = event => {
      clearTimers();
      if (socket !== current) return;
      ready = false;
      report(failure || (event.code === 1008
        ? 'The PC rejected pairing. Check the full pairing code and disconnect any other Sunnyvale page. Keep the Chrome extension connected.'
        : 'Bridge disconnected. Start it on the PC and reconnect.'));
      status('Browser bridge disconnected');
    };
    current.onerror = () => {
      if (socket !== current) return;
      clearTimers();
      failure = failure || (ready ? 'Lost the secure PC bridge connection. Try Connect again.' : 'Could not reach the secure PC bridge. Check the current address and whether the Quest can open its connection-check page.');
      report(failure);
    };
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
  }
  return {
    open(url) { if (!ready) return false; send({ type: 'open', url }); return true; },
    hit(raycaster, scroll = 0) {
      const hit = raycaster.intersectObjects([...tabs.values()].map(t => t.content).filter(shown), false)[0];
      if (!hit) return false;
      const panel = hit.object.parent, id = panel.userData.browserId;
      focused = id; addressMode = false;
      send({ type: scroll ? 'scroll' : 'click', id, x: Math.round(hit.uv.x * 1279), y: Math.round((1 - hit.uv.y) * 799), delta: scroll });
      return true;
    },
    touch(point, state) {
      for (const [id, t] of tabs) {
        if (!shown(t.content)) continue;
        const p = t.content.worldToLocal(point.clone());
        if (Math.abs(p.z) < .018 && Math.abs(p.x) < .36 && Math.abs(p.y) < .225) {
          if (state.bridgeTouch !== id) { state.bridgeTouch = id; focused = id; send({ type: 'click', id, x: (p.x / .72 + .5) * 1279, y: (.5 - p.y / .45) * 799 }); }
          return;
        }
      }
      state.bridgeTouch = null;
    },
    closed(panel) {
      if (panel === keyboard) keyboard = null;
      if (['browser', 'browser-keyboard'].includes(panel.userData.kind)) for (const child of panel.children) {
        if (child === panel.userData.closeButton) continue;
        child.geometry?.dispose(); child.material?.map?.dispose(); child.material?.dispose();
      }
      const id = panel.userData.browserId, t = tabs.get(id);
      if (!t) return;
      send({ type: 'close', id }); tabs.delete(id);
    },
    get connected() { return ready; },
  };
}
