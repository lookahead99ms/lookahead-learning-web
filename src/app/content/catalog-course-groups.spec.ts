import { describe, expect, it } from 'vitest';
import { catalogGroupForCourse, nextCatalogGroup } from './catalog-course-groups';

describe('catalog course groups', () => {
  it('finds the group a course is listed under', () => {
    expect(catalogGroupForCourse('learn', 'modern-java')?.title).toBe('Java Platform and Runtime');
    expect(catalogGroupForCourse('learn', 'no-such-course')).toBeNull();
    expect(catalogGroupForCourse('elsewhere', 'modern-java')).toBeNull();
  });

  it('finds the group listed after it on the same path page', () => {
    expect(nextCatalogGroup('learn', 'java-platform')?.title).toBe('Web Foundations');
    expect(nextCatalogGroup('learn', 'no-such-group')).toBeNull();
  });
});
