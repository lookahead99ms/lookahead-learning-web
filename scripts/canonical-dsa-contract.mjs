import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
