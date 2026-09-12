import { ContentPath, ContentType } from './content.models';
import { StudyPlan, StudyPlanAssignment, StudyPlanTopic } from './study-plan';

export type ReadyMadeDuration = 7 | 14 | 21 | 30 | 60 | 90 | 120 | 180;

export interface ReadyMadeVariantSummary {
  templateId: string;
  templateVersion: string;
  durationDays: ReadyMadeDuration;
  dailyHours: number;
  intensive: boolean;
  intendedUse: string;
  href: string;
  sha256: string;
  scheduledMinutes: number;
  selectedContentCount: number;
  availableContentCount: number;
  topicIds?: string[];
}

export interface ReadyMadePath {
  id: string;
  title: string;
  summary: string;
  roleLevel: string;
  startingKnowledge: string[];
  outcomes: string[];
  uncoveredScope: string[];
  topics: { id: string; title: string }[];
  recommendedVariantId: string;
  variants: ReadyMadeVariantSummary[];
}

export interface ReadyMadeCatalog {
  schemaVersion: 'study-plan-picker/v1';
  catalogVersion: string;
  availabilityUnit: 'hours-per-day';
  durationOptions: ReadyMadeDuration[];
  paths: ReadyMadePath[];
  pendingOptions: { value: number; reason: string }[];
}

export interface ReadyMadeReference {
  contentId: string;
  topicId: string;
  title: string;
  courseTitle: string;
  contentType: ContentType;
  route: string[];
  contentVersion: string;
  prerequisiteIds: string[];
  estimatedReadMinutes?: number | null;
}

export interface ReadyMadeSession {
  id: string;
  kind: 'new' | 'review' | 'practice' | 'recovery';
  activity: StudyPlanAssignment['activity'] | 'Recover';
  contentId: string | null;
  minutes: number;
  instructions: string;
  prerequisiteIds: string[];
  requiredSessionIds: string[];
  review?: {
    basis: 'declared-familiarity' | 'scheduled-session';
    sourceSessionId: string | null;
    sourceDay: number | null;
    dueDay: number;
  };
}

export interface ReadyMadeTemplate {
  schemaVersion: 'study-plan-template/v1';
  templateId: string;
  templateVersion: string;
  pathId: string;
  durationDays: ReadyMadeDuration;
  dailyHours: number;
  availabilityUnit: 'hours-per-day';
  intensive: boolean;
  intendedUse: string;
  provenance: {
    algorithmVersion: 'ready-made-schedule/v1';
    catalogVersion: string;
    rankingVersion: string | null;
    blueprintVersion: string;
    sourceContentVersion: string;
  };
  startingKnowledge: string[];
  assumedPrerequisiteIds: string[];
  topicIds: string[];
  references: ReadyMadeReference[];
  days: {
    day: number;
    phase: string;
    sessions: ReadyMadeSession[];
    scheduledMinutes: number;
    focusedMinutes: number;
    recoveryMinutes: number;
    unallocatedMinutes: number;
  }[];
  coverage: {
    selectedContentCount: number;
    availableContentCount: number;
    scheduledMinutes: number;
    unallocatedMinutes: number;
    uncoveredContentIds: string[];
    uncoveredScope: string[];
    focusedMinutes?: number;
    recoveryMinutes?: number;
    selectedUnitIds?: string[];
    availableUnitCount?: number;
    uncoveredUnitIds?: string[];
  };
  futureReviews: ReadyMadeSession[];
}

export interface ReadyMadePins {
  templateId: string;
  templateVersion: string;
  templateSha256: string;
  pathId: string;
  pickerCatalogVersion: string;
  blueprintVersion: string;
  sourceContentVersion: string;
  adapterVersion: 'ready-made-to-study-plan/v1';
}

export const READY_MADE_HOURS: Record<ReadyMadeDuration, number[]> = {
  7: [1, 2, 3, 4, 6, 9],
  14: [1, 2, 3, 4, 6, 9],
  21: [1, 2, 3, 4],
  30: [1, 2, 3, 4],
  60: [1, 2, 3],
  90: [1, 2, 3],
  120: [1, 2],
  180: [1, 2],
};

export function isReadyMadeCatalog(value: unknown): value is ReadyMadeCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as ReadyMadeCatalog;
  return (
    catalog.schemaVersion === 'study-plan-picker/v1' &&
    catalog.availabilityUnit === 'hours-per-day' &&
    typeof catalog.catalogVersion === 'string' &&
    Array.isArray(catalog.paths) &&
    Array.isArray(catalog.durationOptions) &&
    catalog.paths.every(
      (path) =>
        typeof path.id === 'string' &&
        typeof path.title === 'string' &&
        Array.isArray(path.topics) &&
        Array.isArray(path.variants),
    )
  );
}

