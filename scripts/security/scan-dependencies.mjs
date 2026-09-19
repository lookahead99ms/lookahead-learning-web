import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkAudit, checkSbom, lockInventory } from './reports.mjs';

const output = resolve('.codex-scratch/security');
mkdirSync(output, { recursive: true });
for (const name of ['dependency-receipt.json', 'npm-audit.json', 'npm.cdx.json']) rmSync(resolve(output, name), { force: true });
const digest = (text) => createHash('sha256').update(text).digest('hex');
const startedAt = new Date().toISOString();
const include = ['--package-lock-only', '--include=prod', '--include=dev', '--include=optional', '--include=peer', '--ignore-scripts'];

function command(args, permittedCodes = [0]) {
  const result = spawnSync('npm', args, { encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  // Registry errors can include local paths or credentials; keep raw diagnostics local.
  if (result.error || result.signal || !permittedCodes.includes(result.status)) throw new Error('npm tool failed or timed out');
  return result;
}

try {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const npmVersion = command(['--version']).stdout.trim();
  if (manifest.packageManager !== `npm@${npmVersion}`) throw new Error('Use the exact npm version in packageManager');
  const lockText = readFileSync('package-lock.json', 'utf8');
  const inventory = lockInventory(JSON.parse(lockText));
  const sbomText = command(['sbom', ...include, '--sbom-format=cyclonedx', '--sbom-type=application', '--offline']).stdout;
  writeFileSync(resolve(output, 'npm.cdx.json'), sbomText);
  const sbom = checkSbom(JSON.parse(sbomText), inventory);
  const auditResult = command(['audit', ...include, '--json', '--audit-level=high', '--registry=https://registry.npmjs.org', '--prefer-online', '--offline=false'], [0, 1]);
  writeFileSync(resolve(output, 'npm-audit.json'), auditResult.stdout);
  const audit = checkAudit(JSON.parse(auditResult.stdout), inventory);
  if (auditResult.status !== (audit.passed ? 0 : 1)) throw new Error('npm exit status disagrees with report');
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (revision.status !== 0) throw new Error('Cannot identify scanned source revision');
  const receipt = {
    schema: 'frontend-dependency-scan/v1', revision: revision.stdout.trim(), startedAt,
    completedAt: new Date().toISOString(), nodeVersion: process.version, npmVersion,
    registry: 'https://registry.npmjs.org', registryDatabaseTimestamp: null,
    freshness: 'Live registry request; registry does not expose an advisory database timestamp',
    lockSha256: digest(lockText), sbomSha256: digest(sbomText), auditSha256: digest(auditResult.stdout),
    coverage: ['production', 'development', 'optional', 'peer', 'direct', 'transitive'],
    audit, sbom, inventory,
  };
  writeFileSync(resolve(output, 'dependency-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Dependency scan: ${audit.packageLocations} package locations, ${sbom.uniqueComponents} SBOM components; ${audit.totals.high} high, ${audit.totals.critical} critical, ${audit.totals.moderate} moderate.`);
  if (!audit.passed) process.exitCode = 1;
} catch {
  writeFileSync(resolve(output, 'dependency-receipt.json'), `${JSON.stringify({ schema: 'frontend-dependency-scan/v1', startedAt, completedAt: new Date().toISOString(), passed: false, coverage: 'incomplete' }, null, 2)}\n`);
  console.error('Dependency security gate failed: scanner error or incomplete coverage. No clean result is available.');
  process.exitCode = 1;
}
