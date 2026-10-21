import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentCamera,rawCamera} from '../scanner-camera.js';
test('scanner refuses virtual/avatar streams and releases their camera tracks',async()=>{
 let stopped=0;const track={label:'Avatar selfie camera',getSettings:()=>({facingMode:'environment'}),stop:()=>stopped++};
 await assert.rejects(environmentCamera({getUserMedia:async constraints=>{assert.deepEqual(constraints.video.facingMode,{exact:'environment'});assert.equal(constraints.audio,false);return{getVideoTracks:()=>[track],getTracks:()=>[track]};}}),/virtual\/selfie/);
 assert.equal(stopped,1);
 track.label='Physical camera';track.getSettings=()=>({facingMode:'environment'});
 assert.ok(await environmentCamera({getUserMedia:async()=>({getVideoTracks:()=>[track],getTracks:()=>[track]})}));
 assert.equal(rawCamera({xr:{getFrame:()=>null,getReferenceSpace:()=>null}}),null);
});
