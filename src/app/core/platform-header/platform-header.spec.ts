import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { PlatformHeader, accountTriggerLabel } from './platform-header';
import { AUTHOR_PREVIEWS_BASE_URL } from '../author-preview-config';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { SearchDocument } from '../../content/content.models';
import { DevSession } from '../dev-session-notice/dev-session';
import { TestSessions } from '../test-session/test-sessions';

describe('PlatformHeader account disclosure', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformHeader],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AUTHOR_PREVIEWS_BASE_URL, useValue: '/bff/author/previews/' },
        {
          provide: ContentService,
          useValue: { getSearchIndex: () => of([]) },
        },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(StudyPlanAccount), 'initialize').mockResolvedValue();
    TestBed.inject(StudyPlanAccount).sessionKnown.set(true);
  });

  it('keeps statements out of the header: everything in the bar goes somewhere (user, 2026-10-17)', () => {
    const url = vi.spyOn(TestBed.inject(Router), 'url', 'get');
    for (const path of ['/', '/grow/spring-boot?tab=x', '/start-free', '/admin/access']) {
      url.mockReturnValue(path);
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const header = fixture.nativeElement.querySelector('.platform-header') as HTMLElement;
      expect(header.querySelector('app-reasoning-prompt, app-learning-prompt, .header-statement')).toBeNull();
      expect(header.classList.contains('with-statements')).toBe(false);
      expect(header.textContent).not.toContain('Understand the obstacle');
      expect(header.textContent).not.toContain('Know why it works');
      fixture.destroy();
    }
  });

  it('keeps the component wrapper sticky so it can follow the full page', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const style = getComputedStyle(fixture.nativeElement);
    expect(style.position).toBe('sticky');
    expect(style.top).toBe('0px');
    expect(style.display).toBe('block');
  });

  it('leaves Search, Study Plan and the theme switch to the page when asked (Manage account)', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.header-search-trigger')).not.toBeNull();
    expect(element.querySelector('.theme-switch')).not.toBeNull();
    fixture.componentRef.setInput('hideUtilities', true);
    fixture.detectChanges();
    expect(element.querySelector('.header-search-trigger')).toBeNull();
    expect(element.querySelector('a.navigation-utility[href^="/study-plan"]')).toBeNull();
    expect(element.querySelector('.theme-switch')).toBeNull();
    expect(element.querySelector('.platform-navigation')).not.toBeNull();
  });

  it('holds an invisible Sign in slot until the identity check answers, then shows the real state (DLV-969)', () => {
    const store = TestBed.inject(StudyPlanAccount);
    store.sessionKnown.set(false);
    // No hint from a previous visit (DLV-969 S37): with one, the header shows it instead of the invisible slot.
    store.headerHint.set(null);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const pending = fixture.nativeElement.querySelector('.sign-in-button.session-pending');
    expect(pending).not.toBeNull();
    expect(pending.tagName).toBe('SPAN');
    expect(pending.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('a.sign-in-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.avatar-trigger-btn')).toBeNull();
    store.sessionKnown.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-pending')).toBeNull();
    expect(fixture.nativeElement.querySelector('a.sign-in-button')).not.toBeNull();
  });

  it('shows what this browser last knew while the identity check runs, then the real state (DLV-969 S37)', () => {
    const store = TestBed.inject(StudyPlanAccount);
    store.sessionKnown.set(false);
    store.headerHint.set({ signedIn: true, displayName: 'Mohiddin Shaik', gateway: true });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const remembered = root.querySelector('.session-remembered')!;
    expect(remembered.querySelector('.account-trigger-name')?.textContent).toBe('Mohiddin');
    expect(remembered.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('a.sign-in-button')).toBeNull();
    // The check answers: the real account control replaces the remembered name.
    store.account.set({ accountId: 'a', username: 'google_1', displayName: 'Mohiddin Shaik', topicGrants: [] });
    store.sessionKnown.set(true);
    fixture.detectChanges();
    expect(root.querySelector('.session-remembered')).toBeNull();
    expect(root.querySelector('button.avatar-trigger-btn .account-trigger-name')?.textContent).toBe('Mohiddin');
  });

  it('shows Sign in at once when this browser last saw a signed-out visitor, and corrects it if they are signed in', () => {
    const store = TestBed.inject(StudyPlanAccount);
    store.sessionKnown.set(false);
    store.headerHint.set({ signedIn: false, gateway: true });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a.sign-in-button')?.getAttribute('href')).toContain('/sign-in');
    expect(root.querySelector('.session-pending')).toBeNull();
    store.account.set({ accountId: 'a', username: 'learner', displayName: 'Priya Raman', topicGrants: [] });
    store.sessionKnown.set(true);
    fixture.detectChanges();
    expect(root.querySelector('a.sign-in-button')).toBeNull();
    expect(root.querySelector('button.avatar-trigger-btn')).not.toBeNull();
  });

  it('shows only Sign in when signed out or expired and only the account control when authenticated', () => {
    const store = TestBed.inject(StudyPlanAccount);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.avatar-trigger-btn')).toBeNull();
    // DLV-209: plans are not in the header (user, 2026-10-15).
    expect(fixture.nativeElement.querySelector('a[href="/pricing"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sign-in-button').textContent.trim()).toBe(
      'Sign in',
    );
    expect(fixture.nativeElement.querySelector('.sign-in-button').getAttribute('href')).toContain(
      '/sign-in',
    );
    store.account.set({
      accountId: 'test',
      username: 'test@example.test',
      displayName: 'Test Learner',
      topicGrants: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sign-in-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.avatar-trigger-btn')).not.toBeNull();
    store.sessionExpired.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.avatar-trigger-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sign-in-button')).not.toBeNull();
  });

  it('does not repeat Sign in on authentication pages, including while restoring a session', () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/sign-in?returnTo=%2Fauthor');
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sign-in-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.avatar-trigger-btn')).toBeNull();
    TestBed.inject(StudyPlanAccount).account.set({
      accountId: 'test',
      username: 'test@example.test',
      displayName: 'Test Learner',
      topicGrants: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sign-in-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.avatar-trigger-btn')).not.toBeNull();
  });

  it.each([
    '/sign-in/choose',
    '/sign-up',
    '/sign-up/confirm',
    '/sign-up/confirm?returnTo=%2Flearn',
    '/sign-in/forgot',
    '/sign-in/reset',
    '/sign-in/new-password',
    '/sign-in/code',
    '/welcome',
    '/welcome?access=pending',
  ])(
    'does not repeat authentication actions in the header on %s',
    (url) => {
      vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(url);
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.sign-in-button')).toBeNull();
    },
  );

  it('preserves a protected return path when the header Sign in link appears elsewhere', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/account?returnTo=%2Fauthor');
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sign-in-button').getAttribute('href')).toBe(
      '/sign-in?returnTo=%2Fauthor',
    );
  });

  it('exposes the account panel as a labelled disclosure', () => {
    TestBed.inject(StudyPlanAccount).account.set({
      accountId: 'test',
      username: 'test@example.test',
      displayName: 'Test Learner',
      topicGrants: [],
    });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.avatar-trigger-btn') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toBe('Test account menu');
    expect(trigger.getAttribute('aria-controls')).toBe('account-menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);

    trigger.click();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('#account-menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="menuitem"]')).toBeNull();
  });

  /**
   * DLV-969 (owner, 2026-11-04): anyone signed in to DEV switches to a test account from this menu, and comes back
   * from it. Owner decision 2026-11-04: the owner, co-authors and admins switch; learners, reviewers and testers never do.
   */
  it('offers Switch to a test account to the owner, co-authors and admins inside DEV, never to learners, reviewers or testers', () => {
    const sessions = TestBed.inject(TestSessions);
    const refresh = vi.spyOn(sessions, 'refresh').mockResolvedValue();
    const open = vi.spyOn(sessions, 'open').mockResolvedValue();
    const back = vi.spyOn(sessions, 'back').mockResolvedValue();
    const store = TestBed.inject(StudyPlanAccount);
    const dev = TestBed.inject(DevSession);
    store.account.set({ accountId: 'learner', username: 'learner@example.test', displayName: 'Priya Raman', topicGrants: [] });
    const fixture = TestBed.createComponent(PlatformHeader);
    const root = fixture.nativeElement as HTMLElement;
    const menu = () => {
      (root.querySelector('.avatar-trigger-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      return root.querySelector('#account-menu') as HTMLElement;
    };
    fixture.detectChanges();
    // Outside DEV: nothing to switch to, and nobody asks the Gateway.
    expect(menu().textContent).not.toContain('test account');
    expect(root.querySelector('.test-switch')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    // A learner inside DEV never gets it; neither does a reviewer or a tester.
    dev.status.set({ dev: true, deadline: '', warning: false, maintenance: false });
    fixture.detectChanges();
    expect(root.querySelector('#account-menu .test-switch')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    store.account.set({ accountId: 'reviewer', username: 'r@example.test', displayName: 'R', topicGrants: [], permissions: { feedbackRole: 'reviewer', previewDocuments: true } } as never);
    fixture.detectChanges();
    expect(root.querySelector('#account-menu .test-switch')).toBeNull();
    store.account.set({ accountId: 'tester', username: 't@example.test', displayName: 'T', topicGrants: [], permissions: { feedbackRole: 'tester', fullCurriculum: true } } as never);
    fixture.detectChanges();
    expect(root.querySelector('#account-menu .test-switch')).toBeNull();
    refresh.mockClear();
    refresh.mockResolvedValue();
    // The owner inside DEV.
    store.account.set({ accountId: 'owner', username: 'author@example.test', displayName: 'Author', topicGrants: [], authorPreview: true });
    fixture.detectChanges();
    expect(refresh).toHaveBeenCalledTimes(1);
    const item = root.querySelector('.test-switch') as HTMLButtonElement;
    expect(item.textContent).toContain('Switch to a test account');
    expect(root.querySelector('.account-sign-out')?.textContent).toContain('Sign out');
    item.click();
    fixture.detectChanges();
    expect(open).toHaveBeenCalled();
    expect(root.querySelector('#account-menu')).toBeNull();
    // A co-author or admin sees it too.
    store.account.set({ accountId: 'admin', username: 'admin@example.test', displayName: 'Admin One', topicGrants: [], permissions: { feedbackRole: 'admin' } } as never);
    fixture.detectChanges();
    expect(menu().querySelector('.test-switch')).not.toBeNull();
    // Using a test account: who you are, Switch test account, and Back to my account in place of Sign out.
    sessions.status.set({ active: true, canReturn: true, holderName: 'Author' });
    store.account.set({ accountId: 'id-learner05', username: 'learner05@lookahead.dev', displayName: 'Learner05', topicGrants: [] });
    fixture.detectChanges();
    const using = root.querySelector('#account-menu') as HTMLElement;
    expect(using.querySelector('.user-display-email')?.textContent?.trim()).toBe('Test account · you are Author');
    expect(using.querySelector('.test-switch')?.textContent).toContain('Switch test account');
    expect(using.textContent).not.toContain('Sign out');
    (using.querySelector('.account-back') as HTMLButtonElement).click();
    expect(back).toHaveBeenCalled();
    sessions.returning.set(true);
    fixture.detectChanges();
    expect(using.querySelector('.account-back')?.textContent).toContain('Going back…');
    sessions.status.set({ active: true, canReturn: false, holderName: null });
    fixture.detectChanges();
    expect(using.querySelector('.user-display-email')?.textContent?.trim()).toBe('Test account');
    expect(dev.status()).not.toBeNull();
  });

  it('hides Switch to a test account when signed out in DEV and once DEV status goes away (DLV-969)', () => {
    vi.spyOn(TestBed.inject(TestSessions), 'refresh').mockResolvedValue();
    const store = TestBed.inject(StudyPlanAccount);
    const dev = TestBed.inject(DevSession);
    dev.status.set({ dev: true, deadline: '', warning: false, maintenance: false });
    store.account.set(null);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // Signed out: no account menu to hold it, and no switcher either.
    expect(root.querySelector('.test-switch')).toBeNull();
    expect(root.querySelector('app-test-account-switcher')).toBeNull();
    expect(root.textContent).not.toContain('Switch to a test account');
    // An admin signed in to DEV has it (a learner never does); when DEV status goes away it goes too.
    store.account.set({ accountId: 'admin', username: 'admin@example.test', displayName: 'Admin One', topicGrants: [], permissions: { feedbackRole: 'admin' } } as never);
    fixture.detectChanges();
    (root.querySelector('.avatar-trigger-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('#account-menu .test-switch')).not.toBeNull();
    dev.status.set(null);
    fixture.detectChanges();
    expect(root.querySelector('.test-switch')).toBeNull();
  });

  it('routes both Study Plan entry points to the saved-plan chooser', () => {
    const { fixture } = signedInHeader();
    const element = fixture.nativeElement as HTMLElement;
    const links = [...element.querySelectorAll<HTMLAnchorElement>('a[href^="/study-plan"]')];
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/study-plan?view=plans',
      '/study-plan?view=plans',
    ]);
  });

  function signedInHeader() {
    const store = TestBed.inject(StudyPlanAccount);
    store.account.set({
      accountId: 'test',
      username: 'test@example.test',
      displayName: 'Test Learner',
      topicGrants: [],
    });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.avatar-trigger-btn') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Test');
    trigger.click();
    fixture.detectChanges();
    return {
      store,
      fixture,
      button: fixture.nativeElement.querySelector('.account-sign-out') as HTMLButtonElement,
    };
  }

  it('offers Sign out directly in Account and preserves the current return path', async () => {
    const { store, fixture, button } = signedInHeader();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/learn/example/problem?mode=surprise');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const logout = vi.spyOn(store, 'logout').mockImplementation(async () => {
      store.account.set(null);
      return true;
    });
    expect(button.textContent?.trim()).toBe('Sign out');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/sign-in'], {
      queryParams: { returnTo: '/learn/example/problem?mode=surprise' },
    });
    expect(fixture.nativeElement.querySelector('#account-menu')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sign-in-button')).not.toBeNull();
  });

  it('leaves the account panel available with an actionable error when logout fails', async () => {
    const { store, fixture, button } = signedInHeader();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    vi.spyOn(store, 'logout').mockImplementation(async () => {
      store.error.set('Connection lost. Please try again.');
      return false;
    });
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#account-menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Connection lost',
    );
    expect(button.disabled).toBe(false);
  });

  it('prevents duplicate logout requests and disables the action during account work', async () => {
    const { store, fixture, button } = signedInHeader();
    let finish!: (value: boolean) => void;
    const logout = vi.spyOn(store, 'logout').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    store.busy.set(true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    button.click();
    expect(logout).not.toHaveBeenCalled();
    store.busy.set(false);
    fixture.detectChanges();
    button.click();
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('Signing out');
    expect(logout).toHaveBeenCalledOnce();
    finish(false);
    await fixture.whenStable();
  });

  it('lets the existing OAuth logout own its revocation redirect', async () => {
    const { store, fixture, button } = signedInHeader();
    store.authOptions.set({ registration: false, google: false, oauth: true });
    store.logoutRedirectPending.set(true);
    vi.spyOn(store, 'logout').mockResolvedValue(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#account-menu')).toBeNull();
  });

  it('returns to sign in when OAuth logout succeeds without a further redirect', async () => {
    const { store, fixture, button } = signedInHeader();
    store.authOptions.set({ registration: false, google: false, oauth: true });
    vi.spyOn(store, 'logout').mockResolvedValue(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/sign-in'], { queryParams: { returnTo: '/' } });
  });

  it('shows Author previews only for the server-provided capability', () => {
    const accounts = TestBed.inject(StudyPlanAccount);
    accounts.account.set({
      accountId: 'test',
      username: 'author@lookahead.test',
      displayName: 'Author',
      topicGrants: [],
    });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.avatar-trigger-btn').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.author-account-links')).toBeNull();
    expect(fixture.nativeElement.querySelector('#account-menu a[href="/admin/previews"]')).toBeNull();
    accounts.account.update((account) => ({ ...account!, authorPreview: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.author-account-links')?.textContent).toContain(
      'Previews',
    );
    expect(
      fixture.nativeElement.querySelector('#account-menu a[href="/admin/previews"]'),
    ).not.toBeNull();
  });

  it('uses the display name without granting author access and keeps learner actions ordered', () => {
    const { store, fixture } = signedInHeader();
    store.account.update((account) => ({
      ...account!,
      displayName: 'Author',
      authorPreview: false,
    }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-trigger-name').textContent).toBe('Author');
    expect(fixture.nativeElement.querySelector('.author-account-links')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/delivery-plan"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/admin/api"]')).toBeNull();
    const actions = [
      ...fixture.nativeElement.querySelector('[aria-label="Account links"]').children,
    ].map((item: any) => item.querySelector('.item-label').textContent.trim());
    expect(actions).toEqual(['View study plan', 'Manage account', 'Support and feedback']);
    expect(
      fixture.nativeElement
        .querySelector('#account-menu')
        .lastElementChild.classList.contains('account-session-actions'),
    ).toBe(true);
    store.account.update((account) => ({ ...account!, displayName: '   ' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-trigger-name').textContent).toBe(
      'Account',
    );
    expect(
      fixture.nativeElement.querySelector('.avatar-trigger-btn').getAttribute('aria-label'),
    ).toBe('Account menu');
  });

  it('places capability-gated author tools after learner actions and before Sign out', () => {
    const { store, fixture } = signedInHeader();
    store.account.update((account) => ({ ...account!, authorPreview: true }));
    fixture.detectChanges();
    const menu = fixture.nativeElement.querySelector('#account-menu') as HTMLElement;
    const sectionLabel = menu.querySelector('a[href="/admin/previews"]')!;
    expect(sectionLabel.querySelector('.item-label')?.textContent?.trim()).toBe('Previews');
    expect(sectionLabel.tagName).toBe('A');
    expect(menu.querySelector('.author-account-links')?.getAttribute('aria-label')).toBe(
      'Admin tools',
    );
    expect(menu.querySelector('.author-links-label')?.textContent?.trim()).toBe('Admin');
    expect(menu.textContent!.indexOf('Support and feedback')).toBeLessThan(
      menu.textContent!.indexOf('Previews'),
    );
    const authorLinks = menu.querySelector('.author-account-links')!;
    expect(
      [...authorLinks.querySelectorAll(':scope > a')].map((item) => [
        item.querySelector('.item-label')?.textContent?.trim(),
        item.getAttribute('href'),
      ]),
    ).toEqual([
      ['Documentation', '/admin/docs'],
      ['Previews', '/admin/previews'],
      ['Delivery Plan', '/delivery-plan'],
      ['People and access', '/admin/access'],
    ]);
    // DLV-926: the documentation pages are listed on /admin/docs, not inside the dropdown.
    expect(menu.querySelector('#account-documentation-links')).toBeNull();
    expect(menu.querySelector('a[href="/author"]')).toBeNull();
    expect(menu.textContent).not.toContain('Mock interviews');
    expect(menu.textContent).not.toContain('Previews/unpublished work');
    expect(menu.querySelectorAll('a[href*="localhost"], a[href*="127.0.0.1"]')).toHaveLength(0);
  });

  it('marks Documentation current on any documentation page', async () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/admin/operations');
    const store = TestBed.inject(StudyPlanAccount);
    store.account.set({
      accountId: 'test',
      username: 'author@example.test',
      displayName: 'Author',
      authorPreview: true,
      topicGrants: [],
    });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const accountTrigger = fixture.nativeElement.querySelector(
      '.avatar-trigger-btn',
    ) as HTMLButtonElement;
    accountTrigger.click();
    fixture.detectChanges();
    const current = fixture.nativeElement.querySelector(
      '.author-account-links a[aria-current="page"]',
    ) as HTMLAnchorElement;
    expect(current.getAttribute('href')).toBe('/admin/docs');
    expect(fixture.nativeElement.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    current.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(fixture.nativeElement.querySelector('#account-menu')).toBeNull();
    expect(document.activeElement).toBe(accountTrigger);
  });

  it('marks People and access current only on its own page', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/admin/access');
    TestBed.inject(StudyPlanAccount).account.set({
      accountId: 'test',
      username: 'author@example.test',
      displayName: 'Author',
      authorPreview: true,
      topicGrants: [],
    });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.avatar-trigger-btn').click();
    fixture.detectChanges();
    const current = [
      ...fixture.nativeElement.querySelectorAll('.author-account-links a[aria-current="page"]'),
    ].map((link: HTMLAnchorElement) => link.getAttribute('href'));
    expect(current).toEqual(['/admin/access']);
  });

  it('returns focus to the account trigger when Escape closes the panel', async () => {
    TestBed.inject(StudyPlanAccount).account.set({
      accountId: 'test',
      username: 'test@example.test',
      displayName: 'Test Learner',
      topicGrants: [],
    });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.avatar-trigger-btn') as HTMLButtonElement;

    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.dropdown-item-link') as HTMLAnchorElement).focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores a synthetic keydown without a key value', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const event = new Event('keydown', { bubbles: true, cancelable: true });
    expect(() =>
      fixture.componentInstance['toggleSearchPalette'](event as KeyboardEvent),
    ).not.toThrow();
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(false);
    expect(fixture.nativeElement.querySelector('.search-palette')).toBeNull();
  });

  it('provides five direct native topic links instead of redundant Search entries', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
    fixture.detectChanges();

    const links = [
      ...fixture.nativeElement.querySelectorAll('app-topic-shortcuts a'),
    ] as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/learn/hands-on-dsa',
      '/blaze/system-design',
      '/grow/ai-assisted-development',
      '/learn/core-java',
      '/blaze/behavioral-carl',
    ]);
    expect(fixture.nativeElement.querySelectorAll('.search-submit').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('View all search results');
    expect(fixture.nativeElement.textContent).not.toContain('Interview practice');
  });
  it('opens one quick search entry without navigating and restores focus on Escape', async () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const trigger = fixture.nativeElement.querySelector(
      '.header-search-trigger',
    ) as HTMLButtonElement;
    expect(fixture.nativeElement.querySelectorAll('.header-search-trigger').length).toBe(1);
    expect(
      [...fixture.nativeElement.querySelectorAll('.platform-navigation a')].map((a: Element) =>
        a.textContent?.trim(),
      ),
    ).toEqual(['Learn', 'Grow', 'Blaze']);
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('.header-search-input'),
    );
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
  it('focuses the palette input without scrolling the page (DLV-969, ⌘K from the Study Plan review step)', async () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    fixture.detectChanges();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const input = fixture.nativeElement.querySelector('.header-search-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    const call = focus.mock.calls.find((_, index) => focus.mock.instances[index] === input);
    expect(call?.[0]).toEqual({ preventScroll: true });
    focus.mockRestore();
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])(
    'uses the same quick search for shortcut %s',
    (modifier) => {
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...modifier }),
      );
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...modifier }),
      );
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    },
  );

  it.each(['input', 'textarea', 'select', 'editable'])(
    'leaves shortcut use in %s fields alone',
    (tag) => {
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const field = document.createElement(tag === 'editable' ? 'div' : tag);
      if (tag === 'editable') field.setAttribute('contenteditable', 'true');
      fixture.nativeElement.append(field);
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(event);
      fixture.detectChanges();
      expect(event.defaultPrevented).toBe(false);
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    },
  );

  it('keeps keyboard focus inside quick search after removing the redundant footer link', async () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'spring transactions';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.search-palette a');
    const link = links[links.length - 1] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/blaze/behavioral-carl');
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(link);
    link.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(input);
  });
  it('submits the quick-search query to the canonical Search page', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '  transactions  ';
    input.dispatchEvent(new Event('input'));
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/search'], {
      queryParams: { q: 'transactions' },
    });
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('builds Topic links from curated subjects instead of broad document tags', async () => {
    const urlShortener: SearchDocument = {
      id: 'learn:solid-design-patterns:lld-url-shortener',
      contentId: 'lld-url-shortener',
      path: 'learn',
      courseId: 'solid-design-patterns',
      courseTitle: 'Object-Oriented Design and SOLID',
      moduleId: 'lld-practice',
      moduleTitle: 'Low-Level Design Practice',
      title: 'Design a URL Shortener at the LLD Level',
      contentType: 'q-and-a',
      discoveryKind: 'practice',
      practiceFormat: 'explain',
      subjects: ['Reusable Platform Components LLD'],
      tags: ['Low-Level Design', 'URL Shortener', 'Repository'],
      filterTags: ['Learn', 'Q&A'],
      languages: ['java'],
      difficulty: 'Intermediate',
      preview: '',
      access: { tier: 'free' },
      searchableText: 'design a url shortener at the lld level url shortener repository',
      route: ['/', 'learn', 'solid-design-patterns', 'lld-url-shortener'],
    };
    vi.spyOn(TestBed.inject(ContentService), 'getSearchIndex').mockReturnValue(of([urlShortener]));
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.header-search-input') as HTMLInputElement;
    input.value = 'URL Shortener';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const suggestions = [
      ...(fixture.nativeElement.querySelectorAll(
        '.header-search-suggestion',
      ) as NodeListOf<HTMLAnchorElement>),
    ].map((link) => ({
      type: link.querySelector('.suggestion-type')?.textContent?.trim(),
      label: link.querySelector('.suggestion-label')?.textContent?.trim(),
      href: link.getAttribute('href'),
    }));
    expect(suggestions).toContainEqual({
      type: 'Topic',
      label: 'Reusable Platform Components LLD',
      href: '/search?tags=Reusable%20Platform%20Components%20LLD',
    });
    expect(suggestions).not.toContainEqual(
      expect.objectContaining({ type: 'Topic', label: 'URL Shortener' }),
    );
    expect(suggestions).toContainEqual(
      expect.objectContaining({
        label: 'Design a URL Shortener at the LLD Level',
        href: '/learn/solid-design-patterns/lld-url-shortener',
      }),
    );
  });

  describe('quick search matching (DLV-962 search audit)', () => {
    function doc(id: string, title: string, extra: Partial<SearchDocument> = {}): SearchDocument {
      return {
        id,
        contentId: id,
        path: 'learn',
        courseId: `course-${id}`,
        courseTitle: `Course ${id}`,
        moduleId: 'module',
        moduleTitle: 'Module',
        title,
        contentType: 'q-and-a',
        discoveryKind: 'practice',
        practiceFormat: 'explain',
        subjects: [],
        tags: [],
        filterTags: [],
        languages: [],
        preview: '',
        access: { tier: 'free' },
        searchableText: title.toLowerCase(),
        route: ['/', 'learn', `course-${id}`, id],
        ...extra,
      };
    }

    async function quickSearch(documents: SearchDocument[], query: string) {
      vi.spyOn(TestBed.inject(ContentService), 'getSearchIndex').mockReturnValue(of(documents));
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement).click();
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('.header-search-input') as HTMLInputElement;
      input.value = query;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();
      const rows = () =>
        [
          ...fixture.nativeElement.querySelectorAll('.dynamic-suggestions .header-search-suggestion'),
        ] as HTMLElement[];
      const labels = () =>
        rows().map((row) => row.querySelector('.suggestion-label')?.textContent?.trim());
      return { fixture, input, rows, labels };
    }

    const graphIndex = [
      doc('bridges', 'Bridges in a network', {
        subjects: ['Networks'],
        searchableText: 'bridges in a network graphs',
      }),
      doc('cycles', 'Directed graph cycles'),
      doc('graphs', 'Graphs', { discoveryKind: 'topic', contentType: 'guide' }),
    ];

    it('keeps retired courses out of quick search, as on the Search page', async () => {
      const { labels } = await quickSearch(
        [
          doc('retired', 'Retired design lesson', { path: 'blaze', courseId: 'system-design' }),
          doc('visible', 'Visible design lesson'),
        ],
        'design lesson',
      );
      expect(labels()).toContain('Visible design lesson');
      expect(labels()).not.toContain('Retired design lesson');
    });

    it('lists the exact title first and an unrelated subject of a match last', async () => {
      const { labels } = await quickSearch(graphIndex, 'graphs');
      expect(labels()[0]).toBe('Graphs');
      expect(labels()).toContain('Directed graph cycles');
      expect(labels()[labels().length - 1]).toBe('Networks');
    });

    it('moves between the search box and the suggestion rows with the arrow keys', async () => {
      const { fixture, input, rows } = await quickSearch(graphIndex, 'graphs');
      const press = (key: string, target: HTMLElement, init: KeyboardEventInit = {}) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
        return event;
      };
      input.focus();
      expect(press('ArrowDown', input).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(rows()[0]);
      press('ArrowDown', rows()[0]);
      expect(document.activeElement).toBe(rows()[1]);
      const last = rows()[rows().length - 1];
      last.focus();
      press('ArrowDown', last);
      expect(document.activeElement).toBe(last);
      rows()[1].focus();
      press('ArrowUp', rows()[1]);
      expect(document.activeElement).toBe(rows()[0]);
      press('ArrowUp', rows()[0]);
      expect(document.activeElement).toBe(input);
      press('ArrowUp', input);
      expect(document.activeElement).toBe(input);
      expect(press('ArrowDown', input, { altKey: true }).defaultPrevented).toBe(false);
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      expect(press('ArrowDown', outside).defaultPrevented).toBe(false);
      outside.remove();
      fixture.destroy();
    });

    it('names the closest spelling when the typed words find nothing', async () => {
      const { fixture, labels } = await quickSearch(graphIndex, 'grpahs');
      expect(
        fixture.nativeElement.querySelector('.header-search-correction')?.textContent?.trim(),
      ).toBe('Showing matches for “graphs”');
      expect(labels()[0]).toBe('Graphs');
    });

    it('leaves arrow keys alone when nothing is suggested and retries a failed index load', async () => {
      const getSearchIndex = vi
        .spyOn(TestBed.inject(ContentService), 'getSearchIndex')
        .mockReturnValueOnce(throwError(() => new Error('offline')))
        .mockReturnValue(of([]));
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const trigger = fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement;
      trigger.click();
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('.header-search-input') as HTMLInputElement;
      input.value = 'zzqq';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      input.focus();
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(fixture.nativeElement.querySelector('.header-search-empty')?.textContent).toContain(
        'Press Enter to search all content.',
      );
      expect(getSearchIndex).toHaveBeenCalledTimes(2);
    });
  });
});

