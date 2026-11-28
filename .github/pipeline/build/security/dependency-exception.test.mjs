import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkAuditWithException, dependencyException } from './dependency-exception.mjs';
import { lockInventory } from './reports.mjs';

const beforeExpiry = new Date('2026-12-01T04:59:59.999Z');
function fixture() {
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { devDependencies: { tooling: '1.0.0' } },
      'node_modules/tooling': { version: '1.0.0', dev: true },
      'node_modules/picomatch': { version: '4.0.7', dev: true },
    },
  };
  const advisory = {
    name: 'picomatch',
    dependency: 'picomatch',
    url: dependencyException.advisory,
    severity: 'high',
  };
  const report = {
    auditReportVersion: 2,
    vulnerabilities: {
      picomatch: {
        name: 'picomatch',
        severity: 'high',
        isDirect: false,
        via: [advisory],
        nodes: ['node_modules/picomatch'],
      },
      tooling: {
        name: 'tooling',
        severity: 'high',
        isDirect: true,
        via: ['picomatch'],
        nodes: ['node_modules/tooling'],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 },
      dependencies: { total: 2 },
    },
  };
  return { lock, report, inventory: lockInventory(lock) };
}
const check = ({ report, inventory }, now = beforeExpiry) =>
  checkAuditWithException(report, inventory, now);

test(
  'approved advisory and inherited findings pass with raw vulnerability evidence ' + 'preserved',
  () => {
    const data = fixture();
    const original = structuredClone(data);
    const result = check(data);
    assert.equal(result.passed, true);
    assert.equal(result.passedWithoutExceptions, false);
    assert.equal(result.totals.high, 2);
    assert.deepEqual(result.exceptedFindings, ['picomatch', 'tooling']);
    assert.deepEqual(result.blockingFindings, []);
    assert.equal(result.exception.expiresAt, '2026-12-01T05:00:00.000Z');
    assert.deepEqual(data, original);
  },
);

for (const instant of ['2026-12-01T05:00:00.000Z', '2030-01-01T00:00:00Z']) {
  test(`exception expires at New York midnight: ${instant}`, () => {
    const result = check(fixture(), new Date(instant));
    assert.equal(result.passed, false);
    assert.equal(result.exception.active, false);
    assert.deepEqual(result.exceptedFindings, []);
  });
}
for (const [name, mutate] of [
  [
    'older package',
    (d) => {
      d.inventory[1].version = '4.0.6';
    },
  ],
  [
    'different package',
    (d) => {
      d.inventory[1].name = 'other';
    },
  ],
  [
    'production picomatch',
    (d) => {
      d.inventory[1].development = false;
    },
  ],
  [
    'production parent',
    (d) => {
      d.inventory[0].development = false;
    },
  ],
  [
    'different advisory',
    (d) => {
      d.report.vulnerabilities.picomatch.via[0].url += '-other';
    },
  ],
  [
    'same advisory on a different dependency',
    (d) => {
      d.report.vulnerabilities.picomatch.via[0].dependency = 'other';
    },
  ],
  [
    'additional advisory on root',
    (d) => {
      d.report.vulnerabilities.picomatch.via.push({ url: 'other', severity: 'high' });
    },
  ],
  [
    'additional advisory on parent',
    (d) => {
      d.report.vulnerabilities.tooling.via.push({ url: 'other', severity: 'high' });
    },
  ],
  [
    'unresolved provenance',
    (d) => {
      d.report.vulnerabilities.tooling.via = ['missing'];
    },
  ],
  [
    'self cycle',
    (d) => {
      d.report.vulnerabilities.tooling.via = ['tooling'];
    },
  ],
  [
    'indirect cycle',
    (d) => {
      d.report.vulnerabilities.picomatch.via = ['tooling'];
    },
  ],
  [
    'finding name mismatch',
    (d) => {
      d.report.vulnerabilities.tooling.name = 'other';
    },
  ],
  [
    'node identity mismatch',
    (d) => {
      d.report.vulnerabilities.tooling.nodes = ['node_modules/picomatch'];
    },
  ],
  [
    'critical escalation',
    (d) => {
      d.report.vulnerabilities.picomatch.severity = 'critical';
      d.report.metadata.vulnerabilities.high = 1;
      d.report.metadata.vulnerabilities.critical = 1;
    },
  ],
]) {
  test(`exception does not accept ${name}`, () => {
    const data = fixture();
    mutate(data);
    assert.equal(check(data).passed, false);
  });
}
test('a second picomatch version or production location prevents acceptance', () => {
  for (const item of [{ version: '4.0.6', dev: true }, { version: '4.0.7' }]) {
    const data = fixture();
    data.lock.packages['node_modules/tooling/node_modules/picomatch'] = item;
    data.inventory = lockInventory(data.lock);
    data.report.metadata.dependencies.total = 3;
    assert.equal(check(data).passed, false);
  }
});
test('peer cycles are accepted only with exclusively approved reachable advisory leaves', () => {
  const data = fixture();
  data.report.vulnerabilities.tooling.via = ['tooling', 'picomatch'];
  assert.equal(check(data).passed, true);
  data.report.vulnerabilities.tooling.via.push({ name: 'tooling', url: 'other', severity: 'high' });
  assert.equal(check(data).passed, false);
});
test('an approved branch cannot hide a separate unanchored provenance cycle', () => {
  const data = fixture();
  data.lock.packages['node_modules/unknown'] = { version: '1.0.0', dev: true };
  data.inventory = lockInventory(data.lock);
  data.report.metadata.dependencies.total = 3;
  data.report.metadata.vulnerabilities.high = 3;
  data.report.metadata.vulnerabilities.total = 3;
  data.report.vulnerabilities.unknown = {
    name: 'unknown',
    severity: 'high',
    isDirect: false,
    via: ['unknown'],
    nodes: ['node_modules/unknown'],
  };
  data.report.vulnerabilities.tooling.via.push('unknown');
  const result = check(data);
  assert.equal(result.passed, false);
  assert.deepEqual(result.exceptedFindings, ['picomatch']);
  assert.deepEqual(result.blockingFindings, ['tooling', 'unknown']);
});
test('complete clean reports pass after expiry without using the exception', () => {
  const data = fixture();
  data.report.vulnerabilities = {};
  data.report.metadata.vulnerabilities.high = 0;
  data.report.metadata.vulnerabilities.total = 0;
  assert.equal(check(data, new Date('2030-01-01')).passed, true);
});
test('malformed inventory/report and invalid clock still fail closed', () => {
  const data = fixture();
  data.report.metadata.dependencies.total = 1;
  assert.throws(() => check(data), /complete lockfile/);
  assert.throws(() => check(fixture(), new Date('invalid')), /Invalid exception/);
});

