import assert from 'node:assert/strict';
import { assertStream, ndjson } from 'sutuy';
import { readNdjson } from './consumers.mjs';

// Inject fetch into your SDK/application so every trial gets a fresh Response.
async function loadRecords(fetcher, signal) {
  const response = await fetcher('https://example.invalid/events', { signal });
  assert.ok(response.body);
  return readNdjson(response.body);
}

const expected = [{ message: 'Hola 🌊' }];
await assertStream({
  input: ndjson(expected),
  test: async (stream, { signal }) => {
    const fetcher = async () =>
      new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
    assert.deepEqual(await loadRecords(fetcher, signal), expected);
  },
});
console.log('Fetch injection: all generated responses passed; no network calls.');
