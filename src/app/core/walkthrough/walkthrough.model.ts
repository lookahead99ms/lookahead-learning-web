import {
  GuidedTraceCellState,
  GuidedTraceRow,
  PatternLanguage,
  PatternProblemFixture,
  PatternProblemV1,
} from '../../content/content.models';
import { highlightStudioSource } from '../focus-studio/code-presentation';
import { TraceSnapshot, traceSnapshot } from '../guided-algorithm-trace/trace-model';
import { ArrayVisual, ListVisual, stepNarration, traceVisual } from '../guided-algorithm-trace/trace-visual';

/**
 * Option B "Code beside" (user-approved redesign, 2026-10-06): one player for the Visual
 * walkthrough. These are the plain data the player draws; the story (`app-dsa-story`) and the
 * fallback walkthrough fill them from their own sources.
 */
export interface WalkthroughValue {
  name: string;
  value: string;
  changed?: boolean;
  unset?: boolean;
  /** Already drawn in the stage above, so folded behind "+N drawn above". */
  drawn?: boolean;
  kind?: 'returns' | 'result';
  /** A caller's local shown while a helper runs. */
  frame?: string;
}
export interface WalkthroughCodeLine {
  id: string;
  number: number;
  html: string;
  current: boolean;
  ran: boolean;
}
export interface WalkthroughExample {
  id: string;
  label: string;
}
export interface WalkthroughApproach {
  /** One line, shown until the learner opens Approach. */
  summary: string;
  time: string;
  space: string;
  rows: { label: string; text: string }[];
}
export type WalkthroughKeyAction = 'previous' | 'next' | 'first' | 'last' | 'toggle';

/**
 * Keyboard for the player: Left/Right step, Home/End jump, Space plays or pauses. Fields keep
 * their own keys (a select, the scrubber, the code box, the language tabs), and Space on a
 * button, link or disclosure keeps its native activation.
 */
export function walkthroughKey(event: KeyboardEvent): WalkthroughKeyAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented)
    return null;
  const target = event.target instanceof Element ? event.target : null;
  if (
    target?.closest(
      'input, select, textarea, pre, [role="tab"], [role="separator"], [contenteditable]:not([contenteditable="false"])',
    )
  )
    return null;
  switch (event.key) {
    case 'ArrowLeft':
      return 'previous';
    case 'ArrowRight':
      return 'next';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case ' ':
    case 'Spacebar':
      return target?.closest('button, a[href], summary') ? null : 'toggle';
    default:
      return null;
  }
}

/**
 * Where to scroll a code box so its current line is visible, or null when it already is.
 * `visible` is the part of the box the learner can see (in box pixels), when the page cuts it.
 */
export function codeScrollTop(
  box: { scrollTop: number; clientHeight: number },
  lineTop: number,
  lineHeight: number,
  visible: { top: number; bottom: number } = { top: 0, bottom: box.clientHeight },
): number | null {
  const from = box.scrollTop + visible.top;
  const to = box.scrollTop + visible.bottom;
  if (lineTop >= from && lineTop + lineHeight * 2 <= to) return null;
  return Math.max(0, Math.round(lineTop - visible.top - (visible.bottom - visible.top) / 3));
}

/** The reference implementation's lines with the current one and the ones that already ran. */
export function codeLines(
  problem: PatternProblemV1,
  language: PatternLanguage,
  current: string | null,
  ran: Iterable<string>,
): WalkthroughCodeLine[] {
  const implementation = problem.implementations.find((item) => item.language === language);
  if (!implementation) return [];
  const html = highlightStudioSource(implementation.lines.map((line) => line.text).join('\n'), language);
  const ranSet = new Set(ran);
  return implementation.lines.map((line, index) => ({
    id: line.id,
    number: index + 1,
    html: html[index] ?? '',
    current: line.id === current,
    ran: ranSet.has(line.id) && line.id !== current,
  }));
}

export function referenceSource(problem: PatternProblemV1, language: PatternLanguage): string {
  return (
    problem.implementations
      .find((item) => item.language === language)
      ?.lines.map((line) => line.text)
      .join('\n') ?? ''
  );
}

/** The first sentence of a paragraph, for the one-line Approach summary. */
export function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/s.exec(text.trim());
  const sentence = match ? match[1] : text.trim();
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
}

