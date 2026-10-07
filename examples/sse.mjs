import assert from 'node:assert/strict';
import { assertStream, checkStream, replay, sse } from 'sutuy';
import { readSseData } from './consumers.mjs';

const messages = ['hola', 'mundo'];
const input = sse(messages.map((data) => ({ data })));
async function broken(stream) {
  const messagesRead = [];
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    buffer += text;
    // BUG: a delimiter can straddle two chunks even when neither contains it.
    if (text.includes('\n\n')) {
      const frames = buffer.split('\n\n');
      buffer = frames.pop();
      messagesRead.push(...frames.map((frame) => frame.slice(6)));
    }
  }
  if (JSON.stringify(messagesRead) !== JSON.stringify(messages)) throw new Error('SSE frame lost');
}
const result = await checkStream({ input, test: broken });
assert.equal(result.status, 'failed');
assert.equal(result.fixture.cuts.length, 1);
await assert.rejects(broken(replay(result.fixture)), /SSE frame lost/);
for (const lineEnding of ['\n', '\r\n']) {
  await assertStream({
    input: sse(
      messages.map((data) => ({ data })),
      { lineEnding },
    ),
    test: async (stream) => assert.deepEqual(await readSseData(stream), messages),
  });
}
console.log(
  `SSE: ${result.originalFixture.cuts.length} cuts → ${result.fixture.cuts.length}; buffered consumer passes.`,
);
