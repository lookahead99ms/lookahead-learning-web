import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from './platform-header';

describe('PlatformHeader account disclosure', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformHeader],
      providers: [
        provideRouter([]),
        {
          provide: ContentService,
          useValue: { getSearchIndex: () => of([]) },
        },
      ],
    }).compileComponents();
  });

  it('exposes the account panel as a labelled disclosure', () => {
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

  it('returns focus to the account trigger when Escape closes the panel', async () => {
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

  it('keeps interview practice discoverable in the search palette', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.persistent-suggestions strong')]
      .map((element: Element) => element.textContent?.trim())
      .filter(Boolean);
    expect(labels).toContain('Interview practice');
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

  it('keeps keyboard focus inside quick search and exposes a native full-results link', async () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'spring transactions';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.search-palette-hint a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/search?q=spring%20transactions');
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
