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
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-landing',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private animations: Animation[] = [];
  private transitionId = 0;
  @ViewChild('heroSlides') private heroSlides?: ElementRef<HTMLElement>;
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
  protected readonly panelTones = signal<Array<'light' | 'dark'>>(this.slides.map(() => 'light'));
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
        this.scheduleRotation();
      };
      const motionChanged = (event: MediaQueryListEvent) => {
        this.reducedMotion.set(event.matches);
        if (event.matches) this.paused.set(true);
        this.settleTransition();
        this.scheduleRotation();
      };
      this.document.addEventListener('visibilitychange', visibilityChanged);
      motion?.addEventListener('change', motionChanged);
      this.destroyRef.onDestroy(() => {
        this.document.removeEventListener('visibilitychange', visibilityChanged);
        motion?.removeEventListener('change', motionChanged);
      });
      this.scheduleRotation();
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.timer);
      this.settleTransition();
    });
  }

  protected showSlide(index: number): void {
    const next = (index + this.slides.length) % this.slides.length;
    const previous = this.activeSlide();
    if (next !== previous) {
      this.settleTransition();
      // Keep the outgoing panel's palette stable throughout its cross-fade.
      this.panelTones.update((tones) =>
        tones.map((tone, slideIndex) =>
          slideIndex === next ? (tones[previous] === 'light' ? 'dark' : 'light') : tone,
        ),
      );
      this.activeSlide.set(next);
      this.animateTransition(previous, next, index >= previous ? 1 : -1);
    }
    this.scheduleRotation();
  }

  private settleTransition(): void {
    this.transitionId++;
    this.outgoingSlide.set(null);
    const animations = this.animations;
    this.animations = [];
    animations.forEach((animation) => animation.cancel());
  }

  private animateTransition(previous: number, next: number, direction: number): void {
    if (this.reducedMotion() || this.document.hidden) return;
    const slides = this.heroSlides?.nativeElement.querySelectorAll<HTMLElement>('.hero-slide');
    const outgoing = slides?.[previous];
    const incoming = slides?.[next];
    const panel = incoming?.querySelector<HTMLElement>('.hero-visual');
    if (!outgoing?.animate || !incoming?.animate || !panel?.animate) return;
    const transitionId = this.transitionId;
    const timing = { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' as const };
    this.outgoingSlide.set(previous);
    this.animations = [
      outgoing.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      incoming.animate([{ opacity: 0 }, { opacity: 1 }], timing),
      panel.animate(
        [{ transform: `translateX(${direction * 16}px)` }, { transform: 'translateX(0)' }],
        { ...timing, easing: 'ease-out' },
      ),
    ];
    // A cancelled transition must never settle a newer navigation.
    void Promise.all(this.animations.map((animation) => animation.finished))
      .then(() => {
        if (transitionId === this.transitionId) this.settleTransition();
      })
      .catch(() => {});
  }

  protected toggleRotation(): void {
    if (this.reducedMotion()) return;
    this.paused.update((value) => !value);
    this.scheduleRotation();
  }

  protected focusHero(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.hero-copy, .hero-visual')) {
      this.paused.set(true);
      this.settleTransition();
      this.scheduleRotation();
    }
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

  private scheduleRotation(): void {
    clearTimeout(this.timer);
    if (this.paused() || this.reducedMotion() || this.document.hidden) return;
    this.timer = setTimeout(() => this.showSlide(this.activeSlide() + 1), 6000);
  }
}
