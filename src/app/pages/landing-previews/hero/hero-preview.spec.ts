import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../../content/content.service';
import { Landing } from '../../landing/landing';
import { HERO_PREVIEW_SLIDES, HERO_PREVIEW_VARIANTS, HeroCandidate, heroVariantFrom } from './hero-candidate';
import { LandingHeroPreview } from './hero-preview';

/** Hosts one candidate the way the home page does. */
@Component({
  imports: [HeroCandidate],
  template: '<app-hero-candidate [variant]="variant()" [preview]="true" /><section id="paths" tabindex="-1">Paths</section>',
})
class Host {
  readonly variant = signal<1 | 2 | 3 | 4 | 5>(1);
}

describe('Hero candidates for the home page', () => {
  let fixture: ComponentFixture<unknown>;
  let root: HTMLElement;
  let motion: EventTarget & { matches: boolean };

  async function render<T>(component: Type<T>, variant: string | null): Promise<ComponentFixture<T>> {
    motion = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', vi.fn(() => motion));
    await TestBed.configureTestingModule({
      imports: [component],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap(variant === null ? {} : { variant })),
            snapshot: { paramMap: convertToParamMap(variant === null ? {} : { variant }), data: {} },
          },
        },
      ],
    }).compileComponents();
    vi.useFakeTimers();
    const created = TestBed.createComponent(component);
    created.detectChanges();
    await created.whenStable();
    created.detectChanges();
    fixture = created;
    root = created.nativeElement as HTMLElement;
    return created;
  }

  /** The active tab's fill finished its six seconds (the animation is the timer). */
  function fillDone(): void {
    const fill = root.querySelector('.fill.run');
    fill?.dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
  }

  async function candidate(variant: 1 | 2 | 3 | 4 | 5): Promise<void> {
    const host = await render(Host, null);
    host.componentInstance.variant.set(variant);
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the six directions short: two title lines and a one-sentence lead each', () => {
    expect(HERO_PREVIEW_SLIDES).toHaveLength(6);
    for (const slide of HERO_PREVIEW_SLIDES) {
      expect(slide.title).toHaveLength(2);
      expect(slide.lead.split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(Boolean(slide.paths) !== Boolean(slide.route)).toBe(true);
    }
    expect(HERO_PREVIEW_VARIANTS.map((item) => item.id)).toEqual([1, 2, 3, 4, 5]);
    expect([null, '0', '6', 'x', '3'].map(heroVariantFrom)).toEqual([null, 'classic', null, null, 3]);
  });

  it('lists the five candidates on the index and links each one', async () => {
    await render(LandingHeroPreview, null);
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.variant-card')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      [1, 2, 3, 4, 5].map((id) => `/preview/hero/${id}`),
    );
    expect(root.querySelector('h1')?.textContent).toContain('Pick the hero');
  });

  for (const id of [1, 2, 3, 4, 5] as const) {
    it(`renders candidate ${id} with one h1, one primary action, no eyebrow and the preview bar`, async () => {
      await candidate(id);
      const hero = root.querySelector('app-hero-candidate')!;
      expect(hero.getAttribute('data-variant')).toBe(String(id));
      expect(hero.querySelectorAll('h1')).toHaveLength(1);
      expect(hero.querySelector('.preview-bar .bar-title')?.textContent).toContain(HERO_PREVIEW_VARIANTS[id - 1].name);
      expect(hero.querySelector(`.hero.v${id}`)).not.toBeNull();
      expect(hero.querySelectorAll('.btn.primary')).toHaveLength(1);
      expect(hero.querySelector('.hero .eyebrow')).toBeNull();
      expect(hero.querySelector('.preview-bar a[href="/"]')).not.toBeNull();
      expect(hero.querySelector('.preview-bar a[href="/preview/hero"]')).not.toBeNull();
    });
  }

  it('keeps one card per slide stacked in the same cell, so switching never changes the hero height (candidates 2, 4 and 5)', async () => {
    for (const id of [2, 4, 5] as const) {
      await candidate(id);
      const cards = [...root.querySelectorAll<HTMLElement>('.card-stack > app-landing-hero-visual')];
      expect(cards).toHaveLength(6);
      expect(cards.filter((card) => card.classList.contains('active'))).toHaveLength(1);
      expect(cards.filter((card) => card.getAttribute('aria-hidden') === 'true')).toHaveLength(5);
      expect(cards.filter((card) => card.hasAttribute('inert'))).toHaveLength(5);
      fixture.destroy();
      TestBed.resetTestingModule();
    }
  });

  it('scrolls to the paths section on the same page instead of leaving it', async () => {
    await candidate(3);
    const paths = root.querySelector<HTMLElement>('#paths')!;
    const scroll = vi.fn();
    paths.scrollIntoView = scroll;
    const link = root.querySelector<HTMLAnchorElement>('.btn.primary')!;
    expect(link.getAttribute('href')).toBe('/#paths');
    const event = new MouseEvent('click', { cancelable: true, bubbles: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(document.activeElement).toBe(paths);
  });

  it('switches the slide from the chips without rotating on its own (candidate 2)', async () => {
    for (const id of [2] as const) {
      await candidate(id);
      const chips = [...root.querySelectorAll<HTMLButtonElement>('.chip')];
      expect(chips).toHaveLength(6);
      expect(chips[0].getAttribute('aria-pressed')).toBe('true');
      chips[3].click();
      fixture.detectChanges();
      expect(chips[3].getAttribute('aria-pressed')).toBe('true');
      expect(root.querySelector('.title')?.textContent).toContain('Better questions');
      vi.advanceTimersByTime(20_000);
      fixture.detectChanges();
      expect(root.querySelector('.fill')).toBeNull();
      expect(chips[3].getAttribute('aria-pressed')).toBe('true');
      fixture.destroy();
      TestBed.resetTestingModule();
    }
  });

  it('rotates the night statement every six seconds and holds while pointed at (candidate 5)', async () => {
    await candidate(5);
    const pressed = () => [...root.querySelectorAll('.chip')].findIndex((chip) => chip.getAttribute('aria-pressed') === 'true');
    expect(pressed()).toBe(0);
    expect(root.querySelectorAll('.chip .chip-symbol')).toHaveLength(6);
    expect(root.querySelectorAll('.chip-sep')).toHaveLength(5);
    expect(root.querySelector('.chip[aria-pressed="true"] .fill.run')).not.toBeNull();
    fillDone();
    expect(pressed()).toBe(1);
    expect(root.querySelectorAll('.chip.done')).toHaveLength(1);
    root.querySelector('.hero')!.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(root.querySelector('.hero')!.hasAttribute('data-held')).toBe(true);
    fillDone();
    expect(pressed()).toBe(1);
    root.querySelector<HTMLButtonElement>('.v5-arrows button[aria-label="Next hero slide"]')!.click();
    fixture.detectChanges();
    expect(pressed()).toBe(2);
  });

  it('rotates the trimmed carousel every six seconds, holds while pointed at, and pauses on demand', async () => {
    await candidate(4);
    const pressed = () =>
      [...root.querySelectorAll('.dot-tab')].findIndex((tab) => tab.getAttribute('aria-pressed') === 'true');
    expect(pressed()).toBe(0);
    expect(root.querySelector('.dot-tab[aria-pressed="true"] .fill.run')).not.toBeNull();
    fillDone();
    expect(pressed()).toBe(1);
    root.querySelector('.hero')!.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    fillDone();
    expect(pressed()).toBe(1);
    root.querySelector('.hero')!.dispatchEvent(new Event('mouseleave'));
    root.querySelector<HTMLButtonElement>('.v4-arrows button[aria-label="Pause slideshow"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.hero')!.hasAttribute('data-held')).toBe(true);
    fillDone();
    expect(pressed()).toBe(1);
    root.querySelector<HTMLButtonElement>('.v4-arrows button[aria-label="Next hero slide"]')!.click();
    fixture.detectChanges();
    expect(pressed()).toBe(2);
    root.querySelector<HTMLButtonElement>('.v4-arrows button[aria-label="Previous hero slide"]')!.click();
    root.querySelector<HTMLButtonElement>('.v4-arrows button[aria-label="Previous hero slide"]')!.click();
    fixture.detectChanges();
    expect(pressed()).toBe(0);
  });

  it('does not rotate when the visitor prefers reduced motion', async () => {
    await candidate(4);
    motion.matches = true;
    motion.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    fixture.detectChanges();
    expect(root.querySelector('.fill.run')).toBeNull();
    fillDone();
    expect(root.querySelector('.dot-tab[aria-pressed="true"] .dot-name')?.textContent).toBe('Choose');
    expect(root.querySelector<HTMLButtonElement>('.v4-arrows button[aria-label="Pause slideshow"]')?.disabled).toBe(true);
  });

  it('the home page swaps only its hero for the candidate named by the route, and keeps every other section', async () => {
    await render(Landing, '3');
    expect(root.querySelector('app-hero-candidate .hero.v3')).not.toBeNull();
    expect(root.querySelector('.hero-carousel')).toBeNull();
    expect(root.querySelector('.hero-stage')).toBeNull();
    for (const id of ['paths', 'pricing']) expect(root.querySelector(`#${id}`)).not.toBeNull();
    expect(root.querySelector('app-platform-header')).not.toBeNull();
    expect(root.querySelector('main')?.classList.contains('landing-page')).toBe(true);
  });

  it('the home page serves the night statement, theme-aware and without the bar, unless the route asks otherwise', async () => {
    for (const value of [null, '9']) {
      await render(Landing, value);
      expect(root.querySelector('app-hero-candidate .hero.v5.daylight')).not.toBeNull();
      expect(root.querySelector('.preview-bar')).toBeNull();
      expect(root.querySelector('.hero-carousel')).toBeNull();
      expect(root.querySelectorAll('h1')).toHaveLength(1);
      fixture.destroy();
      TestBed.resetTestingModule();
    }
    await render(Landing, '5');
    expect(root.querySelector('app-hero-candidate .hero.v5:not(.daylight)')).not.toBeNull();
    expect(root.querySelector('.preview-bar a[href="/preview/hero/0"]')?.textContent).toBe('Previous hero');
    fixture.destroy();
    TestBed.resetTestingModule();
    await render(Landing, '0');
    expect(root.querySelector('app-hero-candidate')).toBeNull();
    expect(root.querySelector('.hero-carousel')).not.toBeNull();
    expect(heroVariantFrom('0')).toBe('classic');
  });
});
