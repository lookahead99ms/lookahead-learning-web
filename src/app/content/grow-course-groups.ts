export interface GrowCourseGroup {
  id: string;
  title: string;
  description: string;
  courseIds: string[];
}

export const GROW_COURSE_GROUPS: GrowCourseGroup[] = [
  {
    id: 'backend-engineering',
    title: 'Backend Engineering',
    description: 'Build robust Spring applications, services, and persistence layers.',
    courseIds: ['advanced-java', 'spring-framework', 'spring-boot', 'data-access'],
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
    courseIds: ['angular'],
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
