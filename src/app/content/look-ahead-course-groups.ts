import { CatalogCourseGroup } from './catalog-course-groups';

export type LookAheadCourseGroup = CatalogCourseGroup;

export const LOOK_AHEAD_COURSE_GROUPS: LookAheadCourseGroup[] = [
  {
    id: 'architecture-production',
    title: 'Design and Operate Systems',
    description:
      'Move from ambiguous requirements to defensible architectures, then keep those systems scalable, resilient, secure, and operable.',
    courseIds: [
      'system-design',
      'distributed-systems',
      'scalability-performance',
      'resilience-production',
      'cloud-architecture',
    ],
    featuredCourseId: 'system-design',
    featuredLabel: 'Recommended starting point',
  },
  {
    id: 'leadership-future',
    title: 'Lead, Communicate, and Evolve',
    description:
      'Demonstrate senior judgment through AI systems architecture, technical leadership, evidence-led stories, and clear project communication.',
    courseIds: [
      'ai-systems-architecture',
      'technical-leadership',
      'behavioral-carl',
      'project-recruiter',
    ],
  },
];
