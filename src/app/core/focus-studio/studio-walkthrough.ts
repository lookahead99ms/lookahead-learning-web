import {
  DsaProblemFixtureV2,
  PatternProblemV1,
  PatternLanguage,
} from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { parseRecordedValue } from './studio-state-view';

export interface WalkthroughFrame {
  kind: 'container' | 'window';
  values: number[];
  left: number;
  right: number;
  k: number;
  total: number | null;
  best: number | null;
  entering: number | null;
  leaving: number | null;
  phase: string;
  why: string;
  valid: boolean;
  evaluated: boolean;
  done?: boolean;
  bestRange: number[] | null;
}
export function walkthroughKind(id: string): WalkthroughFrame['kind'] | null {
  return id === 'algorithmic-container-water'
    ? 'container'
    : id === 'algorithmic-maximum-sum-subarray-size-k'
      ? 'window'
      : null;
}
/** Conceptual playback is separate from the published source instruction cursor. */
export function conceptualFrames(
  kind: WalkthroughFrame['kind'],
  fixture: DsaProblemFixtureV2,
): WalkthroughFrame[] {
  const values = (
    kind === 'container' ? fixture.arguments['heights'] : fixture.arguments['values']
  ) as number[];
  if (!Array.isArray(values) || !values.length) return [];
  const frames: WalkthroughFrame[] = [];
  if (kind === 'container') {
    let left = 0,
      right = values.length - 1,
      best = 0,
      bestRange: number[] | null = null;
    while (left < right) {
      const total = (right - left) * Math.min(values[left], values[right]);
      const base = {
        kind,
        values,
        left,
        right,
        k: 0,
        total,
        entering: null,
        leaving: null,
        valid: true,
      };
      frames.push({
        ...base,
        best,
        bestRange: bestRange?.slice() ?? null,
        evaluated: false,
        phase: 'Measure the active pair',
        why: `Pair [${left}, ${right}] has width ${right - left} and limiting height ${Math.min(values[left], values[right])}. Its area is ${total}; best has not been updated yet.`,
      });
      if (!bestRange || total > best) {
        best = total;
        bestRange = [left, right];
      }
      const moveLeft = values[left] <= values[right];
      frames.push({
        ...base,
        best,
        bestRange: bestRange.slice(),
        evaluated: true,
        phase: 'Record best, then eliminate',
        why: `Measured area ${total}; best is ${best}. ${values[left] === values[right] ? 'Either equal-height endpoint is safe; move left.' : `Move the shorter ${moveLeft ? 'left' : 'right'} wall. Keeping it with a narrower partner cannot beat this pair.`} The next area need not improve.`,
      });
      if (moveLeft) left++;
      else right--;
    }
    if (frames.length)
      frames.push({
        ...frames[frames.length - 1],
        done: true,
        phase: 'Complete / last evaluated pair',
        why: `The pointers have met. The diagram retains the last evaluated pair. Maximum area ${best}, best pair [${bestRange}].`,
      });
    return frames;
  }
  const k = fixture.arguments['k'] as number;
  if (!Number.isInteger(k) || k < 1 || k > values.length) return [];
  let left = 0,
    total = 0,
    best: number | null = null,
    bestRange: number[] | null = null;
  const push = (
    right: number,
    phase: string,
    why: string,
    entering: number | null = null,
    leaving: number | null = null,
    evaluated = false,
  ) =>
    frames.push({
      kind,
      values,
      left,
      right,
      k,
      total,
      best,
      bestRange: bestRange?.slice() ?? null,
      phase,
      why,
      entering,
      leaving,
      evaluated,
      valid: true,
    });
  push(-1, 'Start: no valid window', 'No values accumulated. No best valid sum exists yet.');
  for (let right = 0; right < values.length; right++) {
    total += values[right];
    push(
      right,
      right - left + 1 > k ? 'Transient k + 1 accumulation' : 'Accumulate entering value',
      `Add values[${right}] = ${values[right]}. ${right - left + 1 > k ? 'Remove the expired value before comparing with best.' : right - left + 1 < k ? 'The window is partial; no candidate yet.' : 'The first exact-k sum is ready for evaluation.'}`,
      right,
    );
    if (right - left + 1 > k) {
      const leaving = left;
      total -= values[left++];
      push(
        right,
        'Remove expired value',
        `Subtract values[${leaving}] = ${values[leaving]}. Range [${left}, ${right}] has exactly ${k} values.`,
        right,
        leaving,
      );
    }
    if (right - left + 1 === k) {
      if (best === null || total > best) {
        best = total;
        bestRange = [left, right];
      }
      push(
        right,
        'Evaluate the exact-k window',
        `Window [${left}, ${right}] sums to ${total}. Best valid sum is ${best}; negative results are valid.`,
        right,
        null,
        true,
      );
    }
  }
  frames.push({
    ...frames[frames.length - 1],
    entering: null,
    leaving: null,
    done: true,
    phase: 'Complete',
    why: `Every exact-${k} window has been evaluated. Best valid sum ${best}, window [${bestRange}].`,
  });
  return frames;
}
/** Derive geometry only where recorded locals and executed anchors support it. */
export function linkedWalkthrough(
  kind: WalkthroughFrame['kind'],
  problem: PatternProblemV1,
  fixture: DsaProblemFixtureV2,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
): WalkthroughFrame {
  const values = (
    kind === 'container' ? fixture.arguments['heights'] : fixture.arguments['values']
  ) as number[];
  const locals = Object.fromEntries(
    snapshot.variables.map((field) => [field.name, parseRecordedValue(field.value)]),
  );
  const lines = problem.implementations.find((source) => source.language === language)!.lines;
  const base: WalkthroughFrame = {
    kind,
    values,
    left: 0,
    right: -1,
    k: Number(fixture.arguments['k'] ?? 0),
    total: null,
    best: null,
    bestRange: null,
    entering: null,
    leaving: null,
    phase: 'Awaiting recorded state',
    why: 'No active geometry is inferred until the selected instruction records sufficient state.',
    valid: false,
    evaluated: false,
  };
  if (snapshot.unavailable) return { ...base, why: snapshot.unavailable };
  if (kind === 'container') {
    const left = Number(locals['left']),
      right = Number(locals['right']);
    if (
      !Number.isInteger(left) ||
      !Number.isInteger(right) ||
      left < 0 ||
      right >= values.length ||
      left >= right
    )
      return base;
    const total = (right - left) * Math.min(values[left], values[right]);
    return {
      ...base,
      left,
      right,
      total,
      best: typeof locals['best'] === 'number' ? locals['best'] : null,
      valid: true,
      phase: 'Current pointers / derived geometry',
      why: `Current pair [${left}, ${right}]: width ${right - left} × limiting height ${Math.min(values[left], values[right])} = ${total}. Geometry is derived; best is a published local.`,
    };
  }
  let members: number[] = [],
    bestValid = false;
  for (const event of snapshot.events.slice(0, snapshot.step + 1)) {
    if (event.stateUnavailable) continue;
    const vars = Object.fromEntries(
      event.variables.map((field) => [field.name, parseRecordedValue(field.value)]),
    );
    const code = lines.find((line) => line.id === event.sourceAnchor[language])?.text ?? '';
    base.entering = null;
    base.leaving = null;
    const right = Number(vars['right']);
    if (/(?:total|sum)\s*\+=/.test(code) && Number.isInteger(right) && right < values.length) {
      if (!members.includes(right)) members.push(right);
      base.entering = right;
    }
    if (/(?:total|sum)\s*-=/.test(code) && right >= base.k) {
      base.leaving = right - base.k;
      members = members.filter((index) => index !== base.leaving);
    }
    if (/best\s*=.*max/.test(code) && members.length === base.k) bestValid = true;
  }
  const total = locals['total'] ?? locals['sum'];
  if (typeof total !== 'number' || total !== members.reduce((sum, index) => sum + values[index], 0))
    return base;
  return {
    ...base,
    left: members[0] ?? 0,
    right: members.at(-1) ?? -1,
    total,
    best: bestValid && typeof locals['best'] === 'number' ? locals['best'] : null,
    valid: true,
    phase:
      members.length > base.k
        ? 'Transient k + 1 accumulation'
        : members.length < base.k
          ? 'Partial accumulation'
          : 'Exact-k window',
    why: `Derived membership [${members.join(', ')}] matches the published sum ${total}. ${bestValid ? 'Best is a published value.' : 'Best is still an initialization sentinel, not a valid answer.'}`,
  };
}
