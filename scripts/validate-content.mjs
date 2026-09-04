import { access, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const requestedRoot = process.argv[2];
const configuredRoot =
  requestedRoot === '--external'
    ? (process.env.LOOKAHEAD_CONTENT_ROOT ?? '../lookahead-learning-content/runtime')
    : (requestedRoot ?? process.env.LOOKAHEAD_CONTENT_ROOT ?? 'demo-content/runtime');
const contentRoot = resolve(repositoryRoot, configuredRoot);
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
const foundationLessons = [];
const referencedAssetPaths = new Set();
let courseCount = 0;
let questionCount = 0;
let traceProblemCount = 0;
let deliveryPlanCount = 0;

async function filesWithExtension(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? filesWithExtension(path, extension)
        : extname(entry.name) === extension
          ? [path]
          : [];
    }),
  );
  return files.flat();
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function validateDeliveryPlan(plan, label) {
  requireValue(plan?.schemaVersion === 'delivery-plan/v1', `${label}: invalid schema version`);
  requireValue(plan.id && plan.title && plan.summary, `${label}: incomplete plan identity`);
  requireValue(Array.isArray(plan.workflow) && plan.workflow.length > 0, `${label}: no workflow`);
  requireValue(
    Array.isArray(plan.priorities) && plan.priorities.length > 0,
    `${label}: no priorities`,
  );
  requireValue(Array.isArray(plan.stages) && plan.stages.length > 0, `${label}: no stages`);
  requireValue(Array.isArray(plan.workItems), `${label}: workItems must be an array`);
  requireValue(Array.isArray(plan.decisions), `${label}: decisions must be an array`);
  requireValue(
    plan.deliverySequence?.title &&
      plan.deliverySequence?.note &&
      Array.isArray(plan.deliverySequence?.windows) &&
      plan.deliverySequence.windows.length > 0,
    `${label}: delivery sequence is incomplete`,
  );

  const uniqueIds = (items, kind) => {
    const ids = new Set();
    for (const item of items) {
      requireValue(item?.id, `${label}: ${kind} has no id`);
      requireValue(!ids.has(item.id), `${label}: duplicate ${kind} id ${item.id}`);
      ids.add(item.id);
    }
    return ids;
  };

  const workflowIds = uniqueIds(plan.workflow, 'workflow state');
  const priorityIds = uniqueIds(plan.priorities, 'priority');
  const stageIds = uniqueIds(plan.stages, 'stage');
  const workItemIds = uniqueIds(plan.workItems, 'work item');
  uniqueIds(plan.decisions, 'decision');
  uniqueIds(plan.deliverySequence.windows, 'delivery window');

  requireValue(stageIds.has(plan.currentStageId), `${label}: current stage does not exist`);
  for (const stage of plan.stages) {
    requireValue(
      Number.isInteger(stage.order) &&
        stage.order > 0 &&
        stage.title &&
        stage.goal &&
        stage.reviewGate,
      `${label}: stage ${stage.id} is incomplete`,
    );
  }
  for (const item of plan.workItems) {
    requireValue(
      item.title && item.summary && item.type && item.updatedAt,
      `${label}: work item ${item.id} is incomplete`,
    );
    requireValue(
      stageIds.has(item.stageId),
      `${label}: ${item.id} has unknown stage ${item.stageId}`,
    );
    requireValue(
      workflowIds.has(item.statusId),
      `${label}: ${item.id} has unknown workflow state ${item.statusId}`,
    );
    requireValue(
      priorityIds.has(item.priorityId),
      `${label}: ${item.id} has unknown priority ${item.priorityId}`,
    );
    requireValue(
      Array.isArray(item.acceptanceCriteria) && item.acceptanceCriteria.length > 0,
      `${label}: ${item.id} has no acceptance criteria`,
    );
    requireValue(
      Array.isArray(item.labels) &&
        Array.isArray(item.dependencies) &&
        Array.isArray(item.blockedBy),
      `${label}: ${item.id} has invalid labels or relationships`,
    );
    for (const relationship of [...item.dependencies, ...item.blockedBy]) {
      requireValue(
        workItemIds.has(relationship),
        `${label}: ${item.id} references unknown work item ${relationship}`,
      );
    }
    if (item.evidence !== undefined) {
      requireValue(Array.isArray(item.evidence), `${label}: ${item.id} evidence must be an array`);
      uniqueIds(item.evidence, `${item.id} evidence`);
      for (const report of item.evidence) {
        requireValue(
          /^[A-Za-z0-9_-]+$/.test(report.id) &&
            typeof report.title === 'string' &&
            report.title.trim() &&
            typeof report.path === 'string' &&
            /^docs\/evidence\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(report.path),
          `${label}: ${item.id} has invalid evidence metadata`,
        );
      }
    }
  }
  for (const decision of plan.decisions) {
    requireValue(
      decision.title && decision.decision && decision.rationale && decision.revisitWhen,
      `${label}: decision ${decision.id} is incomplete`,
    );
    requireValue(
      Array.isArray(decision.relatedWorkItemIds),
      `${label}: decision ${decision.id} has invalid related work items`,
    );
    for (const itemId of decision.relatedWorkItemIds) {
      requireValue(
        workItemIds.has(itemId),
        `${label}: decision ${decision.id} references unknown work item ${itemId}`,
      );
    }
  }
  const checkpointIds = new Set();
  for (const window of plan.deliverySequence.windows) {
    requireValue(
      window.dayRange && window.title && Array.isArray(window.checkpoints),
      `${label}: delivery window ${window.id} is incomplete`,
    );
    for (const checkpoint of window.checkpoints) {
      requireValue(
        checkpoint.id &&
          !checkpointIds.has(checkpoint.id) &&
          checkpoint.day &&
          checkpoint.outcome &&
          Array.isArray(checkpoint.stageIds) &&
          typeof checkpoint.reviewStop === 'boolean',
        `${label}: invalid or duplicate checkpoint in ${window.id}`,
      );
      checkpointIds.add(checkpoint.id);
      for (const stageId of checkpoint.stageIds) {
        requireValue(
          stageIds.has(stageId),
          `${label}: checkpoint ${checkpoint.id} references unknown stage ${stageId}`,
        );
      }
    }
  }
  requireValue(
    plan.interruptionPolicy?.title &&
      plan.interruptionPolicy?.principle &&
      Array.isArray(plan.interruptionPolicy?.rules),
    `${label}: interruption policy is incomplete`,
  );
  for (const rule of plan.interruptionPolicy.rules) {
    requireValue(
      priorityIds.has(rule.priorityId) && rule.action && Array.isArray(rule.examples),
      `${label}: invalid interruption rule for ${rule.priorityId}`,
    );
  }
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

function isTheoryArticle(item) {
  return (
    item?.contentType === 'theory' &&
    (['pattern-lesson/v1', 'foundation-lesson/v1'].includes(item.schemaVersion) ||
      (Array.isArray(item.sections) && item.sections.length > 0))
  );
}

function isInterviewQuestion(item) {
  return !isTheoryArticle(item) && item?.contentType !== 'dsa-pattern';
}

function isPracticeModule(module) {
  return (
    /^practice(?:-|:|\s)/i.test(module?.id ?? '') ||
    /^practice(?:-|:|\s)/i.test(module?.title ?? '')
  );
}

function validateLearningUnits(units, moduleIds, courseLabel) {
  const unitIds = new Set();
  const discoverableModuleIds = new Set();

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
    if (unit.questionModuleId) discoverableModuleIds.add(unit.questionModuleId);
    if (unit.practiceModuleId) discoverableModuleIds.add(unit.practiceModuleId);
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
  return discoverableModuleIds;
}

try {
  await access(contentRoot);
} catch {
  throw new Error(
    `Content root not found at ${contentRoot}. Restore the selected source or use the tracked demo content.`,
  );
}

const contentFiles = await filesWithExtension(contentRoot, '.json');

for (const file of contentFiles) {
  const label = relative(contentRoot, file);
  if (label === 'delivery/delivery-plan.json') {
    validateDeliveryPlan(JSON.parse(await readFile(file, 'utf8')), label);
    deliveryPlanCount += 1;
    continue;
  }
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
  const modulesWithInterviewQuestions = new Set();
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
    if (!isPracticeModule(module) && questions.some(isInterviewQuestion)) {
      modulesWithInterviewQuestions.add(module.id);
    }

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
        question.tags.every((tag) => typeof tag === 'string' && tag.trim()),
        `${moduleLabel}: ${question.id} has an empty or invalid tag`,
      );
      requireValue(
        typeof question.interviewAnswer === 'string' && question.interviewAnswer.trim(),
        `${moduleLabel}: ${question.id} has no interview answer`,
      );
      requireValue(
        Array.isArray(question.explanation) &&
          question.explanation.length > 0 &&
          question.explanation.every(
            (paragraph) => typeof paragraph === 'string' && paragraph.trim(),
          ),
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
      for (const followUp of question.followUps) {
        requireValue(
          typeof followUp?.question === 'string' &&
            followUp.question.trim() &&
            typeof followUp?.answer === 'string' &&
            followUp.answer.trim(),
          `${moduleLabel}: ${question.id} has an incomplete follow-up`,
        );
      }
      requireValue(
        Array.isArray(question.versionNotes) &&
          question.versionNotes.every((note) => typeof note === 'string' && note.trim()),
        `${moduleLabel}: ${question.id} has invalid version notes`,
      );
      if (question.evidence !== undefined) {
        const evidenceFields = [
          question.evidence?.note,
          question.evidence?.carl?.context,
          question.evidence?.carl?.action,
          question.evidence?.carl?.result,
          question.evidence?.carl?.learning,
          question.evidence?.star?.situation,
          question.evidence?.star?.task,
          question.evidence?.star?.action,
          question.evidence?.star?.result,
        ];
        requireValue(
          evidenceFields.every((field) => typeof field === 'string' && field.trim()),
          `${moduleLabel}: ${question.id} has an incomplete CARL/STAR evidence framework`,
        );
        requireValue(
          question.contentType !== 'theory' && question.contentType !== 'dsa-problem',
          `${moduleLabel}: ${question.id} applies experience evidence to an unsuitable content type`,
        );
      }
      if (question.practiceProblem !== undefined) {
        requireValue(
          question.contentType === 'dsa-problem',
          `${moduleLabel}: ${question.id} has practice metadata without dsa-problem contentType`,
        );
        requireValue(
          Array.isArray(question.practiceProblem.sourceSets) &&
            question.practiceProblem.sourceSets.length > 0 &&
            question.practiceProblem.objective &&
            ['guided', 'core', 'stretch'].includes(question.practiceProblem.tier) &&
            ['complete', 'starter'].includes(question.practiceProblem.implementationStatus),
          `${moduleLabel}: ${question.id} has incomplete practice metadata`,
        );
        if (question.practiceProblem.implementationStatus === 'complete') {
          const practice = question.practiceProblem;
          const languages = new Set(
            (question.solutions ?? []).map((solution) => solution.language?.toLowerCase()),
          );
          requireValue(
            Array.isArray(practice.constraints) && practice.constraints.length > 0,
            `${moduleLabel}: practice-ready ${question.id} has no constraints`,
          );
          requireValue(
            Array.isArray(practice.examples) &&
              practice.examples.length > 0 &&
              practice.examples.every((example) => example.input && example.output),
            `${moduleLabel}: practice-ready ${question.id} has incomplete examples`,
          );
          requireValue(
            Array.isArray(practice.testCases) &&
              practice.testCases.length >= 3 &&
              new Set(practice.testCases.map((testCase) => testCase.category)).size >= 3,
            `${moduleLabel}: practice-ready ${question.id} needs representative, boundary, and failure tests`,
          );
          requireValue(
            Array.isArray(practice.hints) && practice.hints.length >= 2,
            `${moduleLabel}: practice-ready ${question.id} needs progressive hints`,
          );
          requireValue(
            practice.externalUrl,
            `${moduleLabel}: practice-ready ${question.id} has no original source link`,
          );
          requireValue(
            question.complexity?.time && question.complexity?.space && question.complexity?.note,
            `${moduleLabel}: practice-ready ${question.id} has incomplete complexity reasoning`,
          );
          requireValue(
            [...patternLanguages].every((language) => languages.has(language)),
            `${moduleLabel}: practice-ready ${question.id} needs Java, Python, and Go solutions`,
          );
        }
      }
      for (const assetPath of collectAssetPaths(question)) {
        const normalizedPath = assetPath.split(/[?#]/, 1)[0];
        referencedAssetPaths.add(normalizedPath);
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
          ['pattern-lesson/v1', 'foundation-lesson/v1'].includes(question.schemaVersion),
          `${moduleLabel}: ${question.id} uses unsupported schemaVersion ${question.schemaVersion}`,
        );
        if (question.schemaVersion === 'pattern-lesson/v1') {
          patternLessons.push({ lesson: question, moduleLabel });
        } else {
          foundationLessons.push({ lesson: question, moduleLabel });
        }
      }
    }
  }
  if (manifest.learningUnits !== undefined) {
    const discoverableModuleIds = validateLearningUnits(manifest.learningUnits, moduleIds, label);
    for (const moduleId of modulesWithInterviewQuestions) {
      requireValue(
        discoverableModuleIds.has(moduleId),
        `${label}: content module ${moduleId} is not reachable from a learning unit`,
      );
    }
  }
}

