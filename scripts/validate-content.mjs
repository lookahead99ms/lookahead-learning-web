import { access, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const requestedRoot = process.argv[2];
const configuredRoot =
  requestedRoot === '--external'
    ? (process.env.LOOKAHEAD_CONTENT_ROOT ?? '../lookahead-learning-content/runtime')
    : (requestedRoot ?? process.env.LOOKAHEAD_CONTENT_ROOT ?? 'demo-content/runtime');
const contentRoot = resolve(
  repositoryRoot,
  configuredRoot,
);
const requiredQuestionFields = [
  'id',
  'moduleId',
  'order',
  'title',
  'difficulty',
  'tags',
  'interviewAnswer',
  'explanation',
  'versionNotes',
  'followUps',
];
const difficulties = new Set(['Beginner', 'Intermediate', 'Advanced']);
const patternLanguages = new Set(['java', 'python', 'go']);
const checkCategories = new Set([
  'recognition',
  'invariant',
  'complexity',
  'edge-case',
  'comparison',
]);
const traceCellStates = new Set([
  'active',
  'boundary',
  'changed',
  'discarded',
  'range',
  'related',
  'resolved',
]);
const forbiddenVisualAssets = new Set([
  '/content/learn/algorithmic-patterns/visuals/algorithmic-code-flow.html',
]);
const questionIds = new Set();
const questionsById = new Map();
const patternLessons = [];
let courseCount = 0;
let questionCount = 0;
let traceProblemCount = 0;

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? jsonFiles(path) : extname(entry.name) === '.json' ? [path] : [];
    }),
  );
  return files.flat();
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function collectAssetPaths(value, paths = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetPaths(item, paths);
    return paths;
  }
  if (!value || typeof value !== 'object') return paths;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'assetPath' && typeof nested === 'string') {
      paths.push(nested);
    } else {
      collectAssetPaths(nested, paths);
    }
  }
  return paths;
}

function validateLearningUnits(units, moduleIds, courseLabel) {
  const unitIds = new Set();

  function visit(unit, parentId = null) {
    const unitLabel = `${courseLabel}: learning unit ${unit?.id ?? 'unknown'}`;
    requireValue(
      unit?.id && unit?.title && unit?.description && unit?.theoryModuleId,
      `${unitLabel} has incomplete identity`,
    );
    requireValue(!unitIds.has(unit.id), `${courseLabel}: duplicate learning unit ${unit.id}`);
    unitIds.add(unit.id);
    requireValue(
      moduleIds.has(unit.theoryModuleId),
      `${unitLabel} references missing theory module ${unit.theoryModuleId}`,
    );
    for (const moduleId of [unit.questionModuleId, unit.practiceModuleId].filter(Boolean)) {
      requireValue(moduleIds.has(moduleId), `${unitLabel} references missing module ${moduleId}`);
    }
    if (unit.subUnits !== undefined) {
      requireValue(
        Array.isArray(unit.subUnits) && unit.subUnits.length > 0,
        `${unitLabel} subUnits must be a non-empty array`,
      );
      requireValue(!parentId, `${unitLabel} cannot nest concept families more than one level`);
      for (const subUnit of unit.subUnits) visit(subUnit, unit.id);
    }
  }

  requireValue(Array.isArray(units) && units.length > 0, `${courseLabel}: no learning units`);
  for (const unit of units) visit(unit);
}

try {
  await access(contentRoot);
} catch {
  throw new Error(
    `Content root not found at ${contentRoot}. Restore the selected source or use the tracked demo content.`,
  );
}

const contentFiles = await jsonFiles(contentRoot);

