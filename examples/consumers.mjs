// Teaching consumers for these examples, not general-purpose production parsers.
export async function decodeUtf8(stream) {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

async function* lines(stream) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let end = buffer.indexOf('\n');
    while (end !== -1) {
      yield buffer.slice(0, end).replace(/\r$/, '');
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer) yield buffer;
}

export async function readNdjson(stream) {
  const values = [];
  for await (const line of lines(stream)) {
    if (line.trim()) values.push(JSON.parse(line));
  }
  return values;
}

// Data-only SSE subset with LF/CRLF endings. Intentionally omits id, event,
// retry, BOM, bare-CR lines, and reconnection behavior.
export async function readSseData(stream) {
  const events = [];
  let data = [];
  for await (const line of lines(stream)) {
    if (line === '') {
      if (data.length) events.push(data.join('\n'));
      data = [];
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  return events;
}
