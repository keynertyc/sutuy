import { expect, test } from 'vitest';
import {
  assertStream,
  checkStream,
  replay,
  StreamCheckError,
  StreamHarnessError,
} from '../src/index.js';

async function brokenUtf8(stream: ReadableStream<Uint8Array>): Promise<void> {
  let value = '';
  for await (const chunk of stream) value += new TextDecoder().decode(chunk);
  if (value !== 'Hello 🌊!') throw new Error('corrupted UTF-8');
}

test('finds a UTF-8 bug, removes irrelevant boundaries, and preserves a replayable failure', async () => {
  const result = await checkStream({ input: 'Hello 🌊!', test: brokenUtf8 });
  expect(result.status).toBe('failed');
  if (result.status !== 'failed') throw new Error('expected counterexample');
  expect(result.phase).toBe('partition');
  expect(result.originalFixture.cuts.length).toBeGreaterThan(result.fixture.cuts.length);
  expect(result.fixture.cuts).toHaveLength(1);
  expect(result.shrink.complete).toBe(true);
  expect(result.failure.message).toBe('corrupted UTF-8');
  await expect(brokenUtf8(replay(result.fixture))).rejects.toThrow('corrupted UTF-8');
  const corrected = await checkStream({
    input: 'Hello 🌊!',
    test: async (stream) => {
      expect(await new Response(stream).text()).toBe('Hello 🌊!');
    },
  });
  expect(corrected.status).toBe('passed');
});

test('reports baseline failures without suggesting chunk sensitivity', async () => {
  const result = await checkStream({
    input: 'anything',
    test: () => {
      throw new Error('always broken');
    },
  });
  expect(result).toMatchObject({
    status: 'failed',
    phase: 'baseline',
    cases: 1,
    evaluations: 2,
    shrink: { attempts: 0, complete: true },
  });
});

test.each([0, 1])(
  'reports incomplete reduction at budget %i and verifies the saved fixture',
  async (maxShrinks) => {
    const result = await checkStream({ input: 'Hello 🌊!', test: brokenUtf8, maxShrinks });
    if (result.status !== 'failed') throw new Error('expected failure');
    expect(result.shrink).toEqual({ attempts: maxShrinks, budget: maxShrinks, complete: false });
    expect(result.evaluations).toBe(result.cases + maxShrinks + 2);
    await expect(brokenUtf8(replay(result.fixture))).rejects.toThrow('corrupted UTF-8');
  },
);

test('never replaces the original failure with an easier, different failure', async () => {
  const result = await checkStream({
    input: 'abcd',
    test: async (stream) => {
      let count = 0;
      for await (const _chunk of stream) count++;
      if (count >= 3) throw new Error('original');
      if (count === 2) throw new Error('different');
    },
  });
  if (result.status !== 'failed') throw new Error('expected failure');
  expect(result.failure.message).toBe('original');
  expect(result.fixture.cuts).toHaveLength(2);
  expect(result.shrink.complete).toBe(true);
});

test('custom failure keys support assertion messages that vary across partitions', async () => {
  const result = await checkStream({
    input: 'abcdef',
    failureKey: () => 'incomplete-record',
    test: async (stream) => {
      const { value } = await stream.getReader().read();
      if (value?.length !== 6) throw new Error(`received ${value?.length} bytes`);
    },
  });
  if (result.status !== 'failed') throw new Error('expected failure');
  expect(result.fixture.cuts).toHaveLength(1);
  expect(result.failure.key).toBe('incomplete-record');
});

test('assertStream attaches replay data and useful context to its failure', async () => {
  await expect(assertStream({ input: '', test: () => {} })).resolves.toBeUndefined();
  try {
    await assertStream({ input: 'Hello 🌊!', test: brokenUtf8 });
    throw new Error('expected StreamCheckError');
  } catch (error) {
    expect(error).toBeInstanceOf(StreamCheckError);
    if (!(error instanceof StreamCheckError)) throw error;
    expect(error.fixture).toBe(error.result.fixture);
    expect(error.message).toContain('seed 42');
    expect(error.message).toContain('"version": 1');
  }
});

