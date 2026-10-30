import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ContentService } from '../../content/content.service';
import { Landing } from './landing';

const TABS = ['Choose', 'Plan', 'Reason', 'Design', 'Build', 'Diagnose'];
const LABELS = [
  'Choose your path',
  'Plan your weeks',
  'Reasoning in code',
  'From queue to design',
  'Build AI projects',
  'Diagnose a slowdown',
];

function clampPreferredTerms(value: string): string[] {
  const terms: string[] = [];
  for (let start = value.indexOf('clamp('); start !== -1; start = value.indexOf('clamp(', start + 6)) {
    const parts: string[] = [];
    let current = '';
    let depth = 1;
    for (let index = start + 6; index < value.length; index++) {
      const char = value[index];
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (depth === 0) {
        parts.push(current.trim());
        if (parts.length === 3) terms.push(parts[1]);
        break;
      }
      if (char === ',' && depth === 1) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  return terms;
}

describe('Landing', () => {
  function captureAnimations(root: HTMLElement) {
    const animations: Array<{
      element: HTMLElement;
      frames: Keyframe[];
      options: KeyframeAnimationOptions;
      finish: () => void;
      cancel: ReturnType<typeof vi.fn>;
    }> = [];
    root.querySelectorAll<HTMLElement>('.hero-slide').forEach((element) => {
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

  const active = (root: HTMLElement) =>
    root.querySelector('.hero-slide.active')?.getAttribute('aria-label');

  /** The active chapter tab's progress bar finished filling: that is the slide's timer. */
  function finishChapter(fixture: ComponentFixture<Landing>): void {
    const fill = fixture.nativeElement.querySelector(
      '.chapter-tab[aria-pressed="true"] .chapter-fill',
    ) as HTMLElement;
    fill.dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
  }

  /** The previous carousel is kept at /preview/hero/0 (the home route serves hero candidate 5 since 2026-10-30). */
  const classicHeroRoute = {
    provide: ActivatedRoute,
    useValue: {
      paramMap: of(convertToParamMap({ variant: '0' })),
      snapshot: { paramMap: convertToParamMap({ variant: '0' }), data: {} },
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
        classicHeroRoute,
      ],
    }).compileComponents();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows six slides in journey order with one-word chapter tabs and no old slide names', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const slides = [...root.querySelectorAll('.hero-slide')];
    expect(slides.map((slide) => slide.getAttribute('aria-label'))).toEqual(
      LABELS.map((label, i) => `${i + 1} of 6: ${label}`),
    );
    expect(slides.map((slide) => slide.getAttribute('data-visual'))).toEqual(
      TABS.map((tab) => tab.toLowerCase()),
    );
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.chapter-tab')];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(TABS);
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(
      LABELS.map((label, i) => `Show slide ${i + 1}: ${label}`),
    );
    expect(tabs.every((tab) => !/\d/.test(tab.textContent ?? ''))).toBe(true);
    expect(root.querySelector('.hero-carousel')?.getAttribute('aria-label')).toBe(
      'Six ways to grow as an engineer',
    );
    expect(root.querySelector('.hero-dots')).toBeNull();
    expect(root.querySelector('[data-light]')).toBeNull();
    for (const name of [
      'Pathfinder',
      'Decision Room',
      'Fieldnotes',
      'Build Studio',
      'Journey Atlas',
    ])
      expect(root.textContent).not.toContain(name);
    fixture.destroy();
  });

  it('times each slide at 6 s with its chapter bar and advances only when the active bar finishes', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const carousel = root.querySelector<HTMLElement>('.hero-carousel')!;
    expect(carousel.style.getPropertyValue('--slide-ms')).toBe('6000ms');
    expect(carousel.hasAttribute('data-held')).toBe(false);
    const fills = [...root.querySelectorAll('.chapter-fill')];
    expect(fills.map((fill) => fill.classList.contains('run'))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    // No JavaScript timer drives the slideshow: the bar's CSS animation is the timer.
    await vi.advanceTimersByTimeAsync(30000);
    fixture.detectChanges();
    expect(active(root)).toBe('1 of 6: Choose your path');
    // An inactive bar, or an animation bubbling up from inside a bar, never advances it.
    fills[3].dispatchEvent(new Event('animationend'));
    fills[0]
      .appendChild(document.createElement('span'))
      .dispatchEvent(new Event('animationend', { bubbles: true }));
    fixture.detectChanges();
    expect(active(root)).toBe('1 of 6: Choose your path');
    finishChapter(fixture);
    expect(active(root)).toBe('2 of 6: Plan your weeks');
    expect(root.querySelectorAll('.hero-slide[inert]')).toHaveLength(5);
    expect(root.querySelector('.chapter-tab.done')?.textContent?.trim()).toBe('Choose');
    fixture.destroy();
  });

  it('loops through all six slides and back to the first', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    for (let step = 0; step < 13; step++) {
      expect(active(root)).toBe(`${(step % 6) + 1} of 6: ${LABELS[step % 6]}`);
      expect(root.querySelector('.hero-slide.active .hero-visual')).not.toBeNull();
      finishChapter(fixture);
    }
    fixture.destroy();
  });

  it('pauses on the Pause button and resumes on Play', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const rotation = root.querySelector<HTMLButtonElement>('.rotation-toggle')!;
    expect(rotation.getAttribute('aria-label')).toBe('Pause slideshow');
    rotation.click();
    fixture.detectChanges();
    expect(rotation.getAttribute('aria-label')).toBe('Play slideshow');
    expect(root.querySelector('.hero-carousel')?.hasAttribute('data-held')).toBe(true);
    expect(root.querySelector('.hero-slides')?.getAttribute('aria-live')).toBe('polite');
    finishChapter(fixture);
    expect(active(root)).toBe('1 of 6: Choose your path');
    // Tabs and arrows still move while paused.
    root.querySelectorAll<HTMLButtonElement>('.chapter-tab')[4].click();
    fixture.detectChanges();
    expect(active(root)).toBe('5 of 6: Build AI projects');
    rotation.click();
    fixture.detectChanges();
    expect(rotation.getAttribute('aria-label')).toBe('Pause slideshow');
    expect(root.querySelector('.hero-slides')?.getAttribute('aria-live')).toBe('off');
    finishChapter(fixture);
    expect(active(root)).toBe('6 of 6: Diagnose a slowdown');
    fixture.destroy();
  });

  it('keeps playing after a tab or arrow click', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    root
      .querySelector<HTMLButtonElement>('[aria-label="Show slide 3: Reasoning in code"]')!
      .click();
    fixture.detectChanges();
    expect(active(root)).toBe('3 of 6: Reasoning in code');
    expect(root.querySelector('.hero-carousel')?.hasAttribute('data-held')).toBe(false);
    finishChapter(fixture);
    expect(active(root)).toBe('4 of 6: From queue to design');
    root.querySelector<HTMLButtonElement>('[aria-label="Previous hero slide"]')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Previous hero slide"]')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Previous hero slide"]')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Previous hero slide"]')!.click();
    fixture.detectChanges();
    expect(active(root)).toBe('6 of 6: Diagnose a slowdown');
    fixture.destroy();
  });

  it('holds rotation while keyboard focus is in the hero, never for pointer focus, and lets Play lift that hold', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const carousel = root.querySelector<HTMLElement>('.hero-carousel')!;
    const next = root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!;
    const rotation = root.querySelector<HTMLButtonElement>('.rotation-toggle')!;
    const outside = root.querySelector<HTMLElement>('#paths')!;
    // :focus-visible tells keyboard focus from a pointer click.
    const focusIn = (element: HTMLElement, keyboard: boolean) => {
      vi.spyOn(element, 'matches').mockImplementation(
        (selector: string) => selector === ':focus-visible' && keyboard,
      );
      element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      fixture.detectChanges();
    };
    const focusOut = (element: HTMLElement, relatedTarget: HTMLElement) => {
      element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
      fixture.detectChanges();
    };
    const held = () => carousel.hasAttribute('data-held');

    focusIn(next, false);
    expect(held()).toBe(false);
    focusIn(next, true);
    expect(held()).toBe(true);
    expect(rotation.getAttribute('aria-label')).toBe('Play slideshow');
    finishChapter(fixture);
    expect(active(root)).toBe('1 of 6: Choose your path');
    // Moving focus within the hero keeps the hold.
    focusOut(next, rotation);
    focusIn(rotation, true);
    expect(held()).toBe(true);
    rotation.click();
    fixture.detectChanges();
    expect(held()).toBe(false);
    // After an explicit Play, keyboard focus inside the hero does not hold it again.
    focusOut(rotation, next);
    focusIn(next, true);
    expect(held()).toBe(false);
    // Leaving the hero ends that visit; the next keyboard visit holds it again.
    focusOut(next, outside);
    focusIn(next, true);
    expect(held()).toBe(true);
    focusOut(next, outside);
    expect(held()).toBe(false);
    fixture.destroy();
  });

  it('holds still for reduced motion and removes its preference listener on teardown', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    // Only the reduced-motion query is counted: the platform theme also listens for the color scheme.
    vi.stubGlobal('matchMedia', (query: string) => {
      const reducedMotion = query === '(prefers-reduced-motion: reduce)';
      return {
        matches: reducedMotion,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          reducedMotion && listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          reducedMotion && listeners.delete(listener),
      };
    });
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const animations = captureAnimations(root);
    expect(listeners.size).toBe(1);
    expect(root.querySelector('.chapter-fill.run')).toBeNull();
    expect(root.querySelector('.hero-carousel')?.hasAttribute('data-held')).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Play slideshow"]')!.disabled).toBe(
      true,
    );
    finishChapter(fixture);
    expect(active(root)).toBe('1 of 6: Choose your path');
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    fixture.detectChanges();
    expect(active(root)).toBe('2 of 6: Plan your weeks');
    expect(animations).toHaveLength(0);
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    expect(root.querySelector('.hv-stack-dot')).toBeNull();
    fixture.destroy();
    expect(listeners.size).toBe(0);
  });

  it('dissolves between slides without cancelling a naturally finished transition', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const animations = captureAnimations(root);
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    fixture.detectChanges();
    expect(animations).toHaveLength(2);
    expect(animations.map((item) => item.frames)).toEqual([
      [{ opacity: 1 }, { opacity: 0 }],
      [{ opacity: 0 }, { opacity: 1 }],
    ]);
    expect(animations.every((item) => item.options.duration === 300)).toBe(true);
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(2);
    expect(root.querySelectorAll('.hero-slide:not([inert])')).toHaveLength(1);
    expect(
      root.querySelector('.hero-slide.transitioning:not(.active)')?.getAttribute('aria-hidden'),
    ).toBe('true');
    animations.forEach((item) => item.finish());
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    // A naturally finished transition is never cancelled: cancelling it would
    // snap the outgoing panel's opacity back to 1 a frame before it is
    // hidden, which is exactly the flicker this behavior avoids.
    expect(animations.slice(0, 2).every((item) => item.cancel.mock.calls.length === 0)).toBe(true);
    root.querySelector<HTMLButtonElement>('[aria-label="Previous hero slide"]')!.click();
    expect(animations[2].frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(animations[3].frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    fixture.destroy();
    expect(animations.slice(2).every((item) => item.cancel.mock.calls.length === 1)).toBe(true);
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
    expect(active(root)).toBe('3 of 6: Reasoning in code');
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(2);
    expect(animations.slice(2).every((item) => item.cancel.mock.calls.length === 0)).toBe(true);
    root
      .querySelector<HTMLButtonElement>('[aria-label="Show slide 6: Diagnose a slowdown"]')!
      .click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide:not([inert])')).toHaveLength(1);
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(2);
    expect(animations.slice(0, 4).every((item) => item.cancel.mock.calls.length === 1)).toBe(true);
    animations.slice(4).forEach((item) => item.finish());
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    expect(active(root)).toBe('6 of 6: Diagnose a slowdown');
    fixture.destroy();
  });

  it('settles motion and holds the slideshow while the page is hidden or reduced motion turns on', () => {
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
    const carousel = root.querySelector('.hero-carousel')!;
    const animations = captureAnimations(root);
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    expect(carousel.hasAttribute('data-held')).toBe(true);
    finishChapter(fixture);
    expect(active(root)).toBe('2 of 6: Plan your weeks');
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(carousel.hasAttribute('data-held')).toBe(false);
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    expect(animations).toHaveLength(4);
    motionChanged({ matches: true } as MediaQueryListEvent);
    fixture.detectChanges();
    expect(root.querySelectorAll('.hero-slide.transitioning')).toHaveLength(0);
    expect(animations.every((item) => item.cancel.mock.calls.length === 1)).toBe(true);
    expect(carousel.hasAttribute('data-held')).toBe(true);
    expect(root.querySelector('.chapter-fill.run')).toBeNull();
    motionChanged({ matches: false } as MediaQueryListEvent);
    fixture.detectChanges();
    expect(carousel.hasAttribute('data-held')).toBe(false);
    hidden.mockRestore();
    fixture.destroy();
  });

  it('gives each slide its call to action and destination', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const actions = [...root.querySelectorAll<HTMLAnchorElement>('.hero-slide .primary-action')];
    expect(actions.map((link) => link.textContent?.replace('→', '').trim())).toEqual([
      'Choose a learning path',
      'Shape my study plan',
      'Explore hands-on practice',
      'Find a question worth exploring',
      'Explore AI Builds',
      'Find a scenario to practice',
    ]);
    expect(actions.map((link) => link.getAttribute('href'))).toEqual([
      '/#paths',
      '/study-plan',
      '/learn/hands-on-dsa',
      '/search',
      '/blaze/ai-systems-architecture',
      '/search?kind=practice&format=debug',
    ]);
    fixture.destroy();
  });

  it('shows the AI Builds slide copy, example projects and what every project gives you', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const build = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.hero-slide[data-visual="build"]',
    )!;
    expect(build.querySelector('.eyebrow')?.textContent).toBe('AI Builds');
    expect(
      [...build.querySelectorAll('.slide-title span')].map((line) => line.textContent?.trim()),
    ).toEqual(['AI is part of your toolkit.', 'It does the heavy lifting. You make the call.']);
    expect(build.querySelector('.lead')?.textContent).toBe(
      'Let AI automate the routine work and find patterns in your data, like flagging possible fraud, while you design the system and decide what ships. Guided projects in Java and Python.',
    );
    expect(build.querySelector('.primary-action')?.textContent).toContain('Explore AI Builds');
    expect(build.querySelectorAll('.hv-stack-art[role="img"]')).toHaveLength(2);
    expect(
      [...build.querySelectorAll('.hv-tiles li')].map((tile) => tile.textContent?.trim()),
    ).toEqual([
      'On-call Assistant',
      'Document Intelligence',
      'Supply Chain Assistant',
      'Research Agent',
      'Full-Stack AI',
      '+ more',
    ]);
    expect(
      [...build.querySelectorAll('.hv-checks li')].map((item) => item.textContent?.trim()),
    ).toEqual([
      'A prompt for each step',
      'Tests for every step',
      'Java and Python downloads',
      'You approve every action',
    ]);
    fixture.destroy();
  });

  it('jumps to the path cards from the first slide without leaving the page', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    document.body.appendChild(root);
    // A router navigation would run the router's scroll restoration and jump back to the top.
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('.hero-slide.active .primary-action')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('paths');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(replaceState.mock.lastCall?.slice(1)).toEqual(['', '/#paths']);
    root.remove();
    replaceState.mockRestore();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    fixture.destroy();
  });

  it('plays the Essence in order: the wordmark, then its statements and steps, replay included', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const essence = root.querySelector('.home-essence');
    expect(
      [...(essence?.children ?? [])].map((child) => child.tagName.toLowerCase()).filter((tag) => tag.startsWith('app-')),
    ).toEqual(['app-platform-brand', 'app-wordmark-key', 'app-essence-steps']);
    expect(essence?.querySelector('app-platform-brand.essence-corner-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(essence?.querySelector('app-platform-brand-illustration')).toBeNull();
    expect(essence?.querySelector('.brand-story-copy')).toBeNull();
    expect(essence?.querySelector('.brand-context')?.textContent).toBe('Our platform');
    expect(root.querySelector('#brand-story-title')?.textContent).toBe('The Essence of Look Ahead');
    // The statements and steps wait for the wordmark, and hide again when it replays.
    const steps = essence?.querySelector('app-essence-steps');
    const key = fixture.debugElement.query((node) => node.name === 'app-wordmark-key');
    expect(steps?.getAttribute('data-state')).toBe('hidden');
    key.triggerEventHandler('finished');
    fixture.detectChanges();
    expect(steps?.getAttribute('data-state')).toBe('shown');
    // The wordmark's sentence settles below the steps and stays; the loop sends the stairs'
    // arrow up again after each light along the wordmark; pausing marks the card.
    const sentence = essence?.querySelector('.essence-sentence');
    expect(sentence?.classList.contains('shown')).toBe(true);
    expect(sentence?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Look ahead to the obstacle, put AI to work in your code, explore and engineer with algorithms and architecture, and find the way through.',
    );
    expect(
      [...(sentence?.querySelectorAll<HTMLElement>('.essence-key-word') ?? [])].map((word) => word.textContent),
    ).toEqual(['Look', 'obstacle', 'AI', 'code', 'explore', 'engineer', 'algorithms', 'architecture', 'the way through']);
    const stepsNode = fixture.debugElement.query((node) => node.name === 'app-essence-steps');
    stepsNode.triggerEventHandler('settled');
    fixture.detectChanges();
    key.triggerEventHandler('passed');
    fixture.detectChanges();
    expect(stepsNode.componentInstance.loop()).toBe(1);
    key.triggerEventHandler('stillChange', true);
    fixture.detectChanges();
    expect(essence?.getAttribute('data-motion')).toBe('still');
    expect(stepsNode.componentInstance.still()).toBe(true);
    key.triggerEventHandler('stillChange', false);
    // In a loop round the statements step aside for the wordmark's captions, then return.
    key.triggerEventHandler('cycle', 'apart');
    fixture.detectChanges();
    expect(steps?.hasAttribute('data-away')).toBe(true);
    key.triggerEventHandler('cycle', 'joined');
    fixture.detectChanges();
    expect(steps?.hasAttribute('data-away')).toBe(false);
    // Skipping to the end jumps everything to finished for a moment, then motion works again.
    vi.useFakeTimers();
    key.triggerEventHandler('cycle', 'apart');
    key.triggerEventHandler('skipped');
    fixture.detectChanges();
    expect(essence?.hasAttribute('data-skip')).toBe(true);
    expect(steps?.hasAttribute('data-away')).toBe(false);
    expect(stepsNode.componentInstance.instant()).toBe(true);
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(essence?.hasAttribute('data-skip')).toBe(false);
    vi.useRealTimers();
    key.triggerEventHandler('restarted');
    fixture.detectChanges();
    expect(essence?.hasAttribute('data-skip')).toBe(false);
    expect(steps?.getAttribute('data-state')).toBe('hidden');
    expect(sentence?.classList.contains('shown')).toBe(false);
    expect(stepsNode.componentInstance.loop()).toBe(0);
    expect(essence?.getAttribute('data-motion')).toBeNull();
    fixture.destroy();
  });

  it('keeps the page sections, their section-nav labels and the signature', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('app-platform-header')).not.toBeNull();
    expect(root.querySelector('main#main-content.landing-page')).not.toBeNull();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')?.textContent).toBe('Build with AI. Understand what you ship.');
    expect(root.querySelector('.signature-support')?.textContent).toBe(
      'Know why it works. Know when it won’t.',
    );
    expect(root.querySelector('.hero-stage .hero-masthead h1')).not.toBeNull();
    expect(root.querySelector('#paths.home-paths')).not.toBeNull();
    expect(root.querySelector('app-engineering-challenge.home-challenge')).not.toBeNull();
    expect(root.querySelector('.feature-discovery.home-explore')).not.toBeNull();
    expect(root.querySelector('.brand-story.home-essence app-wordmark-key')).not.toBeNull();
    // The footer: "Learn. Grow. Blaze." with the reasoning pair beside it, its only place on the
    // site (user, 2026-10-17).
    const footer = root.querySelector('.landing-footer.home-footer');
    expect(footer?.querySelector('p')?.textContent?.trim()).toBe('Learn. Grow. Blaze.');
    expect(
      [...(footer?.querySelectorAll('.footer-statements > *') ?? [])].map((statement) =>
        statement.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Understand the obstacle. Find the way.', 'Know why it works. Know when it won’t.']);
    expect(
      [...root.querySelectorAll('[data-sidebar-label]')].map((heading) =>
        heading.getAttribute('data-sidebar-label'),
      ),
    ).toEqual(['Discover your path', 'Test your judgment', 'Find your next step', 'Pricing', 'The essence']);
    fixture.destroy();
  });

  it('starts the path-card stories at 1.5, 2.5 and 3.5 s, lets them overlap, and pauses with the toggle', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const http = TestBed.inject(HttpTestingController);
    for (const name of ['learn', 'grow', 'blaze']) {
      http
        .expectOne(`/assets/scenes/landing/${name}.svg`)
        .flush(
          `<svg xmlns="http://www.w3.org/2000/svg" data-story-ms="10000" viewBox="0 0 10 10"><rect class="${name}-x"/></svg>`,
        );
    }
    fixture.detectChanges();
    const scene = (name: string) =>
      root.querySelector(`app-card-scene[src="/assets/scenes/landing/${name}.svg"] svg`)!;
    const playing = () =>
      ['learn', 'grow', 'blaze'].filter((name) => scene(name).classList.contains(`${name}-play`));

    await vi.advanceTimersByTimeAsync(1499);
    expect(playing()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(playing()).toEqual(['learn']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(playing()).toEqual(['learn', 'grow']);

    const toggle = root.querySelector<HTMLButtonElement>('.path-motion-toggle')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent?.trim()).toBe('Pause animations');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent?.trim()).toBe('Play animations');
    expect(scene('learn').classList.contains('learn-paused')).toBe(true);
    expect(scene('grow').classList.contains('grow-paused')).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(playing()).toEqual(['learn', 'grow']);
    toggle.click();
    fixture.detectChanges();
    expect(scene('grow').classList.contains('grow-paused')).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(playing()).toEqual(['learn', 'grow', 'blaze']);
    fixture.destroy();
  });

  it('keeps the path-card scenes on their summaries and hides the toggle for reduced motion', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/assets/scenes/landing/learn.svg')
      .flush('<svg xmlns="http://www.w3.org/2000/svg" data-story-ms="1000" viewBox="0 0 10 10"/>');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(30000);
    fixture.detectChanges();
    expect(root.querySelector('.learn-play')).toBeNull();
    expect(root.querySelector('.path-motion-toggle')).toBeNull();
    fixture.destroy();
  });

  it('keeps challenge progress independent of carousel navigation', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    root.querySelectorAll<HTMLButtonElement>('.answers button')[1].click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.step-controls button:last-child')!.click();
    fixture.detectChanges();
    const explanation = root.querySelector('.step')?.textContent;
    root.querySelector<HTMLButtonElement>('[aria-label="Next hero slide"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.step')?.textContent).toBe(explanation);
    expect(root.querySelectorAll('.answers button[aria-pressed="true"]')).toHaveLength(1);
    fixture.destroy();
  });

  it('retains canonical entry routes and distinguishes forthcoming media from available guides', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.chapter-tab')).toHaveLength(6);
    expect(root.querySelectorAll('.discovery-feature')).toHaveLength(4);
    const discoveryLinks = [...root.querySelectorAll('.discovery-feature [data-card-primary]')];
    expect(discoveryLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/blaze/design-systems',
      '/search',
      '/study-plan',
      '/blaze/ai-systems-architecture',
    ]);
    expect(discoveryLinks.every((link) => link.tagName === 'A')).toBe(true);
    expect(root.querySelector('.discovery-feature a a')).toBeNull();
    expect(root.querySelector('.discovery-feature[tabindex]')).toBeNull();
    expect(root.querySelectorAll('#paths .card-link')).toHaveLength(3);
    expect(root.querySelector('a[href*="/bff/author/previews"]')).toBeNull();
    expect(root.querySelector('#hero-count')).toBeNull();
    expect(root.querySelector('.landing-footer a[href="/delivery-plan"]')).toBeNull();
    expect(root.querySelector('.discovery-feature a')?.getAttribute('href')).toBe(
      '/blaze/design-systems',
    );
    expect(root.textContent).toContain('Audio and video are planned');
    expect(root.textContent).toContain('Standalone clone-and-run repositories are in preparation');
    fixture.destroy();
  });

  it('opens each direction card with its scene inside one link and no nested controls', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('#paths .card')].map((card) => {
      expect(card.querySelectorAll('a')).toHaveLength(1);
      return card.querySelector('a')!;
    });

    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/learn', '/grow', '/blaze']);
    expect(links.map((link) => link.querySelector('.number')?.textContent)).toEqual([
      'Learn',
      'Grow',
      'Blaze',
    ]);
    expect(links.map((link) => link.querySelector('app-card-scene')?.getAttribute('src'))).toEqual([
      '/assets/scenes/landing/learn.svg',
      '/assets/scenes/landing/grow.svg',
      '/assets/scenes/landing/blaze.svg',
    ]);
    for (const link of links) {
      expect(link.firstElementChild?.tagName).toBe('APP-CARD-SCENE');
      expect(link.querySelector('.la-card-scene')?.getAttribute('role')).toBe('img');
      expect(link.querySelector('.la-card-scene')?.getAttribute('aria-label')).toBeTruthy();
      expect(link.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
      expect(link.querySelector('.card-action')).not.toBeNull();
    }
    fixture.destroy();
  });

  it('keeps each direction card scene above its text at every card width', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    // Component styles are emitted as <style> elements; read them as written (user, 2026-10-16:
    // the cards must look the same on every monitor).
    const css = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.home-paths\[[^\]]+\] \.direction-scene\[[^\]]+\] \{ --card-scene-ratio: 16 \/ 9;/);
    expect(css).not.toMatch(/@container[^{]*\{[^@]*\.direction-scene[^{]*\{[^}]*order:/);
    fixture.destroy();
  });

  /** The emitted styles of the Home components (page, hero card, challenge, pricing), whitespace collapsed. */
  function homeStyles(): string[] {
    const markers = ['.hero-stage[', '.hv-paths[', '.practice-disclosure[', '.home-pricing['];
    return [...document.querySelectorAll('style')]
      .map((style) => (style.textContent ?? '').replace(/\s+/g, ' '))
      .filter((css) => markers.some((marker) => css.includes(marker)));
  }

  it('sizes the hero to the window below the header so the chapter strip stays above the fold', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const css = homeStyles().join('\n');
    // DLV-803: the stage fills the window below the 85px header (a floor, so taller content grows
    // the hero instead of clipping it), capped near a balanced card on a large monitor.
    expect(css).toContain('--home-header-height: 85px;');
    expect(css).toMatch(
      /\.hero-stage\[[^\]]+\] \{ display: flex; flex-direction: column; min-height: min\( ?calc\(100svh - var\(--home-header-height\) - var\(--home-top-pad\) - var\(--home-fold-gap\)\), calc\(44cqi \+ 140px\) ?\); \}/,
    );
    expect(css).not.toContain('calc(100svh - 128px)');
    // The slide takes the stage's height; no vh-based slide minimum pushes the strip down on a
    // wide screen (the light theme keeps its minimum only where the slides stack).
    expect(css).toMatch(/\.hero-slide\[[^\]]+\] \{ grid-area: 1\/1; [^}]*min-height: 0;/);
    expect(css).toMatch(
      /@media \(max-width: 1099px\) \{ :root:not\(\[data-theme=\\?"dark\\?"\]\)[^{]*\.hero-slide\[[^\]]+\] \{ min-height: clamp\(400px, calc\(100svh - 410px\), 720px\); \} \}/,
    );
    // Vertical rhythm and the card's padding follow the window height.
    expect(css).toMatch(/\.hero-visual\[[^\]]+\] \{[^}]*padding: clamp\(18px, min\(2\.6vw, 2\.6svh\), 44px\);/);
    expect(css).toMatch(/\.carousel-footer\[[^\]]+\] \{[^}]*margin-top: clamp\(8px, 1\.4svh, 28px\);/);
    fixture.destroy();
  });

  it('lets each hero card shrink its flexible part on a short window instead of overflowing', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const css = homeStyles().join('\n');
    expect(css).toMatch(/--hv-gap: clamp\(8px, min\(3cqi, 1\.2svh\), 22px\);/);
    expect(css).toMatch(/\.hv-chart\[[^\]]+\] \{[^}]*min-height: min\(clamp\(110px, 26cqi, 260px\), 18svh\);/);
    // The latency sketch fills the room it is given rather than its 3:1 drawing height.
    expect(css).toMatch(/\.hv-chart-art\[[^\]]+\] \{[^}]*flex: 1 1 0;[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.hv-queue\[[^\]]+\] \{[^}]*min-height: min\(clamp\(84px, 18cqi, 190px\), 10svh\);/);
    expect(css).toMatch(/\.hv-window\[[^\]]+\] \{[^}]*min-height: min\(clamp\(96px, 22cqi, 200px\), 10svh\);/);
    // A small laptop gives the card half the row so its rows wrap less.
    expect(css).toMatch(
      /@media \(min-width: 1100px\) and \(max-width: 1399px\) \{ \.hero-slide\[[^\]]+\] \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \} \}/,
    );
    fixture.destroy();
  });

  it('gives the hero headlines a rem base so browser zoom enlarges them', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const css = homeStyles().join('\n');
    expect(css).toMatch(
      /\.slide-title\[[^\]]+\] \{ font: 800 clamp\(2\.25rem, min\(3\.0625rem \+ 2\.5cqi, 10\.6cqi\), 6\.75rem\)\/1\.02 system-ui/,
    );
    expect(css).toMatch(/\.discovery-framing\[[^\]]+\] \{ font: 750 clamp\(22px, 1\.05rem \+ 0\.875vw, 32px\)\/1\.2/);
    expect(css).toMatch(/\.hero-copy\[[^\]]+\] \.lead\[[^\]]+\] \{ font-size: clamp\(1rem, 0\.8rem \+ 1\.1cqi, 1\.3125rem\);/);
    expect(css).not.toContain('10.2cqi');
    fixture.destroy();
  });

  it('never sizes Home text with a bare viewport or container term', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const styles = homeStyles();
    expect(styles.length).toBeGreaterThanOrEqual(4);
    const fluid = /\d(?:vw|vh|svh|dvh|lvh|vmin|vmax|cqi|cqw|cqh)\b/;
    const offenders: string[] = [];
    let checked = 0;
    for (const css of styles) {
      for (const [, value] of css.matchAll(/(?:^|[;{\s])font(?:-size)?:\s*([^;}]+)/g)) {
        if (!fluid.test(value)) continue;
        checked++;
        // Every clamp's preferred (middle) term must carry a rem base when it scales with the
        // window or the card: a bare 10cqi stays the same rendered size at any zoom level.
        for (const middle of clampPreferredTerms(value)) {
          if (fluid.test(middle) && !/rem\b/.test(middle)) offenders.push(value.trim());
        }
        if (!/clamp\(/.test(value) && !/rem\b/.test(value)) offenders.push(value.trim());
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
    fixture.destroy();
  });

  it('reads nested clamp terms without backtracking and ignores incomplete values', () => {
    expect(clampPreferredTerms('clamp(1rem, min(2rem + 3cqi, calc(4rem + 2vw)), 5rem)'))
      .toEqual(['min(2rem + 3cqi, calc(4rem + 2vw))']);
    expect(clampPreferredTerms('clamp(1rem, 10cqi, 3rem) clamp(1rem, 1rem + 2vw, 4rem)'))
      .toEqual(['10cqi', '1rem + 2vw']);
    expect(clampPreferredTerms('clamp(1rem, min(2cqi, 3rem)')).toEqual([]);
  });

  it('centres every Home section in the shared fixed-width page frame', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const css = homeStyles().join('\n');
    // DLV-803 (user, 2026-10-16): a centred, fixed-width page; side margins grow on a big monitor.
    expect(css).toMatch(
      /main\.landing-page\[[^\]]+\] > \*\[[^\]]+\] \{ max-width: var\(--page-max-browse, 80rem\); margin-inline: auto; \}/,
    );
    expect(css).toMatch(/--home-frame: min\(100%, var\(--site-frame-max, 100rem\)\);/);
    expect(css).toMatch(
      /width: calc\(var\(--home-frame\) - var\(--reader-sidebar-space\)\) !important; max-width: none !important; margin-inline: calc\(var\(--home-frame-inset\) \+ var\(--reader-sidebar-space\)\) auto !important;/,
    );
    // The nav column and the gutters stop growing at the frame width.
    expect(css).toContain('--reader-sidebar-space: clamp(256px, 17vw, 17rem);');
    expect(css).toContain('--home-gutter: clamp(20px, 3vw, 3rem);');
    expect(css).not.toContain('76vw');
    fixture.destroy();
  });

  it('shows a labelled scene on every Keep exploring card and loads scenes from app assets', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const http = TestBed.inject(HttpTestingController);
    const cards = [...root.querySelectorAll<HTMLElement>('.discovery-feature')];

    expect(cards.map((card) => card.querySelector('app-card-scene')?.getAttribute('src'))).toEqual([
      '/assets/scenes/landing/system-design.svg',
      '/assets/scenes/landing/topic-workbench.svg',
      '/assets/scenes/landing/study-plan.svg',
      '/assets/scenes/landing/project-guides.svg',
    ]);
    for (const card of cards) {
      expect(card.querySelector('.feature-topline svg')).toBeNull();
      expect(card.querySelector('.la-card-scene')?.getAttribute('aria-label')).toBeTruthy();
      expect(card.querySelectorAll('[data-card-primary]')).toHaveLength(1);
      expect(card.querySelector('.feature-availability')?.textContent?.trim()).toBeTruthy();
    }

    const scenes = [
      'learn',
      'grow',
      'blaze',
      'decision',
      'system-design',
      'topic-workbench',
      'study-plan',
      'project-guides',
    ];
    for (const name of scenes) {
      http
        .expectOne(`/assets/scenes/landing/${name}.svg`)
        .flush(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect class="${name}-x"/></svg>`,
        );
    }
    fixture.detectChanges();
    expect(root.querySelectorAll('.la-card-scene[data-state="ready"] svg')).toHaveLength(8);
    http.verify();
    fixture.destroy();
  });
});
