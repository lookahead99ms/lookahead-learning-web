import type {
  GuidedTraceEvent,
  GuidedTraceVariable,
  PatternLanguage,
  PatternProblemV1,
} from '../../content/content.models';
import type { TraceSnapshot } from './trace-model';

/**
 * Derives a drawable picture of guided-trace/v1 state for the guided debugger.
 *
 * Everything here is read from the published trace of the selected language:
 * recorded variable values, the executed source line and the next executed
 * line. Nothing is inferred from a problem ID. When the state cannot be drawn
 * faithfully (maps, trees, matrices, lists whose links change, ambiguous node
 * identity) the plan is `none` and the existing HTML state view is used.
 */

export type CellTone = 'outside' | 'compare' | 'found' | 'changed' | null;

export interface VisualCell {
  value: string;
  tone: CellTone;
}

export interface VisualPointer {
  name: string;
  /** Cell or node index, or null when the pointer is unassigned, null or off the structure. */
  index: number | null;
  /** Fixed lane so a pointer only ever slides horizontally: 0 above, 1 below, 2 above, 3 below. */
  lane: number;
}

export interface ArrayVisual {
  name: string;
  cells: VisualCell[];
  pointers: VisualPointer[];
  cellWidth: number;
  /** The recorded value is not assigned at this instruction. */
  pending: boolean;
}

export interface ListVisual {
  nodes: VisualCell[];
  cycleTo: number | null;
  pointers: VisualPointer[];
}

export type TraceVisual =
  | { kind: 'array'; arrays: ArrayVisual[]; label: string }
  | { kind: 'list'; list: ListVisual; label: string }
  | { kind: 'none' };

export type VisualPlanKind = 'array' | 'list' | 'none';

interface ArrayPlan {
  kind: 'array';
  arrays: { name: string; pointers: string[]; range: [string, string] | null }[];
}

interface ListPlan {
  kind: 'list';
  values: string[];
  cycleTo: number | null;
  pointers: string[];
  /** Per executed step, the recorded node position of each node variable. */
  positions: Map<string, ListPosition>[];
}

type ListPosition = number | 'null' | 'ambiguous';

type VisualPlan = ArrayPlan | ListPlan | { kind: 'none'; reason: string };

const PLACEHOLDER = /^(—|-|undefined|<unavailable>)?$/;
const POINTER_NAMES = new Set([
  'left',
  'right',
  'lo',
  'hi',
  'low',
  'high',
  'mid',
  'i',
  'j',
  'start',
  'end',
  'slow',
  'fast',
  'l',
  'r',
  'read',
  'write',
  'idx',
  'pos',
]);
const RANGE_PAIRS: [string, string][] = [
  ['left', 'right'],
  ['lo', 'hi'],
  ['low', 'high'],
  ['l', 'r'],
];
const MAX_ARRAY_CELLS = 40;
const MAX_CELL_TEXT = 10;
const MAX_LIST_NODES = 12;
const MAX_POINTERS = 4;
const LIST_ARGUMENTS = ['head', 'values', 'nodes', 'list', 'vals'];
const CYCLE_ARGUMENTS = ['cycleIndex', 'pos', 'cyclePosition'];

const planCache = new WeakMap<object, Map<string, VisualPlan>>();

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isPrimitive(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function displayPrimitive(value: unknown): string {
  return value === null ? 'null' : String(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nodeValue(record: Record<string, unknown>): unknown {
  for (const key of ['value', 'val', 'Value', 'Val', 'data', 'Data']) {
    if (key in record) return record[key];
  }
  return undefined;
}

function isListNodeObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    (keys.includes('next') || keys.includes('Next')) &&
    !keys.some((key) => ['left', 'right', 'Left', 'Right', 'children'].includes(key))
  );
}

function isTreeNodeObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.some((key) => ['left', 'right', 'Left', 'Right', 'children'].includes(key));
}

/** A recorded list-node serialization: values in walk order and how the walk ended. */
interface NodeWalk {
  values: string[];
  end: 'null' | 'cycle' | 'truncated';
}