for (const assetPath of referencedAssetPaths) {
  if (!assetPath.startsWith('/content/')) continue;
  const assetFile = resolve(contentRoot, assetPath.slice('/content/'.length));
  requireValue(
    assetFile.startsWith(`${contentRoot}/`),
    `Asset path escapes the content root: ${assetPath}`,
  );
  try {
    await access(assetFile);
  } catch {
    throw new Error(`Referenced asset does not exist: ${assetPath}`);
  }
}

for (const question of questionsById.values()) {
  if (!question.canonicalProblemRef) continue;
  requireValue(
    question.solutions === undefined &&
      question.complexity === undefined &&
      question.practiceProblem === undefined,
    `${question.id} duplicates material owned by its canonical problem`,
  );
  const reference = question.canonicalProblemRef;
  const lessonEntry = questionsById.get(reference.lessonId);
  requireValue(
    lessonEntry?.schemaVersion === 'pattern-lesson/v1',
    `${question.id} references unknown pattern lesson ${reference.lessonId}`,
  );
  const problem = lessonEntry.essentialProblems?.find(({ id }) => id === reference.problemId);
  requireValue(
    problem?.practice,
    `${question.id} references incomplete problem ${reference.problemId}`,
  );
  requireValue(
    problem.practiceQuestionId === question.id,
    `${question.id} and ${reference.problemId} do not link to each other`,
  );
}

