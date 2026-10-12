import { accountMembership, joinPaths } from './account-membership';

describe('account membership', () => {
  it('reads Author, course access or Free from server grants only', () => {
    expect(accountMembership({ topicGrants: [], authorPreview: true }).level).toBe('Author');
    expect(accountMembership({ topicGrants: [] })).toEqual({
      level: 'Free',
      courseCount: 0,
      paths: [],
      pathCourses: {},
    });
    expect(
      accountMembership({
        topicGrants: ['look-ahead:design-systems', 'learn:core-java', 'learn:core-java', 'blaze:x'],
      }),
    ).toEqual({
      level: 'Course access',
      courseCount: 3,
      paths: ['Learn', 'Blaze'],
      pathCourses: { Learn: 1, Blaze: 2 },
    });
  });

  it('ignores grants that are not path-qualified courses', () => {
    expect(accountMembership({ topicGrants: ['everything'] }).level).toBe('Free');
  });

  it('joins path names for a sentence', () => {
    expect(joinPaths([])).toBe('');
    expect(joinPaths(['Learn'])).toBe('Learn');
    expect(joinPaths(['Learn', 'Grow', 'Blaze'])).toBe('Learn, Grow and Blaze');
  });
});