describe('PlatformHeader sticky context sizing', () => {
  it('updates breadcrumb offset after responsive header resizing and disconnects on teardown', async () => {
    let resize: () => void = () => {};
    let height = 76;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ height }) as DOMRect);
    try {
      await TestBed.configureTestingModule({
        imports: [PlatformHeader],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
        ],
      }).compileComponents();
      vi.spyOn(TestBed.inject(StudyPlanAccount), 'initialize').mockResolvedValue();
      TestBed.inject(StudyPlanAccount).sessionKnown.set(true);
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const page = fixture.nativeElement.parentElement as HTMLElement;
      expect(page.style.getPropertyValue('--platform-header-height')).toBe('76px');
      height = 140;
      resize();
      expect(page.style.getPropertyValue('--platform-header-height')).toBe('140px');
      fixture.destroy();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      measure.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('gives sticky bars a zero offset while a short window lets the header scroll away (DLV-803)', async () => {
    const listeners = new Set<() => void>();
    const shortWindow = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    // Other services may watch other queries; only the short-window query gets these listeners.
    const otherQuery = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
    const matchMedia = vi.fn((query: string) =>
      (query === '(max-height: 32.5rem)' ? shortWindow : otherQuery) as unknown as MediaQueryList,
    );
    vi.stubGlobal('matchMedia', matchMedia);
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ height: 140 }) as DOMRect);
    try {
      await TestBed.configureTestingModule({
        imports: [PlatformHeader],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
        ],
      }).compileComponents();
      vi.spyOn(TestBed.inject(StudyPlanAccount), 'initialize').mockResolvedValue();
      TestBed.inject(StudyPlanAccount).sessionKnown.set(true);
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const page = fixture.nativeElement.parentElement as HTMLElement;
      const host = fixture.nativeElement as HTMLElement;
      expect(matchMedia).toHaveBeenCalledWith('(max-height: 32.5rem)');
      expect(page.style.getPropertyValue('--platform-header-height')).toBe('140px');
      // The short-window media rule makes the host relative; the offset follows it.
      host.style.position = 'relative';
      listeners.forEach((fn) => fn());
      expect(page.style.getPropertyValue('--platform-header-height')).toBe('0px');
      host.style.position = '';
      listeners.forEach((fn) => fn());
      expect(page.style.getPropertyValue('--platform-header-height')).toBe('140px');
      fixture.destroy();
      expect(listeners.size).toBe(0);
    } finally {
      measure.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('lets the header scroll with the page in a short window and lines its row up with the site frame', () => {
    const styles = (PlatformHeader as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('\n').replace(/\s+/g, ' ');
    expect(styles).toMatch(/@media \(max-height: 32\.5rem\) \{ \[_nghost-%COMP%\] \{ position: relative; \} \}/);
    expect(styles).toContain('padding: 12px max(4%, (100% - var(--%NS%site-frame-max, 100rem)) / 2);');
    // At 400% zoom (a 180px-tall window) the search palette still leaves room for suggestions.
    expect(styles).toContain('top: min(88px, 12dvh);');
    expect(styles).toContain('max-height: calc(100dvh - min(88px, 12dvh) - 66px);');
  });
});

