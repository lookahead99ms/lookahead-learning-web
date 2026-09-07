import { GROW_COURSE_GROUPS } from './grow-course-groups';

describe('Grow course placement', () => {
  it('places Vue beside Angular and Node.js in backend engineering', () => {
    const frontend = GROW_COURSE_GROUPS.find((group) => group.id === 'frontend-engineering');
    const backend = GROW_COURSE_GROUPS.find((group) => group.id === 'backend-engineering');
    expect(frontend?.courseIds).toEqual(['angular', 'vue']);
    expect(backend?.courseIds).toContain('nodejs');
    expect(frontend?.courseIds).not.toContain('nodejs');
  });

  it('assigns each course to one navigation group', () => {
    const ids = GROW_COURSE_GROUPS.flatMap((group) => group.courseIds);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
