import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * DLV-1026: no line of the TypeScript, JavaScript, CSS or Angular templates under src/, scripts/
 * and .github/pipeline/ is longer than 100 columns (Prettier's printWidth). The only exceptions are
 * the two the Google style guides make, with no list of files or lines: an import or
 * `export … from` line, and a line whose only long part is one URL. Prettier does not break
 * strings, regular expressions or comments: split a long string into '…' + '…' pieces, build a
 * long pattern with `new RegExp`, wrap a long comment, and break a long template line between
 * attributes or at a space in its text. src/index.html is the static page shell, not an Angular
 * template: its meta descriptions are single attribute values that no line break may change.
 */
export const LIMIT = 100;
export const COVERED = /^(?:src|scripts|\.github\/pipeline)\/.+\.(?:ts|mjs|js|css|scss|html)$/;
const SHELL = 'src/index.html';
const IMPORT =
  /^\s*(?:import\s.*\bfrom\s+['"]|import\s+['"]|export\s.*\bfrom\s+['"]|\}\s*from\s+['"])/;
const ADDRESS = /https?:\/\/[^\s'"`)<>]+/g;

const root = new URL('../', import.meta.url);

/** Whether a line may be longer than the limit: an import/export-from line or one long URL. */
export function exempt(line, limit = LIMIT) {
  if (IMPORT.test(line)) return true;
  const urls = line.match(ADDRESS) ?? [];
  if (urls.length !== 1) return false;
  return [...line.replace(urls[0], '')].length <= limit;
}

/** Line numbers (from 1) longer than the limit that are not exempt, counted in code points. */
export function overLimit(text, limit = LIMIT) {
  return text
    .split('\n')
    .map((line, index) => ([...line].length > limit && !exempt(line, limit) ? index + 1 : 0))
    .filter(Boolean);
}

function coveredFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => COVERED.test(file) && file !== SHELL);
}

test('only import/export-from lines and a single long URL may pass the limit', () => {
  const long = 'x'.repeat(95);
  const url = `https://example.test/${'a'.repeat(90)}`;
  const lines = [
    `const value = '${long}';`,
    `// ${long} ${long}`,
    `import { ${long} } from './module';`,
    `export { ${long} } from './module';`,
    `} from '../../${long}';`,
    `  // See ${url}`,
    `  // ${url} and ${url}`,
    `  // ${long}${long} ${url}`,
    `<img alt="${long}" />`,
    'const short = 1;',
  ];
  assert.deepEqual(overLimit(lines.join('\n')), [1, 2, 7, 8, 9]);
});

test('no line of code, CSS or template is longer than 100 columns', () => {
  const found = coveredFiles().flatMap((file) =>
    overLimit(readFileSync(new URL(file, root), 'utf8')).map((line) => `${file}:${line}`),
  );
  assert.deepEqual(found, []);
});