test('rejects flaky reproduction instead of reporting a minimized counterexample', async () => {
  let calls = 0;
  await expect(
    checkStream({
      input: 'abc',
      test: () => {
        if (++calls === 1) throw new Error('flaky');
      },
    }),
  ).rejects.toMatchObject({ code: 'UNSTABLE_FAILURE' });
});

test('rejects instability introduced only at final verification', async () => {
  await expect(
    checkStream({
      input: 'abc',
      maxShrinks: 0,
      test: (_stream, { fixture, phase }) => {
        if (fixture.cuts.length && phase !== 'verify') throw new Error('flaky');
      },
    }),
  ).rejects.toMatchObject({ code: 'UNSTABLE_FAILURE' });
});

test('validates options without invoking the consumer', async () => {
  let called = false;
  for (const options of [{ timeoutMs: 0 }, { maxShrinks: -1 }, { runs: 0 }, { seed: -1 }]) {
    await expect(
      checkStream({
        input: '',
        test: () => {
          called = true;
        },
        ...options,
      }),
    ).rejects.toBeInstanceOf(RangeError);
  }
  expect(called).toBe(false);
});

test.each([undefined, null, 123, false, 'failure'])(
  'gives primitive throws a stable identity: %j',
  async (error) => {
    const result = await checkStream({
      input: '',
      test: () => {
        throw error;
      },
    });
    expect(result.status).toBe('failed');
  },
);

test('requires explicit identity for arbitrary objects and rejects broken key functions', async () => {
  for (const failureKey of [
    undefined,
    () => '',
    () => {
      throw new Error('key bug');
    },
  ]) {
    await expect(
      checkStream({
        input: '',
        test: () => {
          throw { code: 12 };
        },
        ...(failureKey ? { failureKey } : {}),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FAILURE_KEY' });
  }
  expect(
    (
      await checkStream({
        input: '',
        test: () => {
          throw { code: 12 };
        },
        failureKey: () => 'code:12',
      })
    ).status,
  ).toBe('failed');
});

test('timeout aborts the case signal, settles open readers, and never starts another trial', async () => {
  let calls = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let signal: AbortSignal | undefined;
  await expect(
    checkStream({
      input: 'abc',
      timeoutMs: 10,
      test: (stream, context) => {
        calls++;
        reader = stream.getReader();
        signal = context.signal;
        return new Promise(() => {});
      },
    }),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  expect(calls).toBe(1);
  expect(signal?.aborted).toBe(true);
  await expect(reader?.read()).rejects.toBeInstanceOf(StreamHarnessError);
});

test('caller abort takes precedence over a consumer reacting to its signal', async () => {
  const controller = new AbortController();
  await expect(
    checkStream({
      input: 'abc',
      signal: controller.signal,
      test: (_stream, { signal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve());
          controller.abort('user stopped');
        }),
    }),
  ).rejects.toMatchObject({ code: 'ABORTED', cause: 'user stopped' });
});

test('already aborted runs never invoke the callback', async () => {
  let called = false;
  await expect(
    checkStream({
      input: '',
      signal: AbortSignal.abort(),
      test: () => {
        called = true;
      },
    }),
  ).rejects.toMatchObject({ code: 'ABORTED' });
  expect(called).toBe(false);
});

test('each case is fresh and cleanup closes readers retained after a successful callback', async () => {
  const signals = new Set<AbortSignal>();
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const result = await checkStream({
    input: 'abc',
    test: (stream, { signal, fixture }) => {
      expect(Object.isFrozen(fixture)).toBe(true);
      signals.add(signal);
      readers.push(stream.getReader());
    },
  });
  expect(result.cases).toBe(4);
  expect(signals.size).toBe(4);
  expect([...signals].every((signal) => signal.aborted)).toBe(true);
  for (const reader of readers)
    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
});

test('validates callable options from JavaScript', async () => {
  // @ts-expect-error Exercise untyped callers.
  await expect(checkStream({ input: '', test: true })).rejects.toThrow(TypeError);
  // @ts-expect-error Exercise untyped callers.
  await expect(checkStream({ input: '', test: () => {}, failureKey: true })).rejects.toThrow(
    TypeError,
  );
});

test('assert errors label unfinished reduction honestly', async () => {
  await expect(
    assertStream({ input: 'Hello 🌊!', test: brokenUtf8, maxShrinks: 0 }),
  ).rejects.toThrow('budget exhausted');
});
