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

  it('keeps independent Java, Python, and Go foundations in one language journey', () => {
    const languages = LEARN_COURSE_GROUPS.find((group) => group.id === 'language-foundations');

    expect(languages?.title).toBe('Programming Language Foundations');
    expect(languages?.courseIds).toEqual([
      'core-java',
      'python-fundamentals',
      'go-fundamentals',
      'language-comparative-analysis',
    ]);
  });

  it('separates Java platform depth from general language foundations', () => {
    const javaPlatform = LEARN_COURSE_GROUPS.find((group) => group.id === 'java-platform');

    expect(javaPlatform?.courseIds).toEqual([
      'java-data-structures',
      'modern-java',
      'garbage-collection',
    ]);
  });

  it('places object modeling, SOLID, patterns, concurrency, and LLD together', () => {
    const objectDesign = LEARN_COURSE_GROUPS.find((group) => group.id === 'object-design-lld');

    expect(objectDesign?.courseIds).toEqual(['oop', 'solid-design-patterns']);
  });
});
