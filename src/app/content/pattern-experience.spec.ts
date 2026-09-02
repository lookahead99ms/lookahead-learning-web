import { describe, expect, it } from 'vitest';
import { InterviewQuestion, TheoryVisual } from './content.models';
import { authenticCodingVisual, relatedPracticeItems } from './pattern-experience';

function question(
  id: string,
  order: number,
  relatedArticleId: string,
  moduleId = 'practice',
): InterviewQuestion {
  return {
    id,
    moduleId,
    order,
    title: id,
    difficulty: 'Beginner',
    tags: ['test'],
    interviewAnswer: 'answer',
    explanation: ['explanation'],
    versionNotes: [],
    followUps: [],
    relatedArticleId,
  };
}

describe('pattern experience safety rules', () => {
  it('returns only explicitly related practice in curriculum order', () => {
    const items = relatedPracticeItems(
      [
        question('other-article', 1, 'other'),
        question('second', 3, 'prefix'),
        question('wrong-module', 1, 'prefix', 'other-practice'),
        question('first', 2, 'prefix'),
      ],
      'prefix',
      'practice',
    );

    expect(items.map(({ id }) => id)).toEqual(['first', 'second']);
  });

  it('suppresses the generic source carousel while preserving authentic visuals', () => {
    const pseudoTrace: TheoryVisual = {
      type: 'interactive',
      assetPath: '/content/learn/algorithmic-patterns/visuals/algorithmic-code-flow.html#range-sum',
      alt: 'Pseudo trace',
    };
    const authenticTrace: TheoryVisual = {
      type: 'interactive',
      assetPath: '/content/learn/algorithmic-patterns/visuals/prefix-state-lab.html',
      alt: 'Prefix boundaries',
    };

    expect(authenticCodingVisual(pseudoTrace)).toBeNull();
    expect(authenticCodingVisual(authenticTrace)).toBe(authenticTrace);
  });
});
