import { describe, expect, it } from 'vitest';
import { GuidedTraceEvent, PatternProblemV1 } from '../../content/content.models';
import { languageTraceEvents, traceSnapshot } from './trace-model';

function problem(): PatternProblemV1 {
  const event = (id: string, value: string): GuidedTraceEvent => ({
    id,
    label: id,
    phase: 'Update',
    timing: 'after',
    sourceAnchor: { python: id, java: id, go: id },
    what: id,
    why: id,
    variables: [{ name: 'value', type: 'int', value, changed: true }],
    rows: [],
  });
  return {
    implementations: ['java', 'python', 'go'].map((language) => ({
      language,
      lines: ['first', 'second', 'third'].map((id) => ({ id, text: id })),
    })),
    trace: {
      fixtureId: 'a',
      stateSemantics: 'target-runtime/v1',
      stateTiming: 'after',
      events: [event('first', '1'), event('second', '2'), { ...event('third', '3'), result: '3' }],
      languagePaths: {
        python: [
          { sourceAnchor: 'first', eventIndex: 0 },
          { sourceAnchor: 'second', eventIndex: 1 },
          { sourceAnchor: 'third', eventIndex: 2 },
        ],
        java: [
          {
            sourceAnchor: 'first',
            eventIndex: 0,
            variables: [{ name: 'native', type: 'int', value: '10' }],
          },
          {
            sourceAnchor: 'second',
            eventIndex: 1,
            stateUnavailable: true,
            stateUnavailableReason: 'Local values unavailable.',
          },
          {
            sourceAnchor: 'third',
            eventIndex: 2,
            variables: [{ name: 'newLocal', type: 'int', value: '30' }],
            result: '30',
          },
        ],
        go: [
          {
            sourceAnchor: 'first',
            eventIndex: 0,
            variables: [{ name: 'native', type: 'int', value: '100' }],
          },
        ],
      },
    },
  } as unknown as PatternProblemV1;
}
describe('shared selected-language trace model', () => {
  it('does not project Python variables onto Java or Go', () => {
    const record = problem();
    expect(traceSnapshot(record, 'a', 'python', 0).variables[0].value).toBe('1');
    expect(traceSnapshot(record, 'a', 'java', 0).variables).toEqual([
      { name: 'native', type: 'int', value: '10', changed: false },
    ]);
    expect(traceSnapshot(record, 'a', 'go', 0).variables[0].value).toBe('100');
  });
  it('clears old state across unavailable frames and never resurrects missing locals', () => {
    expect(traceSnapshot(problem(), 'a', 'java', 1).variables).toEqual([]);
    expect(traceSnapshot(problem(), 'a', 'java', 1).unavailable).toBe('Local values unavailable.');
    expect(traceSnapshot(problem(), 'a', 'java', 2).variables.map((item) => item.name)).toEqual([
      'newLocal',
    ]);
  });
  it('does not fall back to a different fixture or an unverified source path', () => {
    expect(traceSnapshot(problem(), 'missing', 'java', 0).events).toEqual([]);
    const record = problem();
    delete record.trace.languagePaths;
    expect(traceSnapshot(record, 'a', 'java', 0).unavailable).toContain('source path');
  });
  it('does not substitute a Python return for an explicit native result', () => {
    const record = problem();
    const events = languageTraceEvents(record, record.trace, 'java');
    expect(events[0].result).toBeUndefined();
    expect(events[2].result).toBe('30');
  });
  it('clamps a cursor and reconstructs only state up to that cursor', () => {
    expect(traceSnapshot(problem(), 'a', 'python', -1).variables[0].value).toBe('1');
    expect(traceSnapshot(problem(), 'a', 'python', 99).variables[0].value).toBe('3');
  });
});
