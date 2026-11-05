import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { PageSidebarContext } from '../../core/page-sidebars/page-sidebar-context';
import { WelcomePage } from './welcome';
import { signal } from '@angular/core';
import { TestSessions } from '../../core/test-session/test-sessions';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { dismissGithub } from '../../core/github-account/github-account';

function render(query: Record<string, string>) {
  TestBed.configureTestingModule({
    imports: [WelcomePage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)), snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const fixture = TestBed.createComponent(WelcomePage);
  fixture.detectChanges();
  return fixture;
}

describe('WelcomePage', () => {
  it('shows the header, the waiting notice, the Essence and the footer for ?access=pending', () => {
    const fixture = render({ access: 'pending' });
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('app-platform-header')).not.toBeNull();
    const notice = root.querySelector('aside.access-pending');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.querySelector('h2')?.textContent?.trim()).toBe('Your sign-in worked');
    expect(notice?.querySelector('p')?.textContent?.trim()).toBe(
      'The owner has to approve your access before you can use Look Ahead. Sign in again once you hear back.',
    );
    const main = root.querySelector('main#main-content.welcome-page');
    expect([...(main?.children ?? [])].map((child) => child.tagName.toLowerCase())).toEqual(['aside', 'section', 'footer']);
    expect(main?.querySelector('section.brand-story.home-essence app-wordmark-key')).not.toBeNull();
    // The Essence starts on load here, not after a scroll as on the homepage (user, 2026-11-03).
    const story = fixture.debugElement.query((node) => node.name === 'section' && node.nativeElement.classList.contains('home-essence'));
    expect(story.componentInstance.autoplay()).toBe(true);
    expect(root.querySelector('.welcome-footer p')?.textContent?.trim()).toBe('Learn. Grow. Blaze.');
    expect(root.querySelectorAll('.welcome-footer .footer-statements > *')).toHaveLength(2);
  });

  it('says plainly when a page is not open to the account, above the Essence, instead of opening the Study Plan', () => {
    const fixture = render({ access: 'denied' });
    const root: HTMLElement = fixture.nativeElement;
    const notice = root.querySelector('aside.access-pending');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.querySelector('h2')?.textContent?.trim()).toBe('This page isn’t open to your account');
    expect(notice?.textContent).toContain('Everything you can open is in the menu above, or go Home.');
    expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(notice?.textContent).not.toContain('Your sign-in worked');
    expect(root.querySelector('section.home-essence')).not.toBeNull();
  });

  it('shows only the Essence without the query, with no side navigation and no content requests', () => {
    const fixture = render({});
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.access-pending')).toBeNull();
    expect(root.querySelector('section.home-essence')).not.toBeNull();
    expect(TestBed.inject(PageSidebarContext).value()?.excluded).toBe(true);
    const http = TestBed.inject(HttpTestingController);
    expect(http.match((request) => request.url.includes('/content/'))).toHaveLength(0);
  });

  it('says it is Look Ahead DEV for invited members while the DEV gate answers, admitted or not', () => {
    for (const mode of ['gated', 'admitted'] as const) {
      TestBed.resetTestingModule();
      const fixture = render({ access: 'pending' });
      const session = TestBed.inject(DevSession);
      if (mode === 'gated') session.gated.set(true);
      else session.status.set({ dev: true, deadline: '', warning: false, maintenance: false });
      fixture.detectChanges();
      const notice: HTMLElement = fixture.nativeElement.querySelector('aside.access-pending');
      expect(notice.querySelector('h2')?.textContent?.trim()).toBe('Your sign-in worked');
      expect(notice.querySelector('p')?.textContent?.trim()).toBe(
        'This is Look Ahead DEV, our internal preview for invited members. The owner approves each person before DEV opens. Sign in again once you hear back.',
      );
    }
  });

  it('tells a waiting person that staff are asked for GitHub once admitted, with no form before sign-in', () => {
    const root: HTMLElement = render({ access: 'pending' }).nativeElement;
    expect(root.querySelector('aside.access-pending .github-hint')?.textContent).toBe(
      "If your work involves our code or release workflows, you'll be asked for your GitHub account once you're admitted.",
    );
    expect(root.querySelector('app-github-access-card, input')).toBeNull();
  });

  it('ignores any other access value', () => {
    const root: HTMLElement = render({ access: 'granted' }).nativeElement;
    expect(root.querySelector('.access-pending')).toBeNull();
  });
});

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

describe('WelcomePage GitHub card (DLV-969, owner 2026-11-05)', () => {
  const permissions = (manageAccess: boolean, previewDocuments: boolean) => ({ manageAccess, previewDocuments, deliveryRead: false,
    deliveryCreate: false, deliveryReview: false, deliveryDone: false, triageFeedback: false, fullCurriculum: false, feedbackRole: 'reviewer' });
  async function renderFor(options: { manageAccess?: boolean; previewDocuments?: boolean; github?: string | null; testActive?: boolean; signedIn?: boolean; profileFails?: boolean } = {}) {
    const account = signal<any>(options.signedIn === false ? null : { accountId: 'staff-1', username: 'staff', displayName: 'Staff', topicGrants: [],
      permissions: permissions(!!options.manageAccess, options.previewDocuments ?? true) });
    const loadProfile = vi.fn(async () => {
      if (options.profileFails) throw new Error('down');
      return { displayName: 'Staff', username: 'staff', links: { github: options.github ?? null, linkedin: null, x: null, website: null } };
    });
    const query = { setup: 'github', next: '/learn' };
    TestBed.configureTestingModule({
      imports: [WelcomePage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)), snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: StudyPlanAccount, useValue: { account, loadProfile, sessionExpired: signal(false), sessionKnown: signal(true), authOptions: signal(null),
          headerHint: signal(null), initialize: async () => undefined, enabled: true, loadThemePreference: async () => null } },
      ],
    });
    const tests = TestBed.inject(TestSessions);
    vi.spyOn(tests, 'refresh').mockImplementation(async () => tests.status.set({ active: !!options.testActive, canReturn: false, holderName: null }));
    const fixture = TestBed.createComponent(WelcomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return { root: fixture.nativeElement as HTMLElement, loadProfile, fixture };
  }

  it('shows staff without a GitHub account the card above the Essence, continuing to next', async () => {
    const { root, fixture } = await renderFor();
    const card = root.querySelector('app-github-access-card');
    expect(card?.querySelector('h2')?.textContent).toBe('Your GitHub account');
    expect(card?.nextElementSibling?.matches('section.home-essence')).toBe(true);
    const component = fixture.debugElement.query((node) => node.name === 'app-github-access-card').componentInstance;
    expect([component.accountId(), component.next()]).toEqual(['staff-1', '/learn']);
  });

  it('never shows it to the owner, a learner, a test session, someone with GitHub on file, after Not now, or signed out', async () => {
    for (const options of [{ manageAccess: true }, { previewDocuments: false }, { testActive: true }, { github: 'https://github.com/staff' }, { signedIn: false }]) {
      TestBed.resetTestingModule();
      const { root } = await renderFor(options);
      expect(root.querySelector('app-github-access-card')).toBeNull();
    }
    TestBed.resetTestingModule();
    dismissGithub('staff-1');
    const { root, loadProfile } = await renderFor();
    expect(root.querySelector('app-github-access-card')).toBeNull();
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it('shows no card when the profile cannot be read', async () => {
    const { root } = await renderFor({ profileFails: true });
    expect(root.querySelector('app-github-access-card')).toBeNull();
  });
});