for (const file of contentFiles) {
  const label = relative(contentRoot, file);
  if (
    label.includes('/modules/') ||
    label.includes('/traces/') ||
    basename(file) === 'catalog.json'
  ) {
    continue;
  }
  requireValue(basename(file) === 'course.json', `${label}: unexpected content file`);

  const manifest = JSON.parse(await readFile(file, 'utf8'));
  courseCount += 1;
  requireValue(manifest.id && manifest.path && manifest.title, `${label}: missing course identity`);
  requireValue(
    Array.isArray(manifest.modules) && manifest.modules.length > 0,
    `${label}: no modules`,
  );

  const moduleIds = new Set();
  const moduleOrders = new Set();
  for (const module of manifest.modules) {
    requireValue(module.id && module.title && module.description, `${label}: invalid module`);
    requireValue(
      Number.isInteger(module.order) && module.order > 0,
      `${label}: invalid module order`,
    );
    requireValue(!moduleIds.has(module.id), `${label}: duplicate module id ${module.id}`);
    requireValue(
      !moduleOrders.has(module.order),
      `${label}: duplicate module order ${module.order}`,
    );
    moduleIds.add(module.id);
    moduleOrders.add(module.order);

    const moduleFile = join(dirname(file), 'modules', `${module.id}.json`);
    const moduleLabel = relative(contentRoot, moduleFile);
    let questions;
    try {
      questions = JSON.parse(await readFile(moduleFile, 'utf8'));
    } catch {
      throw new Error(`${moduleLabel}: missing or unreadable module file for ${module.id}`);
    }
    requireValue(
      Array.isArray(questions) && (questions.length > 0 || module.reviewStatus === 'planned'),
      `${moduleLabel}: no questions unless the module is planned`,
    );

    const questionOrders = new Set();
    for (const question of questions) {
      questionCount += 1;
      for (const field of requiredQuestionFields) {
        requireValue(
          question[field] !== undefined,
          `${moduleLabel}: ${question.id ?? 'question'} missing ${field}`,
        );
      }
      requireValue(
        !questionIds.has(question.id),
        `${moduleLabel}: duplicate question id ${question.id}`,
      );
      questionIds.add(question.id);
      questionsById.set(question.id, question);
      requireValue(
        question.moduleId === module.id,
        `${moduleLabel}: ${question.id} has wrong moduleId`,
      );
      requireValue(
        Number.isInteger(question.order) && question.order > 0,
        `${moduleLabel}: invalid order for ${question.id}`,
      );
      const questionOrder = `${question.moduleId}:${question.order}`;
      requireValue(
        !questionOrders.has(questionOrder),
        `${moduleLabel}: duplicate question order ${questionOrder}`,
      );
      questionOrders.add(questionOrder);
      requireValue(
        difficulties.has(question.difficulty),
        `${moduleLabel}: invalid difficulty for ${question.id}`,
      );
      requireValue(
        Array.isArray(question.tags) && question.tags.length > 0,
        `${moduleLabel}: ${question.id} has no tags`,
      );
      requireValue(
        Array.isArray(question.explanation) && question.explanation.length > 0,
        `${moduleLabel}: ${question.id} has no explanation`,
      );
      if (question.code !== undefined) {
        requireValue(
          question.code?.language && question.code?.source,
          `${moduleLabel}: ${question.id} has invalid code`,
        );
      }
      requireValue(
        Array.isArray(question.followUps),
        `${moduleLabel}: ${question.id} followUps must be an array`,
      );
      for (const assetPath of collectAssetPaths(question)) {
        const normalizedPath = assetPath.split(/[?#]/, 1)[0];
        requireValue(
          !forbiddenVisualAssets.has(normalizedPath),
          `${moduleLabel}: ${question.id} references retired pseudo-trace ${assetPath}`,
        );
      }
      if (question.contentType === 'theory' && question.sections !== undefined) {
        requireValue(
          question.summary && Array.isArray(question.sections) && question.sections.length > 0,
          `${moduleLabel}: ${question.id} has incomplete theory content`,
        );
        for (const section of question.sections) {
          requireValue(
            section.id && section.heading && Array.isArray(section.body) && section.body.length > 0,
            `${moduleLabel}: ${question.id} has invalid theory section`,
          );
        }
      }
      if (question.schemaVersion !== undefined) {
        requireValue(
          question.schemaVersion === 'pattern-lesson/v1',
          `${moduleLabel}: ${question.id} uses unsupported schemaVersion ${question.schemaVersion}`,
        );
        patternLessons.push({ lesson: question, moduleLabel });
      }
    }
  }
  if (manifest.learningUnits !== undefined) {
    validateLearningUnits(manifest.learningUnits, moduleIds, label);
  }
}

for (const file of contentFiles.filter((path) => path.includes('/traces/'))) {
  const label = relative(contentRoot, file);
  const problems = JSON.parse(await readFile(file, 'utf8'));
  requireValue(Array.isArray(problems) && problems.length > 0, `${label}: no trace problems`);
  const problemIds = new Set();

  for (const problem of problems) {
    const problemLabel = `${label} problem ${problem?.id ?? 'unknown'}`;
    requireValue(
      problem?.id && problem?.title && problem?.description && problem?.input,
      `${problemLabel} has invalid identity`,
    );
    requireValue(!problemIds.has(problem.id), `${label} repeats trace problem ${problem.id}`);
    problemIds.add(problem.id);
    requireValue(
      problem.complexity?.time && problem.complexity?.space,
      `${problemLabel} has incomplete complexity`,
    );
    requireValue(
      Array.isArray(problem.rows) &&
        problem.rows.every(
          (row) => row?.label && Array.isArray(row.values) && row.values.length > 0,
        ),
      `${problemLabel} has invalid data rows`,
    );
    requireValue(problem.idea && problem.formula, `${problemLabel} has incomplete guidance`);
    requireValue(
      [...patternLanguages].every((language) => problem.code?.[language]?.trim()),
      `${problemLabel} must include Java, Python, and Go code`,
    );
    requireValue(
      Array.isArray(problem.steps) && problem.steps.length > 1,
      `${problemLabel} has too few trace steps`,
    );
    for (const [index, step] of problem.steps.entries()) {
      requireValue(
        step?.phase && step?.what && Array.isArray(step.variables),
        `${problemLabel} step ${index + 1} is incomplete`,
      );
      requireValue(
        [...patternLanguages].every(
          (language) => Number.isInteger(step.lines?.[language]) && step.lines[language] > 0,
        ),
        `${problemLabel} step ${index + 1} has invalid source lines`,
      );
    }
    traceProblemCount += 1;
  }
}

function requireStringArray(value, label, minimum = 1) {
  requireValue(
    Array.isArray(value) &&
      value.length >= minimum &&
      value.every((item) => typeof item === 'string' && item.trim()),
    `${label} must contain at least ${minimum} non-empty string(s)`,
  );
}

function validateCodeBlocks(blocks, label, expectedLanguages) {
  requireValue(Array.isArray(blocks), `${label} must be an array`);
  const languages = new Set();
  for (const block of blocks) {
    requireValue(block?.language && block?.title, `${label} has an invalid code block`);
    requireValue(!languages.has(block.language), `${label} repeats language ${block.language}`);
    languages.add(block.language);
    requireValue(
      Array.isArray(block.lines) && block.lines.length > 0,
      `${label} ${block.language} has no source lines`,
    );
    const lineIds = new Set();
    for (const line of block.lines) {
      requireValue(
        line?.id && typeof line.text === 'string',
        `${label} ${block.language} has an invalid source line`,
      );
      requireValue(
        !lineIds.has(line.id),
        `${label} ${block.language} repeats source anchor ${line.id}`,
      );
      lineIds.add(line.id);
    }
  }
  requireValue(
    languages.size === expectedLanguages.size &&
      [...expectedLanguages].every((language) => languages.has(language)),
    `${label} must contain exactly ${[...expectedLanguages].join(', ')}`,
  );
  return new Map(
    blocks.map((block) => [block.language, new Set(block.lines.map((line) => line.id))]),
  );
}

for (const { lesson, moduleLabel } of patternLessons) {
  const label = `${moduleLabel}: ${lesson.id}`;
  requireValue(lesson.contentType === 'theory', `${label} must use contentType theory`);
  requireValue(
    lesson.sections === undefined &&
      lesson.visuals === undefined &&
      lesson.relatedQuestionIds === undefined,
    `${label} must not mix legacy lesson fields with PatternLessonV1`,
  );
  requireStringArray(lesson.learningOutcomes, `${label} learningOutcomes`, 3);
  requireValue(
    lesson.learningOutcomes.length <= 5,
    `${label} learningOutcomes must contain no more than five items`,
  );
  requireValue(
    lesson.definition?.heading && lesson.definition?.maintainedState,
    `${label} has invalid definition`,
  );
  requireStringArray(lesson.definition?.body, `${label} definition.body`);
  requireValue(
    lesson.motivation?.heading && lesson.motivation?.avoidedWork,
    `${label} has invalid motivation`,
  );
  requireStringArray(lesson.motivation?.body, `${label} motivation.body`);
  requireValue(lesson.recognition?.heading, `${label} has invalid recognition`);
  requireStringArray(lesson.recognition?.body, `${label} recognition.body`);
  requireStringArray(lesson.recognition?.signals, `${label} recognition.signals`, 3);
  requireStringArray(lesson.recognition?.falseFriends, `${label} recognition.falseFriends`, 2);
  requireValue(
    lesson.model?.heading &&
      lesson.model?.state &&
      lesson.model?.invariant &&
      lesson.model?.decisionRule &&
      lesson.model?.proof,
    `${label} has incomplete invariant model`,
  );
  requireValue(
    Array.isArray(lesson.variations) && lesson.variations.length >= 2,
    `${label} needs at least two variations`,
  );
  for (const variation of lesson.variations) {
    requireValue(
      variation?.id && variation?.title && variation?.trigger && variation?.invariant,
      `${label} has an invalid variation`,
    );
  }
  requireValue(lesson.template?.heading, `${label} has invalid template`);
  requireStringArray(lesson.template?.introduction, `${label} template.introduction`);
  validateCodeBlocks(
    [lesson.template?.pseudocode],
    `${label} template pseudocode`,
    new Set(['pseudocode']),
  );
  validateCodeBlocks(
    lesson.template?.implementations,
    `${label} template implementations`,
    patternLanguages,
  );
  requireValue(
    lesson.conceptVisual?.heading && lesson.conceptVisual?.visual?.assetPath,
    `${label} has invalid concept visual`,
  );
  requireStringArray(lesson.conceptVisual?.body, `${label} conceptVisual.body`);
  requireStringArray(lesson.conceptVisual?.transcript, `${label} conceptVisual.transcript`, 3);
  const visualPath = lesson.conceptVisual.visual.assetPath
    .split(/[?#]/, 1)[0]
    .replace(/^\/content\//, '');
  try {
    await access(join(contentRoot, visualPath));
  } catch {
    throw new Error(`${label} references missing visual ${lesson.conceptVisual.visual.assetPath}`);
  }
  requireValue(
    lesson.complexity?.time && lesson.complexity?.space && lesson.complexity?.note,
    `${label} has incomplete complexity guidance`,
  );
  requireStringArray(lesson.complexity?.why, `${label} complexity.why`);
  requireStringArray(lesson.complexity?.tradeoffs, `${label} complexity.tradeoffs`);
  requireValue(
    Array.isArray(lesson.pitfalls) && lesson.pitfalls.length >= 3,
    `${label} needs at least three pitfalls`,
  );
  for (const pitfall of lesson.pitfalls) {
    requireValue(
      pitfall?.failedAssumption && pitfall?.symptom && pitfall?.correction,
      `${label} has an invalid pitfall`,
    );
  }
  requireStringArray(lesson.guidance?.useWhen, `${label} guidance.useWhen`, 2);
  requireStringArray(lesson.guidance?.avoidWhen, `${label} guidance.avoidWhen`, 2);
  requireValue(
    Array.isArray(lesson.workedExamples) && lesson.workedExamples.length >= 2,
    `${label} needs at least two worked examples`,
  );
  for (const example of lesson.workedExamples) {
    requireValue(
      example?.id &&
        example?.title &&
        example?.input &&
        example?.expectedOutput &&
        example?.explanation,
      `${label} has an invalid worked example`,
    );
    requireStringArray(example.steps, `${label} worked example ${example.id} steps`, 2);
  }

  requireValue(
    Array.isArray(lesson.essentialProblems) && lesson.essentialProblems.length === 3,
    `${label} must contain exactly three essential problems`,
  );
  const problemIds = new Set();
  for (const problem of lesson.essentialProblems) {
    const problemLabel = `${label} problem ${problem?.id ?? 'unknown'}`;
    requireValue(
      problem?.id && problem?.title && problem?.description,
      `${problemLabel} has invalid identity`,
    );
    requireValue(!problemIds.has(problem.id), `${label} repeats problem id ${problem.id}`);
    problemIds.add(problem.id);
    requireValue(difficulties.has(problem.difficulty), `${problemLabel} has invalid difficulty`);
    requireValue(
      problem.variation && problem.invariantAdaptation,
      `${problemLabel} has incomplete pattern adaptation`,
    );
    requireValue(
      problem.complexity?.time && problem.complexity?.space && problem.complexity?.why,
      `${problemLabel} has incomplete complexity`,
    );
    requireValue(
      Array.isArray(problem.fixtures) && problem.fixtures.length === 3,
      `${problemLabel} must contain exactly three fixtures`,
    );
    const fixtureIds = new Set();
    for (const fixture of problem.fixtures) {
      requireValue(
        fixture?.id && fixture?.label && fixture?.input && fixture?.expectedOutput,
        `${problemLabel} has an invalid fixture`,
      );
      requireValue(!fixtureIds.has(fixture.id), `${problemLabel} repeats fixture ${fixture.id}`);
      fixtureIds.add(fixture.id);
    }
    const anchorsByLanguage = validateCodeBlocks(
      problem.implementations,
      `${problemLabel} implementations`,
      patternLanguages,
    );
    const trace = problem.trace;
    requireValue(
      trace?.schemaVersion === 'guided-trace/v1' && trace.id && trace.invariant,
      `${problemLabel} has an invalid GuidedTraceV1`,
    );
    requireValue(
      fixtureIds.has(trace.fixtureId),
      `${problemLabel} trace references unknown fixture ${trace.fixtureId}`,
    );
    requireValue(
      Array.isArray(trace.legend) && trace.legend.length > 0,
      `${problemLabel} trace has no legend`,
    );
    for (const legend of trace.legend) {
      requireValue(
        traceCellStates.has(legend?.state) && legend?.label,
        `${problemLabel} trace has an invalid legend item`,
      );
    }
    requireValue(
      Array.isArray(trace.events) && trace.events.length > 1,
      `${problemLabel} trace has too few events`,
    );
    const eventIds = new Set();
    const sourceAnchorCounts = new Map();
    for (const event of trace.events) {
      requireValue(
        event?.id && event?.label && event?.phase && ['before', 'after'].includes(event?.timing),
        `${problemLabel} trace has an invalid event`,
      );
      requireValue(!eventIds.has(event.id), `${problemLabel} trace repeats event ${event.id}`);
      eventIds.add(event.id);
      requireValue(event.what && event.why, `${problemLabel} event ${event.id} needs what and why`);
      requireValue(
        Array.isArray(event.variables) && event.variables.length > 0,
        `${problemLabel} event ${event.id} has no variables`,
      );
      requireValue(
        Array.isArray(event.rows) && event.rows.length > 0,
        `${problemLabel} event ${event.id} has no state rows`,
      );
      for (const language of patternLanguages) {
        requireValue(
          event.sourceAnchor?.[language] &&
            anchorsByLanguage.get(language)?.has(event.sourceAnchor[language]),
          `${problemLabel} event ${event.id} has unresolved ${language} source anchor`,
        );
        const sourceKey = `${language}:${event.sourceAnchor[language]}`;
        sourceAnchorCounts.set(sourceKey, (sourceAnchorCounts.get(sourceKey) ?? 0) + 1);
      }
      for (const row of event.rows) {
        requireValue(
          row?.id && row?.label && Array.isArray(row.cells) && row.cells.length > 0,
          `${problemLabel} event ${event.id} has an invalid state row`,
        );
        for (const cell of row.cells) {
          requireValue(
            typeof cell?.value === 'string',
            `${problemLabel} event ${event.id} has an invalid cell`,
          );
          requireValue(
            cell.states === undefined ||
              (Array.isArray(cell.states) &&
                cell.states.every((state) => traceCellStates.has(state))),
            `${problemLabel} event ${event.id} uses an unknown cell state`,
          );
        }
      }
    }
    requireValue(
      [...sourceAnchorCounts.values()].some((count) => count > 1),
      `${problemLabel} trace must demonstrate repeated source control flow`,
    );
  }

  requireValue(
    Array.isArray(lesson.checks) && lesson.checks.length >= 5 && lesson.checks.length <= 7,
    `${label} must reference five to seven understanding checks`,
  );
  const seenCategories = new Set();
  const seenChecks = new Set();
  for (const check of lesson.checks) {
    requireValue(
      checkCategories.has(check?.category),
      `${label} has invalid check category ${check?.category}`,
    );
    requireValue(!seenChecks.has(check.questionId), `${label} repeats check ${check.questionId}`);
    seenChecks.add(check.questionId);
    seenCategories.add(check.category);
    const question = questionsById.get(check.questionId);
    requireValue(question, `${label} references missing check ${check.questionId}`);
    requireValue(
      question.relatedArticleId === lesson.id,
      `${label} check ${check.questionId} is not explicitly related to this lesson`,
    );
  }
  requireValue(
    [...checkCategories].every((category) => seenCategories.has(category)),
    `${label} checks must cover ${[...checkCategories].join(', ')}`,
  );

  requireValue(
    Array.isArray(lesson.practice) && lesson.practice.length >= 2 && lesson.practice.length <= 5,
    `${label} must reference two to five practice problems`,
  );
  const seenPractice = new Set();
  const seenPracticeTitles = new Set();
  const essentialProblemTitles = new Set(
    lesson.essentialProblems.map(({ title }) => title.trim().toLowerCase()),
  );
  if (lesson.practiceSetPolicy !== undefined) {
    requireValue(
      lesson.practiceSetPolicy === 'guided-plus-distinct-transfer',
      `${label} has unsupported practiceSetPolicy ${lesson.practiceSetPolicy}`,
    );
  }
  for (const reference of lesson.practice) {
    requireValue(
      reference?.questionId && reference?.reason && reference?.variation,
      `${label} has an invalid practice reference`,
    );
    requireValue(
      !seenPractice.has(reference.questionId),
      `${label} repeats practice ${reference.questionId}`,
    );
    seenPractice.add(reference.questionId);
    const question = questionsById.get(reference.questionId);
    requireValue(question, `${label} references missing practice ${reference.questionId}`);
    const normalizedTitle = question.title.trim().toLowerCase();
    if (lesson.practiceSetPolicy === 'guided-plus-distinct-transfer') {
      requireValue(
        !essentialProblemTitles.has(normalizedTitle),
        `${label} practice ${reference.questionId} repeats a guided problem title`,
      );
      requireValue(
        !seenPracticeTitles.has(normalizedTitle),
        `${label} repeats practice title ${question.title}`,
      );
    }
    seenPracticeTitles.add(normalizedTitle);
    requireValue(
      question.relatedArticleId === lesson.id,
      `${label} practice ${reference.questionId} is not explicitly related to this lesson`,
    );
  }
  requireStringArray(lesson.keyTakeaways, `${label} keyTakeaways`, 3);
  requireValue(
    lesson.keyTakeaways.length <= 5,
    `${label} keyTakeaways must contain no more than five items`,
  );
  requireValue(
    Array.isArray(lesson.languageNotes) && lesson.languageNotes.length === 3,
    `${label} must include Java, Python, and Go language notes`,
  );
  requireValue(lesson.reviewEvidence?.note, `${label} is missing review evidence`);
  if (lesson.reviewStatus === 'reviewed') {
    requireValue(
      ['technical', 'editorial', 'ux', 'accessibility'].every(
        (key) => lesson.reviewEvidence[key] === true,
      ),
      `${label} cannot be reviewed until every review-evidence flag is true`,
    );
  }
}

console.log(
  `Validated ${courseCount} course manifest(s), ${questionCount} question(s), ${patternLessons.length} versioned pattern lesson(s), and ${traceProblemCount} trace problem(s).`,
);
