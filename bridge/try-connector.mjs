// Manual check of the Claude connector, acting like Claude would.
// Usage: node try-connector.mjs <bridge-url> <path-to-connector-secret-file>
// Example (test bridge): node try-connector.mjs http://127.0.0.1:8139/mcp ../some/test/connector.txt
// Sunnyvale must be open and paired to that bridge first.
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const [url, secretFile] = process.argv.slice(2);
const secret = (await readFile(secretFile, 'utf8')).trim();
const client = new Client({ name: 'connector-check', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: 'Bearer ' + secret } } }));

const { tools } = await client.listTools();
console.log('tools:', tools.map(t => t.name).join(', '));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const out = r.content.map(c => c.type === 'text' ? c.text : `[${c.type} ${c.mimeType || ''} ${(c.data || '').length} chars]`).join(' | ');
  console.log(`${name}${r.isError ? ' (ERROR)' : ''}: ${out.slice(0, 300)}`);
  return r;
};
await call('open_window', { title: 'Hello from Claude', body: 'This window was opened by the Claude connector.' });
await call('create_mind_map', { title: 'Kubrick', branches: [{ label: 'Style', children: ['Symmetry', 'One-point perspective'] }, { label: 'Films', children: ['2001', 'The Shining'] }] });
await call('add_note', { text: 'Connector test note' });
await call('show_message', { lines: ['CONNECTOR ONLINE', 'CLAUDE IS IN THE WORLD'] });
await call('list_windows');
const opened = await call('open_browser_window', { url: process.argv[4] || 'http://localhost:8123/CREDITS.md' });
const id = JSON.parse(opened.content[0].text || '{}').id;
if (id) {
  await new Promise(r => setTimeout(r, 2500));
  await call('list_browser_windows');
  await call('screenshot_browser_window', { id });
  await call('scroll_browser_window', { id, amount: 400 });
  await call('click_browser_window', { id, x: 200, y: 200 });
}
await client.close();
