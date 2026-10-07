# Sutuy

**Find, minimize, and replay byte-boundary bugs in streaming consumers.**

[![npm version](https://img.shields.io/npm/v/sutuy)](https://www.npmjs.com/package/sutuy)
[![CI](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/sutuy)](https://www.npmjs.com/package/sutuy)
[![Node.js version](https://img.shields.io/node/v/sutuy)](#compatibility-and-development)
[![TypeScript definitions](https://img.shields.io/npm/types/sutuy)](./docs/api.md)
[![License](https://img.shields.io/npm/l/sutuy)](./LICENSE)

A network chunk can end halfway through `🌊`, a JSON record, or an SSE delimiter.
Sutuy tests your consumer against deterministic byte partitions, removes unnecessary
boundaries from a failure, and gives you a JSON fixture for a permanent regression test.

Zero runtime dependencies. Strict TypeScript. Ordinary assertions. No server, network
access, or test-framework dependency. Uses WHATWG `ReadableStream<Uint8Array>`.

[Español](./README.es.md) · [API](./docs/api.md) · [Guarantees and limits](./docs/semantics.md)
· [Integrations](./docs/integrations.md) · [Runnable examples](./examples/README.md)

## Install

```sh
npm install -D sutuy
```

Requires Node.js **22.12+**. TypeScript declarations are included.

## Where it helps

| Your consumer | Boundaries worth testing |
| --- | --- |
| Incremental text decoder | Inside multibyte UTF-8 characters. |
| NDJSON parser | Inside a JSON record and around line endings. |
| SSE or streamed LLM response parser | Inside field names, event data, and blank-line delimiters. |
| Fetch-based SDK | Across reads from an injected `Response.body`. |

Keep your existing assertions and test runner. Sutuy supplies the streams, explores
partitions, reduces a reproducible failure, and produces a fixture you can commit.

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

## Stable API and verification

Sutuy **1.x** follows [Semantic Versioning](https://semver.org/). The documented
public API is stable: incompatible changes require a new major version. Version-1
fixtures remain readable and replayable throughout 1.x.

Generation policies can evolve between releases. Save the JSON fixture when you
need durable reproduction; a seed alone is tied to its generator version.
See the [compatibility contract](./docs/semantics.md#versioning-and-compatibility).

The [CI workflow](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml) checks
Node **22, 24, and 26**. Each job runs the test suite with enforced coverage thresholds,
strict type checking, package validation, executable documentation, and examples.
It also installs the actual tarball into an isolated consumer and checks ESM imports,
`require(esm)`, and TypeScript declarations. The test suite covers byte preservation,
deterministic generation, reduction, cancellation, and failure reproducibility.

## Compatibility and development

Node **22.12+**, ESM, with synchronous `require('sutuy')` on supported Node versions.
The core uses web APIs and contains no Node imports. Browser-oriented consumers can
use it through their test bundler; browser engines are outside the automated runtime matrix.
TypeScript consumers need the DOM library (or equivalent Web Stream declarations).

To develop this package, use Node 24 and pnpm 12.9.1:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm demo
```

`pnpm check` runs formatting/lint, strict types, coverage, build/package lint,
executable documentation, all examples, and isolated tarball consumers.
See [contributing](./CONTRIBUTING.md) and [release setup](./docs/releasing.md).

Report reproducible bugs through [GitHub issues](https://github.com/keynertyc/sutuy/issues).
Include the Sutuy version and a synthetic fixture that reproduces the problem.

MIT © Keyner
