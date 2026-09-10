import { access, cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHandsOnDsaIndex } from './generate-hands-on-dsa-index.mjs';
import { generateSearchIndex } from './generate-search-index.mjs';
import {
  publishRuntimeDirectory,
  withRuntimePublicationLock,
} from './runtime-content-publication.mjs';

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

const scratchRoot = resolve(repositoryRoot, '.codex-scratch/runtime-content-sync');
await mkdir(scratchRoot, { recursive: true });
await withRuntimePublicationLock(resolve(scratchRoot, 'publication.lock'), async () => {
  const transactionRoot = await mkdtemp(resolve(scratchRoot, 'stage-'));
  const stageRoot = resolve(transactionRoot, 'content');
  const backupRoot = resolve(transactionRoot, 'previous');
  try {
    await cp(sourceRoot, stageRoot, { recursive: true });
    const { searchDocumentCount, interviewQuestionCount, answerSlideDeckCount } =
      await generateSearchIndex(stageRoot);
    const handsOnDsa = await generateHandsOnDsaIndex(stageRoot);
    // Only the compact learner-facing ranks belong in served assets. The
    // authoring manifest contains internal evidence, confidence and sources.
    await rm(resolve(stageRoot, 'learn/hands-on-dsa-ranking.json'), { force: true });
    const fileCount = await countFiles(stageRoot);
    await publishRuntimeDirectory(stageRoot, destinationRoot, backupRoot);
    console.log(
      `Prepared ${fileCount} runtime asset(s), ${searchDocumentCount} search document(s), ${interviewQuestionCount} interview question(s), ${answerSlideDeckCount} answer slide deck(s), and ${handsOnDsa.distinctProblems} canonical Hands-On DSA problem(s) from ${sourceRoot}.`,
    );
  } finally {
    const hasRecoveryBackup = await access(backupRoot).then(
      () => true,
      () => false,
    );
    if (hasRecoveryBackup) {
      console.error(`Previous runtime retained for recovery at ${backupRoot}.`);
    } else {
      await rm(transactionRoot, { recursive: true, force: true });
    }
  }
});
