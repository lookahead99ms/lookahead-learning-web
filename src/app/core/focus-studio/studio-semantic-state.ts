import type {
  PatternLanguage,
  PatternProblemV1,
  GuidedTraceVariable,
  DsaProblemV2,
} from '../../content/content.models';
import type { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { parseRecordedValue, recordedMapEntries } from './studio-state-view';

export type StateStructureKind =
  | 'queue'
  | 'stack'
  | 'heap'
  | 'priority-queue'
  | 'matrix'
  | 'intervals'
  | 'map'
  | 'set'
  | 'node'
  | 'sequence'
  | 'bits'
  | 'scalar'
  | 'opaque'
  | 'adjacency'
  | 'parents'
  | 'queue-storage'
  | 'stack-storage';
export interface StateStructure {
  name: string;
  kind: StateStructureKind;
  label: string;
  value: unknown;
  raw: string;
  changed: boolean;
  markers: Array<{ name: string; index: number }>;
  note: string;
  topIndex?: number;
  matrixMarkers: Array<{ row: number; column: number; label: string }>;
}

const labels: Record<StateStructureKind, string> = {
  queue: 'FIFO queue / frontier',
  stack: 'LIFO stack',
  heap: 'Heap array',
  'priority-queue': 'Priority queue entries',
  matrix: 'Indexed table',
  intervals: 'Recorded ranges',
  map: 'Key / value entries',
  set: 'Membership',
  node: 'Recorded node links',
  sequence: 'Indexed sequence',
  bits: 'Binary representation',
  scalar: 'Value',
  opaque: 'Recorded reference',
  adjacency: 'Recorded adjacency',
  parents: 'Recorded parent links',
  'queue-storage': 'Indexed queue storage',
  'stack-storage': 'Indexed stack storage',
};

function identifier(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The catalog placement is context, not proof of a runtime data structure. */
export function semanticState(
  problem: PatternProblemV1,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
): StateStructure[] {
  if (snapshot.unavailable) return [];
  const source =
    problem.implementations
      .find((item) => item.language === language)
      ?.lines.map((line) => line.text)
      .join('\n') ?? '';
  const family = (problem as DsaProblemV2).navigation?.handsOnPatternId ?? '';
  const context = [problem.id, problem.variation, family].join(' ');
  return snapshot.variables
    .filter((variable) => !isRuntimeSupport(variable))
    .map((variable) => {
      const name = variable.name;
      const escaped = identifier(name);
      const value = parseRecordedValue(variable.value);
      const array = Array.isArray(value);
      const object = value !== null && typeof value === 'object' && !array;
      const matches = (pattern: string) => new RegExp(pattern, 'm').test(source);
      const heap =
        matches(
          `(?:heappush|heappop|heapify|heapreplace|heappushpop)\\(\\s*${escaped}\\b|heap\\.(?:Push|Pop|Init)\\(\\s*&?${escaped}\\b`,
        ) ||
        (/heap/i.test(name) && matches(`\\b${escaped}\\s*\\[`));
      const priorityQueue =
        language === 'java' &&
        matches(`PriorityQueue[^;\\n]*\\b${escaped}\\b|\\b${escaped}\\s*=\\s*new\\s+PriorityQueue`);
      const fifo =
        matches(
          `\\b${escaped}\\.(?:popleft|poll|pollFirst|removeFirst|offer|addLast)\\(|\\b${escaped}\\s*=\\s*${escaped}\\[1:\\]`,
        ) || variable.type === 'queue';
      const lifo =
        matches(`\\b${escaped}\\.pop\\(\\s*\\)|\\b${escaped}\\.(?:push|peek)\\(`) ||
        (/^(?:stack|st)$/.test(name) && array);
      const queueStorage =
        array &&
        (/queue|deque|frontier|buffer/i.test(name) || /queue|deque/.test(family)) &&
        matches(`\\b${escaped}\\s*\\[[^\\]\\n]*(?:head|tail|front|rear)\\b`);
      const stackStorage =
        array &&
        (/stack/i.test(name) || /stack/.test(family)) &&
        matches(`\\b${escaped}\\s*\\[\\s*top\\b`);
      const node =
        object &&
        (['left', 'right', 'next', 'prev', 'neighbors', 'children'].some(
          (key) => key in (value as object),
        ) ||
          (['value', 'val', 'Val'].some((key) => key in (value as object)) &&
            matches(`\\b${escaped}\\.(?:left|right|next|val|Val)\\b`)));
      const adjacency =
        /^(?:graph|adj|adjacency|neighbors)$/.test(name) &&
        (array || object) &&
        matches(`\\b${escaped}\\s*\\[|\\b${escaped}\\.get\\(`);
      const parents =
        /^(?:parent|parents|p)$/.test(name) &&
        array &&
        /\bfind\w*\s*\(/i.test(source) &&
        value.every(
          (item) => Number.isInteger(item) && Number(item) >= 0 && Number(item) < value.length,
        );
      const opaque =
        typeof value === 'string' &&
        (/^"?(?:deque|object)"?$/.test(variable.value) ||
          /^<(?:.*)>$/.test(value) ||
          /(?:Node|Tree|Cache|List|Graph).*0x[0-9a-f]+/.test(value));
      let kind: StateStructureKind = opaque
        ? 'opaque'
        : node
          ? 'node'
          : parents
            ? 'parents'
            : adjacency
              ? 'adjacency'
              : priorityQueue && array
                ? 'priority-queue'
                : heap && array
                  ? 'heap'
                  : fifo && array
                    ? 'queue'
                    : queueStorage
                      ? 'queue-storage'
                      : stackStorage
                        ? 'stack-storage'
                        : lifo && array
                          ? 'stack'
                          : /set|membership/i.test(variable.type ?? '')
                            ? 'set'
                            : object
                              ? 'map'
                              : array && value.length > 0 && value.every(Array.isArray)
                                ? /interval|sweep/i.test(context) &&
                                  /interval|range|segment|merged|ordered/i.test(name) &&
                                  value.every(
                                    (row) =>
                                      row.length === 2 &&
                                      row.every((cell: unknown) => typeof cell === 'number'),
                                  )
                                  ? 'intervals'
                                  : 'matrix'
                                : array
                                  ? 'sequence'
                                  : /bit-manipulation/.test(context) &&
                                      typeof value === 'number' &&
                                      Number.isSafeInteger(value)
                                    ? 'bits'
                                    : 'scalar';
      // A non-JSON map can still contain published object keys. Parse only its recorded entries.
      if (
        typeof value === 'string' &&
        /map/i.test(variable.type ?? '') &&
        recordedMapEntries(variable.value).length
      )
        kind = 'map';
      const markers = array
        ? snapshot.variables.flatMap((candidate) => {
            const index = Number(candidate.value);
            if (!Number.isInteger(index) || index < 0 || index >= value.length) return [];
            const key = identifier(candidate.name);
            return matches(`\\b${escaped}\\s*\\[\\s*${key}\\s*\\]`)
              ? [{ name: candidate.name, index }]
              : [];
          })
        : [];
      const matrixMarkers = array
        ? [
            ...source.matchAll(
              new RegExp(`\\b${escaped}\\s*\\[\\s*(\\w+)\\s*\\]\\s*\\[\\s*(\\w+)\\s*\\]`, 'g'),
            ),
          ].flatMap((match) => {
            const row = Number(snapshot.variables.find((item) => item.name === match[1])?.value);
            const column = Number(snapshot.variables.find((item) => item.name === match[2])?.value);
            return Number.isInteger(row) &&
              Number.isInteger(column) &&
              row >= 0 &&
              row < value.length &&
              Array.isArray(value[row]) &&
              column >= 0 &&
              column < value[row].length
              ? [{ row, column, label: `${match[1]}, ${match[2]}` }]
              : [];
          })
        : [];
      const frontStack =
        kind === 'stack' &&
        language === 'java' &&
        matches(
          `(?:Deque|LinkedList)[^;\\n]*\\b${escaped}\\b|\\b${escaped}\\s*=\\s*new\\s+(?:ArrayDeque|LinkedList)`,
        );
      return {
        name,
        kind,
        label: labels[kind],
        value,
        raw: variable.value,
        changed: !!variable.changed,
        markers,
        matrixMarkers,
        ...(kind === 'stack' && array ? { topIndex: frontStack ? 0 : value.length - 1 } : {}),
        note:
          kind === 'opaque'
            ? 'Collection contents or node links are not published in this reference.'
            : kind === 'priority-queue'
              ? 'Recorded iteration order; heap shape and sorted order are not implied.'
              : kind === 'heap'
                ? 'Parent-child positions come from the recorded heap array; its ordering may be under repair at this instruction.'
                : kind === 'node'
                  ? 'Only fields present in this snapshot are shown. Reference boundaries are not expanded.'
                  : kind === 'queue-storage' || kind === 'stack-storage'
                    ? 'Backing storage with recorded index markers. Capacity cells are not implied to be live entries.'
                    : kind === 'queue'
                      ? 'Recorded front-to-back order.'
                      : kind === 'stack'
                        ? frontStack
                          ? 'First recorded deque entry is the stack top.'
                          : 'Last recorded entry is the stack top.'
                        : '',
      };
    });
}

export function isRuntimeSupport(variable: GuidedTraceVariable): boolean {
  return (
    variable.value === '—' ||
    variable.name === '_' ||
    /^(?:module|func|source)$/.test(variable.type ?? '') ||
    /^"(?:module|function|builtin_function_or_method|type|method)"$/.test(variable.value)
  );
}

export function displayRecorded(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'Not recorded');
}
