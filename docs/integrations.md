# Integrations

Sutuy accepts an assertion callback, so you can use your existing test runner. Import
`assertStream` inside a test; its returned promise rejects on a counterexample.

## Vitest or Jest

```ts
import { test, expect } from 'vitest'; // Or your Jest globals/imports.
import { assertStream, ndjson } from 'sutuy';
import { readRecords } from './your-consumer.js';

test('reads records across arbitrary chunk boundaries', async () => {
  const expected = [{ message: 'Hola 🌊' }, { done: true }];
  await assertStream({
    input: ndjson(expected),
    failureKey: (error) => {
      if (error instanceof Error && error.name === 'AssertionError') {
        return 'records-equal-expected';
      }
      if (error instanceof Error) return `${error.name}:${error.message}`;
      throw new TypeError('Unexpected thrown value');
    },
    test: async (stream, { signal }) => {
      expect(await readRecords(stream, { signal })).toEqual(expected);
    },
  });
}, 15_000);
```

Adjust the enclosing test timeout for the total run. Sutuy's deadline is per
invocation, so a run can take longer. For an overall deadline, pass
`signal: AbortSignal.timeout(10_000)`. Customize the assertion error classification
for your runner (Jest errors do not necessarily use the name `AssertionError`).

## Fetch and SDKs

Inject a fetch function or a response factory into your consumer. Construct the
response inside the callback: streams and responses cannot be consumed twice.
See [the runnable Fetch example](../examples/fetch.mjs).

```ts
test: async (stream, { signal }) => {
  const fetcher = async () => new Response(stream, {
    headers: { 'content-type': 'text/event-stream' },
  });
  const client = makeYourClient({ fetch: fetcher });
  expect(await client.consume({ signal })).toEqual(expected);
}
```

Sutuy does not patch global fetch. If your application uses a mock server, put the
replayed stream in that server's response body and retain your existing assertions.

## Save and replay with Node's test runner

Catch the assertion error or inspect `checkStream` and save only its fixture:

```ts
import { writeFile } from 'node:fs/promises';
import { serializeFixture } from 'sutuy';

if (result.status === 'failed') {
  await writeFile('test/fixtures/stream.json', serializeFixture(result.fixture));
}
```

Then test the repaired consumer against that file. Sutuy never writes files on its own.

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseFixture, replay } from 'sutuy';
import { readRecords } from './your-consumer.js';

test('regression: split stream frame', async () => {
  const fixture = parseFixture(await readFile('test/fixtures/stream.json', 'utf8'));
  assert.deepEqual(await readRecords(replay(fixture)), expected);
});
```

The fixture contains the full synthetic payload. Review it before committing, just
as you would review any other test data. The library has no telemetry or upload behavior.

## Drive partitions yourself

```ts
import { replay, streamCases } from 'sutuy';

for (const fixture of streamCases(input, { seed: 17, runs: 300 })) {
  await verifyYourConsumer(replay(fixture));
}
```

This lower-level path has no timeouts, assertions, reduction, or automatic cleanup.
You own stream consumption/cancellation. Prefer `assertStream` for the complete workflow.
