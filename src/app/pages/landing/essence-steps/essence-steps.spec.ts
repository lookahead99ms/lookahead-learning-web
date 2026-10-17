import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { EssenceSteps, LOOP_DASH_MS, STEPS_MS, StairTraveller } from './essence-steps';

describe('EssenceSteps', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(EssenceSteps);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  /** Lay the steps out as a staircase: 100px wide, each 64px higher than the one before. */
  function layOut(root: HTMLElement, climbing = true): void {
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
    const frame = root.querySelector<HTMLElement>('.essence-stairs-frame')!;
    frame.getBoundingClientRect = () => rect(10, 20, 400, 300);
    root.querySelectorAll<HTMLElement>('.essence-stairs > li').forEach((step, index) => {
      step.getBoundingClientRect = () =>
        climbing ? rect(10 + index * 100, 20 + 52 + (3 - index) * 64, 100, 100) : rect(10, 20 + index * 150, 400, 100);
    });
  }

  function renderWithObservers(): {
    fixture: ComponentFixture<EssenceSteps>;
    play: (value: boolean) => void;
    resized: () => void;
  } {
    let resizeCallback!: ResizeObserverCallback;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const fixture = TestBed.createComponent(EssenceSteps);
    fixture.detectChanges();
    TestBed.tick();
    layOut(fixture.nativeElement);
    resizeCallback([], {} as ResizeObserver);
    fixture.detectChanges();
    return {
      fixture,
      play: (value) => {
        fixture.componentRef.setInput('play', value);
        fixture.detectChanges();
      },
      resized: () => {
        resizeCallback([], {} as ResizeObserver);
        fixture.detectChanges();
      },
    };
  }

  afterEach(() => vi.unstubAllGlobals());
  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();

  it('climbs the platform sentence over the four ways of thinking, in order', () => {
    const steps = [...render().querySelectorAll<HTMLElement>('.essence-stairs > li')];
    expect(steps.map((step) => clean(step.querySelector('.essence-step-label')?.textContent))).toEqual([
      'Learn to Code',
      'And Explore',
      'AI Algorithms Architecture',
      'Look Ahead',
    ]);
    expect(
      steps.map((step) => clean(`${step.querySelector('.essence-verb')?.textContent} ${step.querySelector('.essence-word')?.textContent}`)),
    ).toEqual([
      'Understand the obstacle',
      'Find the way',
      'Understand the invariant',
      'Practice the reasoning',
    ]);
  });

  it('colours each step from the wordmark and orders its reveal', () => {
    const steps = [...render().querySelectorAll<HTMLElement>('.essence-stairs > li')];
    expect(steps.map((step) => step.style.getPropertyValue('--step-colour'))).toEqual([
      'var(--identity-wall)',
      'var(--identity-arrow)',
      'var(--identity-h)',
      'var(--identity-ai)',
    ]);
    expect(steps.map((step) => step.style.getPropertyValue('--step'))).toEqual(['0', '1', '2', '3']);
  });

  it('marks the emphasised words and puts "Ahead" on the gradient', () => {
    const root = render();
    const first = root.querySelectorAll<HTMLElement>('.essence-step-label')[0];
    expect([...first.querySelectorAll('strong')].map((word) => word.style.color)).toEqual([
      'var(--path-learn)',
      'var(--identity-code)',
    ]);
    expect(root.querySelector('.essence-gradient')?.textContent).toBe('Ahead');
    expect(root.querySelectorAll('.essence-dot[aria-hidden="true"]')).toHaveLength(4);
  });

  it('gives each growth phrase a catalog-coloured verb and a contrasting outcome', () => {
    const lines = [...render().querySelectorAll<HTMLElement>('.essence-growth li')];
    expect(lines.map((line) => clean(line.textContent))).toEqual([
      'Grow your engineering capabilities',
      'Strengthen your competencies',
      'Build expertise in your chosen specializations',
    ]);
    expect(lines.map((line) => [...line.querySelectorAll('strong')].map((word) => word.textContent))).toEqual([
      ['Grow', 'capabilities'],
      ['Strengthen', 'competencies'],
      ['Build', 'specializations'],
    ]);
    expect(lines.map((line) => line.style.getPropertyValue('--line-colour'))).toEqual([
      'var(--path-grow)',
      'var(--path-learn)',
      'var(--path-blaze)',
    ]);
    expect(lines.map((line) => line.querySelectorAll('strong')[1].style.color)).toEqual([
      'var(--identity-ai)',
      'var(--identity-code)',
      'var(--identity-arrow)',
    ]);
    // The star before each phrase shades from the previous phrase's outcome colour.
    expect(lines.map((line) => line.style.getPropertyValue('--previous-colour'))).toEqual([
      'var(--path-grow)',
      'var(--identity-ai)',
      'var(--identity-code)',
    ]);
  });

  it('draws the stair line as SVG: up each riser, then across each tread', () => {
    const { fixture, play } = renderWithObservers();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.getAttribute('data-state')).toBe('hidden');
    expect(root.querySelector('.essence-stairs-frame')?.classList.contains('has-line')).toBe(true);
    const paths = [...root.querySelectorAll<SVGPathElement>('.essence-line path')];
    // Each step's piece: up the riser from the step before, then along the step.
    expect(paths.map((path) => path.getAttribute('d'))).toEqual([
      'M0 244 H100',
      'M100 244 V180 H200',
      'M200 180 V116 H300',
      'M300 116 V52 H400',
    ]);
    expect(paths.map((path) => path.getAttribute('stroke'))).toEqual([
      'var(--identity-wall)',
      'var(--identity-arrow)',
      'var(--identity-h)',
      'var(--identity-ai)',
    ]);
    expect(paths.every((path) => path.getAttribute('pathLength') === '1')).toBe(true);
    play(true);
    expect(root.getAttribute('data-state')).toBe('shown');
    play(false);
    expect(root.getAttribute('data-state')).toBe('hidden');
  });

  it('sends one arrow along the whole line, stopping where each step ends', () => {
    const { fixture } = renderWithObservers();
    const traveller = (fixture.componentInstance as unknown as { traveller(): StairTraveller }).traveller();
    expect(traveller.route).toBe('M0 244 H100 V180 H200 V116 H300 V52 H400');
    // Treads of 100px and risers of 64px: steps end at 100, 264 and 428 of 592px. The arrow rests
    // at the end of each step, a pixel short of the corner, so it points right, not up.
    expect(traveller.stops).toEqual([16.7, 44.4, 72.1, 100]);
    // Each step's dot sits mid-tread: 50, 214, 378 and 542 of 592px.
    expect(traveller.dots).toEqual([8.4, 36.1, 63.9, 91.6]);
    const arrow = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.essence-traveller')!;
    expect([0, 1, 2, 3].map((index) => arrow.style.getPropertyValue(`--stop-${index}`))).toEqual([
      '16.7%',
      '44.4%',
      '72.1%',
      '100%',
    ]);
    expect([0, 1, 2, 3].map((index) => arrow.style.getPropertyValue(`--colour-${index}`))).toEqual([
      'var(--identity-wall)',
      'var(--identity-arrow)',
      'var(--identity-h)',
      'var(--identity-ai)',
    ]);
    expect(arrow.getAttribute('aria-hidden')).toBe('true');
  });

  it('makes "Look ahead" the larger, final label', () => {
    const labels = [...render().querySelectorAll('.essence-step-label')];
    expect(labels.map((label) => label.classList.contains('is-final'))).toEqual([false, false, false, true]);
  });

  it('drops the drawn line when the steps stack, and redraws it when they climb again', () => {
    const { fixture, resized } = renderWithObservers();
    const root: HTMLElement = fixture.nativeElement;
    layOut(root, false);
    resized();
    expect(root.querySelector('.essence-line')).toBeNull();
    expect(root.querySelector('.essence-stairs-frame')?.classList.contains('has-line')).toBe(false);
    expect(root.querySelector('.essence-traveller')).toBeNull();
    layOut(root);
    resized();
    expect(root.querySelectorAll('.essence-line path')).toHaveLength(4);
    expect(root.querySelector('.essence-traveller')).not.toBeNull();
  });

  it('waits to be told to play, and draws the statements in one after another', () => {
    const fixture = TestBed.createComponent(EssenceSteps);
    fixture.detectChanges();
    TestBed.tick();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.getAttribute('data-state')).toBe('hidden');
    expect(root.querySelector('.essence-line')).toBeNull();
    expect(
      [...root.querySelectorAll<HTMLElement>('.essence-growth li')].map((line) => line.style.getPropertyValue('--phrase')),
    ).toEqual(['0', '1', '2']);
    fixture.componentRef.setInput('play', true);
    fixture.detectChanges();
    expect(root.getAttribute('data-state')).toBe('shown');
  });

  it('reports when the arrow comes to rest, holding the wait while paused', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(EssenceSteps);
    const settled = vi.fn();
    fixture.componentInstance.settled.subscribe(settled);
    fixture.detectChanges();
    fixture.componentRef.setInput('play', true);
    fixture.detectChanges();
    vi.advanceTimersByTime(STEPS_MS - 1000);
    fixture.componentRef.setInput('still', true);
    fixture.detectChanges();
    vi.advanceTimersByTime(STEPS_MS);
    expect(settled).not.toHaveBeenCalled();
    fixture.componentRef.setInput('still', false);
    fixture.detectChanges();
    vi.advanceTimersByTime(999);
    expect(settled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(settled).toHaveBeenCalledTimes(1);
    // Hidden again before the arrow rests: no report.
    fixture.componentRef.setInput('play', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('play', true);
    fixture.detectChanges();
    fixture.componentRef.setInput('play', false);
    fixture.detectChanges();
    vi.advanceTimersByTime(STEPS_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    fixture.destroy();
    vi.useRealTimers();
  });

  it('sends the arrow up again each loop round, with a pulse from each step', () => {
    const { fixture } = renderWithObservers();
    const root: HTMLElement = fixture.nativeElement;
    const arrow = () => root.querySelector('.essence-traveller');
    const first = arrow();
    expect(first?.classList.contains('is-loop')).toBe(false);
    expect(root.querySelectorAll('.essence-pulse')).toHaveLength(0);
    fixture.componentRef.setInput('loop', 1);
    fixture.detectChanges();
    expect(arrow()).not.toBe(first);
    expect(arrow()?.classList.contains('is-loop')).toBe(true);
    expect(root.querySelectorAll('.essence-dot .essence-pulse')).toHaveLength(4);
    // Each pulse leaves its dot as the running arrow passes it.
    expect(
      [...root.querySelectorAll<HTMLElement>('.essence-stairs > li')].map((step) => step.style.getPropertyValue('--pulse-at')),
    ).toEqual(['168ms', '722ms', '1278ms', '1832ms']);
    const pulse = root.querySelector('.essence-pulse');
    fixture.componentRef.setInput('loop', 2);
    fixture.detectChanges();
    expect(root.querySelector('.essence-pulse')).not.toBe(pulse);
  });

  it('runs the arrow up the whole staircase in one go on a loop round, taking each step colour', () => {
    const animate = vi.fn();
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    const { fixture } = renderWithObservers();
    fixture.componentRef.setInput('loop', 1);
    fixture.detectChanges();
    TestBed.tick();
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, options] = animate.mock.calls[0];
    expect(options).toEqual({ duration: LOOP_DASH_MS, easing: 'linear', fill: 'forwards' });
    expect(frames.map((frame: Keyframe) => `${frame['offset']}:${frame['offsetDistance']}:${frame['color']}`)).toEqual([
      '0:0%:var(--identity-wall)',
      '0.167:16.7%:var(--identity-wall)',
      '0.167:16.7%:var(--identity-arrow)',
      '0.444:44.4%:var(--identity-arrow)',
      '0.444:44.4%:var(--identity-h)',
      '0.721:72.1%:var(--identity-h)',
      '0.721:72.1%:var(--identity-ai)',
      '1:100%:var(--identity-ai)',
    ]);
    HTMLElement.prototype.animate = original;
  });

  it('shows everything finished at once when the reader skips to the end', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(EssenceSteps);
    const settled = vi.fn();
    fixture.componentInstance.settled.subscribe(settled);
    fixture.detectChanges();
    fixture.componentRef.setInput('instant', true);
    fixture.componentRef.setInput('play', true);
    fixture.detectChanges();
    expect(settled).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).hasAttribute('data-rested')).toBe(true);
    // The skip is only a moment; the arrow stays at rest and nothing restarts.
    fixture.componentRef.setInput('instant', false);
    fixture.detectChanges();
    vi.advanceTimersByTime(STEPS_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).hasAttribute('data-rested')).toBe(true);
    // Hidden again (a replay): no longer resting.
    fixture.componentRef.setInput('play', false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).hasAttribute('data-rested')).toBe(false);
    fixture.destroy();
    vi.useRealTimers();
  });

  it('marks the statements as stepped aside while the wordmark retells its story', () => {
    const fixture = TestBed.createComponent(EssenceSteps);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.hasAttribute('data-away')).toBe(false);
    fixture.componentRef.setInput('away', true);
    fixture.detectChanges();
    expect(root.hasAttribute('data-away')).toBe(true);
  });
});
