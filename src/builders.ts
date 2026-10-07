import { integerOption } from './cases.js';
import { inputBytes, MAX_BYTES } from './fixture.js';
import type { SseEvent, SseOptions } from './types.js';

function joinPayload(records: Iterable<string>): string {
  const parts: string[] = [];
  let length = 0;
  for (const record of records) {
    length += inputBytes(record).length;
    if (length > MAX_BYTES) throw new RangeError('builder payload exceeds 1 MiB');
    parts.push(record);
  }
  return parts.join('');
}

/** Build a newline-terminated NDJSON test payload using JSON.stringify semantics. */
export function ndjson(values: Iterable<unknown>): string {
  return joinPayload(
    (function* () {
      for (const value of values) {
        const json = JSON.stringify(value);
        if (json === undefined) throw new TypeError('each NDJSON record must be JSON serializable');
        yield `${json}\n`;
      }
    })(),
  );
}

/** Build dispatched SSE data events, including multiline data and optional metadata. */
export function sse(events: Iterable<SseEvent>, options: SseOptions = {}): string {
  const eol = options.lineEnding ?? '\n';
  if (eol !== '\n' && eol !== '\r\n') throw new TypeError('lineEnding must be LF or CRLF');
  return joinPayload(
    (function* () {
      for (const event of events) {
        if (typeof event.data !== 'string') throw new TypeError('SSE data must be a string');
        inputBytes(event.data);
        const lines: string[] = [];
        for (const field of ['id', 'event'] as const) {
          const value = event[field];
          if (value === undefined) continue;
          if (
            typeof value !== 'string' ||
            /[\r\n]/.test(value) ||
            (field === 'id' && value.includes(String.fromCharCode(0)))
          ) {
            throw new TypeError(
              `SSE ${field} must be a single line${field === 'id' ? ' without NUL' : ''}`,
            );
          }
          lines.push(`${field}: ${value}`);
        }
        if (event.retry !== undefined)
          lines.push(`retry: ${integerOption('retry', event.retry, 0, Number.MAX_SAFE_INTEGER)}`);
        for (const line of event.data.split(/\r\n|\r|\n/)) lines.push(`data: ${line}`);
        yield `${lines.join(eol)}${eol}${eol}`;
      }
    })(),
  );
}
