import { PatternLanguage, PatternProblemV1 } from '../../content/content.models';

/**
 * Option B problem stories (`dsa-story/v1`): one hand-made animation per Hands-On DSA problem.
 * Authored in lookahead-learning-content/runtime/learn/dsa-stories/<problemId>.json and checked
 * against the real Python run by `python3 tools/validate_option_b_stories.py` (see
 * tools/curriculum/option-b/AUTHORING.md there). Every step names the executed source lines it
 * covers and carries the real program state after its last line, so this file only formats and
 * lays out data; it never simulates the algorithm.
 */
export type StoryValue =
  | null
  | boolean
  | number
  | string
  | StoryValue[]
  | { $map: [StoryValue, StoryValue][] }
  | { $set: StoryValue[] }
  | { $tuple: StoryValue[] }
  | { $deque: StoryValue[] }
  | { $ref: string }
  | { $num: string }
  | { $repr: string }
  /** A long list (a frequency table over a value domain): every cell is `fill` except `items`. */
  | { $sparse: { length: number; fill: StoryValue; items: [number, StoryValue][] } };

export type StoryTone = 'active' | 'compare' | 'found' | 'done' | 'dim' | 'new' | 'miss';
export const STORY_TONES: readonly StoryTone[] = ['active', 'compare', 'found', 'done', 'dim', 'new', 'miss'];
export type StoryViewKind =
  | 'array'
  | 'string'
  | 'map'
  | 'set'
  | 'stack'
  | 'queue'
  | 'grid'
  | 'linked-list'
  | 'tree'
  | 'trie'
  | 'graph'
  | 'number-line'
  | 'bits'
  | 'calls';
const VIEW_KINDS = new Set<StoryViewKind>([
  'array',
  'string',
  'map',
  'set',
  'stack',
  'queue',
  'grid',
  'linked-list',
  'tree',
  'trie',
  'graph',
  'number-line',
  'bits',
  'calls',
]);

export interface StoryView {
  id: string;
  kind: StoryViewKind;
  title: string;
  /** The local this view draws. Not used by `calls`. */
  var?: string;
  /** Locals drawn as labelled pointers: indices for arrays, node references for lists and trees. */
  pointers?: { var: string; label?: string }[];
  keyLabel?: string;
  valueLabel?: string;
  /** Grid only: [rowVar, columnVar] drawn as a cursor. */
  cursor?: [string, string];
  /** Graph only: node key -> [x, y] in a 0..100 box. Otherwise nodes sit on a circle. */
  layout?: Record<string, [number, number]>;
  directed?: boolean;
  /**
   * Graph only: read `var` as a grid (rows of strings or lists) instead of an adjacency
   * structure. Cells whose value is listed become nodes keyed "row,col", drawn in grid
   * position and joined to their up/down/left/right neighbours that are nodes too.
   */
  gridNodes?: StoryValue[];
  /**
   * Tree only (recursive code): once a call has finished, label the node its `var` local held
   * with the value that call returned, e.g. `{ var: 'root', label: 'depth' }` -> "depth 2".
   */
  returned?: { var: string; label?: string };
  /** Calls only: which locals label each frame (default: the first two). */
  show?: string[];
  /** Which frame the var is read from. Trees, lists and graphs default to the outermost call. */
  frame?: 'current' | 'bottom';
  /**
   * Linked list only (design problems such as an LRU recency list): lay the nodes out in each
   * step's real order from `var` instead of one fixed slot per node, so a node that moves is
   * drawn where it now is. Nodes off that chain (just created, just unlinked, evicted) sit in a
   * second row. Pointers read the current frame, then the calls below it.
   */
  follow?: boolean;
  /** Array, stack or queue: cell width in px, for wider items such as operation names ("put"). */
  cell?: number;
  /** Linked list with `follow`: the back-link field drawn as a second arrow (e.g. "prev"). */
  prevField?: string;
  /** Linked list with `follow`: node fields shown in the circle, joined by ":" (default val or key). */
  fields?: string[];
  /** Linked list with `follow`: locals holding dummy nodes, drawn as boxes named after the local. */
  sentinels?: string[];
  /**
   * Any view with a `var`: draw this field of the object the var holds (`self.heap`,
   * `dictionary.root`). The var is read from the current call, else the nearest caller.
   */
  field?: string;
  /** Linked list or object graph whose var is a map: start from each entry's key or value. */
  roots?: 'keys' | 'values';
  /** Linked list: extra pointer fields drawn as dashed arrows (e.g. `random`). */
  extra?: string[];
  /** Graph over objects: the field holding each node's neighbour list (e.g. `neighbors`). */
  neighbors?: string;
  /**
   * Array whose value is a very long list (stored sparsely): draw only the cells in use
   * (values other than the common fill, pointer and marked cells); the rest show as "…" gaps.
   */
  window?: boolean;
  /** Map: show each value object as the chain of nodes between two of its fields. */
  chain?: { from: string; to?: string; next?: string; fields?: string[] };
  /** Map: show each value object by these fields ("value 1, frequency 2"). */
  valueFields?: string[];
  /** Trie: the field holding a node's children map (default `children`). */
  children?: string;
  /** Trie: the boolean field marking the end of a word (default `terminal`). */
  end?: string;
  /** Number line: first and last number drawn, an integer or "@local". */
  min?: number | string;
  max?: number | string;
  /** Bits: how many binary digits to draw (bit 0, the lowest, is on the right). */
  width?: number;
}

export interface StoryHeapObject {
  $type: string;
  [field: string]: StoryValue;
}
export interface StoryFrame {
  fn: string;
  state: Record<string, StoryValue>;
}
export interface StoryStep {
  lines: string[];
  say: string;
  idea: number;
  marks?: Record<string, Partial<Record<StoryTone, (string | number)[]>>>;
  state: Record<string, StoryValue>;
  fn?: string;
  calls?: StoryFrame[];
  heap?: Record<string, StoryHeapObject>;
  returns?: StoryValue;
  result?: StoryValue;
  /**
   * Midline stories only: the step's line calls down before it ends (a one-line statement such
   * as `top = stack.pop(); insert_bottom(value); stack.append(top)`), and this is its frame's
   * state and the heap at the moment of that call. The page draws it instead of `state`.
   */
  paused?: { state: Record<string, StoryValue>; heap?: Record<string, StoryHeapObject> };
}
export interface DsaStoryV1 {
  schemaVersion: 'dsa-story/v1';
  problemId: string;
  fixtureId: string;
  approach: { variant: string; why: string };
  ideas: string[];
  views: StoryView[];
  variables: string[];
  names?: Partial<Record<PatternLanguage, Record<string, string>>>;
  ms?: number;
  /** Steps whose line calls down carry `paused`, the state at that moment (see StoryStep). */
  midline?: boolean;
  steps: StoryStep[];
}

/** The step as the page draws it: a paused line shows the moment it called down. */
export function shownStep(step: StoryStep): StoryStep {
  return step.paused ? { ...step, state: step.paused.state, heap: step.paused.heap ?? {} } : step;
}

/** Structural guard for fetched JSON; anything unexpected falls back to the shared debugger. */
export function isDsaStory(value: unknown, problemId?: string): value is DsaStoryV1 {
  const story = value as DsaStoryV1 | null;
  return !!(
    story &&
    story.schemaVersion === 'dsa-story/v1' &&
    typeof story.problemId === 'string' &&
    (!problemId || story.problemId === problemId) &&
    typeof story.fixtureId === 'string' &&
    typeof story.approach?.variant === 'string' &&
    typeof story.approach?.why === 'string' &&
    Array.isArray(story.ideas) &&
    Array.isArray(story.variables) &&
    Array.isArray(story.views) &&
    story.views.length > 0 &&
    story.views.every((view) => view && VIEW_KINDS.has(view.kind) && typeof view.id === 'string') &&
    Array.isArray(story.steps) &&
    story.steps.length > 0 &&
    story.steps.every(
      (step) =>
        step &&
        Array.isArray(step.lines) &&
        step.lines.length > 0 &&
        typeof step.say === 'string' &&
        typeof step.state === 'object' &&
        step.state !== null,
    )
  );
}

// ------------------------------------------------------------------ values
type Tagged = Record<string, unknown>;
const tagged = (value: StoryValue, tag: string): value is StoryValue & Tagged =>
  !!value && typeof value === 'object' && !Array.isArray(value) && tag in value;

export function isRef(value: StoryValue | undefined): value is { $ref: string } {
  return value !== undefined && tagged(value, '$ref');
}
export function sequenceOf(value: StoryValue | undefined): StoryValue[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if ('$deque' in value) return value.$deque;
    if ('$tuple' in value) return value.$tuple;
  }
  return null;
}
export function entriesOf(value: StoryValue | undefined): [StoryValue, StoryValue | undefined][] | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ('$map' in value) return value.$map;
    if ('$set' in value) return value.$set.map((key) => [key, undefined]);
  }
  return null;
}

const LITERALS: Record<PatternLanguage, { none: string; yes: string; no: string }> = {
  python: { none: 'None', yes: 'True', no: 'False' },
  java: { none: 'null', yes: 'true', no: 'false' },
  go: { none: 'nil', yes: 'true', no: 'false' },
};
const MAX_TEXT = 160;

