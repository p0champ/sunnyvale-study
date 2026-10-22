import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter, once } from 'node:events';
import { WebSocket } from 'ws';
import { createVoiceChannel, audiblePCM, isClaudePage } from './voice-channel.mjs';

test('voice channel requires the active session, preserves its owner and falls back without leaking listeners', async () => {
  const owner = new EventEmitter(), fallback = [], clients = [];
  owner.readyState = WebSocket.OPEN; owner.audioKey = 'fixture-session'; owner.send = packet => fallback.push(JSON.parse(packet));
  let active = owner;
  const channel = createVoiceChannel({ allowedOrigins: new Set(['http://localhost:18123']), validToken: token => token === 'fixture-token', getOwner: () => active });
  const server = http.createServer(); server.on('upgrade', (req, socket, head) => { if (!channel.upgrade(req, socket, head)) socket.destroy(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${server.address().port}/bridge-audio`;
  const connect = async (token = 'fixture-token', key = owner.audioKey) => {
    const socket = new WebSocket(url, { origin: 'http://localhost:18123' }); clients.push(socket);
    await once(socket, 'open'); socket.send(JSON.stringify({ type: 'pair-audio', token, key })); return socket;
  };
  try {
    for (const [token, key] of [['wrong', owner.audioKey], ['fixture-token', 'another-session']]) {
      const socket = await connect(token, key); assert.equal((await once(socket, 'close'))[0], 1008); assert.equal(owner.audioSocket, undefined);
    }
    const socket = await connect(); assert.equal(JSON.parse((await once(socket, 'message'))[0]).type, 'audio-ready');
    const received = once(socket, 'message'), packet = { type: 'audio', id: 'fixture-tab', data: 'AAAA', rate: 24000 };
    assert.equal(channel.send(owner, packet), true); assert.deepEqual(JSON.parse((await received)[0]), packet); assert.equal(fallback.length, 0);
    const duplicate = await connect(); assert.equal((await once(duplicate, 'close'))[0], 1013); assert.equal(socket.readyState, WebSocket.OPEN);
    const ended = once(socket, 'close'); owner.emit('close'); await ended;
    // Let the server observe the close frame, then check the main-stream fallback.
    for (let n = 0; owner.audioSocket && n < 100; n++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(owner.listenerCount('close'), 0); assert.equal(channel.send(owner, packet), false); assert.deepEqual(fallback, [packet]);
    active = null;
    const stale = await connect(); assert.equal((await once(stale, 'close'))[0], 1008);
  } finally {
    for (const socket of clients) socket.terminate(); channel.close(); await new Promise(resolve => server.close(resolve));
  }
});

test('speech activity excludes silent packets and unrelated websites', () => {
  const tone = Buffer.alloc(4800); for (let n = 0; n < 2400; n++) tone.writeInt16LE(Math.round(8000 * Math.sin(n / 8)), n * 2);
  assert.equal(audiblePCM(tone.toString('base64')), true); assert.equal(audiblePCM(Buffer.alloc(4800).toString('base64')), false);
  for (const bad of ['', '!!!!', Buffer.from([1]).toString('base64')]) assert.equal(audiblePCM(bad), false);
  assert.equal(isClaudePage('https://claude.ai/new'), true); assert.equal(isClaudePage('https://www.claude.ai/chat/fixture'), true);
  for (const url of ['https://claude.ai.example.com/', 'https://youtube.com/', 'invalid']) assert.equal(isClaudePage(url), false);
});

test('audio acknowledgements keep speech flowing when the picture connection cannot acknowledge', async () => {
  const owner = new EventEmitter(), clients = [], received = [];
  owner.readyState = WebSocket.OPEN; owner.reliableAudio = true; owner.audioKey = 'fixture-key'; owner.send = () => {};
  const channel = createVoiceChannel({allowedOrigins:new Set(['http://localhost:18123']),validToken:t=>t==='fixture-token',getOwner:()=>owner});
  const server = http.createServer();server.on('upgrade',(req,socket,head)=>channel.upgrade(req,socket,head));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/bridge-audio`,{origin:'http://localhost:18123'});clients.push(socket);
    socket.on('message',raw=>{const p=JSON.parse(raw);if(p.type==='audio'){received.push(p.seq);socket.send(JSON.stringify({type:'audio-ack',seq:p.seq}));}});
    await once(socket,'open');const ready=once(socket,'message');socket.send(JSON.stringify({type:'pair-audio',token:'fixture-token',key:owner.audioKey}));await ready;
    for(let i=0;i<45;i++)channel.send(owner,{type:'audio',id:'fixture',data:'AAAA',rate:24000});
    for(let i=0;i<100&&received.length<45;i++)await new Promise(r=>setTimeout(r,5));
    assert.deepEqual(received,Array.from({length:45},(_,i)=>i+1));
  } finally { owner.emit('close');for(const socket of clients)socket.terminate();channel.close();await new Promise(r=>server.close(r)); }
});
