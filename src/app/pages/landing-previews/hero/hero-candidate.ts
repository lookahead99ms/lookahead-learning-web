import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformSignature } from '../../../core/platform-signature/platform-signature';
import { LandingHeroVisual } from '../../landing/landing-hero-visual';

/** One hero direction, written short: a two-line title and a one-sentence lead. */
export interface HeroPreviewSlide {
  visual: 'choose' | 'plan' | 'reason' | 'design' | 'build' | 'diagnose';
  /** The one-word chip. */
  tab: string;
  /** A small glyph in front of the chip's word; decorative, read to no one. */
  symbol: string;
  /** Two or three words under the chip. */
  short: string;
  title: [string, string];
  lead: string;
  action: string;
  /** The paths section of the home page, or a router route. */
  paths?: true;
  route?: string;
  query?: Record<string, string>;
}

/** The six directions with roughly half the words of the current hero (user, 2026-10-29). */
export const HERO_PREVIEW_SLIDES: readonly HeroPreviewSlide[] = [
  {
    visual: 'choose',
    tab: 'Choose',
    symbol: '◇',
    short: 'Pick a path',
    title: ['Become the engineer', 'you can explain.'],
    lead: 'Understand it, apply it, defend the decision.',
    action: 'Choose a path',
    paths: true,
  },
  {
    visual: 'plan',
    tab: 'Plan',
    symbol: '▤',
    short: 'Plan your weeks',
    title: ['Your week,', 'planned.'],
    lead: 'Foundations, practice, design and leadership in one plan.',
    action: 'Shape my plan',
    route: '/study-plan',
  },
  {
    visual: 'reason',
    tab: 'Reason',
    symbol: '{ }',
    short: 'Run the code',
    title: ['Read the idea.', 'Run the system.'],
    lead: 'Practice in code and inspect what actually runs.',
    action: 'Practice hands-on',
    route: '/learn/hands-on-dsa',
  },
  {
    visual: 'design',
    tab: 'Design',
    symbol: '⬡',
    short: 'Think in trade-offs',
    title: ['Better questions,', 'better designs.'],
    lead: 'The models, failures and trade-offs behind confident design.',
    action: 'Explore system design',
    route: '/search',
  },
  {
    visual: 'build',
    tab: 'Build',
    symbol: '▲',
    short: 'Ship with AI',
    title: ['AI does the heavy lifting.', 'You make the call.'],
    lead: 'Guided AI projects in Java and Python.',
    action: 'Explore AI Builds',
    route: '/blaze/ai-systems-architecture',
  },
  {
    visual: 'diagnose',
    tab: 'Diagnose',
    symbol: '◉',
    short: 'Fix production',
    title: ['Practice the decisions', 'behind the title.'],
    lead: 'Production judgment and trade-offs, rehearsed.',
    action: 'Find a scenario',
    route: '/search',
    query: { kind: 'practice', format: 'debug' },
  },
];

export type HeroVariantId = 1 | 2 | 3 | 4 | 5;

export interface HeroPreviewVariant {
  id: HeroVariantId;
  name: string;
  summary: string;
  /** What changes beyond the layout, so the comparison is honest. */
  palette: string;
}

export const HERO_PREVIEW_VARIANTS: readonly HeroPreviewVariant[] = [
  {
    id: 1,
    name: 'Calm editorial',
    summary:
      'No slideshow. One headline, one sentence, two buttons, the Choose card at half size and the six directions as a quiet link row.',
    palette: 'Current teal; more white space, thinner rules.',
  },
  {
    id: 2,
    name: 'Accent panel',
    summary:
      'The hero sits on one soft indigo-to-teal panel. Six chips switch the slide by hand; nothing moves on its own.',
    palette: 'Adds an indigo accent next to the brand teal.',
  },
  {
    id: 3,
    name: 'Centered focus',
    summary:
      'A centered two-line headline, one sentence and one button. The six directions become small cards; no hero card at all.',
    palette: 'Current teal on paper; one warm amber highlight.',
  },
  {
    id: 4,
    name: 'Carousel, trimmed',
    summary:
      'Keeps the rotating slides, but the title is about half its current size, the eyebrow is gone, the lead is one sentence and the card is narrower.',
    palette: 'Current palette, unchanged.',
  },
  {
    id: 5,
    name: 'Night statement',
    summary:
      'A dark navy hero with a short headline, one sentence, two buttons and three proof points in a glass strip. Chips switch the card.',
    palette: 'Navy canvas with teal and mint highlights.',
  },
];

