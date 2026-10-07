import { expect, test } from 'vitest';
import { replay, streamCases } from '../src/index.js';

test('deterministic, unique exploration starts with the baseline and preserves bytes', async () => {
  const input = new Uint8Array([0, 255, 10, 240, 159, 140, 138, 13, 10, 42, 0, 128, 1]);
  const cases = [...streamCases(input, { seed: 0, runs: 60 })];
  expect(cases).toEqual([...streamCases(input, { seed: 0, runs: 60 })]);
  expect(cases).not.toEqual([...streamCases(input, { seed: 1, runs: 60 })]);
  expect(cases[0]?.cuts).toEqual([]);
  expect(cases).toHaveLength(60);
  expect(new Set(cases.map((value) => value.cuts.join(','))).size).toBe(cases.length);
  for (const fixture of cases) {
    expect(await new Response(replay(fixture)).bytes()).toEqual(input);
  }
});

test('exhausts tiny payloads honestly and respects the total budget', () => {
  expect([...streamCases('')]).toHaveLength(1);
  expect([...streamCases('x')]).toHaveLength(1);
  expect([...streamCases('abcd')]).toHaveLength(8);
  expect([...streamCases('abcd', { runs: 1 })].map((x) => x.cuts)).toEqual([[]]);
});

test('bounds dense cases for large inputs and snapshots before iteration', () => {
  const bytes = new Uint8Array(8000).fill(42);
  const cases = streamCases(bytes, { runs: 3 });
  bytes.fill(0);
  const fixtures = [...cases];
  expect(fixtures).toHaveLength(3);
  expect(fixtures[1]?.cuts).toHaveLength(256);
  expect(fixtures.every((fixture) => fixture.data === '2a'.repeat(8000))).toBe(true);
});

test.each([
  { seed: -1 },
  { seed: 2 ** 32 },
  { seed: 1.5 },
  { seed: NaN },
  { runs: 0 },
  { runs: 10_001 },
  { runs: Infinity },
])('validates options before yielding: %j', (options) => {
  expect(() => streamCases('abc', options)).toThrow(RangeError);
});

test('contains single cuts inside UTF-8 and CRLF framing', () => {
  const cases = [...streamCases('data: 🌊\r\n\r\n', { runs: 30 })];
  expect(cases.some((x) => x.cuts.length === 1 && x.cuts[0] === 7)).toBe(true);
  expect(cases.some((x) => x.cuts.length === 1 && x.cuts[0] === 11)).toBe(true);
});

test('locks generator version 1 to a known seeded sequence', () => {
  expect([...streamCases('abcdefghijklmn', { seed: 42, runs: 5 })].map((x) => x.cuts)).toEqual([
    [],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    [2, 3, 4, 6, 8, 10, 12, 13],
    [2, 3, 4, 7, 8, 9, 12],
    [1, 4, 6, 7, 9, 11, 12, 13],
  ]);
});

test('binary conformance holds over many seeds and lengths', async () => {
  for (let seed = 0; seed < 20; seed++) {
    const input = Uint8Array.from({ length: seed * 7 }, (_, index) => (index * 131 + seed) % 256);
    for (const fixture of streamCases(input, { seed, runs: 12 })) {
      expect(await new Response(replay(fixture)).bytes()).toEqual(input);
      expect(
        fixture.cuts.every(
          (cut, index) => cut > (fixture.cuts[index - 1] ?? 0) && cut < input.length,
        ),
      ).toBe(true);
    }
  }
});
