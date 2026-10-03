import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TheoryVisual } from '../../content/content.models';
import { LessonStoryboard } from './lesson-storyboard';
import { StoryboardClock, StoryboardPlayer, StoryboardState, parseFrameSet, sanitizeStoryboardSvg } from './storyboard-player';

/** A clock the test moves by hand; animation frames run every 16 ms of manual time. */
class ManualClock implements StoryboardClock {
  time = 0;
  private queue: (() => void)[] = [];
  now = () => this.time;
  frame(callback: () => void) {
    this.queue.push(callback);
    return () => {
      this.queue = this.queue.filter((queued) => queued !== callback);
    };
  }
  async advance(ms: number): Promise<void> {
    for (let passed = 0; passed < ms; passed += 16) {
      this.time += 16;
      const due = this.queue;
      this.queue = [];
      due.forEach((callback) => callback());
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  }
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <title>Two nodes</title><style>.node{fill:red}</style>
  <script>alert(1)</script>
  <defs><marker id="ah"><path class="arrowhead" d="M0,0 L10,5 L0,10 z"/></marker></defs>
  <line class="edge" x1="30" y1="50" x2="150" y2="50" marker-end="url(#ah)" onclick="alert(2)"/>
  <circle class="node" id="a" cx="20" cy="50" r="10" fill="#f00" style="fill:red"/>
  <circle class="node" id="b" cx="180" cy="50" r="10" fill="none"/>
  <foreignObject><div>html</div></foreignObject>
  <a href="https://example.com"><text>link</text></a>
  <text class="counter" x="100" y="20" data-sb-text="start|step 1|done">done</text>
  <text class="result" x="100" y="90" data-sb-show="2-">found</text>
  <circle class="hit" cx="180" cy="50" r="10" data-sb-show="1"/>
  <g class="mover walker" data-sb-at="a b b" transform="translate(180 50)"><circle class="ring" r="14"/></g>
</svg>`;

const frames = [{ ms: 0, wait: 100 }, { ms: 400, wait: 100 }, { ms: 0 }];

describe('parseFrameSet', () => {
  it('reads single frames, ranges, open ranges and lists inside the frame count', () => {
    expect([...parseFrameSet('2', 5)]).toEqual([2]);
    expect([...parseFrameSet('1-3', 5)]).toEqual([1, 2, 3]);
    expect([...parseFrameSet('3-', 5)]).toEqual([3, 4]);
    expect([...parseFrameSet('0,2-3', 5)]).toEqual([0, 2, 3]);
    expect([...parseFrameSet('4-9', 5)]).toEqual([4]);
    expect([...parseFrameSet('x', 5)]).toEqual([]);
  });
});

describe('sanitizeStoryboardSvg', () => {
  it('keeps only drawing elements and attributes, and prefixes ids and their references', () => {
    const svg = sanitizeStoryboardSvg(SVG, document, 'p1')!;
    expect(svg.localName).toBe('svg');
    expect(svg.querySelector('script, style, title, foreignObject, a')).toBeNull();
    expect(svg.innerHTML).not.toContain('alert');
    expect(svg.getAttribute('width')).toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 100');
    expect(svg.querySelector('line')?.getAttribute('onclick')).toBeNull();
    expect(svg.querySelector('line')?.getAttribute('marker-end')).toBe('url(#p1-ah)');
    expect(svg.querySelector('marker')?.id).toBe('p1-ah');
    const first = svg.querySelector('circle.node') as SVGElement;
    expect(first.id).toBe('p1-a');
    expect(first.getAttribute('fill')).toBeNull();
    expect(first.getAttribute('style')).toBeNull();
    expect(svg.querySelectorAll('circle.node')[1].getAttribute('fill')).toBe('none');
    expect(svg.querySelector('.mover')?.getAttribute('data-sb-at')).toBe('p1-a p1-b p1-b');
    expect(svg.querySelector('.counter')?.getAttribute('data-sb-text')).toBe('start|step 1|done');
  });

  it('returns null for text that is not an SVG', () => {
    expect(sanitizeStoryboardSvg('<html><body>no</body></html>', document, 'p2')).toBeNull();
  });
});

describe('StoryboardPlayer', () => {
  const build = () => sanitizeStoryboardSvg(SVG, document, 'p3')!;
  const opacity = (svg: SVGSVGElement, selector: string) => (svg.querySelector(selector) as SVGElement).style.opacity;
  const at = (svg: SVGSVGElement) => svg.querySelector('.mover')?.getAttribute('transform');

  it('shows a frame at once: visibility, texts and mover positions', () => {
    const svg = build();
    const player = new StoryboardPlayer(svg, frames);
    player.show(0);
    expect(svg.querySelector('.counter')?.textContent).toBe('start');
    expect(opacity(svg, '.result')).toBe('0');
    expect(opacity(svg, '.hit')).toBe('0');
    expect(at(svg)).toBe('translate(20.0 50.0)');
    player.showFinal();
    expect(svg.querySelector('.counter')?.textContent).toBe('done');
    expect(opacity(svg, '.result')).toBe('1');
    expect(at(svg)).toBe('translate(180.0 50.0)');
  });

  it('moves every step (no jumps), holds the last frame for 5 s, then loops', async () => {
    const svg = build();
    const clock = new ManualClock();
    const states: StoryboardState[] = [];
    const player = new StoryboardPlayer(svg, frames, { clock, holdMs: 5000, onState: (state) => states.push(state) });
    player.start();
    expect(states).toEqual(['playing']);
    await clock.advance(100 + 200);
    // Halfway through the 400 ms hop the walker is between the two nodes.
    const x = Number(/translate\(([\d.]+)/.exec(at(svg)!)![1]);
    expect(x).toBeGreaterThan(20);
    expect(x).toBeLessThan(180);
    await clock.advance(200 + 300 + 100 + 300 + 50);
    expect(player.frame).toBe(2);
    expect(svg.querySelector('.counter')?.textContent).toBe('done');
    expect(states.at(-1)).toBe('hold');
    await clock.advance(4800);
    expect(player.frame).toBe(2);
    await clock.advance(400);
    expect(states.at(-1)).toBe('playing');
    expect(player.frame).toBe(0);
    expect(svg.querySelector('.counter')?.textContent).toBe('start');
    player.stop();
  });

  it('stops its clock while paused for any reason and resumes where it was', async () => {
    const svg = build();
    const clock = new ManualClock();
    const player = new StoryboardPlayer(svg, frames, { clock });
    player.setPaused('offscreen', true);
    player.start();
    await clock.advance(2000);
    expect(player.frame).toBe(0);
    expect(at(svg)).toBe('translate(20.0 50.0)');
    player.setPaused('offscreen', false);
    player.setPaused('user', true);
    await clock.advance(2000);
    expect(at(svg)).toBe('translate(20.0 50.0)');
    player.setPaused('user', false);
    await clock.advance(100 + 400 + 300);
    expect(player.frame).toBeGreaterThanOrEqual(1);
    expect(at(svg)).toBe('translate(180.0 50.0)');
    player.stop();
  });
});

describe('LessonStoryboard', () => {
  const visual: TheoryVisual = {
    type: 'storyboard',
    assetPath: '/content/learn/x/visuals/two.svg',
    alt: 'The walker goes from a to b.',
    storyboard: {
      frames,
      holdMs: 5000,
      playingStatus: 'Walking…',
      doneStatus: 'Found it.',
      legend: [{ mark: 'walker', text: 'walker' }, { mark: 'none', text: 'a note' }],
    },
  };
  let observers: { callback: IntersectionObserverCallback; element?: Element }[];
  let media: boolean;

  beforeEach(() => {
    observers = [];
    media = false;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(public callback: IntersectionObserverCallback) {
          observers.push(this as never);
        }
        observe(element: Element) {
          (this as unknown as { element: Element }).element = element;
        }
        disconnect() {}
      },
    );
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: media && query.includes('reduce'), media: query }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render(variant: 'story' | 'scene' = 'story') {
    const fixture = TestBed.createComponent(LessonStoryboard);
    const clock = new ManualClock();
    fixture.componentRef.setInput('visual', visual);
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('clock', clock);
    fixture.detectChanges();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http.match(visual.assetPath).forEach((request) => request.flush(SVG));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, clock, root: fixture.nativeElement as HTMLElement };
  }

  it('shows the drawing as an image until it is inlined, then plays it only while it is on screen', async () => {
    const fixture = TestBed.createComponent(LessonStoryboard);
    fixture.componentRef.setInput('visual', { ...visual, assetPath: '/content/learn/x/visuals/first.svg' });
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/content/learn/x/visuals/first.svg');
    expect(image.alt).toBe('The walker goes from a to b.');
    TestBed.inject(HttpTestingController).match('/content/learn/x/visuals/first.svg').forEach((request) => request.flush(SVG));

    const { root, clock, fixture: second } = await render();
    const svg = root.querySelector('.storyboard-svg svg') as SVGSVGElement;
    expect(root.querySelector('img')).toBeNull();
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('The walker goes from a to b.');
    expect(root.classList).toContain('storyboard-story');
    expect(Array.from(root.querySelectorAll('.storyboard-legend span')).map((span) => span.textContent?.trim())).toEqual(['walker', 'a note']);
    // Off screen until the observer says otherwise: frame 0, no movement.
    await clock.advance(1000);
    expect(svg.querySelector('.counter')?.textContent).toBe('start');
    observers.forEach(({ callback }) => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await clock.advance(100 + 400 + 300 + 100 + 300 + 50);
    second.detectChanges();
    expect(svg.querySelector('.counter')?.textContent).toBe('done');
    expect(root.querySelector('.storyboard-status')?.textContent).toBe('Found it. Replaying in 5 s.');
    // Scrolled away: it stops.
    observers.forEach(({ callback }) => callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    await clock.advance(8000);
    expect(svg.querySelector('.counter')?.textContent).toBe('done');
  });

  it('pauses and plays with the button, and says so', async () => {
    const { root, fixture } = await render();
    const button = root.querySelector('.storyboard-toggle') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('Pause');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Play animation');
    expect(root.querySelector('.storyboard-status')?.textContent).toBe('Paused.');
  });

  it('shows the last frame and no control under reduced motion', async () => {
    media = true;
    const { root } = await render('scene');
    const svg = root.querySelector('.storyboard-svg svg') as SVGSVGElement;
    expect(svg.querySelector('.counter')?.textContent).toBe('done');
    expect((svg.querySelector('.result') as SVGElement).style.opacity).toBe('1');
    expect(root.querySelector('.storyboard-toggle')).toBeNull();
    expect(root.querySelector('.storyboard-status')?.textContent).toBe('Found it.');
  });
});