/** What the home page shows: a candidate preview, the previous carousel ('classic', at /preview/hero/0), or null for the served hero. */
export type HeroSelection = HeroVariantId | 'classic' | null;

/** Parses a route parameter: 1 to 5 preview a candidate, 0 keeps the previous carousel, anything else is the served hero. */
export function heroVariantFrom(value: string | null): HeroSelection {
  if (value === '0') return 'classic';
  const id = Number(value);
  return Number.isInteger(id) && id >= 1 && id <= 5 ? (id as HeroVariantId) : null;
}

/**
 * One of five hero candidates for the home page (user, 2026-10-29: the current hero has too much
 * and too large text). The home page renders it in place of its own hero on /preview/hero/N, so
 * every other section and control on the page is the real thing. Candidate 5 was chosen on
 * 2026-10-30 and is what the home page serves (theme-aware); the previous carousel stays at
 * /preview/hero/0 for comparison.
 */
@Component({
  selector: 'app-hero-candidate',
  imports: [RouterLink, PlatformSignature, LandingHeroVisual],
  templateUrl: './hero-candidate.html',
  styleUrl: './hero-candidate.css',
  host: { '[attr.data-variant]': 'variant()' },
})
export class HeroCandidate {
  readonly variant = input.required<HeroVariantId>();
  /** A preview shows the comparison bar above the hero; the served home page does not. */
  readonly preview = input(false);
  /**
   * The night statement's surface: 'night' keeps the navy canvas in both themes; 'auto' follows the
   * page theme, so in light mode the hero sits on a light panel like the rest of the page and only
   * its card stays dark (user, 2026-10-30: the alternative to one dark block on a light page).
   */
  readonly tone = input<'night' | 'auto'>('night');
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly variants = HERO_PREVIEW_VARIANTS;
  protected readonly slides = HERO_PREVIEW_SLIDES;
  protected readonly info = computed(() => this.variants.find((item) => item.id === this.variant())!);
  protected readonly active = signal(0);
  protected readonly current = computed(() => this.slides[this.active()]);
  protected readonly reducedMotion = signal(false);
  /** The visitor is pointing at or inside the carousel, or pressed pause. */
  protected readonly held = signal(false);
  protected readonly pausedByButton = signal(false);
  protected readonly proofPoints = ['Six directions', 'Java, Python and Go', 'Plans by the week'];
  /** Candidates 4 and 5 rotate on their own (user, 2026-10-29: the night statement should play too). */
  protected readonly rotates = computed(() => this.variant() === 4 || this.variant() === 5);
  /** The fill animation is the six-second timer; it stands still while the hero is held or paused. */
  protected readonly heldAttr = computed(() => (this.held() || this.pausedByButton() ? '' : null));

  constructor() {
    afterNextRender(() => {
      const view = this.document.defaultView;
      const motion = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(motion?.matches ?? false);
      const onMotion = (event: MediaQueryListEvent) => this.reducedMotion.set(event.matches);
      motion?.addEventListener?.('change', onMotion);
      this.destroyRef.onDestroy(() => motion?.removeEventListener?.('change', onMotion));
    });
  }

  protected goTo(index: number): void {
    const count = this.slides.length;
    this.active.set(((index % count) + count) % count);
  }

  /**
   * The active chip's fill finished: advance (the fill is the timer, as on the home page, so a
   * hold never leaves the bar and the slide out of step). Fires only on the fill's own animation.
   */
  protected fillDone(index: number, event: AnimationEvent): void {
    if (event.target !== event.currentTarget) return;
    if (index !== this.active() || !this.rotates()) return;
    if (this.held() || this.pausedByButton() || this.reducedMotion()) return;
    this.goTo(index + 1);
  }

  protected hold(on: boolean): void {
    this.held.set(on);
  }

  protected togglePause(): void {
    this.pausedByButton.update((value) => !value);
  }

  /**
   * "Choose a path" opens the paths section. On the home page it is further down the same page, so
   * the link scrolls there like the real hero does; anywhere else it opens the home page's section.
   */
  protected openPaths(event: Event): void {
    const target = this.document.getElementById('paths');
    if (!target) return; // the plain href /#paths navigates
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'start', behavior: this.reducedMotion() ? 'auto' : 'smooth' });
  }
}
