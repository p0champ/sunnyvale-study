// Writes bridge/private/Claude connector setup.txt with the current connector address and secret,
// so the user can copy them into Claude's "Add custom connector" dialog. The file stays private.
// Usage: node make-connector-setup.mjs
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectionSettings } from './connection-settings.mjs';

try {
const { root, base, secret } = await connectionSettings();
const host = new URL(base).hostname;
const text = `SUNNYVALE CLAUDE CONNECTOR - PRIVATE, DO NOT SHARE
==================================================

In Claude (claude.ai): Settings / Customize > Connectors > + Add > Add custom connector

Name:
Sunnyvale Study

Remote MCP server URL (the password is built into this link, so keep it secret):
${base}/mcp/${secret}

Sign in: choose "No sign in" (no account login needed). No request header needed.

Then press Add. In a chat, turn it on from the "+" button (Connectors) and say
something like: "Make me flashcards about Kubrick in my study space".

${host.endsWith('.ts.net') ? `This address is permanent (Tailscale Funnel): it stays the same when the bridge restarts.
You only need to add the connector once.` : `Note: this address is temporary. If the bridge restarts, run make-connector-setup again,
remove the old connector in Claude and add it again with the new address.`}
`;
await writeFile(join(root, 'Claude connector setup.txt'), text.replace(/\r?\n/g, '\r\n'));
console.log('Written to bridge/private/Claude connector setup.txt');
} catch {
  console.error('Could not write connector setup. Check the private address and credential files; private details are withheld.');
  process.exitCode = 1;
}
