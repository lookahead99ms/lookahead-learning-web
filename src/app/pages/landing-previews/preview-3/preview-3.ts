import { LearningPrompt } from '../../../core/platform-signature/learning-prompt';
import { PlatformSignature } from '../../../core/platform-signature/platform-signature';
import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../../core/platform-header/platform-header';
import { EngineeringChallenge } from '../../landing/engineering-challenge';
import { PlatformBrandIllustration } from '../../../core/platform-brand/platform-brand-illustration';
import { PlatformBrand } from '../../../core/platform-brand/platform-brand';
import { CardScene } from '../../../core/card-scene/card-scene';
import { PathTaglineId, pathTaglineText } from '../../../content/path-taglines';

/** Each hero slide stays on screen this long while the slideshow plays (DLV-937: 4 s, was 6 s). */
const SLIDE_MS = 4000;
/** The cross-fade between slides (DLV-937: quicker than the 420 ms on the live page). */
const FADE_MS = 280;

@Component({
  selector: 'app-landing-preview-3',
  imports: [LearningPrompt, PlatformSignature, PlatformHeader, RouterLink, EngineeringChallenge, PlatformBrandIllustration, PlatformBrand, CardScene],
  templateUrl: './preview-3.html',
  styleUrl: './preview-3.css',
})
/** DLV-937 landing preview 3: a redesign candidate on /preview/landing/3; the live home page is unchanged. */
export class LandingPreview3 {
  protected readonly tagline = (id: PathTaglineId): string => pathTaglineText(id);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private animations: Animation[] = [];
  private transitionId = 0;
  /** Time left on the current slide; a pause keeps it, so play resumes where the bar stopped. */
  private remaining = SLIDE_MS;
  private startedAt = 0;
  private running = false;
  private progress: Animation | undefined;
  /** The pause came from keyboard focus entering the slideshow, not from the pause button. */
  private focusPaused = false;
  @ViewChild('heroSlides') private heroSlides?: ElementRef<HTMLElement>;
  @ViewChild('heroCarousel') private heroCarousel?: ElementRef<HTMLElement>;
  protected readonly activeSlide = signal(0);
  protected readonly outgoingSlide = signal<number | null>(null);
  protected readonly reducedMotion = signal(false);
  protected readonly paused = signal(false);
  protected readonly slides = [
    {
      name: 'Pathfinder',
      eyebrow: 'For the engineer deciding where to begin',
      lines: ['Become the engineer', 'you can explain.'],
      description:
        'Move from understanding a concept to applying it, defending a decision, and knowing what to practice next.',
      action: 'Choose a learning path',
      route: '/',
      fragment: 'paths',
      query: {},
    },
    {
      name: 'Decision Room',
      eyebrow: 'For the conversations that raise the bar',
      lines: ['Practice the decisions', 'behind the title.'],
      description:
        'Go beyond recalling answers. Rehearse production judgment, explain system-design trade-offs, and connect technical choices to leadership.',
      action: 'Find a scenario to practice',
      route: '/search',
      fragment: undefined,
      query: { kind: 'practice', format: 'debug' },
    },
    {
      name: 'Fieldnotes',
      eyebrow: 'Follow a better question',
      lines: ['Good answers', 'begin with', 'better thinking.'],
      description:
        'A field guide to the models, failures, and trade-offs behind confident engineering. Read deeply. Try the idea. Explain what changed.',
      action: 'Find a question worth exploring',
      route: '/search',
      fragment: undefined,
      query: {},
    },
    {
      name: 'Build Studio',
      eyebrow: 'For engineers who learn by doing',
      lines: ['Read the idea.', 'Run the system.', 'Own the decision.'],
      description:
        'Practice in code, inspect execution, and build complete AI applications. Then connect the implementation to the judgment behind it.',
      action: 'Explore hands-on practice',
      route: '/learn/hands-on-dsa',
      fragment: undefined,
      query: {},
    },
    {
      name: 'Journey Atlas',
      eyebrow: 'Ambition, with room for real life',
      lines: ['A clear route through', 'everything you want', 'to become.'],
      description:
        'Turn broad ambition into a workable week. Bring foundations, production practice, design, and leadership into one learning plan.',
      action: 'Shape my study plan',
      route: '/study-plan',
      fragment: undefined,
      query: {},
    },
  ];
  protected readonly windowExample =
    'left = 0\nfor right in range(len(values)):\n    # Maintain the valid window\n    while window_is_invalid():\n        left += 1';

