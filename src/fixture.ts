import type { StreamFixture, StreamInput } from './types.js';

export const MAX_BYTES = 1_048_576;
export const MAX_CUTS = 4_096;

export function inputBytes(input: StreamInput): Uint8Array {
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) {
    throw new TypeError('input must be a string or Uint8Array');
  }
  if (input.length > MAX_BYTES) throw new RangeError('input exceeds 1 MiB');
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  if (bytes.length > MAX_BYTES) throw new RangeError('input exceeds 1 MiB of UTF-8 bytes');
  return bytes;
}

export function withCuts(data: string, cuts: readonly number[]): StreamFixture {
  return Object.freeze({ version: 1, encoding: 'hex', data, cuts: Object.freeze([...cuts]) });
}

function validateCuts(cuts: readonly number[], length: number): void {
  if (!Array.isArray(cuts)) throw new TypeError('cuts must be an array');
  if (cuts.length > MAX_CUTS) throw new RangeError('a fixture supports at most 4096 cuts');
  let previous = 0;
  for (const cut of cuts) {
    if (!Number.isSafeInteger(cut) || cut <= previous || cut >= length) {
      throw new RangeError('cuts must be strictly increasing integer offsets inside the payload');
    }
    previous = cut;
  }
}

export function createFixture(input: StreamInput, cuts: readonly number[] = []): StreamFixture {
  const bytes = inputBytes(input);
  validateCuts(cuts, bytes.length);
  const data = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return withCuts(data, cuts);
}

function validateFixture(value: unknown): StreamFixture {
  if (!value || typeof value !== 'object') throw new TypeError('fixture must be an object');
  const fixture = value as Record<string, unknown>;
  if (fixture.version !== 1 || fixture.encoding !== 'hex') {
    throw new TypeError('unsupported fixture: expected version 1 and hex encoding');
  }
  if (typeof fixture.data !== 'string') throw new TypeError('fixture.data must be a hex string');
  if (fixture.data.length > MAX_BYTES * 2) throw new RangeError('fixture exceeds 1 MiB');
  if (fixture.data.length % 2 !== 0 || !/^[\da-f]*$/i.test(fixture.data)) {
    throw new TypeError('fixture.data must contain complete hexadecimal byte pairs');
  }
  validateCuts(fixture.cuts as readonly number[], fixture.data.length / 2);
  return withCuts(fixture.data.toLowerCase(), fixture.cuts as number[]);
}

export function parseFixture(text: string): StreamFixture {
  if (typeof text !== 'string') throw new TypeError('fixture JSON must be a string');
  if (text.length > 3 * MAX_BYTES) throw new RangeError('fixture JSON exceeds 3 MiB of characters');
  return validateFixture(JSON.parse(text));
}

export function serializeFixture(fixture: StreamFixture): string {
  return JSON.stringify(validateFixture(fixture), null, 2);
}

/** Internal ownership handle lets the harness settle reads even when the consumer holds a lock. */
export function openReplay(value: StreamFixture): {
  stream: ReadableStream<Uint8Array>;
  dispose: (reason: unknown) => void;
} {
  const fixture = validateFixture(value);
  const bytes = new Uint8Array(fixture.data.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(fixture.data.slice(i * 2, i * 2 + 2), 16);
  const ends = [...fixture.cuts, bytes.length];
  let offset = 0;
  let index = 0;
  let ended = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(source) {
        controller = source;
        if (bytes.length === 0) {
          ended = true;
          source.close();
        }
      },
      pull(source) {
        const end = ends[index++] as number;
        source.enqueue(bytes.slice(offset, end));
        offset = end;
        if (offset === bytes.length) {
          ended = true;
          source.close();
        }
      },
      cancel() {
        ended = true;
      },
    },
    { highWaterMark: 0 },
  );
  return {
    stream,
    dispose(reason) {
      if (!ended) {
        ended = true;
        controller.error(reason);
      }
    },
  };
}

export function replay(fixture: StreamFixture): ReadableStream<Uint8Array> {
  return openReplay(fixture).stream;
}
