import { PatternProblemV1 } from '../../content/content.models';
import { DsaStoryV1, StoryValue } from './dsa-story.model';

/** A trimmed Two Sum story and problem (the real pilot lives in the content repository). */
export function twoSumStory(): DsaStoryV1 {
  const values = [2, 7, 11, 15];
  const base = { values, target: 9 };
  const seen = (...pairs: [number, number][]): StoryValue => ({ $map: pairs });
  return {
    schemaVersion: 'dsa-story/v1',
    problemId: 'algorithmic-two-sum',
    fixtureId: 'standard',
    approach: { variant: 'One pass with a hash map.', why: 'Unsorted input; O(1) lookups.' },
    ideas: ['seen starts empty.', 'need = target − value.', 'Return when need is in seen.'],
    views: [
      { id: 'values', kind: 'array', title: 'values', var: 'values', pointers: [{ var: 'index' }] },
      { id: 'seen', kind: 'map', title: 'seen', var: 'seen', keyLabel: 'value', valueLabel: 'index' },
    ],
    variables: ['values', 'target', 'seen', 'index', 'value', 'need'],
    ms: 1000,
    steps: [
      { lines: ['py-2'], say: 'seen starts empty.', idea: 0, state: { ...base, seen: seen() } },
      {
        lines: ['py-3', 'py-4', 'py-5'],
        say: 'value = {value}, need = {need}.',
        idea: 1,
        marks: { values: { active: ['@index'] } },
        state: { ...base, seen: seen(), index: 0, value: 2, need: 7 },
      },
      {
        lines: ['py-6'],
        say: 'Is {need} in seen? No.',
        idea: 2,
        marks: { values: { active: ['@index'] }, seen: { miss: ['@need'] } },
        state: { ...base, seen: seen(), index: 0, value: 2, need: 7 },
      },
      {
        lines: ['py-8'],
        say: 'Store seen[{value}] = {index}.',
        idea: 0,
        marks: { seen: { new: ['@value'] } },
        state: { ...base, seen: seen([2, 0]), index: 0, value: 2, need: 7 },
      },
      {
        lines: ['py-3', 'py-4', 'py-5', 'py-6'],
        say: 'index {index}: need {need} is in seen.',
        idea: 2,
        marks: { values: { done: ['..@index-1'], active: ['@index'] }, seen: { found: ['@need'] } },
        state: { ...base, seen: seen([2, 0]), index: 1, value: 7, need: 2 },
      },
      {
        lines: ['py-7'],
        say: 'return {returns}.',
        idea: 2,
        marks: { values: { found: [0, '@index'] } },
        state: { ...base, seen: seen([2, 0]), index: 1, value: 7, need: 2 },
        returns: [0, 1],
        result: [0, 1],
      },
    ],
  };
}

export function twoSumProblem(): PatternProblemV1 {
  const python = ['py-1', 'py-2', 'py-3', 'py-4', 'py-5', 'py-6', 'py-7', 'py-8'];
  const java = ['j-1', 'j-2', 'j-3', 'j-4', 'j-5', 'j-6', 'j-7', 'j-9'];
  const path = ['py-2', 'py-3', 'py-4', 'py-5', 'py-6', 'py-8', 'py-3', 'py-4', 'py-5', 'py-6', 'py-7'];
  // Java names two native lines for event 4 (the check and the store), like the real record.
  const javaPath: [string, number][] = [
    ['j-2', 0], ['j-3', 1], ['j-4', 2], ['j-5', 3], ['j-6', 4], ['j-9', 4],
    ['j-3', 6], ['j-4', 7], ['j-5', 8], ['j-6', 9], ['j-7', 10],
  ];
  return {
    id: 'algorithmic-two-sum',
    title: 'Two Sum',
    description: '',
    difficulty: 'Beginner',
    variation: '',
    invariantAdaptation: '',
    complexity: { time: 'O(n)', space: 'O(n)', why: '' },
    fixtures: [{ id: 'standard', label: 'Standard', input: 'values = [2,7,11,15], target = 26', expectedOutput: '[2,3]' }],
    implementations: [
      { language: 'python', title: 'Python', lines: python.map((id) => ({ id, text: `# ${id}` })) },
      { language: 'java', title: 'Java', lines: java.map((id) => ({ id, text: `// ${id}` })) },
      { language: 'go', title: 'Go', lines: java.map((id) => ({ id: id.replace('j', 'g'), text: `// ${id}` })) },
    ],
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: 'trace',
      fixtureId: 'standard',
      invariant: '',
      legend: [],
      events: path.map((anchor, index) => ({
        id: `e${index}`,
        label: anchor,
        phase: 'Run',
        timing: 'after',
        sourceAnchor: { python: anchor, java: 'j-1', go: 'g-1' },
        what: '',
        why: '',
        variables: [],
        rows: [],
      })),
      languagePaths: {
        python: path.map((sourceAnchor, eventIndex) => ({ sourceAnchor, eventIndex })),
        java: javaPath.map(([sourceAnchor, eventIndex]) => ({ sourceAnchor, eventIndex })),
        go: javaPath.map(([sourceAnchor, eventIndex]) => ({ sourceAnchor: sourceAnchor.replace('j', 'g'), eventIndex })),
      },
    },
  } as unknown as PatternProblemV1;
}
