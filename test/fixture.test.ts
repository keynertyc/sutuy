import { expect, test } from 'vitest';
import { createFixture, parseFixture, replay, serializeFixture } from '../src/index.js';

test('a portable fixture replays exact binary chunks and survives a JSON round trip', async () => {
  const fixture = createFixture(new Uint8Array([0, 255, 128, 10]), [1, 3]);
  const chunks: number[][] = [];
  for await (const chunk of replay(parseFixture(serializeFixture(fixture)))) {
    chunks.push([...chunk]);
  }
  expect(chunks).toEqual([[0], [255, 128], [10]]);
  expect(fixture).toEqual({ version: 1, encoding: 'hex', data: '00ff800a', cuts: [1, 3] });
});

test('snapshots input and boundaries, freezes metadata, and isolates replayed buffers', async () => {
  const bytes = Buffer.from([1, 2, 3]);
  const cuts = [1];
  const fixture = createFixture(bytes, cuts);
  bytes.fill(9);
  cuts[0] = 2;
  expect(Object.isFrozen(fixture)).toBe(true);
  expect(Object.isFrozen(fixture.cuts)).toBe(true);
  const first = replay(fixture).getReader();
  (await first.read()).value?.fill(0);
  await first.cancel();
  expect(await new Response(replay(fixture)).bytes()).toEqual(new Uint8Array([1, 2, 3]));
});

test('empty input closes immediately, and strings use UTF-8 byte offsets', async () => {
  expect(await replay(createFixture('')).getReader().read()).toEqual({
    done: true,
    value: undefined,
  });
  const reader = replay(createFixture('🌊', [1, 3])).getReader();
  expect((await reader.read()).value).toEqual(new Uint8Array([240]));
  expect((await reader.read()).value).toEqual(new Uint8Array([159, 140]));
  expect((await reader.read()).value).toEqual(new Uint8Array([138]));
  expect((await reader.read()).done).toBe(true);
});

test.each([[0], [3], [1, 1], [2, 1], [1.5], [-1], [NaN]].map((cuts) => ({ cuts })))(
  'rejects invalid cuts $cuts',
  ({ cuts }) => {
    expect(() => createFixture('abc', cuts)).toThrow(/cuts/);
  },
);

test.each([
  null,
  {},
  { version: 2, encoding: 'hex', data: '', cuts: [] },
  { version: 1, encoding: 'utf8', data: '', cuts: [] },
  { version: 1, encoding: 'hex', data: 1, cuts: [] },
  { version: 1, encoding: 'hex', data: '0', cuts: [] },
  { version: 1, encoding: 'hex', data: 'gg', cuts: [] },
  { version: 1, encoding: 'hex', data: '', cuts: null },
])('rejects malformed fixture %j', (value) => {
  expect(() => parseFixture(JSON.stringify(value))).toThrow();
});

test('normalizes hex casing and ignores extension metadata', () => {
  expect(parseFixture('{"version":1,"encoding":"hex","data":"FF","cuts":[],"note":true}')).toEqual(
    createFixture(new Uint8Array([255])),
  );
});

test('enforces size bounds before replay and generation', () => {
  expect(() => createFixture('a'.repeat(1_048_577))).toThrow(/1 MiB/);
  expect(() => createFixture('🌊'.repeat(300_000))).toThrow(/UTF-8/);
  expect(() =>
    createFixture(
      'a'.repeat(5000),
      Array.from({ length: 4097 }, (_, i) => i + 1),
    ),
  ).toThrow(/4096/);
  expect(() => parseFixture(' '.repeat(3 * 1_048_576 + 1))).toThrow(/3 MiB/);
  expect(() =>
    parseFixture(
      JSON.stringify({ version: 1, encoding: 'hex', data: '00'.repeat(1_048_577), cuts: [] }),
    ),
  ).toThrow(/1 MiB/);
});

test('rejects invalid JavaScript inputs and malformed JSON', () => {
  // @ts-expect-error Exercise untyped callers.
  expect(() => createFixture([1, 2])).toThrow(TypeError);
  // @ts-expect-error Exercise untyped callers.
  expect(() => parseFixture({})).toThrow(TypeError);
  expect(() => parseFixture('{')).toThrow(SyntaxError);
});
