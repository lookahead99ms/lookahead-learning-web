import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MembershipApi } from '../../content/membership-api';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { TestSessions, UsableTestAccount, sameSitePath, scenarioDetail, scenarioPlan } from './test-sessions';

const learner: UsableTestAccount = {
  accountId: 'id-learner05', username: 'learner05@lookahead.dev', displayName: 'Learner05', roles: [], scenario: 'Learn · active · ready-made plan · in progress',
};
const admin: UsableTestAccount = {
  accountId: 'id-admin01', username: 'admin01@lookahead.dev', displayName: 'Admin01', roles: ['admin'], scenario: 'Admin with the full curriculum',
};

/** DLV-969 (owner, 2026-11-04): switching to a DEV test account from the account menu, and back. */
describe('TestSessions', () => {
  let request: ReturnType<typeof vi.fn>;
  let assign: ReturnType<typeof vi.fn>;
  let stored: Map<string, string>;
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  const account = signal<{ accountId: string; displayName: string } | null>({ accountId: 'owner', displayName: 'Author' });
  let sessions: TestSessions;

  beforeEach(() => {
    request = vi.fn();
    assign = vi.fn();
    stored = new Map();
    storage = {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
      removeItem: (key) => void stored.delete(key),
    };
    const view = { location: { assign }, get sessionStorage() { return storage; } };
    TestBed.configureTestingModule({
      providers: [
        { provide: MembershipApi, useValue: { request } },
        { provide: StudyPlanAccount, useValue: { account } },
        { provide: DOCUMENT, useValue: { defaultView: view } },
      ],
    });
    sessions = TestBed.inject(TestSessions);
  });

  it('switches from your own account, remembering your name, and opens the platform as the test account', async () => {
    request.mockResolvedValueOnce({ next: '/learn' });
    await sessions.use(learner);
    expect(request).toHaveBeenCalledWith('/auth/test-session', { accountId: 'id-learner05' });
    expect(assign).toHaveBeenCalledWith('/learn');
    expect(stored.get('lookahead.testSession.holder')).toBe('Author');
    // After the reload: the Gateway says a test account is in use, and the menu can say who you are.
    request.mockResolvedValueOnce({ active: true, canReturn: true }).mockResolvedValueOnce([learner, admin]);
    await sessions.refresh();
    expect(sessions.status()).toEqual({ active: true, canReturn: true, holderName: 'Author' });
    expect(sessions.accounts()).toEqual([learner, admin]);
    expect(sessions.current('id-learner05')).toBe(learner);
    expect(sessions.current('someone-else')).toBeNull();
    expect(sessions.current(null)).toBeNull();
  });

  it('keeps the first name when switching between test accounts, and forgets it once back', async () => {
    stored.set('lookahead.testSession.holder', 'Author');
    request.mockResolvedValueOnce({ active: true, canReturn: true }).mockResolvedValueOnce([learner]);
    await sessions.refresh();
    account.set({ accountId: 'id-learner05', displayName: 'Learner05' });
    request.mockResolvedValueOnce({ next: '/' });
    await sessions.use(admin);
    expect(stored.get('lookahead.testSession.holder')).toBe('Author');
    sessions.starting.set(null); // the page reloads in a browser
    request.mockResolvedValueOnce({ next: '/' });
    await sessions.back();
    expect(request).toHaveBeenLastCalledWith('/auth/test-session/end', {});
    expect(assign).toHaveBeenLastCalledWith('/');
    request.mockResolvedValueOnce({ active: false, canReturn: false });
    await sessions.refresh();
    expect(sessions.status()).toEqual({ active: false, canReturn: false, holderName: null });
    expect(stored.has('lookahead.testSession.holder')).toBe(false);
    expect(sessions.current('id-learner05')).toBeNull();
    account.set({ accountId: 'owner', displayName: 'Author' });
  });

  it('goes only to a path on this site, whatever the answer says', async () => {
    for (const next of ['//elsewhere.example', 'https://elsewhere.example/', undefined]) {
      request.mockResolvedValueOnce(next === undefined ? null : { next });
      await sessions.use(learner);
      expect(assign).toHaveBeenLastCalledWith('/');
      sessions.starting.set(null);
    }
  });

  it('lands on a same-site next path instead of the Gateway’s answer, for back() and use() (DLV-969)', async () => {
    const review = '/admin/access?tab=waiting&view=purchases&request=pur-9&return=%2Fgrow%2Fjava&account=id-learner05';
    request.mockResolvedValueOnce({ next: '/sign-in' });
    await sessions.back(review);
    expect(request).toHaveBeenLastCalledWith('/auth/test-session/end', {});
    expect(assign).toHaveBeenLastCalledWith(review);
    sessions.returning.set(false);
    request.mockResolvedValueOnce({ next: '/' });
    await sessions.use(learner, '/grow/java/streams');
    expect(request).toHaveBeenLastCalledWith('/auth/test-session', { accountId: 'id-learner05' });
    expect(assign).toHaveBeenLastCalledWith('/grow/java/streams');
    sessions.starting.set(null);
    // Anything that is not a single leading "/" is ignored: the Gateway's answer (itself checked) is used instead.
    for (const next of ['//elsewhere.example', 'https://elsewhere.example/', '/\\elsewhere.example', 'learn', '', null, undefined]) {
      request.mockResolvedValueOnce({ next: '/learn' });
      await sessions.use(learner, next);
      expect(assign).toHaveBeenLastCalledWith('/learn');
      sessions.starting.set(null);
      request.mockResolvedValueOnce({ next: '//elsewhere.example' });
      await sessions.back(next);
      expect(assign).toHaveBeenLastCalledWith('/');
      sessions.returning.set(false);
    }
    // A failed end keeps you where you are, even with a next path.
    request.mockRejectedValueOnce(new Error('Gateway down'));
    assign.mockClear();
    await sessions.back(review);
    expect(assign).not.toHaveBeenCalled();
    expect(sessions.error()).toBe('Gateway down');
  });

  it('accepts only same-site paths', () => {
    expect(sameSitePath('/')).toBe('/');
    expect(sameSitePath('/grow/java?unit=2#top')).toBe('/grow/java?unit=2#top');
    for (const value of ['//host', '/\\host', 'https://host/', 'javascript:alert(1)', 'grow', '', '/a\nb', '/a\u0000', 42, null, undefined]) {
      expect(sameSitePath(value)).toBeNull();
    }
  });

  it('says why a switch or the way back failed, and lets you try again', async () => {
    request.mockRejectedValueOnce(new Error('Your role cannot use this test account.'));
    await sessions.use(learner);
    expect(sessions.error()).toBe('Your role cannot use this test account.');
    expect(sessions.starting()).toBeNull();
    request.mockRejectedValueOnce('no message');
    await sessions.use(learner);
    expect(sessions.error()).toBe('The test account could not be opened. Try again.');
    request.mockRejectedValueOnce(new Error(''));
    await sessions.back();
    expect(sessions.error()).toBe('Could not go back to your account. Try again.');
    expect(sessions.returning()).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('does one thing at a time', async () => {
    sessions.starting.set('id-admin01');
    await sessions.use(learner);
    await sessions.back();
    sessions.starting.set(null);
    sessions.returning.set(true);
    await sessions.use(learner);
    await sessions.back();
    expect(request).not.toHaveBeenCalled();
  });

  it('opens the dialog, loads the list once, and closes unless a switch is under way', async () => {
    request.mockResolvedValueOnce([learner]);
    await sessions.open();
    await sessions.open();
    expect(request).toHaveBeenCalledTimes(1);
    expect(sessions.pickerOpen()).toBe(true);
    sessions.starting.set('id-learner05');
    sessions.close();
    expect(sessions.pickerOpen()).toBe(true);
    sessions.starting.set(null);
    sessions.close();
    expect(sessions.pickerOpen()).toBe(false);
  });

  it('shows an empty list and a reason when the list cannot load', async () => {
    request.mockRejectedValueOnce(new Error('Test accounts are unavailable. Retry shortly.'));
    await sessions.open();
    expect(sessions.accounts()).toEqual([]);
    expect(sessions.error()).toBe('Test accounts are unavailable. Retry shortly.');
    request.mockResolvedValueOnce({ unexpected: true });
    await sessions.load();
    expect(sessions.accounts()).toEqual([]);
    request.mockRejectedValueOnce('no message');
    await sessions.load();
    expect(sessions.error()).toBe('Test accounts could not be loaded. Close and try again.');
  });

  it('treats a failed status check as no test session, and a missing answer as not active', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    await sessions.refresh();
    expect(sessions.status()).toBeNull();
    expect(sessions.active()).toBe(false);
    request.mockResolvedValueOnce(null);
    await sessions.refresh();
    expect(sessions.status()).toEqual({ active: false, canReturn: false, holderName: null });
  });

  it('still works when the browser refuses session storage', async () => {
    storage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    request.mockResolvedValueOnce({ next: '/' });
    await sessions.use(learner);
    expect(assign).toHaveBeenCalledWith('/');
    request.mockResolvedValueOnce({ active: true, canReturn: false }).mockResolvedValueOnce([]);
    await sessions.refresh();
    expect(sessions.status()).toEqual({ active: true, canReturn: false, holderName: null });
  });

  it('describes a scenario by its plan and the rest; a created account has neither (every test account is a learner, owner 2026-11-06)', () => {
    expect(scenarioPlan(learner)).toBe('Learn');
    expect(scenarioDetail(learner)).toBe('active · ready-made plan · in progress');
    expect(scenarioPlan({ ...learner, scenario: null })).toBeNull();
    expect(scenarioPlan({ ...learner, scenario: ' · x' })).toBeNull();
    expect(scenarioDetail({ ...learner, scenario: null })).toBe('Created test account');
  });
});
