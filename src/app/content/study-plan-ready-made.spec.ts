import { describe, expect, it } from 'vitest';
import { studyDayQueue } from './study-plan-daily';
import { previewStudyPlanRecovery } from './study-plan-recovery';
import {
  READY_MADE_HOURS,
  ReadyMadeTemplate,
  isReadyMadeCatalog,
  readyMadePlan,
} from './study-plan-ready-made';

const template: ReadyMadeTemplate = {
  schemaVersion: 'study-plan-template/v1',
  templateId: 'sample-d7-h1',
  templateVersion: 'v1',
  pathId: 'sample',
  durationDays: 7,
  dailyHours: 1,
  availabilityUnit: 'hours-per-day',
  intensive: false,
  intendedUse: 'Interview revision and targeted gaps',
  provenance: {
    algorithmVersion: 'ready-made-schedule/v1',
    catalogVersion: 'content-v1',
    rankingVersion: null,
    blueprintVersion: 'blueprint-v1',
    sourceContentVersion: 'source-v1',
  },
  startingKnowledge: [],
  assumedPrerequisiteIds: [],
  topicIds: ['grow:sample'],
  references: [
    {
      contentId: 'sample-content',
      topicId: 'grow:sample',
      title: 'Sample content',
      courseTitle: 'Sample course',
      contentType: 'theory',
      route: ['/', 'grow', 'sample', 'content'],
      contentVersion: 'v1',
      prerequisiteIds: [],
    },
  ],
  days: [
    {
      day: 1,
      phase: 'revision',
      sessions: [
        {
          id: 'refresh-1',
          kind: 'review',
          activity: 'Refresh',
          contentId: 'sample-content',
          minutes: 20,
          instructions: 'Recall the contract.',
          prerequisiteIds: [],
          requiredSessionIds: [],
          review: {
            basis: 'declared-familiarity',
            sourceSessionId: null,
            sourceDay: null,
            dueDay: 1,
          },
        },
      ],
      scheduledMinutes: 20,
      focusedMinutes: 20,
      recoveryMinutes: 0,
      unallocatedMinutes: 40,
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      day: index + 2,
      phase: 'open',
      sessions: [],
      scheduledMinutes: 0,
      focusedMinutes: 0,
      recoveryMinutes: 0,
      unallocatedMinutes: 60,
    })),
  ],
  coverage: {
    selectedContentCount: 1,
    availableContentCount: 1,
    scheduledMinutes: 20,
    unallocatedMinutes: 400,
    uncoveredContentIds: [],
    uncoveredScope: ['Synthetic scope only.'],
  },
  futureReviews: [],
};

