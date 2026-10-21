import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { connectionSettings } from './connection-settings.mjs';

test('connector settings prefer the permanent address and reject unsafe settings without echoing them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sunnyvale-settings-'));
  const secret = randomBytes(32).toString('base64url');
  const shortcut = '#'+new URLSearchParams({bridge:'wss://old.example/bridge',pair:'fixture'});
  try {
    await writeFile(join(root, 'connector.txt'), secret);
    await writeFile(join(root, 'Open Sunnyvale.url'), '[InternetShortcut]\r\nURL=https://fixture.example/'+shortcut+'\r\n');
    await writeFile(join(root, 'public-address.txt'), 'https://permanent.example/\n');
    assert.equal((await connectionSettings(root)).base, 'https://permanent.example');
    await rm(join(root, 'public-address.txt'));
    assert.equal((await connectionSettings(root)).base, 'https://old.example');
    for (const value of ['http://unsafe.example', 'https://fixture.example/mcp/'+secret, 'https://user:'+secret+'@fixture.example', 'https://fixture.example/?secret='+secret]) {
      await writeFile(join(root, 'public-address.txt'), value);
      await assert.rejects(connectionSettings(root), error => !error.message.includes(secret) && !error.message.includes(value));
    }
    await writeFile(join(root, 'public-address.txt'), 'https://permanent.example');
    await writeFile(join(root, 'connector.txt'), 'missing');
    await assert.rejects(connectionSettings(root), /credential is missing or invalid/);
  } finally { await rm(root, {recursive:true,force:true}); }
});
