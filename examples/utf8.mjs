import assert from 'node:assert/strict';
import { assertStream, checkStream, replay } from 'sutuy';
import { decodeUtf8 } from './consumers.mjs';

const input = 'Hola 🌊, mañana.';
async function broken(stream) {
  let text = '';
  for await (const chunk of stream) text += new TextDecoder().decode(chunk);
  if (text !== input) throw new Error('UTF-8 corruption');
}

const result = await checkStream({ input, test: broken });
assert.equal(result.status, 'failed');
assert.equal(result.fixture.cuts.length, 1);
await assert.rejects(broken(replay(result.fixture)), /UTF-8 corruption/);
await assertStream({
  input,
  test: async (stream) => assert.equal(await decodeUtf8(stream), input),
});
console.log(
  `UTF-8: ${result.originalFixture.cuts.length} cuts → ${result.fixture.cuts.length}; fixed consumer passes.`,
);
