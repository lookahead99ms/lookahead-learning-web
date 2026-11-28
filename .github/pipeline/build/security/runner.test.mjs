import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { scanSecrets } from './scan-secrets.mjs';

test('CI runs synthetic gates before installation and dependency regressions afterwards', () => {
  const workflow = readFileSync(new URL('../../../workflows/ci.yml', import.meta.url), 'utf8');
  const manifest = JSON.parse(
    readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
  );
  const synthetic = workflow.indexOf('run: npm run test:security-gates');
  const install = workflow.indexOf('run: npm ci ');
  const runtime = workflow.indexOf('run: npm run test:security-runtime');
  const coverage = workflow.indexOf('run: npm run test:coverage');
  assert.ok(synthetic >= 0 && synthetic < install, 'Synthetic gates must run before installation');
  assert.ok(
    install < runtime && runtime < coverage,
    'Dependency regressions must run after installation and before app tests',
  );
  assert.equal(
    manifest.scripts['test:security-gates'],
    'node --test .github/pipeline/build/security/*.test.mjs',
  );
  assert.equal(
    manifest.scripts['test:security-runtime'],
    'node --test .github/pipeline/build/security/runtime/*.test.mjs',
  );
});

test('CI checks style: hash-locked Ruff for Python, Prettier and the column limit', () => {
  // DLV-1026: Python with the Ruff in requirements-style.txt; TypeScript, JavaScript, HTML and CSS
  // with the locked Prettier (format:check) and the 100-column rule (test:line-length).
  const workflow = readFileSync(new URL('../../../workflows/ci.yml', import.meta.url), 'utf8');
  const manifest = JSON.parse(
    readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
  );
  const python = workflow.indexOf('uses: actions/setup-python@');
  const ruff = workflow.indexOf('- name: Check Python style with the hash-locked Ruff');
  const install = workflow.indexOf('run: npm ci ');
  const style = workflow.indexOf('npm run format:check');
  const coverage = workflow.indexOf('run: npm run test:coverage');
  assert.ok(python >= 0 && python < ruff, 'Ruff runs after Python is set up');
  assert.ok(install < style && style < coverage, 'Prettier runs after installation, before tests');
  for (const line of [
    '"$RUNNER_TEMP/style/bin/python" -m pip install --only-binary=:all: --no-deps ' +
      '--require-hashes -r ' +
      '.github/pipeline/shared/requirements-style.txt',
    '"$RUNNER_TEMP/style/bin/ruff" format --check .',
    '"$RUNNER_TEMP/style/bin/ruff" check .',
    'npm run test:line-length',
  ]) {
    assert.ok(workflow.includes(line), line);
  }
  assert.match(manifest.scripts['format:check'], /^prettier --check /);
  assert.equal(manifest.scripts['test:line-length'], 'node --test scripts/line-length.test.mjs');
  assert.match(manifest.devDependencies.prettier, /^\^?3\./);
  const locked = readFileSync(
    new URL('../../shared/requirements-style.txt', import.meta.url),
    'utf8',
  );
  assert.match(locked, /^ruff==\d+\.\d+\.\d+ \\$/m);
  assert.ok(locked.split('--hash=sha256:').length > 2, 'every Ruff file is hash-pinned');
});

test('a failed dependency scan replaces stale successful evidence and exits nonzero', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-failure-'));
  try {
    const bin = join(directory, 'bin');
    const output = join(directory, '.codex-scratch/security');
    mkdirSync(bin);
    mkdirSync(output, { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ packageManager: 'npm@11.17.0' }),
    );
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "0.0.0\\n"\n', { mode: 0o755 });
    writeFileSync(join(output, 'dependency-receipt.json'), '{"passed":true}');
    const result = spawnSync(
      process.execPath,
      [new URL('./scan-dependencies.mjs', import.meta.url).pathname],
      {
        cwd: directory,
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1);
    assert.deepEqual(
      JSON.parse(readFileSync(join(output, 'dependency-receipt.json'), 'utf8')).coverage,
      'incomplete',
    );
    assert.equal(
      JSON.parse(readFileSync(join(output, 'dependency-receipt.json'), 'utf8')).passed,
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a missing secret scanner cannot reuse a successful receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'secret-failure-'));
  try {
    writeFileSync(join(directory, 'secrets-receipt.json'), '{"passed":true}');
    assert.throws(() => scanSecrets(directory, join(directory, 'absent-scanner'), directory));
    const receipt = JSON.parse(readFileSync(join(directory, 'secrets-receipt.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.equal(receipt.coverage, 'incomplete');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
