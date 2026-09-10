import { ContentPath, ContentType, SearchDocument } from './content.models';
import { buildInterviewSprint } from './study-plan-sprint';

export const STUDY_PLAN_DURATIONS = [7, 14, 21, 30, 50, 90, 120, 150, 180] as const;
export const STUDY_PLAN_HOURS = [15, 12, 10, 9, 6, 5, 3, 2, 1] as const;

export interface StudyPlanTopic {
  id: string;
  path: ContentPath;
  title: string;
  description: string;
  courseIds: string[];
  contentTypes?: ContentType[];
}

export const STUDY_PLAN_TOPICS: StudyPlanTopic[] = [
  {
    id: 'java-foundations',
    path: 'learn',
    title: 'Java foundations',
    description: 'Core Java, collections, modern Java, JVM memory, and runtime reasoning.',
    courseIds: ['core-java', 'java-data-structures', 'modern-java', 'garbage-collection'],
  },
  {
    id: 'python-go',
    path: 'learn',
    title: 'Python, Go, and language transitions',
    description: 'Python and Go for Java engineers plus constraint-led language selection.',
    courseIds: ['python-fundamentals', 'go-fundamentals', 'language-comparative-analysis'],
  },
  {
    id: 'javascript-web-foundations',
    path: 'learn',
    title: 'Web Foundations',
    description:
      'JavaScript, TypeScript, and browser fundamentals for frontend and Node.js development.',
    courseIds: ['javascript-foundations', 'typescript-foundations', 'web-platform-foundations'],
  },
  {
    id: 'lld',
    path: 'learn',
    title: 'OOP, SOLID, design patterns, and LLD',
    description: 'Object design, concurrency, GoF patterns, and hands-on low-level design.',
    courseIds: ['oop', 'solid-design-patterns'],
  },
  {
    id: 'dsa',
    path: 'learn',
    title: 'Data structures and algorithms',
    description: 'Big O, structures, sorting, pattern recognition, traces, and coding practice.',
    courseIds: [
      'big-o-analysis',
      'core-data-structures',
      'sorting-searching',
      'algorithmic-patterns',
    ],
  },
  {
    id: 'engineering-tools',
    path: 'learn',
    title: 'Engineering tools',
    description: 'SQL, Linux, Git, Docker, debugging, HTTP, builds, tests, and CI workflow.',
    courseIds: ['sql', 'linux', 'git', 'docker', 'developer-workflow'],
  },
  {
    id: 'backend-production',
    path: 'grow',
    title: 'Backend and Spring production engineering',
    description: 'Java, data, APIs, Spring, services, quality, and distributed implementation.',
    courseIds: [
      'advanced-java',
      'data-access',
      'api-design',
      'spring-framework',
      'spring-boot',
      'distributed-systems',
      'microservices',
      'quality-engineering',
    ],
  },
  {
    id: 'frontend-production',
    path: 'grow',
    title: 'Frontend production engineering',
    description:
      'Accessible, responsive, testable Angular, React, Vue, and browser-facing delivery.',
    courseIds: ['angular', 'react', 'vue'],
  },
  {
    id: 'ai-engineering',
    path: 'grow',
    title: 'Practical AI engineering',
    description:
      'AI foundations, bounded collaboration, prompt and context engineering, tools, evaluation, security, and operations.',
    courseIds: ['ai-assisted-development'],
  },
  {
    id: 'cloud-delivery',
    path: 'grow',
    title: 'Cloud, delivery, and operations',
    description:
      'AWS, Kubernetes, delivery pipelines, observability, incidents, and CARL practice.',
    courseIds: [
      'aws-cloud',
      'docker-kubernetes',
      'cicd',
      'monitoring-alerts',
      'technical-scenarios',
    ],
  },
  {
    id: 'architecture',
    path: 'look-ahead',
    title: 'System and cloud architecture',
    description: 'System design, distributed systems, scale, resilience, and cloud decisions.',
    courseIds: [
      'system-design',
      'distributed-systems',
      'scalability-performance',
      'resilience-production',
      'cloud-architecture',
    ],
  },
  {
    id: 'ai-systems-architecture',
    path: 'look-ahead',
    title: 'AI systems architecture and projects',
    description:
      'Production RAG, validated extraction, full-stack AI products, and architecture trade-offs.',
    courseIds: ['ai-systems-architecture'],
  },
  {
    id: 'leadership-interviews',
    path: 'look-ahead',
    title: 'Leadership, behavioral, and project interviews',
    description: 'Principal judgment, CARL/STAR evidence, mentoring, influence, and project depth.',
    courseIds: ['technical-leadership', 'behavioral-carl', 'project-recruiter'],
  },
];

