import { describe, expect, it } from 'vitest';
import { LEARN_COURSE_GROUPS } from './learn-course-groups';

describe('LEARN_COURSE_GROUPS', () => {
  it('keeps engineering-tool foundations in Learn', () => {
    const tools = LEARN_COURSE_GROUPS.find((group) => group.id === 'engineering-tools');

    expect(tools?.courseIds).toEqual(['developer-workflow', 'git', 'linux', 'sql', 'docker']);
    expect(tools?.courseIds).not.toContain('public-platform-demo');
  });

  it('assigns each course to one Learn group', () => {
    const courseIds = LEARN_COURSE_GROUPS.flatMap((group) => group.courseIds);

    expect(new Set(courseIds).size).toBe(courseIds.length);
  });
});
