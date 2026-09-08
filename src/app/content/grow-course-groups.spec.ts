import { GROW_COURSE_GROUPS } from './grow-course-groups';

describe('Grow course placement', () => {
  it('places React and Vue beside Angular and Node.js in backend engineering', () => {
    const frontend = GROW_COURSE_GROUPS.find((group) => group.id === 'frontend-engineering');
    const backend = GROW_COURSE_GROUPS.find((group) => group.id === 'backend-engineering');
    expect(frontend?.courseIds).toEqual(['angular', 'react', 'vue']);
    expect(backend?.courseIds).toContain('nodejs');
    expect(frontend?.courseIds).not.toContain('nodejs');
  });

  it('places practical AI in one dedicated Grow group', () => {
    const ai = GROW_COURSE_GROUPS.find((group) => group.id === 'ai-engineering');
    expect(ai?.courseIds).toEqual(['ai-assisted-development']);
  });

  it('assigns each course to one navigation group', () => {
    const ids = GROW_COURSE_GROUPS.flatMap((group) => group.courseIds);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
