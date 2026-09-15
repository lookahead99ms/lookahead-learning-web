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
  debugger: boolean;
  support: boolean;
  normalProblem: boolean;
  debuggerProblem: boolean;
}
export interface StudioState {
  mode: StudioMode;
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
    normalProblem: true,
    debuggerProblem: false,
  });
  return {
    mode: 'practice',
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
export function updateStudioMode(state: StudioState, patch: Partial<StudioModeState>): StudioState {
  return {
    ...state,
    modes: { ...state.modes, [state.mode]: { ...state.modes[state.mode], ...patch } },
  };
}
export function stepStudio(state: StudioState, step: number): StudioState {
  const mode = state.modes[state.mode];
  return updateStudioMode(state, {
    positions: { ...mode.positions, [`${mode.fixtureId}/${mode.language}`]: Math.max(0, step) },
  });
}
/** An explicit handoff copies the source position without mutating its mode memory. */
export function visualizeStudio(state: StudioState): StudioState {
  const position = studioPosition(state);
  const next = updateStudioMode(
    {
      ...state,
      mode: 'visual',
      visualizationOrigin: state.mode === 'visual' ? state.visualizationOrigin : state.mode,
    },
    { fixtureId: position.fixtureId, language: position.language, revealed: true, debugger: true },
  );
  return stepStudio(next, position.step);
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
