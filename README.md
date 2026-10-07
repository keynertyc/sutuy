# Sutuy

**Find, minimize, and replay byte-boundary bugs in streaming consumers.**

A network chunk can end halfway through `🌊`, a JSON record, or an SSE delimiter.
Sutuy tests your consumer against deterministic byte partitions, removes unnecessary
boundaries from a failure, and gives you a JSON fixture for a permanent regression test.

Zero runtime dependencies. Strict TypeScript. Ordinary assertions. No server, network
access, or test-framework dependency. Uses WHATWG `ReadableStream<Uint8Array>`.

Repository: [keynertyc/sutuy](https://github.com/keynertyc/sutuy).

```sh
npm install -D sutuy
```

To develop from this checkout, run `pnpm install`, then `pnpm check`.

[Español](./README.es.md) · [API](./docs/api.md) · [Guarantees and limits](./docs/semantics.md)
· [Integrations](./docs/integrations.md) · [Runnable examples](./examples/README.md)

## Start with one assertion

Pass your consumer into `assertStream`. Resolve to pass; throw to fail.
This complete example checks incremental UTF-8 decoding:

<!-- sutuy:run -->
```js
import assert from 'node:assert/strict';
import { assertStream } from 'sutuy';

async function decode(stream) {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

await assertStream({
  input: 'Hola 🌊, mañana.',
  test: async (stream) => {
    assert.equal(await decode(stream), 'Hola 🌊, mañana.');
  },
});
```

Remove `{ stream: true }` to introduce a real bug. Sutuy finds a split inside a
multibyte character, reduces the boundaries, and throws `StreamCheckError` with a
fixture and replay instructions. The error exposes `error.fixture` and `error.result`.

## Keep a regression fixture

Use `checkStream` when you want the result instead of an assertion error:

<!-- sutuy:run -->
```js
import { checkStream, parseFixture, replay, serializeFixture } from 'sutuy';

const result = await checkStream({
  input: '🌊',
  seed: 42,
  test: async (stream) => {
    let text = '';
    for await (const chunk of stream) text += new TextDecoder().decode(chunk);
    if (text !== '🌊') throw new Error('UTF-8 corruption');
  },
});

if (result.status === 'failed') {
  const json = serializeFixture(result.fixture); // Save in your test fixtures.
  const stream = replay(parseFixture(json));     // Fresh stream, exact same chunks.
  await new Response(stream).text();
}
```

A fixture preserves arbitrary bytes, including invalid UTF-8. Reduction changes
chunk boundaries only; it never deletes or edits the payload. Saved fixtures work
independently of the random generator.

## SSE, NDJSON, and Fetch

`sse([{ data: 'hola' }])` and `ndjson([{ message: 'hola' }])` build test payloads.
Wrap a case in `new Response(stream)` to inject it into your SDK's fetch function.
Run `pnpm demo` after `pnpm build` to see working UTF-8, SSE, NDJSON, Fetch injection,
and JSON replay examples. No network connection is needed for the demos.

Use `streamCases(input, { seed, runs })` if you prefer to drive the cases yourself.
Use `createFixture(input, [offsets])` when you already know the split to reproduce.

## What a passing check means

Sutuy checks the one-chunk baseline, dense partitions, selected UTF-8 and framing
boundaries, and seeded combinations. Defaults: up to **100 discovery cases**,
**200 reduction trials**, and **2 seconds per callback**. Small inputs can have
fewer distinct partitions. A passing result applies to the cases actually tried.

The default failure identity is the error name and exact message. If assertion
messages vary with received data, supply a stable `failureKey`. Keep different bug
classes distinct. See [failure identity](./docs/semantics.md#failure-identity).

The reducer checks reproducibility and reports whether its budget allowed complete
single-boundary deletion testing. It does not promise a globally smallest failure.
Timeouts, aborts, and observed inconsistent outcomes raise a separate
`StreamHarnessError`; they are not saved as consumer bugs.

Sutuy exercises byte partitioning. It does not simulate network timing, truncation,
reconnection, WebSockets, or every possible partition. Reset consumer state inside
each callback. See [the complete contract](./docs/semantics.md).

## Compatibility and development

Node **22.12+**, ESM, with synchronous `require('sutuy')` on supported Node versions.
The core uses web APIs and contains no Node imports. Browser-oriented consumers can
use it through their test bundler; the automated local runtime checks run on Node.
TypeScript consumers need the DOM library (or equivalent Web Stream declarations).

```sh
pnpm install
pnpm check
pnpm demo
```

`pnpm check` runs formatting/lint, strict types, coverage, build/package lint,
executable documentation, all examples, and isolated tarball consumers.
See [contributing](./CONTRIBUTING.md) and [release setup](./docs/releasing.md).

MIT © Keyner