  constructor() {
    afterNextRender(() => {
      const view = this.document.defaultView;
      const motion = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(motion?.matches ?? false);
      this.paused.set(motion?.matches ?? false);
      const visibilityChanged = () => {
        if (this.document.hidden) this.settleTransition();
        this.syncRotation();
      };
      const motionChanged = (event: MediaQueryListEvent) => {
        this.reducedMotion.set(event.matches);
        if (event.matches) this.paused.set(true);
        this.settleTransition();
        this.syncRotation();
      };
      this.document.addEventListener('visibilitychange', visibilityChanged);
      motion?.addEventListener('change', motionChanged);
      this.destroyRef.onDestroy(() => {
        this.document.removeEventListener('visibilitychange', visibilityChanged);
        motion?.removeEventListener('change', motionChanged);
      });
      this.syncRotation();
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.timer);
      this.progress?.cancel();
      this.settleTransition();
    });
  }

  /** Goes to a slide and gives it a full 4 s. Choosing a slide does not pause the slideshow. */
  protected showSlide(index: number): void {
    const next = (index + this.slides.length) % this.slides.length;
    const previous = this.activeSlide();
    this.resetProgress();
    if (next !== previous) {
      this.settleTransition();
      this.activeSlide.set(next);
      this.animateTransition(previous, next);
    }
    this.syncRotation();
  }

  private settleTransition(): void {
    this.transitionId++;
    this.outgoingSlide.set(null);
    const animations = this.animations;
    this.animations = [];
    animations.forEach((animation) => animation.cancel());
  }

  // A naturally finished dissolve leaves the outgoing slide at opacity zero.
  // Cancelling it here would briefly restore opacity one before that slide is
  // hidden, producing a visible flash. Clear tracking without cancelling.
  private completeTransition(transitionId: number): void {
    if (transitionId !== this.transitionId) return;
    this.outgoingSlide.set(null);
    this.animations = [];
  }

  private animateTransition(previous: number, next: number): void {
    if (this.reducedMotion() || this.document.hidden) return;
    const slides = this.heroSlides?.nativeElement.querySelectorAll<HTMLElement>('.hero-slide');
    const outgoing = slides?.[previous];
    const incoming = slides?.[next];
    if (!outgoing?.animate || !incoming?.animate) return;
    const transitionId = this.transitionId;
    const timing = { duration: FADE_MS, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' as const };
    this.outgoingSlide.set(previous);
    this.animations = [
      outgoing.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      incoming.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'none' },
        ],
        timing,
      ),
    ];
    // A cancelled transition must never settle a newer navigation.
    void Promise.all(this.animations.map((animation) => animation.finished))
      .then(() => this.completeTransition(transitionId))
      .catch(() => {});
  }

  /** The explicit pause / play button. */
  protected toggleRotation(): void {
    if (this.reducedMotion()) return;
    this.focusPaused = false;
    this.paused.update((paused) => !paused);
    this.syncRotation();
  }

  /**
   * Keyboard focus inside the slideshow pauses it (WCAG 2.2.2); pointer hover and clicks do not.
   * A mouse click focuses a button without :focus-visible, so it never pauses here.
   */
  protected focusEntered(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.paused() || !target?.matches?.(':focus-visible')) return;
    this.focusPaused = true;
    this.paused.set(true);
    this.syncRotation();
  }

  /** Leaving the slideshow with the keyboard resumes it, unless the visitor chose pause. */
  protected focusLeft(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!this.focusPaused || (next && this.heroCarousel?.nativeElement.contains(next))) return;
    this.focusPaused = false;
    this.paused.set(false);
    this.syncRotation();
  }

  protected choosePath(event: Event, fragment?: string): void {
    if (!fragment) return;
    const mouse = event as MouseEvent;
    if (mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.altKey || mouse.button > 0)
      return;
    event.preventDefault();
    const target = this.document.getElementById(fragment);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
    this.document.defaultView?.history.replaceState(
      this.document.defaultView.history.state,
      '',
      `/#${fragment}`,
    );
  }

  /** Starts, resumes or holds the slide timer and its progress bar to match the current state. */
  private syncRotation(): void {
    const canPlay = !this.paused() && !this.reducedMotion() && !this.document.hidden;
    if (canPlay && !this.running) this.startTimer();
    else if (!canPlay && this.running) this.holdTimer();
  }

  private startTimer(): void {
    this.running = true;
    this.startedAt = Date.now();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.running = false;
      this.showSlide(this.activeSlide() + 1);
    }, this.remaining);
    if (this.progress) {
      this.progress.play();
      return;
    }
    const fill = this.host.nativeElement.querySelectorAll<HTMLElement>('.progress-fill')[
      this.activeSlide()
    ];
    if (!fill?.animate) return;
    this.progress = fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: SLIDE_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    this.progress.currentTime = SLIDE_MS - this.remaining;
  }

  private holdTimer(): void {
    clearTimeout(this.timer);
    this.running = false;
    this.remaining = Math.max(0, this.remaining - (Date.now() - this.startedAt));
    this.progress?.pause();
  }

  private resetProgress(): void {
    clearTimeout(this.timer);
    this.running = false;
    this.remaining = SLIDE_MS;
    this.progress?.cancel();
    this.progress = undefined;
  }
}
