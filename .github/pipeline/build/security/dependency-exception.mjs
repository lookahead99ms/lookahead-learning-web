import assert from 'node:assert/strict';
import { checkAudit } from './reports.mjs';

// Owner-approved temporary risk acceptance, not a vulnerability fix.
// Valid through November 30 in America/New_York; expires at December 1 00:00 EST.
export const dependencyException = Object.freeze({
  advisory: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  package: 'picomatch',
  version: '4.0.7',
  expiresAt: '2026-12-01T05:00:00.000Z',
  owner: 'DLV-918',
  reason: 'Unpatched build/test dependency; owner approved temporary acceptance on 2026-11-17.',
});

export function checkAuditWithException(report, inventory, now = new Date()) {
  // Always validate the complete original report before considering the exception.
  const audit = checkAudit(report, inventory);
  assert(
    now instanceof Date && Number.isFinite(now.getTime()),
    'Invalid exception evaluation time',
  );
  const active = now.getTime() < Date.parse(dependencyException.expiresAt);
  const byPath = new Map(inventory.map((pkg) => [pkg.path, pkg]));
  const findings = report.vulnerabilities;
  const reviewedPackages = inventory.filter((pkg) => pkg.name === dependencyException.package);
  const reviewedVersionOnly =
    reviewedPackages.length > 0 &&
    reviewedPackages.every((pkg) => pkg.development && pkg.version === dependencyException.version);

  function eligible(name) {
    if (!active || !reviewedVersionOnly) return false;
    const visited = new Set();
    const anchored = new Set();
    function visit(current) {
      if (visited.has(current)) return true;
      const finding = findings[current];
      if (!finding || finding.name !== current || finding.severity !== 'high') return false;
      if (
        !finding.nodes.every((path) => {
          const pkg = byPath.get(path);
          return pkg?.name === current && pkg.development;
        })
      )
        return false;
      visited.add(current);
      // npm peer dependencies can form cycles. Visit every reachable finding,
      // require a real advisory leaf, and reject any unapproved/missing leaf.
      return finding.via.every((via) => {
        if (typeof via === 'string') return visit(via);
        const approved =
          current === dependencyException.package &&
          via?.name === dependencyException.package &&
          via.dependency === dependencyException.package &&
          via.url === dependencyException.advisory &&
          via.severity === 'high';
        if (approved) anchored.add(current);
        return approved;
      });
    }
    if (!visit(name)) return false;
    // Every reachable component must lead to the advisory, including side branches.
    // A valid path elsewhere must not hide an unrelated closed cycle.
    let changed;
    do {
      changed = false;
      for (const current of visited) {
        if (
          !anchored.has(current) &&
          findings[current].via.some((via) => typeof via === 'string' && anchored.has(via))
        ) {
          anchored.add(current);
          changed = true;
        }
      }
    } while (changed);
    return [...visited].every((current) => anchored.has(current));
  }

  const exceptedFindings = [];
  const blockingFindings = [];
  for (const [name, finding] of Object.entries(findings)) {
    if (!['high', 'critical'].includes(finding.severity)) continue;
    (eligible(name) ? exceptedFindings : blockingFindings).push(name);
  }
  return {
    ...audit,
    passedWithoutExceptions: audit.passed,
    passed: blockingFindings.length === 0,
    blockingFindings,
    exceptedFindings,
    exception: { ...dependencyException, active, evaluatedAt: now.toISOString() },
  };
}
