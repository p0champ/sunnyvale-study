import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const label=process.argv[2]||'current';
const baseline = label === 'before' ? execFileSync('git',['show','49e10f1:index.html'],{cwd:root,encoding:'utf8'}) : null;
const out = resolve(root, '../evidence'); await mkdir(out, {recursive:true});
const app = http.createServer(async (req,res) => {
  const path = resolve(root, '.' + new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if (!path.startsWith(resolve(root)+sep) || /[\\/](private|\.git)[\\/]/.test(path)) return res.writeHead(404).end();
  try { res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.jpg':'image/jpeg','.png':'image/png'})[extname(path)] || 'application/octet-stream'); res.end(baseline && path.endsWith('index.html') ? baseline : await readFile(path)); } catch { res.writeHead(404).end(); }
});
await new Promise(r=>app.listen(18123,'127.0.0.1',r));
let browser;
try {
  browser = await chromium.launch(); const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', r=>r.fulfill({path:resolve(root,'bridge/node_modules/three',r.request().url().split('three@0.169.0/')[1]),contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:18123/'); await page.waitForFunction(()=>window.studyDebug?.worldTool);
  const result = await page.evaluate(async()=>{
    studyDebug.renderer.setAnimationLoop(null);
    studyDebug.browserBridge.voiceActive = () => true;
    await new Promise(r=>setTimeout(r,1000));
    const gaps=[]; let tick=performance.now(); const pulse=setInterval(()=>{const now=performance.now();gaps.push(now-tick);tick=now;},10);
    const started=performance.now();
    for(let i=0;i<6;i++) {
      await studyDebug.worldTool('create_mind_map',{title:'Film analysis '+i,branches:Array.from({length:8},(_,j)=>({label:'Branch '+j,children:['Camera','Editing','Music','Framing']}))});
      await studyDebug.worldTool('make_flashcards',{title:'Film terms',cards:Array.from({length:30},()=>({front:'What does framing communicate?',back:'Framing directs attention and defines relationships.'}))});
      await new Promise(r=>setTimeout(r,0));
    }
    await new Promise(r=>setTimeout(r,30));clearInterval(pulse);
    return {elapsed:Math.round(performance.now()-started),maxTimerGap:Math.round(Math.max(...gaps)),pulses:gaps.length};
  });
  await writeFile(resolve(out,label+'.json'),JSON.stringify(result,null,2)); console.log(result);
} finally {await browser?.close();await new Promise(r=>app.close(r));}
