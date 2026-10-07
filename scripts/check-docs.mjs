import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  ...['README.md', 'README.es.md', 'CONTRIBUTING.md', 'CHANGELOG.md'].map((file) =>
    join(root, file),
  ),
  ...['docs', 'examples'].flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((file) => file.endsWith('.md'))
      .map((file) => join(root, dir, file)),
  ),
];
let blocks = 0;
let links = 0;
for (const file of files) {
  const markdown = readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/\]\((\.[^\s)]+)\)/g)) {
    const target = resolve(dirname(file), decodeURIComponent(match[1].split('#')[0]));
    assert.ok(existsSync(target), `Broken relative link in ${file}: ${match[1]}`);
    links++;
  }
  for (const match of markdown.matchAll(/<!-- sutuy:run -->\s*```js\n([\s\S]*?)\n```/g)) {
    execFileSync(process.execPath, ['--input-type=module', '-e', match[1]], {
      cwd: root,
      stdio: 'pipe',
      timeout: 15_000,
    });
    blocks++;
  }
}
assert.ok(blocks >= 4, 'Expected executable examples in the public documentation');
console.log(`Documentation: ${blocks} executable blocks and ${links} relative links passed.`);
