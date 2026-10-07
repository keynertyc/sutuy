# Guarantees and limits

## Bytes, chunks, and messages

The character `🌊` is four UTF-8 bytes: `f0 9f 8c 8a`. A stream may deliver them as
one chunk, four chunks, or any contiguous partition. Delivery chunks are not
characters, JSON records, or SSE events. Your consumer must buffer what its protocol needs.

Sutuy preserves byte values and order. It changes only where a chunk ends. A fixture
stores the complete bytes and explicit boundaries, including invalid UTF-8 and NUL.
All public fixture data is immutable. Input buffers, boundary arrays, and replayed
chunks are isolated from subsequent external mutation.

Replay uses a default WHATWG stream, not a BYOB byte source. It has no delayed
delivery, empty chunks, injected source errors, or background reader. Each requested
read gets the next chunk; cancellation stops the source. This tests consumer chunk
handling, not socket behavior or timing-dependent backpressure bugs.

## Generation and reduction

Generator version 1 yields:

1. The complete input in one chunk (zero chunks for empty input).
2. A dense partition: every byte up to 257 bytes, otherwise 256 evenly spaced cuts.
3. Up to 16 single cuts at UTF-8 continuation positions and up to 16 at framing
   positions (before/after CR or LF and before `:`), spread through the payload.
4. Seeded combinations: shuffled exhaustive masks for inputs up to 12 bytes;
   otherwise bounded random sampling with at most 32 cuts per candidate.

Duplicates do not count. `runs` caps all discovery cases together. Tiny inputs can
exhaust their partitions; larger generation has a finite attempt limit and can also
return fewer cases. The same bytes, options, seed, and Sutuy generator version yield
the same ordered suite. Save fixtures for durable reproduction across releases;
generation policy can evolve and a seed alone is not a permanent fixture.

The first failure stops discovery. Sutuy repeats it, then uses deletion-based
delta debugging: try removing groups of cuts, refine to individual cuts, and retain
only candidates with the same failure key. The payload remains unchanged. Each
candidate invocation costs one shrink attempt, including previously seen candidates.
The final fixture is replayed again. A baseline failure is confirmed but needs no reduction.

`shrink.complete` means no individual remaining cut can be removed while preserving
the selected failure, as observed in the completed search. This is deletion-local
minimality, not a globally minimum cut count, a minimum payload, or a proof against
all possible partitions. When the budget expires, `complete` is false and the best
confirmed fixture is still returned. Increasing `maxShrinks` can finish that search.

## Failure identity

By default, an `Error` is identified by its name and exact message. Cause, stack,
and custom error fields are not compared. Primitive throws also have stable keys.
Arbitrary objects, functions, symbols, and cross-realm errors need an explicit
`failureKey` (or normalization into a local `Error`).

Assertion libraries may include received values in messages. Those messages can
change as cuts are removed, preventing useful reduction. Supply a stable key for
the particular invariant you are checking. Classify distinct bugs separately;
returning the same key for every error can merge unrelated failures.

```ts
failureKey: (error) => {
  if (error instanceof Error && error.name === 'AssertionError') {
    return 'decoded-records-equal-expected';
  }
  if (error instanceof Error) return `${error.name}:${error.message}`;
  throw new TypeError('Unexpected thrown value');
}
```

Keep callback state local to each invocation. Fixed synthetic inputs and isolated
consumers work best. Network requests, timestamps, random assertion data, reused
readers, and global counters can make reproduction inconsistent. Sutuy rejects
observed inconsistencies for repeated fixtures; finite rechecks cannot detect all flakiness.

## Deadlines, aborts, and cleanup

Trials run serially. Each receives a fresh stream and `AbortSignal`. Sutuy removes
its timer and caller abort listener after every invocation, aborts the case signal,
and errors an unfinished source to settle outstanding reads even if a reader is locked.
Release consumer-owned resources in your own `finally` blocks. Await work started
inside the callback; detached work is not part of the assertion.

A timeout or caller abort stops the whole run. Cancellation wins over a callback
resolving in response to that cancellation. The runner never starts a subsequent
trial after an interrupted callback. It cannot forcibly terminate external promises,
detached work, synchronous infinite loops, or CPU work that blocks the event loop.
Pass the supplied signal to cooperative operations. The timeout is per callback,
not an overall run limit; use a caller `AbortSignal` for an overall deadline.

## Scope and compatibility

Passing means the assertion held for the executed cases only. No automatic comparison
with baseline output replaces your assertions. A callback that does not assert an
invariant can pass a broken consumer. Testing an already buffered response checks
only that buffering path; inject the stream before your parser when testing incremental behavior.

No truncation, delays, reconnects, production traffic capture, protocol repair,
WebSockets, or payload minimization are included. This release focuses on boundary
failures and portable reproductions. Fixture materialization uses memory proportional
to input; it is not intended for gigabyte streams.

The runtime has zero package dependencies and no Node imports. The development and
packed-artifact checks run on Node, and CI is configured for Node 22, 24, and 26.
Browser-engine execution is not part of the current automated matrix. Web API use
alone does not establish compatibility with every browser or edge runtime.
