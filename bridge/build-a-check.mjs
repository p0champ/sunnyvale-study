import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const label=process.argv[2]||'current';
const rendered = process.argv.includes('--rendered');
const baseline = label.startsWith('before') ? execFileSync('git',['show','49e10f1:index.html'],{cwd:root,encoding:'utf8'}) : null;
const out = resolve(root, '../evidence'); await mkdir(out, {recursive:true});
const app = http.createServer(async (req,res) => {
  const path = resolve(root, '.' + new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if (!path.startsWith(resolve(root)+sep) || /[\\/](private|\.git)[\\/]/.test(path)) return res.writeHead(404).end();
  try { res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.jpg':'image/jpeg','.png':'image/png'})[extname(path)] || 'application/octet-stream'); res.end(baseline && path.endsWith('index.html') ? baseline : await readFile(path)); } catch { res.writeHead(404).end(); }
});
await new Promise(r=>app.listen(18123,'127.0.0.1',r));
let browser;
try {
  browser = await chromium.launch({args:['--autoplay-policy=no-user-gesture-required','--mute-audio']}); const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', r=>r.fulfill({path:resolve(root,'bridge/node_modules/three',r.request().url().split('three@0.169.0/')[1]),contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:18123/'); await page.waitForFunction(()=>window.studyDebug?.worldTool);
  const result = await Promise.race([page.evaluate(async rendered=>{
    if (rendered) studyDebug.setMode('stark');
    else studyDebug.renderer.setAnimationLoop(null);
    studyDebug.browserBridge.voiceActive = () => true;
    await new Promise(r=>setTimeout(r,1000));
    let media,worker;
    if (rendered) {
      const {BrowserMedia}=await import('./browser-media.js'); media=new BrowserMedia(()=>{},()=>{});await media.unlock();
      const samples=new Int16Array(2400);for(let i=0;i<samples.length;i++)samples[i]=Math.round(9000*Math.sin(i/8));
      const data=btoa(String.fromCharCode(...new Uint8Array(samples.buffer)));
      const source=URL.createObjectURL(new Blob(['const data='+JSON.stringify(data)+';setInterval(()=>postMessage(data),100);'],{type:'text/javascript'}));
      worker=new Worker(source);URL.revokeObjectURL(source);worker.onmessage=e=>media.play('fixture',e.data,24000);
      await new Promise(r=>setTimeout(r,600));media.takeVoiceStats();
    }
    const gaps=[]; let tick=performance.now(); const pulse=setInterval(()=>{const now=performance.now();gaps.push(now-tick);tick=now;},10);
    const started=performance.now();
    for(let i=0;i<(rendered?3:6);i++) {
      await studyDebug.worldTool('create_mind_map',{title:'Film analysis '+i,branches:Array.from({length:8},(_,j)=>({label:'Branch '+j,children:['Camera','Editing','Music','Framing']}))});
      await studyDebug.worldTool('make_flashcards',{title:'Film terms',cards:Array.from({length:30},()=>({front:'What does framing communicate?',back:'Framing directs attention and defines relationships.'}))});
      await new Promise(r=>setTimeout(r,0));
    }
    const elapsed=Math.round(performance.now()-started);
    await new Promise(r=>setTimeout(r,rendered?700:30));clearInterval(pulse);
    worker?.terminate();const voice=media?.takeVoiceStats();media?.stopAll();await media?.context?.close();
    return {rendered,elapsed,maxTimerGap:Math.round(Math.max(...gaps)),pulses:gaps.length,...(voice?{voice:{packets:voice.packets,maxGap:Math.round(voice.maxGap),underruns:voice.underruns,dropped:voice.dropped}}:{})};
  },rendered),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Rendered benchmark exceeded 60 seconds')),60000);timer.unref();})]);
  await writeFile(resolve(out,label+'.json'),JSON.stringify(result,null,2)); console.log(result);
} finally {await browser?.close();await new Promise(r=>app.close(r));}