/** Readable value text; null/None/nil and booleans follow the selected language. */
export function formatValue(
  value: StoryValue | undefined,
  language: PatternLanguage,
  heap: Record<string, StoryHeapObject> = {},
  limit = MAX_TEXT,
  aliases?: ReadonlyMap<string, string>,
): string {
  const text = format(value, language, heap, 0, aliases);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
function format(
  value: StoryValue | undefined,
  language: PatternLanguage,
  heap: Record<string, StoryHeapObject>,
  depth: number,
  aliases?: ReadonlyMap<string, string>,
): string {
  const words = LITERALS[language];
  if (value === undefined) return '—';
  if (value === null) return words.none;
  if (typeof value === 'boolean') return value ? words.yes : words.no;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  const inner = (item: StoryValue) => (depth > 3 ? '…' : format(item, language, heap, depth + 1, aliases));
  if (Array.isArray(value)) return `[${value.map(inner).join(', ')}]`;
  if ('$tuple' in value) return `(${value.$tuple.map(inner).join(', ')})`;
  if ('$deque' in value) return `[${value.$deque.map(inner).join(', ')}]`;
  if ('$set' in value) return value.$set.length ? `{${value.$set.map(inner).join(', ')}}` : 'empty set';
  if ('$map' in value)
    return `{${value.$map.map(([key, item]) => `${inner(key)}: ${inner(item)}`).join(', ')}}`;
  if ('$num' in value) return value.$num === 'inf' ? '∞' : value.$num === '-inf' ? '−∞' : 'NaN';
  if ('$ref' in value) return aliases?.get(value.$ref) ?? nodeLabel(value.$ref, heap);
  if ('$repr' in value) return value.$repr;
  if ('$sparse' in value) return `[${value.$sparse.length} cells]`;
  return '?';
}
/**
 * "TreeNode(3)" for nodes with a value, otherwise the class name. Linked-list and graph nodes (a
 * `val` and a `next` or `neighbors`, no `left`/`right`) print as "node 3": the oracle's class is
 * ListNode or GraphNode while the reference declares `class Node`, so a class name would not
 * match every tab.
 */
export function nodeLabel(ref: string, heap: Record<string, StoryHeapObject>): string {
  const node = heap[ref];
  if (!node) return ref;
  const fields = Object.keys(node).filter((field) => field !== '$type');
  // A one-field object (a heap entry `Entry(word)`) prints by that field: Entry("love").
  const only = fields.length === 1 ? node[fields[0]] : undefined;
  const value = node['val'] ?? node['key'] ?? (typeof only === 'string' || typeof only === 'number' ? only : undefined);
  if (value === undefined || typeof value === 'object') return node.$type;
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  // List and graph nodes (a `val` and `next` or `neighbors`) print as "node 3" in every tab.
  const listNode = 'val' in node && ('next' in node || 'neighbors' in node) && !('left' in node) && !('right' in node);
  return listNode ? `node ${text}` : `${node.$type}(${text})`;
}

// ------------------------------------------------------------------ selectors
// Same grammar as tools/validate_option_b_stories.py in the content repository.
// The offset may be a local too ("@i-@coin"), so a DP read such as dp[i - coin] follows the code.
const TERM = /^\s*(@[A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*(?:([+-])\s*(\d+|@[A-Za-z_][A-Za-z0-9_]*))?\s*$/;
type Key = StoryValue;
function term(text: string, state: Record<string, StoryValue>): Key | undefined {
  const match = TERM.exec(text);
  if (!match) return undefined;
  const [, head, sign, amount] = match;
  const operand = (token: string): Key | undefined =>
    token.startsWith('@') ? state[token.slice(1)] : Number(token);
  let value = operand(head);
  if (sign) {
    const offset = operand(amount);
    if (typeof value !== 'number' || typeof offset !== 'number') return undefined;
    value = sign === '+' ? value + offset : value - offset;
  }
  return value;
}
/** Expand one mark selector into concrete keys; unresolvable selectors expand to nothing. */
export function resolveSelector(
  selector: string | number,
  state: Record<string, StoryValue>,
  length?: number,
): Key[] {
  if (typeof selector === 'number') return [selector];
  const text = selector.trim();
  if (text.includes('..') && !/^['"]/.test(text)) {
    const [startText, endText] = text.split('..', 2);
    const start = startText.trim() ? term(startText, state) : 0;
    const end = endText.trim() ? term(endText, state) : length === undefined ? undefined : length - 1;
    if (typeof start !== 'number' || typeof end !== 'number') return [];
    const keys: number[] = [];
    for (let index = start; index <= end; index += 1) keys.push(index);
    return keys;
  }
  if (text.includes(',') && !/^["[{]/.test(text)) {
    const parts = text.split(',').map((part) => term(part, state));
    return parts.every((part) => part !== undefined) ? [parts.map(String).join(',')] : [];
  }
  if (text.startsWith('@')) {
    const value = term(text, state);
    return value === undefined ? [] : [value];
  }
  if (/^-?\d+$/.test(text)) return [Number(text)];
  try {
    return [JSON.parse(text) as Key];
  } catch {
    return [text];
  }
}
/** Comparable identity for indices, map keys, grid cells and node references. */
export function keyId(key: StoryValue | undefined): string {
  return JSON.stringify(isRef(key) ? key.$ref : (key ?? null));
}

/** keyId -> tones for one view at one step. */
export function viewTones(
  step: StoryStep,
  viewId: string,
  length?: number,
): Map<string, StoryTone[]> {
  const tones = new Map<string, StoryTone[]>();
  for (const [tone, selectors] of Object.entries(step.marks?.[viewId] ?? {})) {
    for (const selector of selectors ?? []) {
      for (const key of resolveSelector(selector, step.state, length)) {
        const id = keyId(key);
        tones.set(id, [...(tones.get(id) ?? []), tone as StoryTone]);
      }
    }
  }
  return tones;
}

// ------------------------------------------------------------------ captions and variables
/** Fill {name} placeholders from the step's state (and {returns} / {result}). */
export function fillSay(raw: StoryStep, language: PatternLanguage): string {
  const step = shownStep(raw);
  return step.say.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
    const value =
      name in step.state
        ? step.state[name]
        : name === 'returns' && 'returns' in step
          ? step.returns
          : name === 'result' && 'result' in step
            ? step.result
            : undefined;
    return value === undefined ? whole : formatValue(value, language, step.heap);
  });
}

export function displayName(story: DsaStoryV1, name: string, language: PatternLanguage): string {
  return story.names?.[language]?.[name] ?? name;
}

/**
 * Dummy nodes a `linked-list` view lists in `sentinels` print by that name (`head`, `tail`) in
 * the Variables panel and call-stack labels, not as `Entry(0)`: two dummies would read alike and
 * look like a cached key 0.
 */
export function sentinelNames(story: DsaStoryV1, step: StoryStep, language: PatternLanguage): Map<string, string> {
  const names = new Map<string, string>();
  for (const view of story.views) {
    if (view.kind !== 'linked-list') continue;
    for (const name of view.sentinels ?? []) {
      const value = liveLocal(step, name);
      if (isRef(value) && !names.has(value.$ref)) names.set(value.$ref, displayName(story, name, language));
    }
  }
  return names;
}

export interface StoryVariableRow {
  name: string;
  value: string;
  changed: boolean;
  unset: boolean;
  kind?: 'returns' | 'result';
  /** Set when the value belongs to a caller of another function (a helper is running). */
  frame?: string;
}
/**
 * The frame a Variables row reads: the current call, or, for a local the current call does not
 * have, the nearest caller of a different function (the method or driver that called a helper).
 * A recursive call never borrows its own caller's locals.
 */
function rowFrame(step: StoryStep, name: string): StoryFrame | null {
  if (name in step.state) return { fn: step.fn ?? '', state: step.state };
  for (const frame of [...(step.calls ?? [])].reverse())
    if (frame.fn !== step.fn && name in frame.state) return frame;
  return null;
}
/** Every local of the reference code, then what the call returns and the final result. */
export function variableRows(
  story: DsaStoryV1,
  index: number,
  language: PatternLanguage,
): StoryVariableRow[] {
  // A line that calls down shows its frame's locals from before it ran (see callTimeline).
  const moments = story.steps.some((item) => item.calls?.length) ? callTimeline(story) : null;
  const shown = (at: number): StoryStep => {
    if (story.steps[at].paused) return shownStep(story.steps[at]);
    const before = moments?.[at]?.before;
    return before ? { ...story.steps[at], state: before } : story.steps[at];
  };
  const step = shown(index);
  const previous = index > 0 ? shown(index - 1) : null;
  const text = (current: StoryStep, name: string) => {
    const frame = rowFrame(current, name);
    return frame
      ? formatValue(frame.state[name], language, current.heap, undefined, sentinelNames(story, current, language))
      : null;
  };
  const rows: StoryVariableRow[] = story.variables.map((name) => {
    const value = text(step, name);
    const owner = name in step.state ? null : rowFrame(step, name);
    return {
      name: displayName(story, name, language),
      value: value ?? 'not set yet',
      unset: value === null,
      changed: !!previous && value !== null && value !== text(previous, name),
      ...(owner ? { frame: owner.fn } : {}),
    };
  });
  const last = index === story.steps.length - 1;
  if (story.views.some((view) => view.kind === 'calls')) {
    // A line that calls down (recursion) has not returned yet: its value arrives later.
    const returns = 'returns' in step && !callTimeline(story)[index].inProgress;
    rows.push({
      name: 'this call returns',
      value: returns
        ? formatValue(step.returns, language, step.heap, undefined, sentinelNames(story, step, language))
        : '—',
      unset: !returns,
      changed: returns,
      kind: 'returns',
    });
  }
  rows.push({
    name: 'result',
    value: last ? formatValue(step.result, language, step.heap) : 'not returned yet',
    unset: !last,
    changed: last,
    kind: 'result',
  });
  return rows;
}

// ------------------------------------------------------------------ source lines across languages
interface PathEntry {
  sourceAnchor: string;
  eventIndex: number;
}
/** Index ranges [start, end] of the executed Python path covered by each story step. */
export function stepRanges(story: DsaStoryV1): [number, number][] {
  let cursor = 0;
  return story.steps.map((step) => {
    const range: [number, number] = [cursor, cursor + step.lines.length - 1];
    cursor += step.lines.length;
    return range;
  });
}

/**
 * Lines of the selected language that ran during each step. Python uses the step's own lines.
 * Java and Go use the problem's published native path (each native line names the canonical
 * event it belongs to); a native line that shares its event with the line before it moves to
 * the next unclaimed Python position, so one extra native line never swallows a later step.
 */
export function languageLines(
  problem: Pick<PatternProblemV1, 'trace' | 'fixtureTraces'>,
  story: DsaStoryV1,
  language: PatternLanguage,
): { current: string | null; ran: string[] }[] {
  if (language === 'python')
    return story.steps.map((step) => ({ current: step.lines.at(-1) ?? null, ran: step.lines }));
  const trace = [problem.trace, ...(problem.fixtureTraces ?? [])].find(
    (item) => item?.fixtureId === story.fixtureId,
  );
  const python: PathEntry[] =
    trace?.languagePaths?.python ??
    (trace?.events ?? []).map((event, eventIndex) => ({
      sourceAnchor: event.sourceAnchor.python,
      eventIndex,
    }));
  const native: PathEntry[] =
    trace?.languagePaths?.[language] ??
    (trace?.events ?? []).map((event, eventIndex) => ({
      sourceAnchor: event.sourceAnchor[language],
      eventIndex,
    }));
  const byCall = callAlignedLines(problem as Partial<PatternProblemV1>, story, language, python, native);
  if (byCall) return byCall;
  const positionOfEvent = new Map<number, number>();
  python.forEach((entry, position) => {
    if (!positionOfEvent.has(entry.eventIndex)) positionOfEvent.set(entry.eventIndex, position);
  });
  const slots = native.map((entry) => positionOfEvent.get(entry.eventIndex) ?? -1);
  for (let index = 1; index < slots.length; index += 1) {
    if (slots[index] < 0 || slots[index] > slots[index - 1]) continue;
    const nextDistinct = slots.slice(index + 1).find((slot) => slot > slots[index]) ?? python.length;
    const candidate = slots[index - 1] + 1;
    if (candidate < nextDistinct && candidate < python.length) slots[index] = candidate;
  }
  let carried: string | null = null;
  return stepRanges(story).map(([start, end]) => {
    const ran = native
      .filter((_, index) => slots[index] >= start && slots[index] <= end)
      .map((entry) => entry.sourceAnchor);
    if (ran.length) carried = ran.at(-1)!;
    return { current: carried, ran };
  });
}

/** True when the line declares the function `name` (Python def, Java method, Go func or closure). */
function declares(text: string, name: string, language: PatternLanguage): boolean {
  const n = name.replace(/[^A-Za-z0-9_]/g, '');
  const pattern =
    language === 'python'
      ? `^\\s*def\\s+${n}\\s*\\(`
      : language === 'java'
        ? `^\\s*[\\w<>\\[\\],.? ]+\\s+${n}\\s*\\([^;]*\\)\\s*(?:throws\\s+[\\w.,\\s]+)?\\{\\s*$`
        : `^\\s*(?:func\\s+(?:\\([^)]*\\)\\s*)?${n}\\s*\\(|${n}\\s*:?=\\s*func\\s*\\()`;
  return new RegExp(pattern).test(text);
}
/**
 * Recursive code: the k-th call is the same call in every language, so both paths are split into
 * calls at the first body line of each recursive function and paired line by line inside a call.
 * Lines one language runs on top (Go's `if left > right` once the children return, Java's caller
 * line resuming) stay with that call's last line as `ran`, never as `current`. Returns null (use
 * the event alignment) unless every language makes the same number of calls.
 */
function callAlignedLines(
  problem: Partial<Pick<PatternProblemV1, 'implementations'>>,
  story: DsaStoryV1,
  language: PatternLanguage,
  python: PathEntry[],
  native: PathEntry[],
): { current: string | null; ran: string[] }[] | null {
  const names = new Set<string>();
  for (const step of story.steps) {
    const frames = [...(step.calls ?? []), { fn: step.fn ?? '', state: {} }];
    frames.slice(1).forEach((frame) => frame.fn && names.add(frame.fn));
  }
  if (!names.size || !problem.implementations) return null;
  const starts = (target: PatternLanguage): Set<string> => {
    const lines = problem.implementations?.find((item) => item.language === target)?.lines ?? [];
    const ids = new Set<string>();
    lines.forEach((line, index) => {
      if (![...names].some((name) => declares(line.text, functionName(name, target), target))) return;
      const body = lines.slice(index + 1).find((next) => /\S/.test(next.text) && !/^\s*(\/\/|#|\{\s*$)/.test(next.text));
      if (body) ids.add(body.id);
    });
    return ids;
  };
  const cuts = (path: PathEntry[], ids: Set<string>) =>
    path.flatMap((entry, index) => (ids.has(entry.sourceAnchor) ? [index] : []));
  const pythonCuts = cuts(python, starts('python'));
  const nativeCuts = cuts(native, starts(language));
  if (pythonCuts.length < 2 || pythonCuts.length !== nativeCuts.length) return null;
  // Segment k runs from cut k-1 (or the path start) to cut k; the last runs to the end.
  const bounds = (path: PathEntry[], at: number[]) =>
    [0, ...at, path.length].slice(0, -1).map((start, k, all) => [start, k + 1 < all.length ? all[k + 1] : path.length]);
  const pythonSegments = bounds(python, pythonCuts);
  const slots: { slot: number; primary: boolean }[] = [];
  bounds(native, nativeCuts).forEach(([start, end], k) => {
    const [from, to] = pythonSegments[k];
    for (let offset = 0; offset < end - start; offset += 1) {
      const primary = offset < to - from;
      slots.push({ slot: Math.max(0, primary ? from + offset : (to > from ? to : from + 1) - 1), primary });
    }
  });
  let carried: string | null = null;
  return stepRanges(story).map(([start, end]) => {
    const inside = native.flatMap((entry, index) =>
      slots[index].slot >= start && slots[index].slot <= end ? [{ anchor: entry.sourceAnchor, primary: slots[index].primary }] : [],
    );
    const lead = inside.filter((item) => item.primary).at(-1) ?? inside.at(-1);
    if (lead) carried = lead.anchor;
    return { current: carried, ran: inside.map((item) => item.anchor) };
  });
}

// ------------------------------------------------------------------ views
function frameValue(view: StoryView, step: StoryStep): StoryValue | undefined {
  if (!view.var) return undefined;
  if (view.field) {
    const owner = liveLocal(step, view.var);
    return isRef(owner) ? step.heap?.[owner.$ref]?.[view.field] : undefined;
  }
  const bottom =
    view.frame === 'bottom' ||
    (!view.frame &&
      (view.kind === 'tree' || view.kind === 'trie' || view.kind === 'linked-list' || view.kind === 'graph'));
  if (bottom && step.calls?.length && view.var in step.calls[0].state) return step.calls[0].state[view.var];
  return step.state[view.var];
}

export interface StoryCell {
  key: string;
  text: string;
  index: number;
  tones: StoryTone[];
  /** Windowed array: a run of hidden cells ("…"); `index` is the first hidden index. */
  gap?: number;
}
export interface StoryPointer {
  label: string;
  /** The index, number or bit the local holds. */
  index: number;
  /** Where the pointer is drawn: the position of its cell in `cells`. */
  slot: number;
  past: boolean;
  /** 0 for the first pointer at an index; later ones stack below it. */
  row: number;
}
export interface SequenceModel {
  kind: 'array' | 'stack' | 'queue' | 'string' | 'number-line' | 'bits';
  missing: boolean;
  cells: StoryCell[];
  pointers: StoryPointer[];
  /** A short note drawn after the cells ("window of 100,001 cells", "= 12"). */
  note?: string;
}
/** A pointer's value: the current frame, or (views pinned to the outermost call) the caller's. */
function pointerValue(view: StoryView, step: StoryStep, name: string): StoryValue | undefined {
  return view.frame === 'bottom' && !(name in step.state) ? step.calls?.[0]?.state[name] : step.state[name];
}
function placePointers(
  view: StoryView,
  step: StoryStep,
  slotOf: (value: number) => number | null,
  rename: (name: string) => string = (name) => name,
): StoryPointer[] {
  const pointers: StoryPointer[] = [];
  for (const pointer of view.pointers ?? []) {
    const value = pointerValue(view, step, pointer.var);
    if (typeof value !== 'number') continue;
    const slot = slotOf(value);
    if (slot === null) continue;
    pointers.push({
      label: pointer.label ?? rename(pointer.var),
      index: value,
      slot,
      past: false,
      row: pointers.filter((item) => item.slot === slot).length,
    });
  }
  return pointers;
}
/** One character per cell; a space shows as "␣" so it can be seen and pointed at. */
function charText(char: string): string {
  return char === ' ' ? '␣' : char;
}
const SPARSE_GAP = 2;
const WINDOW_SPAN = 32;
/**
 * Windowed array (a sparse table such as a 100,001-slot frequency count): the cells in use are
 * the non-fill cells plus every pointer and marked cell. When they span at most 32 cells the
 * whole stretch between them is drawn (so a pointer sweeping it does not reflow the row);
 * otherwise hidden runs between them collapse into one "…" cell (runs of up to two are drawn).
 */
function windowCells(
  view: StoryView,
  step: StoryStep,
  language: PatternLanguage,
  sparse: { length: number; fill: StoryValue; items: [number, StoryValue][] },
): { cells: StoryCell[]; slotOf: (value: number) => number | null } {
  const values = new Map(sparse.items.map(([index, item]) => [index, item]));
  const tones = viewTones(step, view.id, sparse.length);
  const used = new Set<number>(values.keys());
  for (const pointer of view.pointers ?? []) {
    const value = pointerValue(view, step, pointer.var);
    if (typeof value === 'number' && value >= 0 && value < sparse.length) used.add(value);
  }
  for (const id of tones.keys()) {
    const index = Number(JSON.parse(id));
    if (Number.isInteger(index) && index >= 0 && index < sparse.length) used.add(index);
  }
  let shown = [...used].sort((a, b) => a - b);
  if (shown.length && shown[shown.length - 1] - shown[0] <= WINDOW_SPAN)
    shown = Array.from({ length: shown[shown.length - 1] - shown[0] + 1 }, (_, offset) => shown[0] + offset);
  const cells: StoryCell[] = [];
  const slots = new Map<number, number>();
  const gap = (from: number, to: number) =>
    cells.push({ key: `gap-${from}`, index: from, text: '…', tones: [], gap: to - from + 1 });
  let previous = -1;
  for (const index of shown) {
    if (index - previous - 1 > SPARSE_GAP) gap(previous + 1, index - 1);
    else for (let fill = previous + 1; fill < index; fill += 1) pushCell(fill);
    pushCell(index);
    previous = index;
  }
  if (previous < sparse.length - 1) gap(previous + 1, sparse.length - 1);
  function pushCell(index: number) {
    slots.set(index, cells.length);
    cells.push({
      key: String(index),
      index,
      text: formatValue(values.has(index) ? values.get(index)! : sparse.fill, language, step.heap, 24),
      tones: tones.get(keyId(index)) ?? [],
    });
  }
  return { cells, slotOf: (value) => slots.get(value) ?? (value === sparse.length ? cells.length : null) };
}
function itemText(view: StoryView, item: StoryValue, step: StoryStep, language: PatternLanguage): string {
  const heap = step.heap ?? {};
  if (view.fields?.length && isRef(item) && heap[item.$ref])
    return view.fields.map((field) => formatValue(heap[item.$ref][field], language, heap, 12)).join(':');
  return formatValue(item, language, heap, 24);
}
export function sequenceModel(view: StoryView, raw: StoryStep, language: PatternLanguage): SequenceModel {
  const step = shownStep(raw);
  if (view.kind === 'number-line') return numberLineModel(view, step);
  if (view.kind === 'bits') return bitsModel(view, step);
  const value = frameValue(view, step);
  const kind = view.kind as SequenceModel['kind'];
  const sparse = value && typeof value === 'object' && '$sparse' in value ? value.$sparse : null;
  if (sparse && view.window) {
    const { cells, slotOf } = windowCells(view, step, language, sparse);
    const pointers = placePointers(view, step, slotOf).map((pointer) => ({ ...pointer, past: pointer.index === sparse.length }));
    return { kind, missing: false, cells, pointers, note: `window of ${sparse.length.toLocaleString('en-US')} cells` };
  }
  const items: StoryValue[] | null =
    view.kind === 'string' ? (typeof value === 'string' ? [...value] : null) : sequenceOf(value);
  if (!items) return { kind, missing: true, cells: [], pointers: [] };
  const tones = viewTones(step, view.id, items.length);
  const pointers = placePointers(view, step, (index) => (index >= 0 && index <= items.length ? index : null)).map(
    (pointer) => ({ ...pointer, past: pointer.index === items.length }),
  );
  return {
    kind,
    missing: false,
    pointers,
    cells: items.map((item, index) => ({
      key: String(index),
      index,
      text: view.kind === 'string' ? charText(item as string) : itemText(view, item, step, language),
      tones: tones.get(keyId(index)) ?? [],
    })),
  };
}

/** A number or "@local" bound of a number line. */
function bound(value: number | string | undefined, step: StoryStep): number | null {
  if (typeof value === 'number') return value;
  const held = typeof value === 'string' && value.startsWith('@') ? step.state[value.slice(1)] : undefined;
  return typeof held === 'number' ? held : null;
}
const MAX_TICKS = 64;
/** Number line min..max: one tick per integer, int locals as pointers, marks by number. */
export function numberLineModel(view: StoryView, step: StoryStep): SequenceModel {
  const low = bound(view.min, step);
  const high = bound(view.max, step);
  if (low === null || high === null || high < low || high - low >= MAX_TICKS)
    return { kind: 'number-line', missing: true, cells: [], pointers: [] };
  // An open range ("@right+1..") runs to the last number on the line.
  const tones = viewTones(step, view.id, high + 1);
  const cells: StoryCell[] = [];
  for (let value = low; value <= high; value += 1)
    cells.push({ key: String(value), index: value, text: String(value), tones: tones.get(keyId(value)) ?? [] });
  const pointers = placePointers(view, step, (value) => (value >= low && value <= high ? value - low : null));
  return { kind: 'number-line', missing: false, cells, pointers };
}
/** Binary digits of an int local, highest bit first; bit k is marked by the selector k. */
export function bitsModel(view: StoryView, step: StoryStep): SequenceModel {
  const value = frameValue(view, step);
  const width = Math.max(1, Math.min(32, view.width ?? 8));
  if (typeof value !== 'number' || !Number.isInteger(value))
    return { kind: 'bits', missing: true, cells: [], pointers: [] };
  const unsigned = value < 0 ? value + 2 ** width : value;
  const tones = viewTones(step, view.id, width);
  const cells: StoryCell[] = [];
  for (let bit = width - 1; bit >= 0; bit -= 1)
    cells.push({
      key: String(bit),
      index: bit,
      text: String(Math.floor(unsigned / 2 ** bit) % 2),
      tones: tones.get(keyId(bit)) ?? [],
    });
  return { kind: 'bits', missing: false, cells, pointers: [], note: `= ${value}` };
}

export interface MapModel {
  missing: boolean;
  entries: { key: string; value: string | null; tones: StoryTone[] }[];
  misses: string[];
}
/** A map value as the page writes it: a chain of nodes, chosen fields, or the plain value. */
function mapValueText(view: StoryView, value: StoryValue, step: StoryStep, language: PatternLanguage): string {
  const heap = step.heap ?? {};
  const object = isRef(value) ? heap[value.$ref] : undefined;
  if (object && view.chain) {
    const next = view.chain.next ?? 'next';
    const stop = view.chain.to ? object[view.chain.to] : null;
    const start = object[view.chain.from];
    // With `to`, both ends are dummy nodes: walk the real nodes between them.
    let link: StoryValue | undefined = view.chain.to && isRef(start) ? heap[start.$ref]?.[next] : start;
    const items: string[] = [];
    const seen = new Set<string>();
    while (isRef(link) && heap[link.$ref] && !seen.has(link.$ref) && !(isRef(stop) && stop.$ref === link.$ref)) {
      seen.add(link.$ref);
      const node: StoryHeapObject = heap[link.$ref];
      items.push(
        view.chain.fields?.length
          ? view.chain.fields.map((field) => formatValue(node[field], language, {}, 8)).join(':')
          : nodeText(node, language),
      );
      link = node[next];
    }
    const both = isRef(start) && 'prev' in (heap[start.$ref] ?? {});
    return items.length ? items.join(both ? ' ⇄ ' : ' → ') : 'empty';
  }
  if (object && view.valueFields?.length)
    return view.valueFields.map((field) => `${field} ${formatValue(object[field], language, heap, 16)}`).join(', ');
  return formatValue(value, language, heap, 48);
}
export function mapModel(view: StoryView, raw: StoryStep, language: PatternLanguage): MapModel {
  const step = shownStep(raw);
  const entries = entriesOf(frameValue(view, step));
  if (!entries) return { missing: true, entries: [], misses: [] };
  const tones = viewTones(step, view.id);
  const present = new Set(entries.map(([key]) => keyId(key)));
  const misses: string[] = [];
  for (const selector of step.marks?.[view.id]?.miss ?? [])
    for (const key of resolveSelector(selector, step.state))
      if (!present.has(keyId(key))) misses.push(formatValue(key, language, step.heap, 24));
  return {
    missing: false,
    misses,
    entries: entries.map(([key, value]) => ({
      key: formatValue(key, language, step.heap, 32),
      value: value === undefined ? null : mapValueText(view, value, step, language),
      tones: (tones.get(keyId(key)) ?? []).filter((tone) => tone !== 'miss'),
    })),
  };
}

export interface GridModel {
  missing: boolean;
  rows: StoryCell[][];
  cursor: [number, number] | null;
}
/** One grid row as cells: a string row ("110") is its characters. */
function gridRow(row: StoryValue): StoryValue[] | null {
  return typeof row === 'string' ? [...row] : sequenceOf(row);
}
export function gridModel(view: StoryView, raw: StoryStep, language: PatternLanguage): GridModel {
  const step = shownStep(raw);
  const rows = sequenceOf(frameValue(view, step));
  if (!rows) return { missing: true, rows: [], cursor: null };
  const tones = viewTones(step, view.id);
  const [rowVar, columnVar] = view.cursor ?? [];
  const r = rowVar ? step.state[rowVar] : undefined;
  const c = columnVar ? step.state[columnVar] : undefined;
  return {
    missing: false,
    cursor: typeof r === 'number' && typeof c === 'number' ? [r, c] : null,
    rows: rows.map((row, rowIndex) =>
      (gridRow(row) ?? [row]).map((item, columnIndex) => ({
        key: `${rowIndex},${columnIndex}`,
        index: columnIndex,
        // A character of a string row shows bare ("1", not "\"1\""), whatever the language.
        text: typeof row === 'string' ? String(item) : formatValue(item, language, step.heap, 12),
        tones: tones.get(keyId(`${rowIndex},${columnIndex}`)) ?? [],
      })),
    ),
  };
}

// ------------------------------------------------------------------ call timeline (recursion)
/** A call that ends right after a step, with what it returned. */
export interface StoryReturn {
  /** Position from the bottom of the stack (0 = the outermost call). */
  depth: number;
  value: StoryValue;
  state: Record<string, StoryValue>;
  heap: Record<string, StoryHeapObject>;
}
export interface StoryCallMoment {
  /**
   * The step's last line calls down (the next step is deeper). The runtime records a line's
   * state after the whole line, so its `returns` is a value the calls below have not made yet.
   */
  inProgress: boolean;
  /** Calls that end after this step and before the next, top first. The last step unwinds all. */
  unwinds: StoryReturn[];
  /** Which call of its caller the current frame is (0 = the caller's first call). */
  ordinal: number;
  /**
   * In-progress steps only: the current frame's locals before this line ran, so `left = f(...)`
   * does not show `left` before the call below has even started (null when not known).
   */
  before?: Record<string, StoryValue> | null;
}
const timelines = new WeakMap<DsaStoryV1, StoryCallMoment[]>();
/**
 * When each call really returns. A step's `returns` sits on the frame's last executed line, which
 * for `return 1 + max(f(left), f(right))` is reached before the calls it makes, so the value is
 * moved to the step after which that frame leaves the stack.
 */
export function callTimeline(story: DsaStoryV1): StoryCallMoment[] {
  const cached = timelines.get(story);
  if (cached) return cached;
  interface Frame {
    state: Record<string, StoryValue>;
    returned: { value: StoryValue; heap: Record<string, StoryHeapObject> } | null;
    children: number;
    ordinal: number;
    /** Locals after this frame's latest line as the running call (not as seen from a callee). */
    own: Record<string, StoryValue> | null;
  }
  const moments: StoryCallMoment[] = story.steps.map(() => ({ inProgress: false, unwinds: [], ordinal: 0 }));
  let stack: Frame[] = [];
  const end = (frames: Frame[], offset: number): StoryReturn[] =>
    frames
      .map((frame, index) => ({ frame, depth: offset + index }))
      .filter(({ frame }) => frame.returned)
      .map(({ frame, depth }) => ({ depth, value: frame.returned!.value, state: frame.state, heap: frame.returned!.heap }))
      .reverse();
  const before: (Record<string, StoryValue> | null)[] = story.steps.map(() => null);
  story.steps.forEach((step, index) => {
    const frames = [...(step.calls ?? []), { fn: step.fn ?? 'call', state: step.state }];
    if (index > 0) {
      moments[index - 1].inProgress = frames.length > stack.length;
      let keep = Math.min(stack.length, frames.length);
      // A frame that already returned and sits at this depth was replaced by a sibling call.
      if (keep === frames.length && stack[keep - 1]?.returned) keep -= 1;
      moments[index - 1].unwinds = end(stack.slice(keep), keep);
      stack = stack.slice(0, keep);
      if (keep === frames.length) before[index] = stack[keep - 1].own;
    }
    while (stack.length < frames.length) {
      const parent = stack.at(-1);
      stack.push({ state: {}, returned: null, children: 0, ordinal: parent ? parent.children++ : 0, own: null });
    }
    frames.forEach((frame, depth) => (stack[depth].state = frame.state));
    if ('returns' in step) stack[frames.length - 1].returned = { value: step.returns ?? null, heap: step.heap ?? {} };
    moments[index].ordinal = stack[frames.length - 1].ordinal;
    stack[frames.length - 1].own = step.state;
  });
  if (moments.length) moments[moments.length - 1].unwinds = end(stack, 0);
  moments.forEach((moment, index) => {
    if (moment.inProgress) moment.before = before[index];
  });
  timelines.set(story, moments);
  return moments;
}
/** Java and Go name functions in camelCase (max_depth -> maxDepth). */
function functionName(name: string, language: PatternLanguage): string {
  return language === 'python' ? name : name.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

export interface CallsModel {
  /** `returns`: what this frame returns right after the step, when it ends then. */
  frames: { label: string; current: boolean; tones: StoryTone[]; returns: string | null }[];
  /** What the current call returns (null while its line is still calling down). */
  returns: string | null;
}
export function callsModel(
  view: StoryView,
  step: StoryStep,
  language: PatternLanguage,
  moment?: StoryCallMoment,
  aliases?: ReadonlyMap<string, string>,
): CallsModel {
  const all: StoryFrame[] = [...(step.calls ?? []), { fn: step.fn ?? 'call', state: step.state }];
  const tones = viewTones(step, view.id, all.length);
  const own =
    'returns' in step && !moment?.inProgress ? formatValue(step.returns, language, step.heap, 40, aliases) : null;
  return {
    returns: own,
    frames: all.map((frame, index) => {
      const names = view.show ?? Object.keys(frame.state).slice(0, 2);
      const args = names
        .filter((name) => name in frame.state)
        .map((name) => `${name}=${formatValue(frame.state[name], language, step.heap, 28, aliases)}`);
      const ends = moment?.unwinds.find((item) => item.depth === index);
      return {
        label: `${functionName(frame.fn, language)}(${args.join(', ')})`,
        current: index === all.length - 1,
        tones: tones.get(keyId(index)) ?? [],
        returns: ends
          ? formatValue(ends.value, language, ends.heap, 40, aliases)
          : index === all.length - 1
            ? own
            : null,
      };
    }),
  };
}

// Node diagrams (SVG, viewBox units).
export interface NodeShape {
  id: string;
  x: number;
  y: number;
  text: string;
  tones: StoryTone[];
  pointers: string[];
  /** Linked list with `sentinels`: a dummy node, drawn as a box. */
  sentinel?: boolean;
  /** Linked list with `follow`: a node off the list; its pointer labels sit below it, clear of its stale links. */
  labelsBelow?: boolean;
  /** Tree with `returned`: what this node's finished call returned ("depth 2"). */
  badge?: string;
  /** Trie: a word ends at this node (its end flag is true). */
  end?: boolean;
}
export interface EdgeShape {
  id: string;
  from: string;
  to: string;
  path: string;
  directed: boolean;
  /**
   * Linked list with `follow`: a back link, or a link out of a node that is off the list.
   * `extra`: a pointer field listed in the view's `extra` (a random pointer), drawn dashed.
   */
  kind?: 'prev' | 'stale' | 'extra';
  /** Tree: a dashed link to the empty child a recursive call is looking at. */
  ghost?: boolean;
  /** Graph: the tone this edge takes from the marks on its two ends (see `graphEdgeTone`). */
  tone?: StoryTone;
}
export interface NodeDiagram {
  missing: boolean;
  width: number;
  height: number;
  nodes: NodeShape[];
  edges: EdgeShape[];
  /** Pointer labels whose local is null (drawn at the null marker). */
  nullPointers: string[];
  nullAt: { x: number; y: number } | null;
}
const R = 22;
function pointerLabels(
  view: StoryView,
  step: StoryStep,
  rename: (name: string) => string = (name) => name,
): Map<string, string[]> {
  const labels = new Map<string, string[]>();
  for (const pointer of view.pointers ?? []) {
    const value = step.state[pointer.var];
    const id = isRef(value) ? value.$ref : value === null ? 'null' : null;
    if (id) labels.set(id, [...(labels.get(id) ?? []), pointer.label ?? rename(pointer.var)]);
  }
  return labels;
}
function nodeText(node: StoryHeapObject | undefined, language: PatternLanguage): string {
  if (!node) return '?';
  const value = node['val'] ?? node['key'];
  return value === undefined ? node.$type : formatValue(value, language, {}, 6);
}

/** Linked list: every node keeps one slot for the whole story; arrows follow each step's real `next`. */
export function linkedListModel(
  view: StoryView,
  story: DsaStoryV1,
  index: number,
  language: PatternLanguage,
): NodeDiagram {
  if (view.follow) return followListModel(view, story, index, language);
  const order: string[] = [];
  for (const raw of story.steps) {
    const step = shownStep(raw);
    const roots = [...rootsOf(view, frameValue(view, step)), ...(view.pointers ?? []).map((p) => step.state[p.var])];
    for (const root of roots) {
      let ref = isRef(root) ? root.$ref : null;
      const visited = new Set<string>();
      while (ref && step.heap?.[ref] && !visited.has(ref)) {
        visited.add(ref);
        if (!order.includes(ref)) order.push(ref);
        const next: StoryValue | undefined = step.heap[ref]['next'];
        ref = isRef(next) ? next.$ref : null;
      }
    }
  }
  const step = shownStep(story.steps[index]);
  const heap = step.heap ?? {};
  if (!order.length) return { missing: true, width: 0, height: 0, nodes: [], edges: [], nullPointers: [], nullAt: null };
  const gap = 84;
  const y = 70;
  const x = (slot: number) => 40 + slot * gap;
  const tones = viewTones(step, view.id);
  // Pointer labels use each language's own local names (Python `nxt` is `next` in Java and Go).
  const labels = pointerLabels(view, step, (name) => displayName(story, name, language));
  const nodes: NodeShape[] = order
    .filter((ref) => heap[ref])
    .map((ref) => ({
      id: ref,
      x: x(order.indexOf(ref)),
      y,
      text: nodeText(heap[ref], language),
      tones: tones.get(keyId(ref)) ?? [],
      pointers: labels.get(ref) ?? [],
    }));
  const nullAt = { x: x(order.length), y };
  const edges: EdgeShape[] = [];
  for (const node of nodes) {
    const next = heap[node.id]['next'];
    const from = { x: node.x, y };
    const target = isRef(next) ? nodes.find((item) => item.id === next.$ref) : null;
    if (isRef(next) && !target) continue;
    const to = target ? { x: target.x, y } : null;
    let path: string;
    if (!to) path = `M${from.x} ${y + R}v16h-10m10 0h10`;
    else if (to.x === from.x + gap) path = `M${from.x + R} ${y}H${to.x - R - 4}`;
    // A rewired link to the left neighbour (a reversal) is a straight arrow pointing left,
    // unless that neighbour also links back here (a two-node cycle keeps the curve).
    else if (to.x === from.x - gap && keyId(heap[target!.id]['next']) !== keyId({ $ref: node.id }))
      path = `M${from.x - R} ${y}H${to.x + R + 4}`;
    else {
      const lift = to.x > from.x ? -46 : 46;
      path = `M${from.x} ${y + (lift < 0 ? -R : R)}C${from.x} ${y + lift} ${to.x} ${y + lift} ${to.x} ${y + (lift < 0 ? -R - 4 : R + 4)}`;
    }
    edges.push({ id: `${node.id}-next`, from: node.id, to: target?.id ?? 'null', path, directed: !!to });
  }
  // Extra pointer fields (random): dashed arrows that curve below the row; a self-link loops.
  for (const node of nodes) {
    for (const field of view.extra ?? []) {
      const link = heap[node.id][field];
      const target = isRef(link) ? nodes.find((item) => item.id === link.$ref) : undefined;
      if (!target) continue;
      const path =
        target.id === node.id
          ? `M${node.x - 8} ${y + R - 2}C${node.x - 30} ${y + 62} ${node.x + 30} ${y + 62} ${node.x + 9} ${y + R + 3}`
          : `M${node.x} ${y + R}C${node.x} ${y + 64 + Math.abs(target.x - node.x) / 8} ${target.x} ${y + 64 + Math.abs(target.x - node.x) / 8} ${target.x} ${y + R + 4}`;
      edges.push({ id: `${node.id}-${field}`, from: node.id, to: target.id, path, directed: true, kind: 'extra' });
    }
  }
  return {
    missing: false,
    width: x(order.length) + 40,
    height: view.extra?.length ? 190 : 150,
    nodes,
    edges,
    nullPointers: labels.get('null') ?? [],
    nullAt,
  };
}

/** Where a node view starts: the var itself, or each key or value of a map (`roots`). */
function rootsOf(view: StoryView, value: StoryValue | undefined): (StoryValue | undefined)[] {
  const entries = view.roots ? entriesOf(value) : null;
  if (!entries) return [value];
  return entries.map(([key, item]) => (view.roots === 'keys' ? key : (item ?? null)));
}
/** A local from the current frame, else from the nearest call below it that has it. */
function liveLocal(step: StoryStep, name: string): StoryValue | undefined {
  if (name in step.state) return step.state[name];
  for (const frame of [...(step.calls ?? [])].reverse()) if (name in frame.state) return frame.state[name];
  return undefined;
}
interface FollowLayout {
  chain: string[];
  spots: Map<string, { x: number; y: number }>;
}
const FOLLOW_GAP = 84;
const FOLLOW_Y = 70;
const FOLLOW_ROW2 = 166;
/** One step of a `follow` list: the chain from `var` in its real order, then nodes off it. */
function followLayout(view: StoryView, step: StoryStep): FollowLayout {
  const heap = step.heap ?? {};
  const x = (slot: number) => 40 + slot * FOLLOW_GAP;
  const chain: string[] = [];
  const root = frameValue(view, step);
  let ref = isRef(root) ? root.$ref : null;
  while (ref && heap[ref] && !chain.includes(ref)) {
    chain.push(ref);
    const next: StoryValue | undefined = heap[ref]['next'];
    ref = isRef(next) ? next.$ref : null;
  }
  const spots = new Map(chain.map((id, slot) => [id, { x: x(slot), y: FOLLOW_Y }]));
  const names = [...(view.pointers ?? []).map((pointer) => pointer.var), ...(view.sentinels ?? [])];
  for (const name of names) {
    const value = liveLocal(step, name);
    if (!isRef(value) || !heap[value.$ref] || spots.has(value.$ref)) continue;
    // Park an off-list node under the gap it was unlinked from (or will be linked into).
    const near = (field: string) => {
      const link = heap[value.$ref][field];
      return isRef(link) ? spots.get(link.$ref) : undefined;
    };
    const after = near('next');
    const before = view.prevField ? near(view.prevField) : undefined;
    let spot = Math.max(x(0), before && after ? (before.x + after.x) / 2 : after ? after.x - FOLLOW_GAP / 2 : x(1));
    const taken = () => [...spots.values()].some((item) => item.y === FOLLOW_ROW2 && Math.abs(item.x - spot) < FOLLOW_GAP * 0.9);
    while (taken()) spot += FOLLOW_GAP;
    spots.set(value.$ref, { x: spot, y: FOLLOW_ROW2 });
  }
  return { chain, spots };
}
/** Linked list with `follow`: positions follow each step's real order; back links optional. */
function followListModel(view: StoryView, story: DsaStoryV1, index: number, language: PatternLanguage): NodeDiagram {
  const step = shownStep(story.steps[index]);
  const heap = step.heap ?? {};
  const layout = followLayout(view, step);
  if (!layout.spots.size) return { missing: true, width: 0, height: 0, nodes: [], edges: [], nullPointers: [], nullAt: null };
  // One frame size for the whole story, so the drawing doesn't rescale from step to step.
  let right = 0;
  let twoRows = false;
  let labelsBelow = 0;
  for (const raw of story.steps) {
    const item = shownStep(raw);
    for (const [id, spot] of followLayout(view, item).spots) {
      right = Math.max(right, spot.x);
      if (spot.y !== FOLLOW_ROW2) continue;
      twoRows = true;
      const here = (view.pointers ?? []).filter((pointer) => {
        const value = liveLocal(item, pointer.var);
        return isRef(value) && value.$ref === id;
      });
      labelsBelow = Math.max(labelsBelow, here.length);
    }
  }
  const tones = viewTones(step, view.id);
  const labels = new Map<string, string[]>();
  for (const pointer of view.pointers ?? []) {
    const value = liveLocal(step, pointer.var);
    const id = isRef(value) ? value.$ref : value === null ? 'null' : null;
    if (id) labels.set(id, [...(labels.get(id) ?? []), pointer.label ?? pointer.var]);
  }
  const sentinels = new Map<string, string>();
  for (const name of view.sentinels ?? []) {
    const value = liveLocal(step, name);
    if (isRef(value)) sentinels.set(value.$ref, name);
  }
  const text = (id: string) => {
    if (sentinels.has(id)) return sentinels.get(id)!;
    const node = heap[id];
    return view.fields?.length
      ? view.fields.map((field) => formatValue(node[field], language, {}, 6)).join(':')
      : nodeText(node, language);
  };
  const nodes: NodeShape[] = [...layout.spots].map(([id, spot]) => ({
    id,
    ...spot,
    text: text(id),
    tones: tones.get(keyId(id)) ?? [],
    pointers: labels.get(id) ?? [],
    sentinel: sentinels.has(id),
    ...(spot.y === FOLLOW_ROW2 ? { labelsBelow: true } : {}),
  }));
  const edges: EdgeShape[] = [];
  const fields: [string, 'next' | 'prev'][] = [['next', 'next'], ...(view.prevField ? [[view.prevField, 'prev'] as [string, 'prev']] : [])];
  for (const node of nodes) {
    for (const [field, role] of fields) {
      const link = heap[node.id][field];
      const target = isRef(link) ? layout.spots.get(link.$ref) : undefined;
      if (!isRef(link) || !target) continue;
      const a = { x: node.x, y: node.y };
      const b = target;
      const lane = role === 'next' ? -7 : 7;
      const reach = Math.sqrt(R * R - lane * lane);
      let path: string;
      if (a.y === b.y && Math.abs(b.x - a.x) === FOLLOW_GAP && (role === 'next') === b.x > a.x) {
        const sign = b.x > a.x ? 1 : -1;
        path = `M${a.x + sign * reach} ${a.y + lane}H${b.x - sign * (reach + 4)}`;
      } else if (a.y === b.y) {
        const lift = role === 'next' ? -46 : 46;
        const edge = lift < 0 ? -R : R;
        path = `M${a.x} ${a.y + edge}C${a.x} ${a.y + lift} ${b.x} ${b.y + lift} ${b.x} ${b.y + edge + Math.sign(edge) * 4}`;
      } else {
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / length;
        const uy = (b.y - a.y) / length;
        const side = role === 'next' ? 4 : -4;
        path = `M${a.x + ux * R - uy * side} ${a.y + uy * R + ux * side}L${b.x - ux * (R + 5) - uy * side} ${b.y - uy * (R + 5) + ux * side}`;
      }
      const offList = !layout.chain.includes(node.id);
      edges.push({
        id: `${node.id}-${field}`,
        from: node.id,
        to: link.$ref,
        path,
        directed: true,
        ...(offList ? { kind: 'stale' as const } : role === 'prev' ? { kind: 'prev' as const } : {}),
      });
    }
  }
  const nullPointers = labels.get('null') ?? [];
  return {
    missing: false,
    // Room after the last node for the "null" marker of a pointer that holds nothing.
    width: right + (view.pointers?.length ? 100 : 40),
    // An off-list node's pointer labels hang below it (16 units per extra label).
    height: twoRows ? FOLLOW_ROW2 + 48 + 16 * Math.max(0, labelsBelow - 1) : 150,
    nodes,
    edges,
    nullPointers,
    nullAt: nullPointers.length ? { x: right + 66, y: FOLLOW_Y } : null,
  };
}

/**
 * Binary tree laid out by in-order position and depth from the step's real left/right fields.
 * With the story history (recursive code): a pointer that is null in the current call is drawn
 * at the empty child slot of the caller's node, and `returned` labels each finished call's node.
 */
export function treeModel(
  view: StoryView,
  step: StoryStep,
  language: PatternLanguage,
  history?: { story: DsaStoryV1; index: number },
): NodeDiagram {
  step = shownStep(step);
  const model = treeLayout(view, step, language);
  if (model.missing || !history) return model;
  const heap = step.heap ?? {};
  const moments = callTimeline(history.story);
  if (view.returned) {
    const badges = new Map<string, string>();
    for (const moment of moments.slice(0, history.index + 1))
      for (const ended of moment.unwinds) {
        const node = ended.state[view.returned.var];
        if (isRef(node))
          badges.set(node.$ref, `${view.returned.label ? `${view.returned.label} ` : ''}${formatValue(ended.value, language, ended.heap, 12)}`);
      }
    for (const node of model.nodes) if (badges.has(node.id)) node.badge = badges.get(node.id);
    model.width += 40;
  }
  const empty = (view.pointers ?? []).find((pointer) => step.state[pointer.var] === null);
  const caller = empty ? step.calls?.at(-1)?.state[empty.var] : undefined;
  const parent = isRef(caller) ? model.nodes.find((node) => node.id === caller.$ref) : undefined;
  if (parent && model.nullPointers.length) {
    const has = (side: 'left' | 'right') => isRef(heap[parent.id]?.[side]);
    const ordinal = moments[history.index]?.ordinal ?? 0;
    const side =
      has('left') === has('right')
        ? has('left') || ordinal > 1
          ? 0
          : ordinal === 0
            ? -1
            : 1
        : has('left')
          ? 1
          : -1;
    model.nullAt = { x: parent.x + side * 28, y: parent.y + 78 };
    model.edges.push({
      id: `${parent.id}-empty`,
      from: parent.id,
      to: 'null',
      path: `M${parent.x} ${parent.y + R}L${model.nullAt.x} ${model.nullAt.y - 12}`,
      directed: false,
      ghost: true,
    });
    model.height = Math.max(model.height, model.nullAt.y + 28);
  }
  return model;
}
function treeLayout(view: StoryView, step: StoryStep, language: PatternLanguage): NodeDiagram {
  const heap = step.heap ?? {};
  const root = frameValue(view, step);
  if (!isRef(root) || !heap[root.$ref])
    return { missing: true, width: 0, height: 0, nodes: [], edges: [], nullPointers: [], nullAt: null };
  const placed: { id: string; order: number; depth: number }[] = [];
  const child = (ref: string, side: 'left' | 'right') => {
    const value = heap[ref]?.[side];
    return isRef(value) && heap[value.$ref] ? value.$ref : null;
  };
  let counter = 0;
  const visit = (ref: string | null, depth: number, seen: Set<string>) => {
    if (!ref || seen.has(ref) || depth > 12) return;
    seen.add(ref);
    visit(child(ref, 'left'), depth + 1, seen);
    placed.push({ id: ref, order: counter++, depth });
    visit(child(ref, 'right'), depth + 1, seen);
  };
  visit(root.$ref, 0, new Set());
  const gap = 56;
  const levels = Math.max(...placed.map((item) => item.depth)) + 1;
  const tones = viewTones(step, view.id);
  const labels = pointerLabels(view, step);
  const position = new Map(placed.map((item) => [item.id, { x: 36 + item.order * gap, y: 44 + item.depth * 78 }]));
  const nodes = placed.map((item) => ({
    id: item.id,
    ...position.get(item.id)!,
    text: nodeText(heap[item.id], language),
    tones: tones.get(keyId(item.id)) ?? [],
    pointers: labels.get(item.id) ?? [],
  }));
  const edges: EdgeShape[] = [];
  for (const item of placed) {
    for (const side of ['left', 'right'] as const) {
      const target = child(item.id, side);
      if (!target || !position.has(target)) continue;
      const a = position.get(item.id)!;
      const b = position.get(target)!;
      edges.push({ id: `${item.id}-${side}`, from: item.id, to: target, path: `M${a.x} ${a.y + R}L${b.x} ${b.y - R}`, directed: false });
    }
  }
  return {
    missing: false,
    width: 36 * 2 + (placed.length - 1) * gap,
    height: 44 + levels * 78,
    nodes,
    edges,
    nullPointers: labels.get('null') ?? [],
    nullAt: null,
  };
}

/**
 * Trie of objects: each node's children live in a map field (`children`, default "children")
 * from character to node, and a boolean field (`end`, default "terminal") marks a word's end.
 * Laid out like a tree (leaves left to right in map order, a parent over its children); each
 * node shows the character on the edge into it, and an end-of-word node gets a second ring.
 * Pointers read the current call, else the callers (`node` stays labelled while a helper
 * runs). A pointer-held node not linked in yet (just built) is drawn apart, top right.
 */
export function trieModel(view: StoryView, raw: StoryStep, language: PatternLanguage, story?: DsaStoryV1): NodeDiagram {
  const step = shownStep(raw);
  const heap = step.heap ?? {};
  const root = frameValue(view, step);
  if (!isRef(root) || !heap[root.$ref])
    return { missing: true, width: 0, height: 0, nodes: [], edges: [], nullPointers: [], nullAt: null };
  const childrenField = view.children ?? 'children';
  const endField = view.end ?? 'terminal';
  const children = (ref: string): [string, string][] =>
    (entriesOf(heap[ref]?.[childrenField]) ?? []).flatMap(([key, item]) =>
      isRef(item) && heap[item.$ref] ? [[String(key), item.$ref] as [string, string]] : [],
    );
  const gap = 46;
  const levelGap = 66;
  const placed = new Map<string, { x: number; depth: number; text: string }>();
  let leaves = 0;
  const visit = (ref: string, depth: number, text: string): number => {
    if (placed.has(ref) || depth > 24) return 0;
    placed.set(ref, { x: 0, depth, text });
    const xs = children(ref).map(([char, child]) => visit(child, depth + 1, char)).filter((x) => x > 0);
    const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : 30 + leaves++ * gap;
    placed.get(ref)!.x = x;
    return x;
  };
  visit(root.$ref, 0, '');
  const rename = (name: string) => (story ? displayName(story, name, language) : name);
  const labels = new Map<string, string[]>();
  const loose: string[] = [];
  for (const pointer of view.pointers ?? []) {
    const value = liveLocal(step, pointer.var);
    const id = isRef(value) ? value.$ref : value === null ? 'null' : null;
    if (!id) continue;
    labels.set(id, [...(labels.get(id) ?? []), pointer.label ?? rename(pointer.var)]);
    // Only trie nodes (objects with the children field) are drawn apart, never their owner.
    if (id !== 'null' && !placed.has(id) && heap[id]?.[childrenField] !== undefined && !loose.includes(id)) loose.push(id);
  }
  const right = Math.max(...[...placed.values()].map((item) => item.x));
  loose.forEach((id, slot) => placed.set(id, { x: right + gap * (slot + 1.5), depth: 1, text: '' }));
  const tones = viewTones(step, view.id);
  const y = (depth: number) => 40 + depth * levelGap;
  const nodes: NodeShape[] = [...placed].map(([id, item]) => ({
    id,
    x: item.x,
    y: y(item.depth),
    text: id === root.$ref ? 'root' : item.text,
    tones: tones.get(keyId(id)) ?? [],
    pointers: labels.get(id) ?? [],
    ...(heap[id]?.[endField] === true ? { end: true } : {}),
    ...(id === root.$ref ? { sentinel: true } : {}),
  }));
  const edges: EdgeShape[] = [];
  for (const [id] of placed)
    for (const [, child] of children(id)) {
      const a = placed.get(id)!;
      const b = placed.get(child);
      if (!b || b.depth !== a.depth + 1) continue;
      edges.push({ id: `${id}-${child}`, from: id, to: child, directed: false, path: `M${a.x} ${y(a.depth) + R}L${b.x} ${y(b.depth) - R}` });
    }
  const widest = Math.max(...[...placed.values()].map((item) => item.x));
  const deepest = Math.max(...[...placed.values()].map((item) => item.depth));
  const nullPointers = labels.get('null') ?? [];
  return {
    missing: false,
    width: widest + (nullPointers.length ? 90 : 34),
    height: y(deepest) + 34,
    nodes,
    edges,
    nullPointers,
    nullAt: nullPointers.length ? { x: widest + 58, y: y(0) } : null,
  };
}

/**
 * Graph of objects (`neighbors`: the field holding each node's neighbour list), such as the
 * input of Clone Graph. Nodes are the objects reachable from the var (or from each key or value
 * of a map with `roots`), keyed by heap label so marks name them ("n3", "@node"), and labelled by
 * their `val`. `layout` is keyed by that label text. A directed edge whose reverse also exists is
 * drawn as two arrows side by side.
 */
function objectGraphModel(view: StoryView, step: StoryStep, language: PatternLanguage, story?: DsaStoryV1): NodeDiagram {
  const heap = step.heap ?? {};
  const field = view.neighbors!;
  const order: string[] = [];
  const todo = rootsOf(view, frameValue(view, step)).flatMap((root) => (isRef(root) ? [root.$ref] : []));
  while (todo.length) {
    const ref = todo.shift()!;
    if (order.includes(ref) || !heap[ref]) continue;
    order.push(ref);
    for (const link of sequenceOf(heap[ref][field]) ?? []) if (isRef(link)) todo.push(link.$ref);
  }
  if (!order.length) return { missing: true, width: 0, height: 0, nodes: [], edges: [], nullPointers: [], nullAt: null };
  const size = 300;
  const text = (ref: string) => nodeText(heap[ref], language);
  const position = new Map(
    order.map((ref, index) => {
      const fixed = view.layout?.[text(ref)];
      if (fixed) return [ref, { x: 30 + (fixed[0] / 100) * (size - 60), y: 30 + (fixed[1] / 100) * (size - 60) }];
      const angle = (2 * Math.PI * index) / order.length - Math.PI / 2;
      return [ref, { x: size / 2 + Math.cos(angle) * (size / 2 - 40), y: size / 2 + Math.sin(angle) * (size / 2 - 40) }];
    }),
  );
  const tones = viewTones(step, view.id);
  const labels = new Map<string, string[]>();
  for (const pointer of view.pointers ?? []) {
    const held = step.state[pointer.var];
    if (!isRef(held) || !position.has(held.$ref)) continue;
    const label = pointer.label ?? (story ? displayName(story, pointer.var, language) : pointer.var);
    labels.set(held.$ref, [...(labels.get(held.$ref) ?? []), label]);
  }
  const nodes: NodeShape[] = order.map((ref) => ({
    id: keyId({ $ref: ref }),
    ...position.get(ref)!,
    text: text(ref),
    tones: tones.get(keyId({ $ref: ref })) ?? [],
    pointers: labels.get(ref) ?? [],
  }));
  const pairs = new Set<string>();
  for (const ref of order)
    for (const link of sequenceOf(heap[ref][field]) ?? []) if (isRef(link) && position.has(link.$ref)) pairs.add(`${ref}>${link.$ref}`);
  const edges: EdgeShape[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const [from, to] = pair.split('>');
    const id = view.directed ? pair : [from, to].sort().join('~');
    if (seen.has(id) || from === to) continue;
    seen.add(id);
    const a = position.get(from)!;
    const b = position.get(to)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const side = view.directed && pairs.has(`${to}>${from}`) ? 5 : 0;
    const end = view.directed ? R + 5 : R;
    edges.push({
      id,
      from: keyId({ $ref: from }),
      to: keyId({ $ref: to }),
      directed: !!view.directed,
      path: `M${a.x + ux * R - uy * side} ${a.y + uy * R + ux * side}L${b.x - ux * end - uy * side} ${b.y - uy * end + ux * side}`,
    });
  }
  toneEdges(edges, nodes);
  return { missing: false, width: size, height: size, nodes, edges, nullPointers: [], nullAt: null };
}

/**
 * Graph edges carry no marks of their own: an edge takes its tone from the marks the checker
 * already proves on its two ends, so it can never drift from the nodes.
 * - from an `active` node to a `compare` or `new` node: that tone (the edge being followed);
 * - both ends `found`: `found` (an answer path or a finished component);
 * - `done`: a directed edge whose source is done (already followed), an undirected edge whose
 *   ends are both done.
 * Undirected edges are checked both ways round.
 */
export function graphEdgeTone(from: StoryTone[], to: StoryTone[], directed: boolean): StoryTone | undefined {
  const followed = (a: StoryTone[], b: StoryTone[]) =>
    a.includes('active') ? (b.includes('new') ? 'new' : b.includes('compare') ? 'compare' : undefined) : undefined;
  const live = followed(from, to) ?? (directed ? undefined : followed(to, from));
  if (live) return live;
  if (from.includes('found') && to.includes('found')) return 'found';
  if (from.includes('done') && (directed || to.includes('done'))) return 'done';
  return undefined;
}
function toneEdges(edges: EdgeShape[], nodes: NodeShape[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node.tones]));
  for (const edge of edges) {
    const tone = graphEdgeTone(byId.get(edge.from) ?? [], byId.get(edge.to) ?? [], edge.directed);
    if (tone) edge.tone = tone;
  }
}

/**
 * Grid as a graph (`gridNodes`): the cells holding a listed value are nodes "row,col" in grid
 * position, joined to the up/down/left/right cells that are nodes too.
 */
function gridGraphModel(view: StoryView, value: StoryValue | undefined, step: StoryStep): NodeDiagram {
  const rows = (sequenceOf(value) ?? []).map((row) => gridRow(row) ?? []);
  const wanted = new Set((view.gridNodes ?? []).map((item) => keyId(item)));
  const isNode = (r: number, c: number) =>
    r >= 0 && r < rows.length && c >= 0 && c < rows[r].length && wanted.has(keyId(rows[r][c]));
  if (!rows.length)
    return { missing: true, width: 0, height: 0, nodes: [], edges: [], nullPointers: [], nullAt: null };
  const gap = 70;
  const pad = 34;
  const tones = viewTones(step, view.id);
  const nodes: NodeShape[] = [];
  const edges: EdgeShape[] = [];
  rows.forEach((row, r) =>
    row.forEach((_, c) => {
      if (!isNode(r, c)) return;
      const id = keyId(`${r},${c}`);
      nodes.push({ id, x: pad + c * gap, y: pad + r * gap, text: `${r},${c}`, tones: tones.get(id) ?? [], pointers: [] });
      if (isNode(r, c + 1))
        edges.push({ id: `${id}~r`, from: id, to: keyId(`${r},${c + 1}`), directed: false, path: `M${pad + c * gap + R} ${pad + r * gap}h${gap - 2 * R}` });
      if (isNode(r + 1, c))
        edges.push({ id: `${id}~d`, from: id, to: keyId(`${r + 1},${c}`), directed: false, path: `M${pad + c * gap} ${pad + r * gap + R}v${gap - 2 * R}` });
    }),
  );
  toneEdges(edges, nodes);
  const columns = Math.max(1, ...rows.map((row) => row.length));
  return {
    missing: false,
    width: 2 * pad + (columns - 1) * gap,
    height: 2 * pad + (rows.length - 1) * gap,
    nodes,
    edges,
    nullPointers: [],
    nullAt: null,
  };
}

/**
 * Graph from an adjacency map ({node: [neighbors]}) or adjacency list ([[neighbors], ...]).
 * `pointers` label the node whose key a local holds (`course`, `node`), renamed per language
 * when `story` is given.
 */
export function graphModel(
  view: StoryView,
  step: StoryStep,
  language: PatternLanguage,
  story?: DsaStoryV1,
): NodeDiagram {
  step = shownStep(step);
  if (view.neighbors) return objectGraphModel(view, step, language, story);
  const value = frameValue(view, step);
  if (view.gridNodes) return gridGraphModel(view, value, step);
  const map = entriesOf(value);
  const list = sequenceOf(value);
  const adjacency: [StoryValue, StoryValue[]][] = map
    ? map.map(([key, neighbors]) => [key, sequenceOf(neighbors ?? null) ?? entriesOf(neighbors ?? null)?.map(([k]) => k) ?? []])
    : list
      ? list.map((neighbors, index) => [index, sequenceOf(neighbors) ?? []])
      : [];
  if (!adjacency.length)
    return { missing: true, width: 0, height: 0, nodes: [], edges: [], nullPointers: [], nullAt: null };
  const keys = new Map<string, StoryValue>();
  for (const [key, neighbors] of adjacency) {
    keys.set(keyId(key), key);
    for (const neighbor of neighbors) keys.set(keyId(neighbor), neighbor);
  }
  const ids = [...keys.keys()];
  const size = 320;
  const place = (id: string, index: number) => {
    const raw = keys.get(id)!;
    const fixed = view.layout?.[typeof raw === 'string' ? raw : JSON.stringify(raw)];
    if (fixed) return { x: 30 + (fixed[0] / 100) * (size - 60), y: 30 + (fixed[1] / 100) * (size - 60) };
    const angle = (2 * Math.PI * index) / ids.length - Math.PI / 2;
    return { x: size / 2 + Math.cos(angle) * (size / 2 - 36), y: size / 2 + Math.sin(angle) * (size / 2 - 36) };
  };
  const position = new Map(ids.map((id, index) => [id, place(id, index)]));
  const tones = viewTones(step, view.id);
  const labels = new Map<string, string[]>();
  for (const pointer of view.pointers ?? []) {
    const held = step.state[pointer.var];
    if (held === undefined || held === null || !keys.has(keyId(held))) continue;
    const label = pointer.label ?? (story ? displayName(story, pointer.var, language) : pointer.var);
    labels.set(keyId(held), [...(labels.get(keyId(held)) ?? []), label]);
  }
  const nodes: NodeShape[] = ids.map((id) => ({
    id,
    ...position.get(id)!,
    text: formatValue(keys.get(id)!, language, {}, 6),
    tones: tones.get(id) ?? [],
    pointers: labels.get(id) ?? [],
  }));
  const edges: EdgeShape[] = [];
  const seen = new Set<string>();
  for (const [key, neighbors] of adjacency) {
    for (const neighbor of neighbors) {
      const from = keyId(key);
      const to = keyId(neighbor);
      const id = view.directed ? `${from}>${to}` : [from, to].sort().join('~');
      if (seen.has(id) || from === to) continue;
      seen.add(id);
      const a = position.get(from)!;
      const b = position.get(to)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      const end = view.directed ? R + 5 : R;
      edges.push({
        id,
        from,
        to,
        directed: !!view.directed,
        path: `M${a.x + ux * R} ${a.y + uy * R}L${b.x - ux * end} ${b.y - uy * end}`,
      });
    }
  }
  toneEdges(edges, nodes);
  return { missing: false, width: size, height: size, nodes, edges, nullPointers: [], nullAt: null };
}

/**
 * A view whose local is missing now but was drawn on an earlier step: its call has returned
 * (a constructor's argument list once the object is built), so the page says "no longer in
 * scope" instead of "not created yet".
 */
export function outOfScope(view: StoryView, story: DsaStoryV1, index: number): boolean {
  if (!view.var) return false;
  const has = (step: StoryStep) => frameValue(view, shownStep(step)) !== undefined;
  return !has(story.steps[index]) && story.steps.slice(0, index).some(has);
}

// ------------------------------------------------------------------ text alternative per view
const TONE_WORDS: Record<StoryTone, string> = {
  active: 'current',
  compare: 'being compared',
  found: 'found',
  done: 'done',
  dim: 'ruled out',
  new: 'just added',
  miss: 'looked up, not present',
};
function toneSummary(items: { label: string; tones: StoryTone[] }[]): string {
  const parts: string[] = [];
  for (const tone of STORY_TONES) {
    const hits = items.filter((item) => item.tones.includes(tone)).map((item) => item.label);
    if (hits.length) parts.push(`${TONE_WORDS[tone]}: ${hits.join(', ')}`);
  }
  return parts.length ? ` ${parts.join('; ')}.` : '';
}
/** One sentence a screen reader hears instead of the drawing. */
export function viewSummary(
  view: StoryView,
  story: DsaStoryV1,
  index: number,
  language: PatternLanguage,
): string {
  const step = shownStep(story.steps[index]);
  switch (view.kind) {
    case 'array':
    case 'string':
    case 'number-line':
    case 'bits':
    case 'stack':
    case 'queue': {
      const model = sequenceModel(view, step, language);
      if (model.missing) return `${view.title}: ${outOfScope(view, story, index) ? 'no longer in scope' : 'not created yet'}.`;
      const order =
        view.kind === 'stack'
          ? ' (bottom to top)'
          : view.kind === 'queue'
            ? ' (front to back)'
            : view.kind === 'bits'
              ? ' (highest bit first)'
              : model.note
                ? ` (${model.note}, cells in use)`
                : '';
      const unit = view.kind === 'bits' ? 'bit' : view.kind === 'number-line' ? 'at' : 'index';
      const pointers = model.pointers
        .map((pointer) => `${pointer.label} ${pointer.past ? 'at the end' : `${unit === 'at' ? 'at' : `at ${unit}`} ${pointer.index}`}`)
        .join(', ');
      const cells = model.cells.map((cell) =>
        cell.gap ? `${cell.gap} more cells` : view.kind === 'string' ? cell.text : view.window ? `[${cell.index}] ${cell.text}` : cell.text,
      );
      const value = view.kind === 'bits' ? ` ${model.note}` : '';
      return `${view.title}${order}: ${cells.join(view.kind === 'string' ? '' : ', ') || 'empty'}${value}.${pointers ? ` ${pointers}.` : ''}${toneSummary(model.cells.filter((cell) => !cell.gap).map((cell) => ({ label: `${unit === 'at' ? '' : `${unit} `}${cell.index}`, tones: cell.tones })))}`;
    }
    case 'map':
    case 'set': {
      const model = mapModel(view, step, language);
      if (model.missing) return `${view.title}: ${outOfScope(view, story, index) ? 'no longer in scope' : 'not created yet'}.`;
      const entries = model.entries.map((entry) => (entry.value === null ? entry.key : `${entry.key} → ${entry.value}`));
      return `${view.title}: ${entries.join(', ') || 'empty'}.${toneSummary(model.entries.map((entry) => ({ label: entry.key, tones: entry.tones })))}${model.misses.length ? ` Looked up ${model.misses.join(', ')}: not present.` : ''}`;
    }
    case 'grid': {
      const model = gridModel(view, step, language);
      if (model.missing) return `${view.title}: ${outOfScope(view, story, index) ? 'no longer in scope' : 'not created yet'}.`;
      const cells = model.rows.flat();
      return `${view.title}: ${model.rows.length} rows.${model.cursor ? ` Cursor at row ${model.cursor[0]}, column ${model.cursor[1]}.` : ''}${toneSummary(cells.map((cell) => ({ label: `(${cell.key})`, tones: cell.tones })))}`;
    }
    case 'calls': {
      const model = callsModel(view, step, language, callTimeline(story)[index]);
      const ending = model.frames
        .filter((frame) => frame.returns !== null)
        .reverse()
        .map((frame) => `${frame.label} returns ${frame.returns}`);
      return `${view.title}, bottom to top: ${model.frames.map((frame) => frame.label).join(', ')}.${ending.length ? ` Then ${ending.join(', then ')}.` : ''}`;
    }
    default: {
      const model =
        view.kind === 'tree'
          ? treeModel(view, step, language, { story, index })
          : view.kind === 'trie'
            ? trieModel(view, step, language, story)
            : view.kind === 'graph'
              ? graphModel(view, step, language, story)
              : linkedListModel(view, story, index, language);
      if (model.missing) return `${view.title}: empty.`;
      const pointers = model.nodes
        .filter((node) => node.pointers.length)
        .map((node) => `${node.pointers.join(' and ')} at ${node.text}`);
      if (model.nullPointers.length) pointers.push(`${model.nullPointers.join(' and ')} at null`);
      for (const node of model.nodes) if (node.badge) pointers.push(`${node.text} returned ${node.badge}`);
      const ends = model.nodes.filter((node) => node.end).map((node) => node.text);
      if (ends.length) pointers.push(`a word ends at ${ends.join(', ')}`);
      const text = new Map(model.nodes.map((node) => [node.id, node.text]));
      const edges = model.edges
        .filter((edge) => edge.tone)
        .map((edge) => ({
          label: `edge ${text.get(edge.from)} ${edge.directed ? '→' : '–'} ${text.get(edge.to)}`,
          tones: [edge.tone!],
        }));
      return `${view.title}: ${model.nodes.length} nodes (${model.nodes.map((node) => node.text).join(', ')}).${pointers.length ? ` ${pointers.join('; ')}.` : ''}${toneSummary(model.nodes.map((node) => ({ label: node.text, tones: node.tones })))}${edges.length ? toneSummary(edges) : ''}`;
    }
  }
}
