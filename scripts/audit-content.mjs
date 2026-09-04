import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const paths = ['learn', 'grow', 'look-ahead'];
const languages = ['java', 'python', 'go'];
const dsaCourses = ['algorithmic-patterns', 'core-data-structures', 'sorting-searching'];
// This route composes existing courses; it has no course.json of its own.
const derivedCatalogRoutes = new Set(['learn/hands-on-dsa']);
const present = (value) => typeof value === 'string' && value.trim().length > 0;
const allLanguages = (values) => languages.every((language) => values.includes(language));
const flattenUnits = (units = []) =>
  units.flatMap((unit) => [unit, ...flattenUnits(unit.subUnits)]);
const countBy = (values) =>
  values.reduce((counts, value) => {
    counts[value ?? 'unset'] = (counts[value ?? 'unset'] ?? 0) + 1;
    return counts;
  }, {});

function visit(value, callback) {
  if (!value || typeof value !== 'object') return;
  callback(value);
  for (const child of Object.values(value)) visit(child, callback);
}

export function codeLanguages(value) {
  const found = new Set();
  visit(value, (node) => {
    // Language notes and prose about code are not executable/reference code.
    if (
      present(node.language) &&
      (present(node.source) || node.lines?.some((line) => present(line.text)))
    ) {
      found.add(node.language.toLowerCase());
    }
  });
  return [...found].sort();
}

function visuals(value) {
  const found = new Set();
  visit(value, (node) => {
    if (present(node.assetPath)) found.add(node.assetPath);
  });
  return [...found].sort();
}

function traceCount(value) {
  let count = 0;
  visit(value, (node) => {
    if (node.schemaVersion === 'guided-trace/v1') count += 1;
  });
  return count;
}

// Mirrors the current UI identity heuristic. It is NOT a canonical problem ID.
export function normalizeProblemTitle(title) {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(the|a|an|of|to|in|from|with|and|or|using|implementation|variant)\b/g, ' ')
    .replace(/\bii\b/g, '2')
    .replace(/\biii\b/g, '3')
    .replace(/\biv\b/g, '4')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function practiceContractGaps(question) {
  const practice = question.practiceProblem ?? {};
  const checks = {
    objective: present(practice.objective),
    constraints: practice.constraints?.length > 0 && practice.constraints.every(present),
    examples:
      practice.examples?.length > 0 &&
      practice.examples.every((item) => present(item.input) && present(item.output)),
    tests:
      practice.testCases?.length >= 3 &&
      ['representative', 'boundary', 'failure'].every((category) =>
        practice.testCases.some((item) => item.category === category),
      ) &&
      practice.testCases.every((item) => present(item.input) && present(item.expectedOutput)),
    hints: practice.hints?.length >= 2 && practice.hints.every(present),
    source: present(practice.externalUrl),
    complexity: ['time', 'space', 'note'].every((key) => present(question.complexity?.[key])),
    javaPythonGoSolutions: allLanguages(codeLanguages(question.solutions)),
  };
  return Object.keys(checks).filter((key) => !checks[key]);
}

function guidedGaps(problem) {
  const checks = {
    description: present(problem.description),
    invariant: present(problem.invariantAdaptation),
    complexity: ['time', 'space', 'why'].every((key) => present(problem.complexity?.[key])),
    fixtures:
      problem.fixtures?.length >= 3 &&
      problem.fixtures.every((item) => present(item.input) && present(item.expectedOutput)),
    javaPythonGoImplementations: allLanguages(codeLanguages(problem.implementations)),
    trace:
      problem.trace?.schemaVersion === 'guided-trace/v1' &&
      problem.trace.events?.length > 0 &&
      problem.fixtures?.some((fixture) => fixture.id === problem.trace.fixtureId),
  };
  return Object.keys(checks).filter((key) => !checks[key]);
}

