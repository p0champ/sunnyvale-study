import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createQuestPreview} from './quest-preview.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {WebSocket} from 'ws';
import {once} from 'node:events';
test('optional Quest preview serves only capability-protected frontend files', async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),key='fixture_preview_capability_1234567890';
 assert.equal(createQuestPreview(),null);assert.throws(()=>createQuestPreview({root,key,origin:'http://example.invalid'}));
 const preview=createQuestPreview({root,key,origin:'https://example.invalid'});
 const server=http.createServer(async(req,res)=>{if(!await preview.handle(req,res))res.writeHead(404).end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/quest-test/${key}/`;
 try {
  const html=await fetch(base);assert.equal(html.status,200);assert.match(await html.text(),/Build A test/);assert.equal(html.headers.get('referrer-policy'),'no-referrer');assert.equal(html.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'browser-media.js?v=fixture')).status,200);
  assert.equal((await fetch(base+'logoff.js')).status,200);
  assert.equal((await fetch(base+'bridge/chrome-extension/pcm-worklet.js')).status,200);
  assert.equal((await fetch(base+'assets/textures/sparse_grass/Diffuse.jpg')).status,200);
  for(const file of ['bridge/server.mjs','bridge/private/pairing.txt','bridge/package.json','.git/config','HANDOVER.md','%2e%2e%2findex.html','assets/%2e%2e%2fbridge/private/pairing.txt','index.html%00','..%5cindex.html'])assert.equal((await fetch(base+file)).status,404,file);
  assert.equal((await fetch(base.replace(key,'wrong-key'))).status,404);
  assert.equal((await fetch(base,{method:'POST'})).status,405);
 }finally{await new Promise(r=>server.close(r));}
});

test('temporary bridge serves the preview and accepts only its configured HTTPS origin', {timeout:15000},async()=>{
 const privateRoot=await mkdtemp(join(tmpdir(),'sunnyvale-quest-preview-'));
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const bridgeRoot=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../',import.meta.url)),key='fixture_preview_capability_1234567890',origin='https://example.invalid';
 let child,socket;
 try {
  child=spawn(process.execPath,['server.mjs'],{cwd:bridgeRoot,windowsHide:true,stdio:'ignore',env:{...process.env,BRIDGE_PORT:String(port),BRIDGE_PRIVATE_DIR:privateRoot,BRIDGE_TUNNEL:'0',QUEST_PREVIEW_DIR:root,QUEST_PREVIEW_KEY:key,QUEST_PREVIEW_ORIGIN:origin}});
  let healthy=false;for(let i=0;i<100;i++){try{healthy=(await fetch(`http://127.0.0.1:${port}/health`)).ok;}catch{}if(healthy)break;await new Promise(r=>setTimeout(r,40));}assert.ok(healthy);
  const response=await fetch(`http://127.0.0.1:${port}/quest-test/${key}/`);assert.equal(response.status,200);assert.match(await response.text(),/Build A test/);
  const token=(await readFile(join(privateRoot,'pairing.txt'),'utf8')).trim();
  for(const blocked of ['https://p0champ.github.io','https://another.invalid']) {
    const rejected = new WebSocket(`ws://127.0.0.1:${port}/bridge`,{origin:blocked});
    await new Promise(r=>{rejected.on('error',()=>{});rejected.on('close',r);});
    assert.equal(rejected.readyState,WebSocket.CLOSED);
  }
  socket=new WebSocket(`ws://127.0.0.1:${port}/bridge`,{origin});await once(socket,'open');const ready=once(socket,'message');socket.send(JSON.stringify({type:'pair',token,audioProtocol:1}));assert.equal(JSON.parse((await ready)[0]).type,'ready');
 } finally {socket?.terminate();child?.kill();await new Promise(r=>setTimeout(r,250));assert.ok(resolve(privateRoot).startsWith(resolve(tmpdir())+sep));await rm(privateRoot,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
