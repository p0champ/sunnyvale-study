import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackup } from './backup.mjs';

test('local backups restore UTF-8 boundaries and binary files exactly; incomplete or malformed transfers never replace a good file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sunnyvale-backup-')),previous=process.env.BRIDGE_PRIVATE_DIR;
  process.env.BRIDGE_PRIVATE_DIR=root;const backup=createBackup({root});
  if(previous===undefined)delete process.env.BRIDGE_PRIVATE_DIR;else process.env.BRIDGE_PRIVATE_DIR=previous;
  const call=async m=>{let result;await backup.handle(m,value=>{result=value;});return result;};
  const upload=async(kind,id,bytes,meta={})=>{
    const {transfer}=await call({type:'backup-begin',kind,id,size:bytes.length,meta});
    for(let n=0,at=0;at<bytes.length;n++,at+=33750)await call({type:'backup-part',transfer,n,data:bytes.subarray(at,at+33750).toString('base64')});
    return call({type:'backup-end',transfer});
  };
  const restore=async(kind,id)=>{const chunks=[];for(let n=0;;n++){const piece=await call({type:'restore-part',kind,id,n});chunks.push(Buffer.from(piece.data,'base64'));if(n+1===piece.total)return Buffer.concat(chunks);}};
  try{
    assert.match((await call({type:'backup-info'})).where,/this PC only/);
    const study=Buffer.from(JSON.stringify({keys:{'sunnyvale.thesis':'x'.repeat(33700)+'🧡'.repeat(1000)}}));
    await upload('study','study',study);assert.deepEqual(await restore('study','study'),study);
    const binary=Buffer.from(Array.from({length:200003},(_,i)=>i%251));await upload('library','fixture-file',binary,{name:'fixture.bin'});
    assert.deepEqual(await restore('library','fixture-file'),binary);
    const frame=Buffer.from(JSON.stringify({caption:'Frame 🧡',data:'fixture'}));await upload('frame','fixture-frame',frame);assert.deepEqual(await restore('frame','fixture-frame'),frame);
    let {transfer}=await call({type:'backup-begin',kind:'library',id:'fixture-file',size:100});
    await call({type:'backup-part',transfer,n:0,data:Buffer.from('short').toString('base64')});
    await assert.rejects(call({type:'backup-end',transfer}),/incomplete/);assert.deepEqual(await restore('library','fixture-file'),binary);
    ({transfer}=await call({type:'backup-begin',kind:'library',id:'bad-file',size:1}));
    await assert.rejects(call({type:'backup-part',transfer,n:0,data:'!!!!'}),/base64/);
    await assert.rejects(call({type:'backup-part',transfer,n:0,data:Buffer.from('too long').toString('base64')}),/bigger/);
    await assert.rejects(access(join(backup.folder,'library','bad-file.bin')));
    await assert.rejects(call({type:'backup-begin',kind:'library',id:'../outside',size:1}),/unusual id/);
    await assert.rejects(call({type:'restore-part',kind:'unknown',id:'fixture-file',n:0}),/Unknown/);
    await assert.rejects(call({type:'restore-part',kind:'library',id:'fixture-file',n:-1}),/piece number/);
    for (const n of [6, 2 ** 32, Number.MAX_SAFE_INTEGER]) await assert.rejects(call({type:'restore-part',kind:'library',id:'fixture-file',n}),/piece number/);
    await writeFile(join(root,'pairing.txt'),'fixture');await backup.saveKeys();assert.equal(await readFile(join(backup.folder,'bridge-keys','pairing.txt'),'utf8'),'fixture');
  }finally{
    assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});
  }
});


test('backup initialization errors never include the private filesystem path',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sunnyvale-backup-error-')),previous=process.env.BRIDGE_BACKUP_DIR;
  const blocked=join(root,'private-file');await writeFile(blocked,'fixture');
  process.env.BRIDGE_BACKUP_DIR=blocked;const backup=createBackup({root});
  if(previous===undefined)delete process.env.BRIDGE_BACKUP_DIR;else process.env.BRIDGE_BACKUP_DIR=previous;
  try{await assert.rejects(backup.handle({type:'backup-info'},()=>{}),error=>error.message==='Could not read or write the local backup.');}
  finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});}
});