/** "input → expected", short enough for the example selector. */
export function exampleLabel(fixture: PatternProblemFixture): string {
  const text = `${fixture.input} → ${fixture.expectedOutput}`;
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

/** The generic sentences every recorded line carries; they add nothing under a caption. */
const GENERIC_WHY = new Set([
  "This is the next instruction reached by the implementation's actual control flow.",
  'This is the terminal instruction for the selected fixture.',
]);

/** True when the example has a recorded line trace in this language. */
export function hasLineTrace(
  problem: PatternProblemV1,
  fixtureId: string,
  language: PatternLanguage,
): boolean {
  return traceSnapshot(problem, fixtureId, language, 0).events.length > 0;
}

/** One recorded line, as the player shows it: the line, what it did, values and code. */
export interface LineView {
  snapshot: TraceSnapshot;
  count: number;
  caption: string;
  line: string | null;
  detail: string | null;
  values: WalkthroughValue[];
  current: string | null;
  ran: string[];
  /** Names the stage draws (arrays, a list or recorded rows), folded in the value strip. */
  drawn: string[];
  /** What the recorded-state drawing shows; 'none' means `rows` are drawn instead. */
  visual: 'array' | 'list' | 'none';
  /** The recorded arrays (`visual` 'array') with their index pointers. */
  arrays: ArrayVisual[];
  /** The recorded list (`visual` 'list'). */
  list: ListVisual | null;
  /** One sentence for screen readers: what the recorded-state drawing shows. */
  label: string;
  /** The recorded rows, or rows read from array locals when the line records none. */
  rows: GuidedTraceRow[];
}
/**
 * The name of the value strip's own "what the call returned" row: `result`, or `returned` when
 * the code has a local named `result` too, so the strip never shows two rows of one name.
 */
export function resultRowName(names: Iterable<string>): string {
  return [...names].includes('result') ? 'returned' : 'result';
}
export function lineView(
  problem: PatternProblemV1,
  fixture: PatternProblemFixture,
  language: PatternLanguage,
  step: number,
): LineView {
  const snapshot = traceSnapshot(problem, fixture.id, language, step);
  const event = snapshot.event;
  const previous = snapshot.step > 0 ? traceSnapshot(problem, fixture.id, language, snapshot.step - 1) : null;
  const narration = event ? stepNarration(problem, fixture, snapshot, language, previous) : null;
  const visual = event ? traceVisual(problem, fixture, snapshot, language, previous) : { kind: 'none' as const };
  const rows = snapshot.rows.length
    ? snapshot.rows
    : arrayRows(snapshot, snapshot.step === snapshot.events.length - 1);
  const drawn =
    visual.kind === 'array'
      ? visual.arrays.map((array) => array.name)
      : visual.kind === 'list'
        ? []
        : rows.map((row) => row.label);
  const why = event?.why?.trim() ?? '';
  const drawnSet = new Set(drawn);
  const values: WalkthroughValue[] = snapshot.variables.map((variable) => ({
    name: variable.name,
    value: compactRecorded(variable.value),
    changed: variable.changed,
    drawn: drawnSet.has(variable.name),
  }));
  if (event)
    values.push({
      name: resultRowName(values.map((row) => row.name)),
      value: event.result !== undefined ? String(event.result) : 'not returned yet',
      unset: event.result === undefined,
      changed: event.result !== undefined,
      kind: 'result',
    });
  return {
    snapshot,
    count: snapshot.events.length,
    caption: event
      ? (narration?.text ?? event.what)
      : (snapshot.unavailable ?? 'A recorded trace is not published for this example.'),
    line: narration?.line ?? null,
    detail: why && !GENERIC_WHY.has(why) ? why : null,
    values: event ? values : [],
    current: event?.sourceAnchor[language] ?? null,
    ran: snapshot.events.slice(0, snapshot.step).map((item) => item.sourceAnchor[language]),
    drawn,
    visual: visual.kind,
    arrays: visual.kind === 'array' ? visual.arrays : [],
    list: visual.kind === 'list' ? visual.list : null,
    label: visual.kind === 'none' ? '' : visual.label,
    rows,
  };
}

/**
 * The recorded arrays drawn as rows of cells when a line records no rows of its own, as the
 * former guided debugger's "Data state" did: up to three array locals, with the cells the index
 * locals point at marked.
 */
function arrayRows(snapshot: TraceSnapshot, complete: boolean): GuidedTraceRow[] {
  const variables = snapshot.variables;
  const active = new Set(
    variables
      .filter(
        ({ name, type, value }) =>
          /^(index|i|j|left|right|low|high|mid|position)$/i.test(name) &&
          /^(int|integer)$/i.test(type) &&
          /^-?\d+$/.test(value),
      )
      .map(({ value }) => Number(value)),
  );
  return variables
    .flatMap((variable): GuidedTraceRow[] => {
      if (!/array|slice|\[\]/i.test(variable.type) || !variable.value.startsWith('[')) return [];
      try {
        const values: unknown = JSON.parse(variable.value);
        if (!Array.isArray(values) || !values.length) return [];
        return [
          {
            id: `${variable.name}-state`,
            label: variable.name,
            cells: values.slice(0, 32).map((value, index) => {
              const states: GuidedTraceCellState[] = [];
              if (active.has(index)) states.push('active');
              if (complete && active.has(index)) states.push('resolved');
              return {
                value: typeof value === 'string' ? value : compactRecorded(JSON.stringify(value)),
                ...(states.length ? { states } : {}),
              };
            }),
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, 3);
}

const NODE_LINKS = /^(left|right|next|prev|parent|children|neighbors)$/i;
/**
 * A recorded value as one short line for the value strip: a tree or list node reads as
 * `node(9)` instead of its whole nested JSON (every field stays in "All recorded locals").
 */
export function compactRecorded(raw: string): string {
  const text = raw.trim();
  if (!/^[[{]/.test(text)) return raw;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return raw;
  }
  const show = (item: unknown): string => {
    if (item === null || item === undefined) return 'null';
    if (Array.isArray(item)) return `[${item.map(show).join(', ')}]`;
    if (typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const keys = Object.keys(record);
      const own = keys.find((key) => /^(val|value)$/i.test(key));
      if (own && (keys.some((key) => NODE_LINKS.test(key)) || keys.length === 1)) return `node(${show(record[own])})`;
      return `{${keys.map((key) => `${key}: ${show(record[key])}`).join(', ')}}`;
    }
    return typeof item === 'string' ? JSON.stringify(item) : String(item);
  };
  const shown = show(value);
  return shown.length > 140 ? `${shown.slice(0, 139)}…` : shown;
}