describe('ready-made study plans', () => {
  it('allows confirmed nine-hour daily availability only for the seven- and fourteen-day windows', () => {
    expect(READY_MADE_HOURS).toEqual({
      7: [1, 2, 3, 4, 6, 9],
      14: [1, 2, 3, 4, 6, 9],
      21: [1, 2, 3, 4],
      30: [1, 2, 3, 4],
      60: [1, 2, 3],
      90: [1, 2, 3],
      120: [1, 2],
      180: [1, 2],
    });
  });

  it('validates the picker boundary and maps authored work without scheduling recovery as completion', () => {
    expect(
      isReadyMadeCatalog({
        schemaVersion: 'study-plan-picker/v1',
        catalogVersion: 'picker-v1',
        availabilityUnit: 'hours-per-day',
        durationOptions: [7],
        paths: [],
        pendingOptions: [],
      }),
    ).toBe(true);
    const withRecovery: ReadyMadeTemplate = {
      ...template,
      days: template.days.map((day, index) =>
        index === 1
          ? {
              ...day,
              sessions: [
                {
                  id: 'recovery-2',
                  kind: 'recovery',
                  activity: 'Recover',
                  contentId: null,
                  minutes: 15,
                  instructions: 'Rest.',
                  prerequisiteIds: [],
                  requiredSessionIds: [],
                },
              ],
              scheduledMinutes: 15,
              recoveryMinutes: 15,
              unallocatedMinutes: 45,
            }
          : day,
      ),
    };
    const plan = readyMadePlan(withRecovery);
    expect(plan.schedulingVersion).toBe('ready-made-schedule/v1');
    expect(plan.days[0].assignments[0]).toMatchObject({
      id: 'refresh-1',
      kind: 'review',
      sourceContentId: 'sample-content',
    });
    expect(plan.days[1].assignments).toEqual([]);
    expect(plan.days[1].bufferMinutes).toBe(60);
    expect(plan.uniqueNewItems).toBe(0);
    expect(plan.reviewAssignments).toBe(1);
    expect(plan.template).toEqual(withRecovery);
    expect(plan.focusedDailyHours).toBe(1);
    expect(plan.bufferHours).toBe(0);
  });

  it('preserves future reviews and their authored source-session relationship', () => {
    const futureReview = {
      ...template.days[0].sessions[0],
      id: 'review-after-plan',
      kind: 'review' as const,
      activity: 'Recall' as const,
      requiredSessionIds: ['refresh-1'],
      review: {
        basis: 'scheduled-session' as const,
        sourceSessionId: 'refresh-1',
        sourceDay: 1,
        dueDay: 10,
      },
    };
    const plan = readyMadePlan({ ...template, futureReviews: [futureReview] });

    expect(plan.futureReviews).toEqual([
      expect.objectContaining({
        id: 'review-after-plan',
        kind: 'review',
        requiredSessionIds: ['refresh-1'],
        reviewBasis: 'scheduled-session',
        reviewSourceSessionId: 'refresh-1',
        reviewFromDay: 1,
        reviewDueDay: 10,
      }),
    ]);
    expect(plan.template?.futureReviews).toEqual([futureReview]);
  });

  it('keeps the complete authored source independent of mutable plan projections and the caller', () => {
    const source = structuredClone(template);
    source.startingKnowledge = ['Prior familiarity with the sample'];
    source.assumedPrerequisiteIds = ['known-contract'];
    source.references[0].estimatedReadMinutes = 12;
    source.coverage.selectedUnitIds = ['unit-1'];
    source.coverage.availableUnitCount = 2;
    source.coverage.uncoveredUnitIds = ['unit-2'];
    source.days[0].sessions[0].requiredSessionIds = ['earlier-1', 'earlier-2'];
    const original = structuredClone(source);
    const plan = readyMadePlan(source);

    plan.config.topicIds.push('grow:another');
    plan.days[0].assignments[0].route.push('changed');
    plan.days[0].assignments[0].requiredSessionIds!.push('changed');
    source.startingKnowledge.push('Changed by caller');

    expect(plan.template).toEqual(original);
    expect(source.days).toEqual(original.days);
    expect(source.references).toEqual(original.references);
    expect(JSON.parse(JSON.stringify(plan)).template).toEqual(original);
  });

  it('rejects unsupported versions and missing canonical references', () => {
    expect(() =>
      readyMadePlan({
        ...template,
        schemaVersion: 'future-version',
      } as unknown as ReadyMadeTemplate),
    ).toThrow('Unsupported ready-made plan version');
    expect(() => readyMadePlan({ ...template, references: [] })).toThrow(
      'Ready-made plan reference is missing',
    );
  });

  it('offers the seven-day one-hour initial Refresh using declared knowledge without inventing completion', () => {
    const source = structuredClone(template);
    source.assumedPrerequisiteIds = ['known-one', 'known-two'];
    source.days[0].sessions[0].prerequisiteIds = ['known-one', 'known-two'];
    const plan = readyMadePlan(source);
    const before = JSON.stringify(plan);
    const completed = new Set<string>();

    const queue = studyDayQueue(plan, 1, completed);

    expect(queue.selected.map((item) => [item.id, item.minutes])).toEqual([['refresh-1', 20]]);
    expect(queue.budget).toBe(60);
    expect(completed.size).toBe(0);
    expect(JSON.stringify(plan)).toBe(before);
    expect(studyDayQueue(plan, 1, completed, {}, [], true, () => false).selected).toEqual([]);
    plan.template!.assumedPrerequisiteIds = ['known-one'];
    expect(studyDayQueue(plan, 1, completed).selected).toEqual([]);
  });

  it('anchors authored later recall to the actual Refresh completion and preserves its interval', () => {
    const source = structuredClone(template);
    source.days[2].sessions = [
      {
        ...source.days[0].sessions[0],
        id: 'recall-3',
        activity: 'Recall',
        requiredSessionIds: ['refresh-1'],
        review: {
          basis: 'scheduled-session',
          sourceSessionId: 'refresh-1',
          sourceDay: 1,
          dueDay: 3,
        },
      },
    ];
    source.days[2].focusedMinutes = source.days[2].scheduledMinutes = 20;
    source.days[2].unallocatedMinutes = 40;
    const plan = readyMadePlan(source);
    const completed = new Set(['refresh-1']);
    const log = [
      { assignmentId: 'refresh-1', day: 2, minutes: 20, recordedAt: '2026-09-12T12:00:00Z' },
    ];
    expect(studyDayQueue(plan, 3, completed, {}, log).selected).toEqual([]);
    expect(studyDayQueue(plan, 4, completed, {}, log).selected.map((item) => item.id)).toEqual([
      'recall-3',
    ]);
    expect(completed.has('sample-content')).toBe(false);
  });

  it('preserves declared assumptions, recovery reservations and later-review spacing when moving Refresh', () => {
    const source = structuredClone(template);
    source.assumedPrerequisiteIds = ['known-one', 'known-two'];
    source.days[0].sessions[0].prerequisiteIds = ['known-one', 'known-two'];
    source.days[1].sessions = [
      {
        id: 'rest-2',
        kind: 'recovery',
        activity: 'Recover',
        contentId: null,
        minutes: 45,
        instructions: 'Rest',
        prerequisiteIds: [],
        requiredSessionIds: [],
      },
    ];
    source.days[1].scheduledMinutes = source.days[1].recoveryMinutes = 45;
    source.days[1].unallocatedMinutes = 15;
    source.futureReviews = [
      {
        ...source.days[0].sessions[0],
        id: 'later-recall',
        activity: 'Recall',
        requiredSessionIds: ['refresh-1'],
        review: {
          basis: 'scheduled-session',
          sourceSessionId: 'refresh-1',
          sourceDay: 1,
          dueDay: 10,
        },
      },
    ];
    const plan = readyMadePlan(source);
    const before = JSON.stringify(plan);
    expect(studyDayQueue(plan, 2, new Set()).budget).toBe(15);
    expect(studyDayQueue(plan, 2, new Set()).selected).toEqual([]);
    const preview = previewStudyPlanRecovery(plan, { currentDay: 2 });
    expect(preview.snapshot.days[1].assignments).toEqual([]);
    expect(preview.snapshot.days[2].assignments.map((item) => item.id)).toEqual(['refresh-1']);
    expect(preview.snapshot.futureReviews?.[0]).toMatchObject({
      id: 'later-recall',
      reviewFromDay: 3,
      reviewDueDay: 12,
      requiredSessionIds: ['refresh-1'],
    });
    expect(preview.snapshot.template).toEqual(source);
    expect(preview.snapshot.template).not.toBe(plan.template);
    expect(preview.snapshot.config.completedContentIds).toBeUndefined();
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('unlocks practice after the declared Refresh without recording the refreshed content as complete', () => {
    const source = structuredClone(template);
    source.days[1].sessions = [
      {
        id: 'practice-2',
        kind: 'practice',
        activity: 'Practice',
        contentId: 'sample-content',
        minutes: 20,
        instructions: 'Practice the model.',
        prerequisiteIds: ['sample-content'],
        requiredSessionIds: ['refresh-1'],
      },
    ];
    source.days[1].scheduledMinutes = source.days[1].focusedMinutes = 20;
    source.days[1].unallocatedMinutes = 40;
    const plan = readyMadePlan(source);
    const completed = new Set(['refresh-1']);
    expect(studyDayQueue(plan, 2, completed).selected.map((item) => item.id)).toEqual([
      'practice-2',
    ]);
    expect(completed.has('sample-content')).toBe(false);
    expect(plan.config.completedContentIds).toBeUndefined();
    expect(
      previewStudyPlanRecovery(plan, {
        currentDay: 2,
        completedAssignmentIds: ['refresh-1'],
      }).snapshot.days[1].assignments.map((item) => item.id),
    ).toEqual(['practice-2']);
  });

  it('keeps an authored recall on its scheduled day when its earliest due day is sooner', () => {
    const source = structuredClone(template);
    source.days[3].sessions = [
      {
        ...source.days[0].sessions[0],
        id: 'recall-4',
        activity: 'Recall',
        requiredSessionIds: ['refresh-1'],
        review: {
          basis: 'scheduled-session',
          sourceSessionId: 'refresh-1',
          sourceDay: 1,
          dueDay: 3,
        },
      },
    ];
    source.days[3].focusedMinutes = source.days[3].scheduledMinutes = 20;
    source.days[3].unallocatedMinutes = 40;
    const plan = readyMadePlan(source);
    const completed = new Set(['refresh-1']);
    const log = [
      { assignmentId: 'refresh-1', day: 1, minutes: 20, recordedAt: '2026-09-12T12:00:00Z' },
    ];
    expect(studyDayQueue(plan, 3, completed, {}, log).selected).toEqual([]);
    expect(studyDayQueue(plan, 4, completed, {}, log).selected.map((item) => item.id)).toEqual([
      'recall-4',
    ]);
  });

  it('keeps authored empty days free of automatic extra recall sessions', () => {
    const source = structuredClone(template);
    source.days[0].sessions[0] = {
      ...source.days[0].sessions[0],
      kind: 'new',
      activity: 'Understand',
      review: undefined,
    };
    const plan = readyMadePlan(source);
    expect(studyDayQueue(plan, 2, new Set(['refresh-1', 'sample-content'])).selected).toEqual([]);
    expect(plan.days[1].assignments).toEqual([]);
  });
});
