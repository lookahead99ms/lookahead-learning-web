import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { scanSecrets } from './scan-secrets.mjs';

test('a failed dependency scan replaces stale successful evidence and exits nonzero', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-failure-'));
  try {
    const bin = join(directory, 'bin');
    const output = join(directory, '.codex-scratch/security');
    mkdirSync(bin); mkdirSync(output, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ packageManager: 'npm@11.17.0' }));
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "0.0.0\\n"\n', { mode: 0o755 });
    writeFileSync(join(output, 'dependency-receipt.json'), '{"passed":true}');
    const result = spawnSync(process.execPath, [new URL('./scan-dependencies.mjs', import.meta.url).pathname], {
      cwd: directory, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'dependency-receipt.json'), 'utf8')).coverage, 'incomplete');
    assert.equal(JSON.parse(readFileSync(join(output, 'dependency-receipt.json'), 'utf8')).passed, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a missing secret scanner cannot reuse a successful receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'secret-failure-'));
  try {
    writeFileSync(join(directory, 'secrets-receipt.json'), '{"passed":true}');
    assert.throws(() => scanSecrets(directory, join(directory, 'absent-scanner'), directory));
    const receipt = JSON.parse(readFileSync(join(directory, 'secrets-receipt.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.equal(receipt.coverage, 'incomplete');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
