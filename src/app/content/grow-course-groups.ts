import { CatalogCourseGroup } from './catalog-course-groups';

export type GrowCourseGroup = CatalogCourseGroup;

export const GROW_COURSE_GROUPS: GrowCourseGroup[] = [
  {
    id: 'backend-engineering',
    title: 'Backend Engineering',
    description:
      'Build robust Java and Node.js services with explicit API and persistence contracts.',
    courseIds: ['advanced-java', 'spring-framework', 'spring-boot', 'data-access', 'nodejs'],
  },
  {
    id: 'system-security',
    title: 'System & Security',
    description: 'Design secure APIs and resilient systems under real distributed constraints.',
    courseIds: ['api-design', 'microservices', 'distributed-systems', 'technical-scenarios'],
  },
  {
    id: 'frontend-engineering',
    title: 'Frontend Engineering',
    description: 'Build scalable, responsive client applications and integration boundaries.',
    courseIds: ['angular', 'react', 'vue'],
  },
  {
    id: 'ai-engineering',
    title: 'AI Engineering',
    description:
      'Build bounded AI capabilities with explicit evidence, evaluation, security, and operational ownership.',
    courseIds: ['ai-assisted-development'],
  },
  {
    id: 'cloud-delivery',
    title: 'Cloud & Delivery',
    description: 'Operate, ship, observe, and recover production workloads with confidence.',
    courseIds: [
      'aws-cloud',
      'docker-kubernetes',
      'cicd',
      'monitoring-alerts',
      'quality-engineering',
      'public-release-demo',
    ],
  },
];