export function auditDsa(courses) {
  const groups = [];
  const appearances = [];
  for (const course of courses.filter(
    (item) => item.path === 'learn' && dsaCourses.includes(item.id),
  )) {
    const byId = new Map(course.questions.map((item) => [item.id, item]));
    for (const unit of flattenUnits(course.learningUnits)) {
      const lesson = course.questions.find(
        (item) => item.moduleId === unit.theoryModuleId && item.contentType === 'theory',
      );
      if (!lesson) continue;
      const isPattern = lesson.schemaVersion === 'pattern-lesson/v1';
      const essentials = isPattern ? (lesson.essentialProblems ?? []) : [];
      const linkedIds = isPattern ? (lesson.practice ?? []).map((item) => item.questionId) : [];
      const continuation = [
        ...linkedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)] : [])),
        ...course.questions.filter(
          (item) =>
            item.moduleId === unit.practiceModuleId &&
            item.relatedArticleId === lesson.id &&
            !linkedIds.includes(item.id),
        ),
      ];
      if (!essentials.length && !continuation.length) continue;
      const groupId = `${course.id}:${unit.id}`;
      groups.push({
        id: groupId,
        title: unit.title,
        lessonId: lesson.id,
        guided: essentials.length,
        continuation: continuation.length,
      });
      for (const problem of [...essentials, ...continuation]) {
        const guided = essentials.includes(problem);
        const complete = !guided && problem.practiceProblem?.implementationStatus === 'complete';
        appearances.push({
          groupId,
          lessonId: lesson.id,
          id: problem.id,
          title: problem.title,
          normalizedTitle: normalizeProblemTitle(problem.title),
          difficulty: problem.difficulty,
          declaredMode: guided ? 'guided' : complete ? 'practice-ready' : 'catalogued',
          structuralGaps: guided ? guidedGaps(problem) : practiceContractGaps(problem),
          languages: codeLanguages(guided ? problem.implementations : problem.solutions),
          fixtures: (guided ? problem.fixtures : problem.practiceProblem?.testCases)?.length ?? 0,
          traceEvents: problem.trace?.events?.length ?? 0,
          sourceSets: problem.practiceProblem?.sourceSets ?? [],
        });
      }
    }
  }
  const titles = [...new Set(appearances.map((item) => item.normalizedTitle))].sort();
  const problems = titles.map((key) => {
    const matching = appearances.filter((item) => item.normalizedTitle === key);
    const guided = matching.some((item) => item.declaredMode === 'guided');
    const practiceReady = matching.some((item) => item.declaredMode === 'practice-ready');
    return {
      normalizedTitle: key,
      titles: [...new Set(matching.map((item) => item.title))],
      guided,
      practiceReady,
      catalogOnly: !guided && !practiceReady,
      structurallyGuided: matching.some(
        (item) => item.declaredMode === 'guided' && !item.structuralGaps.length,
      ),
      structurallyPracticeReady: matching.some(
        (item) => item.declaredMode === 'practice-ready' && !item.structuralGaps.length,
      ),
      difficulties: [...new Set(matching.map((item) => item.difficulty))],
      appearances: matching,
    };
  });
  return {
    groups,
    summary: {
      groupCount: groups.length,
      appearances: appearances.length,
      normalizedTitles: problems.length,
      guided: problems.filter((p) => p.guided).length,
      practiceReady: problems.filter((p) => p.practiceReady).length,
      guidedAndPracticeReady: problems.filter((p) => p.guided && p.practiceReady).length,
      catalogOnly: problems.filter((p) => p.catalogOnly).length,
      structurallyGuided: problems.filter((p) => p.structurallyGuided).length,
      structurallyPracticeReady: problems.filter((p) => p.structurallyPracticeReady).length,
      repeatedTitleGroups: problems.filter((p) => p.appearances.length > 1).length,
      conflictingDifficultyGroups: problems.filter((p) => p.difficulties.length > 1).length,
      difficultyByAppearance: countBy(appearances.map((p) => p.difficulty)),
      executableSolutionsVerifiedByThisAudit: 0,
    },
    problems,
  };
}

