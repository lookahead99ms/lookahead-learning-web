import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const requestedRoot = process.argv[2];
const configuredRoot =
  requestedRoot === '--external'
    ? (process.env.LOOKAHEAD_CONTENT_ROOT ?? '../lookahead-learning-content/runtime')
    : (requestedRoot ?? process.env.LOOKAHEAD_CONTENT_ROOT ?? 'demo-content/runtime');
const sourceRoot = resolve(
  repositoryRoot,
  configuredRoot,
);
const destinationRoot = resolve(repositoryRoot, 'public/content');

async function requireContentSource() {
  const requiredFiles = [
    resolve(sourceRoot, 'learn/catalog.json'),
    resolve(sourceRoot, 'grow/catalog.json'),
  ];

  try {
    await Promise.all(requiredFiles.map((path) => access(path)));
  } catch {
    throw new Error(
      [
        `Content source was not found at ${sourceRoot}.`,
        'Use the tracked demo source or restore an authorized private source.',
        'Do not commit the generated public/content directory.',
      ].join('\n'),
    );
  }
}

async function countFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? countFiles(resolve(directory, entry.name)) : 1)),
  );
  return counts.reduce((total, count) => total + count, 0);
}

await requireContentSource();
await rm(destinationRoot, { recursive: true, force: true });
await mkdir(destinationRoot, { recursive: true });
await cp(sourceRoot, destinationRoot, { recursive: true });

console.log(
  `Prepared ${await countFiles(destinationRoot)} runtime content asset(s) from ${sourceRoot}.`,
);
