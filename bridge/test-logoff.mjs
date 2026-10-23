import test from 'node:test';
import assert from 'node:assert/strict';
import {disconnectAfterBackup} from '../logoff.js';
test('shutdown saves a completed backup before disconnecting exactly once',async()=>{
 const events=[];let signal;
 const complete=await disconnectAfterBackup({backup:async s=>{signal=s;events.push('backup');return true;},disconnect:()=>events.push('disconnect')});
 assert.equal(complete,true);assert.deepEqual(events,['backup','disconnect']);assert.equal(signal.aborted,true);
});
test('a stalled final backup has a deadline and cannot keep the bridge connected',async()=>{
 let signal,disconnected=0,finish;
 const complete=await disconnectAfterBackup({timeout:20,backup:s=>{signal=s;return new Promise(r=>finish=r);},disconnect:()=>disconnected++});
 assert.equal(complete,false);assert.equal(disconnected,1);assert.equal(signal.aborted,true);
 finish(true);await new Promise(r=>setTimeout(r,10));assert.equal(disconnected,1);
});
test('a rejected final backup still disconnects and reports incomplete',async()=>{
 let disconnected=false;
 assert.equal(await disconnectAfterBackup({backup:async()=>{throw Error('fixture network failure');},disconnect:()=>disconnected=true}),false);
 assert.equal(disconnected,true);
});
