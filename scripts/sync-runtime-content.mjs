import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSearchIndex } from './generate-search-index.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const requestedRoot = process.argv[2];
const demoRoot = resolve(repositoryRoot, 'demo-content/runtime');
const externalRoot = resolve(
  repositoryRoot,
  process.env.LOOKAHEAD_CONTENT_ROOT ?? '../lookahead-learning-content/runtime',
);
const destinationRoot = resolve(repositoryRoot, 'public/content');

async function hasContentSource(root) {
  const requiredFiles = [resolve(root, 'learn/catalog.json'), resolve(root, 'grow/catalog.json')];

  try {
    await Promise.all(requiredFiles.map((path) => access(path)));
    return true;
  } catch {
    return false;
  }
}

async function resolveContentSource() {
  if (requestedRoot === '--external') {
    return externalRoot;
  }

  if (requestedRoot === '--development') {
    return (await hasContentSource(externalRoot)) ? externalRoot : demoRoot;
  }

  return resolve(
    repositoryRoot,
    requestedRoot ?? process.env.LOOKAHEAD_CONTENT_ROOT ?? 'demo-content/runtime',
  );
}

const sourceRoot = await resolveContentSource();

if (!(await hasContentSource(sourceRoot))) {
  throw new Error(
    [
      `Content source was not found at ${sourceRoot}.`,
      'Use the tracked demo source or restore an authorized private source.',
      'Do not commit the generated public/content directory.',
    ].join('\n'),
  );
}

async function countFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? countFiles(resolve(directory, entry.name)) : 1)),
  );
  return counts.reduce((total, count) => total + count, 0);
}

await rm(destinationRoot, { recursive: true, force: true });
await mkdir(destinationRoot, { recursive: true });
await cp(sourceRoot, destinationRoot, { recursive: true });
const { searchDocumentCount, interviewQuestionCount } = await generateSearchIndex(destinationRoot);

console.log(
  `Prepared ${await countFiles(destinationRoot)} runtime asset(s), ${searchDocumentCount} search document(s), and ${interviewQuestionCount} interview question(s) from ${sourceRoot}.`,
);
