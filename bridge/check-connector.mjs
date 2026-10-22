// Checks that Claude's connector is reachable from the internet, without printing any private values.
// Usage: node check-connector.mjs
import { connectionSettings } from './connection-settings.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

try {
const { base, secret } = await connectionSettings();
const url = new URL(base + '/mcp');

const bad = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
console.log('Without the secret:', bad.status === 401 ? 'refused (good)' : 'UNEXPECTED ' + bad.status);
if (bad.status !== 401) throw Error('Unexpected authorization response.');

const client = new Client({ name: 'connector-check', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: 'Bearer ' + secret } } }));
const { tools } = await client.listTools();
console.log('With the secret: connected,', tools.length, 'tools available');
await client.close();

const linkClient = new Client({ name: 'connector-check', version: '1.0.0' });
await linkClient.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${secret}`)));
console.log('One-link version: connected,', (await linkClient.listTools()).tools.length, 'tools available');
await linkClient.close();
} catch {
  // SDK/network errors can contain the entire credential-bearing URL.
  console.error('Connector check failed. Check bridge health, Funnel and the current private connector settings. Private addresses and credentials are withheld.');
  process.exitCode = 1;
}