export function readyMadePlan(template: ReadyMadeTemplate): StudyPlan {
  if (
    template.schemaVersion !== 'study-plan-template/v1' ||
    template.availabilityUnit !== 'hours-per-day' ||
    template.provenance.algorithmVersion !== 'ready-made-schedule/v1'
  )
    throw new Error('Unsupported ready-made plan version.');
  template = structuredClone(template);
  const references = new Map(
    template.references.map((reference) => [reference.contentId, reference]),
  );
  const seenContent = new Set<string>();
  const topics: StudyPlanTopic[] = template.topicIds.map((id) => {
    const reference = template.references.find((item) => item.topicId === id);
    const path = (reference?.route[1] ?? id.split(':')[0]) as ContentPath;
    return {
      id,
      path,
      title: reference?.courseTitle ?? id,
      description: '',
      courseIds: [
        ...new Set(
          template.references.filter((item) => item.topicId === id).map((item) => item.route[2]),
        ),
      ],
    };
  });
  const assignmentFor = (
    session: ReadyMadeSession,
    kind: StudyPlanAssignment['kind'],
  ): StudyPlanAssignment => {
    if (!session.contentId) throw new Error(`Ready-made session has no content: ${session.id}`);
    const reference = references.get(session.contentId);
    if (!reference) throw new Error(`Ready-made plan reference is missing: ${session.contentId}`);
    return {
      id: session.id,
      kind,
      activity: session.activity as StudyPlanAssignment['activity'],
      topicId: reference.topicId,
      topicTitle:
        topics.find((topic) => topic.id === reference.topicId)?.title ?? reference.courseTitle,
      title: reference.title,
      courseTitle: reference.courseTitle,
      contentType: reference.contentType,
      route: reference.route,
      minutes: session.minutes,
      sourceContentId: reference.contentId,
      prerequisiteIds: session.prerequisiteIds,
      requiredSessionId: session.requiredSessionIds[0],
      requiredSessionIds: session.requiredSessionIds,
      templateKind: session.kind === 'recovery' ? undefined : session.kind,
      reviewBasis: session.review?.basis,
      reviewSourceSessionId: session.review?.sourceSessionId ?? undefined,
      reviewFromDay: session.review?.sourceDay ?? undefined,
      reviewDueDay: session.review?.dueDay,
      instructions: session.instructions,
    };
  };
  const days = template.days.map((day) => {
    const assignments = day.sessions.flatMap((session): StudyPlanAssignment[] => {
      if (session.kind === 'recovery' || !session.contentId) return [];
      const repeated = seenContent.has(session.contentId);
      seenContent.add(session.contentId);
      const kind =
        session.kind === 'new' || (session.kind === 'practice' && !repeated) ? 'new' : 'review';
      return [assignmentFor(session, kind)];
    });
    return {
      day: day.day,
      phase: day.phase,
      focus: assignments.length
        ? [...new Set(assignments.map((item) => item.courseTitle))].join(' · ')
        : 'Open study time',
      assignments,
      newCount: assignments.filter((item) => item.kind === 'new').length,
      reviewCount: assignments.filter((item) => item.kind === 'review').length,
      focusedMinutes: day.focusedMinutes,
      bufferMinutes: day.recoveryMinutes + day.unallocatedMinutes,
    };
  });
  const weeks = [];
  for (let index = 0; index < days.length; index += 7)
    weeks.push({
      number: weeks.length + 1,
      label: days[index]?.phase ?? 'Study week',
      days: days.slice(index, index + 7),
    });
  return {
    template: structuredClone(template),
    config: {
      days: template.durationDays,
      dailyHours: template.dailyHours,
      topicIds: template.topicIds,
      accessTopicIds: template.topicIds,
      goalType: template.durationDays <= 30 ? 'interview' : 'learning',
    },
    focusedDailyHours: template.dailyHours,
    bufferHours: 0,
    includedTopics: topics,
    excludedTopics: [],
    days,
    weeks,
    uniqueNewItems: days.flatMap((day) => day.assignments).filter((item) => item.kind === 'new')
      .length,
    reviewAssignments: days
      .flatMap((day) => day.assignments)
      .filter((item) => item.kind === 'review').length,
    schedulingVersion: template.provenance.algorithmVersion,
    eligibleNewItems: template.coverage.availableContentCount,
    remainingNewItems: template.coverage.uncoveredContentIds.length,
    futureReviews: template.futureReviews.map((session) => assignmentFor(session, 'review')),
    mode: template.durationDays <= 14 ? 'interview-revision' : 'learning',
  };
}
