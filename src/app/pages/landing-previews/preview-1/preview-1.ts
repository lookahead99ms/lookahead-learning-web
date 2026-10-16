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
  computed,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../../core/platform-header/platform-header';
import { EngineeringChallenge } from '../../landing/engineering-challenge';
import { PlatformBrandIllustration } from '../../../core/platform-brand/platform-brand-illustration';
import { PlatformBrand } from '../../../core/platform-brand/platform-brand';
import { CardScene } from '../../../core/card-scene/card-scene';
import { PathTaglineId, pathTaglineText } from '../../../content/path-taglines';
import { PathSceneTimeline } from '../../landing/path-scene-timeline';

/** Preview 1 hero timing: each slide stays 4 s, and the dissolve between slides is quick. */
const SLIDE_MS = 4000;
const TRANSITION_MS = 280;

/** The path cards whose scenes share one timeline, in play order. */
const PATH_SCENES = ['learn', 'grow', 'blaze'] as const;
type PathScene = (typeof PATH_SCENES)[number];

@Component({
  selector: 'app-landing-preview-1',
  imports: [LearningPrompt, PlatformSignature, PlatformHeader, RouterLink, EngineeringChallenge, PlatformBrandIllustration, PlatformBrand, CardScene],
  templateUrl: './preview-1.html',
  styleUrl: './preview-1.css',
})
/** DLV-937 landing preview 1: a redesign candidate on /preview/landing/1; the live home page is unchanged. */
export class LandingPreview1 {
  protected readonly tagline = (id: PathTaglineId): string => pathTaglineText(id);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private animations: Animation[] = [];
  private transitionId = 0;
  /** Why the slideshow is paused: keyboard focus inside it resumes on leaving; the button does not. */
  private pausedBy: 'focus' | 'user' | null = null;
  @ViewChild('heroSlides') private heroSlides?: ElementRef<HTMLElement>;
  protected readonly activeSlide = signal(0);
  protected readonly outgoingSlide = signal<number | null>(null);
  protected readonly reducedMotion = signal(false);
  protected readonly paused = signal(false);
  protected readonly documentHidden = signal(false);
  /** The slideshow is advancing; drives the progress bar fill so it restarts with the timer. */
  protected readonly rotating = computed(
    () => !this.paused() && !this.reducedMotion() && !this.documentHidden(),
  );
  /** The visitor paused the path-card scenes with the toggle. */
  protected readonly scenesPaused = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private sceneTimeline: PathSceneTimeline<PathScene> | undefined;
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
      this.documentHidden.set(this.document.hidden);
      const timeline = this.startSceneTimeline(motion?.matches ?? false);
      const visibilityChanged = () => {
        if (this.document.hidden) this.settleTransition();
        this.documentHidden.set(this.document.hidden);
        this.scheduleRotation();
        timeline.setStopped('hidden', this.document.hidden);
      };
      const motionChanged = (event: MediaQueryListEvent) => {
        this.reducedMotion.set(event.matches);
        timeline.setStopped('reduced-motion', event.matches);
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
      this.sceneTimeline?.destroy();
    });
  }

  protected toggleScenes(): void {
    if (this.reducedMotion()) return;
    this.scenesPaused.update((paused) => !paused);
    this.sceneTimeline?.setStopped('user', this.scenesPaused());
  }

  /**
   * Learn, Grow and Look Ahead share one timeline: all summaries, then the stories start 1 s apart.
   * The page drives each inlined SVG by toggling "<name>-play" (and "<name>-paused") on its root;
   * the story length comes from the SVG's data-story-ms. Runs only while the cards are on screen.
   */
  private startSceneTimeline(reduced: boolean): PathSceneTimeline<PathScene> {
    const root = this.host.nativeElement;
    const svg = (id: PathScene) =>
      root.querySelector<SVGSVGElement>(
        `#paths app-card-scene[src="/assets/scenes/landing/${id}.svg"] .la-card-scene-art > svg`,
      );
    const timeline = new PathSceneTimeline<PathScene>(PATH_SCENES, {
      play: (id) => {
        const scene = svg(id);
        if (!scene) return;
        scene.classList.remove(`${id}-play`, `${id}-paused`);
        void scene.getBoundingClientRect(); // restart the CSS animations from their first frame
        scene.classList.add(`${id}-play`);
      },
      hold: (id) => svg(id)?.classList.remove(`${id}-play`, `${id}-paused`),
      freeze: (id, frozen) => svg(id)?.classList.toggle(`${id}-paused`, frozen),
      duration: (id) => Number(svg(id)?.getAttribute('data-story-ms')) || null,
    });
    this.sceneTimeline = timeline;
    timeline.setStopped('reduced-motion', reduced);
    timeline.setStopped('hidden', this.document.hidden);
    const paths = root.querySelector('#paths');
    const View = this.document.defaultView?.IntersectionObserver;
    if (paths && View) {
      timeline.setStopped('offscreen', true);
      // Start the card stories only once the cards are mostly in view, so the hero stays the
      // one moving thing on the first screen.
      const observer = new View(
        (entries) => {
          for (const entry of entries)
            timeline.setStopped('offscreen', !entry.isIntersecting || entry.intersectionRatio < 0.3);
        },
        { threshold: [0, 0.3] },
      );
      observer.observe(paths);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
    timeline.start();
    return timeline;
  }

  protected showSlide(index: number): void {
    const next = (index + this.slides.length) % this.slides.length;
    const previous = this.activeSlide();
    if (next !== previous) {
      this.settleTransition();
      this.activeSlide.set(next);
      this.animateTransition(previous, next);
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
    const timing = {
      duration: TRANSITION_MS,
      easing: 'cubic-bezier(.22,.61,.36,1)',
      fill: 'both' as const,
    };
    this.outgoingSlide.set(previous);
    this.animations = [
      outgoing.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      incoming.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
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

  protected toggleRotation(): void {
    if (this.reducedMotion()) return;
    const pause = !this.paused();
    this.paused.set(pause);
    this.pausedBy = pause ? 'user' : null;
    if (pause) this.settleTransition();
    this.scheduleRotation();
  }

  /**
   * Only keyboard focus pauses the slideshow (a mouse click or hover never does), so a keyboard
   * user can read or act on a slide before it changes.
   */
  protected heroFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.paused() || !target?.matches?.(':focus-visible')) return;
    this.paused.set(true);
    this.pausedBy = 'focus';
    this.settleTransition();
    this.scheduleRotation();
  }

  /** Leaving the slideshow with the keyboard resumes it, unless the visitor pressed Pause. */
  protected heroFocusOut(event: FocusEvent): void {
    const carousel = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && carousel.contains(next)) return;
    if (this.pausedBy !== 'focus' || this.reducedMotion()) return;
    this.paused.set(false);
    this.pausedBy = null;
    this.scheduleRotation();
  }

  /** Dots and arrows move to a slide and restart its 4 s; they do not stop the slideshow. */
  protected selectSlide(index: number): void {
    this.showSlide(index);
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
    this.timer = setTimeout(() => this.showSlide(this.activeSlide() + 1), SLIDE_MS);
  }
}
