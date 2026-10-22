import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAudioReceiver, openVoiceLink } from '../browser-voice-link.js';
import { createVoiceChannel } from './voice-channel.mjs';

test('old-stream audio and retransmissions are delivered once, in sentence order', () => {
  const played = [], acks = [];
  const receive = createAudioReceiver({ play: packet => played.push(packet.data), acknowledge: n => acks.push(n) });
  receive({ seq: 2, data: 'second' }); assert.deepEqual(played, []);
  receive({ seq: 1, data: 'first' }); assert.deepEqual(played, ['first', 'second']);
  receive({ seq: 1, data: 'first' }); receive({ seq: 2, data: 'second' });
  receive({ seq: 3, data: 'third' }); assert.deepEqual(played, ['first', 'second', 'third']);
  assert.equal(acks.at(-1), 3);
});

test('delivery acknowledgements bound invisible queues and replay pending speech on migration', () => {
  const owner = new EventEmitter(), main = [], audio = [];
  owner.readyState = 1; owner.reliableAudio = true; owner.send = wire => main.push(JSON.parse(wire));
  owner.close = () => { owner.readyState = 3; owner.emit('close'); };
  const channel = createVoiceChannel({ allowedOrigins: new Set(), validToken: () => false, getOwner: () => owner });
  try {
    for (let n = 0; n < 25; n++) channel.send(owner, { type: 'audio', data: String(n) });
    assert.equal(main.length, 20, 'Unacknowledged tunnel delivery has a fixed send window even when bufferedAmount is zero');
    owner.audioSocket = { readyState: 1, send: wire => audio.push(JSON.parse(wire)) };
    channel.send(owner, { type: 'audio', data: '25' });
    assert.deepEqual(audio.map(packet => packet.seq), main.map(packet => packet.seq), 'New route replays unacknowledged speech');
    channel.acknowledge(owner, 20); assert.equal(audio.at(-1).seq, 26);
    channel.acknowledge(owner, 10000); assert.equal(audio.at(-1).seq, 26, 'Impossible acknowledgements cannot discard unsent words');
    const played = [], receive = createAudioReceiver({ play: packet => played.push(packet.seq), acknowledge: n => channel.acknowledge(owner, n) });
    for (const packet of [...audio, ...main]) receive(packet);
    assert.deepEqual(played, Array.from({ length: 26 }, (_, n) => n + 1));
  } finally { owner.close(); channel.close(); }
});

test('a stalled socket cannot accumulate unbounded queued speech', () => {
  const owner = new EventEmitter(); let sent = 0, code;
  owner.readyState = 1; owner.reliableAudio = true; owner.bufferedAmount = 100000000;
  owner.send = () => sent++;
  owner.close = value => { code = value; owner.readyState = 3; owner.emit('close'); };
  const channel = createVoiceChannel({ allowedOrigins: new Set(), validToken: () => false, getOwner: () => owner });
  try {
    for (let n = 0; n < 300; n++) channel.send(owner, { type: 'audio', data: 'fixture' });
    assert.equal(sent, 0); assert.equal(code, 1013, 'An explicit recoverable disconnect replaces silent memory growth');
  } finally { owner.close(); channel.close(); }
});

test('temporary duplicate refusal retries; invalid pairing stops and cancellation clears retries', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sockets = [];
  class Socket {
    constructor() { sockets.push(this); }
    send() {}
    close() { this.onclose?.({ code: 1000 }); }
  }
  const stop = openVoiceLink({ url: 'wss://fixture.invalid/bridge', token: 'fixture', key: 'fixture', isCurrent: () => true, onAudio() {}, Socket });
  sockets[0].onopen(); sockets[0].onclose({ code: 1013 }); t.mock.timers.tick(1000); assert.equal(sockets.length, 2);
  sockets[1].onopen(); sockets[1].onclose({ code: 1008 }); t.mock.timers.tick(60000); assert.equal(sockets.length, 2);
  stop();
});
