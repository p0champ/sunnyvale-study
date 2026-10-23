import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

test('final backup waits for an active upload, saves the latest state, and aborts before sending later chunks', {timeout:15000},async()=>{
 const source=await readFile(new URL('../backup.js',import.meta.url));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/backup.js'?'text/javascript':'text/html');res.end(req.url==='/backup.js'?source:'<div id="hint"></div>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try {
  browser=await chromium.launch();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
   const {installBackup}=await import('/backup.js');let transfer=0,blockEnd=true,release,endWaiting=false,blockBegin=false,beginWaiting=false;
   const calls=[],uploads=new Map(),saved=[];
   const bridge={isReady:()=>true,voiceActive:()=>false,async call(type,payload){
    calls.push(type);
    if(type==='backup-info')return {library:[],frames:[],maxFile:1000,where:'this PC'};
    if(type==='backup-begin'){if(blockBegin){beginWaiting=true;await new Promise(r=>release=r);}const id=String(++transfer);uploads.set(id,[]);return {transfer:id};}
    if(type==='backup-part'){uploads.get(payload.transfer).push(Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0)));return {};}
    if(type==='backup-end'){if(blockEnd){endWaiting=true;await new Promise(r=>release=r);blockEnd=false;}const bytes=await new Blob(uploads.get(payload.transfer)).arrayBuffer();saved.push(JSON.parse(new TextDecoder().decode(bytes)));return {};}
   }};
   const backup=installBackup({bridge:()=>bridge,jarvisSay:()=>{}});
   localStorage.setItem('sunnyvale.thesis','Before the last edit');const automatic=backup.backupNow('auto');
   while(!endWaiting)await new Promise(r=>setTimeout(r,5));
   localStorage.setItem('sunnyvale.thesis','Final edit 🧡');const final=backup.backupNow('logoff');
   const startedBeforeRelease=transfer;release();await automatic;const complete=await final;
   const latest=saved.at(-1).keys['sunnyvale.thesis'];
   const controller=new AbortController();blockBegin=true;const before=calls.length;const cancelled=backup.backupNow('logoff',{signal:controller.signal});
   while(!beginWaiting)await new Promise(r=>setTimeout(r,5));controller.abort();release();
   return {startedBeforeRelease,complete,latest,saved:saved.length,cancelled:await cancelled,cancelledCalls:calls.slice(before)};
  });
  assert.deepEqual(result,{startedBeforeRelease:1,complete:true,latest:'Final edit 🧡',saved:2,cancelled:false,cancelledCalls:['backup-info','backup-begin']});
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
