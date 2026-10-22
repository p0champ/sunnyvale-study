import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
test('Build A: slide images, whole-deck speech, stash deletion, HUD and log off in the actual app', {timeout:60000},async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)), out=resolve(root,'../evidence');await mkdir(out,{recursive:true});
 const server=http.createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(resolve(root)+sep)||/[\\/](private|\.git)[\\/]/.test(path))return res.writeHead(404).end();
  try{let data=await readFile(path);if(path.endsWith('index.html'))data=data.toString().replace('window.studyDebug.desk =','window.studyDebug.qa = {touchables, hudMessage, closeWindow, panels, groupGlowFor:glowFor}; window.studyDebug.desk =');res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.jpg':'image/jpeg','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
 });
 let browser;
 try{
  await new Promise(r=>server.listen(18123,'127.0.0.1',r));browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**',r=>r.fulfill({path:resolve(root,'bridge/node_modules/three',r.request().url().split('three@0.169.0/')[1]),contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:18123/');await page.waitForFunction(()=>window.studyDebug?.thesis);
  const data=await page.evaluate(async()=>{
   const d=studyDebug;d.renderer.setAnimationLoop(null);d.setMode('stark');
   for(const p of [...d.qa.panels])d.qa.closeWindow(p);
   const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d');g.fillStyle='#32556c';g.fillRect(0,0,800,500);g.fillStyle='#edc095';g.fillRect(70,130,180,250);g.fillStyle='#151e28';g.fillRect(320,180,360,200);g.fillStyle='white';g.font='36px sans-serif';g.fillText('SYNTHETIC FILM FRAME',90,80);
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sunnyvale-library',1);r.onupgradeneeded=()=>{r.result.createObjectStore('files',{keyPath:'id'});r.result.createObjectStore('frames',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
   const blob=await new Promise(r=>c.toBlob(r));
   await new Promise(r=>{const t=db.transaction(['frames','files'],'readwrite');t.objectStore('frames').put({id:'fixture-frame',image:c.toDataURL()});t.objectStore('files').put({id:'fixture-image',blob});t.oncomplete=r;});
   const id=JSON.parse(await d.worldTool('make_presentation',{title:'Framing and power',slides:[{title:'Who fills the frame?',bullets:['The foreground directs our attention.','Look at scale and position.'],frame_id:'fixture-frame'},{title:'Compare the counter-reading',bullets:['Who is left outside the image?'],image_id:'fixture-image'}]})).id;
   const p=d.desk.findWindow(id);p.position.set(0,1.6,-2);p.quaternion.identity();p.scale.setScalar(1);p.userData.popIn=1;d.look(0,1.6,0,0,1.6,-2);window.fixtureSlide=p;
   await d.worldTool('show_message',{lines:['Read this message at your own pace'],seconds:12});
   return {id,hold:d.qa.hudMessage.hold};
  });assert.equal(data.hold,12);
  await page.waitForTimeout(250);await page.evaluate(()=>studyDebug.renderer.render(studyDebug.scene,studyDebug.camera));
  await page.screenshot({path:resolve(out,'slides-front.png')});
  await page.evaluate(()=>{studyDebug.look(.65,1.8,.2,0,1.6,-2);studyDebug.renderer.render(studyDebug.scene,studyDebug.camera);});await page.screenshot({path:resolve(out,'slides-side.png')});
  await page.evaluate(async()=>{fixtureSlide.userData.go(1);await new Promise(r=>setTimeout(r,100));studyDebug.look(0,1.6,0,0,1.6,-2);studyDebug.renderer.render(studyDebug.scene,studyDebug.camera);});await page.screenshot({path:resolve(out,'slides-library.png')});
  for(const mood of ['waiting','listening','working','speaking']) {
   assert.equal(await page.evaluate(mood=>{const d=studyDebug;d.thesis.avatar.state.force={[mood]:true,level:.7};for(let i=0;i<60;i++)d.thesis.update(1/60);return d.thesis.avatar.state.mood;},mood),mood);
   for(const side of ['front','side']) {
    await page.evaluate(side=>{const d=studyDebug,p=d.thesis.avatar.orb.position;d.look(p.x+(side==='side'?.15:0),p.y,p.z+.35,p.x,p.y,p.z);d.renderer.render(d.scene,d.camera);},side);
    await page.screenshot({path:resolve(out,'orb-'+mood+'-'+side+'.png')});
   }
  }
  await page.evaluate(()=>{const d=studyDebug;const glow=d.qa.groupGlowFor(fixtureSlide);glow.userData.want=1;d.gestures.updateGroupLook(.25);d.look(0,1.6,0,0,1.6,-2);d.renderer.render(d.scene,d.camera);});
  await page.screenshot({path:resolve(out,'fist-front.png')});
  await page.evaluate(()=>{const d=studyDebug;d.look(.65,1.8,.2,0,1.6,-2);d.renderer.render(d.scene,d.camera);});
  await page.screenshot({path:resolve(out,'fist-side.png')});
  const dense=await page.evaluate(async()=>{try{await studyDebug.worldTool('make_presentation',{title:'Dense fixture',slides:[{title:'Too much beside a picture',frame_id:'fixture-frame',bullets:Array(8).fill('A deliberately long bullet about framing and camera movement. '.repeat(4))}]});return '';}catch(e){return e.message;}});assert.match(dense,/Split it into shorter slides/);
  const lecture = await page.evaluate(async()=>{
   const utterances=[];window.speechSynthesis.speak=u=>utterances.push(u);window.speechSynthesis.cancel=()=>{};
   const result=JSON.parse(await studyDebug.worldTool('present_slides',{title:'Continuous lecture fixture',slides:[{title:'First',bullets:['One'],spoken_text:'First spoken slide.'},{title:'Second',bullets:['Two'],spoken_text:'Second spoken slide.'}]}));
   const p=studyDebug.desk.findWindow(result.id);utterances[0].onstart();const before=p.userData.body;
   utterances[0].onend();await new Promise(r=>setTimeout(r,20));const after=p.userData.body;
   utterances[1].onstart();utterances[1].onend();await new Promise(r=>setTimeout(r,20));
   return {before,after,count:utterances.length};
  });assert.match(lecture.before,/Slide 1/);assert.match(lecture.after,/Slide 2/);assert.equal(lecture.count,2);
  const state=await page.evaluate(async()=>{
   const d=studyDebug,p=fixtureSlide;
   p.userData.go(1);await new Promise(r=>setTimeout(r,50));
   const a=JSON.parse(await d.worldTool('open_window',{title:'Delete just this',body:'fixture'}));
   const b=JSON.parse(await d.worldTool('open_window',{title:'Keep this',body:'fixture'}));
   d.desk.stashWindow(d.desk.findWindow(a.id));d.desk.stashWindow(d.desk.findWindow(b.id));
   await d.worldTool('delete_stashed',{id:a.id});const kept=!!d.desk.findWindow(b.id),deleted=!d.desk.findWindow(a.id);
   d.desk.openStashPicker();const picker=d.qa.panels.find(p=>p.userData.kind==='stash-picker');
   const x=d.qa.touchables.find(t=>t.owner===picker&&t.w===.045);x.action();
   const keep=d.qa.touchables.find(t=>t.owner===picker&&t.w===.12);keep.action();const keptAfterCancel=!!d.desk.findWindow(b.id);
   x.action();d.qa.touchables.find(t=>t.owner===picker&&t.w===.36).action();
   const deletedByButton=!d.desk.findWindow(b.id);
   d.thesis.menu.logOff();
   return {kept,deleted,keptAfterCancel,deletedByButton,connected:d.browserBridge.connected,wanted:d.browserBridge.wanted,mic:d.browserBridge.microphoneState};
  });assert.deepEqual(state,{kept:true,deleted:true,keptAfterCancel:true,deletedByButton:true,connected:false,wanted:false,mic:null});
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
