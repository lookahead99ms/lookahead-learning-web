import { LandingHeroVisual } from './landing-hero-visual';
import { LearningPrompt } from '../../core/platform-signature/learning-prompt';
import { PlatformSignature } from '../../core/platform-signature/platform-signature';
import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { EngineeringChallenge } from './engineering-challenge';
import { PlatformBrandIllustration } from '../../core/platform-brand/platform-brand-illustration';
import { PlatformBrand } from '../../core/platform-brand/platform-brand';
import { HomePricing } from './home-pricing/home-pricing';
import { CardScene } from '../../core/card-scene/card-scene';
import { PathTaglineId, pathTaglineText } from '../../content/path-taglines';
import { PathSceneTimeline } from './path-scene-timeline';

/** The path cards whose scenes share one timeline, in play order. */
const PATH_SCENES = ['learn', 'grow', 'blaze'] as const;
type PathScene = (typeof PATH_SCENES)[number];

/** One hero slide: its copy on the left, and which card to draw on the right. */
interface HeroSlide {
  visual: 'choose' | 'plan' | 'reason' | 'design' | 'build' | 'diagnose';
  /** The one word on the slide's chapter tab. */
  tab: string;
  label: string;
  eyebrow: string;
  lines: string[];
  description: string;
  action: string;
  route: string;
  fragment: string | undefined;
  query: Record<string, string>;
}

