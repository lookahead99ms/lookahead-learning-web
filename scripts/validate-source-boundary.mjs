import { execFileSync } from 'node:child_process';

const forbiddenPaths = [
  'private-content',
  'public/content',
  'scripts/data/learn-source.json',
  'docs/algorithm-pattern-audit.md',
  'docs/grow-curriculum-tree.md',
  'docs/specs/algorithm-pattern-experience.md',
  'docs/platform-completion-plan.private.md',
];

const trackedFiles = execFileSync(
  'git',
  ['ls-files', '--', ...forbiddenPaths],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean);

if (trackedFiles.length > 0) {
  throw new Error(
    `Private or generated content is tracked by Git:\n${trackedFiles.join('\n')}`,
  );
}

console.log('Verified that private curriculum and generated runtime content are not tracked.');
