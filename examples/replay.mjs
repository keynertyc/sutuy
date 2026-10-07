import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFixture, replay, serializeFixture } from 'sutuy';
import { decodeUtf8 } from './consumers.mjs';

const fixture = parseFixture(
  await readFile(new URL('./fixtures/utf8.json', import.meta.url), 'utf8'),
);
assert.deepEqual(parseFixture(serializeFixture(fixture)), fixture);
assert.equal(await decodeUtf8(replay(fixture)), 'Hola 🌊');
console.log('JSON replay: checked-in fixture passes with the corrected consumer.');