@Component({
  selector: 'app-landing',
  imports: [LandingHeroVisual, LearningPrompt, PlatformSignature, PlatformHeader, RouterLink, EngineeringChallenge, PlatformBrandIllustration, PlatformBrand, CardScene, HomePricing],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
/**
 * The homepage: a six-slide hero (copy on the left, a card on the right, chapter tabs as timers),
 * then the Learn / Grow / Blaze path cards, the engineering challenge, Keep exploring and the essence.
 */
export class Landing {
  protected readonly tagline = (id: PathTaglineId): string => pathTaglineText(id);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private animations: Animation[] = [];
  private transitionId = 0;
  private resumedWhileFocused = false;
  @ViewChild('heroSlides') private heroSlides?: ElementRef<HTMLElement>;
  protected readonly activeSlide = signal(0);
  protected readonly outgoingSlide = signal<number | null>(null);
  protected readonly reducedMotion = signal(false);
  /** The visitor stopped the slideshow with the pause button. */
  protected readonly paused = signal(false);
  /** Keyboard focus is inside the hero (APG carousel: rotation stops while a keyboard user is in it). */
  protected readonly focusHold = signal(false);
  protected readonly pageHidden = signal(false);
  private readonly ready = signal(false);
  /** Each slide plays for 6 s; the chapter tab's progress bar is the timer. */
  protected readonly slideMs = 6000;
  protected readonly rotationHeld = computed(
    () => this.paused() || this.focusHold() || this.reducedMotion(),
  );
  protected readonly playing = computed(
    () => this.ready() && !this.rotationHeld() && !this.pageHidden(),
  );
  /** The visitor paused the path-card scenes with the toggle. */
  protected readonly scenesPaused = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private sceneTimeline: PathSceneTimeline<PathScene> | undefined;
  protected readonly slides: readonly HeroSlide[] = [
    {
      visual: 'choose',
      tab: 'Choose',
      label: 'Choose your path',
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
      visual: 'plan',
      tab: 'Plan',
      label: 'Plan your weeks',
      eyebrow: 'Ambition, with room for real life',
      lines: ['A clear route through', 'everything you want', 'to become.'],
      description:
        'Turn broad ambition into a workable week. Bring foundations, production practice, design, and leadership into one learning plan.',
      action: 'Shape my study plan',
      route: '/study-plan',
      fragment: undefined,
      query: {},
    },
    {
      visual: 'reason',
      tab: 'Reason',
      label: 'Reasoning in code',
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
      visual: 'design',
      tab: 'Design',
      label: 'From queue to design',
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
      visual: 'build',
      tab: 'Build',
      label: 'Build AI projects',
      eyebrow: 'AI Builds',
      lines: ['AI is part of your toolkit.', 'It does the heavy lifting. You make the call.'],
      description:
        'Let AI automate the routine work and find patterns in your data, like flagging possible fraud, while you design the system and decide what ships. Guided projects in Java and Python.',
      action: 'Explore AI Builds',
      route: '/blaze/ai-systems-architecture',
      fragment: undefined,
      query: {},
    },
    {
      visual: 'diagnose',
      tab: 'Diagnose',
      label: 'Diagnose a slowdown',
      eyebrow: 'For the conversations that raise the bar',
      lines: ['Practice the decisions', 'behind the title.'],
      description:
        'Go beyond recalling answers. Rehearse production judgment, explain system-design trade-offs, and connect technical choices to leadership.',
      action: 'Find a scenario to practice',
      route: '/search',
      fragment: undefined,
      query: { kind: 'practice', format: 'debug' },
    },
  ];

  constructor() {
    afterNextRender(() => {
      const view = this.document.defaultView;
      const motion = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(motion?.matches ?? false);
      this.pageHidden.set(this.document.hidden);
      const timeline = this.startSceneTimeline(motion?.matches ?? false);
      const visibilityChanged = () => {
        if (this.document.hidden) this.settleTransition();
        this.pageHidden.set(this.document.hidden);
        timeline.setStopped('hidden', this.document.hidden);
      };
      const motionChanged = (event: MediaQueryListEvent) => {
        this.reducedMotion.set(event.matches);
        timeline.setStopped('reduced-motion', event.matches);
        this.settleTransition();
      };
      this.document.addEventListener('visibilitychange', visibilityChanged);
      motion?.addEventListener('change', motionChanged);
      this.destroyRef.onDestroy(() => {
        this.document.removeEventListener('visibilitychange', visibilityChanged);
        motion?.removeEventListener('change', motionChanged);
      });
      this.ready.set(true);
      this.scrollToSection();
    });
    this.destroyRef.onDestroy(() => {
      this.settleTransition();
      this.sceneTimeline?.destroy();
    });
  }

  /**
   * Arriving at /#pricing (the lock screen's See pricing) or /#paths opens that section. It waits
   * a frame because the router's scroll restoration moves to the top after the navigation.
   */
  private scrollToSection(): void {
    const id = this.document.location?.hash.slice(1);
    if (id !== 'pricing' && id !== 'paths') return;
    const view = this.document.defaultView;
    const scroll = () => {
      const target = this.document.getElementById(id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'start' });
    };
    view?.setTimeout(() => view.requestAnimationFrame(scroll), 0);
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
      const observer = new View((entries) => {
        for (const entry of entries) timeline.setStopped('offscreen', !entry.isIntersecting);
      });
      observer.observe(paths);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
    timeline.start();
    return timeline;
  }

  protected showSlide(index: number): void {
    const count = this.slides.length;
    const next = (index + count) % count;
    const previous = this.activeSlide();
    if (next === previous) return;
    this.settleTransition();
    this.activeSlide.set(next);
    this.animateTransition(previous, next);
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
    const timing = { duration: 300, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' as const };
    this.outgoingSlide.set(previous);
    this.animations = [
      outgoing.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      incoming.animate([{ opacity: 0 }, { opacity: 1 }], timing),
    ];
    // A cancelled transition must never settle a newer navigation.
    void Promise.all(this.animations.map((animation) => animation.finished))
      .then(() => this.completeTransition(transitionId))
      .catch(() => {});
  }

  /** The pause button: an explicit stop, or an explicit start that also lifts a keyboard-focus hold. */
  protected toggleRotation(): void {
    if (this.reducedMotion()) return;
    if (this.rotationHeld()) {
      // Starting again while keyboard focus held it keeps it playing until focus leaves the hero.
      this.resumedWhileFocused = this.focusHold();
      this.paused.set(false);
      this.focusHold.set(false);
    } else {
      this.paused.set(true);
    }
  }

  /** Keyboard focus inside the hero holds the rotation; pointer clicks and hover never do. */
  protected heroFocusIn(event: FocusEvent): void {
    if (this.resumedWhileFocused) return;
    const target = event.target as HTMLElement | null;
    let keyboard = false;
    try {
      keyboard = !!target?.matches(':focus-visible');
    } catch {
      keyboard = true;
    }
    if (keyboard) this.focusHold.set(true);
  }

  protected heroFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) return;
    this.focusHold.set(false);
    this.resumedWhileFocused = false;
  }

  /** Chapter tabs and arrows jump to a slide; the slideshow keeps playing from there. */
  protected goTo(index: number): void {
    this.showSlide(index);
  }

  /** The active chapter's progress bar finished filling: advance (the bar is the timer). */
  protected chapterDone(index: number, event: AnimationEvent): void {
    if (event.target !== event.currentTarget) return;
    if (index !== this.activeSlide() || !this.playing()) return;
    this.showSlide(index + 1);
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
}
