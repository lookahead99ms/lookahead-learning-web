import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TestSessions } from '../test-session/test-sessions';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import {
  GithubPrompt,
  asksForGithub,
  dismissGithub,
  githubDismissed,
  githubDisplay,
  normalizeGithub,
  promptSkips,
} from './github-account';

/** An in-memory Storage for this spec (the test environment has none); `blocked` makes every call throw. */
function memoryStorage(blocked = false): Storage {
  const data = new Map<string, string>();
  const guard = <T>(run: () => T): T => { if (blocked) throw new Error('blocked'); return run(); };
  return {
    get length() { return data.size; },
    clear: () => guard(() => data.clear()),
    getItem: (key: string) => guard(() => data.get(key) ?? null),
    key: (index: number) => guard(() => [...data.keys()][index] ?? null),
    removeItem: (key: string) => guard(() => { data.delete(key); }),
    setItem: (key: string, value: string) => guard(() => { data.set(key, String(value)); }),
  };
}
const saved = { local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
function useStorage(local: Storage, session: Storage = memoryStorage()): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
}
beforeEach(() => useStorage(memoryStorage()));
afterEach(() => {
  for (const [name, descriptor] of [['localStorage', saved.local], ['sessionStorage', saved.session]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

const permissions = (manageAccess: boolean, previewDocuments: boolean) => ({
  manageAccess, previewDocuments, deliveryRead: false, deliveryCreate: false, deliveryReview: false, deliveryDone: false,
  triageFeedback: false, fullCurriculum: false, feedbackRole: manageAccess ? 'owner' : previewDocuments ? 'reviewer' : 'user',
});
const staff = { accountId: 'staff-1', username: 'staff', displayName: 'Staff', topicGrants: [], permissions: permissions(false, true) };

describe('GitHub account helpers (DLV-969)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('turns a username, @name, github.com path or https address into one profile address', () => {
    for (const value of ['octocat', '@octocat', 'github.com/octocat', 'https://github.com/octocat', ' https://www.github.com/octocat/ ', 'http://github.com/octocat']) {
      expect(normalizeGithub(value)).toEqual({ url: 'https://github.com/octocat' });
    }
    expect(normalizeGithub('Mona-Lisa-2')).toEqual({ url: 'https://github.com/Mona-Lisa-2' });
  });

  it('refuses what GitHub would never accept as a username, before any request', () => {
    expect(normalizeGithub('  ')).toEqual({ error: 'Enter your GitHub username or the address of your GitHub profile.' });
    for (const value of ['-octo', 'octo-', 'oc--to', 'a'.repeat(40), 'octo cat', 'github.com/octo/repo', 'https://gitlab.com/octocat', 'octo_cat']) {
      expect(normalizeGithub(value)).toEqual({
        error: 'That isn’t a GitHub username. Use letters, digits and single hyphens, up to 39 characters, for example octocat.',
      });
    }
    expect(normalizeGithub('a'.repeat(39))).toEqual({ url: 'https://github.com/' + 'a'.repeat(39) });
  });

  it('shows a saved address as github.com/<name> and nothing else', () => {
    expect(githubDisplay('https://github.com/octocat')).toBe('github.com/octocat');
    expect(githubDisplay('https://www.github.com/octocat/')).toBe('github.com/octocat');
    expect([githubDisplay('https://github.com/octo/repo'), githubDisplay('https://example.com/octocat'), githubDisplay(null), githubDisplay(3)]).toEqual([null, null, null, null]);
  });

  it('asks staff only: never the owner, a learner or a signed-out visitor', () => {
    expect(asksForGithub(staff)).toBe(true);
    expect(asksForGithub({ ...staff, permissions: permissions(true, true) })).toBe(false);
    expect(asksForGithub({ ...staff, permissions: permissions(false, false) })).toBe(false);
    expect(asksForGithub({ ...staff, permissions: undefined })).toBe(false);
    expect(asksForGithub(null)).toBe(false);
  });

  it('remembers Not now per account and survives blocked storage', () => {
    expect(githubDismissed('a')).toBe(false);
    dismissGithub('a');
    expect([githubDismissed('a'), githubDismissed('b')]).toEqual([true, false]);
    useStorage(memoryStorage(true));
    expect(githubDismissed('a')).toBe(false);
    expect(() => dismissGithub('c')).not.toThrow();
  });

  it('never interrupts Welcome, sign-in or the account pages', () => {
    for (const url of ['/welcome?setup=github', '/sign-in', '/sign-in/choose', '/account', '/account/merge?offer=1']) expect(promptSkips(url)).toBe(true);
    for (const url of ['/', '/learn', '/admin/access?tab=people', '/accounting']) expect(promptSkips(url)).toBe(false);
  });
});

describe('GithubPrompt (DLV-969)', () => {
  function setup(options: { account?: object | null; github?: string | null; testActive?: boolean; profileFails?: boolean; url?: string } = {}) {
    const account = signal<any>(options.account === undefined ? staff : options.account);
    const loadProfile = vi.fn(async () => {
      if (options.profileFails) throw new Error('down');
      return { displayName: 'Staff', username: 'staff', links: { github: options.github ?? null, linkedin: null, x: null, website: null } };
    });
    const status = signal<any>(null);
    const refresh = vi.fn(async () => status.set({ active: !!options.testActive, canReturn: false, holderName: null }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: StudyPlanAccount, useValue: { account, loadProfile, sessionKnown: signal(true), sessionExpired: signal(false) } },
        { provide: TestSessions, useValue: { status, refresh, active: () => status()?.active === true } },
      ],
    });
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', { get: () => options.url ?? '/learn/java' });
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return { prompt: TestBed.inject(GithubPrompt), navigate, loadProfile, refresh, account };
  }

  afterEach(() => vi.restoreAllMocks());

  it('sends staff without GitHub to the Welcome card once per browser session, with the page they opened', async () => {
    const { prompt, navigate, refresh } = setup();
    expect(await prompt.check(staff)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/welcome'], { queryParams: { setup: 'github', next: '/learn/java' } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(prompt.redirected()).toBe(true);
    expect(await prompt.check(staff)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('leaves alone the owner, learners, test sessions, people with GitHub, Not now and the Welcome page', async () => {
    const cases: Array<[Parameters<typeof setup>[0], object]> = [
      [{}, { ...staff, permissions: permissions(true, true) }],
      [{}, { ...staff, permissions: permissions(false, false) }],
      [{ testActive: true }, staff],
      [{ github: 'https://github.com/staff' }, staff],
      [{ url: '/welcome' }, staff],
      [{ url: '/account' }, staff],
      [{ profileFails: true }, staff],
    ];
    for (const [options, account] of cases) {
      TestBed.resetTestingModule();
      useStorage(memoryStorage());
      const { prompt, navigate } = setup(options);
      expect(await prompt.check(account as never)).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    }
    TestBed.resetTestingModule();
    useStorage(memoryStorage());
    dismissGithub(staff.accountId);
    const { prompt, navigate, loadProfile } = setup();
    expect(await prompt.check(staff)).toBe(false);
    expect([navigate.mock.calls.length, loadProfile.mock.calls.length]).toEqual([0, 0]);
  });

  it('does not redirect when another account signed in while the profile was loading', async () => {
    const { prompt, navigate, account, loadProfile } = setup();
    loadProfile.mockImplementation(async () => {
      account.set({ ...staff, accountId: 'someone-else' });
      return { displayName: 'Staff', username: 'staff', links: { github: null, linkedin: null, x: null, website: null } };
    });
    expect(await prompt.check(staff)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('treats blocked session storage as already prompted, never redirecting on every page', async () => {
    const { prompt, navigate } = setup();
    useStorage(memoryStorage(), memoryStorage(true));
    expect(await prompt.check(staff)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('checks each signed-in account once from the app shell', async () => {
    const { prompt, navigate } = setup();
    TestBed.runInInjectionContext(() => prompt.start());
    TestBed.tick();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    TestBed.tick();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
