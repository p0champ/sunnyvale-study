// Backups of the user's study work (thesis, quotes, sources, deadlines, layouts... and library files) into
// Google Drive on the PC, so nothing is lost if the Quest or its browser data goes. The Sunnyvale page sends
// the data over the paired headset connection in small pieces (messages must stay under about 60 KB);
// Google Drive for desktop then uploads the folder. Without Google Drive, backups go to bridge/private/backups.
//
// Folder layout:  Sunnyvale Backup/
//   study/latest.json, study/2026-10-21_13-45.json ...   everything from the browser's storage, with dated copies
//   library/<id>.bin + <id>.json                          each library file once (PDFs, videos, images, models)
//   frames/<id>.json                                       frame grabs
//   bridge-keys/                                           the bridge's private codes (pairing, connector, address)
import { appendFile, copyFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PIECE = 45000;                 // characters of base64 per message, both ways
const MAX_FILE = 400 * 1024 * 1024;  // library files bigger than this are not backed up

// Google Drive for desktop shows "My Drive" either as a drive letter (G:\My Drive) or as a folder in your user folder
export function findGoogleDrive() {
  for (const letter of 'GHIJKLMNOPQRSTUVWXYZDEF') {
    const p = `${letter}:\\My Drive`;
    if (existsSync(p)) return p;
  }
  for (const p of [join(homedir(), 'My Drive'), join(homedir(), 'Google Drive', 'My Drive'), join(homedir(), 'Google Drive')]) if (existsSync(p)) return p;
  return null;
}

const safeId = id => (/^[A-Za-z0-9_-]{1,64}$/.test(String(id)) ? String(id) : '');
const stamp = (d = new Date()) => d.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');

export function createBackup({ root }) {
  // Only the real bridge uses Google Drive; test bridges (their own private folder) keep backups beside it
  const drive = process.env.BRIDGE_BACKUP_DIR || process.env.BRIDGE_PRIVATE_DIR ? null : findGoogleDrive();
  const folder = process.env.BRIDGE_BACKUP_DIR || (drive ? join(drive, 'Sunnyvale Backup') : join(root, 'backups'));
  const where = drive ? 'Google Drive' : 'this PC only (install Google Drive for desktop to back up to the cloud)';
  const dirs = ['study', 'library', 'frames', 'bridge-keys', 'incoming'].map(d => join(folder, d));
  const ready = Promise.all(dirs.map(d => mkdir(d, { recursive: true })))
    .then(() => readdir(join(folder, 'incoming'))).then(files => Promise.all(files.map(f => rm(join(folder, 'incoming', f)).catch(() => {}))));

  // The bridge's own private codes, so a new PC can be paired the same way (they stay in your own Google Drive)
  async function saveKeys() {
    await ready;
    for (const name of ['pairing.txt', 'connector.txt', 'public-address.txt']) {
      if (existsSync(join(root, name))) await copyFile(join(root, name), join(folder, 'bridge-keys', name)).catch(() => {});
    }
  }

  // Keep every copy from the last 2 days, then one per day for 60 days
  async function prune() {
    const dir = join(folder, 'study');
    const files = (await readdir(dir)).filter(f => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
    const now = Date.now(), keptDays = new Set();
    for (const f of files) {
      const t = Date.parse(f.slice(0, 10) + 'T' + f.slice(11, 16).replace('-', ':') + 'Z');
      if (now - t < 2 * 86400000) continue;
      const day = f.slice(0, 10);
      if (now - t < 60 * 86400000 && !keptDays.has(day)) { keptDays.add(day); continue; }
      await rm(join(dir, f)).catch(() => {});
    }
  }

  const uploads = new Map();   // transfer id -> { kind, id, meta, temp, next, bytes, limit, seen }
  // Uploads that stop half way (the headset went to sleep) are removed after 10 minutes
  setInterval(() => {
    for (const [t, u] of uploads) if (Date.now() - u.seen > 10 * 60000) { uploads.delete(t); rm(u.temp).catch(() => {}); }
  }, 60000).unref();
  async function handle(m, reply) {
    await ready;
    try { return await answer(m, reply); }
    catch (e) { throw Error(e.code === 'ENOENT' ? 'That is not in the backup.' : e.code ? 'Could not read or write the local backup.' : e.message); }   // no local paths in replies
  }
  async function answer(m, reply) {
    if (m.type === 'backup-info') {
      const library = (await readdir(join(folder, 'library'))).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
      const frames = (await readdir(join(folder, 'frames'))).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
      const latest = await stat(join(folder, 'study', 'latest.json')).then(s => s.mtimeMs).catch(() => 0);
      return reply({ where, library, frames, latest, piece: PIECE, maxFile: MAX_FILE });
    }
    if (m.type === 'backup-begin') {
      const kind = ['study', 'library', 'frame'].includes(m.kind) ? m.kind : null;
      if (!kind) throw Error('Unknown backup kind.');
      if (kind !== 'study' && !safeId(m.id)) throw Error('Missing or unusual id.');
      const limit = kind === 'library' ? Number(m.size) : 50 * 1024 * 1024;     // study data and frames: at most 50 MB
      if (!(limit >= 0 && limit <= MAX_FILE)) throw Error('That file is too big to back up.');
      const transfer = Math.random().toString(36).slice(2, 10);
      const temp = join(folder, 'incoming', transfer + '.part');
      await writeFile(temp, '');
      uploads.set(transfer, { kind, id: safeId(m.id), meta: m.meta || {}, temp, next: 0, bytes: 0, limit, seen: Date.now() });
      return reply({ transfer });
    }
    if (m.type === 'backup-part') {
      const u = uploads.get(m.transfer);
      if (!u || m.n !== u.next || typeof m.data !== 'string' || m.data.length > PIECE) throw Error('Backup piece out of order.');
      // Every piece is base64 of the item's bytes (text is sent as UTF-8 bytes, so no character is ever split)
      const bytes = Buffer.from(m.data, 'base64');
      if (bytes.toString('base64') !== m.data) throw Error('Backup piece is not valid base64.');
      if (u.bytes + bytes.length > u.limit) { uploads.delete(m.transfer); await rm(u.temp).catch(() => {}); throw Error('Backup is bigger than announced.'); }
      u.next++; u.bytes += bytes.length; u.seen = Date.now();
      await appendFile(u.temp, bytes);
      return reply({});
    }
    if (m.type === 'backup-end') {
      const u = uploads.get(m.transfer); if (!u) throw Error('Unknown backup.');
      uploads.delete(m.transfer);
      if (u.kind === 'library' && u.bytes !== u.limit) { await rm(u.temp).catch(() => {}); throw Error('Backup is incomplete. Please retry this file.'); }
      if (u.kind === 'study') {
        JSON.parse(await readFile(u.temp, 'utf8'));                        // only keep complete, valid backups
        await copyFile(u.temp, join(folder, 'study', stamp() + '.json'));
        await rename(u.temp, join(folder, 'study', 'latest.json'));
        prune().catch(() => {});
      } else if (u.kind === 'library') {
        await rename(u.temp, join(folder, 'library', u.id + '.bin'));
        await writeFile(join(folder, 'library', u.id + '.json'), JSON.stringify(u.meta));
      } else {
        JSON.parse(await readFile(u.temp, 'utf8'));
        await rename(u.temp, join(folder, 'frames', u.id + '.json'));
      }
      return reply({ saved: true, where });
    }
    // Restoring: the page asks for a piece of a backed-up item at a time
    if (m.type === 'restore-part') {
      const kind = m.kind, id = safeId(m.id);
      if (!['study', 'library', 'frame'].includes(kind)) throw Error('Unknown backup kind.');
      if (!Number.isSafeInteger(m.n) || m.n < 0) throw Error('Invalid backup piece number.');
      const file = kind === 'study' ? join(folder, 'study', 'latest.json') : kind === 'library' ? join(folder, 'library', id + '.bin') : join(folder, 'frames', id + '.json');
      const meta = kind === 'library' ? JSON.parse(await readFile(join(folder, 'library', id + '.json'), 'utf8').catch(() => '{}')) : undefined;
      if (kind !== 'study' && !id) throw Error('Missing or unusual id.');
      const n = Math.max(0, m.n | 0);
      // Read just this piece of the stored bytes (videos can be big)
      const bytes = PIECE / 4 * 3, size = (await stat(file)).size, buf = Buffer.alloc(Math.max(0, Math.min(bytes, size - n * bytes)));
      const fh = await open(file, 'r'); try { await fh.read(buf, 0, buf.length, n * bytes); } finally { await fh.close(); }
      return reply({ data: buf.toString('base64'), n, total: Math.ceil(size / bytes) || 1, meta });
    }
    throw Error('Unknown backup request.');
  }
  return { folder, where, handle, saveKeys };
}
