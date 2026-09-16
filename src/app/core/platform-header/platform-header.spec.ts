import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { PlatformHeader, accountTriggerLabel } from './platform-header';
import { AUTHOR_PREVIEWS_BASE_URL } from '../author-preview-config';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

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
  });

  it('shows only Sign in when signed out or expired and only the account control when authenticated', () => {
    const store = TestBed.inject(StudyPlanAccount);
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.avatar-trigger-btn')).toBeNull();
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

  it('preserves an existing protected return path on the sign-in page', () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/sign-in?returnTo=%2Fauthor');
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
    accounts.account.update((account) => ({ ...account!, authorPreview: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.author-account-links')?.textContent).toContain(
      'Author previews',
    );
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
    const actions = [
      ...fixture.nativeElement.querySelector('[aria-label="Account links"]').children,
    ].map((item: any) => item.textContent.trim());
    expect(actions).toEqual([
      'View study plan',
      'Manage account',
      'Subscription Not available yet',
      'Support and feedback',
    ]);
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
    const sectionLabel = menu.querySelector('a[href="/author/previews"]')!;
    expect(sectionLabel.textContent?.trim()).toBe('Author previews');
    expect(sectionLabel.tagName).toBe('A');
    expect(menu.querySelector('.author-account-links')?.getAttribute('aria-label')).toBe(
      'Author tools',
    );
    expect(menu.textContent!.indexOf('Support and feedback')).toBeLessThan(
      menu.textContent!.indexOf('Author previews'),
    );
    expect(menu.textContent!.indexOf('Architecture')).toBeLessThan(
      menu.textContent!.indexOf('Sign out'),
    );
    expect(menu.querySelector('.author-account-links a[href="/delivery-plan"]')).not.toBeNull();
    expect(
      menu.querySelector('a[href="/author/architecture"]'),
    ).not.toBeNull();
    expect(menu.textContent).not.toContain('Mock interviews');
    expect(menu.textContent).not.toContain('Previews/unpublished work');
    expect(menu.querySelectorAll('a[href*="localhost"], a[href*="127.0.0.1"]')).toHaveLength(0);
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
      '/look-ahead/system-design',
      '/grow/ai-assisted-development',
      '/learn/core-java',
      '/look-ahead/behavioral-carl',
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
    ).toEqual(['Learn', 'Grow', 'Look Ahead']);
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
    expect(link.getAttribute('href')).toBe('/look-ahead/behavioral-carl');
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
