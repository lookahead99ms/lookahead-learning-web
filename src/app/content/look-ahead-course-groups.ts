import { CatalogCourseGroup } from './catalog-course-groups';

export type LookAheadCourseGroup = CatalogCourseGroup;

export const LOOK_AHEAD_COURSE_GROUPS: LookAheadCourseGroup[] = [
  {
    id: 'design-ladder',
    title: 'System Design Ladder',
    description:
      'Four steps: the building blocks, the patterns, whole systems, then the interview round. Each step builds on the one before it.',
    courseIds: ['design-fundamentals', 'design-patterns', 'design-systems', 'design-rounds'],
    featuredCourseId: 'design-fundamentals',
    featuredLabel: 'New: start here',
  },
  {
    id: 'architecture-production',
    title: 'Production and Cloud',
    description:
      'Keep a system running in production: handle incidents, recover from failures, and run it on the cloud.',
    courseIds: ['resilience-production', 'cloud-architecture'],
  },
  {
    id: 'lead-communicate',
    title: 'Lead and Communicate',
    description:
      'Lead technical work, tell clear stories about what you did, and explain your projects to interviewers and recruiters.',
    courseIds: ['technical-leadership', 'behavioral-carl', 'project-recruiter'],
  },
  {
    id: 'ai',
    title: 'AI',
    description:
      'Design systems that use AI as a component, and work with AI tools while you stay in charge of the decisions.',
    courseIds: ['ai-systems-architecture', 'ai-collaborators'],
  },
];
