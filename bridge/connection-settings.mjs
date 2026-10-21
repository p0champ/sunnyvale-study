import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const privateDirectory = () => process.env.BRIDGE_PRIVATE_DIR || fileURLToPath(new URL('./private/', import.meta.url));

// The permanent address is authoritative; an old shortcut must not send the
// connector checker or setup instructions back to an expired quick tunnel.
export async function connectionSettings(root = privateDirectory()) {
  let address = (await readFile(join(root, 'public-address.txt'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw Error('Could not read the private public-address setting.');
  })).trim();
  if (!address) {
    const shortcut = await readFile(join(root, 'Open Sunnyvale.url'), 'utf8').catch(() => '');
    try {
      const line = shortcut.match(/^URL=(.+)$/m)?.[1]?.trim();
      const bridge = line && new URLSearchParams(new URL(line).hash.slice(1)).get('bridge');
      const url = new URL(bridge);
      if (url.protocol !== 'wss:' || url.pathname !== '/bridge' || url.username || url.password || url.search || url.hash) throw Error();
      address = 'https://' + url.host;
    } catch { throw Error('No valid secure bridge address found. Check the private setup files.'); }
  }
  let base;
  try {
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error();
    base = url.origin;
  } catch { throw Error('The private public-address setting must contain only a secure base address.'); }
  const secret = (await readFile(join(root, 'connector.txt'), 'utf8').catch(() => '')).trim();
  if (!/^[A-Za-z0-9_-]{24,}$/.test(secret)) throw Error('The private connector credential is missing or invalid.');
  return { root, base, secret };
}
