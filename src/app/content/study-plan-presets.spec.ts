import { STUDY_PLAN_PRESETS, resolveStudyPlanPreset } from './study-plan-presets';
import { StudyPlanTopic } from './study-plan';

describe('career Study Plan starting points', () => {
  it('keeps unavailable scopes out of the selection and discloses a partial starting point', () => {
    const preset = STUDY_PLAN_PRESETS.find((item) => item.id === 'ai-engineer')!;
    const topics = preset.topicIds.slice(0, 3).map((id) => ({ id }) as StudyPlanTopic);
    const result = resolveStudyPlanPreset(
      preset,
      topics,
      new Set([preset.topicIds[0], preset.topicIds[3], 'forged:scope']),
    );
    expect(result.selectedIds).toEqual([preset.topicIds[0]]);
    expect(result.unavailableIds).toEqual(preset.topicIds.slice(1));
    // DLV-935: AI Builds is only in the two AI project plans, so this starting point has four topics.
    expect(preset.topicIds).toHaveLength(4);
  });
  it('does not invent access when none of a starting point is available', () => {
    const preset = STUDY_PLAN_PRESETS[0];
    expect(resolveStudyPlanPreset(preset, [], new Set()).selectedIds).toEqual([]);
    expect(resolveStudyPlanPreset(preset, [], new Set()).unavailableIds).toEqual(preset.topicIds);
  });
});
