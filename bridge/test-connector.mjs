import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createConnector} from './connector.mjs';
test('authenticated MCP tool annotations distinguish local additive tools, reads and actual destructive/browser operations',async()=>{
 const secret=randomBytes(32).toString('base64url'), calls=[];
 const handler=createConnector({secret,getConnection:()=>({world:async(name,input)=>{calls.push(name);return JSON.stringify({ok:true});}})});
 const server=http.createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/mcp';const client=new Client({name:'fixture',version:'1'});
 try{
  assert.equal((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  await client.connect(new StreamableHTTPClientTransport(new URL(base),{requestInit:{headers:{Authorization:'Bearer '+secret}}}));
  const {tools}=await client.listTools();const tool=name=>tools.find(t=>t.name===name);
  assert.equal(tool('list_windows').annotations.readOnlyHint,true);
  assert.equal(tool('what_user_is_looking_at').annotations.openWorldHint,true);
  assert.equal(tool('add_note').annotations.destructiveHint,false);
  assert.equal(tool('clear_desk').annotations.destructiveHint,false);
  assert.equal(tool('point_at').annotations.idempotentHint,true);
  assert.equal(tool('close_window').annotations.idempotentHint,true);
  assert.equal(tool('close_window').annotations.destructiveHint,true,'Closing an unsaved text window can remove its content');
  assert.equal(tool('type_in_browser_window').annotations.openWorldHint,true);
  assert.equal(tool('type_in_browser_window').annotations.destructiveHint,true);
  await client.callTool({name:'clear_desk',arguments:{}});assert.deepEqual(calls,['clear_desk']);
 }finally{await client.close();server.close();}
});
