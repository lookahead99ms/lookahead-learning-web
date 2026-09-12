import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const templatePath = 'study-plans/templates/synthetic-platform-revision-d7-h1.json';

async function fixture(t) {
  const scratch = join(root, '.codex-scratch');
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, 'ready-made-validation-'));
  await cp(join(root, 'demo-content/runtime'), directory, { recursive: true });
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function validate(directory) {
  const result = spawnSync(process.execPath, ['scripts/validate-content.mjs', directory], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

test('accepts the complete redistributable ready-made catalog', async (t) => {
  const result = validate(await fixture(t));
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /1 ready-made study-plan template/);
});

for (const filename of [
  'study-plans/templates/extra/hidden.json',
  'study-plans/templates/Unknown.json',
]) {
  test(`rejects unknown runtime filename ${filename}`, async (t) => {
    const directory = await fixture(t);
    await mkdir(join(directory, 'study-plans/templates/extra'), { recursive: true });
    await writeFile(join(directory, filename), '{}');
    const result = validate(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /unexpected content file/);
  });
}

const invalidTemplates = [
  {
    label: 'unknown template schema',
    change: (template) => {
      template.schemaVersion = 'study-plan-template/v999';
    },
    expected: /invalid schema/,
  },
  {
    label: 'forward session dependency',
    change: (template) => {
      template.days[0].sessions[0].requiredSessionIds = ['missing-session'];
    },
    expected: /required sessions must precede/,
  },
  {
    label: 'negative availability hidden by balanced totals',
    change: (template) => {
      template.days[0].sessions[0].minutes = 70;
      template.days[0].scheduledMinutes = 70;
      template.days[0].focusedMinutes = 70;
      template.days[0].unallocatedMinutes = -10;
    },
    expected: /non-negative integers/,
  },
  {
    label: 'changed content bytes under an unchanged index hash',
    change: (template) => {
      template.days[0].sessions[0].instructions += ' Changed.';
    },
    expected: /does not match its template/,
  },
];

for (const scenario of invalidTemplates) {
  test(`rejects ${scenario.label}`, async (t) => {
    const directory = await fixture(t);
    const file = join(directory, templatePath);
    const template = JSON.parse(await readFile(file, 'utf8'));
    scenario.change(template);
    await writeFile(file, JSON.stringify(template));
    const result = validate(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.output, scenario.expected);
  });
}
