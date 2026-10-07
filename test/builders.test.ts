import { expect, test } from 'vitest';
import { ndjson, sse } from '../src/index.js';

test('builders preserve Unicode, multiline SSE data, and exact record framing', () => {
  expect(ndjson([{ message: '🌊' }, 0, null])).toBe('{"message":"🌊"}\n0\nnull\n');
  expect(
    sse([{ data: 'uno\r\ndos\rtres\n', id: '7', event: 'message', retry: 1000 }], {
      lineEnding: '\r\n',
    }),
  ).toBe(
    'id: 7\r\nevent: message\r\nretry: 1000\r\ndata: uno\r\ndata: dos\r\ndata: tres\r\ndata: \r\n\r\n',
  );
});

test('empty builders return an empty payload and empty data still forms an event', () => {
  expect(ndjson([])).toBe('');
  expect(sse([])).toBe('');
  expect(sse([{ data: '' }])).toBe('data: \n\n');
});

test.each([undefined, () => {}, Symbol('bad')])(
  'rejects unserializable NDJSON roots: %j',
  (value) => {
    expect(() => ndjson([value])).toThrow(TypeError);
  },
);

test('preserves native JSON errors and bounds accumulated builder output', () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  expect(() => ndjson([circular])).toThrow(TypeError);
  expect(() => ndjson([1n])).toThrow(TypeError);
  expect(() => ndjson(['a'.repeat(600_000), 'b'.repeat(600_000)])).toThrow(/1 MiB/);
});

test.each([
  { data: '', id: 'a\nb' },
  { data: '', id: String.fromCharCode(0) },
  { data: '', event: 'a\rb' },
  { data: '', retry: -1 },
  { data: '', retry: 0.5 },
])('rejects malformed SSE fields: %j', (event) => {
  expect(() => sse([event])).toThrow();
});

test('rejects invalid JavaScript inputs before building events', () => {
  // @ts-expect-error Exercise untyped JavaScript callers.
  expect(() => sse([{ data: 1 }])).toThrow(TypeError);
  // @ts-expect-error Exercise untyped JavaScript callers.
  expect(() => sse([], { lineEnding: 'x' })).toThrow(TypeError);
});
