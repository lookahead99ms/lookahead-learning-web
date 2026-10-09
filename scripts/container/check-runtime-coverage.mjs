import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runtime shell probes lack V8 instrumentation. Conservatively count every
// nonblank, non-comment shell line as uncovered; never invent execution hits.
export function coverageFloor(covered, total, shellSources) {
  assert(Number.isSafeInteger(covered) && Number.isSafeInteger(total) && total > 0 && covered >= 0 && covered <= total, 'Invalid Angular line totals');
  const unmeasuredShellLines = shellSources.reduce((sum, source) => sum + source.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).length, 0);
  const linePercentLowerBound = 100 * covered / (total + unmeasuredShellLines);
  return { coveredLines: covered, angularLines: total, unmeasuredShellLines, linePercentLowerBound, passed: linePercentLowerBound >= 85 };
}

export async function checkRuntimeCoverage(root) {
  const report = JSON.parse(await readFile(join(root, 'coverage/lookahead-learning-web/coverage-summary.json'), 'utf8'));
  const directory = join(root, 'deployment/container');
  const files = [];
  let entries = 0;
  async function visit(relative = '') {
    const current = join(directory, relative);
    assert(!(await lstat(current)).isSymbolicLink(), 'Runtime inventory must not contain symlinks');
    for (const name of await readdir(current)) {
      assert(++entries <= 4096, 'Runtime inventory exceeds bound');
      const child = join(relative, name);
      const metadata = await lstat(join(directory, child));
      assert(!metadata.isSymbolicLink(), 'Runtime inventory must not contain symlinks');
      if (metadata.isDirectory()) await visit(child);
      else if (name.endsWith('.sh')) {
        assert(metadata.isFile() && metadata.size <= 256 * 1024, 'Invalid or oversized runtime shell');
        files.push(child);
        assert(files.length <= 32, 'Too many runtime shell files');
      }
    }
  }
  await visit();
  files.sort();
  assert(files.includes('healthcheck.sh'), 'Runtime health probe omitted');
  const result = { ...coverageFloor(report.total.lines.covered, report.total.lines.total, await Promise.all(files.map(name => readFile(join(directory, name), 'utf8')))), files };
  console.log(JSON.stringify(result));
  assert(result.passed, 'Web production line coverage lower bound, including runtime shell probes, must reach85%');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkRuntimeCoverage(process.cwd());
