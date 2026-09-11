import { StudyPlanTopic } from './study-plan';

export interface StudyPlanPreset {
  id: string;
  title: string;
  summary: string;
  days: 30 | 50 | 90 | 120;
  dailyHours: 1 | 2;
  topicIds: string[];
}

/** Editable starting points; access and prerequisites remain scheduler-owned. */
export const STUDY_PLAN_PRESETS: StudyPlanPreset[] = [
  {
    id: 'college-grad',
    title: 'College graduate',
    summary: 'Connect language foundations, problem solving and a reliable development workflow.',
    days: 90,
    dailyHours: 1,
    topicIds: [
      'learn:core-java',
      'learn:big-o-analysis',
      'learn:core-data-structures',
      'learn:git',
      'learn:developer-workflow',
    ],
  },
  {
    id: 'internship',
    title: 'Looking for an internship',
    summary: 'Practise core coding skills and explain the decisions in a small project.',
    days: 50,
    dailyHours: 1,
    topicIds: [
      'learn:core-java',
      'learn:big-o-analysis',
      'learn:core-data-structures',
      'learn:hands-on-dsa',
      'look-ahead:project-recruiter',
    ],
  },
  {
    id: 'first-job',
    title: 'First engineering job',
    summary: 'Prepare coding fundamentals, object design, data skills and interview stories.',
    days: 90,
    dailyHours: 2,
    topicIds: [
      'learn:core-java',
      'learn:big-o-analysis',
      'learn:core-data-structures',
      'learn:hands-on-dsa',
      'learn:oop',
      'learn:sql',
      'look-ahead:behavioral-carl',
    ],
  },
  {
    id: 'sde',
    title: 'Software Development Engineer',
    summary: 'Build services with clear APIs, persistence, tests and maintainable object design.',
    days: 90,
    dailyHours: 1,
    topicIds: [
      'learn:oop',
      'learn:sql',
      'grow:api-design',
      'grow:data-access',
      'grow:spring-boot',
      'grow:quality-engineering',
    ],
  },
  {
    id: 'sde-2',
    title: 'SDE II',
    summary:
      'Own service boundaries, failure handling, production diagnosis and design trade-offs.',
    days: 90,
    dailyHours: 1,
    topicIds: [
      'grow:api-design',
      'grow:distributed-systems',
      'grow:microservices',
      'grow:monitoring-alerts',
      'look-ahead:system-design',
      'look-ahead:behavioral-carl',
    ],
  },
  {
    id: 'ai-engineer',
    title: 'AI Engineer',
    summary:
      'Build evaluated AI features with application contracts, security and operational ownership.',
    days: 90,
    dailyHours: 1,
    topicIds: [
      'learn:python-fundamentals',
      'grow:api-design',
      'grow:ai-assisted-development',
      'grow:quality-engineering',
      'look-ahead:ai-systems-architecture',
    ],
  },
  {
    id: 'full-stack',
    title: 'Full Stack Engineer',
    summary:
      'Follow a TypeScript and Node.js path from the browser through APIs, data and delivery.',
    days: 120,
    dailyHours: 1,
    topicIds: [
      'learn:javascript-foundations',
      'learn:typescript-foundations',
      'learn:web-platform-foundations',
      'learn:sql',
      'grow:nodejs',
      'grow:react',
      'grow:api-design',
      'grow:quality-engineering',
      'grow:cicd',
    ],
  },
  {
    id: 'leadership',
    title: 'Technical leadership',
    summary:
      'Develop decision-making, technical communication, mentoring and evidence-led stories.',
    days: 50,
    dailyHours: 1,
    topicIds: [
      'look-ahead:technical-leadership',
      'look-ahead:behavioral-carl',
      'look-ahead:project-recruiter',
      'look-ahead:system-design',
    ],
  },
  {
    id: 'senior-staff',
    title: 'Senior / Staff Engineer',
    summary:
      'Reason across architecture, scale, resilience, organizational boundaries and technical influence.',
    days: 90,
    dailyHours: 1,
    topicIds: [
      'look-ahead:system-design',
      'look-ahead:distributed-systems',
      'look-ahead:scalability-performance',
      'look-ahead:resilience-production',
      'look-ahead:technical-leadership',
    ],
  },
  {
    id: 'fde',
    title: 'Forward Deployed Engineer',
    summary:
      'Turn an ambiguous user problem into an integrated, evaluated solution and explain its trade-offs.',
    days: 90,
    dailyHours: 1,
    topicIds: [
      'grow:api-design',
      'grow:ai-assisted-development',
      'grow:technical-scenarios',
      'look-ahead:system-design',
      'look-ahead:project-recruiter',
      'look-ahead:technical-leadership',
    ],
  },
  {
    id: 'ai-foundations',
    title: 'Getting started with AI',
    summary:
      'Build Python fluency and practise bounded AI workflows, evaluation and safe tool use.',
    days: 50,
    dailyHours: 1,
    topicIds: ['learn:python-fundamentals', 'learn:git', 'grow:ai-assisted-development'],
  },
  {
    id: 'architect',
    title: 'Solution Architect',
    summary:
      'Connect requirements, distributed systems, cloud boundaries, reliability and stakeholder communication.',
    days: 120,
    dailyHours: 1,
    topicIds: [
      'look-ahead:system-design',
      'look-ahead:distributed-systems',
      'look-ahead:cloud-architecture',
      'look-ahead:resilience-production',
      'look-ahead:technical-leadership',
      'look-ahead:ai-systems-architecture',
    ],
  },
];

export function resolveStudyPlanPreset(
  preset: StudyPlanPreset,
  topics: StudyPlanTopic[],
  availableIds: ReadonlySet<string>,
) {
  const published = new Set(topics.map((topic) => topic.id));
  return {
    selectedIds: preset.topicIds.filter((id) => published.has(id) && availableIds.has(id)),
    unavailableIds: preset.topicIds.filter((id) => !published.has(id) || !availableIds.has(id)),
  };
}
