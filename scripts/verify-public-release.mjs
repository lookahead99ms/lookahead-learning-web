import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const verifierPath = 'scripts/verify-public-release.mjs';
const requiredPublicFiles = [
  'demo-content/runtime/learn/catalog.json',
  'demo-content/runtime/grow/catalog.json',
  'docs/architecture.md',
  'docs/content-boundary.md',
  'docs/public-repository-runbook.md',
  'SECURITY.md',
  '.dockerignore',
  'package-lock.json',
  'src/environments/environment.demo.ts',
];
const forbiddenPaths = new Set([
  '.DS_Store',
  'docs/algorithm-pattern-audit.md',
  'docs/grow-curriculum-tree.md',
  'docs/platform-completion-plan.private.md',
  'docs/product-blueprint.md',
  'docs/product-delivery-handoff.md',
  'docs/specs/algorithm-pattern-experience.md',
  'scripts/data/learn-source.json',
]);
const forbiddenPrefixes = [
  '.angular/',
  '.codex-scratch/',
  '.codex/',
  '.agents/',
  '.public-release/',
  'public-release/',
  '.idea/',
  '.local-previews/',
  'dist/',
  'node_modules/',
  'private-content/',
  'public/content/',
  'public/local-previews/',
  'docs/evidence/',
  'coverage/',
];
const sensitiveExtensions = new Set(['.jks', '.key', '.keystore', '.p12', '.pem', '.pfx']);
const contentChecks = [
  {
    label: 'an absolute local user path',
    pattern: /(?:^|[\s('"=])(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s)'"<]+/m,
  },
  {
    label: 'an import from the private content tree',
    pattern: /(?:from\s+|import\s*\()(['"])[^'"]*private-content\/[^'"]*\1/m,
  },
  {
    label: 'a private key marker',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { label: 'an AWS access key shape', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'a GitHub token shape', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
];

function candidatePaths() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .sort();
}

function isSensitiveFile(path) {
  const name = basename(path);
  return (
    name === '.env' ||
    (name.startsWith('.env.') && name !== '.env.example') ||
    name === '.npmrc' ||
    name.includes('.private.') ||
    name.endsWith('.iml') ||
    sensitiveExtensions.has(extname(name).toLowerCase())
  );
}

const candidates = candidatePaths();
const candidateSet = new Set(candidates);
const violations = [];
let inspectedFiles = 0;

const trackedIgnored = execFileSync(
  'git',
  ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'],
  { cwd: repositoryRoot, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
for (const path of trackedIgnored) {
  violations.push(`${path}: already tracked despite an ignore rule; review the index explicitly`);
}

for (const requiredFile of requiredPublicFiles) {
  if (!candidateSet.has(requiredFile)) {
    violations.push(`${requiredFile}: required public-readiness file is missing`);
  }
}

for (const path of candidates) {
  let fileStat;
  try {
    fileStat = await lstat(resolve(repositoryRoot, path));
  } catch {
    continue;
  }

  if (forbiddenPaths.has(path) || forbiddenPrefixes.some((prefix) => path.startsWith(prefix))) {
    violations.push(`${path}: private, generated, or local-only path`);
    continue;
  }
  if (fileStat.isSymbolicLink()) {
    violations.push(`${path}: symbolic links are not allowed in the public snapshot`);
    continue;
  }
  if (!fileStat.isFile()) continue;
  if (isSensitiveFile(path)) {
    violations.push(`${path}: credential-shaped filename`);
    continue;
  }
  if (path === verifierPath) continue;

  const buffer = await readFile(resolve(repositoryRoot, path));
  if (buffer.includes(0)) continue;
  const source = buffer.toString('utf8');
  for (const check of contentChecks) {
    if (check.pattern.test(source)) violations.push(`${path}: contains ${check.label}`);
  }
  inspectedFiles += 1;
}

const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
if (!packageJson.scripts?.['content:sync']?.includes('demo-content/runtime')) {
  violations.push('package.json: the default content source must be the tracked public demo');
}
if (packageJson.scripts?.prestart !== 'npm run content:sync') {
  violations.push('package.json: npm start must stage the demo without private-source discovery');
}
const angular = JSON.parse(await readFile(resolve(repositoryRoot, 'angular.json'), 'utf8'));
const targets = Object.values(angular.projects)[0].architect;
if (
  targets.serve.defaultConfiguration !== 'demo' ||
  targets.serve.configurations.demo?.proxyConfig ||
  targets.serve.options?.proxyConfig ||
  targets.serve.configurations.demo?.buildTarget !== 'lookahead-learning-web:build:development,demo'
) {
  violations.push(
    'angular.json: default demo must use its isolated build configuration without an API proxy',
  );
}
const demoEnvironment = await readFile(
  resolve(repositoryRoot, 'src/environments/environment.demo.ts'),
  'utf8',
);
if (
  !/accountPlansEnabled:\s*false/.test(demoEnvironment) ||
  !targets.build.configurations.demo?.fileReplacements?.some(
    (replacement) =>
      replacement.replace === 'src/environments/environment.ts' &&
      replacement.with === 'src/environments/environment.demo.ts',
  )
) {
  violations.push('angular.json: standalone demo must disable account API integration');
}
if (!packageJson.scripts?.['content:sync:private']?.includes('--external')) {
  violations.push('package.json: the authorized external content mode must remain explicit');
}
for (const [dependency, approved] of Object.entries(packageJson.allowScripts ?? {})) {
  if (!/@\d+\.\d+\.\d+(?:[-+].*)?$/.test(dependency) || approved !== true) {
    violations.push(
      `package.json: install-script approval must be version-pinned and true (${dependency})`,
    );
  }
}

if (violations.length > 0) {
  throw new Error(`Public release candidate failed:\n${violations.join('\n')}`);
}

console.log(
  `Verified ${candidates.length} candidate path(s) and scanned ${inspectedFiles} text file(s) for public release.`,
);
