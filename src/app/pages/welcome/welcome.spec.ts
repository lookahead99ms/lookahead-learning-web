import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { PageSidebarContext } from '../../core/page-sidebars/page-sidebar-context';
import { WelcomePage } from './welcome';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

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
    // Two rows of three (owner, 2026-11-06): the steps of the way in, then what happens next with marks, no numbers.
    const steps = [...notice!.querySelectorAll('.pending-steps li')];
    expect(steps.map((step) => [...step.querySelectorAll('span')].map((part) => part.textContent?.trim()).join(' ').trim())).toEqual(['✓ Create your account', '✓ Confirm your email', 'Owner approval']);
    expect(steps.map((step) => step.className)).toEqual(['done', 'done', 'current']);
    expect(steps[2].getAttribute('aria-current')).toBe('step');
    const points = [...notice!.querySelectorAll('.pending-points li')];
    expect(points.map((point) => point.querySelector('strong')?.textContent)).toEqual([
      'The owner approves each person.',
      'Sign in again once you hear back.',
      'Code or release work? We ask for your GitHub account.',
    ]);
    expect(points.every((point) => point.querySelector('.point-mark svg') !== null)).toBe(true);
    expect(notice?.textContent).not.toMatch(/\b[123]\b/);
    expect(points[0].textContent).toContain('Nothing opens until then.');
    expect(points[0].textContent).not.toContain('DEV');
    expect(points[1].textContent).toContain('lands you in Look Ahead.');
    const main = root.querySelector('main#main-content.welcome-page');
    // Owner, 2026-11-06: with the notice the page is two panels (notice 30%, Essence 70%); the class drives the layout.
    expect(main?.classList.contains('two-panels')).toBe(true);
    expect([...(main?.children ?? [])].map((child) => child.tagName.toLowerCase())).toEqual(['aside', 'section', 'footer']);
    expect(main?.querySelector('section.brand-story.home-essence app-wordmark-key')).not.toBeNull();
    // The Essence starts on load here, not after a scroll as on the homepage (user, 2026-11-03).
    const story = fixture.debugElement.query((node) => node.name === 'section' && node.nativeElement.classList.contains('home-essence'));
    expect(story.componentInstance.autoplay()).toBe(true);
    expect(root.querySelector('.welcome-footer p')?.textContent?.trim()).toBe('Learn. Grow. Blaze.');
    expect(root.querySelectorAll('.welcome-footer .footer-statements > *')).toHaveLength(2);
  });

  it('greets by first name once the account is known, and names DEV in the points on DEV (owner, 2026-11-06)', () => {
    const fixture = render({ access: 'pending' });
    const root: HTMLElement = fixture.nativeElement;
    TestBed.inject(StudyPlanAccount).account.set({ accountId: 'a1', username: 'mohiddin', displayName: 'Mohiddin Shaik', topicGrants: [] });
    TestBed.inject(DevSession).gated.set(true);
    fixture.detectChanges();
    expect(root.querySelector('aside.access-pending h2')?.textContent?.trim()).toBe('Mohiddin, your sign-in worked');
    const points = [...root.querySelectorAll('.pending-points li')];
    expect(points[0].textContent).toContain('Look Ahead DEV is our internal preview for invited members.');
    expect(points[1].textContent).toContain('lands you in Look Ahead DEV.');
  });

  it('greets by the first name the Gateway left in its cookie, reads it once and clears it (DLV-971)', () => {
    document.cookie = 'lookahead-welcome=Zo%C3%AB; Path=/';
    const root: HTMLElement = render({ access: 'pending' }).nativeElement;
    expect(root.querySelector('aside.access-pending h2')?.textContent?.trim()).toBe('Zoë, your sign-in worked');
    expect(document.cookie).not.toContain('lookahead-welcome=');
    // Anything but a name is ignored.
    document.cookie = 'lookahead-welcome=%3Cb%3Ex; Path=/';
    TestBed.resetTestingModule();
    const other: HTMLElement = render({ access: 'pending' }).nativeElement;
    expect(other.querySelector('aside.access-pending h2')?.textContent?.trim()).toBe('Your sign-in worked');
    expect(document.cookie).not.toContain('lookahead-welcome=');
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
      const points = [...notice.querySelectorAll('.pending-points li')].map((point) => point.textContent?.replace(/\s+/g, ' ').trim());
      expect(points[0]).toBe('The owner approves each person. Look Ahead DEV is our internal preview for invited members. Nothing opens until then.');
      expect(points[1]).toBe('Sign in again once you hear back. Your account is ready; the next sign-in lands you in Look Ahead DEV.');
    }
  });

  it('tells a waiting person that staff are asked for GitHub once admitted, with no form before sign-in', () => {
    const root: HTMLElement = render({ access: 'pending' }).nativeElement;
    expect(root.querySelector('aside.access-pending .pending-points li:last-child')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Code or release work? We ask for your GitHub account. A short dialog asks once you are admitted. You can also add it later under Profiles and links in your account.',
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
