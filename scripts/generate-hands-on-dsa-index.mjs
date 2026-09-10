import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readCanonicalDsaProblems } from './canonical-dsa-contract.mjs';

export const handsOnCoursePaths = [
  'learn/algorithmic-patterns',
  'learn/core-data-structures',
  'learn/sorting-searching',
];

const preparationPlanPath = 'learn/hands-on-dsa-preparation.json';
const rankingPlanPath = 'learn/hands-on-dsa-ranking.json';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readPreparationPlan(contentRoot) {
  try {
    return await readJson(join(contentRoot, preparationPlanPath));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function readRankingPlan(contentRoot) {
  try {
    return await readJson(join(contentRoot, rankingPlanPath));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function rankingTier(interviewRank) {
  if (interviewRank <= 150) return 'universal-must-do';
  if (interviewRank <= 365) return 'interview-core';
  if (interviewRank <= 600) return 'pattern-depth';
  return 'advanced-specialized';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);
}

function fallbackRanking(groups) {
  const rankById = new Map();
  for (const group of groups) {
    for (const problem of group.problems) {
      if (!rankById.has(problem.id)) rankById.set(problem.id, rankById.size + 1);
    }
  }
  return {
    groups: groups.map((group) => ({
      ...group,
      problems: group.problems.map((problem) => {
        const rank = rankById.get(problem.id);
        return {
          ...problem,
          interviewRank: rank,
          studyOrder: rank,
          tier: rankingTier(rank),
          rankingVersion: 'unranked',
        };
      }),
    })),
    ranking: {
      status: 'unranked',
      rankingVersion: 'unranked',
      catalogTarget: rankById.size,
      rankedProblems: rankById.size,
      lastReviewedAt: null,
    },
  };
}

export function applyHandsOnRankingPlan(groups, plan, { required = false } = {}) {
  if (!plan) {
    if (required) throw new Error(`${rankingPlanPath}: ranking manifest is required`);
    return fallbackRanking(groups);
  }
  if (
    plan.schemaVersion !== 'hands-on-dsa-ranking/v1' ||
    !['candidate', 'released'].includes(plan.status) ||
    !Array.isArray(plan.sourceRegistry) ||
    !Array.isArray(plan.problems)
  ) {
    throw new Error(`${rankingPlanPath}: invalid ranking manifest`);
  }
  if (!isNonEmptyString(plan.rankingVersion)) {
    throw new Error(`${rankingPlanPath}: rankingVersion is required`);
  }
  if (!isIsoDate(plan.lastReviewedAt)) {
    throw new Error(`${rankingPlanPath}: lastReviewedAt must use YYYY-MM-DD`);
  }
  if (plan.catalogTarget !== 730) {
    throw new Error(`${rankingPlanPath}: catalogTarget must be 730`);
  }
  if (!isNonEmptyString(plan.methodology)) {
    throw new Error(`${rankingPlanPath}: methodology is required`);
  }

  const sourceById = new Map();
  for (const source of plan.sourceRegistry) {
    if (!isNonEmptyString(source?.id) || sourceById.has(source.id)) {
      throw new Error(`${rankingPlanPath}: source ids must be present and unique`);
    }
    if (
      typeof source.includedInRanking !== 'boolean' ||
      !isNonEmptyString(source.kind) ||
      !isNonEmptyString(source.accessPolicy) ||
      !isNonEmptyString(source.automationPolicy) ||
      !isNonEmptyString(source.agePolicy) ||
      !isNonEmptyString(source.limitations) ||
      !isNonEmptyString(source.contribution) ||
      !isNonEmptyString(source.description)
    ) {
      throw new Error(`${rankingPlanPath}: incomplete source registry entry ${source.id}`);
    }
    sourceById.set(source.id, source);
  }

  const discoveredProblems = new Map();
  for (const group of groups) {
    for (const problem of group.problems) discoveredProblems.set(problem.id, problem);
  }
  if (plan.publishedProblemCount !== discoveredProblems.size) {
    throw new Error(
      `${rankingPlanPath}: publishedProblemCount ${plan.publishedProblemCount} does not match ${discoveredProblems.size}`,
    );
  }
  if (plan.catalogTarget < discoveredProblems.size) {
    throw new Error(
      `${rankingPlanPath}: catalogTarget cannot be below the published problem count`,
    );
  }

  const rankingById = new Map();
  const interviewRanks = new Set();
  const studyOrders = new Set();
  for (const item of plan.problems) {
    if (!discoveredProblems.has(item?.problemId)) {
      throw new Error(`${rankingPlanPath}: unknown problem ${item?.problemId ?? 'missing'}`);
    }
    if (rankingById.has(item.problemId)) {
      throw new Error(`${rankingPlanPath}: duplicate problem ${item.problemId}`);
    }
    if (!Number.isInteger(item.interviewRank) || item.interviewRank < 1) {
      throw new Error(`${rankingPlanPath}: invalid interviewRank for ${item.problemId}`);
    }
    if (!Number.isInteger(item.studyOrder) || item.studyOrder < 1) {
      throw new Error(`${rankingPlanPath}: invalid studyOrder for ${item.problemId}`);
    }
    if (interviewRanks.has(item.interviewRank)) {
      throw new Error(`${rankingPlanPath}: duplicate interviewRank ${item.interviewRank}`);
    }
    if (studyOrders.has(item.studyOrder)) {
      throw new Error(`${rankingPlanPath}: duplicate studyOrder ${item.studyOrder}`);
    }
    if (!['low', 'medium', 'high'].includes(item.evidenceConfidence)) {
      throw new Error(`${rankingPlanPath}: invalid evidenceConfidence for ${item.problemId}`);
    }
    if (
      item.rankingVersion !== plan.rankingVersion ||
      item.lastReviewedAt !== plan.lastReviewedAt
    ) {
      throw new Error(`${rankingPlanPath}: stale ranking metadata for ${item.problemId}`);
    }
    if (
      !Array.isArray(item.rankingReasons) ||
      !item.rankingReasons.length ||
      item.rankingReasons.some((reason) => !isNonEmptyString(reason))
    ) {
      throw new Error(`${rankingPlanPath}: rankingReasons are required for ${item.problemId}`);
    }
    if (!Array.isArray(item.sourceSignals) || !item.sourceSignals.length) {
      throw new Error(`${rankingPlanPath}: sourceSignals are required for ${item.problemId}`);
    }
    for (const signal of item.sourceSignals) {
      const source = sourceById.get(signal?.sourceId);
      if (!source) {
        throw new Error(
          `${rankingPlanPath}: unknown source ${signal?.sourceId ?? 'missing'} for ${item.problemId}`,
        );
      }
      if (!source.includedInRanking) {
        throw new Error(
          `${rankingPlanPath}: excluded source ${source.id} cannot rank ${item.problemId}`,
        );
      }
      if (
        !isNonEmptyString(signal.signalType) ||
        !isIsoDate(signal.observedAt) ||
        !isNonEmptyString(signal.contribution)
      ) {
        throw new Error(`${rankingPlanPath}: invalid source signal for ${item.problemId}`);
      }
    }
    rankingById.set(item.problemId, item);
    interviewRanks.add(item.interviewRank);
    studyOrders.add(item.studyOrder);
  }

  for (const problemId of discoveredProblems.keys()) {
    if (!rankingById.has(problemId)) {
      throw new Error(`${rankingPlanPath}: missing problem ${problemId}`);
    }
  }
  if (rankingById.size !== discoveredProblems.size) {
    throw new Error(`${rankingPlanPath}: expected ${discoveredProblems.size} ranked problems`);
  }
  for (let expected = 1; expected <= discoveredProblems.size; expected += 1) {
    if (!interviewRanks.has(expected)) {
      throw new Error(`${rankingPlanPath}: interviewRank values must be contiguous from 1`);
    }
    if (!studyOrders.has(expected)) {
      throw new Error(`${rankingPlanPath}: studyOrder values must be contiguous from 1`);
    }
  }

  return {
    groups: groups.map((group) => ({
      ...group,
      problems: group.problems.map((problem) => {
        const item = rankingById.get(problem.id);
        return {
          ...problem,
          interviewRank: item.interviewRank,
          studyOrder: item.studyOrder,
          tier: rankingTier(item.interviewRank),
          rankingVersion: plan.rankingVersion,
        };
      }),
    })),
    ranking: {
      status: plan.status,
      rankingVersion: plan.rankingVersion,
      catalogTarget: plan.catalogTarget,
      rankedProblems: rankingById.size,
      lastReviewedAt: plan.lastReviewedAt,
    },
  };
}

export function applyHandsOnPreparationPlan(groups, plan, { required = false } = {}) {
  if (!plan) {
    if (required) throw new Error(`${preparationPlanPath}: preparation sequence is required`);
    return groups.map((group, index) => ({ ...group, preparationOrder: index + 1 }));
  }
  if (plan.schemaVersion !== 'hands-on-dsa-preparation/v1' || !Array.isArray(plan.groups)) {
    throw new Error(`${preparationPlanPath}: invalid preparation sequence`);
  }

  const discoveredIds = new Set(groups.map(({ id }) => id));
  const metadataById = new Map();
  const orders = new Set();
  const displayTitles = new Set();
  for (const item of plan.groups) {
    const displayTitle = item?.displayTitle?.trim();
    if (!discoveredIds.has(item?.groupId)) {
      throw new Error(`${preparationPlanPath}: unknown group ${item?.groupId ?? 'missing'}`);
    }
    if (metadataById.has(item.groupId)) {
      throw new Error(`${preparationPlanPath}: duplicate group ${item.groupId}`);
    }
    if (!Number.isInteger(item.preparationOrder) || item.preparationOrder < 1) {
      throw new Error(`${preparationPlanPath}: invalid order for ${item.groupId}`);
    }
    if (orders.has(item.preparationOrder)) {
      throw new Error(`${preparationPlanPath}: duplicate order ${item.preparationOrder}`);
    }
    if (!displayTitle) {
      throw new Error(`${preparationPlanPath}: missing display title for ${item.groupId}`);
    }
    const normalizedTitle = displayTitle.toLowerCase();
    if (displayTitles.has(normalizedTitle)) {
      throw new Error(`${preparationPlanPath}: duplicate display title ${displayTitle}`);
    }
    metadataById.set(item.groupId, { ...item, displayTitle });
    orders.add(item.preparationOrder);
    displayTitles.add(normalizedTitle);
  }

  for (const group of groups) {
    if (!metadataById.has(group.id)) {
      throw new Error(`${preparationPlanPath}: missing group ${group.id}`);
    }
  }
  if (metadataById.size !== groups.length) {
    throw new Error(`${preparationPlanPath}: expected ${groups.length} groups`);
  }
  const orderedRanks = [...orders].sort((left, right) => left - right);
  if (orderedRanks.some((rank, index) => rank !== index + 1)) {
    throw new Error(`${preparationPlanPath}: orders must be contiguous from 1`);
  }

  return groups
    .map((group) => {
      const metadata = metadataById.get(group.id);
      return {
        ...group,
        title: metadata.displayTitle,
        preparationOrder: metadata.preparationOrder,
      };
    })
    .sort((left, right) => left.preparationOrder - right.preparationOrder);
}

function flattenUnits(units) {
  return (units ?? []).flatMap((unit) => [unit, ...flattenUnits(unit.subUnits)]);
}

function problemSummary(problem, placement) {
  return {
    id: problem.id,
    title: problem.title,
    description: problem.practice.statement.prompt,
    difficulty: problem.difficulty,
    variation: problem.variation,
    invariantAdaptation: problem.invariantAdaptation,
    version: createHash('sha256').update(JSON.stringify(problem)).digest('hex').slice(0, 16),
    questionId: placement.questionId,
    route: [`/${placement.path}`, placement.courseId, placement.questionId],
  };
}

export async function buildHandsOnDsaIndex(
  contentRoot,
  coursePaths = handsOnCoursePaths,
  options = {},
) {
  const canonicalProblems = await readCanonicalDsaProblems(contentRoot);
  const groups = [];

  for (const coursePath of coursePaths) {
    const [pathId, courseId] = coursePath.split('/');
    const courseRoot = join(contentRoot, pathId, courseId);
    try {
      await access(join(courseRoot, 'course.json'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    const course = await readJson(join(courseRoot, 'course.json'));
    const modules = course.modules.filter((module) => module.reviewStatus !== 'planned');
    const questionArrays = await Promise.all(
      modules.map((module) => readJson(join(courseRoot, 'modules', `${module.id}.json`))),
    );
    const questions = questionArrays.flat();
    for (const unit of flattenUnits(course.learningUnits)) {
      if (!unit.practiceModuleId) continue;
      const lesson = questions.find(
        (question) =>
          question.moduleId === unit.theoryModuleId && question.contentType === 'theory',
      );
      if (!lesson) continue;

      const linkedPracticeIds = new Set(
        (lesson.practice ?? []).map((item) => item.questionId).filter(Boolean),
      );
      const practice = questions.filter(
        (question) =>
          ((question.moduleId === unit.practiceModuleId &&
            question.relatedArticleId === lesson.id) ||
            linkedPracticeIds.has(question.id)) &&
          question.canonicalProblemRef?.problemId,
      );
      const practiceByProblem = new Map();
      for (const question of practice) {
        const problemId = question.canonicalProblemRef.problemId;
        if (!canonicalProblems.has(problemId)) {
          throw new Error(`${question.id}: unresolved canonical DSA problem ${problemId}`);
        }
        if (!practiceByProblem.has(problemId)) practiceByProblem.set(problemId, question);
      }

      const orderedProblems = [];
      const seen = new Set();
      for (const reference of lesson.essentialProblemRefs ?? []) {
        const problem = canonicalProblems.get(reference.problemId);
        if (!problem) {
          throw new Error(`${lesson.id}: unresolved canonical DSA problem ${reference.problemId}`);
        }
        const question = practiceByProblem.get(reference.problemId);
        const placement = question
          ? { path: pathId, courseId: course.id, questionId: question.id }
          : (problem.placements.find(
              (candidate) =>
                candidate.role === 'practice' &&
                candidate.questionId &&
                candidate.moduleId === unit.practiceModuleId,
            ) ??
            problem.placements.find(
              (candidate) => candidate.role === 'practice' && candidate.questionId,
            ));
        if (!placement) {
          throw new Error(
            `${lesson.id}: canonical DSA problem ${reference.problemId} has no practice route`,
          );
        }
        orderedProblems.push(problemSummary(problem, placement));
        seen.add(problem.id);
      }
      for (const question of practice.sort((left, right) => left.order - right.order)) {
        const problem = canonicalProblems.get(question.canonicalProblemRef.problemId);
        if (seen.has(problem.id)) continue;
        orderedProblems.push(
          problemSummary(problem, {
            path: pathId,
            courseId: course.id,
            questionId: question.id,
          }),
        );
        seen.add(problem.id);
      }
      if (!orderedProblems.length) continue;

      groups.push({
        id: `${course.id}:${unit.id}`,
        courseId: course.id,
        courseTitle: course.title,
        title: unit.title,
        description: unit.description,
        unitId: unit.id,
        practiceModuleId: unit.practiceModuleId,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        tags: lesson.tags ?? [],
        hasGuidedLesson: lesson.schemaVersion === 'pattern-lesson/v2',
        problems: orderedProblems,
      });
    }
  }

  const orderedGroups = applyHandsOnPreparationPlan(
    groups,
    await readPreparationPlan(contentRoot),
    { required: options.requirePreparationPlan ?? false },
  );
  const rankedCatalog = applyHandsOnRankingPlan(orderedGroups, await readRankingPlan(contentRoot), {
    required: options.requireRankingPlan ?? false,
  });
  const distinctProblems = new Set(
    rankedCatalog.groups.flatMap((group) => group.problems.map(({ id }) => id)),
  );
  return {
    schemaVersion: 'hands-on-dsa-index/v2',
    totals: {
      groups: rankedCatalog.groups.length,
      problemPlacements: rankedCatalog.groups.reduce(
        (sum, group) => sum + group.problems.length,
        0,
      ),
      distinctProblems: distinctProblems.size,
    },
    ranking: rankedCatalog.ranking,
    groups: rankedCatalog.groups,
  };
}

export async function generateHandsOnDsaIndex(contentRoot) {
  const index = await buildHandsOnDsaIndex(contentRoot);
  await writeFile(join(contentRoot, 'hands-on-dsa-index.json'), JSON.stringify(index));
  return index.totals;
}
