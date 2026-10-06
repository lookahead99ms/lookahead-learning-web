import { TestBed } from '@angular/core/testing';
import {
  PRACTICE_CLOCK,
  PRACTICE_PROGRESS_KEY,
  PracticeProgressService,
  PracticeRecord,
  isReviewDue,
  parsePracticeProgress,
  reviewDateLabel,
} from './practice-progress';

describe('PracticeProgressService', () => {
  let storageDescriptor: PropertyDescriptor | undefined;
  let values: Map<string, string>;
  let now: Date;
  const useStorage = (storage: unknown) =>
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => storage });
  const saved = () => JSON.parse(values.get(PRACTICE_PROGRESS_KEY) ?? 'null');
  const service = () => {
    TestBed.configureTestingModule({ providers: [{ provide: PRACTICE_CLOCK, useValue: () => now }] });
    return TestBed.inject(PracticeProgressService);
  };
  const record = (patch: Partial<PracticeRecord> = {}): PracticeRecord => ({
    status: 'started',
    rating: null,
    reviewAt: null,
    notes: '',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...patch,
  });
  const payload = (problems: Record<string, unknown>) =>
    JSON.stringify({ schemaVersion: 'dsa-practice-local/v1', problems });

  beforeEach(() => {
    // Monday 5 October 2026, local time.
    now = new Date(2026, 9, 5, 10, 30);
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    values = new Map<string, string>();
    useStorage({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    });
  });
  afterEach(() => {
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(window, 'localStorage');
  });

  it('marks a problem started once and never downgrades a solve', () => {
    const progress = service();
    progress.markStarted('two-sum');
    expect(progress.record('two-sum')).toMatchObject({ status: 'started', rating: null, notes: '' });
    expect(saved().problems['two-sum'].status).toBe('started');

    progress.rate('two-sum', 'Solved with hints');
    progress.markStarted('two-sum');
    expect(progress.record('two-sum')).toMatchObject({ status: 'solved', rating: 'Solved with hints' });
    expect(progress.solvedIds().has('two-sum')).toBe(true);
    expect(saved()).toEqual({
      schemaVersion: 'dsa-practice-local/v1',
      problems: { 'two-sum': expect.objectContaining({ status: 'solved', updatedAt: now.toISOString() }) },
    });
  });

  it('schedules reviews on real local dates and computes when one is due', () => {
    const progress = service();
    progress.scheduleReview('two-sum', '3d');
    expect(progress.record('two-sum')!.reviewAt).toBe('2026-10-08');
    expect(reviewDateLabel('2026-10-08')).toBe('Thursday 8 October');
    expect(progress.reviewDueIds().has('two-sum')).toBe(false);
    progress.scheduleReview('two-sum', '1w');
    expect(progress.record('two-sum')!.reviewAt).toBe('2026-10-12');
    progress.scheduleReview('two-sum', 'none');
    expect(progress.record('two-sum')!.reviewAt).toBeNull();

    expect(isReviewDue(record({ reviewAt: '2026-10-05' }), '2026-10-05')).toBe(true);
    expect(isReviewDue(record({ reviewAt: '2026-10-04' }), '2026-10-05')).toBe(true);
    expect(isReviewDue(record({ reviewAt: '2026-10-06' }), '2026-10-05')).toBe(false);
    expect(isReviewDue(record(), '2026-10-05')).toBe(false);
    expect(isReviewDue(undefined, '2026-10-05')).toBe(false);
  });

  it('shows a due review ahead of solved and started', () => {
    values.set(
      PRACTICE_PROGRESS_KEY,
      payload({
        due: record({ status: 'solved', rating: 'Solved on my own', reviewAt: '2026-10-05' }),
        later: record({ status: 'solved', rating: 'Solved on my own', reviewAt: '2026-10-06' }),
        started: record(),
      }),
    );
    const progress = service();
    expect(progress.displayStatus('due')).toBe('review-due');
    expect(progress.displayStatus('later')).toBe('solved');
    expect(progress.displayStatus('started')).toBe('started');
    expect(progress.displayStatus('unknown')).toBeNull();
    expect([...progress.reviewDueIds()]).toEqual(['due']);
  });

  it('keeps working in memory when storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    const progress = service();
    expect(progress.records()).toEqual({});
    expect(progress.persisted()).toBe(false);
    progress.rate('two-sum', 'Needed the solution');
    progress.setNotes('two-sum', 'Off by one at the end.');
    expect(progress.record('two-sum')).toMatchObject({
      status: 'solved',
      rating: 'Needed the solution',
      notes: 'Off by one at the end.',
    });
    expect(progress.persisted()).toBe(false);
  });

  it('keeps working when saving throws, and says progress is not persisted', () => {
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Full', 'QuotaExceededError');
      },
    });
    const progress = service();
    expect(progress.persisted()).toBe(true);
    progress.markStarted('two-sum');
    expect(progress.record('two-sum')?.status).toBe('started');
    expect(progress.persisted()).toBe(false);
  });

  it('ignores malformed saved progress and keeps only valid records', () => {
    expect(parsePracticeProgress('{not json')).toEqual({});
    expect(parsePracticeProgress(JSON.stringify({ schemaVersion: 'other', problems: {} }))).toEqual({});
    expect(
      Object.keys(
        parsePracticeProgress(
          payload({
            ok: record(),
            badStatus: record({ status: 'done' as never }),
            badRating: record({ rating: 'Easy' as never }),
            badDate: record({ reviewAt: 'next week' }),
          }),
        ),
      ),
    ).toEqual(['ok']);
  });

  it('follows changes made in another tab through the storage event', () => {
    const progress = service();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PRACTICE_PROGRESS_KEY,
        newValue: payload({ 'two-sum': record({ status: 'solved', rating: 'Solved on my own' }) }),
      }),
    );
    expect(progress.solvedIds().has('two-sum')).toBe(true);

    window.dispatchEvent(new StorageEvent('storage', { key: 'another-key', newValue: payload({}) }));
    expect(progress.solvedIds().has('two-sum')).toBe(true);

    // Clearing site data in another tab arrives with a null key.
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(progress.records()).toEqual({});
  });

  it('merges with progress another tab saved before this one writes', () => {
    const progress = service();
    values.set(PRACTICE_PROGRESS_KEY, payload({ other: record({ notes: 'From the other tab' }) }));
    progress.markStarted('two-sum');
    expect(Object.keys(saved().problems).sort()).toEqual(['other', 'two-sum']);
    expect(progress.record('other')?.notes).toBe('From the other tab');
  });

  it('does not touch the study plan key', () => {
    values.set('look-ahead.study-plan.v1', '{"schemaVersion":"study-plan-local/v1"}');
    const progress = service();
    progress.rate('two-sum', 'Solved on my own');
    expect(values.get('look-ahead.study-plan.v1')).toBe('{"schemaVersion":"study-plan-local/v1"}');
  });
  it('keeps the review choice, and still loads records saved before it existed', () => {
    values.set(
      PRACTICE_PROGRESS_KEY,
      payload({
        old: record({ status: 'solved', rating: 'Solved on my own', reviewAt: '2026-10-08' }),
        bad: record({ reviewChoice: '2w' as never }),
      }),
    );
    const progress = service();
    expect(progress.record('old')?.reviewChoice).toBeUndefined();
    expect(progress.record('old')?.reviewAt).toBe('2026-10-08');
    expect(progress.record('bad')).toBeUndefined();
    progress.scheduleReview('old', '1w');
    expect(saved().problems.old).toMatchObject({ reviewChoice: '1w', reviewAt: '2026-10-12' });
    progress.scheduleReview('old', 'none');
    expect(saved().problems.old).toMatchObject({ reviewChoice: 'none', reviewAt: null });
  });

  it('takes a rating back to started', () => {
    const progress = service();
    progress.rate('two-sum', 'Solved on my own');
    progress.unrate('two-sum');
    expect(progress.record('two-sum')).toMatchObject({ status: 'started', rating: null });
    expect(progress.solvedIds().has('two-sum')).toBe(false);
    expect(progress.startedIds().has('two-sum')).toBe(true);
  });

  it('clears progress but keeps notes unless asked, and removes an empty record', () => {
    const progress = service();
    progress.rate('two-sum', 'Solved with hints');
    progress.scheduleReview('two-sum', '3d');
    progress.setNotes('two-sum', 'Keep the map before the loop.');
    progress.clear('two-sum');
    expect(progress.record('two-sum')).toMatchObject({
      status: null,
      rating: null,
      reviewAt: null,
      notes: 'Keep the map before the loop.',
    });
    expect(progress.record('two-sum')?.reviewChoice).toBeUndefined();
    expect(progress.displayStatus('two-sum')).toBeNull();
    expect(progress.startedIds().has('two-sum')).toBe(false);
    expect(saved().problems['two-sum'].status).toBeNull();
    // A notes-only record still reads back after a reload.
    expect(parsePracticeProgress(values.get(PRACTICE_PROGRESS_KEY)!)['two-sum'].notes).toBe(
      'Keep the map before the loop.',
    );
    progress.markStarted('two-sum');
    expect(progress.record('two-sum')?.status).toBe('started');

    progress.clear('two-sum', true);
    expect(progress.record('two-sum')).toBeUndefined();
    expect(saved().problems['two-sum']).toBeUndefined();

    progress.markStarted('no-notes');
    progress.clear('no-notes');
    expect(saved().problems['no-notes']).toBeUndefined();
  });
});
