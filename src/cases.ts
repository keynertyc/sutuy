import { createFixture, inputBytes, withCuts } from './fixture.js';
import type { CaseOptions, StreamFixture, StreamInput } from './types.js';

export function integerOption(name: string, value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

// Mulberry32: an explicitly versioned test-data generator, not a cryptographic RNG.
function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function* partitions(bytes: Uint8Array, seed: number, runs: number): Generator<number[]> {
  yield [];
  const count = bytes.length - 1;
  if (count <= 0) return;
  const denseCount = Math.min(count, 256);
  yield Array.from({ length: denseCount }, (_, i) =>
    Math.floor(((i + 1) * bytes.length) / (denseCount + 1)),
  );

  const utf8: number[] = [];
  const framing: number[] = [];
  for (let i = 1; i < bytes.length; i++) {
    const byte = bytes[i] as number;
    const before = bytes[i - 1];
    if ((byte & 0xc0) === 0x80) utf8.push(i);
    if (byte === 10 || byte === 13 || before === 10 || before === 13 || byte === 58)
      framing.push(i);
  }
  // Spread targeted single cuts over the whole payload, leaving room for combinations.
  for (const targets of [utf8, framing]) {
    const samples = Math.min(16, targets.length);
    for (let i = 0; i < samples; i++)
      yield [targets[Math.floor((i * targets.length) / samples)] as number];
  }

  const random = randomSource(seed);
  if (count <= 11) {
    const masks = Array.from({ length: 2 ** count }, (_, i) => i);
    for (let i = masks.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [masks[i], masks[j]] = [masks[j] as number, masks[i] as number];
    }
    for (const mask of masks) {
      yield Array.from({ length: count }, (_, i) => i + 1).filter((cut) => mask & (1 << (cut - 1)));
    }
    return;
  }
  for (let attempt = 0; attempt < runs * 10 + 100; attempt++) {
    const size = 1 + Math.floor(random() * Math.min(count, 32));
    const cuts = new Set<number>();
    // Sample without replacement in bounded time (Floyd's algorithm).
    for (let j = count - size + 1; j <= count; j++) {
      const candidate = 1 + Math.floor(random() * j);
      cuts.add(cuts.has(candidate) ? j : candidate);
    }
    yield [...cuts].sort((a, b) => a - b);
  }
}

/** Generator version 1. A fixture, rather than a seed, is the durable replay contract. */
export function streamCases(
  input: StreamInput,
  options: CaseOptions = {},
): Generator<StreamFixture> {
  const seed = integerOption('seed', options.seed ?? 42, 0, 0xffff_ffff);
  const runs = integerOption('runs', options.runs ?? 100, 1, 10_000);
  const bytes = inputBytes(input);
  const baseline = createFixture(bytes);
  return (function* () {
    const seen = new Set<string>();
    for (const cuts of partitions(bytes, seed, runs)) {
      const key = cuts.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      yield withCuts(baseline.data, cuts);
      if (seen.size >= runs) return;
    }
  })();
}
