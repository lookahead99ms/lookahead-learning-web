import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function canonicalFixtureCoverageErrors(problem) {
  const fixtures = problem.fixtures;
  if (!Array.isArray(fixtures) || fixtures.length < 3) {
    return ['fixtures must contain at least three entries'];
  }
  const errors = [];
  const requiredCategories = ['representative', 'boundary', 'failure'];
  const categories = new Set(fixtures.map((fixture) => fixture?.category));
  if (
    categories.size !== requiredCategories.length ||
    !requiredCategories.every((category) => categories.has(category))
  ) {
    errors.push('fixtures must use all and only representative, boundary, and failure categories');
  }
  const fixtureIds = fixtures.map((fixture) => fixture?.id);
  if (
    fixtureIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(fixtureIds).size !== fixtureIds.length
  ) {
    errors.push('fixture ids must be nonempty and unique');
  }
  const traces = [problem.trace, ...(problem.fixtureTraces ?? [])].filter(Boolean);
  if (
    traces.length !== fixtures.length ||
    fixtureIds.some(
      (fixtureId) => traces.filter((trace) => trace.fixtureId === fixtureId).length !== 1,
    )
  ) {
    errors.push(
      'each fixture needs exactly one guided trace, including additional boundary fixtures',
    );
  }
  return errors;
}

export async function readCanonicalDsaProblems(contentRoot) {
  const directory = resolve(contentRoot, 'learn/dsa-problems');
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    throw error;
  }

  const problems = new Map();
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    const file = resolve(directory, name);
    const problem = JSON.parse(await readFile(file, 'utf8'));
    const fileId = basename(name, '.json');
    if (problem.schemaVersion !== 'dsa-problem/v2') {
      throw new Error(`${file}: expected schemaVersion dsa-problem/v2`);
    }
    if (!kebabCase.test(problem.id ?? '')) {
      throw new Error(`${file}: canonical DSA id must be kebab-case`);
    }
    if (problem.id !== fileId) {
      throw new Error(`${file}: filename must match canonical DSA id ${problem.id}`);
    }
    if (problems.has(problem.id)) {
      throw new Error(`${file}: duplicate canonical DSA id ${problem.id}`);
    }
    problems.set(problem.id, problem);
  }
  return problems;
}

export function primaryPracticePlacement(problem) {
  return problem.placements?.find(
    (placement) => placement.role === 'practice' && placement.questionId,
  );
}

export function materializeCanonicalProblem(problem) {
  const placement = primaryPracticePlacement(problem);
  return placement?.questionId ? { ...problem, practiceQuestionId: placement.questionId } : problem;
}

export function materializeCanonicalReferences(item, problems, label = item.id ?? 'content item') {
  const resolveProblem = (problemId) => {
    const problem = problems.get(problemId);
    if (!problem) throw new Error(`${label}: unresolved canonical DSA problem ${problemId}`);
    return materializeCanonicalProblem(problem);
  };

  const canonicalProblem = item.canonicalProblemRef
    ? resolveProblem(item.canonicalProblemRef.problemId)
    : undefined;
  if (item.schemaVersion === 'pattern-lesson/v2') {
    return {
      ...item,
      essentialProblems: item.essentialProblemRefs.map(({ problemId }) =>
        resolveProblem(problemId),
      ),
      ...(canonicalProblem ? { canonicalProblem } : {}),
    };
  }
  return canonicalProblem ? { ...item, canonicalProblem } : item;
}
