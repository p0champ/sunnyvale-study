// Writes bridge/private/Claude connector setup.txt with the current connector address and secret,
// so the user can copy them into Claude's "Add custom connector" dialog. The file stays private.
// Usage: node make-connector-setup.mjs
import { readFile, writeFile } from 'node:fs/promises';

const shortcut = await readFile(new URL('./private/Open Sunnyvale.url', import.meta.url), 'utf8');
const host = decodeURIComponent(shortcut).match(/wss:\/\/([a-z0-9-]+\.trycloudflare\.com)/)?.[1];
if (!host) { console.log('No tunnel address found yet. Is the bridge window open?'); process.exit(1); }
const secret = (await readFile(new URL('./private/connector.txt', import.meta.url), 'utf8')).trim();
const text = `SUNNYVALE CLAUDE CONNECTOR - PRIVATE, DO NOT SHARE
==================================================

In Claude (claude.ai): Settings / Customize > Connectors > + Add > Add custom connector

Name:
Sunnyvale Study

Remote MCP server URL (the password is built into this link, so keep it secret):
https://${host}/mcp/${secret}

Sign in: choose "No sign in" (no account login needed). No request header needed.

Then press Add. In a chat, turn it on from the "+" button (Connectors) and say
something like: "Make me flashcards about Kubrick in my study space".

Note: this address is temporary. If the bridge restarts, run make-connector-setup again,
remove the old connector in Claude and add it again with the new address.
`;
await writeFile(new URL('./private/Claude connector setup.txt', import.meta.url), text.replace(/\n/g, '\r\n'));
console.log('Written to bridge/private/Claude connector setup.txt');
