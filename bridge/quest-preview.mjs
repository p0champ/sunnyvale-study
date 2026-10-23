import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const modules = new Set(['spatial-experiences.js', 'spatial-tools.js', 'jarvis-layer.js', 'task-modes.js', 'index.html', 'backup.js', 'bridge-https.js', 'browser-bridge.js', 'browser-click-input.js', 'browser-media.js', 'browser-voice-link.js', 'lecture-player.js', 'logoff.js', 'scanner-camera.js', 'study-utils.js', 'texture-jobs.js', 'thesis-tools.js', 'bridge/chrome-extension/pcm-worklet.js']);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.hdr':'application/octet-stream','.ktx2':'image/ktx2'};

// Disabled by default. A temporary Quest preview exposes only frontend assets,
// behind an unguessable capability path. Never serve project/private folders.
export function createQuestPreview({ root, key, origin } = {}) {
  if (!root && !key && !origin) return null;
  if (!root || !/^[A-Za-z0-9_-]{32,64}$/.test(key || '')) throw Error('Invalid Quest preview configuration');
  let address;
  try { address = new URL(origin); } catch { throw Error('Invalid Quest preview origin'); }
  if (address.protocol !== 'https:' || address.username || address.password || address.origin !== origin) throw Error('Invalid Quest preview origin');
  const base = resolve(root), prefix = '/quest-test/' + key + '/';
  return { origin,
    async handle(req, res) {
      const path = String(req.url || '').split('?')[0];
      if (!path.startsWith('/quest-test')) return false;
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      const refuse = (code = 404) => { res.writeHead(code); res.end(); return true; };
      if (!path.startsWith(prefix)) return refuse();
      if (!['GET','HEAD'].includes(req.method)) return refuse(405);
      let name;
      try { name = decodeURIComponent(path.slice(prefix.length)) || 'index.html'; } catch { return refuse(); }
      if (name.includes('\\') || name.split('/').some(part => !part || part.startsWith('.'))) return refuse();
      const extension = extname(name).toLowerCase();
      if (!modules.has(name) && !(name.startsWith('assets/') && types[extension] && extension !== '.html' && extension !== '.js')) return refuse();
      try {
        const file = await realpath(resolve(base, name)), realBase = await realpath(base);
        if (!file.startsWith(realBase + sep)) return refuse();
        let data = await readFile(file);
        if (name === 'index.html') data = Buffer.from(data.toString('utf8').replace('<title>Sunnyvale Study</title>', '<title>Sunnyvale Study — Build A test</title>').replace('<b>Sunnyvale Study</b> (step 1: outside park)', '<b>Sunnyvale Study — Build A test</b><br><small>Temporary test desk. Your normal saved desk stays on the normal site.</small><br>(step 1: outside park)'));
        res.setHeader('Content-Type', types[extension]); res.setHeader('Content-Length', data.length);
        res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : data); return true;
      } catch { return refuse(); }
    }
  };
}
