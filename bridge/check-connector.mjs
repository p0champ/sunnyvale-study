// Checks that Claude's connector is reachable from the internet, without printing any private values.
// Usage: node check-connector.mjs
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const shortcut = await readFile(new URL('./private/Open Sunnyvale.url', import.meta.url), 'utf8');
const host = decodeURIComponent(shortcut).match(/wss:\/\/([a-z0-9-]+\.trycloudflare\.com)/)?.[1];
if (!host) { console.log('No tunnel address found yet. Is the bridge window open?'); process.exit(1); }
const secret = (await readFile(new URL('./private/connector.txt', import.meta.url), 'utf8')).trim();
const url = new URL(`https://${host}/mcp`);

const bad = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
console.log('Without the secret:', bad.status === 401 ? 'refused (good)' : 'UNEXPECTED ' + bad.status);

const client = new Client({ name: 'connector-check', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: 'Bearer ' + secret } } }));
const { tools } = await client.listTools();
console.log('With the secret: connected,', tools.length, 'tools available');
await client.close();

const linkClient = new Client({ name: 'connector-check', version: '1.0.0' });
await linkClient.connect(new StreamableHTTPClientTransport(new URL(`https://${host}/mcp/${secret}`)));
console.log('One-link version: connected,', (await linkClient.listTools()).tools.length, 'tools available');
await linkClient.close();
