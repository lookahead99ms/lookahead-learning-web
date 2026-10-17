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

const approachId = /^(.+)-approach-([2-9]|[1-9]\d+)$/;

/**
 * DLV-965: a problem family where several approaches share the optimal bounds. Each equally optimal
 * approach is its own canonical problem (`<original>-approach-<N>`) and every member carries
 * `approachFamily` {approach, bestProblemId, siblings[]}. Returns the problems the family breaks.
 */
export function approachFamilyErrors(problem, problems) {
  const errors = [];
  const family = problem.approachFamily;
  const match = approachId.exec(problem.id);
  if (!family) {
    if (match && problems.has(match[1])) errors.push('an Approach-N problem must carry approachFamily');
    return errors;
  }
  if (!Number.isInteger(family.approach) || family.approach < 1 || !Array.isArray(family.siblings) || !family.siblings.length) {
    return ['approachFamily needs an approach number and at least one sibling'];
  }
  const best = problems.get(family.bestProblemId);
  if (!best) return [`approachFamily names an unknown best problem ${family.bestProblemId}`];
  if (best.approachFamily?.approach !== 1) errors.push(`best problem ${family.bestProblemId} must be approach 1`);
  if (family.approach === 1 && problem.id !== family.bestProblemId) errors.push('approach 1 must be the best problem');
  if (family.approach >= 2 && problem.id !== `${family.bestProblemId}-approach-${family.approach}`) {
    errors.push(`id must be ${family.bestProblemId}-approach-${family.approach}`);
  }
  // User decision (2026-10-16): the original carries its number too, "<Title> (Approach-1)".
  const base = String(best.title ?? '').replace(/ \(Approach-\d+\)$/, '');
  if (best.title !== `${base} (Approach-1)`) errors.push(`best problem ${family.bestProblemId} must be titled "${base} (Approach-1)"`);
  if (family.approach >= 2 && problem.title !== `${base} (Approach-${family.approach})`) {
    errors.push(`title must be "${base} (Approach-${family.approach})"`);
  }
  const members = new Map([[problem.id, family.approach]]);
  for (const sibling of family.siblings) {
    const target = problems.get(sibling?.problemId);
    if (!target) {
      errors.push(`sibling ${sibling?.problemId ?? 'missing'} is not a canonical problem`);
      continue;
    }
    members.set(sibling.problemId, sibling.approach);
    const placement = primaryPracticePlacement(target);
    if (sibling.title !== target.title) errors.push(`sibling ${sibling.problemId} title is stale`);
    if (!placement || sibling.path !== placement.path || sibling.courseId !== placement.courseId || sibling.questionId !== placement.questionId) {
      errors.push(`sibling ${sibling.problemId} route is not its practice placement`);
    }
    if (target.approachFamily?.approach !== sibling.approach) errors.push(`sibling ${sibling.problemId} approach number is stale`);
    if (target.approachFamily?.bestProblemId !== family.bestProblemId) errors.push(`sibling ${sibling.problemId} belongs to another family`);
    if (!sibling.pattern?.trim() || !sibling.whenToPrefer?.trim()) errors.push(`sibling ${sibling.problemId} needs pattern and whenToPrefer`);
    if (sibling.complexity?.time !== target.complexity?.time || sibling.complexity?.space !== target.complexity?.space) {
      errors.push(`sibling ${sibling.problemId} complexity copy is stale`);
    }
    const theirs = new Set([sibling.problemId, ...(target.approachFamily?.siblings ?? []).map((item) => item.problemId)]);
    if (theirs.size !== family.siblings.length + 1 || ![problem.id, ...family.siblings.map((item) => item.problemId)].every((id) => theirs.has(id))) {
      errors.push(`sibling ${sibling.problemId} lists a different member set`);
    }
  }
  const numbers = [...members.values()].sort((left, right) => left - right);
  if (numbers.some((number, index) => number !== index + 1)) errors.push(`approach numbers ${numbers.join(', ')} must run 1..${numbers.length}`);
  // The bound a text states: the first O(...) term after the last "=", with ×, · and a lone x as "*"
  // ("O(26n) = O(n)" and "O(n)" are one bound; "O(R × C)" and "O(R x C)" too).
  const bound = (value) => {
    const text = String(value ?? '')
      .replace(/(?<=[\w)])\s*[×·]\s*(?=[\w(])/g, '*')
      .replace(/(?<=[\w)])\s+x\s+(?=[\w(])/g, '*')
      .replace(/\s+/g, '')
      .toLowerCase();
    const tail = text.slice(text.lastIndexOf('=') + 1);
    return /o\((?:[^()]|\([^()]*\))*\)/.exec(tail)?.[0] ?? tail;
  };
  if (bound(problem.complexity?.time) !== bound(best.complexity?.time) || bound(problem.complexity?.space) !== bound(best.complexity?.space)) {
    errors.push('only approaches with the best approach\'s time and space may join a family');
  }
  return errors;
}
