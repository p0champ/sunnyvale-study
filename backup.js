// Safety net: backs up your study work to Google Drive on your PC, through the PC bridge.
// Every 5 minutes while connected (only when something changed), right after connecting, and when you log off,
// the page sends everything Sunnyvale keeps in this browser (thesis, quotes, sources, deadlines, highlights, pins,
// shot logs, checklists, layouts, settings) plus each library file and frame grab once. The PC keeps dated copies.
// "Restore from backup" on the page brings it all back, for example on a new headset or after clearing the browser.
// The bridge pairing code and address (bridgeURL / bridgeToken) are not part of it.

const STUDY_PREFIX = 'sunnyvale.';
const EVERY = 5 * 60 * 1000;

export function installBackup({ bridge, jarvisSay }) {
  let busy = false, lastSent = '', lastResult = readLast();
  const box = document.createElement('details'); box.id = 'backupSettings';
  box.innerHTML = `<summary><b>Backup</b></summary>
    <div id="backupStatus"></div>
    <button id="backupNow">Back up now</button> <button id="backupRestore">Restore from backup…</button>
    <small>Your study work is copied to the PC every few minutes while the PC bridge is connected (to Google Drive when it's installed on the PC).</small>`;
  document.getElementById('hint')?.appendChild(box);
  const el = id => document.getElementById(id);
  const show = text => { const s = el('backupStatus'); if (s) s.textContent = text; };
  show(lastResult ? `Last backup: ${new Date(lastResult.at).toLocaleString()} (${lastResult.where}).` : 'No backup yet. Connect the PC bridge and it starts by itself.');

  function readLast() { try { return JSON.parse(localStorage.getItem('sunnyvale.backup-last')) || null; } catch { return null; } }
  function study() {
    const keys = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(STUDY_PREFIX) && k !== 'sunnyvale.backup-last') keys[k] = localStorage.getItem(k);
    }
    return keys;
  }
  // The library and frame grabs live in this browser's database
  const db = () => new Promise((resolve, reject) => { const r = indexedDB.open('sunnyvale-library', 1); r.onupgradeneeded = () => { r.result.createObjectStore('files', { keyPath: 'id' }); r.result.createObjectStore('frames', { keyPath: 'id' }); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const dbDo = async (store, mode, fn) => { const d = await db(); return new Promise((resolve, reject) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => resolve(q?.result); t.onerror = () => reject(t.error); }); };

  // Send one item in pieces (each message must stay small)
  async function upload(kind, id, text, meta) {
    const b = bridge();
    const { transfer } = await b.call('backup-begin', { kind, id, meta, size: meta?.size });
    for (let n = 0, i = 0; i < text.length || n === 0; n++, i += 45000) await b.call('backup-part', { transfer, n, data: text.slice(i, i + 45000) });
    return b.call('backup-end', { transfer });
  }
  async function blobPieces(blob, transferInfo) {
    const b = bridge(), bytes = 33750;           // 33750 bytes = 45000 characters of base64
    const { transfer } = await b.call('backup-begin', transferInfo);
    for (let n = 0, at = 0; at < blob.size || n === 0; n++, at += bytes) {
      const buf = new Uint8Array(await blob.slice(at, at + bytes).arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      await b.call('backup-part', { transfer, n, data: btoa(bin) });
    }
    return b.call('backup-end', { transfer });
  }

  async function backupNow(reason = 'auto') {
    const b = bridge();
    if (busy || !b?.isReady?.()) { if (reason === 'button') show('Connect the PC bridge first (PC browser bridge, above).'); return false; }
    busy = true;
    try {
      const info = await b.call('backup-info');
      const keys = study(), text = JSON.stringify({ app: 'Sunnyvale Study', version: 1, savedAt: Date.now(), keys });
      let did = false;
      if (text !== lastSent || reason !== 'auto') { await upload('study', 'study', text); lastSent = text; did = true; }
      // Library files and frame grabs: each one only once
      const have = new Set(info.library), haveFrames = new Set(info.frames);
      let lib = []; try { lib = JSON.parse(keys['sunnyvale.library'] || '[]'); } catch { /* no library yet */ }
      for (const f of lib) {
        if (have.has(f.id) || f.size > info.maxFile) continue;
        const rec = await dbDo('files', 'readonly', s => s.get(f.id)).catch(() => null);
        if (!rec?.blob) continue;
        show(`Backing up ${f.name}…`);
        await blobPieces(rec.blob, { kind: 'library', id: f.id, size: rec.blob.size, meta: { ...f, mime: rec.blob.type || '' } });
        did = true;
      }
      const frameIds = await dbDo('frames', 'readonly', s => s.getAllKeys()).catch(() => []);
      for (const id of frameIds || []) {
        if (haveFrames.has(id)) continue;
        const rec = await dbDo('frames', 'readonly', s => s.get(id)).catch(() => null);
        if (rec) { await upload('frame', id, JSON.stringify(rec)); did = true; }
      }
      if (did || !lastResult) {
        lastResult = { at: Date.now(), where: info.where };
        try { localStorage.setItem('sunnyvale.backup-last', JSON.stringify(lastResult)); } catch { /* storage full */ }
      }
      show(`Last backup: ${new Date(lastResult.at).toLocaleString()} (${lastResult.where}).`);
      if (reason === 'button' || reason === 'logoff') jarvisSay('', ['J.A.R.V.I.S.', 'BACKED UP', info.where.startsWith('Google') ? 'SAVED TO GOOGLE DRIVE' : 'SAVED ON YOUR PC']);
      return true;
    } catch (e) {
      show('Backup did not finish: ' + e.message + ' It will try again in a few minutes.');
      return false;
    } finally { busy = false; }
  }

  // Fetch a backed-up item piece by piece (library files come back as binary pieces, the rest as text)
  async function download(kind, id) {
    const b = bridge(), parts = []; let out = '', meta, n = 0, total = 1;
    do {
      const r = await b.call('restore-part', { kind, id, n });
      if (kind === 'library') { const bin = atob(r.data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); parts.push(bytes); }
      else out += r.data;
      total = r.total; meta = r.meta ?? meta; n++; show(`Restoring… ${Math.round(n / total * 100)}%`);
    } while (n < total);
    return { out, parts, meta };
  }
  async function restore() {
    const b = bridge();
    if (!b?.isReady?.()) { show('Connect the PC bridge first (PC browser bridge, above), then press Restore again.'); return; }
    const info = await b.call('backup-info').catch(() => null);
    if (!info?.latest) { show('There is no backup on the PC yet.'); return; }
    if (!confirm(`Restore the backup from ${new Date(info.latest).toLocaleString()}?\n\nThis replaces the thesis, quotes, sources, deadlines and layouts in this browser with the backed-up ones. Library files that are missing here are copied back too.`)) return;
    try {
      const { out } = await download('study', 'study');
      const data = JSON.parse(out);
      if (data.app !== 'Sunnyvale Study' || typeof data.keys !== 'object') throw Error('That backup file is not a Sunnyvale backup.');
      for (const [k, v] of Object.entries(data.keys)) if (k.startsWith(STUDY_PREFIX)) localStorage.setItem(k, v);
      let lib = []; try { lib = JSON.parse(data.keys['sunnyvale.library'] || '[]'); } catch { /* none */ }
      for (const f of lib) {
        if (!info.library.includes(f.id) || await dbDo('files', 'readonly', s => s.get(f.id)).catch(() => null)) continue;
        const { parts, meta } = await download('library', f.id);
        await dbDo('files', 'readwrite', s => s.put({ id: f.id, blob: new Blob(parts, { type: meta?.mime || '' }) }));
      }
      for (const id of info.frames) {
        if (await dbDo('frames', 'readonly', s => s.get(id)).catch(() => null)) continue;
        const { out: rec } = await download('frame', id);
        await dbDo('frames', 'readwrite', s => s.put(JSON.parse(rec)));
      }
      show('Restored. Reloading…');
      setTimeout(() => location.reload(), 800);
    } catch (e) { show('Restore did not finish: ' + e.message); }
  }

  el('backupNow').onclick = () => backupNow('button');
  el('backupRestore').onclick = () => restore();
  setInterval(() => backupNow('auto'), EVERY);
  return { backupNow, restore, onConnected: () => setTimeout(() => backupNow('auto'), 10000) };
}