it.each([
  ['Author', 'Author'],
  ['Ada Lovelace', 'Ada'],
  ['  Ada   Lovelace  ', 'Ada'],
  ['Learner 01', 'Learner 01'],
  ['Synthetic Learner 01', 'Learner 01'],
  ['  Learner   01 ', 'Learner 01'],
  ['  ', 'Account'],
  [null, 'Account'],
  [undefined, 'Account'],
  ['person@example.test', 'Account'],
])('formats account trigger %s as %s without exposing an email', (name, expected) => {
  expect(accountTriggerLabel(name)).toBe(expected);
});

describe('PlatformHeader utility hints (DLV-968)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformHeader],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AUTHOR_PREVIEWS_BASE_URL, useValue: '/bff/author/previews/' },
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(StudyPlanAccount), 'initialize').mockResolvedValue();
    TestBed.inject(StudyPlanAccount).sessionKnown.set(true);
  });

  /** The element `aria-describedby` points at, which must be the hint rendered next to the item. */
  function hintFor(element: HTMLElement, item: Element | null): HTMLElement {
    expect(item).not.toBeNull();
    const id = (item as HTMLElement).getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    const hint = element.querySelector(`#${id}`) as HTMLElement | null;
    expect(hint).not.toBeNull();
    expect(hint!.classList.contains('header-hint')).toBe(true);
    expect(hint!.getAttribute('role')).toBe('tooltip');
    expect(item!.nextElementSibling).toBe(hint);
    expect(item!.hasAttribute('title')).toBe(false);
    return hint!;
  }

  it('describes Search, Study Plan and both theme buttons with a hidden hint next to each item', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const [light, dark] = Array.from(element.querySelectorAll('.theme-switch button'));
    expect(hintFor(element, element.querySelector('.header-search-trigger')).textContent).toContain(
      'Search lessons, problems and plans.',
    );
    expect(
      hintFor(element, element.querySelector('a.navigation-utility[href^="/study-plan"]')).textContent,
    ).toBe('Your schedule and progress across courses.');
    expect(hintFor(element, light).textContent).toBe('Light colors.');
    expect(hintFor(element, dark).textContent).toBe('Dark colors.');
    for (const hint of Array.from(element.querySelectorAll('.header-hint'))) {
      expect(hint.classList.contains('is-visible')).toBe(false);
    }
    expect(element.querySelectorAll('.header-hint').length).toBe(5);
  });

  it('names the keyboard shortcut shown in the Search button inside its hint', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const trigger = element.querySelector('.header-search-trigger') as HTMLButtonElement;
    const shortcut = trigger.querySelector('kbd')!.textContent!.trim();
    expect(['⌘K', 'Ctrl K']).toContain(shortcut);
    expect(hintFor(element, trigger).textContent).toBe(
      `Search lessons, problems and plans. Shortcut: ${shortcut}.`,
    );
  });

  it('describes Sign in when signed out and the account trigger when signed in', () => {
    const store = TestBed.inject(StudyPlanAccount);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(hintFor(element, element.querySelector('.sign-in-button')).textContent).toBe(
      'Sign in to save progress and plans to your account.',
    );
    store.account.set({
      accountId: 'test',
      username: 'test@example.test',
      displayName: 'Test Learner',
      topicGrants: [],
    });
    fixture.detectChanges();
    expect(element.querySelector('.sign-in-button')).toBeNull();
    const trigger = element.querySelector('.avatar-trigger-btn') as HTMLButtonElement;
    expect(hintFor(element, trigger).textContent).toBe(
      'Your account: study plan, settings, support and sign out.',
    );
    expect(trigger.getAttribute('aria-label')).toBe('Test account menu');
    expect(element.querySelectorAll('.header-hint').length).toBe(5);
  });

  it('shows the hint on hover and keyboard focus, and hides it on leave, click and Escape', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const link = element.querySelector('a.navigation-utility[href^="/study-plan"]') as HTMLAnchorElement;
    const hint = hintFor(element, link);
    vi.spyOn(link, 'matches').mockImplementation((selector) => selector === ':focus-visible');

    link.dispatchEvent(new Event('mouseenter'));
    expect(hint.classList.contains('is-visible')).toBe(true);
    link.dispatchEvent(new Event('mouseleave'));
    expect(hint.classList.contains('is-visible')).toBe(false);

    link.dispatchEvent(new Event('focusin'));
    expect(hint.classList.contains('is-visible')).toBe(true);
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(hint.classList.contains('is-visible')).toBe(false);
    link.dispatchEvent(new Event('focusout'));

    link.dispatchEvent(new Event('mouseenter'));
    expect(hint.classList.contains('is-visible')).toBe(true);
    link.dispatchEvent(new Event('click'));
    expect(hint.classList.contains('is-visible')).toBe(false);
    // Still hovered after the click: the hint stays down until the pointer leaves and returns.
    link.dispatchEvent(new Event('focusin'));
    expect(hint.classList.contains('is-visible')).toBe(false);
    link.dispatchEvent(new Event('focusout'));
    link.dispatchEvent(new Event('mouseleave'));
    link.dispatchEvent(new Event('mouseenter'));
    expect(hint.classList.contains('is-visible')).toBe(true);
    link.dispatchEvent(new Event('mouseleave'));
  });

  it('opens nothing for a focus that is not focus-visible (a mouse click on the item)', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const [light] = Array.from(element.querySelectorAll('.theme-switch button')) as HTMLButtonElement[];
    const hint = hintFor(element, light);
    vi.spyOn(light, 'matches').mockReturnValue(false);
    light.dispatchEvent(new Event('focusin'));
    expect(hint.classList.contains('is-visible')).toBe(false);
  });

  it('does not hover-open on a touch-only device and keeps taps unblocked', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: false, media: query }) as MediaQueryList);
    Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
    try {
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const trigger = element.querySelector('.header-search-trigger') as HTMLButtonElement;
      const hint = hintFor(element, trigger);
      trigger.dispatchEvent(new Event('mouseenter'));
      expect(matchMedia).toHaveBeenCalledWith('(hover: hover)');
      expect(hint.classList.contains('is-visible')).toBe(false);
      expect(getComputedStyle(hint).pointerEvents).toBe('none');
    } finally {
      // jsdom has no matchMedia of its own; remove the stub so other specs see the real state.
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('places the hint under the item and pulls it back inside the viewport near the right edge', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const link = element.querySelector('a.navigation-utility[href^="/study-plan"]') as HTMLAnchorElement;
    const hint = hintFor(element, link);
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
    vi.spyOn(link, 'getBoundingClientRect').mockReturnValue(rect(100, 10, 80, 44));
    vi.spyOn(hint, 'getBoundingClientRect').mockReturnValue(rect(20, 30, 200, 40));
    const clientWidth = vi.spyOn(document.documentElement, 'clientWidth', 'get');

    clientWidth.mockReturnValue(1200);
    link.dispatchEvent(new Event('mouseenter'));
    expect(hint.style.left).toBe('80px');
    expect(hint.style.top).toBe('30px');
    link.dispatchEvent(new Event('mouseleave'));

    clientWidth.mockReturnValue(240);
    link.dispatchEvent(new Event('mouseenter'));
    // 240 - 8 - 200 = 32 for the item's left edge, minus the hint's own origin (20).
    expect(hint.style.left).toBe('12px');
    link.dispatchEvent(new Event('mouseleave'));

    clientWidth.mockReturnValue(0);
    link.dispatchEvent(new Event('mouseenter'));
    expect(hint.style.left).toBe('80px');
  });

  it('removes each hint with its item instead of leaving it in the header', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.header-hint').length).toBe(5);
    fixture.componentRef.setInput('hideUtilities', true);
    fixture.detectChanges();
    expect(element.querySelectorAll('.header-hint').length).toBe(1);
    expect(element.querySelector('.header-hint')!.textContent).toBe(
      'Sign in to save progress and plans to your account.',
    );
    fixture.destroy();
    expect(document.querySelectorAll('.header-hint').length).toBe(0);
  });
});

