import { describe, expect, it } from 'vitest';
import { PracticeFormat } from './content.models';
import { practicePresentation } from './practice-presentation';

describe('practice presentation', () => {
  it.each([
    ['explain', 'Review questions', 'Review all 2 questions'],
    ['solve', 'Solve problems', 'Solve all 2 problems'],
    ['design', 'Explore design challenges', 'Explore all 2 design challenges'],
    ['debug', 'Debug scenarios', 'Work through all 2 debugging scenarios'],
    ['rehearse', 'Rehearse answers', 'Rehearse all 2 interview prompts'],
  ] satisfies [PracticeFormat, string, string][])(
    'labels homogeneous %s items',
    (format, compact, detail) => {
      const result = practicePresentation([
        { id: 'one', practiceFormat: format },
        { id: 'two', practiceFormat: format },
      ]);

      expect(result.kind).toBe(format);
      expect(result.compactLabel).toBe(compact);
      expect(result.detailLabel).toBe(detail);
    },
  );

  it('uses one neutral action for mixed formats without hiding minority items', () => {
    const result = practicePresentation([
      { id: 'one', practiceFormat: 'explain' },
      { id: 'two', practiceFormat: 'solve' },
    ]);

    expect(result.kind).toBe('mixed');
    expect(result.compactLabel).toBe('Browse practice');
    expect(result.detailLabel).toBe('Browse all 2 practice items');
  });

  it('falls back neutrally when any item is unclassified and deduplicates canonical IDs', () => {
    const result = practicePresentation([
      { id: 'one', practiceFormat: 'solve' },
      { id: 'one', practiceFormat: 'solve' },
      { id: 'two' },
    ]);

    expect(result.kind).toBe('unknown');
    expect(result.count).toBe(2);
    expect(result.compactLabel).toBe('Browse practice');
  });

  it('supports a count-only compatibility fallback without claiming a format', () => {
    expect(practicePresentation([], 3)).toMatchObject({
      kind: 'unknown',
      count: 3,
      compactLabel: 'Browse practice',
    });
  });
});
