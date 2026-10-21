import { formatReference, speechLanguage } from './study-utils.js?v=round2-voice-3';
import { environmentCamera, rawCamera, rawCameraImage } from './scanner-camera.js?v=round2-camera-4';
// Thesis and Jarvis tools for Sunnyvale Study: a file library, PDF reader with highlights, quote collector,
// citation builder, video player with timestamp pins, frame grabs, side-by-side comparison, a live thesis
// document, deadlines, a status strip (word count + next deadline), session summaries, morning briefings,
// Claude's avatar (the Claude spark: it points at things and shows when it listens, works and speaks), exam rehearsal,
// comments beside thesis paragraphs, a shot log, a propaganda checklist, arranging the room, storyboards, presentations, counter-arguments, page scanning and a wake word.
//
// Everything you make is stored in this browser only (localStorage + IndexedDB), never on GitHub.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';

export function installThesisTools(ctx) {
  const { THREE, scene, camera, renderer, panels, touchables, surfaces, makeHoloObject, placeInFront, faceViewer, holoLabel,
    canvasTexture, blip, jarvisSay, closeWindow, restorers, markDirty, getMode, bridge, viewerPosition, openWindow,
    setWindowContent, findWindow, readJSON, writeJSON, timerInfo, draw, stashWindow } = ctx;
  const v3 = () => new THREE.Vector3();
  const now = () => new Date();
  const today = () => now().toISOString().slice(0, 10);
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const clampText = (t, n) => String(t ?? '').slice(0, n);
  const fmtTime = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };

  // ---------------------------------------------------------------- storage
  const DB = (() => {
    let dbp;
    const open = () => dbp ??= new Promise((resolve, reject) => {
      const r = indexedDB.open('sunnyvale-library', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('files', { keyPath: 'id' }); r.result.createObjectStore('frames', { keyPath: 'id' }); };
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const run = async (store, mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode), req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result); t.onerror = () => reject(t.error);
      });
    };
    return {
      put: (s, v) => run(s, 'readwrite', st => st.put(v)), get: (s, id) => run(s, 'readonly', st => st.get(id)),
      del: (s, id) => run(s, 'readwrite', st => st.delete(id))
    };
  })();
  const store = {
    library: () => readJSON('sunnyvale.library', []), setLibrary: v => writeJSON('sunnyvale.library', v),
    quotes: () => readJSON('sunnyvale.quotes', []), setQuotes: v => writeJSON('sunnyvale.quotes', v),
    sources: () => readJSON('sunnyvale.sources', []), setSources: v => writeJSON('sunnyvale.sources', v),
    highlights: () => readJSON('sunnyvale.highlights', {}), setHighlights: v => writeJSON('sunnyvale.highlights', v),
    pins: () => readJSON('sunnyvale.pins', {}), setPins: v => writeJSON('sunnyvale.pins', v),
    deadlines: () => readJSON('sunnyvale.deadlines', []), setDeadlines: v => writeJSON('sunnyvale.deadlines', v),
    sessions: () => readJSON('sunnyvale.sessions', []), setSessions: v => writeJSON('sunnyvale.sessions', v),
    counters: () => readJSON('sunnyvale.counter-args', []), setCounters: v => writeJSON('sunnyvale.counter-args', v),
    settings: () => readJSON('sunnyvale.thesis-settings', { style: 'Harvard', strip: true, briefedOn: '' }),
    setSettings: v => writeJSON('sunnyvale.thesis-settings', v)
  };
  const settings = store.settings();
  const saveSettings = () => store.setSettings(settings);

  // ---------------------------------------------------------------- small helpers for buttons on objects
  function addButton(parent, text, x, y, w, action, opts = {}) {
    const label = holoLabel(text, { w, h: opts.h || 0.045, fill: opts.fill || 'rgba(40,20,10,0.75)', color: opts.color || '#ffd27a' });
    label.position.set(x, y, 0.006);
    parent.add(label);
    const owner = opts.owner || parent;
    touchables.push({ mesh: label, w, h: opts.h || 0.045, owner, action: () => { blip(1150, 0.05); action(); } });
    return label;
  }
  function relabel(label, text, opts = {}) {
    const fresh = holoLabel(text, { w: label.geometry.parameters.width, h: label.geometry.parameters.height, ...opts });
    label.material.map?.dispose(); label.material.map = fresh.material.map; label.material.needsUpdate = true;
    fresh.geometry.dispose();
  }
  function canvasPanel(w, h, pxW, pxH) {
    const canvas = document.createElement('canvas'); canvas.width = pxW; canvas.height = pxH;
    const g = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    return { mesh, canvas, g, tex };
  }
  function wrap(g, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (g.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  function frameBox(g, W, H, stark) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = stark ? 'rgba(60,6,6,0.6)' : 'rgba(250,244,230,0.97)';
    g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 18); g.fill();
    g.strokeStyle = stark ? '#f2c94c' : '#8a5a2a'; g.lineWidth = 5; g.stroke();
  }
  const ink = () => getMode() === 'stark' ? '#ffe9c4' : '#20160c';
  const accent = () => getMode() === 'stark' ? '#ffb347' : '#8a3a1a';

  // Things that should face you and sit at a comfortable spot when they appear
  function show(obj, distance = 0.9, height = -0.1) { placeInFront(obj, distance, height); markDirty(); return obj; }
  function reveal(obj) { ctx.revealWindow?.(obj); obj.visible = true; return show(obj); }

  // ================================================================ LIBRARY (your files)
  function fileType(name, mime) {
    if (/pdf$/i.test(name) || mime === 'application/pdf') return 'pdf';
    if (/^video\//.test(mime) || /\.(mp4|webm|mov|m4v|mkv)$/i.test(name)) return 'video';
    if (/\.(glb|gltf)$/i.test(name)) return 'model';
    if (/^image\//.test(mime) || /\.(png|jpe?g|webp|gif)$/i.test(name)) return 'image';
    return 'other';
  }
  async function addFiles(fileList) {
    const lib = store.library();
    for (const f of fileList) {
      const id = uid('f');
      await DB.put('files', { id, blob: f });
      lib.push({ id, name: f.name, type: fileType(f.name, f.type), size: f.size, added: Date.now() });
    }
    store.setLibrary(lib);
    renderLibraryPage();
    refreshLibraryPicker();
  }
  async function removeFile(id) {
    await DB.del('files', id).catch(() => {});
    store.setLibrary(store.library().filter(f => f.id !== id));
    renderLibraryPage(); refreshLibraryPicker();
  }
  function findFile(nameOrId) {
    const lib = store.library(), key = String(nameOrId || '').toLowerCase();
    return lib.find(f => f.id === nameOrId) || lib.find(f => f.name.toLowerCase() === key) || lib.find(f => f.name.toLowerCase().includes(key));
  }
  async function fileBlob(id) { const rec = await DB.get('files', id); if (!rec) throw Error('That file is no longer in the library.'); return rec.blob; }

  // The library picker in VR: tap a file to open it
  let libraryPicker = null, pickerFilter = null, pickerAction = null;
  function openLibraryPicker(filter = null, action = null, title = 'Library') {
    if (libraryPicker) { closeWindow(libraryPicker); libraryPicker = null; }
    pickerFilter = filter; pickerAction = action;
    libraryPicker = makeHoloObject(new THREE.Group(), 0.66, 0.6, title, 'library-picker');
    libraryPicker.userData.noSave = true;
    libraryPicker.userData.onClose = () => { libraryPicker = null; };
    refreshLibraryPicker();
    show(libraryPicker, 0.65, -0.1);
  }
  function refreshLibraryPicker() {
    if (!libraryPicker) return;
    const content = libraryPicker.children[0];
    for (const c of [...content.children]) { content.remove(c); c.material?.map?.dispose(); }
    for (let i = touchables.length - 1; i >= 0; i--) if (touchables[i].owner === libraryPicker) touchables.splice(i, 1);
    const files = store.library().filter(f => !pickerFilter || pickerFilter.includes(f.type)).slice(-14).reverse();
    const head = holoLabel(files.length ? 'YOUR LIBRARY' : 'LIBRARY IS EMPTY: ADD FILES ON THE PAGE', { w: 0.5, h: 0.055, fill: 'rgba(110,10,10,0.75)' });
    head.position.set(0, 0.26, 0); content.add(head);
    const icon = { pdf: 'PDF', video: 'VIDEO', model: '3D', image: 'IMAGE', other: 'FILE' };
    files.forEach((f, i) => addButton(content, `${icon[f.type]}  ${f.name}`.slice(0, 44), i % 2 ? 0.16 : -0.16, 0.18 - Math.floor(i / 2) * 0.058, 0.3,
      () => { const a = pickerAction; closeWindow(libraryPicker); libraryPicker = null; (a || openFile)(f); }, { owner: libraryPicker, h: 0.048 }));
  }
  function openFile(f, extra = {}) {
    if (f.type === 'pdf') return openPdf({ fileId: f.id, ...extra });
    if (f.type === 'video') return createVideoPlayer({ fileId: f.id, title: f.name, ...extra });
    if (f.type === 'model') return openModel({ fileId: f.id, title: f.name, ...extra });
    if (f.type === 'image') return openImage({ fileId: f.id, title: f.name, ...extra });
    jarvisSay('', ['J.A.R.V.I.S.', "I CAN'T OPEN THAT FILE TYPE YET"]);
    return null;
  }

  // ================================================================ PDF READER + HIGHLIGHTS
  let pdfjs = null;
  async function pdfLib() {
    if (!pdfjs) { pdfjs = await import(PDFJS); pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }
    return pdfjs;
  }
  const readers = new Map();         // window id -> reader state
  function openPdf({ fileId, url, page = 1 }) {
    const meta = fileId ? store.library().find(f => f.id === fileId) : { name: url };
    const W = 0.62, H = 0.82;
    const group = new THREE.Group();
    const view = canvasPanel(W, H, 1240, 1640);
    view.mesh.position.y = 0.03; group.add(view.mesh);
    const obj = makeHoloObject(group, W + 0.02, H + 0.14, meta?.name || 'Document', 'pdf');
    const r = { obj, fileId, url, doc: null, page, pages: 0, view, highlightMode: false, sel: null, texts: [], pageText: '', sourceId: null, bitmap: null };
    readers.set(obj, r);
    obj.userData.save = () => ({ type: 'pdf', fileId, url, page: r.page });
    obj.userData.onClose = () => { readers.delete(obj); r.doc?.destroy?.(); };
    obj.userData.pageLabel = addButton(group, 'LOADING…', 0, -H / 2 - 0.025, 0.16, () => {}, { owner: obj });
    addButton(group, '◀ PREV', -0.21, -H / 2 - 0.025, 0.13, () => goToPage(r, r.page - 1), { owner: obj });
    addButton(group, 'NEXT ▶', 0.21, -H / 2 - 0.025, 0.13, () => goToPage(r, r.page + 1), { owner: obj });
    r.hlButton = addButton(group, 'HIGHLIGHT: OFF', -0.17, H / 2 + 0.06, 0.2, () => {
      r.highlightMode = !r.highlightMode; relabel(r.hlButton, r.highlightMode ? 'HIGHLIGHT: ON' : 'HIGHLIGHT: OFF');
      if (r.highlightMode) jarvisSay('', ['J.A.R.V.I.S.', 'HIGHLIGHT MODE', 'PINCH AND DRAG ACROSS A PASSAGE']);
    }, { owner: obj });
    addButton(group, 'QUOTES', 0.12, H / 2 + 0.06, 0.12, () => openQuotesWindow(), { owner: obj });
    // Pinch and drag across the page to highlight a passage
    surfaces.push({
      mesh: view.mesh,
      down: uv => { if (!r.highlightMode) return false; r.sel = { a: uv, b: uv }; drawPage(r); return true; },
      move: uv => { if (r.sel) { r.sel.b = uv; drawPage(r); } },
      up: uv => { if (!r.sel) return; r.sel.b = uv || r.sel.b; highlightRect(r, r.sel); r.sel = null; drawPage(r); }
    });
    r.ready = loadPdf(r).then(() => r, e => { r.loadError = Error('Could not open this PDF: ' + e.message); relabel(obj.userData.pageLabel, 'COULD NOT OPEN'); return null; });
    return show(obj, 0.75, -0.05);
  }
  async function loadPdf(r) {
    const lib = await pdfLib();
    const data = r.fileId ? new Uint8Array(await (await fileBlob(r.fileId)).arrayBuffer()) : undefined;
    r.doc = await lib.getDocument(data ? { data } : { url: r.url }).promise;
    r.pages = r.doc.numPages;
    // Make a citation source from the document's own details (title, author, year), once
    const meta = await r.doc.getMetadata().catch(() => null);
    const name = r.fileId ? store.library().find(f => f.id === r.fileId)?.name : r.url;
    let src = store.sources().find(s => s.fileId && s.fileId === r.fileId);
    if (!src) {
      const info = meta?.info || {};
      const year = String(info.CreationDate || '').match(/(19|20)\d\d/)?.[0] || '';
      src = addSource({ kind: 'book', title: info.Title || String(name || 'Untitled').replace(/\.pdf$/i, ''), authors: info.Author ? [info.Author] : [], year, fileId: r.fileId, url: r.url, toRead: true }, true);
    }
    r.sourceId = src.id;
    await goToPage(r, r.page);
  }
  async function goToPage(r, n) {
    if (!r.doc) return;
    r.page = Math.max(1, Math.min(r.pages, n));
    const page = await r.doc.getPage(r.page);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = 1240 / vp0.width, vp = page.getViewport({ scale });
    const bmp = document.createElement('canvas'); bmp.width = Math.round(vp.width); bmp.height = Math.round(vp.height);
    await page.render({ canvasContext: bmp.getContext('2d'), viewport: vp }).promise;
    r.bitmap = bmp;
    const tc = await page.getTextContent();
    // Where each piece of text sits on the rendered page (PDF coordinates -> page pixels)
    const [ta, tb, tcc, td, te, tf] = vp.transform;
    const toPx = (x, y) => [ta * x + tcc * y + te, tb * x + td * y + tf];
    r.texts = tc.items.filter(i => i.str).map(i => {
      const h = i.height || Math.hypot(i.transform[2], i.transform[3]);
      const [x0, y0] = toPx(i.transform[4], i.transform[5]), [x1, y1] = toPx(i.transform[4] + i.width, i.transform[5] + h);
      return { str: i.str, rect: [Math.min(x0, x1) / bmp.width, Math.min(y0, y1) / bmp.height, Math.max(x0, x1) / bmp.width, Math.max(y0, y1) / bmp.height] };
    });
    r.pageText = r.texts.map(t => t.str).join(' ').replace(/\s+/g, ' ');
    r.obj.userData.body = `Page ${r.page} of ${r.pages}: ${r.pageText.slice(0, 1500)}`;
    relabel(r.obj.userData.pageLabel, `${r.page} / ${r.pages}`);
    drawPage(r); markDirty();
  }
  function drawPage(r) {
    const { canvas, g, tex } = r.view;
    g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    if (r.bitmap) g.drawImage(r.bitmap, 0, 0, canvas.width, canvas.width * r.bitmap.height / r.bitmap.width);
    const sy = canvas.width * (r.bitmap ? r.bitmap.height / r.bitmap.width : 1.32) / canvas.height;
    const hl = (store.highlights()[r.fileId || r.url] || []).filter(h => h.page === r.page);
    g.fillStyle = 'rgba(255, 214, 0, 0.38)';
    for (const h of hl) for (const [a, b, c, d] of h.rects) g.fillRect(a * canvas.width, b * canvas.height * sy, (c - a) * canvas.width, (d - b) * canvas.height * sy);
    if (r.sel) {
      const [x0, x1] = [r.sel.a.x, r.sel.b.x].sort((p, q) => p - q), [y0, y1] = [1 - r.sel.a.y, 1 - r.sel.b.y].sort((p, q) => p - q);
      g.strokeStyle = 'rgba(255,120,0,0.9)'; g.lineWidth = 4; g.strokeRect(x0 * canvas.width, y0 * canvas.height, (x1 - x0) * canvas.width, (y1 - y0) * canvas.height);
    }
    tex.needsUpdate = true;
  }
  // Highlight every text line inside a selection box (in page coordinates 0..1)
  function highlightRect(r, sel) {
    const sy = r.bitmap ? (r.view.canvas.width * r.bitmap.height / r.bitmap.width) / r.view.canvas.height : 1;
    const [x0, x1] = [sel.a.x, sel.b.x].sort((p, q) => p - q);
    const [y0, y1] = [(1 - sel.a.y) / sy, (1 - sel.b.y) / sy].sort((p, q) => p - q);
    const items = r.texts.filter(t => t.rect[2] > x0 && t.rect[0] < x1 && t.rect[3] > y0 && t.rect[1] < y1);
    if (!items.length) { jarvisSay('', ['J.A.R.V.I.S.', 'NO TEXT THERE', 'DRAG ACROSS THE WORDS']); return null; }
    return saveHighlight(r, items);
  }
  function saveHighlight(r, items, note = '') {
    const text = items.map(t => t.str).join(' ').replace(/\s+/g, ' ').trim();
    const all = store.highlights(), key = r.fileId || r.url;
    const quote = addQuote({ text, sourceId: r.sourceId, page: r.page, note }, true);
    (all[key] ??= []).push({ page: r.page, rects: items.map(t => t.rect), text, quoteId: quote.id });
    store.setHighlights(all);
    session.highlights++;
    drawPage(r);
    blip(990, 0.1);
    jarvisSay('', ['J.A.R.V.I.S.', 'PASSAGE SAVED', `PAGE ${r.page} · ${text.split(' ').length} WORDS`]);
    return quote;
  }
  // Find a passage on a page by its words (used by Claude) and highlight it
  function highlightText(r, page, passage, note) {
    const want = String(passage).toLowerCase().replace(/\s+/g, ' ').trim();
    let joined = '', map = [];
    r.texts.forEach((t, i) => { const s = (joined ? ' ' : '') + t.str.toLowerCase(); for (let k = 0; k < s.length; k++) map.push(i); joined += s; });
    joined = joined.replace(/\s+/g, m => m);                         // keep the index map aligned
    let at = joined.indexOf(want);
    if (at < 0) at = joined.replace(/\s+/g, ' ').indexOf(want.slice(0, 60));
    if (at < 0) return null;
    const first = map[at], last = map[Math.min(map.length - 1, at + want.length - 1)];
    return saveHighlight(r, r.texts.slice(first, last + 1), note);
  }
  async function readerFor(id) {
    const r = [...readers.values()].find(x => x.obj.userData.id === id) || [...readers.values()].find(x => x.obj.userData.title.toLowerCase().includes(String(id).toLowerCase()));
    if (!r) throw Error('No open document with that id. Open it first with open_document.');
    await r.ready;
    if (r.loadError) throw r.loadError;
    return r;
  }
  async function readPages(r, from, to) {
    const out = [];
    for (let p = Math.max(1, from); p <= Math.min(r.pages, to) && out.join('').length < 40000; p++) {
      const tc = await (await r.doc.getPage(p)).getTextContent();
      out.push(`--- Page ${p} ---\n` + tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' '));
    }
    return out.join('\n');
  }
  restorers.pdf = item => openPdf({ fileId: item.fileId, url: item.url, page: item.page || 1 });

  // ================================================================ QUOTES + SOURCES + CITATIONS
  function addQuote({ text, sourceId, page, note }, quiet) {
    const q = { id: uid('q'), text: clampText(text, 3000), sourceId: sourceId || null, page: page || null, note: clampText(note, 500), added: Date.now() };
    const all = store.quotes(); all.push(q); store.setQuotes(all);
    session.quotes++;
    refreshQuotesWindow();
    if (!quiet) blip(990, 0.1);
    return q;
  }
  function addSource(fields, quiet) {
    const s = { id: uid('s'), kind: fields.kind || 'book', authors: (fields.authors || []).map(String), title: clampText(fields.title, 300), year: clampText(fields.year, 12),
      publisher: fields.publisher || '', place: fields.place || '', journal: fields.journal || '', volume: fields.volume || '', issue: fields.issue || '',
      pages: fields.pages || '', url: fields.url || '', doi: fields.doi || '', director: fields.director || '', studio: fields.studio || '',
      edition: fields.edition || '', accessed: fields.accessed || today(), fileId: fields.fileId || null, toRead: fields.toRead !== false };
    const all = store.sources(); all.push(s); store.setSources(all);
    refreshSourcesWindow(); refreshBriefing();
    if (!quiet) blip(990, 0.1);
    return s;
  }
  function updateSource(id, fields) {
    const all = store.sources(), s = all.find(x => x.id === id);
    if (!s) throw Error('No source with that id.');
    Object.assign(s, Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== undefined && k !== 'id')));
    store.setSources(all); refreshSourcesWindow(); refreshQuotesWindow(); refreshBriefing();
    return s;
  }
  // Name helpers: authors are written "First Last" or "Last, First"
  const split = a => { a = String(a).trim(); if (a.includes(',')) { const [l, f] = a.split(',').map(x => x.trim()); return { last: l, first: f || '' }; } const parts = a.split(/\s+/); return { last: parts.pop() || a, first: parts.join(' ') }; };
  const initials = first => first.split(/[\s-]+/).filter(Boolean).map(n => n[0].toUpperCase() + '.').join(' ');
  function authorList(s, style) {
    const names = s.authors.length ? s.authors : (s.kind === 'film' && s.director ? [s.director] : []);
    if (!names.length) return '';
    const n = names.map(split);
    if (style === 'MLA') return n.length === 1 ? `${n[0].last}, ${n[0].first}` : n.length === 2 ? `${n[0].last}, ${n[0].first}, and ${n[1].first} ${n[1].last}` : `${n[0].last}, ${n[0].first}, et al.`;
    if (style === 'Chicago') return n.map((x, i) => i === 0 ? `${x.last}, ${x.first}` : `${x.first} ${x.last}`).join(n.length > 2 ? ', ' : ' and ');
    const fmt = n.map(x => `${x.last}, ${initials(x.first)}`.replace(/, $/, ''));
    if (style === 'APA') return fmt.length === 1 ? fmt[0] : fmt.slice(0, -1).join(', ') + ', & ' + fmt[fmt.length - 1];
    return fmt.length === 1 ? fmt[0] : fmt.slice(0, -1).join(', ') + ' and ' + fmt[fmt.length - 1];      // Harvard
  }
  function surname(s) { const n = s.authors[0] || (s.kind === 'film' ? s.title : s.director) || s.title; return s.authors[0] ? split(n).last : n; }
  function reference(s, style = settings.style) { return formatReference(s, style); }
  function inText(s, page, style = settings.style) {
    if (!s) return '';
    const n = surname(s), y = s.year || 'n.d.';
    if (style === 'APA') return `(${n}, ${y}${page ? ', p. ' + page : ''})`;
    if (style === 'MLA') return `(${n}${page ? ' ' + page : ''})`;
    if (style === 'Chicago') return `(${n} ${y}${page ? ', ' + page : ''})`;
    return `(${n} ${y}${page ? ', p. ' + page : ''})`;
  }
  const sourceById = id => store.sources().find(s => s.id === id);
  function quotesText() {
    const q = store.quotes();
    if (!q.length) return 'No quotes yet. Highlight a passage in a document, or ask Claude to save a quote.';
    return q.slice().reverse().map(x => `“${x.text}” ${inText(sourceById(x.sourceId), x.page)}${x.note ? '\n   Note: ' + x.note : ''}`).join('\n\n');
  }
  function bibliographyText() {
    const s = store.sources();
    if (!s.length) return 'No sources yet. Open a PDF, or ask Claude to add a book, article, film or website.';
    return s.map(x => reference(x)).sort((p, q) => p.localeCompare(q)).join('\n\n');
  }
  function openQuotesWindow() {
    let w = findWindow('quotes');
    if (!w) { w = openWindow('Quotes', quotesText()); w.userData.id = 'quotes'; }
    refreshQuotesWindow(); return reveal(w);
  }
  function refreshQuotesWindow() { const w = findWindow('quotes'); if (w) setWindowContent(w, `Quotes (${store.quotes().length})`, quotesText()); }
  function openSourcesWindow() {
    let w = findWindow('sources');
    if (!w) {
      w = openWindow('Bibliography', bibliographyText()); w.userData.id = 'sources';
      w.userData.styleButton = addButton(w, 'STYLE: ' + settings.style.toUpperCase() + '  ⟳', 0, -0.31, 0.26, () => {
        const styles = ['Harvard', 'APA', 'MLA', 'Chicago'];
        settings.style = styles[(styles.indexOf(settings.style) + 1) % styles.length]; saveSettings();
        refreshSourcesWindow(); refreshQuotesWindow();
      });
    }
    refreshSourcesWindow(); return reveal(w);
  }
  function refreshSourcesWindow() {
    const w = findWindow('sources'); if (!w) return;
    setWindowContent(w, `Bibliography (${settings.style})`, bibliographyText());
    if (w.userData.styleButton) relabel(w.userData.styleButton, 'STYLE: ' + settings.style.toUpperCase() + '  ⟳');
  }

  // ================================================================ VIDEO PLAYER + PINS + FRAME GRABS + COMPARE
  const players = new Map();
  function createVideoPlayer({ fileId, url, title = 'Video', time = 0, rate = 1, link = null }) {
    const W = 0.96, H = 0.54;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous'; video.playsInline = true; video.preload = 'auto';
    const group = new THREE.Group();
    const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.y = 0.06; group.add(screen);
    const bar = canvasPanel(W, 0.035, 1200, 44); bar.mesh.position.set(0, 0.06 - H / 2 - 0.03, 0.004); group.add(bar.mesh);
    const obj = makeHoloObject(group, W + 0.04, H + 0.3, title, 'video');
    const key = fileId || url;
    const p = { obj, video, key, title, rate, link, objectURL: null, fileId, url };
    players.set(obj, p);
    const y0 = 0.06 - H / 2 - 0.085;
    const btn = (t, x, w, fn) => addButton(group, t, x, y0, w, fn, { owner: obj });
    btn('⏪ 5s', -0.42, 0.1, () => seek(p, video.currentTime - 5));
    btn('◀ FRAME', -0.3, 0.12, () => { video.pause(); seek(p, video.currentTime - 1 / 24); });
    p.playBtn = btn('▶ PLAY', -0.165, 0.13, () => togglePlay(p));
    btn('FRAME ▶', -0.03, 0.12, () => { video.pause(); seek(p, video.currentTime + 1 / 24); });
    btn('5s ⏩', 0.09, 0.1, () => seek(p, video.currentTime + 5));
    p.speedBtn = btn('1×', 0.18, 0.07, () => setRate(p, { 1: 0.5, 0.5: 0.25, 0.25: 2, 2: 1 }[p.rate] || 1));
    btn('PIN', 0.27, 0.09, () => addPin(p, video.currentTime, `Moment at ${fmtTime(video.currentTime)}`));
    btn('GRAB', 0.37, 0.1, () => grabFrame(p));
    const y1 = y0 - 0.05;
    addButton(group, 'COMPARE WITH…', -0.3, y1, 0.2, () => openLibraryPicker(['video'], f => compareWith(p, f), 'Pick a clip to compare'), { owner: obj });
    p.linkBtn = addButton(group, 'LINK: OFF', -0.08, y1, 0.14, () => { if (p.link) setLink(p, null); }, { owner: obj });
    p.pinsGroup = new THREE.Group(); p.pinsGroup.position.set(W / 2 + 0.17, 0.25, 0); group.add(p.pinsGroup);
    // Tap the bar to jump; tap the picture to play / pause
    surfaces.push({ mesh: bar.mesh, down: uv => { seek(p, uv.x * (video.duration || 0)); return true; }, move: uv => seek(p, uv.x * (video.duration || 0)), up: () => {} });
    touchables.push({ mesh: screen, w: W, h: H, owner: obj, action: () => togglePlay(p) });
    p.drawBar = () => {
      const { canvas, g, tex: t } = bar, d = video.duration || 0;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = 'rgba(30,20,10,0.8)'; g.fillRect(0, 10, canvas.width, 24);
      g.fillStyle = '#ffb347'; g.fillRect(0, 10, d ? canvas.width * video.currentTime / d : 0, 24);
      g.fillStyle = '#ffffff';
      for (const pin of store.pins()[key] || []) if (d) g.fillRect(canvas.width * pin.t / d - 3, 0, 6, 44);
      t.needsUpdate = true;
    };
    obj.userData.save = () => ({ type: 'video', fileId, url, title, time: video.currentTime, rate: p.rate });
    obj.userData.onClose = () => { video.pause(); video.removeAttribute('src'); video.load(); if (p.objectURL) URL.revokeObjectURL(p.objectURL); players.delete(obj); if (p.link) setLink(p, null); };
    (async () => {
      try {
        if (fileId) { p.objectURL = URL.createObjectURL(await fileBlob(fileId)); video.src = p.objectURL; } else video.src = url;
        video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(time, video.duration || time); video.playbackRate = rate; drawPins(p); p.drawBar(); }, { once: true });
      } catch (e) { jarvisSay('', ['J.A.R.V.I.S.', 'COULD NOT OPEN THE VIDEO']); }
    })();
    for (const ev of ['play', 'pause', 'timeupdate', 'seeked']) video.addEventListener(ev, () => {
      p.drawBar(); relabel(p.playBtn, video.paused ? '▶ PLAY' : '❚❚ PAUSE');
      obj.userData.body = `${title}: ${fmtTime(video.currentTime)} of ${fmtTime(video.duration)}, ${video.paused ? 'paused' : 'playing'} at ${p.rate}× speed. Pins: ${(store.pins()[key] || []).map(x => `${fmtTime(x.t)} ${x.label}`).join('; ') || 'none'}`;
    });
    return show(obj, 1.1, -0.05);
  }
  function togglePlay(p) {
    if (p.video.paused) p.video.play().catch(() => jarvisSay('', ['J.A.R.V.I.S.', 'TAP AGAIN TO PLAY'])); else p.video.pause();
    if (p.link) { if (p.video.paused) p.link.video.pause(); else p.link.video.play().catch(() => {}); }
  }
  function seek(p, t, fromLink) {
    const d = p.video.duration || 0;
    p.video.currentTime = Math.max(0, Math.min(d || t, t));
    if (p.link && !fromLink) seek(p.link, p.video.currentTime + (p.linkOffset || 0), true);
  }
  function setRate(p, rate, fromLink) {
    p.rate = rate; p.video.playbackRate = rate; relabel(p.speedBtn, rate + '×');
    if (p.link && !fromLink) setRate(p.link, rate, true);
    markDirty();
  }
  function addPin(p, t, label) {
    const all = store.pins(); (all[p.key] ??= []).push({ t: +(+t).toFixed(2), label: clampText(label, 80) });
    all[p.key].sort((a, b) => a.t - b.t); store.setPins(all);
    session.pins++;
    drawPins(p); p.drawBar(); blip(990, 0.1);
  }
  function drawPins(p) {
    for (const c of [...p.pinsGroup.children]) { p.pinsGroup.remove(c); c.material?.map?.dispose(); }
    for (let i = touchables.length - 1; i >= 0; i--) if (touchables[i].pinOf === p) touchables.splice(i, 1);
    (store.pins()[p.key] || []).slice(0, 10).forEach((pin, i) => {
      const l = addButton(p.pinsGroup, `${fmtTime(pin.t)}  ${pin.label}`.slice(0, 34), 0, -i * 0.05, 0.3, () => seek(p, pin.t), { owner: p.obj });
      touchables[touchables.length - 1].pinOf = p;
    });
  }
  function setLink(p, other) {
    if (p.link && p.link.link === p) { p.link.link = null; relabel(p.link.linkBtn, 'LINK: OFF'); }
    p.link = other;
    if (other) { other.link = p; p.linkOffset = other.video.currentTime - p.video.currentTime; other.linkOffset = -p.linkOffset; relabel(other.linkBtn, 'LINK: ON'); }
    relabel(p.linkBtn, other ? 'LINK: ON' : 'LINK: OFF');
  }
  function compareWith(p, f) {
    const q = players.get(createVideoPlayer({ fileId: f.id, title: f.name }));
    // Put the second clip right next to the first, then link them so they play together
    const right = v3().set(1, 0, 0).applyQuaternion(p.obj.quaternion);
    q.obj.position.copy(p.obj.position).addScaledVector(right, 1.05);
    q.obj.quaternion.copy(p.obj.quaternion); q.obj.userData.popIn = 0;
    q.video.addEventListener('loadedmetadata', () => setLink(p, q), { once: true });
    jarvisSay('', ['J.A.R.V.I.S.', 'SIDE BY SIDE', 'THE TWO CLIPS ARE LINKED']);
    return q;
  }
  restorers.video = item => createVideoPlayer({ fileId: item.fileId, url: item.url, title: item.title, time: item.time, rate: item.rate });
  const playerFor = id => { const p = [...players.values()].find(x => x.obj.userData.id === id) || [...players.values()].find(x => x.title.toLowerCase().includes(String(id).toLowerCase())); if (!p) throw Error('No open video with that id.'); return p; };

  // Frame grabs: a still you can draw on (turn on DRAW, then pinch on the picture) and caption
  const frames = new Map();
  async function grabFrame(p) {
    const v = p.video;
    if (!v.videoWidth) { jarvisSay('', ['J.A.R.V.I.S.', 'THE VIDEO IS NOT READY YET']); return null; }
    const c = document.createElement('canvas'); c.width = 1280; c.height = Math.round(1280 * v.videoHeight / v.videoWidth);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const rec = { id: uid('fr'), image: c.toDataURL('image/jpeg', 0.85), strokes: [], caption: `${p.title} at ${fmtTime(v.currentTime)}`, source: p.title, time: v.currentTime };
    await DB.put('frames', rec);
    session.frames++;
    blip(1200, 0.08); setTimeout(() => blip(1500, 0.06), 90);
    const o = openFrame(rec.id, rec);
    // The still pops out next to the video, slightly in front, so it doesn't cover the picture
    const right = v3().set(1, 0, 0).applyQuaternion(p.obj.quaternion), toward = v3().set(0, 0, 1).applyQuaternion(p.obj.quaternion);
    o.position.copy(p.obj.position).addScaledVector(right, 0.95).addScaledVector(toward, 0.15);
    o.quaternion.copy(p.obj.quaternion);
    return o;
  }
  function openFrame(frameId, preloaded) {
    const W = 0.8, H = 0.45;
    const group = new THREE.Group();
    const view = canvasPanel(W, H, 1280, 720); group.add(view.mesh);
    const obj = makeHoloObject(group, W + 0.02, H + 0.12, 'Frame', 'frame');
    const f = { obj, view, rec: preloaded || null, img: null };
    frames.set(obj, f);
    f.caption = addButton(group, 'Loading…', 0, -H / 2 - 0.03, 0.6, () => {}, { owner: obj, h: 0.04 });
    obj.userData.save = () => ({ type: 'frame', frameId });
    obj.userData.onClose = () => frames.delete(obj);
    let stroke = null;
    surfaces.push({
      mesh: view.mesh,
      down: uv => { if (!draw.on || !f.rec) return false; stroke = [[uv.x, 1 - uv.y]]; f.rec.strokes.push(stroke); redraw(); return true; },
      move: uv => { if (stroke) { stroke.push([uv.x, 1 - uv.y]); redraw(); } },
      up: () => { if (stroke) { stroke = null; DB.put('frames', f.rec); } }
    });
    const redraw = () => {
      const { canvas, g, tex } = view;
      g.fillStyle = '#000'; g.fillRect(0, 0, canvas.width, canvas.height);
      if (f.img) g.drawImage(f.img, 0, 0, canvas.width, canvas.height);
      g.strokeStyle = '#ffd200'; g.lineWidth = 7; g.lineCap = g.lineJoin = 'round';
      for (const s of f.rec?.strokes || []) { g.beginPath(); s.forEach(([x, y], i) => i ? g.lineTo(x * canvas.width, y * canvas.height) : g.moveTo(x * canvas.width, y * canvas.height)); g.stroke(); }
      tex.needsUpdate = true;
    };
    f.redraw = redraw;
    (async () => {
      f.rec = f.rec || await DB.get('frames', frameId);
      if (!f.rec) { relabel(f.caption, 'This frame was deleted'); return; }
      f.img = new Image(); f.img.onload = redraw; f.img.src = f.rec.image;
      relabel(f.caption, f.rec.caption);
      obj.userData.title = 'Frame: ' + f.rec.caption; obj.userData.body = 'Caption: ' + f.rec.caption;
    })();
    return show(obj, 0.8, 0);
  }
  restorers.frame = item => openFrame(item.frameId);

  // ================================================================ IMAGES, SCANS AND 3D MODELS
  function openImage({ fileId, dataURL, title = 'Image' }) {
    const group = new THREE.Group();
    const view = canvasPanel(0.7, 0.5, 1024, 732); group.add(view.mesh);
    const obj = makeHoloObject(group, 0.72, 0.52, title, 'image');
    obj.userData.save = () => fileId ? ({ type: 'image', fileId, title }) : null;
    (async () => {
      const src = dataURL || URL.createObjectURL(await fileBlob(fileId));
      const img = new Image();
      img.onload = () => {
        const { canvas, g, tex } = view, s = Math.min(canvas.width / img.width, canvas.height / img.height);
        g.fillStyle = '#000'; g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, (canvas.width - img.width * s) / 2, (canvas.height - img.height * s) / 2, img.width * s, img.height * s);
        tex.needsUpdate = true;
      };
      img.src = src;
    })().catch(() => {});
    return show(obj, 0.8, 0);
  }
  restorers.image = item => openImage(item);
  // Scan a book page with the headset camera (only where Quest Browser allows camera access)
  let rawScanReady = false, rawCapture = null;
  const scanUnavailable = () => {
    jarvisSay('', ['SCAN', 'REAL PAGE CAMERA IS NOT AVAILABLE', 'ADD A PHOTO TO THE LIBRARY INSTEAD']);
    return openWindow('Add a photo of the page', 'This browser has not provided a real outward-facing camera. Avatar/selfie cameras cannot scan a book. Take a photo on your phone, transfer it to the Quest, then add it under Library on the Sunnyvale page. Files are stored in the browser where you upload them.');
  };
  async function saveScan(dataURL) {
    const blob = await (await fetch(dataURL)).blob();
    await addFiles([new File([blob], `Scanned page ${Date.now()}.jpg`, {type:'image/jpeg'})]);
    const f=store.library().at(-1);openImage({fileId:f.id,title:f.name});
    jarvisSay('', ['SCAN','PAGE SAVED IN YOUR LIBRARY']);
  }
  async function openScanner() {
    if (rawScanReady) {
      const obj=openWindow('Real page camera', 'Point the headset at the page, then tap Capture. This captures one real camera image; it does not record a video.');obj.userData.noSave=true;
      addButton(obj,'CAPTURE PAGE',0,-.29,.28,()=>{rawCapture=obj;});
      obj.userData.onClose=()=>{if(rawCapture===obj)rawCapture=null;};return obj;
    }
    let stream;
    try { stream = await environmentCamera(); }
    catch { return scanUnavailable(); }
    const video = document.createElement('video'); video.srcObject = stream; video.playsInline = true; video.muted = true;
    try { await video.play(); } catch { stream.getTracks().forEach(t=>t.stop()); return scanUnavailable(); }
    const group = new THREE.Group();
    const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace;
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    const obj = makeHoloObject(group, 0.72, 0.5, 'Page scanner', 'scanner');
    obj.userData.noSave = true;
    obj.userData.onClose = () => stream.getTracks().forEach(t => t.stop());
    addButton(group, 'CAPTURE PAGE', 0, -0.23, 0.26, async () => {
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
      const file = new File([blob], `Scanned page ${new Date().toLocaleString()}.jpg`, { type: 'image/jpeg' });
      await addFiles([file]);
      const f = store.library().slice(-1)[0];
      openImage({ fileId: f.id, title: f.name });
      jarvisSay('', ['J.A.R.V.I.S.', 'PAGE SCANNED', 'SAVED IN YOUR LIBRARY']);
    }, { owner: obj });
    return show(obj, 0.7, -0.1);
  }
  async function openModel({ fileId, title = '3D model' }) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const group = new THREE.Group();
    const obj = makeHoloObject(group, 0.5, 0.5, title, 'model');
    obj.userData.save = () => ({ type: 'model', fileId, title });
    obj.userData.update = dt => { group.rotation.y += dt * 0.3; };
    const url = URL.createObjectURL(await fileBlob(fileId));
    new GLTFLoader().load(url, gltf => {
      const m = gltf.scene, box = new THREE.Box3().setFromObject(m), size = box.getSize(v3()), c = box.getCenter(v3());
      m.position.sub(c); const s = 0.42 / Math.max(size.x, size.y, size.z); const wrapper = new THREE.Group(); wrapper.scale.setScalar(s); wrapper.add(m); group.add(wrapper);
      group.add(new THREE.AmbientLight(0xffffff, 1.2));
      URL.revokeObjectURL(url);
    }, undefined, () => jarvisSay('', ['J.A.R.V.I.S.', 'COULD NOT LOAD THAT MODEL']));
    return show(obj, 0.8, -0.05);
  }
  restorers.model = item => { openModel(item); return null; };

  // ================================================================ STORYBOARD (cards in an arc you can walk around)
  function createStoryboard(title, shots) {
    const group = new THREE.Group();
    const n = Math.min(16, shots.length), radius = 1.6, spread = Math.min(2.4, n * 0.32);
    shots.slice(0, 16).forEach((s, i) => {
      const a = n > 1 ? -spread / 2 + spread * i / (n - 1) : 0;
      const card = new THREE.Group();
      const view = canvasPanel(0.42, 0.32, 840, 640); card.add(view.mesh);
      const { g, canvas, tex } = view;
      const paint = img => {
        frameBox(g, canvas.width, canvas.height, getMode() === 'stark');
        g.fillStyle = accent(); g.font = '700 40px "Segoe UI", system-ui, sans-serif'; g.fillText(`SHOT ${i + 1}  ${s.title || ''}`.slice(0, 36), 30, 60);
        let y = 90;
        if (img) { const h = 300; g.drawImage(img, 30, y, h * img.width / img.height, h); y += h + 20; }
        g.fillStyle = ink(); g.font = '30px "Segoe UI", system-ui, sans-serif';
        wrap(g, s.description || '', canvas.width - 60).slice(0, img ? 6 : 14).forEach((l, k) => g.fillText(l, 30, y + 30 + k * 38));
        tex.needsUpdate = true;
      };
      paint(null);
      if (s.frame_id) DB.get('frames', s.frame_id).then(rec => { if (rec) { const img = new Image(); img.onload = () => paint(img); img.src = rec.image; } });
      card.position.set(Math.sin(a) * radius, 0, -Math.cos(a) * radius + radius);
      card.rotation.y = -a;
      group.add(card);
    });
    const obj = makeHoloObject(group, 0.5, 0.36, title, 'storyboard');
    obj.userData.build = null;
    obj.userData.save = () => ({ type: 'storyboard', title, shots });
    obj.userData.body = shots.map((s, i) => `Shot ${i + 1}: ${s.title || ''} ${s.description || ''}`).join(' | ');
    return show(obj, radius, -0.05);
  }
  restorers.storyboard = item => createStoryboard(item.title, item.shots || []);

  // ================================================================ TEACHER MODE: presentations
  function createPresentation(title, slides) {
    const W = 1.6, H = 0.9;
    const group = new THREE.Group();
    const view = canvasPanel(W, H, 1920, 1080); group.add(view.mesh);
    const obj = makeHoloObject(group, W + 0.04, H + 0.16, title, 'slides');
    const st = { i: 0, started: Date.now() };
    const notes = holoLabel('', { w: 0.9, h: 0.06 }); notes.position.set(0, -H / 2 - 0.05, 0.006); group.add(notes);
    const paint = () => {
      const { g, canvas, tex } = view, s = slides[st.i] || {};
      frameBox(g, canvas.width, canvas.height, getMode() === 'stark');
      g.fillStyle = accent(); g.font = '700 84px "Segoe UI", system-ui, sans-serif'; g.fillText(String(s.title || title).slice(0, 40), 90, 170);
      g.fillStyle = ink(); g.font = '52px "Segoe UI", system-ui, sans-serif';
      let y = 300;
      for (const b of s.bullets || []) for (const [k, l] of wrap(g, '•  ' + b, canvas.width - 220).entries()) { g.fillText(k ? '    ' + l : l, 100, y); y += 70; }
      g.font = '32px "Segoe UI", system-ui, sans-serif'; g.globalAlpha = 0.6;
      g.fillText(`${st.i + 1} / ${slides.length}`, canvas.width - 200, canvas.height - 50); g.globalAlpha = 1;
      tex.needsUpdate = true;
      relabel(notes, s.notes ? 'NOTES: ' + String(s.notes).slice(0, 90) : 'NO SPEAKER NOTES');
      obj.userData.body = `Slide ${st.i + 1} of ${slides.length}: ${s.title || ''}. ${(s.bullets || []).join('; ')}`;
    };
    const go = i => { st.i = Math.max(0, Math.min(slides.length - 1, i)); paint(); markDirty(); };
    addButton(group, '◀ BACK', -0.3, -H / 2 - 0.12, 0.14, () => go(st.i - 1), { owner: obj });
    addButton(group, 'NEXT ▶', 0.3, -H / 2 - 0.12, 0.14, () => go(st.i + 1), { owner: obj });
    obj.userData.go = go;
    obj.userData.save = () => ({ type: 'slides', title, slides, at: st.i });
    obj.userData.update = () => {
      const s = Math.floor((Date.now() - st.started) / 1000);
      if (s !== st.lastSec) { st.lastSec = s; }
    };
    paint();
    return show(obj, 2.0, 0.05);
  }
  restorers.slides = item => { const o = createPresentation(item.title, item.slides || []); o.userData.go(item.at || 0); return o; };

  // ================================================================ COUNTER-ARGUMENTS
  function addCounterargument(claim, objection, response) {
    const all = store.counters(); all.push({ claim: clampText(claim, 400), objection: clampText(objection, 800), response: clampText(response, 800), added: Date.now() }); store.setCounters(all);
    let w = findWindow('counter');
    const body = all.slice().reverse().map(c => `CLAIM: ${c.claim}\nOBJECTION: ${c.objection}${c.response ? '\nANSWER: ' + c.response : ''}`).join('\n\n');
    if (!w) { w = openWindow('Counter-arguments', body); w.userData.id = 'counter'; } else setWindowContent(w, 'Counter-arguments', body);
    return w;
  }

  // ================================================================ THESIS DOCUMENT (live, editable in place)
  const thesis = readJSON('sunnyvale.thesis', { title: 'Bachelor thesis: Propaganda in film', paras: [], history: [] });
  const saveThesis = () => { thesis.updated = Date.now(); writeJSON('sunnyvale.thesis', thesis); refreshStrip(); refreshBriefing(); };
  const words = t => (String(t).match(/[\p{L}\p{N}'’-]+/gu) || []).length;
  const wordCount = () => thesis.paras.reduce((n, p) => n + words(p.text), 0);
  function snapshotThesis() { thesis.history = [...(thesis.history || []), JSON.stringify({ title: thesis.title, paras: thesis.paras })].slice(-30); }
  let doc = null;
  function openThesis() {
    if (doc && panels.includes(doc.obj)) { doc.obj.userData.popIn = 0; return doc.obj; }
    const W = 0.9, H = 0.72;
    const group = new THREE.Group();
    const view = canvasPanel(W, H, 1500, 1200); group.add(view.mesh);
    const obj = makeHoloObject(group, W + 0.04, H + 0.18, 'Thesis', 'thesis');
    doc = { obj, view, sel: thesis.paras.length - 1, scroll: 0, layout: [] };
    obj.userData.id = 'thesis';
    obj.userData.save = () => ({ type: 'thesis' });
    obj.userData.onClose = () => { doc = null; commentCards = []; closeKeyboard(); };
    const y = -H / 2 - 0.035, b = (t, x, w, fn) => addButton(group, t, x, y, w, fn, { owner: obj });
    b('▲', -0.41, 0.05, () => { doc.scroll = Math.max(0, doc.scroll - 6); paintThesis(); });
    b('▼', -0.35, 0.05, () => { doc.scroll += 6; paintThesis(); });
    b('⌨ KEYS', -0.25, 0.11, () => openKeyboard());
    b('+ PARAGRAPH', -0.11, 0.15, () => { snapshotThesis(); thesis.paras.splice(doc.sel + 1, 0, { text: '' }); doc.sel++; saveThesis(); paintThesis(); openKeyboard(); });
    b('HEADING', 0.04, 0.12, () => { const p = thesis.paras[doc.sel]; if (p) { p.heading = !p.heading; saveThesis(); paintThesis(); } });
    b('↶ UNDO', 0.17, 0.11, () => undoThesis());
    b('EXPORT', 0.3, 0.11, () => exportThesis());
    b('✕ ¶', 0.4, 0.07, () => { if (thesis.paras[doc.sel] !== undefined) { snapshotThesis(); thesis.paras.splice(doc.sel, 1); doc.sel = Math.min(doc.sel, thesis.paras.length - 1); saveThesis(); paintThesis(); } });
    // Tap a paragraph to select it (the keyboard then types into it)
    surfaces.push({ mesh: view.mesh, down: uv => {
      const py = (1 - uv.y) * view.canvas.height, line = doc.layout.find(l => py >= l.y0 && py < l.y1);
      if (line) { doc.sel = line.para; paintThesis(); }
      return true;
    }, move: () => {}, up: () => {} });
    paintThesis(); paintComments();
    return show(obj, 0.85, -0.02);
  }
  function paintThesis() {
    if (!doc) return;
    const { canvas, g, tex } = doc.view, W = canvas.width, H = canvas.height, stark = getMode() === 'stark';
    frameBox(g, W, H, stark);
    let titleSize = 46, titleLines;
    do { g.font = `700 ${titleSize}px Georgia, serif`; titleLines = wrap(g, thesis.title, W - 100); if (titleLines.length <= 2 || titleSize <= 26) break; titleSize -= 2; } while (true);
    g.fillStyle = accent();
    titleLines.forEach((line, index) => g.fillText(line, 50, 65 + index * (titleSize + 8), W - 100));
    const infoY = 65 + titleLines.length * (titleSize + 8);
    g.font = '26px "Segoe UI", system-ui, sans-serif'; g.globalAlpha = 0.7;
    g.fillText(`${wordCount().toLocaleString()} words · ${thesis.paras.length} paragraphs · saved ${thesis.updated ? new Date(thesis.updated).toLocaleTimeString().slice(0, 5) : '—'}`, 52, infoY);
    g.globalAlpha = 1;
    const lines = [];
    thesis.paras.forEach((p, i) => {
      g.font = p.heading ? '700 40px Georgia, serif' : '32px Georgia, serif';
      const ls = wrap(g, p.text || (i === doc.sel ? '' : ' '), W - 120);
      ls.forEach((l, k) => lines.push({ text: l, para: i, heading: p.heading, last: k === ls.length - 1 }));
      lines.push({ text: '', para: i, gap: true });
    });
    if (!thesis.paras.length) lines.push({ text: 'Empty. Tap + PARAGRAPH to start writing, or ask Claude to draft a section.', para: -1, hint: true });
    const lineH = 44, top = Math.max(165, infoY + 50), per = Math.floor((H - top - 30) / lineH);
    doc.scroll = Math.max(0, Math.min(doc.scroll, Math.max(0, lines.length - per)));
    doc.layout = [];
    const commented = new Set(comments().map(commentPara));
    let marked = -1;
    lines.slice(doc.scroll, doc.scroll + per).forEach((l, k) => {
      const y = top + k * lineH;
      if (commented.has(l.para) && marked !== l.para && !l.gap) { marked = l.para; g.fillStyle = '#d97757'; g.beginPath(); g.arc(30, y - 12, 9, 0, Math.PI * 2); g.fill(); }
      if (l.para === doc.sel && !l.gap) { g.fillStyle = stark ? 'rgba(255,180,70,0.18)' : 'rgba(255,214,0,0.25)'; g.fillRect(40, y - 34, W - 80, lineH); }
      g.fillStyle = l.hint ? accent() : ink(); g.font = l.heading ? '700 40px Georgia, serif' : '32px Georgia, serif';
      g.fillText(l.text, 60, y);
      if (l.para === doc.sel && l.last && keyboard) { g.fillRect(60 + g.measureText(l.text).width + 4, y - 30, 3, 36); }   // the cursor
      doc.layout.push({ y0: y - 34, y1: y + 10, para: l.para });
    });
    tex.needsUpdate = true;
    doc.obj.userData.body = `${thesis.title}: ${wordCount()} words. ` + thesis.paras.map((p, i) => `[${i}] ${p.text}`).join(' ').slice(0, 1500);
  }
  function undoThesis() {
    const last = thesis.history?.pop();
    if (!last) { jarvisSay('', ['J.A.R.V.I.S.', 'NOTHING TO UNDO']); return; }
    const s = JSON.parse(last); thesis.title = s.title; thesis.paras = s.paras; saveThesis(); paintThesis();
  }
  function editThesis({ action, index, text, heading }) {
    snapshotThesis();
    const i = index === undefined || index === null ? thesis.paras.length : Math.max(0, Math.min(thesis.paras.length, index));
    const para = { text: clampText(text, 20000), heading: !!heading };
    if (action === 'append') thesis.paras.push(para);
    else if (action === 'insert') thesis.paras.splice(i, 0, para);
    else if (action === 'replace') { if (!thesis.paras[i]) throw Error('No paragraph ' + i); thesis.paras[i] = { ...thesis.paras[i], text: para.text, heading: heading ?? thesis.paras[i].heading }; }
    else if (action === 'delete') { if (!thesis.paras[i]) throw Error('No paragraph ' + i); thesis.paras.splice(i, 1); }
    else if (action === 'title') thesis.title = clampText(text, 200);
    else throw Error('Use append, insert, replace, delete or title.');
    saveThesis();
    if (!doc) openThesis(); else paintThesis();
    return { ok: true, words: wordCount(), paragraphs: thesis.paras.length };
  }
  function thesisText() { return thesis.title + '\n\n' + thesis.paras.map(p => p.heading ? p.text.toUpperCase() : p.text).join('\n\n'); }
  function exportThesis() {
    const b = bridge();
    if (b?.isReady?.() && b.openAndType) {
      b.openAndType('https://docs.new', thesisText());
      jarvisSay('', ['J.A.R.V.I.S.', 'EXPORTING TO GOOGLE DOCS', 'A NEW DOCUMENT IS OPENING']);
    } else jarvisSay('', ['J.A.R.V.I.S.', 'CONNECT THE PC BRIDGE TO EXPORT', 'OR USE "DOWNLOAD THESIS" ON THE PAGE']);
  }
  restorers.thesis = () => openThesis();

  // A simple holographic keyboard for typing into the thesis
  let keyboard = null, shift = false;
  function openKeyboard() {
    if (keyboard) { keyboard.userData.popIn = 0; return; }
    const group = new THREE.Group();
    keyboard = makeHoloObject(group, 0.86, 0.42, 'Keyboard', 'thesis-keyboard');
    keyboard.userData.noSave = true;
    keyboard.userData.onClose = () => { keyboard = null; paintThesis(); };
    const rows = ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm,.?', '-:;!()"'];
    rows.forEach((row, r) => [...row].forEach((ch, i) => addButton(group, ch, (i - (row.length - 1) / 2) * 0.074, 0.15 - r * 0.062, 0.066, () => type(shift ? ch.toUpperCase() : ch), { owner: keyboard, h: 0.052 })));
    addButton(group, 'SHIFT', -0.3, -0.17, 0.12, () => { shift = !shift; }, { owner: keyboard, h: 0.052 });
    addButton(group, 'SPACE', -0.05, -0.17, 0.3, () => type(' '), { owner: keyboard, h: 0.052 });
    addButton(group, '⌫', 0.17, -0.17, 0.09, () => type('Backspace'), { owner: keyboard, h: 0.052 });
    addButton(group, 'ENTER', 0.3, -0.17, 0.12, () => type('Enter'), { owner: keyboard, h: 0.052 });
    // Under the thesis window, tilted towards you like a real keyboard
    if (doc) {
      const down = v3().set(0, -1, 0), toward = v3().set(0, 0, 1).applyQuaternion(doc.obj.quaternion);
      keyboard.position.copy(doc.obj.position).addScaledVector(down, 0.52).addScaledVector(toward, 0.22);
      keyboard.quaternion.copy(doc.obj.quaternion); keyboard.rotateX(-0.5); keyboard.userData.popIn = 0;
    } else show(keyboard, 0.6, -0.35);
    paintThesis();
  }
  function closeKeyboard() { if (keyboard) { closeWindow(keyboard); keyboard = null; } }
  let typingSnapshot = 0;
  function type(key) {
    if (!thesis.paras.length) { thesis.paras.push({ text: '' }); doc && (doc.sel = 0); }
    const i = doc ? Math.max(0, doc.sel) : thesis.paras.length - 1, p = thesis.paras[i];
    if (Date.now() - typingSnapshot > 10000) { snapshotThesis(); typingSnapshot = Date.now(); }
    if (key === 'Backspace') p.text = p.text.slice(0, -1);
    else if (key === 'Enter') { thesis.paras.splice(i + 1, 0, { text: '' }); if (doc) doc.sel = i + 1; }
    else { p.text += key; if (shift && key.length === 1) shift = false; }
    saveThesis(); paintThesis();
  }
  // PC keyboard types into the thesis while the holo keyboard is open
  window.addEventListener('keydown', e => {
    if (!keyboard || ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); type(e.key); }
  }, true);

  // ================================================================ DEADLINES
  const daysLeft = d => Math.ceil((new Date(d + 'T23:59:59') - now()) / 86400000);
  function upcoming() { return store.deadlines().filter(d => daysLeft(d.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)); }
  function addDeadline(title, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw Error('Use a date like 2026-12-15.');
    const all = store.deadlines(); all.push({ id: uid('d'), title: clampText(title, 80), date }); store.setDeadlines(all);
    refreshStrip(); renderLibraryPage(); refreshDeadlinesWindow(); refreshBriefing();
    return all[all.length - 1];
  }
  function removeDeadline(idOrTitle) {
    const all = store.deadlines(), k = String(idOrTitle).toLowerCase();
    store.setDeadlines(all.filter(d => d.id !== idOrTitle && d.title.toLowerCase() !== k));
    refreshStrip(); renderLibraryPage(); refreshDeadlinesWindow(); refreshBriefing();
  }
  const deadlineLine = d => { const n = daysLeft(d.date); return `${d.title}: ${n === 0 ? 'TODAY' : n === 1 ? 'tomorrow' : 'in ' + n + ' days'} (${d.date})`; };
  function openDeadlinesWindow() {
    let w = findWindow('deadlines');
    if (!w) { w = openWindow('Deadlines', ''); w.userData.id = 'deadlines'; }
    refreshDeadlinesWindow(); return reveal(w);
  }
  function refreshDeadlinesWindow() {
    const w = findWindow('deadlines'); if (!w) return;
    setWindowContent(w, 'Deadlines', upcoming().map(deadlineLine).join('\n') || 'No deadlines. Ask Claude, or add them on the page.');
  }

  // ================================================================ STATUS STRIP: word count + next deadline + timer, always visible
  const strip = canvasPanel(0.46, 0.04, 1150, 100);
  strip.mesh.material.depthTest = false; strip.mesh.renderOrder = 998;
  strip.mesh.position.set(0, -0.3, -0.85);
  camera.add(strip.mesh);
  let stripKey = '';
  function refreshStrip(force) {
    const mic = bridge()?.microphoneState;
    strip.mesh.visible = renderer.xr.isPresenting && (settings.strip || !!mic);
    const next = upcoming()[0], t = timerInfo();
    const text = `✎ ${wordCount().toLocaleString()} WORDS` + (session.wordsStart !== null ? ` (+${Math.max(0, wordCount() - session.wordsStart)})` : '') +
      (next ? `   ·   ⚑ ${next.title.toUpperCase()} ${daysLeft(next.date) === 0 ? 'TODAY' : 'IN ' + daysLeft(next.date) + 'D'}` : '') +
      (t.running ? `   ·   ◷ ${t.phase.toUpperCase()} ${fmtTime(t.left)}` : '') +
      (mic ? (mic.pending ? '   ·   MIC CONNECTING' : '   ·   ● LISTENING') : '');
    if (text === stripKey && !force) return;
    stripKey = text;
    const { g, canvas, tex } = strip;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(20,8,4,0.55)'; g.beginPath(); g.roundRect(4, 8, canvas.width - 8, canvas.height - 16, 30); g.fill();
    g.fillStyle = '#ffd98a'; g.font = '600 44px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);
    tex.needsUpdate = true;
  }

  // ================================================================ SESSIONS: summary at log off, briefing at the start
  const session = { start: null, wordsStart: null, focusDone: 0, quotes: 0, highlights: 0, pins: 0, frames: 0, claude: null, finished: true };
  function startSession() {
    Object.assign(session, { start: Date.now(), wordsStart: wordCount(), focusDone: 0, quotes: 0, highlights: 0, pins: 0, frames: 0, claude: null, finished: false });
    refreshStrip(true);
    if (settings.briefedOn !== today()) { settings.briefedOn = today(); saveSettings(); setTimeout(() => briefing(true), 2500); }
  }
  function sessionSummary() {
    const minutes = session.start ? Math.round((Date.now() - session.start) / 60000) : 0;
    return { start: session.start, end: Date.now(), minutes, focusDone: session.focusDone, wordsStart: session.wordsStart ?? wordCount(), wordsEnd: wordCount(),
      quotes: session.quotes, highlights: session.highlights, pins: session.pins, frames: session.frames, claude: session.claude };
  }
  function summaryText(s) {
    const lines = [
      `Studied for ${s.minutes} minutes${s.focusDone ? `, ${s.focusDone} focus session${s.focusDone > 1 ? 's' : ''}` : ''}.`,
      `Thesis: ${s.wordsEnd.toLocaleString()} words (${s.wordsEnd - s.wordsStart >= 0 ? '+' : ''}${s.wordsEnd - s.wordsStart} today).`,
      `Saved ${s.quotes} quote${s.quotes === 1 ? '' : 's'}, ${s.highlights} highlight${s.highlights === 1 ? '' : 's'}, ${s.pins} video pin${s.pins === 1 ? '' : 's'}, ${s.frames} frame${s.frames === 1 ? '' : 's'}.`
    ];
    if (s.claude?.done) lines.push('', 'Claude: what we did: ' + s.claude.done);
    if (s.claude?.next) lines.push('', 'Next time: ' + s.claude.next);
    const next = upcoming()[0]; if (next) lines.push('', 'Next deadline: ' + deadlineLine(next));
    return lines.join('\n');
  }
  function finishSession() {
    if (session.finished || !session.start) return null;
    session.finished = true;
    const s = sessionSummary();
    const all = store.sessions(); all.push(s); store.setSessions(all.slice(-60)); refreshBriefing();
    const hint = document.getElementById('sessionSummary');
    if (hint) hint.textContent = 'Last session: ' + summaryText(s).replace(/\n+/g, ' ');
    return s;
  }
  // The LOG OFF button: show the summary, then leave the headset view
  function logOff() {
    const s = sessionSummary();
    const w = openWindow('Session summary', summaryText(s)); w.userData.id = 'summary';
    jarvisSay(`Session complete. ${s.minutes} minutes, ${s.wordsEnd - s.wordsStart} new words. Good work.`,
      ['J.A.R.V.I.S.', 'SESSION COMPLETE', `${s.minutes} MIN · ${Math.max(0, s.wordsEnd - s.wordsStart)} NEW WORDS · ${s.quotes} QUOTES`]);
    setTimeout(() => { finishSession(); renderer.xr.getSession()?.end().catch(() => {}); }, 9000);
  }
  function refreshBriefing() { if (findWindow('briefing')) briefing(false, { reveal: false, announce: false }); }
  function briefing(auto, options = {}) {
    const saved = readJSON('sunnyvale.thesis', null);
    if (saved && Array.isArray(saved.paras)) Object.assign(thesis, saved);
    const last = store.sessions().slice(-1)[0], next = upcoming();
    const toRead = store.sources().filter(s => s.toRead).slice(0, 5);
    const lines = [
      `Good ${now().getHours() < 12 ? 'morning' : now().getHours() < 18 ? 'afternoon' : 'evening'}. ${now().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`,
      '', 'DEADLINES', ...(next.length ? next.slice(0, 4).map(d => '• ' + deadlineLine(d)) : ['• None set']),
      '', `TO READ (${store.sources().filter(s => s.toRead).length} · ${store.sources().length} SOURCES SAVED)`, ...(toRead.length ? toRead.map(s => '• ' + s.title) : ['• No saved sources marked to read']),
      '', 'LAST SESSION', last ? `• ${new Date(last.start).toLocaleDateString()}: ${last.minutes} min, ${last.wordsEnd - last.wordsStart >= 0 ? '+' : ''}${last.wordsEnd - last.wordsStart} words, ${last.quotes} quotes` : '• This is your first session',
      ...(last?.claude?.next ? ['', 'PLANNED NEXT', '• ' + last.claude.next] : []),
      '', `THESIS: ${wordCount().toLocaleString()} words`
    ];
    const w = findWindow('briefing') || (() => { const x = openWindow('Briefing', ''); x.userData.id = 'briefing'; return x; })();
    setWindowContent(w, 'Morning briefing', lines.join('\n'));
    const d = next[0];
    if (options.reveal !== false) reveal(w);
    if (options.announce !== false) jarvisSay(auto ? `Good ${now().getHours() < 12 ? 'morning' : 'day'}. ${d ? `${d.title} is due ${daysLeft(d.date) === 0 ? 'today' : 'in ' + daysLeft(d.date) + ' days'}.` : ''}` : '',
      ['J.A.R.V.I.S.', 'BRIEFING', d ? `${d.title.toUpperCase()} · ${daysLeft(d.date)} DAYS` : `THESIS: ${wordCount()} WORDS`]);
    return w;
  }

  // ================================================================ CLAUDE'S AVATAR: the Claude spark, a visible presence that points at things
  // Twelve coral rays round a bright centre, always turned towards you. The rays show what Claude is doing:
  // waiting (a slow turn, gently breathing), listening (rays stretch out and pulse, with a ring round them),
  // working (spins faster, with a light running round the rays), speaking (rays pulse with the voice) and
  // pointing (the ray nearest the target stretches towards it, with a beam). Grey and still when offline.
  const CORAL = new THREE.Color(0xd97757), BRIGHT = new THREE.Color(0xffd9c2), GREY = new THREE.Color(0x8a8580);
  const orb = new THREE.Group();
  const glowTex = canvasTexture(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,160,110,0.8)'); r.addColorStop(1, 'rgba(255,90,40,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb08a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  orbGlow.position.z = -0.01; orbGlow.scale.setScalar(0.13); orbGlow.material.opacity = 0.4; orb.add(orbGlow);
  const spark = new THREE.Group(); orb.add(spark);
  // Each ray is an even, round-ended stroke (like the strokes of the logo); its length changes with Claude's mood
  const RAY_W = 0.0085;
  function rayGeometry(length) {
    const r = RAY_W / 2, shape = new THREE.Shape();
    shape.moveTo(-r, r); shape.lineTo(-r, length - r); shape.absarc(0, length - r, r, Math.PI, 0, true);
    shape.lineTo(r, r); shape.absarc(0, r, r, 0, Math.PI, true);
    return new THREE.ShapeGeometry(shape, 8);
  }
  const RAY_LENGTHS = [1, 0.8, 0.94, 0.74, 1, 0.84, 0.9, 0.76, 0.97, 0.82, 0.88, 0.78];   // uneven, like the logo
  const rays = RAY_LENGTHS.map((len, i) => {
    const pivot = new THREE.Group(); pivot.rotation.z = i / RAY_LENGTHS.length * Math.PI * 2;
    const mesh = new THREE.Mesh(rayGeometry(0.042 * len), new THREE.MeshBasicMaterial({ color: CORAL.clone(), side: THREE.DoubleSide, toneMapped: false }));
    mesh.position.y = 0.004;
    pivot.add(mesh); spark.add(pivot);
    return { mesh, len, angle: Math.PI / 2 + pivot.rotation.z, now: 1 };
  });
  const sparkCore = new THREE.Mesh(new THREE.CircleGeometry(0.009, 24), new THREE.MeshBasicMaterial({ color: CORAL.clone(), toneMapped: false }));
  sparkCore.position.z = 0.0005; spark.add(sparkCore);
  const listenRing = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.0625, 64), new THREE.MeshBasicMaterial({ color: 0xff9a6a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  listenRing.visible = false; orb.add(listenRing);
  scene.add(orb);
  const beamGeo = new THREE.BufferGeometry().setFromPoints([v3(), v3()]);
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xff9a6a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.frustumCulled = false; beam.visible = false; scene.add(beam);
  const orbState = { target: null, pointAt: null, anchor: null, pulse: null, home: true, mood: 'waiting' };
  orb.position.set(-0.5, 1.5, -0.4);
  function orbHome(out) {
    viewerPosition(out);
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    const fwd = cam.getWorldDirection(v3()); fwd.y = 0; fwd.normalize();
    const left = v3().crossVectors(v3().set(0, 1, 0), fwd).normalize();
    return out.addScaledVector(fwd, 0.55).addScaledVector(left, 0.38).add(v3().set(0, 0.05, 0));
  }
  // Point at a window, or at one part of it (a timeline event number, a mind map branch name, a thesis paragraph)
  function pointAt(id, part) {
    const p = findWindow(id);
    if (!p) throw Error('No window with that id.');
    let point = p.getWorldPosition(v3()), mesh = null;
    if (part !== undefined && part !== null && part !== '') {
      if (p.userData.eventDots) {
        const key = String(part).trim().toLowerCase(), dots = p.userData.eventDots;
        mesh = dots[+part] || dots.find(dot => [dot.userData.event?.label, dot.userData.event?.year].some(value => String(value).toLowerCase() === key)) || dots.find(dot => String(dot.userData.event?.label).toLowerCase().includes(key));
        if (!mesh) throw Error('No timeline event matching that index, year or label. Event indices start at 0.');
      }
      else if (p.userData.nodes) {
        const k = String(part).toLowerCase();
        const hit = Object.entries(p.userData.nodes).find(([label]) => label.toLowerCase() === k) || Object.entries(p.userData.nodes).find(([label]) => label.toLowerCase().includes(k));
        if (hit) { mesh = hit[1]; p.userData.expand?.(hit[0]); }
      } else if (p.userData.id === 'thesis' && doc && Number.isFinite(+part)) { doc.sel = +part; paintThesis(); }
      p.updateWorldMatrix(true, true);
      if (mesh) point = mesh.getWorldPosition(v3());
    }
    viewerPosition(tmp);
    const toViewer = tmp.clone().sub(point).normalize();
    orbState.target = point.clone().addScaledVector(toViewer, 0.25).add(v3().set(0.12, 0.12, 0));
    if (orbState.pulse) orbState.pulse.mesh.scale.setScalar(orbState.pulse.s);
    orbState.pointAt = point; orbState.anchor = { window: p, mesh: mesh || p }; orbState.home = false;
    if (mesh) orbState.pulse = { mesh, t: 0, s: mesh.scale.x };
    return { ok: true };
  }
  const tmp = v3();
  function updateOrb(dt) {
    const t = performance.now() / 1000;
    const anchor = orbState.anchor;
    if (anchor && panels.includes(anchor.window) && anchor.window.visible) {
      anchor.window.updateWorldMatrix(true, true);
      orbState.pointAt = anchor.mesh.getWorldPosition(v3());
      viewerPosition(tmp);
      orbState.target = orbState.pointAt.clone().addScaledVector(tmp.clone().sub(orbState.pointAt).normalize(), .25).add(v3().set(.12, .12, 0));
    } else { orbState.anchor = null; orbState.home = true; orbState.target = orbHome(v3()); }
    orb.position.lerp(orbState.target || orb.position, Math.min(1, dt * 2.5));
    orb.position.y += Math.sin(t * 1.6) * 0.0006;
    viewerPosition(tmp); orb.lookAt(tmp);                       // the spark always faces you, like the logo
    // What Claude is doing right now
    const st = orbState.force || ctx.claudeState?.() || {};      // force: for testing a mood on the PC
    // Offline (the PC bridge is unreachable, so Claude's tools can't reach the world): grey and still
    const mood = st.offline ? 'offline' : st.speaking ? 'speaking' : st.listening ? 'listening' : st.working ? 'working' : 'waiting';
    orbState.mood = mood;
    const spin = { offline: 0, waiting: 0.25, listening: 0.35, speaking: 0.5, working: 2.4 }[mood];
    spark.rotation.z -= dt * spin;
    const pointing = !!orbState.anchor;
    let nearest = -1;
    if (pointing) {                                              // which ray is closest to the thing Claude points at
      spark.updateWorldMatrix(true, false);
      const local = spark.worldToLocal(orbState.pointAt.clone()), aim = Math.atan2(local.y, local.x);
      let best = Infinity;
      rays.forEach((r, i) => { const d = Math.abs(Math.atan2(Math.sin(r.angle - aim), Math.cos(r.angle - aim))); if (d < best) { best = d; nearest = i; } });
    }
    const voice = 0.6 + 0.4 * Math.sin(t * 3.1);
    rays.forEach((r, i) => {
      let k = 1;
      if (mood === 'waiting') k = 1 + 0.06 * Math.sin(t * 1.5);
      else if (mood === 'listening') k = 1.15 + 0.13 * Math.sin(t * 6 - i * 0.52);
      else if (mood === 'speaking') k = 1 + 0.3 * Math.abs(Math.sin(t * 9 + i * 1.7)) * voice;
      else if (mood === 'working') k = 1 + 0.08 * Math.sin(t * 4 + i);
      else if (mood === 'offline') k = 0.7;
      if (i === nearest) k = Math.max(k, 1.8);
      r.now += (k - r.now) * Math.min(1, dt * 10);
      r.mesh.scale.y = r.now;
      // Working: a light runs round the rays
      const glow = mood === 'working' ? Math.max(0, Math.cos(r.angle + spark.rotation.z + t * 7)) ** 4 : i === nearest ? 0.6 : 0;
      if (mood === 'offline') r.mesh.material.color.copy(GREY); else r.mesh.material.color.copy(CORAL).lerp(BRIGHT, glow);
    });
    sparkCore.material.color.copy(mood === 'offline' ? GREY : CORAL);
    listenRing.visible = mood === 'listening';
    if (listenRing.visible) { const s = 1 + 0.08 * Math.sin(t * 6); listenRing.scale.setScalar(s); listenRing.material.opacity = 0.5 + 0.4 * Math.sin(t * 6); }
    orbGlow.material.opacity = mood === 'offline' ? 0 : (mood === 'waiting' ? 0.25 : 0.45) + Math.sin(t * 2.2) * 0.08;
    orbGlow.scale.setScalar(mood === 'speaking' ? 0.13 + 0.02 * voice : 0.13);
    beam.visible = pointing;
    if (pointing) { const a = beamGeo.attributes.position; a.setXYZ(0, orb.position.x, orb.position.y, orb.position.z); a.setXYZ(1, orbState.pointAt.x, orbState.pointAt.y, orbState.pointAt.z); a.needsUpdate = true; beam.material.opacity = 0.5 + Math.sin(t * 10) * 0.3; }
    const pu = orbState.pulse;
    if (pu) { pu.t += dt; pu.mesh.scale.setScalar(pu.s * (1 + Math.sin(Math.min(1, pu.t / 1.5) * Math.PI) * 0.35)); if (pu.t > 1.5) { pu.mesh.scale.setScalar(pu.s); orbState.pulse = null; } }
  }

  // ================================================================ GAZE: what you're looking at (and a picture of it for Claude)
  const lookTarget = new THREE.WebGLRenderTarget(768, 432);
  const lookCam = new THREE.PerspectiveCamera(70, 768 / 432, 0.05, 100);
  async function whatUserSees() {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    cam.updateMatrixWorld();
    const origin = v3().setFromMatrixPosition(cam.matrixWorld), dir = v3().set(0, 0, -1).transformDirection(cam.matrixWorld);
    const ray = new THREE.Raycaster(origin, dir);
    const hit = ray.intersectObjects(panels.filter(p => p.visible), false)[0];
    let info = { looking_at: 'nothing in particular (empty space)' };
    if (hit) {
      const p = hit.object, u = p.userData;
      info = { looking_at: u.kind || 'window', id: u.browserId ? 'browser:' + u.browserId : u.id, title: u.title, text: String(u.body || '').slice(0, 2000), distance_m: +hit.distance.toFixed(2) };
      if (u.kind === 'pdf') { const r = readers.get(p); if (r) info.page = r.page; }
      if (u.browserId) {
        const page = await bridge()?.describe?.(u.browserId);
        info.url = page?.url || bridge()?.urlOf(u.browserId) || '';
        info.title = page?.title || info.title;
        info.text = page?.text || '';
        if (page?.stale) info.page_context_stale = true;
      }
    }
    // Render what's in front of the user (virtual objects only; the real room isn't visible to the page)
    lookCam.position.copy(origin); lookCam.quaternion.setFromRotationMatrix(cam.matrixWorld);
    const xr = renderer.xr.enabled, old = renderer.getRenderTarget();
    renderer.xr.enabled = false;
    renderer.setRenderTarget(lookTarget); renderer.render(scene, lookCam); renderer.setRenderTarget(old);
    renderer.xr.enabled = xr;
    const px = new Uint8Array(768 * 432 * 4);
    renderer.readRenderTargetPixels(lookTarget, 0, 0, 768, 432, px);
    const c = document.createElement('canvas'); c.width = 768; c.height = 432;
    const g = c.getContext('2d'), img = g.createImageData(768, 432);
    for (let y = 0; y < 432; y++) img.data.set(px.subarray((431 - y) * 768 * 4, (432 - y) * 768 * 4), y * 768 * 4);
    g.putImageData(img, 0, 0);
    // Keep the picture small enough for the headset connection (messages must stay under about 60 KB)
    let q = 0.7, data = c.toDataURL('image/jpeg', q).split(',')[1];
    while (data.length > 42000 && q > 0.25) { q -= 0.1; data = c.toDataURL('image/jpeg', q).split(',')[1]; }
    return { text: JSON.stringify(info), image: data };
  }

  // ================================================================ WAKE WORD ("Jarvis" or "Claude")
  let wake = null;
  function toggleWakeWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { jarvisSay('', ['J.A.R.V.I.S.', "WAKE WORD ISN'T SUPPORTED", 'IN THIS BROWSER (NO SPEECH RECOGNITION)']); return false; }
    if (wake) { wake.stop(); wake = null; jarvisSay('', ['J.A.R.V.I.S.', 'WAKE WORD OFF']); return false; }
    wake = new SR(); wake.continuous = true; wake.interimResults = false; wake.lang = speechLanguage();
    wake.onresult = e => {
      const said = Array.from(e.results).slice(e.resultIndex).map(r => r[0].transcript.toLowerCase()).join(' ');
      if (/\b(jarvis|claude)\b/.test(said)) { blip(1300, 0.08); bridge()?.claudeMic?.(); jarvisSay('', ['J.A.R.V.I.S.', 'LISTENING', 'TALK TO CLAUDE']); }
    };
    wake.onend = () => { if (wake) try { wake.start(); } catch { /* already restarting */ } };
    try { wake.start(); } catch { wake = null; return false; }
    jarvisSay('', ['J.A.R.V.I.S.', 'WAKE WORD ON', 'SAY "JARVIS" OR "CLAUDE"']);
    return true;
  }

  // ================================================================ THE PAGE (outside VR): library, deadlines, thesis download
  const hint = document.getElementById('hint');
  const box = document.createElement('details'); box.id = 'thesisSettings';
  box.innerHTML = `<summary><b>Library, deadlines and thesis</b></summary>
    <label>Add files to your library (PDFs, videos, photos of pages, .glb 3D models)<input id="libraryFiles" type="file" multiple accept=".pdf,video/*,image/*,.glb,.gltf"></label>
    <div id="libraryList"></div>
    <label>New deadline <input id="deadlineTitle" placeholder="e.g. First draft"></label>
    <input id="deadlineDate" type="date"> <button id="deadlineAdd">Add deadline</button>
    <div id="deadlineList"></div>
    <button id="thesisDownload">Download thesis (.txt)</button> <button id="thesisDownloadDoc">Download thesis (Word .doc)</button>
    <label>Sunnyvale speech language <select id="speechLanguage"><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option></select></label>
    <small>This controls Sunnyvale speech. Claude's own voice and response language are set separately in Claude.</small>
    <label><input id="rawCameraEnable" type="checkbox"> Allow real-camera Scan this VR session (where supported)</label>
    <div id="sessionSummary"></div>`;
  hint?.appendChild(box);
  const el = id => document.getElementById(id);
  el('speechLanguage').value = speechLanguage();
  el('speechLanguage').onchange = () => { localStorage.setItem('sunnyvale.speechLanguage', el('speechLanguage').value); if (wake) wake.lang = speechLanguage(); };
  for (const id of ['deadlineTitle']) el(id)?.addEventListener('keydown', e => e.stopPropagation());
  el('libraryFiles')?.addEventListener('change', e => addFiles([...e.target.files]).then(() => { e.target.value = ''; }));
  el('deadlineAdd')?.addEventListener('click', () => { try { addDeadline(el('deadlineTitle').value || 'Deadline', el('deadlineDate').value); el('deadlineTitle').value = ''; } catch (e) { alert(e.message); } });
  const download = (name, type, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  el('thesisDownload')?.addEventListener('click', () => download('thesis.txt', 'text/plain', thesisText()));
  el('thesisDownloadDoc')?.addEventListener('click', () => download('thesis.doc', 'application/msword',
    `<html><meta charset="utf-8"><body><h1>${escapeHTML(thesis.title)}</h1>${thesis.paras.map(p => p.heading ? `<h2>${escapeHTML(p.text)}</h2>` : `<p>${escapeHTML(p.text)}</p>`).join('')}<h2>Bibliography</h2>${store.sources().map(s => `<p>${escapeHTML(reference(s))}</p>`).join('')}</body></html>`));
  function escapeHTML(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
  function renderLibraryPage() {
    const list = el('libraryList'), dl = el('deadlineList');
    if (list) {
      list.innerHTML = '';
      for (const f of store.library()) {
        const row = document.createElement('div'); row.textContent = `${f.type.toUpperCase()}: ${f.name} (${Math.round(f.size / 1024)} KB) `;
        const del = document.createElement('button'); del.textContent = 'Remove'; del.onclick = () => removeFile(f.id); row.appendChild(del); list.appendChild(row);
      }
    }
    if (dl) { dl.innerHTML = ''; for (const d of upcoming()) { const row = document.createElement('div'); row.textContent = deadlineLine(d) + ' '; const del = document.createElement('button'); del.textContent = 'Remove'; del.onclick = () => removeDeadline(d.id); row.appendChild(del); dl.appendChild(row); } }
  }
  renderLibraryPage();
  const lastSession = store.sessions().slice(-1)[0];
  if (lastSession && el('sessionSummary')) el('sessionSummary').textContent = 'Last session: ' + summaryText(lastSession).replace(/\n+/g, ' ');

  // ================================================================ EXAM REHEARSAL (Claude plays your examiner)
  // Claude asks one question at a time out loud; the window shows the question, a countdown and what to improve.
  let exam = readJSON('sunnyvale.exam', null);
  const saveExam = () => writeJSON('sunnyvale.exam', exam);
  function examText() {
    if (!exam) return '';
    const left = Math.max(0, Math.round(exam.seconds - (Date.now() - exam.askedAt) / 1000));
    const lines = exam.finished
      ? ['FINISHED', '', exam.summary || '', '']
      : [`QUESTION ${exam.asked.length} · ${fmtTime(left)} LEFT${left === 0 ? '  (time is up)' : ''}`, '', exam.asked.at(-1)?.q || 'Claude is about to ask the first question.', ''];
    const tips = exam.asked.flatMap((a, i) => a.improve.map(t => `Q${i + 1}: ${t}`));
    if (tips.length) lines.push('TO IMPROVE', ...tips);
    return lines.join('\n');
  }
  function paintExam() {
    if (!exam) return null;
    let w = findWindow('exam');
    const title = exam.finished ? `Exam rehearsal: ${exam.topic}` : `Exam rehearsal: ${exam.topic}`;
    if (!w) { w = openWindow(title, examText()); w.userData.id = 'exam'; }
    else setWindowContent(w, title, examText(), { keepScroll: true });
    return w;
  }
  function startExam({ topic, minutes_per_question }) {
    exam = { topic: clampText(topic || 'My thesis', 120), seconds: Math.round(Math.max(0.5, Math.min(10, +minutes_per_question || 2)) * 60), asked: [], askedAt: Date.now(), started: Date.now() };
    saveExam(); const w = paintExam(); reveal(w); return w;
  }
  function askQuestion({ question, minutes }) {
    if (!exam || exam.finished) startExam({ topic: 'My thesis' });
    exam.asked.push({ q: clampText(question, 600), improve: [] });
    exam.askedAt = Date.now(); if (minutes) exam.seconds = Math.round(Math.max(0.5, Math.min(10, +minutes)) * 60);
    saveExam(); return paintExam();
  }
  function examFeedback({ improve, question }) {
    if (!exam?.asked.length) throw Error('Ask a question first with exam_question.');
    const k = question ? Math.max(1, Math.min(exam.asked.length, +question)) - 1 : exam.asked.length - 1;
    exam.asked[k].improve.push(clampText(improve, 400)); saveExam(); return paintExam();
  }
  function endExam({ summary }) {
    if (!exam) throw Error('No exam is running.');
    exam.finished = true; exam.summary = clampText(summary || `${exam.asked.length} questions in ${Math.round((Date.now() - exam.started) / 60000)} minutes.`, 1500);
    saveExam(); return paintExam();
  }
  let examTick = 0;
  function updateExam(dt) {
    if (!exam || exam.finished || !findWindow('exam')) return;
    if ((examTick += dt) < 1) return; examTick = 0;
    paintExam();
  }

  // ================================================================ COMMENTS BESIDE PARAGRAPHS (Claude's notes on your thesis)
  // Small cards next to the thesis window. Tap ACCEPT to use Claude's suggested wording (undo works), or DISMISS.
  const comments = () => readJSON('sunnyvale.thesis-comments', []);
  const setComments = v => { writeJSON('sunnyvale.thesis-comments', v); paintComments(); if (doc) paintThesis(); };
  // A paragraph may have moved since the comment was made: find it by its opening words, else by its number
  function commentPara(c) {
    const i = thesis.paras.findIndex(p => c.anchor && p.text.startsWith(c.anchor));
    return i >= 0 ? i : (thesis.paras[c.para] ? c.para : -1);
  }
  function commentParagraph({ index, comment, suggestion }) {
    const p = thesis.paras[+index];
    if (!p) throw Error('No paragraph ' + index + '. Use read_thesis to see the paragraph numbers (from 0).');
    const all = comments();
    all.push({ id: uid('c'), para: +index, anchor: p.text.slice(0, 40), comment: clampText(comment, 500), suggestion: suggestion ? clampText(suggestion, 20000) : '', added: Date.now() });
    if (!doc) openThesis();
    setComments(all);
    return all.at(-1);
  }
  let commentCards = [];
  function paintComments() {
    for (const c of commentCards) {
      c.parent?.remove(c);
      for (let i = touchables.length - 1; i >= 0; i--) if (touchables[i].mesh.parent === c || touchables[i].mesh === c) touchables.splice(i, 1);
      c.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    }
    commentCards = [];
    if (!doc) return;
    const all = comments().map(c => ({ ...c, at: commentPara(c) })).filter(c => c.at >= 0).sort((a, b) => a.at - b.at);
    const W = 0.36, H = 0.15;
    all.slice(0, 5).forEach((c, k) => {
      const card = new THREE.Group();
      const view = canvasPanel(W, H, 720, 300); card.add(view.mesh);
      const { g, canvas, tex } = view;
      frameBox(g, canvas.width, canvas.height, getMode() === 'stark');
      g.fillStyle = accent(); g.font = '700 30px "Segoe UI", system-ui, sans-serif'; g.fillText(`¶ ${c.at}${c.suggestion ? '  · new wording ready' : ''}`, 24, 44);
      g.fillStyle = ink(); g.font = '30px "Segoe UI", system-ui, sans-serif';
      wrap(g, c.comment, canvas.width - 48).slice(0, 6).forEach((l, i) => g.fillText(l, 24, 88 + i * 36));
      tex.needsUpdate = true;
      addButton(card, c.suggestion ? '✓ ACCEPT' : '✓ DONE', -0.08, -H / 2 - 0.028, 0.15, () => {
        const i = commentPara(c);
        if (c.suggestion && i >= 0) { snapshotThesis(); thesis.paras[i].text = c.suggestion; saveThesis(); }
        setComments(comments().filter(x => x.id !== c.id));
      }, { owner: doc.obj, h: 0.04 });
      addButton(card, '✕ DISMISS', 0.09, -H / 2 - 0.028, 0.15, () => setComments(comments().filter(x => x.id !== c.id)), { owner: doc.obj, h: 0.04 });
      card.position.set(0.56 + W / 2, 0.3 - k * (H + 0.07), 0.01);
      doc.obj.children[0].add(card);        // beside the page, moving with the thesis window
      commentCards.push(card);
    });
    if (all.length > 5) {
      const more = holoLabel(`+${all.length - 5} more comments`, { w: 0.3, h: 0.04 });
      more.position.set(0.56 + W / 2, 0.3 - 5 * (H + 0.07) + 0.04, 0.01);
      doc.obj.children[0].add(more); commentCards.push(more);
    }
  }

  // ================================================================ SHOT LOG (Claude fills in a shot table while you watch)
  const shotLogs = () => readJSON('sunnyvale.shot-logs', {});
  const shotKey = name => String(name || 'Untitled').trim();
  function shotLogText(film) {
    const shots = (shotLogs()[film] || []).slice().sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    if (!shots.length) return 'No shots logged yet. Ask Claude to log shots while the clip plays.';
    return shots.map((s, i) => `${String(i + 1).padStart(2, '0')}  ${s.time !== undefined ? fmtTime(s.time) : '--:--'}  ${[s.shot_type, s.angle, s.movement].filter(Boolean).join(' · ')}${s.notes ? '\n      ' + s.notes : ''}`).join('\n');
  }
  function openShotLog(film) {
    const id = 'shots-' + film.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    let w = findWindow(id);
    if (!w) { w = openWindow(`Shot log: ${film}`, shotLogText(film)); w.userData.id = id; }
    else setWindowContent(w, `Shot log: ${film}`, shotLogText(film), { keepScroll: true });
    return w;
  }
  function filmOf(video) {
    if (video) { const p = [...players.values()].find(x => x.obj.userData.id === video); return p ? p.title : String(video); }
    const playing = [...players.values()].find(x => !x.video.paused) || [...players.values()][0];
    return playing?.title || 'Untitled';
  }
  function logShot({ video, time, shot_type, angle, movement, notes, frame_id }) {
    const film = shotKey(filmOf(video));
    const player = [...players.values()].find(x => x.title === film);
    const logs = shotLogs();
    (logs[film] ||= []).push({ time: Number.isFinite(+time) ? +time : player?.video.currentTime, shot_type: clampText(shot_type, 40), angle: clampText(angle, 40),
      movement: clampText(movement, 40), notes: clampText(notes, 400), frame_id: frame_id || undefined });
    writeJSON('sunnyvale.shot-logs', logs);
    return openShotLog(film);
  }
  // Let Claude look at a frame grab (a small JPEG, sized for the headset connection)
  async function viewFrame({ id, frame_id }) {
    const f = id ? [...frames.values()].find(x => x.obj.userData.id === id) : null;
    const rec = f?.rec || (frame_id ? await DB.get('frames', frame_id) : null);
    if (!rec) throw Error('No frame like that. Use grab_frame first; it returns a frame_id.');
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = rec.image; });
    const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * img.height / img.width);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let q = 0.8, data = c.toDataURL('image/jpeg', q).split(',')[1];
    while (data.length > 42000 && q > 0.3) { q -= 0.1; data = c.toDataURL('image/jpeg', q).split(',')[1]; }
    return { image: data, text: JSON.stringify({ frame_id: rec.id, caption: rec.caption, film: rec.source, time: rec.time }) };
  }

  // ================================================================ PROPAGANDA CHECKLIST (the same questions for every scene)
  const CHECKLIST = [
    ['enemy', 'How is the enemy shown?'],
    ['music', 'What does the music do?'],
    ['military', 'Military cooperation in the credits?'],
    ['framing', 'Which heroic framing is used?'],
    ['message', 'What does the scene want you to feel or believe?'],
  ];
  const checklists = () => readJSON('sunnyvale.checklists', []);
  function checklistText(film) {
    const rows = checklists().filter(c => !film || c.film.toLowerCase() === film.toLowerCase());
    if (!rows.length) return 'No scenes checked yet. Ask Claude to fill in the checklist for a scene.\n\n' + CHECKLIST.map(([, q]) => '• ' + q).join('\n');
    return rows.map(c => `${c.film.toUpperCase()}: ${c.scene}${c.time !== undefined ? ' (' + fmtTime(c.time) + ')' : ''}\n` +
      CHECKLIST.map(([k, q]) => `  ${q} ${c.answers[k] || '—'}`).join('\n')).join('\n\n');
  }
  function openChecklist(film) {
    let w = findWindow('checklist');
    const title = film ? `Propaganda checklist: ${film}` : 'Propaganda checklist';
    if (!w) { w = openWindow(title, checklistText(film)); w.userData.id = 'checklist'; }
    else setWindowContent(w, title, checklistText(film), { keepScroll: true });
    return w;
  }
  function fillChecklist({ film, scene, time, answers }) {
    const all = checklists();
    const a = {}; for (const [k] of CHECKLIST) if (answers?.[k]) a[k] = clampText(answers[k], 600);
    const row = { film: clampText(film || filmOf(), 120), scene: clampText(scene, 200), time: Number.isFinite(+time) ? +time : undefined, answers: a, added: Date.now() };
    const same = all.findIndex(c => c.film === row.film && c.scene === row.scene);
    if (same >= 0) all[same] = { ...all[same], ...row, answers: { ...all[same].answers, ...a } }; else all.push(row);
    writeJSON('sunnyvale.checklists', all);
    return openChecklist(row.film);
  }

  // ================================================================ ARRANGE MY ROOM ("sources on the left, thesis in front")
  // [degrees to your left, distance in metres, height above eye level - 0.1]
  const PLACES = { front: [0, 1, 0], left: [72, 1.1, 0], right: [-72, 1.1, 0], 'far-left': [115, 1.15, 0], 'far-right': [-115, 1.15, 0],
    behind: [180, 1.3, 0], above: [0, 1.1, 0.45], below: [0, 0.7, -0.5], desk: [0, 0.6, -0.48] };
  function arrangeWindows({ layout }) {
    if (!Array.isArray(layout) || !layout.length) throw Error('Give a layout: a list of { id, place }.');
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    const eye = viewerPosition(v3()), fwd = cam.getWorldDirection(v3()); fwd.y = 0; fwd.normalize();
    const groups = {}, missing = [];
    for (const { id, place } of layout) {
      const p = findWindow(id); const where = PLACES[String(place).toLowerCase()];
      if (!p) { missing.push(id); continue; }
      if (!where) throw Error(`Unknown place "${place}". Use ${Object.keys(PLACES).join(', ')}.`);
      (groups[String(place).toLowerCase()] ||= []).push(p);
    }
    for (const [place, list] of Object.entries(groups)) {
      const [deg, dist, up] = PLACES[place];
      const dir = fwd.clone().applyAxisAngle(v3().set(0, 1, 0), deg * Math.PI / 180);
      const centre = eye.clone().addScaledVector(dir, dist); centre.y = eye.y - 0.1 + up;
      const side = v3().crossVectors(v3().set(0, 1, 0), dir).normalize().negate();      // to your right, seen from here
      const widths = list.map(p => (p.userData.size?.w || 0.8) * (p.userData.baseScale || 1));
      const total = widths.reduce((a, b) => a + b, 0) + 0.06 * (list.length - 1);
      let x = -total / 2;
      list.forEach((p, i) => {
        ctx.revealWindow?.(p);
        p.position.copy(centre).addScaledVector(side, x + widths[i] / 2); x += widths[i] + 0.06;
        p.userData.fly = p.userData.away = null;
        faceViewer(p);
        if (place === 'desk' || place === 'below') p.rotateX(-0.6);       // tilted up towards you, like a desk
        if (place === 'above') p.rotateX(0.35);
      });
    }
    markDirty();
    return { moved: layout.length - missing.length, missing };
  }

  // How to use the newer tools (list_study_tools shows this to Claude)
  const help = {
    start_exam: { description: 'Start an exam rehearsal: you play the examiner. Ask questions out loud one at a time with exam_question, listen to the answer, then add what to improve with exam_feedback. Finish with end_exam.', input: { topic: 'string', minutes_per_question: 'number, optional (default 2)' } },
    exam_question: { description: 'Show the next exam question (also ask it out loud) and restart the countdown.', input: { question: 'string', minutes: 'number, optional' } },
    exam_feedback: { description: 'Add one concrete thing to improve about the answer (to the current question, or question = its number from 1).', input: { improve: 'string', question: 'number, optional' } },
    end_exam: { description: 'Finish the rehearsal and show the summary plus the full list of things to improve.', input: { summary: 'string, optional' } },
    comment_paragraph: { description: 'Pin a comment card beside one thesis paragraph (number from 0, see read_thesis). Optionally include suggestion = full replacement wording; the user taps ACCEPT to use it or DISMISS.', input: { index: 'number', comment: 'string', suggestion: 'string, optional' } },
    list_comments: { description: 'List the open comment cards on the thesis.', input: {} },
    clear_comments: { description: 'Remove all comment cards from the thesis.', input: {} },
    log_shot: { description: 'Add a shot to the shot log of a video (the playing one if video is left out). time in seconds (default: where the video is now). Use view_frame to look at frame grabs first.', input: { video: 'window id, optional', time: 'number, optional', shot_type: 'e.g. Wide, Medium, Close-up, Extreme close-up, Insert', angle: 'e.g. Eye level, Low, High, Dutch, Bird\'s-eye', movement: 'e.g. Static, Pan, Tilt, Dolly, Handheld, Crane', notes: 'string, optional', frame_id: 'string, optional' } },
    open_shot_log: { description: 'Open the shot log window of a video or film.', input: { video: 'window id or film title, optional' } },
    list_shots: { description: 'List the logged shots of a film.', input: { video: 'window id or film title, optional' } },
    view_frame: { description: 'Look at a frame grab (returns the picture). Use the frame window id, or the frame_id from grab_frame.', input: { id: 'frame window id, optional', frame_id: 'string, optional' } },
    fill_checklist: { description: 'Fill in the propaganda checklist for one scene: enemy (how is the enemy shown?), music (what does the music do?), military (military cooperation in the credits?), framing (which heroic framing is used?), message (what does the scene want the viewer to feel or believe?). Calling again for the same film and scene updates it.', input: { film: 'string', scene: 'string', time: 'seconds, optional', answers: '{ enemy, music, military, framing, message } (strings, any can be left out)' } },
    open_checklist: { description: 'Open the propaganda checklist window (for one film, or all).', input: { film: 'string, optional' } },
    list_checklists: { description: 'List every checked scene with its answers.', input: {} },
    arrange_windows: { description: `Move windows around the user. layout = list of { id, place } with place one of: ${Object.keys(PLACES).join(', ')}. Windows sharing a place stand side by side. Ids come from list_windows.`, input: { layout: '[{ id, place }]' } },
  };

  // ================================================================ TOOLS (used by Claude through the connector)
  const ok = x => JSON.stringify({ ok: true, ...x });
  const tools = {
    list_library: () => JSON.stringify(store.library().map(f => ({ id: f.id, name: f.name, type: f.type }))),
    open_document: async ({ name, page }) => { const f = findFile(name); if (!f) throw Error('No file like that in the library. Ask the user to add it on the Sunnyvale page.'); const o = openFile(f, page ? { page } : {}); return ok({ id: o?.userData.id }); },
    read_document: async ({ id, from_page, to_page }) => { const r = await readerFor(id); return readPages(r, from_page || r.page, to_page || from_page || r.page); },
    go_to_page: async ({ id, page }) => { const r = await readerFor(id); await goToPage(r, page); return ok({ page: r.page, of: r.pages }); },
    highlight_passage: async ({ id, page, text, note }) => {
      const r = await readerFor(id); if (page && page !== r.page) await goToPage(r, page);
      const q = highlightText(r, r.page, text, note); if (!q) throw Error('Could not find that exact passage on page ' + r.page + '. Use read_document to copy the exact words.');
      return ok({ quote_id: q.id, citation: inText(sourceById(r.sourceId), r.page) });
    },
    add_quote: ({ text, source_id, page, note }) => ok({ id: addQuote({ text, sourceId: source_id, page, note }).id, open: !!openQuotesWindow() }),
    list_quotes: () => JSON.stringify(store.quotes().map(q => ({ ...q, citation: inText(sourceById(q.sourceId), q.page) }))),
    add_source: fields => { const s = addSource(fields); openSourcesWindow(); return ok({ id: s.id, reference: reference(s) }); },
    update_source: ({ id, ...fields }) => ok({ reference: reference(updateSource(id, fields)) }),
    list_sources: () => JSON.stringify(store.sources().map(s => ({ ...s, reference: reference(s) }))),
    set_citation_style: ({ style }) => { const st = ['Harvard', 'APA', 'MLA', 'Chicago'].find(x => x.toLowerCase() === String(style).toLowerCase()); if (!st) throw Error('Use Harvard, APA, MLA or Chicago.'); settings.style = st; saveSettings(); refreshSourcesWindow(); refreshQuotesWindow(); return ok({ style: st }); },
    cite: ({ source_id, page }) => { const s = sourceById(source_id); if (!s) throw Error('No source with that id.'); return ok({ in_text: inText(s, page), reference: reference(s) }); },
    open_quotes: () => ok({ id: openQuotesWindow().userData.id }),
    open_bibliography: () => ok({ id: openSourcesWindow().userData.id }),
    open_video: ({ name, url, time }) => { const f = name ? findFile(name) : null; if (!f && !url) throw Error('No video like that in the library.'); const o = f ? openFile(f, { time }) : createVideoPlayer({ url, title: url, time }); return ok({ id: o.userData.id }); },
    video_control: ({ id, action, value }) => {
      const p = playerFor(id);
      if (action === 'play') p.video.play().catch(() => {}); else if (action === 'pause') p.video.pause();
      else if (action === 'seek') seek(p, +value || 0); else if (action === 'speed') setRate(p, +value || 1);
      else throw Error('Use play, pause, seek (value = seconds) or speed (value = 0.25 to 2).');
      return ok({ time: p.video.currentTime });
    },
    pin_timestamp: ({ id, time, label }) => { const p = playerFor(id); addPin(p, time ?? p.video.currentTime, label || 'Pinned moment'); return ok({ pins: store.pins()[p.key] }); },
    list_pins: ({ id }) => JSON.stringify(store.pins()[playerFor(id).key] || []),
    grab_frame: async ({ id, caption }) => { const o = await grabFrame(playerFor(id)); const f = frames.get(o); if (caption && f) { f.rec.caption = caption; DB.put('frames', f.rec); relabel(f.caption, caption); } return ok({ id: o.userData.id, frame_id: f?.rec.id }); },
    annotate_frame: ({ id, caption }) => { const f = [...frames.values()].find(x => x.obj.userData.id === id); if (!f?.rec) throw Error('No frame with that id.'); f.rec.caption = clampText(caption, 200); DB.put('frames', f.rec); relabel(f.caption, f.rec.caption); return ok({}); },
    compare_videos: ({ first, second }) => { const p = playerFor(first); const f = findFile(second); if (!f) throw Error('No second video like that in the library.'); const q = compareWith(p, f); return ok({ id: q.obj.userData.id }); },
    read_thesis: () => JSON.stringify({ title: thesis.title, words: wordCount(), paragraphs: thesis.paras.map((p, i) => ({ index: i, heading: !!p.heading, text: p.text })) }),
    edit_thesis: input => ok(editThesis(input)),
    open_thesis: () => ok({ id: openThesis().userData.id }),
    export_thesis_to_google_docs: () => { exportThesis(); return ok({}); },
    add_deadline: ({ title, date }) => ok({ deadline: addDeadline(title, date) }),
    remove_deadline: ({ id }) => { removeDeadline(id); return ok({}); },
    list_deadlines: () => JSON.stringify(upcoming().map(d => ({ ...d, days_left: daysLeft(d.date) }))),
    write_session_summary: ({ done, next }) => { session.claude = { done: clampText(done, 1500), next: clampText(next, 1500) }; const all = store.sessions(); if (session.finished && all.length) { all[all.length - 1].claude = session.claude; store.setSessions(all); } refreshBriefing(); return ok({}); },
    show_briefing: () => ok({ id: briefing(false).userData.id }),
    point_at: ({ id, part }) => pointAt(id, part) && ok({}),
    what_user_is_looking_at: () => whatUserSees(),
    create_storyboard: ({ title, shots }) => ok({ id: createStoryboard(title, shots).userData.id }),
    make_presentation: ({ title, slides }) => ok({ id: createPresentation(title, slides).userData.id }),
    go_to_slide: ({ id, slide }) => { const p = findWindow(id); if (!p?.userData.go) throw Error('No presentation with that id.'); p.userData.go(slide); return ok({}); },
    add_counterargument: ({ claim, objection, response }) => ok({ id: addCounterargument(claim, objection, response).userData.id }),
    stash_window: ({ id }) => { const p = findWindow(id); if (!p) throw Error('No window with that id.'); stashWindow(p); return ok({}); },
    start_exam: input => ok({ id: startExam(input).userData.id }),
    exam_question: input => ok({ id: askQuestion(input).userData.id, question: exam.asked.length, seconds: exam.seconds }),
    exam_feedback: input => ok({ id: examFeedback(input).userData.id }),
    end_exam: input => ok({ id: endExam(input).userData.id, questions: exam.asked }),
    comment_paragraph: input => ok({ comment: commentParagraph(input).id, id: 'thesis' }),
    list_comments: () => JSON.stringify(comments().map(c => ({ ...c, paragraph: commentPara(c) }))),
    clear_comments: () => { setComments([]); return ok({}); },
    log_shot: input => ok({ id: logShot(input).userData.id }),
    open_shot_log: ({ video }) => ok({ id: openShotLog(shotKey(filmOf(video))).userData.id }),
    list_shots: ({ video }) => JSON.stringify(shotLogs()[shotKey(filmOf(video))] || []),
    view_frame: input => viewFrame(input),
    fill_checklist: input => ok({ id: fillChecklist(input).userData.id }),
    open_checklist: ({ film }) => ok({ id: openChecklist(film).userData.id }),
    list_checklists: () => JSON.stringify(checklists()),
    arrange_windows: input => ok(arrangeWindows(input)),
  };

  return {
    tools,
    help,
    avatar: { orb, state: orbState },          // for testing on the PC
    addFiles,
    update(dt) {
      updateOrb(dt); updateExam(dt); refreshStrip(); for (const p of players.values()) if (!p.video.paused) p.drawBar?.();
      const camera=renderer.xr.isPresenting ? rawCamera(renderer) : null;rawScanReady=!!camera;
      if(rawCapture){rawCapture=null;try{if(!camera)throw Error('Camera unavailable');saveScan(rawCameraImage(renderer,camera)).catch(()=>scanUnavailable());}catch{scanUnavailable();}}
    },
    onSessionStart: startSession,
    onSessionEnd: finishSession,
    onFocusComplete() { session.focusDone++; },
    wordCount,
    refreshBriefing,
    menu: { library: () => openLibraryPicker(), thesis: openThesis, quotes: openQuotesWindow, sources: openSourcesWindow, deadlines: openDeadlinesWindow,
      briefing: () => briefing(false), logOff, scan: openScanner, wake: toggleWakeWord, toggleStrip: () => { settings.strip = !settings.strip; saveSettings(); refreshStrip(true); } },
    repaint() { paintThesis(); refreshStrip(true); }
  };
}
