import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserClickInput } from '../browser-click-input.js';
test('one browser click per pinch across repeated select events and fingertip contact',()=>{
  const gate=new BrowserClickInput(),hand={},other={};
  assert.ok(gate.begin(hand));assert.ok(gate.select(hand));
  assert.equal(gate.begin(hand),false);assert.equal(gate.select(hand),false);
  assert.equal(gate.contact(hand,'page'),false);
  gate.leave(hand);assert.equal(gate.contact(hand,'page'),false);
  gate.end(hand,true);assert.ok(gate.begin(hand));assert.equal(gate.select(hand),false,'Tracking selectend/start with fingers still pinched stays consumed');
  gate.end(hand,true);gate.observe(hand,false);gate.leave(hand);
  assert.ok(gate.begin(hand));assert.ok(gate.select(hand),'Opening then pinching again re-arms');
  assert.ok(gate.begin(other));assert.ok(gate.select(other),'Other hand is independent');
  gate.contact(hand,'page');gate.end(hand);assert.ok(gate.begin(hand));assert.ok(gate.select(hand),'A fresh pinch works even if the fingertip remains near the page');
  gate.cancel(hand);assert.ok(gate.begin(hand));assert.ok(gate.select(hand),'Lost input tracking does not leave a stuck selection latch');
});
test('direct taps coalesce with select, controllers re-arm on release, and reset clears old input',()=>{
  const gate=new BrowserClickInput(),hand={},controller={};
  assert.ok(gate.contact(hand,'page'));assert.equal(gate.contact(hand,'page'),false);
  assert.ok(gate.begin(hand));assert.equal(gate.select(hand),false,'Contact followed by select is one click');
  gate.end(hand);gate.leave(hand);assert.ok(gate.contact(hand,'page'),'A separate tap works');
  assert.ok(gate.begin(controller));assert.ok(gate.select(controller));gate.end(controller);
  assert.ok(gate.begin(controller));assert.ok(gate.select(controller),'No global time debounce swallowing intentional next click');
  gate.reset();assert.ok(gate.begin(controller));assert.ok(gate.select(controller));
});
