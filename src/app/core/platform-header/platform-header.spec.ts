import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

  it('keeps the interview question library discoverable in the search palette', () => {
    const fixture = TestBed.createComponent(PlatformHeader);
    fixture.detectChanges();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.persistent-suggestions strong')]
      .map((element: Element) => element.textContent?.trim())
      .filter(Boolean);
    expect(labels).toContain('Interview questions');
  });
});
