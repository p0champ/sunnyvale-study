import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserMedia } from '../browser-media.js';

function fixture() {
  const sources = [];
  const context = { state: 'running', currentTime: 5, destination: {},
    createBuffer: (_channels, size, rate) => ({ duration: size / rate, copyToChannel() {} }),
    createBufferSource: () => {
      const source = { playbackRate: { value: 1 }, connect() {}, start(at) { this.at = at; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    } };
  const media = new BrowserMedia(() => {}, () => {}); media.context = context;
  const samples = new Int16Array(2400); for (let n = 0; n < samples.length; n++) samples[n] = Math.round(10000 * Math.sin(n / 8));
  const tone = Buffer.from(samples.buffer).toString('base64'), silence = Buffer.alloc(4800).toString('base64');
  return { media, context, sources, tone, silence };
}

test('a three-second speech burst retains every word-sized piece and catches up without a queue flush', () => {
  const { media, sources, tone } = fixture();
  for (let n = 0; n < 30; n++) media.play('claude', tone, 24000);
  assert.equal(media.voiceStats.dropped, 0); assert.equal(sources.length, 30);
  assert.ok(sources.every(source => !source.stopped)); assert.ok(sources.every(source => source.playbackRate.value === 1), 'Speech pitch must never change during catch-up');
  for (let n = 1; n < sources.length; n++) assert.ok(sources[n].at >= sources[n - 1].at + .1 / sources[n - 1].playbackRate.value - .00001);
  assert.equal(media.speakingNow('unshared'), false);
  assert.equal(media.speakingNow('claude'), false, 'Scheduled speech does not animate the avatar before playback starts');
});

test('only genuine silence is skipped behind speech, and stopping one tab preserves another', () => {
  const { media, tone, silence, sources, context } = fixture();
  for (let n = 0; n < 15; n++) media.play('claude', tone, 24000);
  const count = sources.length; media.play('claude', silence, 24000);
  assert.equal(sources.length, count); assert.equal(media.voiceStats.dropped, 0); assert.equal(media.voiceStats.silentSkipped, 1);
  media.play('other', tone, 24000); context.currentTime = 5.35;
  assert.ok(media.voiceLevel('claude') > 0); assert.equal(media.speakingNow('claude'), true);
  media.stopAudio('other'); assert.equal(media.speakingNow('claude'), true); assert.equal(media.speakingNow('other'), false);
  media.stopAudio('claude'); assert.equal(media.speakingNow('claude'), false); assert.equal(media.leads.has('claude'), false);
});

test('exceptional overflow trims oldest pending pieces rather than erasing all queued speech', () => {
  const { media, tone, sources } = fixture();
  for (let n = 0; n < 110; n++) media.play('claude', tone, 24000);
  assert.ok(media.voiceStats.dropped > 0); assert.ok(media.voiceStats.dropped < 40);
  assert.ok(media.timelines.get('claude').length > 50); assert.ok(media.nextAudio.get('claude') < media.context.currentTime + 9);
  assert.ok(sources.every(source => source.playbackRate.value === 1), 'Retained overflow pieces also keep their pitch');
});

test('first packets wait for audio unlock; mute and disconnect clear them', async () => {
  const {media, context, tone, sources} = fixture();
  context.state = 'suspended'; context.resume = async () => { context.state = 'running'; };
  media.play('claude', tone, 24000); assert.equal(sources.length, 0);
  await media.unlock(); assert.equal(sources.length, 1); assert.equal(media.waitingAudio.length, 0);
  context.state = 'suspended'; media.play('claude', tone, 24000); media.stopAudio('claude');
  await media.unlock(); assert.equal(sources.length, 1);
  context.state = 'suspended'; media.play('other', tone, 24000); media.stopAll();
  await media.unlock(); assert.equal(sources.length, 1);
});
