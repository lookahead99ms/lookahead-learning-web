import { DirectoryAssignment, DirectoryTestAccount, courseLabel, directoryRows, matchesFilter, personLines, plainAccess, sameEmailCount, sameEmailText, signInLabels } from './user-directory';

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
      ['The Author', 'Author (owner)', 'Full curriculum'],
      ['coauthor01', 'Co-author', 'Free'],
      ['admin01', 'Admin', 'Full curriculum'],
      ['Account real-lea', 'Learner', 'Java Foundations (Learn)'],
      ['learner02', 'Learner', 'Free'],
      ['learner12', 'Learner', 'Advance'],
      ['new@example.test', 'Reviewer', 'Free'],
    ]);
    expect(rows[0].isSelf).toBe(true);
    expect(rows[0].detail).toBe('author');
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

  it('names a co-author\'s assignments by their labels and keeps an invitation pending (DLV-969)', () => {
    const rows = directoryRows({ accountId: 'co', username: 'co', role: 'co-author' }, [
      { id: 'a1', accountId: null, pendingEmail: null, label: 'Admin 1', pending: false, roles: ['admin'], topicGrants: [], fullCurriculum: true },
      { id: 'a2', accountId: null, pendingEmail: null, label: 'Pending invitation', pending: true, roles: ['tester'], topicGrants: [], fullCurriculum: false },
    ], [], titles);
    const named = rows.filter(row => !row.isSelf);
    expect(named.map(row => [row.name, row.pending, row.detail, row.accountId])).toEqual([
      ['Admin 1', false, null, null], ['Pending invitation', true, 'Waiting for a verified sign-in', null],
    ]);
    // Their own assignment comes back with their account id and name: they always see themselves.
    const own = directoryRows({ accountId: 'co', username: 'co@example.invalid', displayName: 'Co Author', role: 'co-author' }, [
      { id: 'a0', accountId: 'co', pendingEmail: null, label: 'Co Author', pending: false, roles: ['co-author'], topicGrants: [], fullCurriculum: false },
      { id: 'a1', accountId: null, pendingEmail: null, label: 'Co-author 2', pending: false, roles: ['co-author'], topicGrants: [], fullCurriculum: false },
    ], [], titles);
    expect(own.map(row => [row.name, row.isSelf])).toEqual(expect.arrayContaining([['Co Author', true], ['Co-author 2', false]]));
    expect(own).toHaveLength(2);
  });

  it('names you as a person on your own row, never by Cognito\'s google_ id (DLV-969, user 2026-11-03)', () => {
    const google = { accountId: 'me', username: 'google_117602686039051948589', role: 'co-author' };
    const assigned = [{ id: 'a0', accountId: 'me', pendingEmail: null, label: 'Ravi Kumar', pending: false, roles: ['co-author'], topicGrants: [], fullCurriculum: false }];
    const named = directoryRows({ ...google, displayName: 'Ravi Kumar' }, assigned, [], titles);
    expect(named.map(row => [row.name, row.isSelf])).toEqual([['Ravi Kumar', true]]);
    const alone = directoryRows({ ...google, displayName: 'Ravi Kumar' }, [], [], titles);
    expect([alone[0].name, alone[0].detail]).toEqual(['Ravi Kumar', null]);
    // Without a name yet: a plain label, still never the internal id.
    const unnamed = directoryRows(google, [], [], titles);
    expect(unnamed[0].name).toBe('Google account');
    expect(JSON.stringify([named, alone, unnamed])).not.toContain('google_');
  });

  it('carries the owner\'s Disable, Enable and Delete options from the directory (DLV-969)', () => {
    const account = (id: string, extra: object) => ({ accountId: id, username: id + '@gmail.invalid', displayName: id, email: id + '@gmail.invalid', roles: [],
      testAccount: false, fullCurriculum: false, access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] }, ...extra });
    const rows = directoryRows({ accountId: 'me', username: 'me', role: 'owner' }, [], [], titles, [
      account('active', { signIn: 'active', canDisable: true, canRemove: true }),
      account('off', { signIn: 'disabled', canEnable: true, canRemove: true }),
      account('older', {}),
    ]);
    const flags = (id: string) => { const row = rows.find(item => item.accountId === id)!; return [row.disabled, row.canDisable, row.canEnable, row.canRemove]; };
    expect(flags('active')).toEqual([false, true, false, true]);
    expect(flags('off')).toEqual([true, false, true, true]);
    expect(flags('older')).toEqual([false, false, false, false]);
  });

  it('carries the owner\'s sign-in methods and same-email flag from the directory only (DLV-969 account linking)', () => {
    const account = (id: string, extra: object) => ({ accountId: id, username: id, displayName: id, email: id + '@gmail.com', roles: [],
      testAccount: false, fullCurriculum: false, access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] }, ...extra });
    const rows = directoryRows({ accountId: 'me', username: 'me', role: 'owner' }, [
      { id: 'a1', accountId: 'linked', pendingEmail: null, roles: ['tester'], topicGrants: [], fullCurriculum: false },
    ], [], titles, [
      account('linked', { sameEmailAccounts: 2, signInMethods: [{ provider: 'cognito', email: 'linked@gmail.com' }, { provider: 'google', email: 'linked@gmail.com' }] }),
      account('single', { sameEmailAccounts: 0, signInMethods: [{ provider: 'google', email: 'single@gmail.com' }] }),
      account('older', {}),
    ]);
    const row = (id: string) => rows.find(item => item.accountId === id)!;
    expect([row('linked').signInLabels, row('linked').sameEmail]).toEqual([['Google', 'Password'], 'Same Gmail as 2 other accounts']);
    expect([row('single').signInLabels, row('single').sameEmail]).toEqual([['Google'], undefined]);
    expect([row('older').signInLabels, row('older').sameEmail]).toEqual([[], undefined]);
    // Rows that do not come from the owner's directory never carry identity data.
    const coauthor = directoryRows({ accountId: 'co', username: 'co', role: 'co-author' }, [
      { id: 'a1', accountId: null, pendingEmail: null, label: 'Tester 1', pending: false, roles: ['tester'], topicGrants: [], fullCurriculum: false },
    ], [test('learner01')], titles);
    expect(coauthor.every(item => item.signInLabels === undefined && item.sameEmail === undefined)).toBe(true);
  });

  it('carries the GitHub address from the owner\'s directory only, never for test accounts (DLV-969, owner 2026-11-05)', () => {
    const account = (id: string, extra: object) => ({ accountId: id, username: id, displayName: id, email: null, roles: [],
      testAccount: false, fullCurriculum: false, access: { label: 'Free', labels: ['Free'], grantedCourseIds: [] }, ...extra });
    const rows = directoryRows({ accountId: 'me', username: 'me', role: 'owner' }, [], [], titles, [
      account('given', { github: 'https://github.com/given-person' }),
      account('none', { github: null }),
      account('odd', { github: 'https://example.com/x' }),
      account('older', {}),
      account('fixture', { testAccount: true, github: 'https://github.com/fixture' }),
    ]);
    const github = (id: string) => rows.find(item => item.accountId === id)!.github;
    expect([github('given'), github('none'), github('odd'), github('older'), github('fixture')])
      .toEqual(['https://github.com/given-person', null, null, undefined, undefined]);
    const coauthor = directoryRows({ accountId: 'co', username: 'co', role: 'co-author' }, [], [test('learner01')], titles);
    expect(coauthor.every(item => item.github === undefined)).toBe(true);
  });

  it('labels methods once each and words the same-email flag by the address', () => {
    expect(signInLabels([{ provider: 'cognito', email: 'a@x.test' }, { provider: 'cognito', email: 'b@x.test' }, { provider: 'google' }])).toEqual(['Google', 'Password']);
    expect(signInLabels(undefined)).toEqual([]);
    expect([sameEmailCount(1), sameEmailCount(0), sameEmailCount(-2), sameEmailCount(2.5), sameEmailCount('3')]).toEqual([1, 0, 0, 0, 0]);
    expect(sameEmailText(1, 'Sam@GoogleMail.com')).toBe('Same Gmail as 1 other account');
    expect(sameEmailText(4, 'sam@example.test')).toBe('Same email as 4 other accounts');
    expect(sameEmailText(1, null)).toBe('Same email as 1 other account');
  });

  it('names a person the human way for the owner: name, then email; never Cognito\'s google_ id (DLV-969)', () => {
    expect(personLines({ username: 'google_117602686039', displayName: 'Priya Raman', email: 'priya@gmail.example' }))
      .toEqual({ name: 'Priya Raman', detail: 'priya@gmail.example' });
    expect(personLines({ username: 'google_117602686039', displayName: 'google_117602686039', email: 'priya@gmail.example' }))
      .toEqual({ name: 'priya@gmail.example', detail: null });
    expect(personLines({ username: 'google_1', displayName: '', email: null })).toEqual({ name: 'Google account', detail: null });
    expect(personLines({ username: 'sam@example.test', displayName: 'Sam K', email: 'sam@example.test' })).toEqual({ name: 'Sam K', detail: 'sam@example.test' });
    expect(personLines({ username: 'learner09', displayName: 'learner09', email: null })).toEqual({ name: 'learner09', detail: null });
    expect(personLines({ username: 'real-user', displayName: 'Real User', email: 'real@example.test' })).toEqual({ name: 'Real User', detail: 'real@example.test · real-user' });
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
