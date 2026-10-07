# API reference

All functions and types are exported from `sutuy`. No subpath imports or peers are required.

## Checking a consumer

`checkStream(options: CheckOptions): Promise<CheckResult>` executes serial trials.
`assertStream(options: CheckOptions): Promise<void>` uses the same runner and throws
`StreamCheckError` for a verified consumer failure. Both reject on invalid options or harness errors.

| Option | Default | Contract |
| --- | --- | --- |
| `input` | Required | String encoded as UTF-8, or copied `Uint8Array`; maximum 1 MiB of bytes. |
| `test(stream, context)` | Required | Return `void` or `Promise<void>`; resolving passes, throwing fails. Await the entire assertion. |
| `seed` | `42` | Integer in `[0, 4294967295]`; zero is a valid seed. |
| `runs` | `100` | Integer in `[1, 10000]`; total discovery budget including the baseline. |
| `maxShrinks` | `200` | Integer in `[0, 10000]`; reduction candidate evaluations; zero skips reduction. |
| `timeoutMs` | `2000` | Integer in `[1, 2147483647]`; per-callback deadline, including replay/reduction. |
| `signal` | None | Caller-owned `AbortSignal`; abort stops the entire check. |
| `failureKey(error)` | Error name + exact message | Synchronous callback returning a nonempty stable string identifying the bug class. |

Each immutable `TestContext` contains `signal` (fresh per evaluation), `fixture`,
`caseIndex` (zero-based discovery index, retained during shrinking), and `phase`
(`discovery`, `reproduce`, `shrink`, or `verify`). Use phase/index for diagnostics,
not to change the behavior being tested. The case signal is aborted at evaluation
completion as well as on interruption.

### Results

Both result variants contain `seed`, `cases` (actual discovery count), and
`evaluations` (all callback invocations). Results and nested metadata are frozen.

| Field | Passed | Failed |
| --- | --- | --- |
| `status` | `'passed'` | `'failed'` |
| `phase` | — | `'baseline'` if complete-input case fails, otherwise `'partition'`. |
| `failure` | — | Initial failure's normalized `{ name, message, key }`. |
| `originalFixture` | — | First failing partition. |
| `fixture` | — | Best confirmed reduced partition, suitable for replay. |
| `shrink.attempts` | — | Number of reduction candidates evaluated. |
| `shrink.budget` | — | Requested reduction budget. |
| `shrink.complete` | — | Every single-cut deletion from the final fixture was tested, or the fixture has no cuts. |

A passed run has `evaluations === cases`. A baseline failure is replayed once and
has two evaluations and zero shrink attempts. A partition failure adds a reproduction
check, reduction trials, and a final verification: `evaluations === cases + shrink.attempts + 2`.
The original failure message is retained even if a custom key accepts different messages.

### Errors

`StreamCheckError` extends `Error`, exposes `result: FailedResult`, and provides
`fixture` as a shortcut to `result.fixture`. Its message includes seed, phase,
discovery count, cut reduction, completion status, and replay JSON.

`StreamHarnessError` extends `Error` and has a `code`:

| Code | Meaning |
| --- | --- |
| `TIMEOUT` | A consumer callback did not settle before its deadline. |
| `ABORTED` | Caller cancelled; `cause` is the caller signal's reason. |
| `UNSTABLE_FAILURE` | A repeated fixture passed/failed differently or changed failure identity. |
| `INVALID_FAILURE_KEY` | Failure identity could not be computed; `cause` explains why. |

Invalid arguments throw `TypeError` or `RangeError`; malformed JSON throws
`SyntaxError`. `checkStream` returns failures only for valid, reproducible experiments.

## Fixtures and generation

`createFixture(input: StreamInput, cuts?: readonly number[]): StreamFixture`
copies input. Cuts default to `[]` and must be strictly increasing integer offsets
inside the payload: `0 < cut < byteLength`. At most 4,096 cuts; empty chunks are not
represented. Offsets count bytes, not JavaScript characters.

<!-- sutuy:run -->
```js
import assert from 'node:assert/strict';
import { createFixture, replay } from 'sutuy';

const fixture = createFixture('🌊', [1, 3]);
const chunks = [];
for await (const chunk of replay(fixture)) chunks.push([...chunk]);
assert.deepEqual(chunks, [[240], [159, 140], [138]]);
```

`replay(fixture): ReadableStream<Uint8Array>` validates and snapshots the fixture.
It yields a fresh copied chunk per pull with a zero high-water mark. Empty input
closes immediately. A replay is consumable once; call `replay` again for another run.

`serializeFixture(fixture): string` returns normalized, pretty JSON.
`parseFixture(json: string): StreamFixture` validates and freezes a JSON fixture.
Parsing accepts at most 3 MiB of JSON characters. The normalized version-1 shape:

```json
{ "version": 1, "encoding": "hex", "data": "f09f8c8a", "cuts": [1, 3] }
```

`data` is an even-length hex string representing at most 1 MiB. Uppercase hex is
accepted and normalized to lowercase. Unknown object fields are discarded.
Unknown versions/encodings, malformed hex, invalid cuts, and oversized inputs reject.

`streamCases(input, options?: CaseOptions): Generator<StreamFixture>` snapshots and
validates at the call, then lazily yields unique cases. `CaseOptions` has `seed` and
`runs` with the defaults above. Generation does not execute or reduce assertions.
See [generation semantics](./semantics.md#generation-and-reduction).

## Payload builders

`ndjson(values: Iterable<unknown>): string` serializes each record with
`JSON.stringify` and appends LF, including the last record. Empty iterable returns
`''`. Unserializable roots (`undefined`, function, symbol) reject; circular values
and BigInt retain native JSON errors. Normal JSON rules apply inside records
(for example, undefined object properties are omitted and NaN becomes null).

`sse(events: Iterable<SseEvent>, options?: SseOptions): string` builds data events.

| SSE field | Contract |
| --- | --- |
| `data` | Required string; CRLF, CR, and LF become separate `data:` lines. |
| `id` | Optional string without CR, LF, or NUL. |
| `event` | Optional string without CR or LF. |
| `retry` | Optional nonnegative safe integer. |
| `options.lineEnding` | `'\n'` by default; also accepts `'\r\n'`. |

Each event ends with a blank line. Empty data produces an explicit empty data event.
Empty iterable returns `''`. Builders enforce the same 1 MiB output limit.
They create synthetic input; they are not production protocol parsers.

Public types: `StreamInput`, `StreamFixture`, `CaseOptions`, `CheckOptions`,
`TestContext`, `CheckResult`, `PassedResult`, `FailedResult`, `FailureSummary`,
`HarnessErrorCode`, `SseEvent`, and `SseOptions`.
