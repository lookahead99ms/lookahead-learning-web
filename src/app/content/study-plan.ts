import { ContentPath, ContentType, SearchDocument } from './content.models';

export const STUDY_PLAN_DURATIONS = [7, 14, 21, 30, 50, 90, 120, 150, 180] as const;
export const STUDY_PLAN_HOURS = [15, 12, 10, 9, 6, 5, 3, 2, 1] as const;

export interface StudyPlanTopic {
  id: string;
  path: ContentPath;
  title: string;
  description: string;
  courseIds: string[];
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
    description: 'Accessible, responsive, testable Angular and browser-facing delivery.',
    courseIds: ['angular'],
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
    id: 'ai-engineering',
    path: 'look-ahead',
    title: 'AI-assisted and AI/ML engineering',
    description: 'Verified AI collaboration, RAG, agents, MLOps, structured data, and LLM apps.',
    courseIds: ['ai-assisted-development'],
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
}

export interface StudyPlanAssignment {
  id: string;
  kind: 'new' | 'review';
  activity: 'Understand' | 'Practice' | 'Apply' | 'Recall';
  topicId: string;
  topicTitle: string;
  title: string;
  courseTitle: string;
  contentType: ContentType;
  route: string[];
  minutes: number;
  reviewFromDay?: number;
}

export interface StudyPlanDay {
  day: number;
  phase: string;
  focus: string;
  assignments: StudyPlanAssignment[];
  newCount: number;
  reviewCount: number;
  focusedMinutes: number;
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
}

const REVIEW_OFFSETS = [1, 2, 7, 14, 30];

export function buildStudyPlan(documents: SearchDocument[], config: StudyPlanConfig): StudyPlan {
  const selectedTopics = STUDY_PLAN_TOPICS.filter((topic) => config.topicIds.includes(topic.id));
  const includedTopics = selectedTopics.filter((topic) => config.accessTopicIds.includes(topic.id));
  const excludedTopics = selectedTopics.filter(
    (topic) => !config.accessTopicIds.includes(topic.id),
  );
  const focusedDailyHours = Math.min(9, Math.max(1, config.dailyHours));
  const bufferHours = Math.max(0, config.dailyHours - focusedDailyHours);
  const dailySlots = Math.min(10, Math.max(1, Math.floor((focusedDailyHours * 60) / 50)));
  const pools = new Map(
    includedTopics.map((topic) => [
      topic.id,
      prioritizedDocuments(documents, topic).map((document) => assignmentFor(document, topic)),
    ]),
  );
  const cursors = new Map(includedTopics.map((topic) => [topic.id, 0]));
  const history: StudyPlanAssignment[][] = [];
  const usedIds = new Set<string>();
  const days: StudyPlanDay[] = [];
  let topicCursor = 0;

  for (let day = 1; day <= config.days; day += 1) {
    const reviewLimit = Math.min(5, Math.max(0, Math.floor(dailySlots * 0.35)));
    const reviews = reviewAssignments(history, day, reviewLimit);
    const consolidationDay = day % 7 === 0;
    const requestedNewSlots = Math.max(1, dailySlots - reviews.length);
    const newLimit = consolidationDay
      ? Math.max(1, Math.ceil(requestedNewSlots / 2))
      : requestedNewSlots;
    const newAssignments: StudyPlanAssignment[] = [];

    let attempts = 0;
    while (newAssignments.length < newLimit && attempts < includedTopics.length * dailySlots * 3) {
      attempts += 1;
      if (includedTopics.length === 0) break;
      const topic = includedTopics[topicCursor % includedTopics.length];
      topicCursor += 1;
      const pool = pools.get(topic.id) ?? [];
      let cursor = cursors.get(topic.id) ?? 0;
      while (cursor < pool.length && usedIds.has(pool[cursor].id)) cursor += 1;
      cursors.set(topic.id, cursor + 1);
      const assignment = pool[cursor];
      if (!assignment) continue;
      usedIds.add(assignment.id);
      newAssignments.push(assignment);
    }

    const assignments = [...reviews, ...newAssignments];
    history.push(assignments);
    days.push({
      day,
      phase: phaseFor(day, config.days),
      focus: focusFor(assignments, consolidationDay),
      assignments,
      newCount: newAssignments.length,
      reviewCount: reviews.length,
      focusedMinutes: assignments.reduce((sum, assignment) => sum + assignment.minutes, 0),
    });
  }

  return {
    config,
    focusedDailyHours,
    bufferHours,
    includedTopics,
    excludedTopics,
    days,
    weeks: chunkWeeks(days),
    uniqueNewItems: usedIds.size,
    reviewAssignments: days.reduce((sum, day) => sum + day.reviewCount, 0),
  };
}

function prioritizedDocuments(
  documents: SearchDocument[],
  topic: StudyPlanTopic,
): SearchDocument[] {
  const priority: Record<ContentType, number> = {
    theory: 0,
    'dsa-pattern': 1,
    'dsa-problem': 2,
    'system-design': 2,
    'language-comparison': 2,
    'q-and-a': 3,
    guide: 3,
  };
  const seen = new Set<string>();
  return documents
    .filter(
      (document) => document.path === topic.path && topic.courseIds.includes(document.courseId),
    )
    .sort(
      (left, right) =>
        priority[left.contentType] - priority[right.contentType] ||
        left.courseTitle.localeCompare(right.courseTitle) ||
        left.moduleTitle.localeCompare(right.moduleTitle) ||
        left.title.localeCompare(right.title),
    )
    .filter((document) => {
      const key = `${document.courseId}:${document.contentId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function assignmentFor(document: SearchDocument, topic: StudyPlanTopic): StudyPlanAssignment {
  const activity = activityFor(document.contentType);
  return {
    id: document.id,
    kind: 'new',
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

function reviewAssignments(
  history: StudyPlanAssignment[][],
  day: number,
  limit: number,
): StudyPlanAssignment[] {
  const reviews: StudyPlanAssignment[] = [];
  const seen = new Set<string>();
  const addFromDay = (sourceDay: number, sourceIndex = -1) => {
    const source = history[sourceDay - 1]?.filter((assignment) => assignment.kind === 'new') ?? [];
    const assignment = source.at(sourceIndex);
    if (!assignment || seen.has(assignment.id) || reviews.length >= limit) return;
    seen.add(assignment.id);
    reviews.push({
      ...assignment,
      id: `${assignment.id}:review:${day}`,
      kind: 'review',
      activity: 'Recall',
      minutes: 20,
      reviewFromDay: sourceDay,
    });
  };

  // Give every due interval one retrieval before using spare capacity on a second next-day item.
  for (const offset of REVIEW_OFFSETS) {
    if (reviews.length >= limit) break;
    const sourceDay = day - offset;
    if (sourceDay < 1) continue;
    addFromDay(sourceDay);
  }
  if (reviews.length < limit && day > 1) addFromDay(day - 1, -2);
  return reviews;
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
    : 'Review the current plan and restore access';
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
