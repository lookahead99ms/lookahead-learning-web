import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  KEY_DONE,
  KEY_RESET_MS,
  KEY_STAGES,
  KEY_STORY_MS,
  KEY_SENTENCE,
  KEY_SUMMARY,
  LOOP_ARROW_MS,
  LOOP_FROM,
  LOOP_REST_MS,
  WordmarkKey,
  shownShare,
} from './wordmark-key';

describe('WordmarkKey', () => {
  let observed: Array<{ callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }>;

  function stubBrowser(reduced: boolean, withObserver = true): void {
    observed = [];
    vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: () => {}, removeEventListener: () => {} }));
    class FakeObserver {
      readonly disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        observed.push({ callback, disconnect: this.disconnect });
      }
      observe(): void {}
    }
    vi.stubGlobal('IntersectionObserver', withObserver ? FakeObserver : undefined);
  }

  function render(): ComponentFixture<WordmarkKey> {
    const fixture = TestBed.createComponent(WordmarkKey);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture;
  }
  const root = (fixture: ComponentFixture<WordmarkKey>) => fixture.nativeElement as HTMLElement;
  const state = (fixture: ComponentFixture<WordmarkKey>) => root(fixture).getAttribute('data-state');
  /** A 500px card on a 1000px screen, with `share` of the card showing. */
  const cardEntry = (share: number) =>
    ({
      isIntersecting: share > 0,
      boundingClientRect: { height: 500 },
      rootBounds: { height: 1000 },
      intersectionRect: { height: share * 500 },
    }) as unknown as IntersectionObserverEntry;
  const scrollIntoView = (fixture: ComponentFixture<WordmarkKey>, share = 1) => {
    observed[0].callback([cardEntry(share)], {} as IntersectionObserver);
    fixture.detectChanges();
  };
  const advance = (fixture: ComponentFixture<WordmarkKey>, ms: number) => {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  };
  /** Move on to the start of change `id` (counting from the first word). */
  const msUntil = (id: string) =>
    KEY_STAGES.slice(0, KEY_STAGES.findIndex((stage) => stage.id === id)).reduce((total, stage) => total + stage.ms, 0);
  const caption = (fixture: ComponentFixture<WordmarkKey>) =>
    [...root(fixture).querySelectorAll('.key-caption.on > tspan')].map((line) => line.textContent?.trim()).join(' ');
  const lit = (fixture: ComponentFixture<WordmarkKey>) => root(fixture).querySelectorAll('.lit').length;
  const replay = (fixture: ComponentFixture<WordmarkKey>) =>
    root(fixture).querySelector<HTMLButtonElement>('.key-replay');
  const pause = (fixture: ComponentFixture<WordmarkKey>) =>
    root(fixture).querySelector<HTMLButtonElement>('.key-control:not(.key-replay):not(.key-skip)');
  const skip = (fixture: ComponentFixture<WordmarkKey>) => root(fixture).querySelector<HTMLButtonElement>('.key-skip');

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists what each change means, in story order, and keeps the drawing decorative', () => {
    stubBrowser(false);
    const fixture = render();
    expect(root(fixture).querySelector('h3')?.textContent).toBe('Inside the wordmark');
    expect([...root(fixture).querySelectorAll('.key-list li')].map((item) => item.textContent?.trim())).toEqual([
      'OO Look, the eyes',
      'K The obstacle, a wall',
      '‹ › Code, in the K and the H',
      'AI AI, on the A and the H’s first stroke',
      'E Explore and engineer',
      'A Algorithms and architecture',
      'D The way through, a door',
      'L The path, one line from the L to the door, drawn last',
    ]);
    expect(root(fixture).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(root(fixture).querySelector('.key-shaft')?.getAttribute('pathLength')).toBe('1');
    expect(KEY_STORY_MS).toBe(1500 + 7 * 2600 + 3400 + 5000);
  });

  it('measures how much of the card shows, against the card or the screen, whichever is smaller', () => {
    expect(shownShare(cardEntry(0.5), 1000)).toBe(0.5);
    const tall = { boundingClientRect: { height: 2000 }, rootBounds: { height: 800 }, intersectionRect: { height: 600 } };
    expect(shownShare(tall as unknown as IntersectionObserverEntry, 0)).toBe(0.75);
    const noRoot = { boundingClientRect: { height: 900 }, rootBounds: null, intersectionRect: { height: 300 } };
    expect(shownShare(noRoot as unknown as IntersectionObserverEntry, 600)).toBe(0.5);
    const empty = { boundingClientRect: { height: 0 }, rootBounds: { height: 800 }, intersectionRect: { height: 0 } };
    expect(shownShare(empty as unknown as IntersectionObserverEntry, 800)).toBe(0);
  });

  it('waits until most of the card is on screen, then shows the plain word', () => {
    stubBrowser(false);
    const fixture = render();
    expect(state(fixture)).toBe('hidden');
    scrollIntoView(fixture, 0.5);
    advance(fixture, KEY_RESET_MS);
    expect(state(fixture)).toBe('hidden');
    scrollIntoView(fixture, 0.8);
    advance(fixture, KEY_RESET_MS);
    expect(state(fixture)).toBe('telling');
    expect(lit(fixture)).toBe(0);
    expect(caption(fixture)).toBe('');
    // It keeps watching, to notice if the reader leaves before the card has finished.
    expect(observed[0].disconnect).not.toHaveBeenCalled();
  });

  it('brings each symbol down onto its letter, one at a time, each with its own caption', () => {
    stubBrowser(false);
    const fixture = render();
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + msUntil('eyes'));
    const symbols = () => [...root(fixture).querySelectorAll('.key-symbol')].map((symbol) => symbol.classList.contains('lit'));
    const seen: string[] = [];
    for (const stage of KEY_STAGES.slice(1, 8)) {
      seen.push(`${caption(fixture)}: ${symbols().filter(Boolean).length}`);
      // The letters keep their own colours: nothing steps back while another changes.
      expect(root(fixture).querySelectorAll('.dim')).toHaveLength(0);
      // Only the symbol landing now glows.
      expect(root(fixture).querySelectorAll('.key-symbol.landing')).toHaveLength(1);
      advance(fixture, stage.ms);
    }
    // Seven symbols land in turn: eyes, wall, code, AI, circuit, frame, door.
    expect(seen).toEqual([
      'Look: 1',
      'The obstacle: 2',
      'Code: 3',
      'AI, in code: 4',
      'Explore and engineer: 5',
      'Algorithms and architecture: 6',
      'The way through: 7',
    ]);
  });

  it('then shows every meaning together, and only then draws the path, reading the whole sentence', () => {
    stubBrowser(false);
    const fixture = render();
    scrollIntoView(fixture);
    const shaft = () => root(fixture).querySelector('.key-shaft')!;
    advance(fixture, KEY_RESET_MS + msUntil('door'));
    expect(shaft().classList.contains('lit')).toBe(false);
    advance(fixture, KEY_STAGES[7].ms);
    expect(caption(fixture)).toBe(KEY_SUMMARY.map((item) => item.lines.join(' ')).join(' '));
    expect(root(fixture).querySelectorAll('.key-summary.on')).toHaveLength(KEY_SUMMARY.length);
    expect(shaft().classList.contains('lit')).toBe(false);
    advance(fixture, KEY_STAGES[8].ms);
    // The path draws with no caption of its own; the whole sentence reads instead.
    expect(caption(fixture)).toBe(
      'Look ahead to the obstacle, put AI to work in your code, explore and engineer with algorithms and architecture, and find the way through.',
    );
    expect(shaft().classList.contains('lit')).toBe(true);
    expect(root(fixture).querySelector('.key-arrowhead')?.classList.contains('lit')).toBe(true);
    expect(root(fixture).querySelector('[d="M8 60 V138 H36"]')?.classList.contains('lit')).toBe(true);
    advance(fixture, KEY_STAGES[9].ms);
    expect(state(fixture)).toBe('joined');
    expect(caption(fixture)).toBe('');
  });
  it('colours the sentence\'s key words like their symbols', () => {
    stubBrowser(false);
    const fixture = render();
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + msUntil('path'));
    const words = [...root(fixture).querySelectorAll<SVGTSpanElement>('.key-sentence .key-word')];
    expect(words.map((word) => `${word.textContent}:${word.style.fill}`)).toEqual([
      'Look:var(--identity-eyes)',
      'obstacle:var(--identity-wall)',
      'AI:var(--identity-ai)',
      'code:var(--identity-code)',
      'explore:var(--identity-ai)',
      'engineer:var(--identity-ai)',
      'algorithms:var(--identity-ai)',
      'architecture:var(--identity-ai)',
      'the way through:var(--identity-arrow)',
    ]);
    expect(KEY_SENTENCE.flat().filter((part) => part.colour)).toHaveLength(words.length);
  });
  it('turns the K stem into the wall before the code bracket lands on its arms', () => {
    stubBrowser(false);
    const fixture = render();
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + msUntil('wall'));
    const stem = root(fixture).querySelector('[d="M151 58 V138"]');
    const arms = root(fixture).querySelector('[d="M183 58 L156 100 L183 138"]');
    expect(stem?.classList.contains('lit')).toBe(true);
    expect(arms?.classList.contains('lit')).toBe(false);
    advance(fixture, KEY_STAGES[2].ms);
    expect(arms?.classList.contains('lit')).toBe(true);
  });

  it('starts over when the reader leaves before the card has finished, but not after', () => {
    stubBrowser(false);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.restarted.subscribe(() => events.push('restarted'));
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + 3000);
    scrollIntoView(fixture, 0.3);
    expect(state(fixture)).toBe('telling');
    scrollIntoView(fixture, 0);
    expect(state(fixture)).toBe('hidden');
    expect(events).toEqual(['restarted', 'restarted']);
    advance(fixture, KEY_STORY_MS);
    expect(state(fixture)).toBe('hidden');
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + KEY_STORY_MS);
    expect(state(fixture)).toBe('joined');
    fixture.componentRef.setInput('settled', true);
    fixture.detectChanges();
    scrollIntoView(fixture, 0);
    expect(state(fixture)).toBe('joined');
  });

  it('plays straight away where the browser cannot tell when it is seen', () => {
    stubBrowser(false, false);
    const fixture = render();
    advance(fixture, KEY_RESET_MS);
    expect(state(fixture)).toBe('telling');
    advance(fixture, KEY_STORY_MS);
    expect(state(fixture)).toBe('joined');
  });

  it('tells the page when it restarts and when the line reaches the door, replay included', () => {
    stubBrowser(false);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.restarted.subscribe(() => events.push('restarted'));
    fixture.componentInstance.finished.subscribe(() => events.push('finished'));
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + KEY_STORY_MS - 1);
    expect(events).toEqual(['restarted']);
    advance(fixture, 1);
    expect(events).toEqual(['restarted', 'finished']);
    replay(fixture)!.click();
    fixture.detectChanges();
    expect(state(fixture)).toBe('hidden');
    expect(events).toEqual(['restarted', 'finished', 'restarted']);
    advance(fixture, KEY_RESET_MS);
    expect(state(fixture)).toBe('telling');
    advance(fixture, KEY_STORY_MS);
    expect(events).toEqual(['restarted', 'finished', 'restarted', 'finished']);
  });

  it('once settled, loops from the summary: every meaning again, then the path, then the arrow', () => {
    stubBrowser(false);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.cycle.subscribe((phase) => events.push(phase));
    fixture.componentInstance.passed.subscribe(() => events.push('passed'));
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + KEY_STORY_MS);
    fixture.componentRef.setInput('settled', true);
    fixture.detectChanges();
    const shaft = () => root(fixture).querySelector('.key-shaft')!.classList.contains('lit');
    expect(shaft()).toBe(true);
    advance(fixture, LOOP_REST_MS);
    // Back to the summary: all symbols still in place, the path lifted, every meaning showing.
    expect(KEY_STAGES[LOOP_FROM].id).toBe('summary');
    expect(state(fixture)).toBe('telling');
    expect(events).toEqual(['apart']);
    expect(root(fixture).querySelectorAll('.key-symbol.lit')).toHaveLength(7);
    expect(root(fixture).querySelectorAll('.key-symbol.landing')).toHaveLength(0);
    expect(shaft()).toBe(false);
    expect(caption(fixture)).toBe(KEY_SUMMARY.map((item) => item.lines.join(' ')).join(' '));
    advance(fixture, KEY_STAGES[LOOP_FROM].ms);
    // The path draws again, but the sentence already stands below the steps.
    expect(shaft()).toBe(true);
    expect(caption(fixture)).toBe('');
    advance(fixture, KEY_STAGES[KEY_DONE - 1].ms);
    expect(state(fixture)).toBe('joined');
    expect(events).toEqual(['apart', 'joined', 'passed']);
    advance(fixture, LOOP_ARROW_MS + LOOP_REST_MS);
    expect(events).toEqual(['apart', 'joined', 'passed', 'apart']);
  });
  it('puts the wordmark back together and stops looping while the card is off screen', () => {
    stubBrowser(false);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.cycle.subscribe((phase) => events.push(phase));
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + KEY_STORY_MS);
    fixture.componentRef.setInput('settled', true);
    fixture.detectChanges();
    advance(fixture, LOOP_REST_MS + 1000);
    expect(state(fixture)).toBe('telling');
    scrollIntoView(fixture, 0);
    expect(state(fixture)).toBe('joined');
    expect(events).toEqual(['apart', 'joined']);
    advance(fixture, KEY_STORY_MS + LOOP_REST_MS);
    expect(state(fixture)).toBe('joined');
    scrollIntoView(fixture, 0.2);
    advance(fixture, LOOP_REST_MS);
    expect(state(fixture)).toBe('telling');
  });

  it('skipping a loop round finishes it, and the next round follows after the rest', () => {
    stubBrowser(false);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.cycle.subscribe((phase) => events.push(phase));
    fixture.componentInstance.finished.subscribe(() => events.push('finished'));
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + KEY_STORY_MS);
    fixture.componentRef.setInput('settled', true);
    fixture.detectChanges();
    advance(fixture, LOOP_REST_MS + 1000);
    expect(state(fixture)).toBe('telling');
    skip(fixture)!.click();
    fixture.detectChanges();
    expect(state(fixture)).toBe('joined');
    expect(events).toEqual(['finished', 'apart', 'joined']);
    advance(fixture, LOOP_REST_MS);
    expect(events).toEqual(['finished', 'apart', 'joined', 'apart']);
  });
  it('pause holds the story where it is, like a video; play carries on from there', () => {
    stubBrowser(false);
    const paused: string[] = [];
    const animation = (name: string) => ({
      playState: 'running',
      pause: () => paused.push(`pause ${name}`),
      play: () => paused.push(`play ${name}`),
    });
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.stillChange.subscribe((still) => events.push(`still:${still}`));
    fixture.componentInstance.finished.subscribe(() => events.push('finished'));
    const card = document.createElement('section');
    (card as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [animation('descent')];
    fixture.componentRef.setInput('stage', card);
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + msUntil('wall') + 500);
    expect(caption(fixture)).toBe('The obstacle');
    expect(pause(fixture)?.getAttribute('aria-label')).toBe('Pause the animation');
    pause(fixture)!.click();
    expect(events).toEqual(['still:true']);
    fixture.componentRef.setInput('still', true);
    fixture.detectChanges();
    expect(paused).toEqual(['pause descent']);
    advance(fixture, KEY_STORY_MS);
    // Still on the same change: nothing moved on while paused.
    expect(caption(fixture)).toBe('The obstacle');
    expect(state(fixture)).toBe('telling');
    expect(pause(fixture)?.getAttribute('aria-label')).toBe('Play the animation');
    expect(pause(fixture)?.getAttribute('aria-pressed')).toBe('true');
    // Leaving while paused keeps it paused, not restarted.
    scrollIntoView(fixture, 0);
    expect(state(fixture)).toBe('telling');
    pause(fixture)!.click();
    expect(events).toEqual(['still:true', 'still:false']);
    fixture.componentRef.setInput('still', false);
    fixture.detectChanges();
    expect(paused).toEqual(['pause descent', 'play descent']);
    // The rest of the change's time is left: 2600ms less the 500ms already shown.
    advance(fixture, KEY_STAGES[2].ms - 500 - 1);
    expect(caption(fixture)).toBe('The obstacle');
    advance(fixture, 1);
    expect(caption(fixture)).toBe('Code');
  });
  it('replay while paused resumes the motion and tells the story from the plain word', () => {
    stubBrowser(false);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.stillChange.subscribe((still) => events.push(`still:${still}`));
    fixture.componentRef.setInput('still', true);
    fixture.detectChanges();
    replay(fixture)!.click();
    fixture.detectChanges();
    expect(events).toEqual(['still:false']);
    expect(state(fixture)).toBe('hidden');
    advance(fixture, KEY_RESET_MS);
    expect(state(fixture)).toBe('telling');
  });

  it('with reduced motion, shows the finished wordmark with its meanings and no controls or loop', () => {
    stubBrowser(true);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.finished.subscribe(() => events.push('finished'));
    scrollIntoView(fixture);
    expect(state(fixture)).toBe('joined');
    expect(events).toEqual(['finished']);
    expect(root(fixture).hasAttribute('data-reduced')).toBe(true);
    expect(pause(fixture)).toBeNull();
    expect(replay(fixture)).toBeNull();
    expect(skip(fixture)).toBeNull();
    fixture.componentRef.setInput('settled', true);
    fixture.detectChanges();
    advance(fixture, LOOP_REST_MS + KEY_STORY_MS);
    expect(state(fixture)).toBe('joined');
  });

  it('skips to the end: the whole wordmark at once, and the page told to finish everything', () => {
    stubBrowser(false);
    const fixture = render();
    const events: string[] = [];
    fixture.componentInstance.skipped.subscribe(() => events.push('skipped'));
    fixture.componentInstance.finished.subscribe(() => events.push('finished'));
    fixture.componentInstance.stillChange.subscribe((still) => events.push(`still:${still}`));
    scrollIntoView(fixture);
    advance(fixture, KEY_RESET_MS + msUntil('code'));
    fixture.componentRef.setInput('still', true);
    fixture.detectChanges();
    expect(skip(fixture)?.getAttribute('aria-label')).toBe('Skip to the end');
    skip(fixture)!.click();
    fixture.detectChanges();
    expect(state(fixture)).toBe('joined');
    expect(events).toEqual(['still:false', 'skipped', 'finished']);
    // The page passes the resumed motion back in.
    fixture.componentRef.setInput('still', false);
    fixture.detectChanges();
    // Nothing left waiting: the story does not carry on from where it was.
    advance(fixture, KEY_STORY_MS);
    expect(events).toEqual(['still:false', 'skipped', 'finished']);
    // Skipping again once finished only says so; it does not finish twice.
    skip(fixture)!.click();
    expect(events).toEqual(['still:false', 'skipped', 'finished', 'skipped']);
  });
});
