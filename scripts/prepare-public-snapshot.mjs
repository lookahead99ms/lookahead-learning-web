import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import './verify-public-release.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const destinationRoot = resolve(process.argv[2] ?? '');
const destinationRelativePath = relative(repositoryRoot, destinationRoot);

if (!process.argv[2]) {
  throw new Error('Provide a new destination directory for the public snapshot.');
}
if (
  destinationRelativePath === '' ||
  (!destinationRelativePath.startsWith('..') && !destinationRelativePath.startsWith('../'))
) {
  throw new Error('The public snapshot destination must be outside the historical repository.');
}

try {
  await lstat(destinationRoot);
  throw new Error(`Destination already exists: ${destinationRoot}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const candidates = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: repositoryRoot, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .sort();

await mkdir(destinationRoot, { recursive: false });
let copiedFiles = 0;

for (const path of candidates) {
  const source = resolve(repositoryRoot, path);
  try {
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile()) continue;
  } catch {
    continue;
  }

  const destination = resolve(destinationRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
  copiedFiles += 1;
}

console.log(
  `Prepared ${copiedFiles} public snapshot file(s) in ${destinationRoot}. No Git history was copied.`,
);
