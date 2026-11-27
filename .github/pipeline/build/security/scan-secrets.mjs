import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function run(command, args, cwd, allowed = [0]) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  assert(!result.error && !result.signal && allowed.includes(result.status), 'Scanner or git command failed');
  return result;
}

export function scanSecrets(root, binary, output, base, head) {
  mkdirSync(output, { recursive: true });
  // A failed new run must not leave a previous clean receipt in place.
  const receiptPath = resolve(output, 'secrets-receipt.json');
  writeFileSync(receiptPath, `${JSON.stringify({ schema: 'frontend-secret-scan/v1', passed: false, coverage: 'incomplete', startedAt: new Date().toISOString() }, null, 2)}\n`);
  assert.equal(run(binary, ['version'], root).stdout.trim().replace(/^v/, ''), '8.30.1', 'Unexpected scanner version');
  assert.equal(run('git', ['rev-parse', '--is-shallow-repository'], root).stdout.trim(), 'false', 'History scan requires a nonshallow checkout');
  const temporary = mkdtempSync(resolve(output, 'secret-scan-'));
  try {
    const tree = resolve(temporary, 'candidate');
    mkdirSync(tree);
    const config = resolve(temporary, 'gitleaks.toml');
    const ignore = resolve(temporary, 'empty.ignore');
    writeFileSync(config, '[extend]\nuseDefault = true\n');
    writeFileSync(ignore, '');
    const removed = new Set(run('git', ['ls-files', '--deleted', '-z'], root).stdout.split('\0'));
    const files = [...new Set(run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], root).stdout.split('\0').filter(Boolean))].filter((path) => !removed.has(path));
    assert(files.length > 0, 'No source files found');
    for (const path of files) {
      const source = resolve(root, path);
      assert(!relative(root, source).startsWith('..'), 'File escapes repository');
      assert(!relative(realpathSync(root), realpathSync(source)).startsWith('..'), 'Resolved file escapes repository');
      assert(lstatSync(source).isFile(), 'Only regular source files may be scanned');
      const target = resolve(tree, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
    const scans = [['current-tree', ['dir', tree]], ['reachable-history', ['git', root, '--log-opts=--all']]];
    if (base || head) {
      assert(/^[a-f0-9]{40}$/.test(base ?? '') && /^[a-f0-9]{40}$/.test(head ?? ''), 'Invalid commit range');
      run('git', ['cat-file', '-e', `${base}^{commit}`], root);
      run('git', ['cat-file', '-e', `${head}^{commit}`], root);
      run('git', ['merge-base', '--is-ancestor', base, head], root);
      scans.push(['new-commits', ['git', root, `--log-opts=${base}..${head}`]]);
    }
    const receipt = { schema: 'frontend-secret-scan/v1', scanner: 'gitleaks', version: '8.30.1', revision: run('git', ['rev-parse', 'HEAD'], root).stdout.trim(), completedAt: null, fileCount: files.length, scans: [] };
    for (const [name, args] of scans) {
      const reportPath = resolve(temporary, `${name}.json`);
      const result = run(binary, [...args, '--config', config, '--gitleaks-ignore-path', ignore, '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', reportPath, '--exit-code', '1'], root, [0, 1]);
      const findings = JSON.parse(readFileSync(reportPath, 'utf8'));
      assert(Array.isArray(findings), 'Invalid secret scan report');
      assert.equal(result.status, findings.length > 0 ? 1 : 0, 'Secret findings disagree with scanner exit status');
      // Never retain match, secret, author, email, message or raw tool output.
      const locations = findings.map((finding) => {
        assert(typeof finding.RuleID === 'string' && typeof finding.File === 'string' && Number.isInteger(finding.StartLine), 'Incomplete secret finding');
        const file = finding.File.startsWith(tree) ? relative(tree, finding.File) : finding.File;
        assert(!file.startsWith('/') && !file.split(/[\\/]/).includes('..'), 'Unsafe secret location');
        return { ruleId: finding.RuleID, file, line: finding.StartLine, commit: /^[a-f0-9]{40}$/.test(finding.Commit ?? '') ? finding.Commit : null };
      });
      receipt.scans.push({ name, passed: locations.length === 0, findings: locations.length, locations });
    }
    receipt.completedAt = new Date().toISOString();
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = scanSecrets(process.cwd(), resolve('.codex-scratch/security/tools/gitleaks'), resolve('.codex-scratch/security'), process.env.SECURITY_BASE_SHA || undefined, process.env.SECURITY_HEAD_SHA || undefined);
    const count = receipt.scans.reduce((sum, scan) => sum + scan.findings, 0);
    console.log(`Secret scan: ${receipt.scans.length} scopes checked; ${count} findings. Location-only receipt retained locally.`);
    if (count > 0) process.exitCode = 1;
  } catch {
    console.error('Secret security gate failed: scanner error or incomplete coverage. No clean result is available.');
    process.exitCode = 1;
  }
}