describe('PlatformHeader DEV session (user decision 2026-11-02)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformHeader],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AUTHOR_PREVIEWS_BASE_URL, useValue: '/bff/author/previews/' },
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(StudyPlanAccount), 'initialize').mockResolvedValue();
    TestBed.inject(StudyPlanAccount).sessionKnown.set(true);
  });

  it.each(['/sign-in', '/sign-up/confirm', '/sign-in/forgot', '/welcome?access=pending'])(
    'before admission on %s, the logo and paths lead nowhere and only the theme stays (owner, 2026-11-03)',
    (url) => {
      vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(url);
      TestBed.inject(DevSession).gated.set(true);
      const fixture = TestBed.createComponent(PlatformHeader);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('a.brand')).toBeNull();
      expect(root.querySelector('span.brand')?.getAttribute('aria-label')).toBe('Look Ahead');
      expect(root.querySelector('app-header-navigation .path-locked')).not.toBeNull();
      expect(root.querySelector('app-header-navigation a')).toBeNull();
      expect(root.querySelector('.header-search-trigger')).toBeNull();
      expect(root.querySelector('a[href^="/study-plan"]')).toBeNull();
      expect(root.querySelector('.theme-switch')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
      fixture.detectChanges();
      expect(root.querySelector('.search-palette')).toBeNull();
    },
  );

  it('offers Exit DEV in the header only on the Welcome page while a sign-in waits before admission (DLV-971)', () => {
    const urlSpy = vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/welcome?access=pending');
    const session = TestBed.inject(DevSession);
    session.gated.set(true);
    const leave = vi.spyOn(session, 'leave').mockResolvedValue();
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const exit = root.querySelector('.dev-exit-inline-button') as HTMLButtonElement;
    expect(exit.textContent?.trim()).toBe('Exit DEV');
    expect(root.querySelector('.sign-in-button:not(.dev-exit-inline-button)')).toBeNull();
    expect(root.querySelector('#' + exit.getAttribute('aria-describedby'))?.textContent).toBe(
      'Signs you out of DEV and returns you to its gate. Sign in again once the owner has approved you.',
    );
    exit.click();
    expect(leave).toHaveBeenCalledTimes(1);
    session.leaving.set(true);
    fixture.detectChanges();
    expect(exit.textContent?.trim()).toBe('Exiting…');
    expect(exit.disabled).toBe(true);
    session.leaving.set(false);
    session.error.set('Unable to confirm leaving DEV. Retry Exit DEV environment.');
    fixture.detectChanges();
    expect(root.querySelector('.dev-exit-inline-error')?.textContent).toBe('Unable to confirm leaving DEV. Retry Exit DEV environment.');
    // Inside DEV the DEV mark's own menu carries the exit; on other gate pages there is nothing to exit yet.
    session.error.set('');
    session.status.set({ dev: true, deadline: '2026-11-05T00:00:00Z', warning: false, maintenance: false });
    fixture.detectChanges();
    expect(root.querySelector('.dev-exit-inline-button')).toBeNull();
    session.status.set(null);
    for (const url of ['/welcome', '/sign-in', '/sign-up/confirm', '/?access=pending']) {
      urlSpy.mockReturnValue(url);
      fixture.detectChanges();
      expect(root.querySelector('.dev-exit-inline-button'), url).toBeNull();
    }
  });

  it('before admission, a signed-in visitor’s account menu holds only Sign out; after admission it has every link', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/welcome?access=pending');
    const session = TestBed.inject(DevSession);
    session.gated.set(true);
    TestBed.inject(StudyPlanAccount).account.set({
      accountId: 'waiting',
      username: 'google_1137',
      displayName: 'Waiting Person',
      topicGrants: [],
      authorPreview: true,
    });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('.avatar-trigger-btn') as HTMLButtonElement;
    expect(root.querySelector('#' + trigger.getAttribute('aria-describedby'))?.textContent).toBe(
      'Your account: sign out to use a different account.',
    );
    trigger.click();
    fixture.detectChanges();
    const menu = root.querySelector('#account-menu') as HTMLElement;
    expect(menu.querySelector('a')).toBeNull();
    expect(menu.querySelector('.user-display-email')?.textContent?.trim()).toBe(
      'Sign out to use a different account.',
    );
    expect(menu.querySelector('.account-sign-out')).not.toBeNull();

    session.status.set({ dev: true, deadline: '2026-11-05T00:00:00Z', warning: false, maintenance: false });
    fixture.detectChanges();
    expect(menu.querySelector('a[href="/account"]')).not.toBeNull();
    expect(menu.querySelector('a[href="/support"]')).not.toBeNull();
    expect(menu.querySelector('.author-account-links')).not.toBeNull();
  });

  it('starts restricted on a gate page until the DEV gate first answers, then follows admission', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/sign-in');
    const session = TestBed.inject(DevSession);
    session.known.set(false);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a.brand')).toBeNull();
    // Ordinary delivery (no DEV gate): the full header.
    session.known.set(true);
    fixture.detectChanges();
    expect(root.querySelector('a.brand')?.getAttribute('href')).toBe('/');
    expect(root.querySelector('.header-search-trigger')).not.toBeNull();
    // Admitted in DEV: the full header too.
    session.gated.set(true);
    session.status.set({ dev: true, deadline: '', warning: false, maintenance: false });
    fixture.detectChanges();
    expect(root.querySelector('a.brand')).not.toBeNull();
    expect(root.querySelector('app-header-navigation a[href="/learn"]')).not.toBeNull();
  });

  it('keeps the full header off the gate pages, where only admitted visitors arrive', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/learn');
    TestBed.inject(DevSession).gated.set(true);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a.brand')).not.toBeNull();
  });

  it('shows no DEV mark and no DEV control outside a DEV session', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.identity-mark')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dev-environment')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-platform-brand').getAttribute('aria-label')).toBe('LookAhead');
  });

  it('marks the brand "DEV" for a visitor the DEV gate has not admitted yet, with nothing to exit (DLV-969)', () => {
    TestBed.inject(DevSession).gated.set(true);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-platform-brand').getAttribute('aria-label')).toBe('LookAhead DEV');
    expect(fixture.nativeElement.querySelector('.identity-mark')?.textContent?.trim()).toBe('DEV');
    expect(fixture.nativeElement.querySelector('.dev-environment')).toBeNull();
  });

  it('opens Exit DEV environment from the DEV mark beside the brand while the DEV session is admitted (user, 2026-11-03)', async () => {
    const session = TestBed.inject(DevSession);
    session.status.set({ dev: true, deadline: '2026-11-06T04:00:00Z', warning: false, maintenance: false });
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // The control sits beside the home link, never inside it, and Leave DEV is no longer a header button.
    const trigger = root.querySelector('.brand-area > .dev-environment > .dev-environment-trigger') as HTMLButtonElement;
    expect(trigger.textContent?.replace(/\s+/g, '')).toBe('DEV▾');
    expect(trigger.getAttribute('aria-label')).toBe('DEV environment');
    expect(root.querySelector('.brand .dev-environment-trigger')).toBeNull();
    expect(root.querySelector('.leave-dev-button')).toBeNull();
    expect(root.querySelector('.identity-mark')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = root.querySelector('#dev-environment-panel') as HTMLElement;
    expect(panel.querySelector('.dev-environment-title')?.textContent).toBe('Look Ahead DEV');
    const exit = panel.querySelector('.dev-exit-button') as HTMLButtonElement;
    expect(exit.textContent?.trim()).toBe('Exit DEV environment');
    expect(document.getElementById(exit.getAttribute('aria-describedby')!)?.textContent).toContain('To see DEV as a test account, use Switch to a test account in your account menu.');
    const leave = vi.spyOn(session, 'leave').mockResolvedValue();
    exit.click();
    expect(leave).toHaveBeenCalledOnce();
    session.leaving.set(true);
    session.error.set('Unable to confirm leaving DEV. Retry Exit DEV environment.');
    fixture.detectChanges(); await fixture.whenStable();
    expect((root.querySelector('.dev-exit-button') as HTMLButtonElement).disabled).toBe(true);
    expect(root.querySelector('.dev-exit-button')?.textContent?.trim()).toBe('Exiting…');
    expect(root.querySelector('.dev-environment-error')?.textContent).toContain('Retry Exit DEV environment');
    // A click inside keeps it open; outside, Escape or opening the account menu closes it.
    panel.click(); fixture.detectChanges();
    expect(root.querySelector('#dev-environment-panel')).not.toBeNull();
    document.body.click(); fixture.detectChanges();
    expect(root.querySelector('#dev-environment-panel')).toBeNull();
    trigger.click(); fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges();
    expect(root.querySelector('#dev-environment-panel')).toBeNull();
    trigger.click(); fixture.detectChanges();
    trigger.click(); fixture.detectChanges();
    expect(root.querySelector('#dev-environment-panel')).toBeNull();
  });
});
