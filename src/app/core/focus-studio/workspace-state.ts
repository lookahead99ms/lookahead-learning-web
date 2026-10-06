import { PatternLanguage } from '../../content/content.models';

export type StudioMode = 'practice' | 'approach' | 'visual' | 'recall';
export interface StudioPosition {
  fixtureId: string;
  language: PatternLanguage;
  step: number;
}
export interface StudioModeState {
  fixtureId: string;
  language: PatternLanguage;
  positions: Record<string, number>;
  revealed: boolean;
  /**
   * The line-by-line trace is open: the Visual walkthrough's "Every line" switch ("Code beside",
   * 2026-10-06). Only the visual mode sets it; the field keeps its name so earlier states still
   * load, and `migrateStudioState` moves an older guided debugger in another tab to the walkthrough.
   */
  debugger: boolean;
  support: boolean;
  /**
   * The learner picked this tab's example (Problem panel, reference or walkthrough selector), so a
   * "Visualize solution" handoff keeps it instead of the story's animated example. Optional: a
   * state kept before the flag (2026-10-06) loads as "not chosen", today's default.
   */
  chosen?: boolean;
}
export interface StudioState {
  mode: StudioMode;
  problemExpanded: boolean;
  modes: Record<StudioMode, StudioModeState>;
  visualizationOrigin: StudioMode | null;
}
export function createStudioState(fixtureId: string, language: PatternLanguage): StudioState {
  const mode = (): StudioModeState => ({
    fixtureId,
    language,
    positions: {},
    revealed: false,
    debugger: false,
    support: true,
  });
  return {
    mode: 'practice',
    problemExpanded: true,
    modes: { practice: mode(), approach: mode(), visual: mode(), recall: mode() },
    visualizationOrigin: null,
  };
}
export function studioPosition(state: StudioState): StudioPosition {
  const mode = state.modes[state.mode];
  return {
    fixtureId: mode.fixtureId,
    language: mode.language,
    step: mode.positions[`${mode.fixtureId}/${mode.language}`] ?? 0,
  };
}
/**
 * Patches the current tab's memory. A patch that changes the example is the learner's pick and
 * marks it `chosen`, unless the patch sets `chosen` itself (a handoff that carries the example).
 */
export function updateStudioMode(state: StudioState, patch: Partial<StudioModeState>): StudioState {
  const mode = state.modes[state.mode];
  const picked = patch.fixtureId !== undefined && patch.fixtureId !== mode.fixtureId && !('chosen' in patch);
  return {
    ...state,
    modes: { ...state.modes, [state.mode]: { ...mode, ...patch, ...(picked ? { chosen: true } : {}) } },
  };
}
/**
 * One language for the whole problem page (review note, 2026-10-04): Your code, the reference
 * solution and the visual walkthrough always show the same language, so every mode takes it.
 */
export function setStudioLanguage(state: StudioState, language: PatternLanguage): StudioState {
  const modes = Object.fromEntries(
    Object.entries(state.modes).map(([mode, value]) => [mode, { ...value, language }]),
  ) as StudioState['modes'];
  return { ...state, modes };
}
export function stepStudio(state: StudioState, step: number): StudioState {
  const mode = state.modes[state.mode];
  return updateStudioMode(state, {
    positions: { ...mode.positions, [`${mode.fixtureId}/${mode.language}`]: Math.max(0, step) },
  });
}
/**
 * An explicit handoff ("Visualize solution") opens the Visual walkthrough on the same example and
 * language, without mutating the origin's mode memory. It opens on the walkthrough's steps; a
 * source that was stepping line by line (a guided debugger restored from an earlier state, see
 * `migrateStudioState`) carries its exact line into "Every line". `fixtureId` is the default
 * example (the story's animated one) for a tab whose example the learner never picked; a picked
 * (`chosen`) example always wins, even when the story does not animate it.
 */
export function visualizeStudio(state: StudioState, options: { fixtureId?: string } = {}): StudioState {
  const position = studioPosition(state);
  const lines = state.modes[state.mode]?.debugger === true;
  const chosen = state.modes[state.mode]?.chosen === true;
  const next = updateStudioMode(
    {
      ...state,
      mode: 'visual',
      visualizationOrigin: state.mode === 'visual' ? state.visualizationOrigin : state.mode,
    },
    {
      fixtureId: chosen ? position.fixtureId : (options.fixtureId ?? position.fixtureId),
      chosen,
      language: position.language,
      revealed: lines,
      debugger: lines,
    },
  );
  return lines ? stepStudio(next, position.step) : next;
}
export function closeStudioReference(state: StudioState): StudioState {
  const origin = state.mode === 'visual' ? state.visualizationOrigin : null;
  const next = updateStudioMode(state, { revealed: false, debugger: false });
  return {
    ...next,
    mode: origin ?? state.mode,
    visualizationOrigin: state.mode === 'visual' ? null : state.visualizationOrigin,
  };
}
/**
 * A state kept before "Code beside" (2026-10-06) can hold a guided debugger open in Try it
 * yourself, Approach or Recall. That debugger is gone: an open one becomes the Visual
 * walkthrough's "Every line" on the same example, language and line, handed off from its tab so
 * "Close visualization" returns there; one left open in another tab is closed, as its close
 * button did. A current state comes back unchanged (the same object).
 */
export function migrateStudioState(state: StudioState): StudioState {
  const stale = (mode: StudioMode) => mode !== 'visual' && state.modes[mode]?.debugger === true;
  const modes = Object.keys(state.modes) as StudioMode[];
  if (!modes.some(stale)) return state;
  const next = stale(state.mode) ? visualizeStudio(state) : state;
  return {
    ...next,
    modes: Object.fromEntries(
      modes.map((mode) => [
        mode,
        stale(mode) ? { ...next.modes[mode], revealed: false, debugger: false } : next.modes[mode],
      ]),
    ) as StudioState['modes'],
  };
}
/** A timed attempt locks the solution: every mode closes its reference and debugger. */
export function lockStudio(state: StudioState): StudioState {
  const modes = Object.fromEntries(
    Object.entries(state.modes).map(([mode, value]) => [mode, { ...value, revealed: false, debugger: false }]),
  ) as StudioState['modes'];
  return { ...state, modes, visualizationOrigin: null };
}
