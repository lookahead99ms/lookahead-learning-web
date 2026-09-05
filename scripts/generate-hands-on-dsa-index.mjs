import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readCanonicalDsaProblems } from './canonical-dsa-contract.mjs';

export const handsOnCoursePaths = [
  'learn/algorithmic-patterns',
  'learn/core-data-structures',
  'learn/sorting-searching',
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
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

export async function buildHandsOnDsaIndex(contentRoot, coursePaths = handsOnCoursePaths) {
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

  const distinctProblems = new Set(groups.flatMap((group) => group.problems.map(({ id }) => id)));
  return {
    schemaVersion: 'hands-on-dsa-index/v1',
    totals: {
      groups: groups.length,
      problemPlacements: groups.reduce((sum, group) => sum + group.problems.length, 0),
      distinctProblems: distinctProblems.size,
    },
    groups,
  };
}

export async function generateHandsOnDsaIndex(contentRoot) {
  const index = await buildHandsOnDsaIndex(contentRoot);
  await writeFile(join(contentRoot, 'hands-on-dsa-index.json'), JSON.stringify(index));
  return index.totals;
}
