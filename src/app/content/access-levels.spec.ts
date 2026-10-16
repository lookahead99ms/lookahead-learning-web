import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  ACCESS_LEVELS_HREF,
  AccessLevelsService,
  accessLabelFor,
  accessLevelAccessibleText,
  accessLevelLabel,
  accessViewerFor,
  freeLessonsLabel,
  parseAccessLevels,
} from './access-levels';

const ACCESS_LEVELS_FIXTURE = {
  schemaVersion: 'content-access-levels/v1',
  policyVersion: 'samples-test-v1',
  defaultLevel: 'pro',
  units: {
    'learn/core-java/java-platform': 'open',
    'learn/core-java/error-handling': 'free',
    'learn/core-java/generics': 'free',
    'blaze/system-design/interview-method': 'open',
  },
};

describe('access levels', () => {
  it('maps each level to its plain label and accessible wording', () => {
    expect(accessLevelLabel('open')).toBe('Open');
    expect(accessLevelLabel('free')).toBe('Free with account');
    expect(accessLevelLabel('pro')).toBe('Paid');
    expect(accessLevelAccessibleText('free')).toBe('Access: Free with account');
  });

  it('labels units for a signed-out visitor: Open, Sign in to read, Paid plan (DLV-209)', () => {
    expect(accessLabelFor('open', 'signed-out')).toBe('Open');
    expect(accessLabelFor('free', 'signed-out')).toBe('Sign in to read');
    expect(accessLabelFor('pro', 'signed-out')).toBe('Paid plan');
  });

  it('shows a signed-in learner only Paid plan, and only without course access', () => {
    for (const level of ['open', 'free', 'pro'] as const) {
      expect(accessLabelFor(level, 'has-access')).toBeNull();
    }
    expect(accessLabelFor('open', 'no-access')).toBeNull();
    expect(accessLabelFor('free', 'no-access')).toBeNull();
    expect(accessLabelFor('pro', 'no-access')).toBe('Paid plan');
  });

  it('reads course access from grants, full curriculum, author preview and the tester role', () => {
    const learner = { topicGrants: ['learn:core-java'] };
    expect(accessViewerFor(null, 'learn', 'core-java')).toBe('signed-out');
    expect(accessViewerFor(learner, 'learn', 'core-java')).toBe('has-access');
    expect(accessViewerFor(learner, 'learn', 'spring-framework')).toBe('no-access');
    expect(accessViewerFor(learner, 'grow', 'core-java')).toBe('no-access');
    // Legacy Look Ahead grants count for Blaze courses.
    expect(
      accessViewerFor({ topicGrants: ['look-ahead:system-design'] }, 'blaze', 'system-design'),
    ).toBe('has-access');
    expect(
      accessViewerFor({ topicGrants: [], permissions: { fullCurriculum: true } }, 'grow', 'kafka'),
    ).toBe('has-access');
    expect(accessViewerFor({ topicGrants: [], authorPreview: true }, 'grow', 'kafka')).toBe(
      'has-access',
    );
    expect(
      accessViewerFor({ topicGrants: [], permissions: { feedbackRole: 'tester' } }, 'grow', 'kafka'),
    ).toBe('has-access');
    expect(
      accessViewerFor(
        { topicGrants: [], permissions: { fullCurriculum: false, feedbackRole: 'none' } },
        'grow',
        'kafka',
      ),
    ).toBe('no-access');
  });

  it('reads listed units as open or free and every other unit as Paid', () => {
    const levels = parseAccessLevels(ACCESS_LEVELS_FIXTURE)!;
    expect(levels.policyVersion).toBe('samples-test-v1');
    expect(levels.levelFor('learn', 'core-java', 'java-platform')).toBe('open');
    expect(levels.levelFor('learn', 'core-java', 'error-handling')).toBe('free');
    expect(levels.levelFor('learn', 'core-java', 'collections')).toBe('pro');
    expect(levels.levelFor('blaze', 'ai-systems-architecture', 'any-unit')).toBe('pro');
    // The same unit ID in another course is a different unit.
    expect(levels.levelFor('grow', 'core-java', 'java-platform')).toBe('pro');
  });

  it('counts open and free units per course for the catalog line', () => {
    const levels = parseAccessLevels(ACCESS_LEVELS_FIXTURE)!;
    expect(levels.freeUnitCount('learn', 'core-java')).toBe(3);
    expect(levels.freeUnitCount('blaze', 'system-design')).toBe(1);
    expect(levels.freeUnitCount('grow', 'spring-framework')).toBe(0);
    expect(freeLessonsLabel(3)).toBe('3 free lessons');
    expect(freeLessonsLabel(1)).toBe('1 free lesson');
    expect(freeLessonsLabel(0)).toBeNull();
  });

  it('keeps the policy order of entries', () => {
    expect(
      parseAccessLevels(ACCESS_LEVELS_FIXTURE)!
        .entries()
        .map((entry) => `${entry.path}/${entry.courseId}/${entry.unitId}:${entry.level}`),
    ).toEqual([
      'learn/core-java/java-platform:open',
      'learn/core-java/error-handling:free',
      'learn/core-java/generics:free',
      'blaze/system-design/interview-method:open',
    ]);
  });

  it('rejects anything but the published shape, so no wrong label is shown', () => {
    for (const value of [
      null,
      'text',
      [],
      { ...ACCESS_LEVELS_FIXTURE, schemaVersion: 'content-access-levels/v2' },
      { ...ACCESS_LEVELS_FIXTURE, defaultLevel: 'free' },
      { ...ACCESS_LEVELS_FIXTURE, units: [] },
      { ...ACCESS_LEVELS_FIXTURE, units: { 'learn/core-java/java-platform': 'pro' } },
      { ...ACCESS_LEVELS_FIXTURE, units: { 'learn/core-java': 'open' } },
      { ...ACCESS_LEVELS_FIXTURE, units: { 'other/core-java/java-platform': 'open' } },
    ]) {
      expect(parseAccessLevels(value)).toBeNull();
    }
  });
});

describe('AccessLevelsService', () => {
  function setUp(withHttp = true) {
    TestBed.configureTestingModule({
      providers: withHttp ? [provideHttpClient(), provideHttpClientTesting()] : [],
    });
    return TestBed.inject(AccessLevelsService);
  }

  it('loads the public file once and shares it', async () => {
    const service = setUp();
    const first = firstValueFrom(service.levels$);
    const second = firstValueFrom(service.levels$);
    TestBed.inject(HttpTestingController).expectOne(ACCESS_LEVELS_HREF).flush(ACCESS_LEVELS_FIXTURE);
    expect((await first)?.levelFor('learn', 'core-java', 'generics')).toBe('free');
    expect(await second).toBe(await first);
    expect(service.levels()?.freeUnitCount('learn', 'core-java')).toBe(3);
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows no labels when the file is missing or malformed', async () => {
    const service = setUp();
    const levels = firstValueFrom(service.levels$);
    TestBed.inject(HttpTestingController)
      .expectOne(ACCESS_LEVELS_HREF)
      .flush('missing', { status: 404, statusText: 'Not Found' });
    expect(await levels).toBeNull();
    expect(service.levels()).toBeNull();
  });

  it('works without an HTTP backend', async () => {
    const service = setUp(false);
    expect(await firstValueFrom(service.levels$)).toBeNull();
    expect(service.levels()).toBeNull();
  });
});
