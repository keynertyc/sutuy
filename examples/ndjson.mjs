import assert from 'node:assert/strict';
import { assertStream, checkStream, ndjson, replay } from 'sutuy';
import { readNdjson } from './consumers.mjs';

const records = [{ city: 'Cusco 🌄' }, { count: 2 }];
const input = ndjson(records);
async function broken(stream) {
  try {
    const actual = [];
    for await (const chunk of stream) {
      actual.push(...new TextDecoder().decode(chunk).trim().split('\n').map(JSON.parse));
    }
    assert.deepEqual(actual, records);
  } catch (cause) {
    throw new Error('NDJSON record corruption', { cause });
  }
}
const result = await checkStream({ input, test: broken });
assert.equal(result.status, 'failed');
assert.equal(result.fixture.cuts.length, 1);
await assert.rejects(broken(replay(result.fixture)), /NDJSON record corruption/);
await assertStream({
  input,
  test: async (stream) => assert.deepEqual(await readNdjson(stream), records),
});
console.log(
  `NDJSON: ${result.originalFixture.cuts.length} cuts → ${result.fixture.cuts.length}; buffered consumer passes.`,
);
