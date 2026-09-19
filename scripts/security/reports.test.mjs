import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { checkAudit, checkSarif, checkSbom, lockInventory } from './reports.mjs';

function lock() {
  return { lockfileVersion: 3, packages: {
    '': { dependencies: { app: '^1.0.0' }, devDependencies: { tooling: '^1.0.0' } },
    'node_modules/app': { version: '1.0.0' },
    'node_modules/tooling': { version: '1.0.0', dev: true },
    'node_modules/transitive': { version: '2.0.0', dev: true, optional: true },
  } };
}
function audit(severity) {
  const totals = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  const vulnerabilities = {};
  if (severity) {
    totals[severity] = 1; totals.total = 1;
    vulnerabilities.transitive = { name: 'transitive', severity, isDirect: false, via: ['synthetic-advisory'], nodes: ['node_modules/transitive'] };
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: totals, dependencies: { total: 3 } } };
}
function sarif(severity) {
  const rule = { id: 'js/synthetic-security', properties: { tags: ['security'], 'security-severity': severity } };
  return { version: '2.1.0', runs: [{
    tool: { driver: { name: 'CodeQL', rules: [rule] } },
    invocations: [{ executionSuccessful: true }],
    results: severity === undefined ? [] : [{ ruleId: rule.id, ruleIndex: 0 }],
  }] };
}

test('lockfile inventory distinguishes direct, transitive, dev and optional packages', () => {
  const packages = lockInventory(lock());
  assert.equal(packages.length, 3);
  assert.equal(packages.filter((pkg) => pkg.direct).length, 2);
  assert.deepEqual(packages[2], { path: 'node_modules/transitive', name: 'transitive', version: '2.0.0', direct: false, development: true, optional: true, peer: false });
});
test('unresolved direct and linked dependencies fail coverage', () => {
  const missing = lock(); delete missing.packages['node_modules/tooling'];
  assert.throws(() => lockInventory(missing), /Unresolved direct/);
  const linked = lock(); linked.packages['node_modules/tooling'].link = true;
  assert.throws(() => lockInventory(linked), /Unresolved or linked/);
});
for (const severity of [undefined, 'info', 'low', 'moderate', 'high', 'critical']) {
  test(`npm threshold handles ${severity ?? 'clean'} transitive development findings`, () => {
    assert.equal(checkAudit(audit(severity), lockInventory(lock())).passed, !['high', 'critical'].includes(severity));
  });
}
for (const [name, mutate] of [
  ['registry error', (report) => { report.error = { code: 'NETWORK' }; }],
  ['missing findings', (report) => { delete report.vulnerabilities; }],
  ['partial graph', (report) => { report.metadata.dependencies.total = 2; }],
  ['false clean totals', (report) => { report.metadata.vulnerabilities.high = 0; report.metadata.vulnerabilities.total = 0; }],
  ['unknown node', (report) => { report.vulnerabilities.transitive.nodes = ['node_modules/absent']; }],
]) {
  test(`npm rejects ${name}`, () => { const report = audit('high'); mutate(report); assert.throws(() => checkAudit(report, lockInventory(lock()))); });
}
test('SBOM must include all lockfile identities and dependency edges', () => {
  const inventory = lockInventory(lock());
  const components = inventory.map(({ name, version }) => ({ name, version, purl: `pkg:npm/${name}@${version}`, 'bom-ref': `${name}@${version}` }));
  const report = { bomFormat: 'CycloneDX', specVersion: '1.5', components, dependencies: components.map((item) => ({ ref: item['bom-ref'], dependsOn: [] })) };
  assert.equal(checkSbom(report, inventory).uniqueComponents, 3);
  const missing = structuredClone(report); missing.components.pop();
  assert.throws(() => checkSbom(missing, inventory), /missing a resolved package/);
  const noEdges = structuredClone(report); noEdges.dependencies.pop();
  assert.throws(() => checkSbom(noEdges, inventory), /missing dependency edges/);
  const dangling = structuredClone(report); dangling.dependencies[0].dependsOn.push('absent');
  assert.throws(() => checkSbom(dangling, inventory), /Unresolved SBOM/);
});
for (const [severity, passed] of [[undefined, true], ['6.9', true], ['7.0', false], ['9.8', false]]) {
  test(`CodeQL threshold handles ${severity ?? 'clean'} results`, () => assert.equal(checkSarif(sarif(severity)).passed, passed));
}
test('CodeQL does not silently honor result suppressions or unchanged baselines', () => {
  const report = sarif('7.8');
  Object.assign(report.runs[0].results[0], { baselineState: 'unchanged', suppressions: [{ status: 'accepted', kind: 'external' }] });
  assert.equal(checkSarif(report).passed, false);
});
test('CodeQL resolves rules stored in SARIF tool extensions', () => {
  const report = sarif('6.9');
  const rules = report.runs[0].tool.driver.rules;
  report.runs[0].tool.driver.rules = [];
  report.runs[0].tool.extensions = [{ name: 'javascript', rules }];
  delete report.runs[0].results[0].ruleIndex;
  assert.equal(checkSarif(report).passed, true);
});
for (const [name, mutate] of [
  ['empty runs', (report) => { report.runs = []; }],
  ['no rules', (report) => { report.runs[0].tool.driver.rules = []; }],
  ['missing results', (report) => { delete report.runs[0].results; }],
  ['missing invocation', (report) => { delete report.runs[0].invocations; }],
  ['failed execution', (report) => { report.runs[0].invocations[0].executionSuccessful = false; }],
  ['extractor warning', (report) => { report.runs[0].invocations[0].toolExecutionNotifications = [{ level: 'warning' }]; }],
  ['configuration error', (report) => { report.runs[0].invocations[0].toolConfigurationNotifications = [{ level: 'error' }]; }],
  ['unknown rule', (report) => { report.runs[0].results[0].ruleId = 'absent'; }],
  ['unknown severity', (report) => { report.runs[0].tool.driver.rules[0].properties['security-severity'] = 'unknown'; }],
  ['null severity', (report) => { report.runs[0].tool.driver.rules[0].properties['security-severity'] = null; }],
  ['missing security severity', (report) => { delete report.runs[0].tool.driver.rules[0].properties['security-severity']; }],
]) {
  test(`CodeQL rejects ${name}`, () => { const report = sarif('7.8'); mutate(report); assert.throws(() => checkSarif(report)); });
}
test('CLI fails for absent/malformed reports and high findings, passes a complete clean report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'security-gate-'));
  const cli = new URL('./check-sarif.mjs', import.meta.url);
  const run = () => spawnSync(process.execPath, [cli.pathname, directory], { encoding: 'utf8' });
  try {
    assert.equal(run().status, 1);
    writeFileSync(join(directory, 'javascript.sarif'), '{');
    assert.equal(run().status, 1);
    writeFileSync(join(directory, 'javascript.sarif'), JSON.stringify(sarif('7.8')));
    assert.equal(run().status, 1);
    writeFileSync(join(directory, 'javascript.sarif'), JSON.stringify(sarif()));
    assert.equal(run().status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
