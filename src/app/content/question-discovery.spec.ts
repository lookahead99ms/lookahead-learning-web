import { describe, expect, it } from 'vitest';
import { CourseContent, FoundationLessonV1, InterviewQuestion } from './content.models';
import {
  isTheoryArticle,
  questionModuleIdForArticle,
  questionsForModule,
} from './question-discovery';

const lesson = {
  id: 'lesson',
  moduleId: 'theory-module',
  contentType: 'theory',
  schemaVersion: 'foundation-lesson/v1',
  sections: [{ id: 'model', heading: 'Model', body: ['Body'] }],
} as FoundationLessonV1;

const question = {
  id: 'question',
  moduleId: 'question-module',
  order: 2,
  contentType: 'q-and-a',
} as InterviewQuestion;

const course = {
  modules: [],
  questions: [lesson, question],
  learningUnits: [
    {
      id: 'unit',
      title: 'Unit',
      description: 'Unit description.',
      theoryModuleId: 'theory-module',
      questionModuleId: 'question-module',
    },
  ],
} as unknown as CourseContent;

describe('question discovery', () => {
  it('excludes real theory articles while preserving legacy Q&A tagged as theory', () => {
    const legacyQuestion = {
      ...question,
      id: 'legacy-question',
      order: 1,
      contentType: 'theory',
    } as InterviewQuestion;
    const sameModuleCourse = {
      ...course,
      questions: [{ ...lesson, moduleId: 'question-module' }, legacyQuestion, question],
    };

    expect(isTheoryArticle(lesson)).toBe(true);
    expect(isTheoryArticle(legacyQuestion)).toBe(false);
    expect(questionsForModule(sameModuleCourse, 'question-module').map(({ id }) => id)).toEqual([
      'legacy-question',
      'question',
    ]);
  });

  it('resolves the complete question module for a lesson', () => {
    expect(questionModuleIdForArticle(course, lesson)).toBe('question-module');
    expect(questionsForModule(course, 'question-module')).toEqual([question]);
  });
});
