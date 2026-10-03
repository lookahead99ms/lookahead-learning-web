import {
  HIDDEN_COURSE_IDS,
  isHiddenCourse,
  withoutHiddenCourseDocuments,
  withoutHiddenCourses,
} from './hidden-courses';
import { LOOK_AHEAD_COURSE_GROUPS } from './look-ahead-course-groups';
import { STUDY_PLAN_EXCLUDED_LOOK_AHEAD_COURSE_IDS } from './study-plan';

describe('hidden courses', () => {
  it('lists the three retired Look Ahead courses', () => {
    expect([...HIDDEN_COURSE_IDS]).toEqual([
      'look-ahead:system-design',
      'look-ahead:distributed-systems',
      'look-ahead:scalability-performance',
    ]);
  });

  it('matches by path and course id only', () => {
    expect(isHiddenCourse('look-ahead', 'system-design')).toBe(true);
    expect(isHiddenCourse('learn', 'system-design')).toBe(false);
    expect(isHiddenCourse('look-ahead', 'design-fundamentals')).toBe(false);
  });

  it('filters catalog items and search documents', () => {
    expect(
      withoutHiddenCourses('look-ahead', [{ id: 'system-design' }, { id: 'design-patterns' }]),
    ).toEqual([{ id: 'design-patterns' }]);
    expect(
      withoutHiddenCourseDocuments([
        { path: 'look-ahead', courseId: 'distributed-systems' },
        { path: 'grow', courseId: 'distributed-systems' },
      ]),
    ).toEqual([{ path: 'grow', courseId: 'distributed-systems' }]);
  });

  it('keeps hidden courses out of groups and study-plan offerings', () => {
    const grouped = LOOK_AHEAD_COURSE_GROUPS.flatMap((group) => group.courseIds);
    for (const id of HIDDEN_COURSE_IDS) {
      expect(grouped).not.toContain(id.split(':')[1]);
      expect(STUDY_PLAN_EXCLUDED_LOOK_AHEAD_COURSE_IDS.has(id.split(':')[1])).toBe(true);
    }
    expect(LOOK_AHEAD_COURSE_GROUPS.find((g) => g.id === 'architecture-production')?.courseIds).toEqual([
      'resilience-production',
      'cloud-architecture',
    ]);
  });
});
