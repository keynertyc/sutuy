# Runnable examples

From the project root, run `pnpm build && pnpm demo`. Every example uses synthetic
data and runs without network access. You can also run each file with Node.

| File | Demonstrates |
| --- | --- |
| [utf8.mjs](./utf8.mjs) | Find a decoder bug, reduce to one cut, replay it, verify the fixed decoder. |
| [ndjson.mjs](./ndjson.mjs) | Find chunk-by-chunk JSON parsing, compare with line buffering. |
| [sse.mjs](./sse.mjs) | Find a delimiter split between chunks; verify buffered LF/CRLF parsing. |
| [fetch.mjs](./fetch.mjs) | Inject fresh `Response` objects into a consumer without global patches. |
| [replay.mjs](./replay.mjs) | Load a checked-in JSON fixture and exercise the repaired consumer. |

[consumers.mjs](./consumers.mjs) contains teaching implementations. The SSE helper
handles data fields and LF/CRLF lines only; it is not a complete SSE parser. Sutuy's
public API generates test payloads and runs your assertions; it does not export these consumers.