export interface StudyPlanConfig {
  days: number;
  dailyHours: number;
  topicIds: string[];
  accessTopicIds: string[];
  goalType?: 'learning' | 'interview';
  familiarity?: Record<string, 'familiar' | 'refresh' | 'new'>;
  completedContentIds?: string[];
  needsReviewContentIds?: string[];
}

export interface StudyPlanAssignment {
  id: string;
  kind: 'new' | 'review';
  activity: 'Understand' | 'Practice' | 'Apply' | 'Recall' | 'Attempt' | 'Refresh' | 'Rehearse';
  topicId: string;
  topicTitle: string;
  title: string;
  courseTitle: string;
  contentType: ContentType;
  route: string[];
  minutes: number;
  reviewFromDay?: number;
  sourceContentId?: string;
  prerequisiteIds?: string[];
  reviewDueDay?: number;
  relatedLessonIds?: string[];
  timebox?: boolean;
  instructions?: string;
  requiredSessionId?: string;
  coverageKey?: string;
}

export interface StudyPlanDay {
  day: number;
  phase: string;
  focus: string;
  assignments: StudyPlanAssignment[];
  newCount: number;
  reviewCount: number;
  focusedMinutes: number;
  bufferMinutes?: number;
}

export interface StudyPlanWeek {
  number: number;
  label: string;
  days: StudyPlanDay[];
}

export interface StudyPlan {
  config: StudyPlanConfig;
  focusedDailyHours: number;
  bufferHours: number;
  includedTopics: StudyPlanTopic[];
  excludedTopics: StudyPlanTopic[];
  days: StudyPlanDay[];
  weeks: StudyPlanWeek[];
  uniqueNewItems: number;
  reviewAssignments: number;
  schedulingVersion?: string;
  eligibleNewItems?: number;
  remainingNewItems?: number;
  blockedItems?: { id: string; title: string; prerequisiteIds: string[] }[];
  futureReviews?: StudyPlanAssignment[];
  overdueReviewCount?: number;
  mode?: 'learning' | 'interview-revision';
  topicCoverage?: {
    id: string;
    title: string;
    scheduledItems: number;
    availableItems: number;
    minutes: number;
    representedOutcomes: number;
  }[];
}

const REVIEW_OFFSETS = [1, 2, 7, 14, 30];

