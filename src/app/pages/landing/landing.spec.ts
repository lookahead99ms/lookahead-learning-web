import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ContentService } from '../../content/content.service';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        provideRouter([]),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    }).compileComponents();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts paused for reduced motion and removes its preference listener on teardown', async () => {
    vi.useFakeTimers();
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    }));
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(12000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero-slide.active').getAttribute('aria-label'))
      .toBe('1 of 5: Pathfinder');
    expect(fixture.nativeElement.querySelector('[aria-label="Pause slideshow"]')).toBeNull();
    expect(listeners.size).toBe(1);
    fixture.destroy();
    expect(listeners.size).toBe(0);
  });

  it('starts automatically at six seconds, pauses, and keeps inactive slides inert', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(5999);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.hero-slide.active').getAttribute('aria-label'),
    ).toBe('1 of 5: Pathfinder');
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.hero-slide.active').getAttribute('aria-label'),
    ).toBe('2 of 5: Decision Room');
    expect(fixture.nativeElement.querySelectorAll('.hero-slide[inert]').length).toBe(4);
    fixture.nativeElement.querySelector('[aria-label="Pause slideshow"]').click();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(12000);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.hero-slide.active').getAttribute('aria-label'),
    ).toBe('2 of 5: Decision Room');
    fixture.destroy();
  });

  it('retains canonical entry routes and distinguishes forthcoming media from available guides', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.hero-dots button').length).toBe(5);
    expect(root.querySelector('#hero-count')).toBeNull();
    expect(root.querySelector('.landing-footer a')?.getAttribute('href')).toBe('/delivery-plan');
    expect(root.querySelector('.media-panel a')?.getAttribute('href')).toBe(
      '/look-ahead/system-design/module/case-feed-messaging',
    );
    expect(root.textContent).toContain('audio and video explanations are planned');
    expect(root.textContent).toContain(
      'Standalone clone-and-run project repositories are in preparation',
    );
    fixture.destroy();
  });
});
