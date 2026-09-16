import {
  DsaProblemFixtureV2,
  PatternLanguage,
  PatternProblemV1,
} from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';

export function parseRecordedValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    if (/^\{\s*-?\d+\s*[:=]\s*-?\d+(\s*,\s*-?\d+\s*[:=]\s*-?\d+)*\s*\}$/.test(value)) {
      return Object.fromEntries(
        value
          .slice(1, -1)
          .split(',')
          .map((entry) => {
            const [key, item] = entry.split(/[:=]/).map((part) => part.trim());
            return [key, Number(item)];
          }),
      );
    }
    return value;
  }
}

/** Parse recorded maps whose object keys are runtime objects rather than JSON property names. */
export function recordedMapEntries(value: string): Array<{ key: unknown; value: unknown }> {
  const parsed = parseRecordedValue(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return Object.entries(parsed as Record<string, unknown>).map(([key, item]) => ({
      key,
      value: item,
    }));
  }
  if (typeof parsed !== 'string') return [];
  const source = parsed.trim();
  if (!source.startsWith('{') || !source.endsWith('}')) return [];
  return splitRecordedMap(source.slice(1, -1), ',').flatMap((entry) => {
    const pair = splitRecordedMap(entry, ':');
    if (pair.length < 2) return [];
    const key = pair.shift()!;
    const item = pair.join(':');
    return [{ key: parseRecordedValue(key.trim()), value: parseRecordedValue(item.trim()) }];
  });
}

function splitRecordedMap(source: string, separator: ',' | ':'): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if ('{[('.includes(character)) depth += 1;
    else if ('}])'.includes(character)) depth -= 1;
    else if (character === separator && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
      if (separator === ':') break;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

export function recordedValue(snapshot: TraceSnapshot, names: string[]): unknown {
  if (snapshot.unavailable) return undefined;
  const variable = snapshot.variables.find((item) => names.includes(item.name));
  return variable ? parseRecordedValue(variable.value) : undefined;
}

/** Confirm positions from recorded indexes or observed loop entries, never by value search. */
export function currentInputIndices(
  problem: PatternProblemV1,
  fixture: DsaProblemFixtureV2,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
  name: string,
): number[] {
  const values = fixture.arguments?.[name];
  if (snapshot.unavailable || !Array.isArray(values)) return [];
  const source = problem.implementations.find((item) => item.language === language)?.lines ?? [];
  const currentLine = source.find((line) => line.id === snapshot.event?.sourceAnchor[language]);
  if (/^\s*return\b/.test(currentLine?.text ?? '')) return [];
  if (problem.id === 'algorithmic-kth-largest-element-array' && name === 'nums') {
    const loop = source.find((line) =>
      language === 'python'
        ? /for\s+value\s+in\s+nums\s*:/.test(line.text)
        : language === 'java'
          ? /for\s*\(\s*int\s+value\s*:\s*nums\s*\)/.test(line.text)
          : /\brange\s+nums\b/.test(line.text),
    );
    const index = loop
      ? snapshot.events
          .slice(0, snapshot.step + 1)
          .filter((event) => event.sourceAnchor[language] === loop.id).length - 1
      : -1;
    const current = recordedValue(snapshot, [language === 'go' ? 'v' : 'value']);
    return index >= 0 && index < values.length && values[index] === current ? [index] : [];
  }
  const indexes: Record<string, Record<string, string[]>> = {
    'algorithmic-container-water': { heights: ['left', 'right'] },
    'algorithmic-two-sum': { nums: ['index', 'i'] },
    'algorithmic-maximum-sum-subarray-size-k': { values: ['right'] },
    'algorithmic-subarray-sum-k': { nums: ['index', 'i'] },
  };
  const names = indexes[problem.id]?.[name] ?? [];
  return [
    ...new Set(
      names
        .map((index) => recordedValue(snapshot, [index]))
        .filter(
          (index): index is number =>
            typeof index === 'number' &&
            Number.isInteger(index) &&
            index >= 0 &&
            index < values.length,
        ),
    ),
  ];
}

export function sourceOrderedLocals(
  problem: PatternProblemV1,
  fixture: DsaProblemFixtureV2,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
  includeInputs = false,
) {
  if (snapshot.unavailable) return [];
  const source =
    problem.implementations
      .find((item) => item.language === language)
      ?.lines.map((line) => line.text)
      .join('\n') ?? '';
  const inputs = new Set(Object.keys(fixture.arguments ?? {}));
  const position = (name: string) => {
    const index = source.search(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return snapshot.variables
    .filter(
      (variable) => (includeInputs || !inputs.has(variable.name)) && variable.value !== '"module"',
    )
    .sort((a, b) => position(a.name) - position(b.name));
}