export function buildStudyPlan(
  documents: SearchDocument[],
  config: StudyPlanConfig,
  topics: StudyPlanTopic[] = STUDY_PLAN_TOPICS,
  studyOrder: ReadonlyMap<string, number> = new Map(),
  interviewOrder: ReadonlyMap<string, number> = studyOrder,
): StudyPlan {
  if (config.days === 7 && config.goalType === 'interview')
    return buildInterviewSprint(documents, config, topics, interviewOrder);
  const selectedTopics = topics.filter((topic) => config.topicIds.includes(topic.id));
  const includedTopics = selectedTopics.filter((topic) => config.accessTopicIds.includes(topic.id));
  const excludedTopics = selectedTopics.filter(
    (topic) => !config.accessTopicIds.includes(topic.id),
  );
  const focusedDailyHours = Math.min(9, Math.max(1, config.dailyHours));
  const bufferHours = Math.max(0, config.dailyHours - focusedDailyHours);
  const dailyMinutes = focusedDailyHours * 60;
  const pools = new Map(
    includedTopics.map((topic) => [
      topic.id,
      prioritizedDocuments(documents, topic, studyOrder).map((document) =>
        assignmentFor(document, topic),
      ),
    ]),
  );
  const allItems = new Map<string, StudyPlanAssignment>();
  for (const pool of pools.values())
    for (const item of pool) if (!allItems.has(item.id)) allItems.set(item.id, item);
  const blocked = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const checkBlocked = (id: string): boolean => {
    if (visiting.has(id)) {
      blocked.add(id);
      return true;
    }
    if (visited.has(id)) return blocked.has(id);
    const item = allItems.get(id);
    if (!item) return true;
    visiting.add(id);
    for (const dependency of item.prerequisiteIds ?? [])
      if (checkBlocked(dependency)) blocked.add(id);
    visiting.delete(id);
    visited.add(id);
    return blocked.has(id);
  };
  for (const id of allItems.keys()) checkBlocked(id);
  const usedIds = new Set<string>();
  const days: StudyPlanDay[] = [];
  const reviewQueue: {
    source: StudyPlanAssignment;
    sourceDay: number;
    interval: number;
    dueDay: number;
  }[] = [];
  let topicCursor = 0;
  let lastNewDay = 0;

  for (let day = 1; day <= config.days; day += 1) {
    const consolidationDay = day % 7 === 0;
    const assignments: StudyPlanAssignment[] = [];
    let minutesLeft = dailyMinutes;
    const ready = (item: StudyPlanAssignment) =>
      !usedIds.has(item.id) &&
      !blocked.has(item.id) &&
      (item.prerequisiteIds ?? []).every((id) => usedIds.has(id));
    const nextNew = [...allItems.values()].find(
      (item) => ready(item) && item.minutes <= minutesLeft,
    );
    // On small budgets, alternate a fitting new session with due recall rather than starving new work.
    // This deterministic planning default is an estimate, not an optimized learning prescription.
    const reserveNew = nextNew && !consolidationDay && day - lastNewDay > 1 ? nextNew.minutes : 0;
    const reviewBudget = nextNew ? Math.max(20, Math.floor(dailyMinutes * 0.35)) : dailyMinutes;
    let reviewMinutes = 0;
    const reviewedToday = new Set<string>();
    reviewQueue.sort(
      (a, b) =>
        a.dueDay - b.dueDay || a.sourceDay - b.sourceDay || a.source.id.localeCompare(b.source.id),
    );
    const scheduleReviews = (budget: number, reserve: number) => {
      for (const due of reviewQueue) {
        if (
          due.dueDay > day ||
          reviewedToday.has(due.source.id) ||
          minutesLeft - reserve < 20 ||
          reviewMinutes + 20 > budget
        )
          continue;
        const interval = REVIEW_OFFSETS[due.interval];
        assignments.push({
          ...due.source,
          id: `${due.source.id}:review:v2:${interval}`,
          sourceContentId: due.source.id,
          kind: 'review',
          activity: 'Recall',
          minutes: 20,
          reviewFromDay: due.sourceDay,
          reviewDueDay: due.dueDay,
        });
        reviewedToday.add(due.source.id);
        minutesLeft -= 20;
        reviewMinutes += 20;
        due.interval += 1;
        due.dueDay =
          due.interval < REVIEW_OFFSETS.length
            ? Math.max(day + 1, due.sourceDay + REVIEW_OFFSETS[due.interval])
            : Infinity;
      }
    };
    scheduleReviews(reviewBudget, reserveNew);
    let attempts = 0;
    const newLimit = consolidationDay ? 5 : 10;
    let newCount = 0;
    while (newCount < newLimit && attempts < includedTopics.length) {
      const topic = includedTopics[topicCursor % includedTopics.length];
      topicCursor += 1;
      const item = (pools.get(topic.id) ?? []).find(
        (candidate) => ready(candidate) && candidate.minutes <= minutesLeft,
      );
      if (!item) {
        attempts += 1;
        continue;
      }
      attempts = 0;
      usedIds.add(item.id);
      assignments.push(item);
      minutesLeft -= item.minutes;
      newCount += 1;
      lastNewDay = day;
      reviewQueue.push({
        source: item,
        sourceDay: day,
        interval: 0,
        dueDay: day + REVIEW_OFFSETS[0],
      });
    }
    // Use otherwise idle minutes for overdue retrieval without exceeding the daily budget.
    scheduleReviews(dailyMinutes, 0);
    days.push({
      day,
      phase: phaseFor(day, config.days),
      focus: focusFor(assignments, consolidationDay),
      assignments,
      newCount,
      reviewCount: assignments.length - newCount,
      focusedMinutes: dailyMinutes - minutesLeft,
    });
  }
  const futureReviews = reviewQueue.flatMap((due) =>
    REVIEW_OFFSETS.slice(due.interval).map((offset, index) => ({
      ...due.source,
      id: `${due.source.id}:review:v2:${offset}`,
      sourceContentId: due.source.id,
      kind: 'review' as const,
      activity: 'Recall' as const,
      minutes: 20,
      reviewFromDay: due.sourceDay,
      reviewDueDay: index === 0 ? due.dueDay : Math.max(due.dueDay + index, due.sourceDay + offset),
    })),
  );

  return {
    config,
    focusedDailyHours,
    bufferHours,
    includedTopics,
    excludedTopics,
    days,
    weeks: chunkWeeks(days),
    uniqueNewItems: usedIds.size,
    schedulingVersion: 'study-schedule/v2',
    eligibleNewItems: allItems.size,
    remainingNewItems: allItems.size - usedIds.size - blocked.size,
    blockedItems: [...blocked].map((id) => ({
      id,
      title: allItems.get(id)!.title,
      prerequisiteIds: allItems.get(id)!.prerequisiteIds ?? [],
    })),
    futureReviews,
    overdueReviewCount: futureReviews.filter((item) => item.reviewDueDay! <= config.days).length,
    reviewAssignments: days.reduce((sum, day) => sum + day.reviewCount, 0),
  };
}

