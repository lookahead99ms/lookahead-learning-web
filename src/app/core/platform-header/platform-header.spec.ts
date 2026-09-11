import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from './platform-header';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

describe('PlatformHeader account disclosure', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformHeader],
      providers: [
        provideRouter([]),
        provideHttpClient(),
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
    expect(trigger.getAttribute('aria-label')).toBe('Account menu');
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

  it('shows Author views only for the server-provided capability', () => {
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
    expect(fixture.nativeElement.querySelector('a[href="/author"]')).toBeNull();
    accounts.account.update((account) => ({ ...account!, authorPreview: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/author"]')?.textContent).toContain(
      'Author views',
    );
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
