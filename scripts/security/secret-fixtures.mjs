import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanSecrets, run } from './scan-secrets.mjs';

const scratch = resolve('.codex-scratch/security');
mkdirSync(scratch, { recursive: true });
const temporary = mkdtempSync(resolve(scratch, 'secret-fixtures-'));
const binary = resolve(scratch, 'tools/gitleaks');
const token = ['ghp', createHash('sha256').update('nonfunctional scanner detection fixture').digest('hex').slice(0, 36)].join('_');
try {
  const root = resolve(temporary, 'repository');
  mkdirSync(root);
  run('git', ['init', '--quiet'], root);
  run('git', ['config', 'user.email', 'fixture@example.invalid'], root);
  run('git', ['config', 'user.name', 'Synthetic scanner fixture'], root);
  run('git', ['config', 'commit.gpgsign', 'false'], root);
  writeFileSync(resolve(root, 'example.txt'), 'Synthetic non-secret example.\n');
  run('git', ['add', 'example.txt'], root);
  run('git', ['commit', '--quiet', '-m', 'Synthetic clean fixture'], root);
  const base = run('git', ['rev-parse', 'HEAD'], root).stdout.trim();
  const clean = scanSecrets(root, binary, resolve(temporary, 'clean'));
  assert(clean.scans.every((scan) => scan.passed), 'Clean fixture must pass');
  writeFileSync(resolve(root, 'example.txt'), `token = "${token}" # gitleaks:allow\n`);
  const current = scanSecrets(root, binary, resolve(temporary, 'current'));
  assert(current.scans.find((scan) => scan.name === 'current-tree').findings > 0, 'Uncommitted synthetic secret must fail even with an inline allowance');
  run('git', ['add', 'example.txt'], root);
  run('git', ['commit', '--quiet', '-m', 'Synthetic detection fixture'], root);
  writeFileSync(resolve(root, 'example.txt'), 'Synthetic non-secret example.\n');
  run('git', ['add', 'example.txt'], root);
  run('git', ['commit', '--quiet', '-m', 'Synthetic removal fixture'], root);
  const head = run('git', ['rev-parse', 'HEAD'], root).stdout.trim();
  const history = scanSecrets(root, binary, resolve(temporary, 'history'), base, head);
  assert(history.scans.find((scan) => scan.name === 'current-tree').passed, 'Removed secret must leave a clean working tree');
  assert(history.scans.find((scan) => scan.name === 'reachable-history').findings > 0, 'Full history must detect an added-then-deleted secret');
  assert(history.scans.find((scan) => scan.name === 'new-commits').findings > 0, 'Commit range must detect an added-then-deleted secret');
  assert(!JSON.stringify(history).includes(token), 'Normalized receipt must redact secret values');
  assert.throws(() => scanSecrets(root, binary, resolve(temporary, 'invalid'), '--all', head), /Invalid commit range/);
  writeFileSync(resolve(root, '.git/shallow'), `${head}\n`);
  assert.throws(() => scanSecrets(root, binary, resolve(temporary, 'shallow')), /nonshallow/);
  writeFileSync(resolve(scratch, 'secret-fixtures.json'), `${JSON.stringify({ scanner: 'gitleaks 8.30.1', clean: true, currentTreeDetection: true, inlineAllowanceIgnored: true, removedHistoricalDetection: true, newCommitDetection: true, redaction: true, invalidRangeRejected: true, shallowCloneRejected: true }, null, 2)}\n`);
  console.log('Secret scanner fixtures passed: clean, current tree, deleted history, commit range, redaction and coverage failures.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