function proseStats(item) {
  const parts =
    item.schemaVersion === 'pattern-lesson/v1'
      ? [
          ...(item.definition?.body ?? []),
          ...(item.motivation?.body ?? []),
          ...(item.recognition?.body ?? []),
        ]
      : (item.sections ?? []).flatMap((section) => section.body ?? []);
  const normalized = parts
    .map((part) =>
      part
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return {
    bodyWords: normalized.join(' ').split(/\s+/).filter(Boolean).length,
    bodyParagraphs: normalized.length,
    repeatedBodyParagraphs: normalized.length - new Set(normalized).size,
  };
}

function measureItem(item, course, module, source) {
  const theoryTagged = item.contentType === 'theory';
  // Match article discovery: older Q&As can carry a theory tag without a lesson.
  const theory =
    theoryTagged &&
    (['pattern-lesson/v1', 'foundation-lesson/v1'].includes(item.schemaVersion) ||
      !!item.sections?.length);
  const ownContent = { ...item, essentialProblems: undefined };
  const refs = visuals(item);
  const implementations = codeLanguages(item);
  const ownImplementations = codeLanguages(ownContent);
  return {
    path: course.path,
    courseId: course.id,
    moduleId: module.id,
    source,
    id: item.id,
    title: item.title,
    contentType: item.contentType ?? 'q-and-a',
    schemaVersion: item.schemaVersion ?? null,
    reviewStatus: item.reviewStatus ?? null,
    reviewEvidence: item.reviewEvidence ?? null,
    relatedArticleId: item.relatedArticleId ?? null,
    theoryTagged,
    theory,
    languages: implementations,
    ownLanguages: ownImplementations,
    allThreeLanguages: allLanguages(implementations),
    ownAllThreeLanguages: allLanguages(ownImplementations),
    visualReferences: refs,
    traceCount: traceCount(item),
    embeddedGuidedProblems: item.essentialProblems?.length ?? 0,
    hasMemoryAnchor: present(item.memoryAnchor?.phrase),
    hasInvariant: present(item.model?.invariant ?? item.foundationModel?.invariant),
    hasRecall:
      present(item.interviewRecall?.prompt) && item.interviewRecall?.answerFramework?.length > 0,
    checks: item.checks?.length ?? 0,
    practiceLinks: item.practice?.length ?? 0,
    hasCarlAndStar:
      ['context', 'action', 'result', 'learning'].every((key) =>
        present(item.evidence?.carl?.[key]),
      ) &&
      ['situation', 'task', 'action', 'result'].every((key) => present(item.evidence?.star?.[key])),
    practiceStatus: item.practiceProblem?.implementationStatus ?? null,
    practiceGaps: item.practiceProblem ? practiceContractGaps(item) : null,
    ...proseStats(item),
  };
}

export function summarize(items) {
  const lessons = items.filter((item) => item.theory);
  return {
    items: items.length,
    lessons: lessons.length,
    theoryTaggedRecords: items.filter((item) => item.theoryTagged).length,
    theoryTagOnlyRecords: items.filter((item) => item.theoryTagged && !item.theory).length,
    patternLessons: lessons.filter((item) => item.schemaVersion === 'pattern-lesson/v1').length,
    foundationLessons: lessons.filter((item) => item.schemaVersion === 'foundation-lesson/v1')
      .length,
    types: countBy(items.map((item) => item.contentType)),
    reviewLabels: countBy(items.map((item) => item.reviewStatus)),
    lessonsWithCode: lessons.filter((item) => item.ownLanguages.length).length,
    lessonsWithAllThreeLanguages: lessons.filter((item) => item.ownAllThreeLanguages).length,
    lessonsWithVisuals: lessons.filter((item) => item.visualReferences.length).length,
    uniqueVisualFiles: new Set(
      items.flatMap((item) => item.visualReferences.map((ref) => ref.split(/[?#]/)[0])),
    ).size,
    lessonsWithMemoryAnchor: lessons.filter((item) => item.hasMemoryAnchor).length,
    lessonsWithInvariant: lessons.filter((item) => item.hasInvariant).length,
    lessonsWithRecall: lessons.filter((item) => item.hasRecall).length,
    lessonsWithChecks: lessons.filter((item) => item.checks > 0).length,
    lessonsWithPracticeLinks: lessons.filter((item) => item.practiceLinks > 0).length,
    lessonsClaimingAllReviewDimensions: lessons.filter((item) =>
      ['technical', 'editorial', 'ux', 'accessibility'].every(
        (key) => item.reviewEvidence?.[key] === true,
      ),
    ).length,
    itemsWithCode: items.filter((item) => item.languages.length).length,
    codeLanguages: Object.fromEntries(
      languages.map((language) => [
        language,
        items.filter((item) => item.languages.includes(language)).length,
      ]),
    ),
    carlAndStarItems: items.filter((item) => item.hasCarlAndStar).length,
    relatedArticles: items.filter((item) => item.relatedArticleId).length,
    embeddedGuidedProblems: items.reduce((sum, item) => sum + item.embeddedGuidedProblems, 0),
    inlineTraces: items.reduce((sum, item) => sum + item.traceCount, 0),
    declaredCompletePractice: items.filter((item) => item.practiceStatus === 'complete').length,
    completePracticeWithContractGaps: items.filter(
      (item) => item.practiceStatus === 'complete' && item.practiceGaps.length,
    ).length,
    starterPractice: items.filter((item) => item.practiceStatus === 'starter').length,
  };
}

async function walk(root, prefix = '') {
  const files = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Audit refuses symbolic link: ${name}`);
    if (entry.isDirectory()) files.push(...(await walk(resolve(root, entry.name), `${name}/`)));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}

export async function auditContent(root) {
  const files = new Map();
  const hashes = [];
  const rootEntries = await readdir(root, { withFileTypes: true });
  const presentPaths = [];
  for (const path of paths) {
    const entry = rootEntries.find((item) => item.name === path);
    if (!entry) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(`Expected a real learner directory: ${path}`);
    }
    presentPaths.push(path);
    for (const file of await walk(resolve(root, path), `${path}/`)) {
      const bytes = await readFile(resolve(root, file));
      hashes.push({
        file,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      files.set(file, bytes.toString('utf8'));
    }
  }
  if (!hashes.length) throw new Error('No learner content files found in the runtime root.');
  const issues = [];
  const usedModules = new Set();
  const courses = [];
  const items = [];
  const modules = [];
  const catalogs = {};
  for (const path of paths) {
    const file = `${path}/catalog.json`;
    if (presentPaths.includes(path) && !files.has(file)) {
      throw new Error(`Missing catalog in learner directory: ${file}`);
    }
    catalogs[path] = files.has(file) ? JSON.parse(files.get(file)) : [];
  }
  for (const [file, source] of files) {
    if (!file.endsWith('/course.json')) continue;
    const course = JSON.parse(source);
    const path = file.split('/')[0];
    if (course.path !== path) issues.push({ kind: 'course-path-mismatch', file });
    const questions = [];
    for (const module of course.modules) {
      const moduleFile = `${dirname(file)}/modules/${module.id}.json`;
      usedModules.add(moduleFile);
      if (!files.has(moduleFile)) {
        issues.push({ kind: 'missing-module', file: moduleFile });
        continue;
      }
      const content = JSON.parse(files.get(moduleFile));
      if (!Array.isArray(content)) throw new Error(`${moduleFile}: expected array`);
      modules.push({
        path,
        courseId: course.id,
        id: module.id,
        title: module.title,
        source: moduleFile,
        planned: module.reviewStatus === 'planned',
        recordsOnDisk: content.length,
        reviewStatus: module.reviewStatus ?? null,
      });
      if (module.reviewStatus === 'planned') continue;
      questions.push(...content);
      for (const question of content) items.push(measureItem(question, course, module, moduleFile));
      if (!content.length) issues.push({ kind: 'empty-active-module', file: moduleFile });
    }
    courses.push({ ...course, questions });
  }
  for (const file of files.keys()) {
    if (file.includes('/modules/') && file.endsWith('.json') && !usedModules.has(file)) {
      issues.push({ kind: 'unreferenced-module-file', file });
    }
  }
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id))
      issues.push({ kind: 'duplicate-item-id', id: item.id, file: item.source });
    ids.add(item.id);
    for (const ref of item.visualReferences) {
      const file = ref.split(/[?#]/)[0].replace(/^\/content\//, '');
      if (!files.has(file)) issues.push({ kind: 'missing-visual-file', id: item.id, ref });
    }
    if (
      item.relatedArticleId &&
      !items.some(
        (other) =>
          other.id === item.relatedArticleId &&
          other.theory &&
          other.courseId === item.courseId &&
          other.path === item.path,
      )
    ) {
      issues.push({
        kind: 'unresolved-related-article',
        id: item.id,
        target: item.relatedArticleId,
      });
    }
  }
  const courseRows = courses.map((course) => {
    const matching = items.filter(
      (item) => item.courseId === course.id && item.path === course.path,
    );
    const units = flattenUnits(course.learningUnits);
    const missingTheoryUnits = units.filter(
      (unit) =>
        !unit.planned &&
        !course.questions.some(
          (item) => item.contentType === 'theory' && item.moduleId === unit.theoryModuleId,
        ),
    );
    const catalog = catalogs[course.path]?.find((entry) => entry.id === course.id);
    return {
      path: course.path,
      id: course.id,
      title: course.title,
      inCatalog: !!catalog,
      catalogAvailable: !!catalog && catalog.available !== false,
      modules: course.modules.length,
      plannedModules: course.modules.filter((module) => module.reviewStatus === 'planned').length,
      learningUnits: units.length,
      unitsMissingTheory: missingTheoryUnits.map((unit) => unit.id),
      ...summarize(matching),
    };
  });
  const pathRows = paths.map((path) => ({
    path,
    present: presentPaths.includes(path),
    catalogs: catalogs[path].length,
    unavailableCatalogEntries: catalogs[path].filter((item) => item.available === false || !item.id)
      .length,
    courses: courses.filter((course) => course.path === path).length,
    modules: modules.filter((module) => module.path === path).length,
    plannedModules: modules.filter((module) => module.path === path && module.planned).length,
    ...summarize(items.filter((item) => item.path === path)),
  }));
  for (const path of paths)
    for (const entry of catalogs[path]) {
      if (
        entry.id &&
        entry.available !== false &&
        !derivedCatalogRoutes.has(`${path}/${entry.id}`) &&
        !courses.some((course) => course.id === entry.id && course.path === path)
      ) {
        issues.push({ kind: 'missing-catalog-course', path, id: entry.id });
      }
    }
  const repeated = new Map();
  for (const course of courses)
    for (const question of course.questions) {
      if (question.contentType === 'theory' || !present(question.interviewAnswer)) continue;
      const key = question.interviewAnswer.replace(/\s+/g, ' ').trim();
      repeated.set(key, [
        ...(repeated.get(key) ?? []),
        { path: course.path, courseId: course.id, id: question.id },
      ]);
    }
  return {
    schemaVersion: 'content-audit/v1',
    absentPaths: paths.filter((path) => !presentPaths.includes(path)),
    sourceFingerprint: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
    methodology: {
      scope:
        'Local source files in Learn, Grow, and Look Ahead. Planned modules are counted but their records are excluded, matching the course loader. Delivery, generated indexes, and application behavior are not audited.',
      evidence:
        'Structural presence only. Review booleans and complete labels are assertions, not independently verified quality. No learner code is executed. Missing code can be intentional for conceptual or technology-specific lessons.',
      lessons:
        'A lesson needs contentType theory plus a versioned lesson schema or nonempty sections, matching article discovery. Legacy tag-only records remain counted separately, not as lesson payloads.',
      dsaIdentity:
        'UI-equivalent normalized titles, not canonical identity. Guided and practice-ready overlap; never add those counts without subtracting their intersection.',
      verification:
        'Zero solutions executed by this inventory, not a claim that prior verification never happened. Use the separately attached sampled review and validation evidence.',
    },
    derivedCatalogEntries: paths.flatMap((path) =>
      catalogs[path]
        .filter((entry) => derivedCatalogRoutes.has(`${path}/${entry.id}`))
        .map((entry) => ({ path, id: entry.id })),
    ),
    paths: pathRows,
    courses: courseRows,
    modules,
    items,
    dsa: auditDsa(courses),
    detachedTraceFiles: hashes
      .filter((item) => item.file.includes('/traces/') && item.file.endsWith('.json'))
      .map(({ file }) => {
        const content = JSON.parse(files.get(file));
        const legacy = (Array.isArray(content) ? content : []).filter(
          (item) => !item.schemaVersion && Array.isArray(item.steps),
        );
        return {
          file,
          versionedTraces: traceCount(content),
          legacyTraceProblems: legacy.length,
          legacyProblems: legacy.map((item) => ({
            id: item.id,
            steps: item.steps.length,
            languages: languages.filter((language) => present(item.code?.[language])),
          })),
        };
      }),
    duplicateAnswerGroups: [...repeated.values()]
      .filter((group) => group.length > 1)
      .sort((a, b) => b.length - a.length),
    issues,
    files: hashes,
  };
}

export function parseOptions(args, env = process.env) {
  let root = 'demo-content/runtime';
  let output;
  if (args[0] && !args[0].startsWith('--')) root = args.shift();
  if (args[0] === '--external') {
    args.shift();
    root = env.LOOKAHEAD_CONTENT_ROOT ?? '../lookahead-learning-content/runtime';
  }
  if (args[0] === '--output' && args[1]) {
    args.shift();
    output = args.shift();
  }
  if (args.length)
    throw new Error(
      'Usage: node scripts/audit-content.mjs [root | --external] [--output report.json]',
    );
  return {
    root: resolve(repositoryRoot, root),
    output: output ? resolve(repositoryRoot, output) : null,
  };
}

async function main() {
  const { root, output } = parseOptions(process.argv.slice(2));
  if (output) {
    const fromRoot = relative(root, output);
    if (
      !fromRoot ||
      (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`))
    ) {
      throw new Error('Write audit reports outside the runtime source directory.');
    }
  }
  const report = await auditContent(root);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, json);
    console.log(
      JSON.stringify(
        {
          sourceFingerprint: report.sourceFingerprint,
          paths: report.paths,
          dsa: report.dsa.summary,
          issues: report.issues,
          output,
        },
        null,
        2,
      ),
    );
  } else process.stdout.write(json);
  if (report.issues.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
