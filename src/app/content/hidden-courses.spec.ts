import {
  HIDDEN_COURSE_IDS,
  isHiddenCourse,
  withoutHiddenCourseDocuments,
  withoutHiddenCourses,
} from './hidden-courses';
import { BLAZE_COURSE_GROUPS } from './blaze-course-groups';
import { STUDY_PLAN_EXCLUDED_BLAZE_COURSE_IDS } from './study-plan';

describe('hidden courses', () => {
  it('lists the three retired Blaze courses', () => {
    expect([...HIDDEN_COURSE_IDS]).toEqual([
      'blaze:system-design',
      'blaze:distributed-systems',
      'blaze:scalability-performance',
    ]);
  });

  it('matches by path and course id only', () => {
    expect(isHiddenCourse('blaze', 'system-design')).toBe(true);
    expect(isHiddenCourse('learn', 'system-design')).toBe(false);
    expect(isHiddenCourse('blaze', 'design-fundamentals')).toBe(false);
  });

  it('filters catalog items and search documents', () => {
    expect(
      withoutHiddenCourses('blaze', [{ id: 'system-design' }, { id: 'design-patterns' }]),
    ).toEqual([{ id: 'design-patterns' }]);
    expect(
      withoutHiddenCourseDocuments([
        { path: 'blaze', courseId: 'distributed-systems' },
        { path: 'grow', courseId: 'distributed-systems' },
      ]),
    ).toEqual([{ path: 'grow', courseId: 'distributed-systems' }]);
  });

  it('keeps hidden courses out of groups and study-plan offerings', () => {
    const grouped = BLAZE_COURSE_GROUPS.flatMap((group) => group.courseIds);
    for (const id of HIDDEN_COURSE_IDS) {
      expect(grouped).not.toContain(id.split(':')[1]);
      expect(STUDY_PLAN_EXCLUDED_BLAZE_COURSE_IDS.has(id.split(':')[1])).toBe(true);
    }
    expect(BLAZE_COURSE_GROUPS.find((g) => g.id === 'architecture-production')?.courseIds).toEqual([
      'resilience-production',
      'cloud-architecture',
    ]);
  });
});
