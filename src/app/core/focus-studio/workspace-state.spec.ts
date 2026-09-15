import { describe, expect, it } from 'vitest';
import { FOCUS_STUDIO_PILOT, focusStudioPattern } from '../../content/focus-studio-pilot';
import {
  closeStudioReference,
  createStudioState,
  stepStudio,
  studioPosition,
  updateStudioMode,
  visualizeStudio,
} from './workspace-state';

describe('Focus Studio mode memory', () => {
  it('preserves the reviewed twelve mappings and classifies catalog metadata', () => {
    expect(Object.keys(FOCUS_STUDIO_PILOT)).toHaveLength(12);
    expect(focusStudioPattern('algorithmic-kth-largest-element-array')).toBe('heaps');
    expect(focusStudioPattern('algorithmic-binary-search')).toBeNull();
    expect(focusStudioPattern('toString')).toBeNull();
    expect(
      focusStudioPattern({
        id: 'algorithmic-binary-search',
        title: 'Binary Search',
        variation: 'Boundary search',
        tags: ['Binary Search'],
      }),
    ).toBe('generic');
    expect(
      focusStudioPattern({
        id: 'algorithmic-find-minimum-interval',
        title: 'Minimum Interval',
        variation: 'Sorted interval sweep',
        tags: ['Intervals'],
      }),
    ).toBe('intervals');
  });
  it('keeps first visits independent and answer-hidden', () => {
    const initial = createStudioState('first', 'java');
    const practice = stepStudio(updateStudioMode(initial, { revealed: true, debugger: true }), 7);
    const visual = { ...practice, mode: 'visual' as const };
    expect(studioPosition(visual).step).toBe(0);
    expect(visual.modes.visual.revealed).toBe(false);
    expect(studioPosition({ ...visual, mode: 'practice' }).step).toBe(7);
  });
  it('restores cursor independently for each example and language', () => {
    let state = stepStudio(createStudioState('first', 'java'), 8);
    state = stepStudio(updateStudioMode(state, { fixtureId: 'second' }), 2);
    state = stepStudio(updateStudioMode(state, { language: 'go' }), 5);
    expect(studioPosition(updateStudioMode(state, { language: 'java' })).step).toBe(2);
    expect(
      studioPosition(updateStudioMode(state, { language: 'java', fixtureId: 'first' })).step,
    ).toBe(8);
  });
  it('hands the exact source position to visual mode without mutating the origin', () => {
    const state = stepStudio(
      updateStudioMode(createStudioState('first', 'python'), { revealed: true, debugger: true }),
      9,
    );
    const origin = structuredClone(state.modes.practice);
    const visual = visualizeStudio(state);
    expect(studioPosition(visual)).toEqual(studioPosition(state));
    const moved = stepStudio(visual, 13);
    const returned = closeStudioReference(moved);
    expect(returned.mode).toBe('practice');
    expect(returned.modes.practice).toEqual(origin);
    expect(returned.modes.visual.positions['first/python']).toBe(13);
    expect(returned.visualizationOrigin).toBeNull();
  });
  it('returns to Recall and retains normal/debug problem pin preferences', () => {
    const state = updateStudioMode(
      { ...createStudioState('first', 'go'), mode: 'recall' },
      { normalProblem: false, debuggerProblem: true },
    );
    const returned = closeStudioReference(visualizeStudio(state));
    expect(returned.mode).toBe('recall');
    expect(returned.modes.recall.normalProblem).toBe(false);
    expect(returned.modes.recall.debuggerProblem).toBe(true);
  });
  it('stays in Visual when visualization started there', () => {
    const state = { ...createStudioState('first', 'python'), mode: 'visual' as const };
    expect(closeStudioReference(visualizeStudio(state)).mode).toBe('visual');
  });
});
