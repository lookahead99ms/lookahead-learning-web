export interface LookAheadCourseGroup {
  id: string;
  title: string;
  description: string;
  courseIds: string[];
}

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
  },
  {
    id: 'leadership-future',
    title: 'Lead, Communicate, and Evolve',
    description:
      'Demonstrate senior judgment through responsible AI delivery, technical leadership, evidence-led stories, and clear project communication.',
    courseIds: [
      'ai-assisted-development',
      'technical-leadership',
      'behavioral-carl',
      'project-recruiter',
    ],
  },
];
