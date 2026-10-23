import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

test('full app XR select, fingertip jitter and DOM pointer produce one real browser click per action', {timeout:60000}, async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),bridgeRoot=fileURLToPath(new URL('./',import.meta.url));
  const privateRoot=await mkdtemp(join(tmpdir(),'sunnyvale-browser-input-'));
  const clicks=[],errors=[];
  const fixture=http.createServer(async(req,res)=>{
    if(req.url==='/report'){let body='';for await(const chunk of req)body+=chunk;clicks.push(JSON.parse(body));res.end('ok');return;}
    res.setHeader('Content-Type','text/html');
    res.end(`<body style="margin:0;height:3000px;background:#375"><script>addEventListener('click',e=>fetch('/report',{method:'POST',body:JSON.stringify({x:e.clientX,y:e.clientY})}));</script>`);
  });
  const app=http.createServer(async(req,res)=>{
    const filename=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
    if(!filename.startsWith(resolve(root)+sep)||/[\\/](?:private|\.git|node_modules)[\\/]/.test(filename)){res.writeHead(404).end();return;}
    try{const data=await readFile(filename);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(filename)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
  });
  let child,browser;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await pause(100);}throw Error('Input fixture timed out');};
  try{
    await new Promise(r=>fixture.listen(18196,'127.0.0.1',r));await new Promise(r=>app.listen(18123,'127.0.0.1',r));
    child=spawn(process.execPath,['server.mjs'],{cwd:bridgeRoot,windowsHide:true,stdio:'ignore',env:{...process.env,BRIDGE_PORT:'18195',BRIDGE_TUNNEL:'0',BRIDGE_PRIVATE_DIR:privateRoot,BRIDGE_BROWSER:'playwright'}});
    await until(async()=>{try{return(await fetch('http://127.0.0.1:18195/health')).ok;}catch{return false;}});
    const token=(await readFile(join(privateRoot,'pairing.txt'),'utf8')).trim();
    browser=await chromium.launch();const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**',r=>r.fulfill({path:join(bridgeRoot,'node_modules/three',r.request().url().split('three@0.169.0/')[1]),contentType:'text/javascript'}));
    await page.addInitScript(token=>{localStorage.setItem('bridgeURL','ws://127.0.0.1:18195/bridge');localStorage.setItem('bridgeToken',token);},token);
    await page.goto('http://127.0.0.1:18123/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.studyDebug?.browserBridge?.connected);
    await page.evaluate(()=>{studyDebug.renderer.setAnimationLoop(null);studyDebug.browserBridge.open('http://127.0.0.1:18196/');});
    await page.waitForFunction(()=>studyDebug.desk.findWindow('browser'));
    await page.evaluate(async()=>{
      const d=studyDebug,p=d.desk.findWindow('browser');p.position.set(0,1.6,0);p.quaternion.identity();p.scale.setScalar(1.8);d.scene.updateMatrixWorld(true);
      const center=p.localToWorld(p.position.clone().set(0,-.025,.006));
      window.testRay=d.renderer.xr.getController(0);testRay.position.copy(center);testRay.position.z+=1;testRay.quaternion.identity();testRay.updateMatrix();testRay.updateMatrixWorld(true);
      const original=d.browserBridge.beginSelect;d.browserBridge.beginSelect=source=>{window.testSource=source;return original(source);};
      d.renderer.xr.isPresenting=true;
    });
    await pause(300);
    await page.evaluate(()=>{testRay.dispatchEvent({type:'selectstart'});testRay.dispatchEvent({type:'selectstart'});testRay.dispatchEvent({type:'selectstart'});});
    await page.mouse.click(640,600);
    await until(()=>clicks.length===1);await pause(150);assert.equal(clicks.length,1,'Repeated native starts and synthetic DOM pointer are one click');assert.deepEqual(clicks[0],{x:640,y:400});
    await page.evaluate(()=>{
      testSource.hand.visible=true;const d=studyDebug,p=d.desk.findWindow('browser'),point=z=>p.localToWorld(p.position.clone().set(0,-.025,.006+z));
      for(const z of [0,.02,.01,.025,0])d.browserBridge.touch(point(z),testSource);
      testRay.dispatchEvent({type:'selectend'});
      for(const z of [.02,0,.025,0])d.browserBridge.touch(point(z),testSource);
      window.testPoint=point;
    });
    await pause(150);assert.equal(clicks.length,1,'Contact during pinch and depth jitter do not add clicks');
    await page.evaluate(()=>{studyDebug.browserBridge.touch(testPoint(.1),testSource);testRay.dispatchEvent({type:'selectstart'});testRay.dispatchEvent({type:'selectend'});});
    await until(()=>clicks.length===2);
    await page.evaluate(()=>{studyDebug.browserBridge.touch(testPoint(.1),testSource);studyDebug.browserBridge.touch(testPoint(0),testSource);studyDebug.browserBridge.touch(testPoint(.02),testSource);studyDebug.browserBridge.touch(testPoint(0),testSource);});
    await until(()=>clicks.length===3);await pause(150);assert.equal(clicks.length,3,'A separate direct tap remains one click');
    const quiet=await page.evaluate(()=>{
      const d=studyDebug;d.renderer.xr.isPresenting=false;d.worldTool('add_note',{text:'Final backup fixture 🧡'});
      const save=d.backup.backupNow;d.backup.backupNow=(...args)=>new Promise(r=>setTimeout(r,200)).then(()=>save(...args));
      window.logoutJob=d.thesis.menu.logOff();
      return {wanted:d.browserBridge.wanted,controlConnected:d.browserBridge.connected,hasBrowser:!!d.desk.findWindow('browser'),mic:d.browserBridge.microphoneState,canOpen:d.browserBridge.open('http://127.0.0.1:18196/')};
    });
    assert.deepEqual(quiet,{wanted:false,controlConnected:true,hasBrowser:false,mic:null,canOpen:false},'Media/windows stop before the bounded backup completes');
    assert.equal(await page.evaluate(()=>logoutJob),true);
    assert.equal(await page.evaluate(()=>studyDebug.browserBridge.wanted),false);
    assert.equal(await page.evaluate(()=>studyDebug.browserBridge.connected),false);
    assert.equal(await page.evaluate(()=>!!studyDebug.desk.findWindow('browser')),false);
    assert.ok((await fetch('http://127.0.0.1:18195/health')).ok,'Log off leaves the isolated PC bridge running');
    const lastBackup=JSON.parse(await readFile(join(privateRoot,'backups/study/latest.json'),'utf8'));
    assert.equal(lastBackup.app,'Sunnyvale Study');assert.ok(JSON.stringify(lastBackup.keys).includes('Final backup fixture'),'The final PC copy includes the latest desk changes');assert.ok(Object.keys(lastBackup.keys).length>0,'Log off writes a real final PC backup');
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();child?.kill();await new Promise(r=>setTimeout(r,250));app.close();fixture.close();
    assert.ok(resolve(privateRoot).startsWith(resolve(tmpdir())+sep));await rm(privateRoot,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
