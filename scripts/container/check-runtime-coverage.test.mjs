import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRuntimeCoverage, coverageFloor } from './check-runtime-coverage.mjs';
test('runtime probes can fail a marginal Angular85% pass', () => {
  assert.equal(coverageFloor(85, 100, ['#!/bin/sh\nset -eu\nwget example\n']).passed, false);
});
test('never invents shell hits and counts unmeasured physical lines conservatively', () => {
  const result = coverageFloor(90, 100, ['#!/bin/sh\n# comment\n\nset -eu\nif true; then\n echo ok\nfi\n']);
  assert.equal(result.coveredLines, 90);
  assert.equal(result.unmeasuredShellLines, 4);
  assert(Math.abs(result.linePercentLowerBound - 86.5384615384615) < 1e-10);
  assert.equal(result.passed, true);
});

test('includes nested runtime scripts and rejects linked or oversized sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-coverage-'));
  try {
    const runtime = join(root, 'deployment/container');
    const coverage = join(root, 'coverage/lookahead-learning-web');
    await mkdir(join(runtime, 'nested'), { recursive: true });
    await mkdir(coverage, { recursive: true });
    await writeFile(join(coverage, 'coverage-summary.json'), JSON.stringify({ total: { lines: { covered: 86, total: 100 } } }));
    await writeFile(join(runtime, 'healthcheck.sh'), '#!/bin/sh\n');
    await writeFile(join(runtime, 'nested/check.sh'), 'set -eu\nexit 0\n');
    await assert.rejects(checkRuntimeCoverage(root), /must reach85/);
    await writeFile(join(runtime, 'nested/check.sh'), 'x'.repeat(256 * 1024 + 1));
    await assert.rejects(checkRuntimeCoverage(root), /oversized/);
    await rm(join(runtime, 'nested/check.sh'));
    await symlink('../healthcheck.sh', join(runtime, 'nested/check.sh'));
    await assert.rejects(checkRuntimeCoverage(root), /symlinks/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
