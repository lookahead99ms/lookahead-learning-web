import { LOOK_AHEAD_COURSE_GROUPS } from './look-ahead-course-groups';

describe('Look Ahead course placement', () => {
  it('opens with the System Design Ladder, featuring Fundamentals as the place to start', () => {
    const [ladder] = LOOK_AHEAD_COURSE_GROUPS;
    expect(ladder.id).toBe('design-ladder');
    expect(ladder.title).toBe('System Design Ladder');
    expect(ladder.courseIds).toEqual([
      'design-fundamentals',
      'design-patterns',
      'design-systems',
      'design-rounds',
    ]);
    expect(ladder.featuredCourseId).toBe('design-fundamentals');
    expect(ladder.featuredLabel).toBe('New: start here');
    expect(ladder.description.trim().length).toBeGreaterThan(0);
  });

  it('groups the rest into operating systems, leading and communicating, and AI', () => {
    expect(LOOK_AHEAD_COURSE_GROUPS.map((group) => [group.id, group.title])).toEqual([
      ['design-ladder', 'System Design Ladder'],
      ['architecture-production', 'Production and Cloud'],
      ['lead-communicate', 'Lead and Communicate'],
      ['ai', 'AI'],
    ]);
    const byId = new Map(LOOK_AHEAD_COURSE_GROUPS.map((group) => [group.id, group]));
    expect(byId.get('architecture-production')?.courseIds).toEqual([
      'resilience-production',
      'cloud-architecture',
    ]);
    expect(byId.get('architecture-production')?.featuredCourseId).toBeUndefined();
    expect(byId.get('lead-communicate')?.courseIds).toEqual([
      'technical-leadership',
      'behavioral-carl',
      'project-recruiter',
    ]);
    expect(byId.get('ai')?.courseIds).toEqual(['ai-systems-architecture', 'ai-collaborators']);
    for (const group of LOOK_AHEAD_COURSE_GROUPS) {
      expect(group.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('assigns each course to one group and features a course from its own group', () => {
    const ids = LOOK_AHEAD_COURSE_GROUPS.flatMap((group) => group.courseIds);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of LOOK_AHEAD_COURSE_GROUPS) {
      if (group.featuredCourseId) expect(group.courseIds).toContain(group.featuredCourseId);
    }
  });
});
