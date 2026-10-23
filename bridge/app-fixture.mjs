import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
export async function appFixture({browserArgs=[]}={}){
 const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'../evidence');await mkdir(out,{recursive:true});
 const server=http.createServer(async(req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root)||/[\\/](private|\.git|node_modules)[\\/]/.test(path))return res.writeHead(404).end();try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(18123,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({args:browserArgs});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**',r=>r.fulfill({path:resolve(root,'bridge/node_modules/three',r.request().url().split('three@0.169.0/')[1]),contentType:'text/javascript'}));await page.goto('http://127.0.0.1:18123/');await page.waitForFunction(()=>window.studyDebug?.taskModes);return {page,errors,out,async shot(name){await page.evaluate(()=>studyDebug.renderer.render(studyDebug.scene,studyDebug.camera));await page.screenshot({path:resolve(out,name+'.png')});},async close(){await browser.close();await new Promise(r=>server.close(r));}};}catch(e){await browser?.close();server.close();throw e;}
}
