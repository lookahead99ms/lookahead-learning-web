import { describe, expect, it } from 'vitest';
import { FOCUS_STUDIO_PILOT, focusStudioPattern } from '../../content/focus-studio-pilot';
import {
  StudioState,
  closeStudioReference,
  createStudioState,
  lockStudio,
  migrateStudioState,
  setStudioLanguage,
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
  it('returns to Recall with the page-level Problem preference intact', () => {
    const state = {
      ...createStudioState('first', 'go'),
      mode: 'recall' as const,
      problemExpanded: false,
    };
    const returned = closeStudioReference(visualizeStudio(state));
    expect(returned.mode).toBe('recall');
    expect(returned.problemExpanded).toBe(false);
    expect(visualizeStudio({ ...state, problemExpanded: true }).problemExpanded).toBe(true);
  });
  it('stays in Visual when visualization started there', () => {
    const state = { ...createStudioState('first', 'python'), mode: 'visual' as const };
    expect(closeStudioReference(visualizeStudio(state)).mode).toBe('visual');
  });
  it('opens a plain Visualize handoff on the walkthrough steps with the same example', () => {
    let state = updateStudioMode({ ...createStudioState('first', 'go'), mode: 'approach' }, { fixtureId: 'second' });
    state = stepStudio({ ...state, mode: 'visual' }, 4);
    state = updateStudioMode(state, { debugger: true });
    const visual = visualizeStudio({ ...state, mode: 'approach' });
    expect(visual.mode).toBe('visual');
    expect(visual.visualizationOrigin).toBe('approach');
    expect(visual.modes.visual).toMatchObject({ fixtureId: 'second', language: 'go', debugger: false });
    // The walkthrough keeps its own line memory for later.
    expect(visual.modes.visual.positions['first/go']).toBe(4);
    expect(visualizeStudio({ ...state, mode: 'recall' }, { fixtureId: 'story' }).modes.visual.fixtureId).toBe('story');
  });
  it('marks an example the learner picks as chosen, per tab', () => {
    const fresh = { ...createStudioState('first', 'java'), mode: 'approach' as const };
    expect(fresh.modes.approach.chosen).toBeUndefined();
    // Patches that keep the example (a cursor, a reveal, the same example) are not a pick.
    expect(stepStudio(fresh, 2).modes.approach.chosen).toBeUndefined();
    expect(updateStudioMode(fresh, { revealed: true, fixtureId: 'first' }).modes.approach.chosen).toBeUndefined();
    // Picking another example, and back to the first, keeps the pick.
    const picked = updateStudioMode(updateStudioMode(fresh, { fixtureId: 'second' }), { fixtureId: 'first' });
    expect(picked.modes.approach).toMatchObject({ fixtureId: 'first', chosen: true });
    expect(picked.modes.recall.chosen).toBeUndefined();
    // A patch that sets the flag itself (a handoff) keeps its own value.
    expect(updateStudioMode(fresh, { fixtureId: 'second', chosen: false }).modes.approach.chosen).toBe(false);
  });
  it('keeps a chosen example over the animated default when Visualize starts in Approach or Recall', () => {
    for (const mode of ['approach', 'recall'] as const) {
      const fresh = { ...createStudioState('first', 'go'), mode };
      // Never picked: the story's animated example.
      const fallback = visualizeStudio(fresh, { fixtureId: 'story' });
      expect(fallback.modes.visual).toMatchObject({ fixtureId: 'story', chosen: false });
      expect(fallback.visualizationOrigin).toBe(mode);
      // Picked, even the problem's first example: that example, which the story may not animate.
      const picked = updateStudioMode(updateStudioMode(fresh, { fixtureId: 'second' }), { fixtureId: 'first' });
      const visual = visualizeStudio(picked, { fixtureId: 'story' });
      expect(visual.mode).toBe('visual');
      expect(visual.visualizationOrigin).toBe(mode);
      expect(visual.modes.visual).toMatchObject({ fixtureId: 'first', language: 'go', chosen: true, debugger: false });
      // The origin's memory is untouched and Close visualization returns there.
      expect(visual.modes[mode]).toEqual(picked.modes[mode]);
      expect(closeStudioReference(visual).mode).toBe(mode);
      // A pick in another tab does not count for this one.
      const elsewhere = updateStudioMode({ ...fresh, mode: 'practice' }, { fixtureId: 'second' });
      expect(visualizeStudio({ ...elsewhere, mode }, { fixtureId: 'story' }).modes.visual.fixtureId).toBe('story');
    }
  });
  it('loads a state saved before the chosen flag as not chosen', () => {
    const saved = JSON.parse(JSON.stringify(createStudioState('first', 'python'))) as StudioState;
    for (const mode of Object.values(saved.modes)) delete (mode as { chosen?: boolean }).chosen;
    expect(migrateStudioState(saved)).toBe(saved);
    const visual = visualizeStudio({ ...saved, mode: 'recall' }, { fixtureId: 'story' });
    expect(visual.modes.visual.fixtureId).toBe('story');
    // Without a default (the migration's own handoff) the tab's example is kept.
    expect(visualizeStudio({ ...saved, mode: 'recall' }).modes.visual.fixtureId).toBe('first');
  });
  it('restores a state saved before "Code beside" through every transition', () => {
    // The pre-redesign shape, as plain JSON: the Approach guided debugger handed to the walkthrough.
    const saved = JSON.parse(
      JSON.stringify({
        mode: 'visual',
        problemExpanded: true,
        visualizationOrigin: 'approach',
        modes: Object.fromEntries(
          (['practice', 'approach', 'visual', 'recall'] as const).map((mode) => [
            mode,
            {
              fixtureId: 'first',
              language: 'python',
              positions: mode === 'practice' ? {} : { 'first/python': 6 },
              revealed: mode !== 'practice',
              debugger: mode === 'approach' || mode === 'visual',
              support: true,
            },
          ]),
        ),
      }),
    ) as StudioState;
    // The visual "debugger" flag reads as Every line, on the same line.
    expect(saved.modes.visual.debugger).toBe(true);
    expect(studioPosition(saved)).toEqual({ fixtureId: 'first', language: 'python', step: 6 });
    const back = closeStudioReference(saved);
    expect(back.mode).toBe('approach');
    expect(back.modes.approach).toEqual(saved.modes.approach);
    // From the restored Approach debugger, Visualize still carries its exact line into Every line.
    const again = visualizeStudio(back);
    expect(again.modes.visual).toMatchObject({ debugger: true, fixtureId: 'first' });
    expect(studioPosition(again).step).toBe(6);
    expect(setStudioLanguage(saved, 'java').modes.recall.language).toBe('java');
    const locked = lockStudio(saved);
    expect(Object.values(locked.modes).every((mode) => !mode.debugger && !mode.revealed)).toBe(true);
    expect(locked.visualizationOrigin).toBeNull();
  });
  it('moves a guided debugger from an earlier state to the walkthrough\'s Every line', () => {
    const fresh = createStudioState('first', 'go');
    // A current state, Every line included, comes back as the same object.
    expect(migrateStudioState(fresh)).toBe(fresh);
    const everyLine = updateStudioMode({ ...fresh, mode: 'visual' }, { revealed: true, debugger: true });
    expect(migrateStudioState(everyLine)).toBe(everyLine);
    // The debugger open in the current tab hands off on the same example, language and line.
    let open = updateStudioMode({ ...fresh, mode: 'approach' }, { fixtureId: 'second', revealed: true, debugger: true });
    open = stepStudio(open, 3);
    open = updateStudioMode({ ...open, mode: 'recall' }, { revealed: true, debugger: true });
    const migrated = migrateStudioState({ ...open, mode: 'approach' });
    expect(migrated.mode).toBe('visual');
    expect(migrated.visualizationOrigin).toBe('approach');
    expect(migrated.modes.visual).toMatchObject({ fixtureId: 'second', language: 'go', debugger: true, revealed: true });
    expect(studioPosition(migrated)).toEqual({ fixtureId: 'second', language: 'go', step: 3 });
    // Every other debugger is closed, as its close button did; positions stay.
    for (const mode of ['practice', 'approach', 'recall'] as const)
      expect(migrated.modes[mode]).toMatchObject({ debugger: false, revealed: false });
    expect(migrated.modes.approach.positions).toEqual({ 'second/go': 3 });
    expect(migrateStudioState(migrated)).toBe(migrated);
    // Close visualization returns to the tab the debugger was open in.
    expect(closeStudioReference(migrated).mode).toBe('approach');
    // A handoff saved with the debugger still open behind it keeps the walkthrough as it was.
    const handedOff = migrateStudioState({ ...open, mode: 'visual', visualizationOrigin: 'recall' });
    expect(handedOff.mode).toBe('visual');
    expect(handedOff.visualizationOrigin).toBe('recall');
    expect(handedOff.modes.visual).toEqual(open.modes.visual);
    expect(handedOff.modes.recall).toMatchObject({ debugger: false, revealed: false });
  });
});