for (const [name, instant, npmStatus, expectedStatus, complete] of [
  ['accepted risk remains visible', '2026-11-30T23:59:59-05:00', 1, 0, true],
  ['expired risk blocks', '2026-12-01T00:00:00-05:00', 1, 1, true],
  ['inconsistent npm exit fails', '2026-11-30T12:00:00-05:00', 0, 1, false],
]) {
  test(`scanner CLI: ${name}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'dependency-exception-'));
    try {
      const { lock, report, inventory } = fixture();
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({ packageManager: 'npm@11.17.0' }),
      );
      writeFileSync(join(directory, 'package-lock.json'), JSON.stringify(lock));
      const components = inventory.map((p) => ({
        name: p.name,
        version: p.version,
        purl: `pkg:npm/${p.name}@${p.version}`,
        'bom-ref': p.name,
      }));
      const sbom = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components,
        dependencies: components.map((p) => ({ ref: p.name, dependsOn: [] })),
      };
      const bin = join(directory, 'bin');
      mkdirSync(bin);
      writeFileSync(
        join(bin, 'npm'),
        `#!${process.execPath}\nconst cmd=process.argv[2]; ` +
          `console.log(cmd==='--version'?'11.17.0':JSON.stringify(cmd==='audit'?` +
          `${JSON.stringify(report)}:${JSON.stringify(sbom)})); ` +
          `process.exit(cmd==='audit'?${npmStatus}:0);`,
        { mode: 0o755 },
      );
      writeFileSync(join(bin, 'git'), `#!${process.execPath}\nconsole.log('a'.repeat(40));`, {
        mode: 0o755,
      });
      // Test-only preload: production has no environment variable that overrides the expiry clock.
      const clock =
        `const RealDate=Date;globalThis.Date=class extends RealDate ` +
        `{constructor(...args){super(...(args.length?args:[${JSON.stringify(instant)}]));}};`;
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          `data:text/javascript,${encodeURIComponent(clock)}`,
          new URL('./scan-dependencies.mjs', import.meta.url).pathname,
        ],
        {
          cwd: directory,
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
          encoding: 'utf8',
        },
      );
      assert.equal(result.status, expectedStatus, result.stderr);
      const receipt = JSON.parse(
        readFileSync(join(directory, '.codex-scratch/security/dependency-receipt.json')),
      );
      if (complete) {
        assert.equal(receipt.audit.totals.high, 2);
        assert.equal(receipt.audit.passed, expectedStatus === 0);
        assert.deepEqual(
          JSON.parse(readFileSync(join(directory, '.codex-scratch/security/npm-audit.json'))),
          report,
        );
        if (expectedStatus === 0)
          assert.match(result.stdout, /Temporary risk exception.*Vulnerability remains unresolved/);
      } else assert.equal(receipt.coverage, 'incomplete');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
