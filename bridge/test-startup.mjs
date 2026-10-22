import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
test('Windows login runner skips an occupied port, restarts a crashed test bridge and installs/removes only its shortcut', {skip:process.platform!=='win32',timeout:35000}, async()=>{
  const root = await mkdtemp(join(tmpdir(),'sunnyvale-startup-'));
  const runner=fileURLToPath(new URL('./Run-AtLogin.ps1',import.meta.url));
  const installer=fileURLToPath(new URL('./Install-AtLogin.ps1',import.meta.url));
  const privateRoot=join(root,'private'),startup=join(root,'startup'),state=join(root,'state');
  await mkdir(privateRoot);await mkdir(join(root,'node_modules/ws'),{recursive:true});
  const counter=join(root,'runs.txt');
  await writeFile(join(root,'server.mjs'),`import http from 'node:http';import{readFileSync,writeFileSync}from'node:fs';const p=${JSON.stringify(counter)},n=+(readFileSync(p,{encoding:'utf8',flag:'a+'})||0)+1;writeFileSync(p,String(n));if(n===1)process.exit(7);http.createServer((q,r)=>r.end('fixture')).listen(+process.env.BRIDGE_PORT,'127.0.0.1');`);
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',runner,'-BridgeDirectory',root,'-PrivateDirectory',privateRoot,'-NodePath',process.execPath,'-Port','18192'];
  let child;
  const occupied=http.createServer((q,r)=>r.end('occupied'));
  try {
    await new Promise(r=>occupied.listen(18192,'127.0.0.1',r));
    await exec('powershell.exe',args,{windowsHide:true,timeout:10000});
    await assert.rejects(access(counter),'Occupied port must not even launch the fixture Node process');
    await new Promise(r=>occupied.close(r));
    child=spawn('powershell.exe',args,{windowsHide:true,stdio:'ignore'});
    let healthy=false;
    for(let i=0;i<130;i++){try{healthy=(await fetch('http://127.0.0.1:18192/')).ok;}catch{}if(healthy)break;await pause(100);}
    assert.ok(healthy,'Crashing fixture restarts and listens');assert.equal(await readFile(counter,'utf8'),'2');
    await exec('powershell.exe',args,{windowsHide:true,timeout:10000});
    assert.equal(await readFile(counter,'utf8'),'2','Repeated runner creates no second bridge');
    const install=['-NoProfile','-ExecutionPolicy','Bypass','-File',installer,'-BridgeDirectory',root,'-PrivateDirectory',privateRoot,'-StartupDirectory',startup,'-StateDirectory',state];
    await exec('powershell.exe',install,{windowsHide:true,timeout:10000});
    await access(join(startup,'Sunnyvale Browser Bridge.lnk'));await access(join(state,'Run-AtLogin.ps1'));
    await exec('powershell.exe',[...install,'-Uninstall'],{windowsHide:true,timeout:10000});
    await assert.rejects(access(join(startup,'Sunnyvale Browser Bridge.lnk')));
    assert.ok((await fetch('http://127.0.0.1:18192/')).ok,'Disabling login leaves the running bridge alone');
  }finally{
    occupied.close();
    if(child&&child.exitCode===null)await exec('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});
    assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));
    await rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  }
});
