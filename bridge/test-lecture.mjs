import test from 'node:test';
import assert from 'node:assert/strict';
import {createLecturePlayer} from '../lecture-player.js';
test('lecture changes slides only after speech ends; stop cancels callbacks and restart works', async()=>{
  const said=[], shown=[], notices=[];
  const english={lang:'en-US'},german={lang:'de-DE'};
  const speech={speak:u=>said.push(u),cancel(){},getVoices:()=>[german,english]};
  const player=createLecturePlayer({speech,Utterance:class {constructor(text){this.text=text;}},go:i=>shown.push(i),slides:[{spoken_text:'First'},{spoken_text:'Second'}],notice:t=>notices.push(t),language:'en'});
  player.start();assert.deepEqual(shown,[0]);assert.equal(said[0].text,'First');assert.equal(said[0].voice,english);
  said[0].onstart();assert.deepEqual(shown,[0]);said[0].onend();await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(shown,[0,1]);assert.equal(said[1].text,'Second');
  player.stop();said[1].onend();await new Promise(r=>setTimeout(r,10));assert.equal(player.running,false);
  player.start(1);said[2].onstart();said[2].onend();await new Promise(r=>setTimeout(r,10));assert.equal(player.running,false);assert.equal(notices.at(-1),'Lecture complete.');
});
test('missing device speech reports an actionable failure',()=>{
  let notice;const player=createLecturePlayer({speech:null,notice:t=>notice=t});
  assert.equal(player.start(),false);assert.match(notice,/unavailable/);
});
