import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { parseAccessLevels } from '../../content/access-levels';
import { CourseLearningUnit, CourseOutline } from '../../content/content.models';
import { StudyAccount, StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { CourseLearningMap } from './course-learning-map';

/**
 * DLV-942: one plain-text access label per unit card, part of the card link's accessible name.
 * DLV-209: the label depends on who is looking.
 */
const units: CourseLearningUnit[] = [
  { id: 'java-platform', title: 'Java Platform', description: 'Run Java.', theoryModuleId: 'platform' },
  { id: 'error-handling', title: 'Error Handling', description: 'Handle errors.', theoryModuleId: 'errors' },
  { id: 'collections', title: 'Collections', description: 'Use lists.', theoryModuleId: 'collections' },
  { id: 'records', title: 'Records', description: 'Coming later.', theoryModuleId: 'records', planned: true },
];

const course: CourseOutline = {
  id: 'core-java',
  path: 'learn',
  title: 'Java Foundations',
  description: 'Learn Java.',
  version: '1',
  layout: 'learning-map',
  learningUnits: units,
  modules: units
    .filter((unit) => !unit.planned)
    .map((unit, index) => ({
      id: unit.theoryModuleId,
      order: index + 1,
      title: unit.title,
      description: unit.description,
    })),
  questions: units
    .filter((unit) => !unit.planned)
    .map((unit, index) => ({
      id: `${unit.id}-lesson`,
      moduleId: unit.theoryModuleId,
      order: index + 1,
      title: `${unit.title} lesson`,
      difficulty: 'Beginner',
      tags: [],
      contentType: 'theory',
      isTheoryArticle: true,
      detailRef: {
        kind: 'content-item',
        href: `/content/details/learn/core-java/${unit.theoryModuleId}/${unit.id}-lesson.json`,
        version: 'v1',
      },
    })),
  moduleDetailRefs: [],
};

const levels = parseAccessLevels({
  schemaVersion: 'content-access-levels/v1',
  policyVersion: 'test',
  defaultLevel: 'pro',
  units: {
    'learn/core-java/java-platform': 'open',
    'learn/core-java/error-handling': 'free',
  },
});

describe('CourseLearningMap access labels', () => {
  let fixture: ComponentFixture<CourseLearningMap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseLearningMap],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(CourseLearningMap);
    fixture.componentRef.setInput('course', course);
    fixture.componentRef.setInput('pathId', 'learn');
    fixture.componentRef.setInput('courseId', 'core-java');
    fixture.componentRef.setInput('units', units);
  });

  function signIn(account: Partial<StudyAccount> = {}): void {
    TestBed.inject(StudyPlanAccount).account.set({
      accountId: 'a1',
      username: 'learner',
      displayName: 'Learner',
      topicGrants: [],
      ...account,
    });
  }

  function labelTexts(): (string | undefined)[][] {
    return [...root().querySelectorAll<HTMLElement>('.unit-card-access')].map((label) => [
      label.closest('.unit-card-item')?.querySelector('.unit-card-title')?.textContent?.trim(),
      label.dataset['accessLevel'],
      label.textContent?.replace('Access:', '').trim(),
    ]);
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The accessible name a screen reader builds from aria-labelledby. */
  function accessibleName(element: Element): string {
    return (element.getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map((id) => root().querySelector(`[id="${id}"]`)?.textContent?.trim() ?? '')
      .join(' ');
  }

  it('shows a signed-out visitor Open, Sign in to read and Paid plan as plain text', () => {
    fixture.componentRef.setInput('accessLevels', levels);
    fixture.detectChanges();

    expect(labelTexts()).toEqual([
      ['Java Platform', 'open', 'Open'],
      ['Error Handling', 'free', 'Sign in to read'],
      ['Collections', 'pro', 'Paid plan'],
    ]);
    // Passive metadata: a span, not a button, link or pill.
    for (const label of root().querySelectorAll('.unit-card-access')) {
      expect(label.tagName).toBe('SPAN');
      expect(label.closest('button')).toBeNull();
      expect(label.classList).not.toContain('unit-card-pill');
    }
    // Only Paid plan carries the decorative lock.
    expect(root().querySelector('#unit-collections .unit-card-access-lock')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(root().querySelector('#unit-java-platform .unit-card-access-lock')).toBeNull();
  });

  it('shows a signed-in learner without course access only Paid plan', () => {
    signIn({ topicGrants: ['learn:spring-framework'] });
    fixture.componentRef.setInput('accessLevels', levels);
    fixture.detectChanges();

    expect(labelTexts()).toEqual([['Collections', 'pro', 'Paid plan']]);
    expect(root().querySelector('#unit-java-platform')?.getAttribute('aria-labelledby')).toBe(
      'unit-card-title-java-platform',
    );
  });

  it('shows no labels to a learner who can open the course', () => {
    fixture.componentRef.setInput('accessLevels', levels);
    for (const account of [
      { topicGrants: ['learn:core-java'] },
      { authorPreview: true },
      { permissions: { fullCurriculum: true } as StudyAccount['permissions'] },
      { permissions: { feedbackRole: 'tester' } as StudyAccount['permissions'] },
    ]) {
      signIn(account);
      fixture.detectChanges();
      expect(root().querySelectorAll('.unit-card-access')).toHaveLength(0);
      expect(root().querySelector('#unit-collections')?.getAttribute('aria-labelledby')).toBe(
        'unit-card-title-collections',
      );
    }
  });

  it('treats an expired session as signed out', () => {
    signIn({ topicGrants: ['learn:core-java'] });
    TestBed.inject(StudyPlanAccount).sessionExpired.set(true);
    fixture.componentRef.setInput('accessLevels', levels);
    fixture.detectChanges();

    expect(labelTexts().map(([, , text]) => text)).toEqual(['Open', 'Sign in to read', 'Paid plan']);
  });

  it('includes the level in the card link accessible name', () => {
    fixture.componentRef.setInput('accessLevels', levels);
    fixture.detectChanges();

    const card = root().querySelector('#unit-error-handling')!;
    expect(card.tagName).toBe('A');
    expect(accessibleName(card)).toBe('Error Handling Access: Sign in to read');
    expect(accessibleName(root().querySelector('#unit-collections')!)).toBe(
      'Collections Access: Paid plan',
    );
    // The level is not repeated in the description.
    expect(card.getAttribute('aria-describedby')).not.toContain('unit-card-access');
  });

  it('gives a planned unit no access label', () => {
    fixture.componentRef.setInput('accessLevels', levels);
    fixture.detectChanges();

    expect(root().querySelector('#unit-records .unit-card-access')).toBeNull();
  });

  it('shows no label when no access levels are published', () => {
    fixture.detectChanges();

    expect(root().querySelectorAll('.unit-card-access')).toHaveLength(0);
    expect(root().querySelector('#unit-java-platform')?.getAttribute('aria-labelledby')).toBe(
      'unit-card-title-java-platform',
    );
  });
});
