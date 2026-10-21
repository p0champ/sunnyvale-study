// Manual check of the thesis tools through the Claude connector, acting like Claude would.
// Usage: node try-connector-thesis.mjs <bridge-url> <path-to-connector-secret-file>
// Sunnyvale must be open and paired to that bridge first.
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const [url, secretFile] = process.argv.slice(2);
const secret = (await readFile(secretFile, 'utf8')).trim();
const client = new Client({ name: 'connector-check', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: 'Bearer ' + secret } } }));
const { tools } = await client.listTools();
console.log(tools.length, 'tools');
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`${name}${r.isError ? ' (ERROR)' : ''}: ${r.content.map(c => c.type === 'text' ? c.text : `[${c.type} ${(c.data || '').length} chars]`).join(' | ').slice(0, 220)}`);
  return r;
};
await call('list_library');
await call('add_note', { text: 'A long note '.repeat(60) });
await call('add_deadline', { title: 'Connector test deadline', date: '2026-12-01' });
await call('edit_thesis', { action: 'append', text: 'Added through the connector.' });
await call('read_thesis');
await call('add_counterargument', { claim: 'Test claim', objection: 'Test objection' });
await call('what_user_is_looking_at');
await call('use_study_tool', { name: 'list_deadlines', input: {} });
await call('list_study_tools');
const w = await call('list_windows');
const first = JSON.parse(w.content[0].text).find(x => x.id);
if (first) { await call('point_at', { id: first.id }); await call('stash_window', { id: first.id }); }
await client.close();
