import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ContentService } from '../../content/content.service';
import { Landing } from './landing';

describe('Landing', () => {
  function captureAnimations(root: HTMLElement) {
    const animations: Array<{
      element: HTMLElement;
      frames: Keyframe[];
      options: KeyframeAnimationOptions;
      finish: () => void;
      cancel: ReturnType<typeof vi.fn>;
    }> = [];
    root.querySelectorAll<HTMLElement>('.hero-slide, .hero-visual').forEach((element) => {
      Object.defineProperty(element, 'animate', {
        value: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
          let finish!: () => void;
          let reject!: (reason: Error) => void;
          const finished = new Promise<void>((resolve, fail) => {
            finish = resolve;
            reject = fail;
          });
          const cancel = vi.fn(() => reject(new Error('Animation cancelled')));
          animations.push({ element, frames, options, finish, cancel });
          return { finished, cancel };
        },
      });
    });
    return animations;
  }

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
    const animations = captureAnimations(fixture.nativeElement);
    await vi.advanceTimersByTimeAsync(12000);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.hero-slide.active').getAttribute('aria-label'),
    ).toBe('1 of 5: Pathfinder');
    expect(fixture.nativeElement.querySelector('[aria-label="Pause slideshow"]')).toBeNull();
    expect(listeners.size).toBe(1);
    fixture.nativeElement.querySelector('[aria-label="Next hero slide"]').click();
    fixture.detectChanges();
    expect(animations).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('[aria-label="Play slideshow"]').disabled).toBe(
      true,
    );
    await vi.advanceTimersByTimeAsync(12000);
    expect(
      fixture.nativeElement.querySelector('.hero-slide.active').getAttribute('aria-label'),
    ).toBe('2 of 5: Decision Room');
    fixture.destroy();
    expect(listeners.size).toBe(0);
  });

  it('cross-dissolves slides and shifts only the incoming panel by the approved 16 pixels', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const animations = captureAnimations(root);
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    fixture.detectChanges();
    expect(animations).toHaveLength(3);
    expect(animations.slice(0, 2).map((item) => item.frames)).toEqual([
      [{ opacity: 1 }, { opacity: 0 }],
      [{ opacity: 0 }, { opacity: 1 }],
    ]);
    expect(animations[2].element.classList.contains('hero-visual')).toBe(true);
    expect(animations[2].frames).toEqual([
      { transform: 'translateX(16px)' },
      { transform: 'translateX(0)' },
    ]);
    expect(animations.every((item) => item.options.duration === 420)).toBe(true);
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(2);
    expect(root.querySelectorAll('.hero-slide:not([inert])')).toHaveLength(1);
    expect(
      root.querySelector('.hero-slide.transitioning:not(.active)')?.getAttribute('aria-hidden'),
    ).toBe('true');
    animations.forEach((item) => item.finish());
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    root.querySelector<HTMLButtonElement>('[aria-label="Previous hero slide"]')!.click();
    expect(animations[5].frames[0]['transform']).toBe('translateX(-16px)');
    fixture.destroy();
    expect(animations.every((item) => item.cancel.mock.calls.length === 1)).toBe(true);
  });

  it('cancels rapid navigation without allowing stale completion to settle the current transition', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const animations = captureAnimations(root);
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    animations.forEach((item) => item.finish());
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(root.querySelector('.hero-slide.active')?.getAttribute('aria-label')).toBe(
      '3 of 5: Fieldnotes',
    );
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(2);
    expect(animations.slice(3).every((item) => item.cancel.mock.calls.length === 0)).toBe(true);
    root.querySelector<HTMLButtonElement>('[aria-label="Show slide 5: Journey Atlas"]')!.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide:not([inert])')).toHaveLength(1);
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(2);
    expect(animations.slice(0, 6).every((item) => item.cancel.mock.calls.length === 1)).toBe(true);
    animations.slice(6).forEach((item) => item.finish());
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    expect(root.querySelector('.hero-slide.active')?.getAttribute('aria-label')).toBe(
      '5 of 5: Journey Atlas',
    );
    fixture.destroy();
  });

  it('settles motion when the page hides or reduced motion is enabled and preserves focus pausing', async () => {
    vi.useFakeTimers();
    let motionChanged!: (event: MediaQueryListEvent) => void;
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_type: string, listener: typeof motionChanged) => {
        motionChanged = listener;
      },
      removeEventListener: () => {},
    }));
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const animations = captureAnimations(root);
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(12000);
    expect(animations).toHaveLength(3);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(6000);
    fixture.detectChanges();
    expect(animations).toHaveLength(6);
    motionChanged({ matches: true } as MediaQueryListEvent);
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    expect(animations.every((item) => item.cancel.mock.calls.length === 1)).toBe(true);
    motionChanged({ matches: false } as MediaQueryListEvent);
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[aria-label="Play slideshow"]')!.click();
    root
      .querySelector('.hero-slide.active .primary-action')!
      .dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="Play slideshow"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    expect(animations).toHaveLength(6);
    hidden.mockRestore();
    fixture.destroy();
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

  it('alternates panel palettes on every automatic change across consecutive five-slide loops', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    for (let step = 0; step < 15; step++) {
      const active = root.querySelector('.hero-slide.active')!;
      expect(active.getAttribute('aria-label')).toMatch(new RegExp(`^${(step % 5) + 1} of 5:`));
      expect(active.querySelector('.hero-visual')?.getAttribute('data-panel-tone')).toBe(
        step % 2 === 0 ? 'light' : 'dark',
      );
      await vi.advanceTimersByTimeAsync(6000);
      fixture.detectChanges();
    }
    fixture.destroy();
  });

  it('alternates for previous and dot navigation while preserving outgoing palettes and no-op selections', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    captureAnimations(root);
    const tone = (selector: string) =>
      root.querySelector(`${selector} .hero-visual`)?.getAttribute('data-panel-tone');
    root.querySelector<HTMLButtonElement>('[aria-label="Show slide 3: Fieldnotes"]')!.click();
    fixture.detectChanges();
    expect(tone('.hero-slide.active')).toBe('dark');
    expect(tone('.hero-slide.transitioning:not(.active)')).toBe('light');
    root.querySelector<HTMLButtonElement>('[aria-label="Show slide 3: Fieldnotes"]')!.click();
    fixture.detectChanges();
    expect(tone('.hero-slide.active')).toBe('dark');
    root.querySelector<HTMLButtonElement>('[aria-label="Previous hero slide"]')!.click();
    fixture.detectChanges();
    expect(tone('.hero-slide.active')).toBe('light');
    expect(tone('.hero-slide.transitioning:not(.active)')).toBe('dark');
    fixture.destroy();
  });

  it('retains canonical entry routes and distinguishes forthcoming media from available guides', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.hero-dots button').length).toBe(5);
    expect(root.querySelector('#hero-count')).toBeNull();
    expect(root.querySelector('.landing-footer a[href="/delivery-plan"]')).toBeNull();
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
