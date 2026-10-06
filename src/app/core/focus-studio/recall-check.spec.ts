import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RECALL_CHECK_KEY, RecallCheckStore, recallSuggestion } from './recall-check';

describe('Recall card checks', () => {
  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('suggests from the grades: any Missed, then any Partly, then every card Got it', () => {
    const check = (grades: Record<string, 'got' | 'partly' | 'missed'>, total = 3) => ({ open: [], grades, total });
    expect(recallSuggestion(undefined)).toBeNull();
    expect(recallSuggestion(check({}))).toBeNull();
    expect(recallSuggestion(check({ a: 'got', b: 'got' }))).toBeNull();
    expect(recallSuggestion(check({ a: 'got', b: 'got', c: 'got' }))).toEqual({
      rating: 'Solved on my own',
      review: 'none',
      text: 'From your answers: solved on my own, no review needed.',
    });
    expect(recallSuggestion(check({ a: 'got', b: 'partly' }))).toEqual({
      rating: 'Solved with hints',
      review: '1w',
      text: 'From your answers: solved with hints, review in 1 week.',
    });
    expect(recallSuggestion(check({ a: 'partly', b: 'missed', c: 'got' }))?.rating).toBe('Needed the solution');
    expect(recallSuggestion(check({ a: 'missed' }))?.review).toBe('3d');
  });

  it('keeps open answers and grades per problem in session storage', () => {
    const store = TestBed.inject(RecallCheckStore);
    store.setOpen('p1', 'a', true, 2);
    store.grade('p1', 'a', 'partly', 2);
    store.setAllOpen('p2', ['x', 'y'], true);
    expect(store.check('p1')).toEqual({ open: ['a'], grades: { a: 'partly' }, total: 2 });
    expect(store.check('p2').open).toEqual(['x', 'y']);
    expect(store.check('p3')).toEqual({ open: [], grades: {}, total: 0 });
    TestBed.resetTestingModule();
    const restored = TestBed.inject(RecallCheckStore);
    expect(restored.check('p1')).toEqual({ open: ['a'], grades: { a: 'partly' }, total: 2 });
    restored.grade('p1', 'a', 'partly', 2);
    expect(restored.check('p1').grades).toEqual({});
  });

  it('ignores a malformed saved value and works in memory when storage throws', () => {
    sessionStorage.setItem(RECALL_CHECK_KEY, JSON.stringify({ p1: { open: 'a', grades: {}, total: 1 }, p2: { open: [], grades: { a: 'maybe' }, total: 1 } }));
    expect(TestBed.inject(RecallCheckStore).check('p1').open).toEqual([]);
    TestBed.resetTestingModule();
    sessionStorage.setItem(RECALL_CHECK_KEY, '{not json');
    expect(TestBed.inject(RecallCheckStore).check('p1').open).toEqual([]);
    TestBed.resetTestingModule();

    const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      const store = TestBed.inject(RecallCheckStore);
      store.grade('p1', 'a', 'got', 1);
      expect(store.check('p1').grades).toEqual({ a: 'got' });
    } finally {
      if (descriptor) Object.defineProperty(window, 'sessionStorage', descriptor);
    }
  });
});
