import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'sutuy-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, npm_config_cache: join(temp, 'cache'), NODE_PATH: '' },
  });
try {
  const packOutput = JSON.parse(
    run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root),
  );
  // npm 11 returns an array; npm 12 keys the results by package name.
  const packs = Array.isArray(packOutput) ? packOutput : Object.values(packOutput);
  assert.equal(packs.length, 1, 'Expected exactly one packed package');
  const [pack] = packs;
  const allowed =
    /^(dist\/|docs\/|examples\/|README(?:\.es)?\.md$|LICENSE$|CONTRIBUTING\.md$|CHANGELOG\.md$|package\.json$)/;
  for (const file of pack.files)
    assert.match(file.path, allowed, `Unexpected tarball file: ${file.path}`);
  for (const required of [
    'dist/index.js',
    'dist/index.d.ts',
    'LICENSE',
    'README.md',
    'docs/api.md',
    'examples/demo.mjs',
  ]) {
    assert.ok(
      pack.files.some((file) => file.path === required),
      `Missing ${required}`,
    );
  }
  const bundle = readFileSync(join(root, 'dist/index.js'), 'utf8');
  assert.doesNotMatch(bundle, /(?:from\s*|import\s*)['"](?:node:|vitest|@vitest|typescript)/);
  assert.ok(gzipSync(bundle).length < 10_000, 'Core bundle must stay below 10 kB gzip');

  const consumer = join(temp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'sutuy-consumer', private: true, type: 'module' }),
  );
  run(
    npm,
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temp, pack.filename),
    ],
    consumer,
  );
  const installed = JSON.parse(
    readFileSync(join(consumer, 'node_modules/sutuy/package.json'), 'utf8'),
  );
  assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
  assert.equal(Object.keys(installed.peerDependencies ?? {}).length, 0);
  for (const hook of ['preinstall', 'install', 'postinstall'])
    assert.equal(installed.scripts[hook], undefined);

  run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { assertStream, checkStream, createFixture, replay } from 'sutuy';
    assert.equal(await new Response(replay(createFixture('🌊', [1]))).text(), '🌊');
    await assertStream({ input: '🌊', test: async s => assert.equal(await new Response(s).text(), '🌊') });
    const result = await checkStream({ input: '🌊', test: async stream => {
      let text = '';
      for await (const chunk of stream) text += new TextDecoder().decode(chunk);
      if (text !== '🌊') throw new Error('broken');
    }});
    assert.equal(result.status, 'failed');
    assert.equal(result.fixture.cuts.length, 1);
  `,
    ],
    consumer,
  );
  run(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `
    const assert = require('node:assert/strict');
    const { createFixture, replay } = require('sutuy');
    new Response(replay(createFixture('commonjs', [3]))).text().then(text => assert.equal(text, 'commonjs'));
  `,
    ],
    consumer,
  );

  writeFileSync(
    join(consumer, 'consumer.ts'),
    `
    import { checkStream, replay, type StreamFixture } from 'sutuy';
    const result = await checkStream({ input: '🌊', test: async (stream, context) => {
      const signal: AbortSignal = context.signal;
      signal.throwIfAborted();
      await new Response(stream).text();
    }});
    if (result.status === 'failed') {
      const fixture: StreamFixture = result.fixture;
      const stream: ReadableStream<Uint8Array> = replay(fixture);
      await stream.cancel();
      // @ts-expect-error fixtures are readonly.
      fixture.cuts.push(1);
    } else {
      // @ts-expect-error passed results have no counterexample.
      result.fixture;
    }
  `,
  );
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        strict: true,
        noEmit: true,
        types: [],
        skipLibCheck: false,
      },
      include: ['consumer.ts'],
    }),
  );
  run(
    join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc'),
    ['--project', join(consumer, 'tsconfig.json')],
    consumer,
  );
  const output = run(process.execPath, ['node_modules/sutuy/examples/demo.mjs'], consumer);
  console.log(output.trim());
  console.log(
    `Packed package: ${pack.files.length} files, ${pack.size} bytes; isolated ESM, require(esm), strict types, and demos passed.`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
