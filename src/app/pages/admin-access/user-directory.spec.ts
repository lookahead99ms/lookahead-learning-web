import { DirectoryAssignment, DirectoryTestAccount, courseLabel, directoryRows, matchesFilter, plainAccess } from './user-directory';

const titles = new Map([
  ['learn:core-java', 'Java Foundations'],
  ['grow:api-design', 'API Design and Security'],
]);
const test = (username: string, overrides: Partial<DirectoryTestAccount> = {}): DirectoryTestAccount => ({
  accountId: `id-${username}`,
  username,
  roles: [],
  access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] },
  revision: 1,
  lastChangedBy: 'seed',
  lastChangedAt: '2026-10-16T00:00:00Z',
  legacyPresetAvailable: false,
  ...overrides,
});

describe('People directory helpers (DLV-961)', () => {
  it('names courses with their catalog, prettifying unknown ids', () => {
    expect(courseLabel('learn:core-java', titles)).toBe('Java Foundations (Learn)');
    expect(courseLabel('look-ahead:system-design', titles)).toBe('System Design (Blaze)');
    expect(courseLabel('other:x-y', titles)).toBe('X Y');
  });

  it('shows plain plan names, course titles, Full curriculum or Free', () => {
    expect(plainAccess(['Regular · Advance'], [], titles, false)).toEqual(['Advance']);
    expect(plainAccess(['Promo · Annual Promo', 'Regular · Learn'], [], titles, false)).toEqual(['Annual Promo', 'Learn']);
    expect(plainAccess(['Regular · Course Pass · learn:core-java'], ['learn:core-java', 'grow:api-design'], titles, false)).toEqual([
      'Java Foundations (Learn)',
      'API Design and Security (Grow)',
    ]);
    expect(plainAccess(['Free'], [], titles, false)).toEqual(['Free']);
    expect(plainAccess([], [], titles, false)).toEqual(['Free']);
    expect(plainAccess(['Regular · Complete'], [], titles, true)).toEqual(['Full curriculum']);
    expect(plainAccess(['Paid membership'], [], titles, false)).toEqual(['Free']);
  });

  it('merges test accounts with staff assignments and sorts by role, then name, with pending last', () => {
    const assignments: DirectoryAssignment[] = [
      { id: 'a1', accountId: 'id-admin01', pendingEmail: null, roles: ['admin'], topicGrants: [], fullCurriculum: true },
      { id: 'a2', accountId: null, pendingEmail: 'new@example.test', roles: ['reviewer'], topicGrants: [], fullCurriculum: false },
      { id: 'a3', accountId: 'real-learner-0001', pendingEmail: null, roles: [], topicGrants: ['learn:core-java'], fullCurriculum: false },
    ];
    const rows = directoryRows(
      { accountId: 'owner-1', username: 'author', displayName: 'The Author', role: 'owner', topicGrants: [] },
      assignments,
      [
        test('learner12', { access: { label: 'Regular · Advance', labels: ['Regular · Advance'], grantedCourseIds: [] } }),
        test('admin01', { roles: ['admin'] }),
        test('coauthor01', { roles: ['co-author'] }),
        test('learner02'),
      ],
      titles,
    );
    expect(rows.map((row) => [row.name, row.roles.join(', '), row.access.join(' + ')])).toEqual([
      ['author', 'Author (owner)', 'Full curriculum'],
      ['coauthor01', 'Co-author', 'Free'],
      ['admin01', 'Admin', 'Full curriculum'],
      ['Account real-lea', 'Learner', 'Java Foundations (Learn)'],
      ['learner02', 'Learner', 'Free'],
      ['learner12', 'Learner', 'Advance'],
      ['new@example.test', 'Reviewer', 'Free'],
    ]);
    expect(rows[0].isSelf).toBe(true);
    expect(rows[0].detail).toBe('The Author');
    expect(rows.find((row) => row.name === 'new@example.test')?.pending).toBe(true);
    expect(rows.find((row) => row.name === 'learner12')?.detail).toBe('Test account');
  });

  it('shows a non-owner operator their own access, and merges them when they are a test account', () => {
    const rows = directoryRows({ accountId: 'id-admin02', username: 'admin02', role: 'admin', fullCurriculum: true }, [], [test('admin02', { roles: ['admin'] })], titles);
    expect(rows).toHaveLength(1);
    expect(rows[0].isSelf).toBe(true);
    const outside = directoryRows({ accountId: 'x', username: 'reviewer9', role: 'reviewer', topicGrants: ['learn:core-java'] }, [], [], titles);
    expect(outside[0].access).toEqual(['Java Foundations (Learn)']);
    expect(directoryRows({ accountId: 'me', username: 'me', role: 'owner' }, [{ id: 's', accountId: 'me', pendingEmail: null, roles: ['admin'], topicGrants: [], fullCurriculum: true }], [], titles)[0].name).toBe('me');
  });

  it('filters by role and by name, role or plan text', () => {
    const [row] = directoryRows(null, [], [test('learner05', { access: { label: 'Regular · Learn', labels: ['Regular · Learn'] } })], titles);
    expect(matchesFilter(row, '', '')).toBe(true);
    expect(matchesFilter(row, 'learn', 'Learner')).toBe(true);
    expect(matchesFilter(row, 'LEARNER05', '')).toBe(true);
    expect(matchesFilter(row, 'complete', '')).toBe(false);
    expect(matchesFilter(row, '', 'Admin')).toBe(false);
  });
});