for (const visualFile of await filesWithExtension(contentRoot, '.html')) {
  const label = relative(contentRoot, visualFile);
  const source = await readFile(visualFile, 'utf8');
  requireValue(
    source.includes('algorithmic-visual-height') || source.includes('visual-frame-resize.js'),
    `${label}: interactive visual does not report its content height`,
  );
  requireValue(
    !/(?:min-)?height\s*:\s*100vh/i.test(source),
    `${label}: viewport height can create blank iframe space`,
  );
  if (source.includes('/content/visual-frame-resize.js')) {
    try {
      await access(join(contentRoot, 'visual-frame-resize.js'));
    } catch {
      throw new Error(`${label}: shared visual-frame-resize.js is missing`);
    }
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

for (const { lesson, moduleLabel } of foundationLessons) {
  const label = `${moduleLabel}: ${lesson.id}`;
  requireValue(lesson.contentType === 'theory', `${label} must use contentType theory`);
  requireValue(
    lesson.visuals === undefined && lesson.relatedQuestionIds === undefined,
    `${label} must not mix legacy relation fields with FoundationLessonV1`,
  );
  requireStringArray(lesson.learningOutcomes, `${label} learningOutcomes`, 3);
  requireValue(
    lesson.learningOutcomes.length <= 5,
    `${label} learningOutcomes must contain no more than five items`,
  );
  requireValue(
    lesson.memoryAnchor?.phrase &&
      lesson.memoryAnchor?.mentalModel &&
      lesson.memoryAnchor?.retrievalCue,
    `${label} has an incomplete memory anchor`,
  );
  requireValue(
    lesson.foundationModel?.heading &&
      lesson.foundationModel?.representation &&
      lesson.foundationModel?.invariant &&
      lesson.foundationModel?.operationLens &&
      lesson.foundationModel?.selectionRule,
    `${label} has an incomplete foundation model`,
  );
  requireValue(
    Array.isArray(lesson.sections) && lesson.sections.length >= 3,
    `${label} needs at least three teaching sections`,
  );
  const navigationLabels = new Set();
  let visualCount = 0;
  let interactiveVisualCount = 0;
  for (const section of lesson.sections) {
    requireValue(section.navLabel, `${label} section ${section.id} is missing navLabel`);
    const normalizedLabel = section.navLabel.trim().toLowerCase();
    requireValue(
      !navigationLabels.has(normalizedLabel),
      `${label} repeats section navigation label ${section.navLabel}`,
    );
    navigationLabels.add(normalizedLabel);
    if (section.visual) {
      visualCount += 1;
      if (section.visual.type === 'interactive') interactiveVisualCount += 1;
      requireStringArray(
        section.visualTranscript,
        `${label} section ${section.id} visualTranscript`,
        3,
      );
      const visualPath = section.visual.assetPath.split(/[?#]/, 1)[0].replace(/^\/content\//, '');
      try {
        await access(join(contentRoot, visualPath));
      } catch {
        throw new Error(`${label} references missing visual ${section.visual.assetPath}`);
      }
    }
    if (section.solutions?.length) {
      const languages = new Set(section.solutions.map(({ language }) => language.toLowerCase()));
      requireValue(
        languages.size === patternLanguages.size &&
          [...patternLanguages].every((language) => languages.has(language)),
        `${label} section ${section.id} must include Java, Python, and Go solutions`,
      );
    }
  }
  requireValue(visualCount > 0, `${label} needs at least one concept visual`);
  if (lesson.visualDepth === 'enhanced') {
    requireValue(
      interactiveVisualCount > 0,
      `${label} is an enhanced topic and needs an interactive visual`,
    );
  }
  requireValue(
    Array.isArray(lesson.pitfalls) && lesson.pitfalls.length >= 3,
    `${label} needs at least three failure contrasts`,
  );
  for (const pitfall of lesson.pitfalls) {
    requireValue(
      pitfall?.failedAssumption && pitfall?.symptom && pitfall?.correction,
      `${label} has an invalid pitfall`,
    );
  }
  requireValue(lesson.interviewRecall?.prompt, `${label} has no interview recall prompt`);
  requireStringArray(
    lesson.interviewRecall?.answerFramework,
    `${label} interviewRecall.answerFramework`,
    3,
  );
  requireValue(
    lesson.interviewRecall.answerFramework.length <= 5,
    `${label} interview recall framework must contain no more than five steps`,
  );
  requireValue(
    Array.isArray(lesson.checks) && lesson.checks.length >= 3 && lesson.checks.length <= 5,
    `${label} must reference three to five understanding checks`,
  );
  const seenChecks = new Set();
  for (const check of lesson.checks) {
    requireValue(
      checkCategories.has(check?.category),
      `${label} has invalid check category ${check?.category}`,
    );
    requireValue(!seenChecks.has(check.questionId), `${label} repeats check ${check.questionId}`);
    seenChecks.add(check.questionId);
    const question = questionsById.get(check.questionId);
    requireValue(question, `${label} references missing check ${check.questionId}`);
    requireValue(
      question.relatedArticleId === lesson.id,
      `${label} check ${check.questionId} is not explicitly related to this lesson`,
    );
  }
  if (lesson.practice !== undefined) {
    requireValue(
      Array.isArray(lesson.practice) && lesson.practice.length <= 5,
      `${label} practice must contain no more than five references`,
    );
    const seenPractice = new Set();
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
      requireValue(
        question.relatedArticleId === lesson.id,
        `${label} practice ${reference.questionId} is not explicitly related to this lesson`,
      );
    }
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
  const noteLanguages = new Set(lesson.languageNotes.map(({ language }) => language.toLowerCase()));
  requireValue(
    noteLanguages.size === patternLanguages.size &&
      [...patternLanguages].every((language) => noteLanguages.has(language)),
    `${label} language notes must cover Java, Python, and Go exactly once`,
  );
  requireValue(lesson.reviewEvidence?.note, `${label} is missing review evidence`);
  if (lesson.reviewStatus === 'reviewed') {
    requireValue(
      ['technical', 'editorial', 'ux', 'accessibility'].every(
        (key) => lesson.reviewEvidence[key] === true,
      ),
      `${label} cannot be reviewed without complete review evidence`,
    );
  }
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
    lesson.memoryAnchor?.phrase &&
      lesson.memoryAnchor?.mentalModel &&
      lesson.memoryAnchor?.retrievalCue,
    `${label} has an incomplete memory anchor`,
  );
  requireValue(lesson.interviewRecall?.prompt, `${label} has no interview recall prompt`);
  requireStringArray(
    lesson.interviewRecall?.answerFramework,
    `${label} interviewRecall.answerFramework`,
    3,
  );
  requireValue(
    lesson.interviewRecall.answerFramework.length <= 5,
    `${label} interview recall framework must contain no more than five steps`,
  );
  if (lesson.namedAlgorithms !== undefined) {
    requireValue(
      Array.isArray(lesson.namedAlgorithms) && lesson.namedAlgorithms.length > 0,
      `${label} namedAlgorithms must be a non-empty array when present`,
    );
    const names = new Set();
    for (const algorithm of lesson.namedAlgorithms) {
      requireValue(
        algorithm?.name &&
          algorithm?.family &&
          algorithm?.useWhen &&
          algorithm?.invariant &&
          algorithm?.complexity &&
          algorithm?.memoryAnchor,
        `${label} has an incomplete named algorithm reference`,
      );
      requireValue(
        !names.has(algorithm.name.toLowerCase()),
        `${label} repeats named algorithm ${algorithm.name}`,
      );
      names.add(algorithm.name.toLowerCase());
    }
  }
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
    requireValue(
      problem.fixtureTraces === undefined || Array.isArray(problem.fixtureTraces),
      `${problemLabel} fixtureTraces must be an array`,
    );
    const traces = [
      problem.trace,
      ...(Array.isArray(problem.fixtureTraces) ? problem.fixtureTraces : []),
    ];
    const traceIds = new Set();
    const tracedFixtureIds = new Set();
    for (const trace of traces) {
      requireValue(
        trace?.schemaVersion === 'guided-trace/v1' && trace.id && trace.invariant,
        `${problemLabel} has an invalid GuidedTraceV1`,
      );
      requireValue(!traceIds.has(trace.id), `${problemLabel} repeats trace id ${trace.id}`);
      traceIds.add(trace.id);
      requireValue(
        fixtureIds.has(trace.fixtureId),
        `${problemLabel} trace references unknown fixture ${trace.fixtureId}`,
      );
      requireValue(
        !tracedFixtureIds.has(trace.fixtureId),
        `${problemLabel} has more than one trace for fixture ${trace.fixtureId}`,
      );
      tracedFixtureIds.add(trace.fixtureId);
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
        requireValue(
          event.what && event.why,
          `${problemLabel} event ${event.id} needs what and why`,
        );
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
    if (problem.practice !== undefined) {
      const practice = problem.practice;
      requireValue(problem.practiceQuestionId, `${problemLabel} practice has no standalone route`);
      requireValue(
        new Set(problem.fixtures.map(({ category }) => category)).size === 3 &&
          problem.fixtures.every(({ explanation }) => explanation?.trim()),
        `${problemLabel} practice needs explained representative, boundary, and failure fixtures`,
      );
      requireValue(
        problem.fixtures.every(({ id }) => tracedFixtureIds.has(id)),
        `${problemLabel} practice needs a guided trace for every fixture`,
      );
      requireValue(
        practice.statement?.prompt &&
          Array.isArray(practice.statement.inputs) &&
          practice.statement.inputs.length > 0 &&
          practice.statement.output &&
          Array.isArray(practice.statement.constraints) &&
          practice.statement.constraints.length > 0 &&
          Array.isArray(practice.statement.edgeCases) &&
          practice.statement.edgeCases.length > 0,
        `${problemLabel} has an incomplete independent statement`,
      );
      requireValue(practice.sourceUrl, `${problemLabel} practice has no original source link`);
      requireValue(
        [...patternLanguages].every((language) => practice.starters?.[language]?.trim()),
        `${problemLabel} practice needs Java, Python, and Go starters`,
      );
      requireValue(
        Array.isArray(practice.hints) && practice.hints.length >= 3,
        `${problemLabel} practice needs at least three progressive hints`,
      );
      requireValue(
        Array.isArray(practice.approaches) &&
          practice.approaches.length >= 2 &&
          practice.approaches.every(
            (approach) => approach?.title && approach?.explanation && approach?.complexity,
          ),
        `${problemLabel} practice needs baseline and improved approaches`,
      );
      requireValue(
        Array.isArray(practice.commonMistakes) && practice.commonMistakes.length >= 3,
        `${problemLabel} practice needs common mistakes`,
      );
      requireValue(
        Array.isArray(practice.checks) &&
          new Set(practice.checks.map(({ kind }) => kind)).size === 3 &&
          practice.checks.every((check) => check?.prompt && check?.expected),
        `${problemLabel} practice needs explain, trace, and transfer checks`,
      );
    }
  }
  if (lesson.essentialProblemReviewOrder !== undefined) {
    requireValue(
      Array.isArray(lesson.essentialProblemReviewOrder) &&
        lesson.essentialProblemReviewOrder.length === problemIds.size,
      `${label} review order must list every essential problem exactly once`,
    );
    requireValue(
      new Set(lesson.essentialProblemReviewOrder).size === problemIds.size &&
        lesson.essentialProblemReviewOrder.every((id) => problemIds.has(id)),
      `${label} review order must contain only its essential problem ids`,
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
        !problemIds.has(reference.questionId),
        `${label} practice ${reference.questionId} repeats an essential problem id`,
      );
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
    const expectedRelatedArticleId = reference.sourceLessonId ?? lesson.id;
    if (reference.sourceLessonId !== undefined) {
      requireValue(
        lesson.practiceSetPolicy === 'guided-plus-distinct-transfer',
        `${label} practice ${reference.questionId} cannot declare a source lesson without the transfer policy`,
      );
      requireValue(
        reference.sourceLessonId !== lesson.id && questionsById.has(reference.sourceLessonId),
        `${label} practice ${reference.questionId} has invalid source lesson ${reference.sourceLessonId}`,
      );
    }
    requireValue(
      question.relatedArticleId === expectedRelatedArticleId,
      `${label} practice ${reference.questionId} is not explicitly related to ${expectedRelatedArticleId}`,
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
  `Validated ${courseCount} course manifest(s), ${questionCount} question(s), ${patternLessons.length} versioned pattern lesson(s), ${foundationLessons.length} foundation lesson(s), ${traceProblemCount} trace problem(s), and ${deliveryPlanCount} delivery plan(s).`,
);
