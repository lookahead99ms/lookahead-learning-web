import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
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

  it('remembers Not now per account for this sign-in and survives blocked storage', () => {
    expect(githubDismissed('a')).toBe(false);
    dismissGithub('a');
    expect([githubDismissed('a'), githubDismissed('b')]).toEqual([true, false]);
    useStorage(memoryStorage(true));
    expect(githubDismissed('a')).toBe(false);
    expect(() => dismissGithub('c')).not.toThrow();
  });

  it('never interrupts the Welcome, sign-in or account pages', () => {
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
    return { prompt: TestBed.inject(GithubPrompt), loadProfile, refresh, account, router };
  }

  afterEach(() => vi.restoreAllMocks());

  it('opens the dialog for staff without GitHub once per sign-in, on the page they are on', async () => {
    const { prompt, refresh } = setup();
    expect(await prompt.check(staff)).toBe(true);
    expect(prompt.open()).toBe('staff-1');
    expect(refresh).toHaveBeenCalledTimes(1);
    prompt.close('saved');
    expect(prompt.open()).toBeNull();
    expect(await prompt.check(staff)).toBe(false);
    expect(prompt.open()).toBeNull();
  });

  it('leaves alone the owner, learners, test sessions, people with GitHub, Not now and an unavailable profile', async () => {
    const cases: Array<[Parameters<typeof setup>[0], object]> = [
      [{}, { ...staff, permissions: permissions(true, true) }],
      [{}, { ...staff, permissions: permissions(false, false) }],
      [{ testActive: true }, staff],
      [{ github: 'https://github.com/staff' }, staff],
      [{ profileFails: true }, staff],
    ];
    for (const [options, account] of cases) {
      TestBed.resetTestingModule();
      useStorage(memoryStorage());
      const { prompt } = setup(options);
      expect(await prompt.check(account as never)).toBe(false);
      expect(prompt.open()).toBeNull();
    }
    TestBed.resetTestingModule();
    useStorage(memoryStorage());
    dismissGithub(staff.accountId);
    const { prompt, loadProfile } = setup();
    expect(await prompt.check(staff)).toBe(false);
    expect([prompt.open(), loadProfile.mock.calls.length]).toEqual([null, 0]);
  });

  it('waits on the Welcome, sign-in and account pages and opens on the next other page', async () => {
    const { prompt, router } = setup({ url: '/account' });
    expect(await prompt.check(staff)).toBe(true);
    expect(prompt.open()).toBeNull();
    TestBed.runInInjectionContext(() => prompt.start());
    (router.events as Subject<unknown>).next(new NavigationEnd(1, '/account/links', '/account/links'));
    expect(prompt.open()).toBeNull();
    (router.events as Subject<unknown>).next(new NavigationEnd(2, '/learn', '/learn'));
    expect(prompt.open()).toBe('staff-1');
  });

  it('Not now closes it for this sign-in; signing out lets the next sign-in ask again', async () => {
    const { prompt, account } = setup();
    TestBed.runInInjectionContext(() => prompt.start());
    TestBed.tick();
    await vi.waitFor(() => expect(prompt.open()).toBe('staff-1'));
    prompt.close('later');
    expect([prompt.open(), githubDismissed('staff-1')]).toEqual([null, true]);
    expect(await prompt.check(staff)).toBe(false);
    account.set(null);
    TestBed.tick();
    expect(githubDismissed('staff-1')).toBe(false);
    account.set({ ...staff });
    TestBed.tick();
    await vi.waitFor(() => expect(prompt.open()).toBe('staff-1'));
  });

  it('does not open when another account signed in while the profile was loading', async () => {
    const { prompt, account, loadProfile } = setup();
    loadProfile.mockImplementation(async () => {
      account.set({ ...staff, accountId: 'someone-else' });
      return { displayName: 'Staff', username: 'staff', links: { github: null, linkedin: null, x: null, website: null } };
    });
    expect(await prompt.check(staff)).toBe(false);
    expect(prompt.open()).toBeNull();
  });

  it('treats blocked session storage as already prompted, never opening on every page', async () => {
    const { prompt } = setup();
    useStorage(memoryStorage(), memoryStorage(true));
    expect(await prompt.check(staff)).toBe(false);
    expect(prompt.open()).toBeNull();
  });

  it('checks each signed-in account once from the app shell', async () => {
    const { prompt, loadProfile } = setup();
    TestBed.runInInjectionContext(() => prompt.start());
    TestBed.tick();
    await vi.waitFor(() => expect(prompt.open()).toBe('staff-1'));
    TestBed.tick();
    expect(loadProfile).toHaveBeenCalledTimes(1);
  });
});