function prioritizedDocuments(
  documents: SearchDocument[],
  topic: StudyPlanTopic,
  studyOrder: ReadonlyMap<string, number>,
): SearchDocument[] {
  const seen = new Set<string>();
  // Generated search shards retain the published course/module/item sequence.
  // Use it instead of alphabetizing lesson titles when no released rank applies.
  const sourceOrder = new Map(documents.map((item, index) => [item.id, index]));
  const matching = documents.filter((document) => studyPlanMatchesTopic(document, topic));
  const dsaOnly = matching.every((document) => document.contentType === 'dsa-problem');
  return matching
    .sort(
      (left, right) =>
        (dsaOnly
          ? (studyOrder.get(left.canonicalContentId ?? left.contentId) ?? Infinity) -
            (studyOrder.get(right.canonicalContentId ?? right.contentId) ?? Infinity)
          : 0) ||
        (left.studySequence ?? sourceOrder.get(left.id) ?? 0) -
          (right.studySequence ?? sourceOrder.get(right.id) ?? 0) ||
        Number(
          left.discoveryKind !== 'lesson' &&
            left.contentType !== 'theory' &&
            left.contentType !== 'dsa-pattern',
        ) -
          Number(
            right.discoveryKind !== 'lesson' &&
              right.contentType !== 'theory' &&
              right.contentType !== 'dsa-pattern',
          ) ||
        (studyOrder.get(left.canonicalContentId ?? left.contentId) ?? Infinity) -
          (studyOrder.get(right.canonicalContentId ?? right.contentId) ?? Infinity) ||
        (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0),
    )
    .filter((document) => {
      const key =
        document.canonicalContentId ??
        `${document.path}:${document.courseId}:${document.contentId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function assignmentFor(document: SearchDocument, topic: StudyPlanTopic): StudyPlanAssignment {
  const activity = activityFor(document.contentType);
  return {
    id: document.canonicalContentId ?? document.id,
    kind: 'new',
    prerequisiteIds: [
      ...new Set([
        ...(document.studyPrerequisiteIds ?? []),
        ...(document.studyRelatedLessonIds ?? []),
      ]),
    ],
    relatedLessonIds: document.studyRelatedLessonIds ?? [],
    activity,
    topicId: topic.id,
    topicTitle: topic.title,
    title: document.title,
    courseTitle: document.courseTitle,
    contentType: document.contentType,
    route: document.route ?? ['/', document.path, document.courseId, document.contentId],
    minutes: activity === 'Understand' ? 45 : 50,
  };
}

function activityFor(contentType: ContentType): StudyPlanAssignment['activity'] {
  if (contentType === 'theory' || contentType === 'dsa-pattern') return 'Understand';
  if (contentType === 'dsa-problem') return 'Practice';
  return 'Apply';
}

function phaseFor(day: number, totalDays: number): string {
  const progress = day / totalDays;
  if (progress <= 0.12) return 'Orient and diagnose';
  if (progress <= 0.45) return 'Build reliable models';
  if (progress <= 0.72) return 'Deepen and transfer';
  if (progress <= 0.9) return 'Simulate interview pressure';
  return 'Taper, recall, and communicate';
}

function focusFor(assignments: StudyPlanAssignment[], consolidationDay: boolean): string {
  if (consolidationDay) return 'Consolidate weak recall and explain decisions aloud';
  const topics = [...new Set(assignments.map(({ topicTitle }) => topicTitle))];
  return topics.length
    ? topics.slice(0, 2).join(' + ')
    : 'No additional work fits this day; review your coverage and available time';
}

function chunkWeeks(days: StudyPlanDay[]): StudyPlanWeek[] {
  const weeks: StudyPlanWeek[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const weekDays = days.slice(index, index + 7);
    weeks.push({
      number: weeks.length + 1,
      label: weekDays[0]?.phase ?? 'Study week',
      days: weekDays,
    });
  }
  return weeks;
}

/** One checklist entry per published course, without private answer bodies. */
export function studyPlanOfferings(documents: SearchDocument[]): StudyPlanTopic[] {
  const offerings = new Map<string, StudyPlanTopic>();
  for (const item of documents) {
    const id = `${item.path}:${item.courseId}`;
    if (!offerings.has(id))
      offerings.set(id, {
        id,
        path: item.path,
        title: item.courseTitle,
        description: '',
        courseIds: [item.courseId],
      });
  }
  const handsOn = offerings.get('learn:hands-on-dsa');
  if (handsOn) {
    handsOn.courseIds = [
      ...new Set(
        documents
          .filter((item) => item.path === 'learn' && item.contentType === 'dsa-problem')
          .map((item) => item.courseId),
      ),
    ];
    handsOn.contentTypes = ['dsa-problem'];
    handsOn.description =
      'Canonical coding problems across the published DSA curriculum. Shared selections are scheduled only once.';
  }
  const paths: ContentPath[] = ['learn', 'grow', 'look-ahead'];
  return [...offerings.values()].sort(
    (a, b) => paths.indexOf(a.path) - paths.indexOf(b.path) || a.title.localeCompare(b.title),
  );
}

/** A tool offering can project real sessions without cloning canonical records. */
export function studyPlanMatchesTopic(document: SearchDocument, topic: StudyPlanTopic): boolean {
  return (
    document.path === topic.path &&
    topic.courseIds.includes(document.courseId) &&
    (!topic.contentTypes || topic.contentTypes.includes(document.contentType)) &&
    (document.discoveryKind === undefined ||
      document.discoveryKind === 'lesson' ||
      document.discoveryKind === 'practice')
  );
}