function nodeWalk(raw: string): NodeWalk | 'null' | undefined {
  if (raw === 'null' || raw === 'None' || raw === 'nil' || raw === '<nil>') return 'null';
  const parsed = parseJson(raw);
  if (parsed === null) return 'null';
  if (Array.isArray(parsed)) {
    // Python-style serialization: values, optionally followed by a "cycle" marker.
    const cycle = parsed.at(-1) === 'cycle';
    const values = cycle ? parsed.slice(0, -1) : parsed;
    if (!values.length || !values.every(isPrimitive)) return undefined;
    return { values: values.map(displayPrimitive), end: cycle ? 'cycle' : 'null' };
  }
  if (!isListNodeObject(parsed)) return undefined;
  const values: string[] = [];
  let current: unknown = parsed;
  for (let depth = 0; depth < 64; depth++) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    const record = current as Record<string, unknown>;
    const value = nodeValue(record);
    if (!isPrimitive(value)) return undefined;
    values.push(displayPrimitive(value));
    const next = 'next' in record ? record['next'] : record['Next'];
    if (next === null || next === undefined) return { values, end: 'null' };
    if (typeof next === 'string')
      return { values, end: next === '<cycle>' ? 'cycle' : 'truncated' };
    current = next;
  }
  return undefined;
}

function walkMatches(
  values: string[],
  cycleTo: number | null,
  start: number,
  walk: NodeWalk,
): boolean {
  const seen = new Set<number>();
  let position: number | null = start;
  for (const value of walk.values) {
    if (position === null || seen.has(position) || values[position] !== value) return false;
    seen.add(position);
    position = position + 1 < values.length ? position + 1 : cycleTo;
  }
  if (walk.end === 'null') return position === null;
  if (walk.end === 'cycle') return position !== null && seen.has(position);
  return true;
}

function resolveNode(
  values: string[],
  cycleTo: number | null,
  raw: string,
): ListPosition | undefined | false {
  if (PLACEHOLDER.test(raw)) return undefined;
  const walk = nodeWalk(raw);
  if (walk === 'null') return 'null';
  if (!walk) return false;
  const matches = values
    .map((_, index) => index)
    .filter((index) => walkMatches(values, cycleTo, index, walk));
  if (!matches.length) return false;
  return matches.length === 1 ? matches[0] : 'ambiguous';
}

function sourceLines(problem: PatternProblemV1, language: PatternLanguage) {
  return problem.implementations.find((item) => item.language === language)?.lines ?? [];
}

function indexedBy(source: string, array: string, name: string): boolean {
  const a = escapeRegExp(array);
  const n = escapeRegExp(name);
  return new RegExp(
    `\\b${a}\\s*\\[\\s*(?:\\+\\+|--)?${n}(?:\\+\\+|--)?\\s*\\]|\\b${a}\\.(?:charAt|get)\\(\\s*${n}\\s*\\)`,
  ).test(source);
}

function isIndexed(source: string, array: string): boolean {
  const a = escapeRegExp(array);
  return new RegExp(`\\b${a}\\s*\\[\\s*[A-Za-z_]|\\b${a}\\.(?:charAt|get)\\(`).test(source);
}

