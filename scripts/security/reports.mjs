import assert from 'node:assert/strict';

const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0;

export function lockInventory(lock) {
  assert.equal(lock.lockfileVersion, 3, 'Unsupported lockfile version');
  assert(object(lock.packages?.['']), 'Missing root lockfile package');
  const direct = new Set(Object.keys({
    ...lock.packages[''].dependencies,
    ...lock.packages[''].devDependencies,
    ...lock.packages[''].optionalDependencies,
    ...lock.packages[''].peerDependencies,
  }));
  const packages = Object.entries(lock.packages).filter(([path]) => path).map(([path, pkg]) => {
    assert(!pkg.link && typeof pkg.version === 'string', 'Unresolved or linked dependency');
    assert(path.includes('node_modules/'), 'Unsupported dependency location');
    const name = pkg.name ?? path.slice(path.lastIndexOf('node_modules/') + 13);
    assert(name && pkg.version, 'Missing dependency identity');
    return {
      path, name, version: pkg.version,
      direct: path === `node_modules/${name}` && direct.has(name),
      development: pkg.dev === true,
      optional: pkg.optional === true,
      peer: pkg.peer === true,
    };
  });
  assert(packages.length > 0, 'Empty resolved dependency inventory');
  for (const name of direct) {
    assert(packages.some((pkg) => pkg.direct && pkg.name === name), 'Unresolved direct dependency');
  }
  return packages;
}

export function checkAudit(report, inventory) {
  assert.equal(report.auditReportVersion, 2, 'Unsupported npm audit report');
  assert(!report.error, 'npm audit reported a scanner error');
  assert(object(report.vulnerabilities), 'Missing npm vulnerability results');
  const totals = report.metadata?.vulnerabilities;
  assert(object(totals), 'Missing npm vulnerability totals');
  for (const severity of [...severities, 'total']) assert(count(totals[severity]), 'Invalid vulnerability totals');
  assert.equal(severities.reduce((sum, key) => sum + totals[key], 0), totals.total, 'Inconsistent vulnerability totals');
  assert.equal(report.metadata?.dependencies?.total, inventory.length, 'npm audit did not cover the complete lockfile');
  const findings = Object.values(report.vulnerabilities);
  assert.equal(findings.length, totals.total, 'Incomplete npm vulnerability results');
  const observed = Object.fromEntries(severities.map((severity) => [severity, 0]));
  for (const finding of findings) {
    assert(severities.includes(finding.severity), 'Unknown vulnerability severity');
    assert(typeof finding.name === 'string' && typeof finding.isDirect === 'boolean', 'Missing finding identity');
    assert(Array.isArray(finding.via) && finding.via.length > 0, 'Missing vulnerability provenance');
    assert(Array.isArray(finding.nodes) && finding.nodes.length > 0, 'Missing affected dependency locations');
    for (const path of finding.nodes) assert(inventory.some((pkg) => pkg.path === path), 'Unresolved vulnerable dependency');
    observed[finding.severity] += 1;
  }
  for (const severity of severities) assert.equal(observed[severity], totals[severity], 'Severity totals do not match findings');
  return { passed: totals.high + totals.critical === 0, totals, packageLocations: inventory.length };
}

export function checkSbom(report, inventory) {
  assert.equal(report.bomFormat, 'CycloneDX', 'Expected a CycloneDX SBOM');
  assert.equal(report.specVersion, '1.5', 'Unsupported CycloneDX version');
  assert(Array.isArray(report.components) && Array.isArray(report.dependencies), 'Incomplete SBOM');
  const components = new Map(report.components.map((item) => [`${item.name}@${item.version}`, item]));
  for (const pkg of inventory) {
    const component = components.get(`${pkg.name}@${pkg.version}`);
    assert(component?.['bom-ref'] && component.purl, 'SBOM is missing a resolved package');
    assert(report.dependencies.some((node) => node.ref === component['bom-ref']), 'SBOM is missing dependency edges');
  }
  const refs = new Set([report.metadata?.component?.['bom-ref'], ...report.components.map((item) => item['bom-ref'])]);
  for (const node of report.dependencies) {
    assert(refs.has(node.ref) && Array.isArray(node.dependsOn), 'Invalid SBOM dependency node');
    assert(node.dependsOn.every((ref) => refs.has(ref)), 'Unresolved SBOM dependency edge');
  }
  return { packageLocations: inventory.length, uniqueComponents: components.size };
}

export function checkSarif(report) {
  assert.equal(report.version, '2.1.0', 'Unsupported SARIF report');
  assert(Array.isArray(report.runs) && report.runs.length > 0, 'Missing SARIF runs');
  let findings = 0;
  let blocking = 0;
  const actionable = [];
  for (const run of report.runs) {
    const driver = run.tool?.driver;
    assert.equal(driver?.name, 'CodeQL', 'Expected CodeQL analysis');
    const components = [driver, ...(run.tool?.extensions ?? [])];
    const rules = components.flatMap((component) => component.rules ?? []);
    assert(Array.isArray(rules) && rules.length > 0, 'Missing analyzed rules');
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    assert(Array.isArray(run.results), 'Missing SARIF results');
    assert(Array.isArray(run.invocations) && run.invocations.length > 0, 'Missing analysis completion evidence');
    for (const invocation of run.invocations) {
      assert.equal(invocation.executionSuccessful, true, 'Incomplete CodeQL execution');
      const notifications = [...(invocation.toolExecutionNotifications ?? []), ...(invocation.toolConfigurationNotifications ?? [])];
      assert(!notifications.some((notice) => notice.level === 'error' || notice.level === 'warning'), 'CodeQL reported a coverage or configuration warning');
    }
    for (const result of run.results) {
      const resultRuleId = result.ruleId ?? result.rule?.id;
      const rule = rulesById.get(resultRuleId);
      assert(rule, 'Unresolved SARIF result rule');
      // Suppression and baseline state cannot silently bypass the severity gate.
      const severity = rule.properties?.['security-severity'];
      if (severity !== undefined) {
        const score = Number(severity);
        assert((typeof severity === 'string' || typeof severity === 'number') && String(severity).trim() !== '' && Number.isFinite(score) && score >= 0 && score <= 10, 'Invalid security severity');
        if (score >= 7) {
          blocking += 1;
          const location = result.locations?.[0]?.physicalLocation;
          actionable.push({
            ruleId: resultRuleId,
            severity: String(severity),
            file: location?.artifactLocation?.uri,
            line: location?.region?.startLine,
          });
        }
      } else {
        assert(!rule.properties?.tags?.includes('security'), 'Security finding has no severity');
        if ((result.level ?? rule.defaultConfiguration?.level) === 'error') {
          blocking += 1;
          const location = result.locations?.[0]?.physicalLocation;
          actionable.push({
            ruleId: resultRuleId,
            severity: 'error',
            file: location?.artifactLocation?.uri,
            line: location?.region?.startLine,
          });
        }
      }
      findings += 1;
    }
  }
  return { passed: blocking === 0, runs: report.runs.length, findings, blocking, actionable };
}