/** Cells of a recorded 1-D array or string, or null when the value is not one. */
export function recordedCells(
  variable: Pick<GuidedTraceVariable, 'type' | 'value'>,
): string[] | null {
  if (PLACEHOLDER.test(variable.value)) return null;
  const parsed = parseJson(variable.value);
  if (typeof parsed === 'string' && variable.type === 'string') return [...parsed];
  if (Array.isArray(parsed) && parsed.every(isPrimitive)) return parsed.map(displayPrimitive);
  // Java char[] values are recorded without quotes, e.g. [h,E,l,l,O].
  const bare = parsed === undefined ? /^\[([^[\]{}"]*)\]$/.exec(variable.value) : null;
  if (bare) {
    const cells = bare[1] === '' ? [] : bare[1].split(',');
    if (cells.every((cell) => cell.length === 1)) return cells;
  }
  return null;
}

function fixtureArguments(fixture: unknown): Record<string, unknown> {
  const record = (fixture as { arguments?: Record<string, unknown> } | null)?.arguments;
  return record && typeof record === 'object' ? record : {};
}

function buildPlan(
  problem: PatternProblemV1,
  fixture: unknown,
  events: GuidedTraceEvent[],
  language: PatternLanguage,
): VisualPlan {
  const args = fixtureArguments(fixture);
  const source = sourceLines(problem, language)
    .map((line) => line.text)
    .join('\n');
  const byName = new Map<string, GuidedTraceVariable[]>();
  for (const event of events) {
    for (const variable of event.variables) {
      const list = byName.get(variable.name) ?? [];
      list.push(variable);
      byName.set(variable.name, list);
    }
  }
  const parsedValues = (name: string) =>
    (byName.get(name) ?? [])
      .filter((variable) => !PLACEHOLDER.test(variable.value))
      .map((variable) => parseJson(variable.value));

  // Trees, graphs of objects and nested input structures are not drawn.
  for (const [name] of byName) {
    if (parsedValues(name).some((value) => isTreeNodeObject(value))) {
      return { kind: 'none', reason: 'tree' };
    }
    if (
      parsedValues(name).some(
        (value) => Array.isArray(value) && value.some((item) => isTreeNodeObject(item)),
      )
    ) {
      return { kind: 'none', reason: 'tree' };
    }
  }
  for (const value of Object.values(args)) {
    if (Array.isArray(value) && value.some((item) => !isPrimitive(item))) {
      return { kind: 'none', reason: 'nested-input' };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { kind: 'none', reason: 'object-input' };
    }
  }

  const nodeNames = [...byName.keys()].filter((name) =>
    (byName.get(name) ?? []).some((variable) => isListNodeObject(parseJson(variable.value))),
  );
  if (nodeNames.length) return listPlan(args, events, source, nodeNames);
  // Python records list nodes as arrays; detect them from the other recorded languages.
  const otherNodeNames = new Set<string>();
  for (const trace of [problem.trace, ...(problem.fixtureTraces ?? [])]) {
    for (const path of Object.values(trace.languagePaths ?? {})) {
      for (const step of path) {
        for (const variable of step.variables ?? []) {
          if (isListNodeObject(parseJson(variable.value))) otherNodeNames.add(variable.name);
        }
      }
    }
  }
  const pythonNodeNames = [...byName.keys()].filter((name) => otherNodeNames.has(name));
  if (pythonNodeNames.length) {
    return listPlan(args, events, source, pythonNodeNames);
  }
  return arrayPlan(args, source, byName);
}

function arrayPlan(
  args: Record<string, unknown>,
  source: string,
  byName: Map<string, GuidedTraceVariable[]>,
): VisualPlan {
  const candidates: string[] = [];
  const argNames = Object.keys(args);
  const order = [
    ...argNames.filter((name) => byName.has(name)),
    ...[...byName.keys()].filter((name) => !argNames.includes(name)),
  ];
  for (const name of order) {
    const recorded = byName.get(name) ?? [];
    if (recorded.some((variable) => ['map', 'set', 'object'].includes(variable.type))) continue;
    const values = recorded.filter((variable) => !PLACEHOLDER.test(variable.value));
    if (!values.length) continue;
    const cells = values.map((variable) => recordedCells(variable));
    if (cells.some((item) => item === null)) continue;
    const longest = Math.max(...cells.map((item) => item!.length));
    const widest = Math.max(0, ...cells.flatMap((item) => item!.map((cell) => cell.length)));
    if (longest > MAX_ARRAY_CELLS || widest > MAX_CELL_TEXT) continue;
    const isArgument = argNames.includes(name);
    if (!isArgument && !isIndexed(source, name)) continue;
    if (!isArgument && longest < 2) continue;
    candidates.push(name);
  }
  if (!candidates.length) return { kind: 'none', reason: 'no-array' };
  const integers = [...byName.keys()].filter((name) =>
    (byName.get(name) ?? []).every((variable) => variable.type === 'integer'),
  );
  const assigned = new Map<string, string[]>(candidates.map((name) => [name, []]));
  const firstUse = (name: string) => {
    const match = new RegExp(`\\b${escapeRegExp(name)}\\b`).exec(source);
    return match ? match.index : Number.MAX_SAFE_INTEGER;
  };
  const ordered = [...integers].sort((a, b) => firstUse(a) - firstUse(b));
  for (const name of ordered) {
    const target =
      candidates.find((array) => indexedBy(source, array, name)) ??
      (POINTER_NAMES.has(name) && firstUse(name) !== Number.MAX_SAFE_INTEGER
        ? candidates[0]
        : undefined);
    if (!target) continue;
    const pointers = assigned.get(target)!;
    if (pointers.length < MAX_POINTERS) pointers.push(name);
  }
  // Prefer arrays a pointer moves over, then inputs; at most three rows.
  const shown = [...candidates]
    .sort((a, b) => Number(!assigned.get(a)!.length) - Number(!assigned.get(b)!.length))
    .slice(0, 3)
    .sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b));
  return {
    kind: 'array',
    arrays: shown.map((name) => {
      const pointers = assigned.get(name)!;
      const range =
        RANGE_PAIRS.find(([low, high]) => pointers.includes(low) && pointers.includes(high)) ??
        null;
      return { name, pointers, range };
    }),
  };
}

function listPlan(
  args: Record<string, unknown>,
  events: GuidedTraceEvent[],
  source: string,
  nodeNames: string[],
): VisualPlan {
  const lists = Object.entries(args).filter(
    ([, value]) => Array.isArray(value) && value.every(isPrimitive),
  );
  const chosen = lists.find(([name]) => LIST_ARGUMENTS.includes(name));
  if (lists.length !== 1 || !chosen) return { kind: 'none', reason: 'list-input' };
  const values = (chosen[1] as unknown[]).map(displayPrimitive);
  if (!values.length || values.length > MAX_LIST_NODES) {
    return { kind: 'none', reason: 'list-size' };
  }
  const cycleArgument = CYCLE_ARGUMENTS.map((name) => args[name]).find(
    (value) => typeof value === 'number',
  ) as number | undefined;
  const cycleTo =
    cycleArgument !== undefined && cycleArgument >= 0 && cycleArgument < values.length
      ? cycleArgument
      : null;
  const pointers = [...nodeNames]
    .sort((a, b) => {
      const at = (name: string) => {
        const match = new RegExp(`\\b${escapeRegExp(name)}\\b`).exec(source);
        return match ? match.index : Number.MAX_SAFE_INTEGER;
      };
      return at(a) - at(b);
    })
    .slice(0, MAX_POINTERS);
  if (nodeNames.length > MAX_POINTERS) return { kind: 'none', reason: 'list-pointers' };
  const current = new Map<string, ListPosition>();
  const positions: Map<string, ListPosition>[] = [];
  for (const event of events) {
    if (event.stateUnavailable) current.clear();
    for (const variable of event.variables) {
      if (!nodeNames.includes(variable.name)) continue;
      const resolved = resolveNode(values, cycleTo, variable.value);
      // A node that is not on the input chain means the links changed: not drawable.
      if (resolved === false) return { kind: 'none', reason: 'list-mutates' };
      if (resolved === undefined) current.delete(variable.name);
      else current.set(variable.name, resolved);
    }
    positions.push(new Map(current));
  }
  return { kind: 'list', values, cycleTo, pointers, positions };
}

function planFor(
  problem: PatternProblemV1,
  fixture: unknown,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
): VisualPlan {
  const fixtureId = (fixture as { id?: string } | null)?.id ?? '';
  const key = `${fixtureId}|${language}|${snapshot.events.length}`;
  let byProblem = planCache.get(problem);
  if (!byProblem) {
    byProblem = new Map();
    planCache.set(problem, byProblem);
  }
  let plan = byProblem.get(key);
  if (!plan) {
    plan = snapshot.events.length
      ? buildPlan(problem, fixture, snapshot.events, language)
      : { kind: 'none', reason: 'no-trace' };
    byProblem.set(key, plan);
  }
  return plan;
}

/** Which drawing a trace receives; stable for every step of the selected trace. */
export function visualPlanKind(
  problem: PatternProblemV1,
  fixture: unknown,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
): VisualPlanKind {
  return planFor(problem, fixture, snapshot, language).kind;
}

export function visualPlanReason(
  problem: PatternProblemV1,
  fixture: unknown,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
): string {
  const plan = planFor(problem, fixture, snapshot, language);
  return plan.kind === 'none' ? plan.reason : plan.kind;
}

function integerValue(variables: Map<string, GuidedTraceVariable>, name: string): number | null {
  const raw = variables.get(name)?.value;
  if (raw === undefined || !/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

function activeLine(problem: PatternProblemV1, snapshot: TraceSnapshot, language: PatternLanguage) {
  const lines = sourceLines(problem, language);
  const anchor = snapshot.event?.sourceAnchor[language];
  const index = lines.findIndex((line) => line.id === anchor);
  return { index, text: index >= 0 ? lines[index].text : '' };
}

/** Index expressions read on the current line, e.g. values[left], s.charAt(i), nums[i + 1]. */
function readIndexes(
  line: string,
  array: string,
  variables: Map<string, GuidedTraceVariable>,
  changedNow: Set<string>,
): number[] {
  const a = escapeRegExp(array);
  const pattern = new RegExp(
    `\\b${a}\\s*\\[\\s*([A-Za-z_]\\w*|\\d+)\\s*(?:([+-])\\s*(\\d+))?\\s*\\]|\\b${a}\\.(?:charAt|get)\\(\\s*([A-Za-z_]\\w*|\\d+)\\s*(?:([+-])\\s*(\\d+))?\\s*\\)`,
    'g',
  );
  const found: number[] = [];
  for (const match of line.matchAll(pattern)) {
    const base = match[1] ?? match[4];
    const sign = match[2] ?? match[5];
    const offset = Number(match[3] ?? match[6] ?? 0);
    let value: number | null;
    if (/^\d+$/.test(base)) value = Number(base);
    else {
      // The snapshot is recorded after the line; an index changed by it is ambiguous.
      if (changedNow.has(base)) continue;
      value = integerValue(variables, base);
    }
    if (value === null) continue;
    found.push(sign === '-' ? value - offset : value + offset);
  }
  return found;
}

function variableMap(variables: GuidedTraceVariable[]): Map<string, GuidedTraceVariable> {
  return new Map(variables.map((variable) => [variable.name, variable]));
}

function changedNames(snapshot: TraceSnapshot, previous: TraceSnapshot | null): Set<string> {
  const before = variableMap(previous?.variables ?? []);
  return new Set(
    snapshot.variables
      .filter((variable) => before.get(variable.name)?.value !== variable.value)
      .map((variable) => variable.name),
  );
}

/** The drawable picture of one step, or `none` to keep the HTML state view. */
export function traceVisual(
  problem: PatternProblemV1,
  fixture: unknown,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
  previous: TraceSnapshot | null = null,
): TraceVisual {
  const plan = planFor(problem, fixture, snapshot, language);
  if (plan.kind === 'none' || !snapshot.event) return { kind: 'none' };
  const variables = variableMap(snapshot.variables);
  const changed = changedNames(snapshot, previous);
  const terminal = snapshot.event.result !== undefined;
  const line = activeLine(problem, snapshot, language).text;
  if (plan.kind === 'list') {
    const at = plan.positions[snapshot.step] ?? new Map<string, ListPosition>();
    const pointers = plan.pointers.map((name, lane) => {
      const position = at.get(name);
      return { name, lane, index: typeof position === 'number' ? position : null };
    });
    const nodes: VisualCell[] = plan.values.map((value) => ({ value, tone: null }));
    const compared = plan.pointers.filter(
      (name) =>
        new RegExp(`\\b${escapeRegExp(name)}\\b`).test(line) &&
        /\b(if|while|for|elif)\b/.test(line) &&
        !changed.has(name),
    );
    for (const pointer of pointers) {
      if (pointer.index === null) continue;
      if (terminal) nodes[pointer.index].tone = 'found';
      else if (compared.includes(pointer.name)) nodes[pointer.index].tone = 'compare';
    }
    const list: ListVisual = { nodes, cycleTo: plan.cycleTo, pointers };
    return { kind: 'list', list, label: listLabel(list, at) };
  }
  const previousVariables = variableMap(previous?.variables ?? []);
  const arrays = plan.arrays.map(({ name, pointers: names, range }) => {
    const variable = variables.get(name);
    const cells = variable ? recordedCells(variable) : null;
    const values = cells ?? [];
    const before = previousVariables.get(name);
    const beforeCells = before ? recordedCells(before) : null;
    const pointers = names.map((pointer, lane) => {
      const value = integerValue(variables, pointer);
      return {
        name: pointer,
        lane,
        index: value !== null && value >= 0 && value < values.length ? value : null,
      };
    });
    const visualCells: VisualCell[] = values.map((value) => ({ value, tone: null }));
    if (range) {
      const low = integerValue(variables, range[0]);
      const high = integerValue(variables, range[1]);
      if (low !== null && high !== null) {
        visualCells.forEach((cell, index) => {
          if (index < Math.min(low, high) || index > Math.max(low, high)) cell.tone = 'outside';
        });
      }
    }
    if (beforeCells && beforeCells.length === values.length) {
      values.forEach((value, index) => {
        if (beforeCells[index] !== value) visualCells[index].tone = 'changed';
      });
    }
    for (const index of readIndexes(line, name, variables, changed)) {
      if (visualCells[index] && visualCells[index].tone !== 'changed') {
        visualCells[index].tone = 'compare';
      }
    }
    if (terminal) {
      for (const pointer of pointers) {
        if (pointer.index !== null) visualCells[pointer.index].tone = 'found';
      }
    }
    const widest = Math.max(1, ...values.map((value) => value.length));
    return {
      name,
      cells: visualCells,
      pointers,
      cellWidth: Math.max(48, widest * 13 + 18),
      pending: cells === null,
    } satisfies ArrayVisual;
  });
  return { kind: 'array', arrays, label: arrayLabel(arrays) };
}

function arrayLabel(arrays: ArrayVisual[]): string {
  return arrays
    .map((array) => {
      if (array.pending) return `${array.name} has no recorded value at this instruction.`;
      const values = array.cells.map((cell) => cell.value).join(', ');
      const pointers = array.pointers
        .map((pointer) =>
          pointer.index === null
            ? `${pointer.name} is not on a cell`
            : `${pointer.name} at index ${pointer.index} (${array.cells[pointer.index].value})`,
        )
        .join(', ');
      const compared = array.cells
        .map((cell, index) => (cell.tone === 'compare' ? index : -1))
        .filter((index) => index >= 0);
      const found = array.cells
        .map((cell, index) => (cell.tone === 'found' ? index : -1))
        .filter((index) => index >= 0);
      return [
        `Array ${array.name}: ${values || 'empty'}.`,
        pointers ? `${pointers}.` : '',
        compared.length ? `Reading index ${compared.join(' and ')}.` : '',
        found.length ? `Result at index ${found.join(' and ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    })
    .join(' ');
}

function listLabel(list: ListVisual, at: Map<string, ListPosition>): string {
  const chain = list.nodes.map((node) => node.value).join(' → ');
  const cycle =
    list.cycleTo === null
      ? 'The last node points to null.'
      : `The last node links back to ${list.nodes[list.cycleTo].value} (node ${list.cycleTo}).`;
  const pointers = list.pointers
    .map((pointer) => {
      const position = at.get(pointer.name);
      if (position === 'null') return `${pointer.name} is null`;
      if (position === 'ambiguous') return `${pointer.name} position not determined`;
      if (position === undefined) return `${pointer.name} not assigned`;
      return `${pointer.name} at node ${position} (${list.nodes[position].value})`;
    })
    .join(', ');
  return `Linked list ${chain}. ${cycle}${pointers ? ` ${pointers}.` : ''}`;
}

const CONDITION_KEYWORD = /^\s*(?:}\s*)?(if|while|elif|else\s+if|for)\b(.*)$/;

/** Splits a loop or branch header into its keyword and condition text. */
export function parseConditionHeader(
  text: string,
  language: PatternLanguage,
): { keyword: string; condition: string } | null {
  const match = CONDITION_KEYWORD.exec(text);
  if (!match) return null;
  let rest = match[2].trim();
  if (language === 'python') {
    if (!rest.endsWith(':')) return null;
    rest = rest.slice(0, -1).trim();
  } else if (rest.endsWith('{')) {
    rest = rest.slice(0, -1).trim();
  } else if (!rest.endsWith(')')) {
    return null;
  }
  if (rest.startsWith('(')) {
    let depth = 0;
    let close = -1;
    for (let index = 0; index < rest.length; index++) {
      if (rest[index] === '(') depth++;
      if (rest[index] === ')' && --depth === 0) {
        close = index;
        break;
      }
    }
    if (close === rest.length - 1) rest = rest.slice(1, -1).trim();
    else if (language === 'java') return null;
  }
  return rest ? { keyword: match[1].replace(/\s+/g, ' '), condition: rest } : null;
}

const SAFE_CALLS =
  /\b(len|abs|min|max|size|length|isEmpty|charAt|get|containsKey|contains|equals|peek|isDigit|isLetter|isLetterOrDigit|isalnum|isdigit|isalpha|lower|upper|toLowerCase|toUpperCase|Math\.abs|Math\.min|Math\.max)\s*\(/g;

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

/** The last line of the block opened by `index`, by indentation. */
function blockEnd(lines: { text: string }[], index: number): number {
  const indent = indentOf(lines[index].text);
  let end = index;
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    const text = lines[cursor].text;
    if (!text.trim()) continue;
    if (indentOf(text) <= indent) break;
    end = cursor;
  }
  return end;
}

function substitute(condition: string, variables: Map<string, GuidedTraceVariable>): string {
  let replaced = false;
  const reads = condition.replace(
    /\b([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*|\d+)\s*\]/g,
    (whole, array: string, index: string) => {
      const array_ = variables.get(array);
      const cells = array_ ? recordedCells(array_) : null;
      const at = /^\d+$/.test(index) ? Number(index) : integerValue(variables, index);
      if (!cells || at === null || at < 0 || at >= cells.length) return whole;
      replaced = true;
      return cells[at];
    },
  );
  const text = reads.replace(/(?<![.\w])([A-Za-z_]\w*)(?![\w(.[])/g, (name) => {
    const value = variables.get(name)?.value;
    if (value === undefined || !/^-?\d+(\.\d+)?$|^(true|false)$/.test(value)) return name;
    replaced = true;
    return value;
  });
  return replaced ? text : '';
}

function conditionNarration(
  problem: PatternProblemV1,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
  variables: Map<string, GuidedTraceVariable>,
): string | null {
  const lines = sourceLines(problem, language);
  const { index, text } = activeLine(problem, snapshot, language);
  const nextEvent = snapshot.events[snapshot.step + 1];
  if (index < 0 || !nextEvent) return null;
  const header = parseConditionHeader(text, language);
  if (!header) return null;
  const keyword = header.keyword;
  let condition = header.condition;
  if (condition.replace(SAFE_CALLS, '').match(/\w\s*\(/)) return null;
  const nextIndex = lines.findIndex((line) => line.id === nextEvent.sourceAnchor[language]);
  if (nextIndex < 0) return null;
  const end = blockEnd(lines, index);
  // Without calls in the condition, the next executed line is either in the body or not.
  const intoBody = nextIndex > index && nextIndex <= end;
  if (keyword === 'for') {
    if (/;/.test(condition)) condition = condition.split(';')[1]?.trim() ?? '';
    else if (language !== 'go' || /\brange\b|:=/.test(condition))
      return intoBody
        ? 'The loop runs its body for the next item.'
        : 'The loop has no more items, so it ends.';
    if (!condition) return null;
  }
  const values = substitute(condition, variables);
  const check = `Check ${condition}${values && values !== condition ? ` (${values})` : ''}`;
  const loop = keyword === 'while' || keyword === 'for';
  if (intoBody) return `${check}: true, so ${loop ? 'the loop body runs' : 'the if body runs'}.`;
  return `${check}: false, so ${loop ? 'the loop ends' : 'the if body is skipped'}.`;
}

function shortValue(value: string): string | null {
  return value.length <= 40 ? value : null;
}

function countWord(count: number): string {
  return ['zero', 'one', 'two', 'three', 'four'][count] ?? String(count);
}

function nameList(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function changeNarration(
  plan: VisualPlan,
  snapshot: TraceSnapshot,
  previous: TraceSnapshot | null,
  inputs: Set<string>,
): string[] {
  const before = variableMap(previous?.variables ?? []);
  const now = variableMap(snapshot.variables);
  const seenEarlier = new Set<string>();
  for (const event of snapshot.events.slice(0, snapshot.step)) {
    for (const variable of event.variables) {
      if (!PLACEHOLDER.test(variable.value)) seenEarlier.add(variable.name);
    }
  }
  const sentences: string[] = [];
  const outOfScope: string[] = [];
  const backInScope: string[] = [];
  const arrayOf = new Map<string, string>();
  if (plan.kind === 'array') {
    for (const array of plan.arrays) {
      for (const pointer of array.pointers) arrayOf.set(pointer, array.name);
    }
  }
  const returning = snapshot.variables.filter((variable) => {
    const old = before.get(variable.name)?.value;
    return (
      (old === undefined || PLACEHOLDER.test(old)) &&
      !PLACEHOLDER.test(variable.value) &&
      seenEarlier.has(variable.name)
    );
  });
  // Several locals reappearing together is a return to the caller's frame.
  if (returning.length > 1) backInScope.push(...returning.map((variable) => variable.name));
  for (const variable of snapshot.variables) {
    const old = before.get(variable.name)?.value;
    if (old === variable.value || variable.type === 'result') continue;
    const name = variable.name;
    const value = variable.value;
    const wasUnset = old === undefined || PLACEHOLDER.test(old);
    if (PLACEHOLDER.test(value)) {
      if (!wasUnset) outOfScope.push(name);
      continue;
    }
    // Inputs appearing for the first time are the arguments, not a change.
    if (wasUnset && inputs.has(name) && !seenEarlier.has(name)) continue;
    if (backInScope.includes(name)) continue;
    if (plan.kind === 'list' && plan.pointers.includes(name)) {
      const at = plan.positions[snapshot.step]?.get(name);
      const was = previous ? plan.positions[previous.step]?.get(name) : undefined;
      if (at === 'null') sentences.push(`${name} becomes null: it is past the last node.`);
      else if (typeof at === 'number') {
        const label = plan.values[at];
        const hops = typeof was === 'number' ? listHops(plan, was, at) : null;
        sentences.push(
          typeof was !== 'number'
            ? `${name} points at node ${label}.`
            : hops === null
              ? `${name} moves to node ${label}.`
              : `${name} moves ${countWord(hops)} ${hops === 1 ? 'node' : 'nodes'}, onto ${label}${crossesCycle(plan, was, hops) ? ', following the cycle link back' : ''}.`,
        );
      } else sentences.push(`${name} changes.`);
      continue;
    }
    const array = arrayOf.get(name);
    if (array && /^-?\d+$/.test(value)) {
      const cellsVariable = now.get(array);
      const cells = cellsVariable ? recordedCells(cellsVariable) : null;
      const index = Number(value);
      const onto =
        cells && index >= 0 && index < cells.length
          ? `, onto ${cells[index]}`
          : cells && index >= cells.length
            ? `, past the end of ${array}`
            : '';
      sentences.push(
        wasUnset
          ? `${name} starts at index ${value}${onto}.`
          : `${name} moves from ${old} to ${value}${onto}.`,
      );
      continue;
    }
    const newCells = recordedCells(variable);
    const oldCells = !wasUnset ? recordedCells({ type: variable.type, value: old! }) : null;
    if (newCells && oldCells && newCells.length === oldCells.length) {
      const diffs = newCells
        .map((cell, index) => (cell !== oldCells[index] ? index : -1))
        .filter((index) => index >= 0);
      if (diffs.length && diffs.length <= 2) {
        sentences.push(
          diffs
            .map(
              (index) => `${name}[${index}] changes from ${oldCells[index]} to ${newCells[index]}.`,
            )
            .join(' '),
        );
        continue;
      }
    }
    const shown = shortValue(value);
    if (wasUnset) {
      sentences.push(shown ? `${name} is set to ${shown}.` : `${name} is set (see Variables).`);
    } else {
      const oldShown = shortValue(old!);
      sentences.push(
        shown && oldShown
          ? `${name} changes from ${oldShown} to ${shown}.`
          : `${name} is updated (see Variables).`,
      );
    }
  }
  if (sentences.length > 3) {
    const extra = sentences.length - 3;
    sentences.splice(
      3,
      extra,
      `${extra} more ${extra === 1 ? 'value changes' : 'values change'} (see Variables).`,
    );
  }
  // A single local leaving scope is noise; several at once is a call or return.
  if (outOfScope.length > 1) {
    sentences.push(
      `${nameList(outOfScope.slice(0, 4))}${outOfScope.length > 4 ? ' and others' : ''} are out of scope here.`,
    );
  }
  if (backInScope.length) {
    const shown = backInScope.slice(0, 4).map((name) => {
      const value = now.get(name)!.value;
      return shortValue(value) && value.length <= 12 ? `${name} = ${value}` : name;
    });
    sentences.push(
      `${nameList(shown)}${backInScope.length > 4 ? ' and others' : ''} ${backInScope.length === 1 ? 'is' : 'are'} back in scope.`,
    );
  }
  return sentences;
}

function listHops(plan: ListPlan, from: number, to: number): number | null {
  let position: number | null = from;
  for (let hops = 0; hops <= plan.values.length; hops++) {
    if (position === to) return hops;
    if (position === null) return null;
    position = position + 1 < plan.values.length ? position + 1 : plan.cycleTo;
  }
  return null;
}

function crossesCycle(plan: ListPlan, from: number, hops: number): boolean {
  let position = from;
  for (let step = 0; step < hops; step++) {
    if (position === plan.values.length - 1) return true;
    position++;
  }
  return false;
}

export interface StepNarration {
  /** "Line 4: total = values[left] + values[right]" */
  line: string;
  /** Plain-English description; the trace's own text when nothing specific is known. */
  text: string;
  /** True when `text` was generated from the recorded state. */
  generated: boolean;
}

/** A plain-English line for one step, generated from recorded state and control flow. */
export function stepNarration(
  problem: PatternProblemV1,
  fixture: unknown,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
  previous: TraceSnapshot | null = null,
): StepNarration | null {
  const event = snapshot.event;
  if (!event) return null;
  const { index, text } = activeLine(problem, snapshot, language);
  const line = index >= 0 ? `Line ${index + 1}: ${text.trim()}` : event.label;
  const plan = planFor(problem, fixture, snapshot, language);
  const variables = variableMap(snapshot.variables);
  const parts: string[] = [];
  if (!snapshot.unavailable) {
    if (snapshot.step === 0 && plan.kind === 'list') {
      const chain = plan.values.join(' → ');
      parts.push(
        plan.cycleTo === null
          ? `The list is ${chain}.`
          : `The list is ${chain}, and ${plan.values.at(-1)} links back to ${plan.values[plan.cycleTo]}.`,
      );
    }
    parts.push(
      ...changeNarration(plan, snapshot, previous, new Set(Object.keys(fixtureArguments(fixture)))),
    );
    const condition = conditionNarration(problem, snapshot, language, variables);
    if (condition) parts.push(condition);
  }
  if (event.result !== undefined) parts.push(`Returns ${event.result}.`);
  if (!parts.length) return { line, text: event.what, generated: false };
  return { line, text: parts.join(' '), generated: true };
}
