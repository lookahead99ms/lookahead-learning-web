/**
 * Storyboard animations for lessons (algo-pattern-v1 and the DSA concept courses).
 *
 * A storyboard is an SVG drawn in its last frame plus a list of frames. The lesson page inlines a sanitized copy
 * (allowlisted SVG elements and attributes only) and this player moves it frame by frame. Elements opt in with
 * data attributes:
 *   data-sb-show="2" | "2-5" | "2-" | "0,4-6"  visible only on those frames ("2-" = from frame 2 to the end);
 *   data-sb-text="start|step 1|…"               one text per frame;
 *   data-sb-at="n10 n20 …"                      a mover: the id of the element it stands on in each frame;
 *   data-sb-route="#pathId"                     optional: the mover travels along that path between frames
 *                                               (otherwise in a straight line);
 *   data-sb-stops="0 0.1 …"                     instead of data-sb-at: a fraction of the route's length per frame.
 * The content repository checks the same rules (apply_system_lessons.py, check_storyboard).
 */

export interface StoryboardFrame {
  /** Travel time into this frame, in ms (0: the change happens at once). */
  ms: number;
  /** Pause after this frame, in ms (default 300). */
  wait?: number;
}

/** The time source; tests drive a manual one. */
export interface StoryboardClock {
  now(): number;
  /** Calls back on the next animation frame; returns a cancel function. */
  frame(callback: () => void): () => void;
}

export type StoryboardState = 'idle' | 'playing' | 'hold' | 'final';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FADE_MS = 300;
const DEFAULT_WAIT = 300;

/** Browser clock: an animation frame, with a timer fallback when frames are not produced (hidden tab, headless capture). */
export const browserClock: StoryboardClock = {
  now: () => performance.now(),
  frame(callback) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      callback();
    };
    const id = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : null;
    const timer = setTimeout(run, 40);
    return () => {
      done = true;
      if (id !== null) cancelAnimationFrame(id);
      clearTimeout(timer);
    };
  },
};

/** "2", "2-5", "2-" and comma lists of those, as a set of frame numbers below count. */
export function parseFrameSet(value: string, count: number): Set<number> {
  const frames = new Set<number>();
  for (const part of value.split(',')) {
    const match = /^\s*(\d+)\s*(?:(-)\s*(\d*)\s*)?$/.exec(part);
    if (!match) continue;
    const first = Number(match[1]);
    const last = match[2] ? (match[3] ? Number(match[3]) : count - 1) : first;
    for (let frame = first; frame <= Math.min(last, count - 1); frame++) frames.add(frame);
  }
  return frames;
}

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'marker', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect', 'text', 'tspan',
]);
const ATTRIBUTES = new Set([
  'id', 'class', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'width', 'height',
  'points', 'viewBox', 'transform', 'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight',
  'markerUnits', 'refX', 'refY', 'orient', 'text-anchor', 'dominant-baseline', 'font-size', 'font-weight',
  'stroke-dasharray', 'stroke-width', 'opacity', 'fill', 'stroke', 'preserveAspectRatio', 'pathLength',
  'data-sb-show', 'data-sb-text', 'data-sb-at', 'data-sb-route', 'data-sb-stops',
]);
/** fill and stroke may only switch painting off or follow the text color; real colors come from the theme. */
const PAINT = /^(none|currentColor)$/i;
const MARKER_REF = /^url\(#([\w-]+)\)$/;

/**
 * A safe, theme-colored copy of a storyboard SVG: allowlisted elements and attributes only (no script, style,
 * event handler, link, image or foreign content), ids prefixed so several drawings can share a page.
 * Returns null when the text is not an SVG document.
 */
export function sanitizeStoryboardSvg(source: string, doc: Document, prefix: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || root.localName !== 'svg' || parsed.getElementsByTagName('parsererror').length) return null;
  const rename = (id: string) => `${prefix}-${id}`;
  const copy = (node: Element): Element | null => {
    if (node.namespaceURI !== SVG_NS || !ELEMENTS.has(node.localName)) return null;
    const element = doc.createElementNS(SVG_NS, node.localName);
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name;
      let value = attribute.value;
      if (!ATTRIBUTES.has(name)) continue;
      if ((name === 'fill' || name === 'stroke') && !PAINT.test(value)) continue;
      if (name === 'id') value = rename(value);
      else if (name.startsWith('marker-')) {
        const match = MARKER_REF.exec(value.trim());
        if (!match) continue;
        value = `url(#${rename(match[1])})`;
      } else if (name === 'data-sb-route') {
        if (!value.startsWith('#')) continue;
        value = `#${rename(value.slice(1))}`;
      } else if (name === 'data-sb-at') {
        value = value.trim().split(/\s+/).map(rename).join(' ');
      } else if (name !== 'data-sb-text' && /[:<>"]|url\(/i.test(value)) {
        continue;
      }
      element.setAttribute(name, value);
    }
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) element.appendChild(doc.createTextNode(child.textContent ?? ''));
      else if (child.nodeType === 1) {
        const safe = copy(child as Element);
        if (safe) element.appendChild(safe);
      }
    }
    return element;
  };
  const svg = copy(root) as SVGSVGElement | null;
  if (!svg) return null;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  return svg;
}

interface Point {
  x: number;
  y: number;
}

interface Mover {
  element: SVGGraphicsElement;
  points: Point[];
  route: SVGGeometryElement | null;
  /** Length along the route of each frame's stop (when the route can be measured). */
  lengths: number[] | null;
}

function numberAttribute(element: Element, name: string): number {
  return Number(element.getAttribute(name) ?? 0) || 0;
}

/** Where a mover stands on an element: a circle or ellipse's center, a rect's middle, else its box's middle. */
function centerOf(element: Element | null): Point | null {
  if (!element) return null;
  const name = element.localName;
  if (name === 'circle' || name === 'ellipse') return { x: numberAttribute(element, 'cx'), y: numberAttribute(element, 'cy') };
  if (name === 'rect') {
    return {
      x: numberAttribute(element, 'x') + numberAttribute(element, 'width') / 2,
      y: numberAttribute(element, 'y') + numberAttribute(element, 'height') / 2,
    };
  }
  try {
    const box = (element as SVGGraphicsElement).getBBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } catch {
    return null;
  }
}

function measurable(route: SVGGeometryElement | null): route is SVGGeometryElement {
  return !!route && typeof route.getTotalLength === 'function' && typeof route.getPointAtLength === 'function';
}

/** The first point along the route, from start onward, that comes closest to target (within a node's width). */
function lengthNear(route: SVGGeometryElement, target: Point, start: number, total: number): number {
  const distance = (length: number) => {
    const point = route.getPointAtLength(length);
    return Math.hypot(point.x - target.x, point.y - target.y);
  };
  const step = 1;
  let best = start;
  let bestDistance = distance(start);
  for (let length = start; length <= total + step / 2; length += step) {
    const d = distance(Math.min(length, total));
    if (d < bestDistance) {
      best = Math.min(length, total);
      bestDistance = d;
    } else if (bestDistance < 4 && d > bestDistance + 2) {
      break; // past the closest approach to this stop; later laps come back to it again
    }
  }
  return best;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

class Cancelled extends Error {}

/**
 * Plays one inlined storyboard: frame 0 to the last, holds the last frame, loops. Paused while any reason holds
 * (the reader pressed Pause, the drawing is off screen, the tab is hidden); the clock stops while paused.
 */
export class StoryboardPlayer {
  private readonly shows: { element: SVGElement; frames: Set<number> }[] = [];
  private readonly texts: { element: SVGElement; texts: string[] }[] = [];
  private readonly movers: Mover[] = [];
  private readonly pauses = new Set<string>();
  private generation = 0;
  private resume: (() => void) | null = null;
  private cancelFrame: (() => void) | null = null;
  private current = 0;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly frames: readonly StoryboardFrame[],
    private readonly options: { holdMs?: number; clock?: StoryboardClock; onState?: (state: StoryboardState) => void } = {},
  ) {
    const count = frames.length;
    for (const element of Array.from(svg.querySelectorAll<SVGElement>('[data-sb-show]'))) {
      this.shows.push({ element, frames: parseFrameSet(element.getAttribute('data-sb-show') ?? '', count) });
    }
    for (const element of Array.from(svg.querySelectorAll<SVGElement>('[data-sb-text]'))) {
      const texts = (element.getAttribute('data-sb-text') ?? '').split('|');
      this.texts.push({ element, texts: Array.from({ length: count }, (_, index) => texts[index] ?? texts.at(-1) ?? '') });
    }
    for (const element of Array.from(svg.querySelectorAll<SVGGraphicsElement>('[data-sb-at], [data-sb-stops]'))) {
      const routeId = element.getAttribute('data-sb-route');
      const route = routeId ? svg.querySelector<SVGGeometryElement>(`[id="${routeId.slice(1)}"]`) : null;
      const total = measurable(route) ? route.getTotalLength() : 0;
      let points: Point[] = [];
      let lengths: number[] | null = null;
      const stops = element.getAttribute('data-sb-stops');
      if (stops && measurable(route) && total > 0) {
        lengths = stops.trim().split(/\s+/).map((stop) => Math.min(Math.max(Number(stop) || 0, 0), 1) * total);
        points = lengths.map((length) => {
          const point = route.getPointAtLength(length);
          return { x: point.x, y: point.y };
        });
      } else {
        const ids = (element.getAttribute('data-sb-at') ?? '').trim().split(/\s+/).filter(Boolean);
        points = ids.map((id) => centerOf(svg.querySelector(`[id="${id}"]`)) ?? { x: 0, y: 0 });
        if (measurable(route) && total > 0) {
          lengths = [];
          let from = 0;
          for (const point of points) {
            from = lengthNear(route, point, from, total);
            lengths.push(from);
          }
        }
      }
      while (points.length < count) points.push(points.at(-1) ?? { x: 0, y: 0 });
      if (lengths) while (lengths.length < count) lengths.push(lengths.at(-1) ?? 0);
      this.movers.push({ element, points, route: lengths ? route : null, lengths });
    }
  }

  get frame(): number {
    return this.current;
  }

  /** Show one frame at once (reduced motion shows the last one). */
  show(frame: number): void {
    this.current = frame;
    for (const { element, frames } of this.shows) element.style.opacity = frames.has(frame) ? '1' : '0';
    for (const { element, texts } of this.texts) element.textContent = texts[frame];
    for (const mover of this.movers) this.place(mover, mover.points[frame]);
  }

  showFinal(): void {
    this.stop();
    this.show(this.frames.length - 1);
    this.options.onState?.('final');
  }

  /** Plays from frame 0 and keeps looping until stopped. */
  start(): void {
    this.stop();
    const generation = ++this.generation;
    this.loop(generation).catch(() => undefined);
  }

  stop(): void {
    this.generation++;
    this.cancelFrame?.();
    this.cancelFrame = null;
    this.resume = null;
  }

  setPaused(reason: string, paused: boolean): void {
    if (paused) this.pauses.add(reason);
    else this.pauses.delete(reason);
    if (!this.paused && this.resume) {
      const resume = this.resume;
      this.resume = null;
      resume();
    }
  }

  get paused(): boolean {
    return this.pauses.size > 0;
  }

  private get clock(): StoryboardClock {
    return this.options.clock ?? browserClock;
  }

  private async loop(generation: number): Promise<void> {
    const last = this.frames.length - 1;
    for (;;) {
      this.options.onState?.('playing');
      this.show(0);
      await this.sleep(generation, this.frames[0]?.wait ?? DEFAULT_WAIT);
      for (let frame = 1; frame <= last; frame++) {
        const { ms, wait } = this.frames[frame];
        if (ms > 0) await this.tween(generation, ms, (t) => this.travel(frame - 1, frame, t));
        await this.reveal(generation, frame);
        if (frame < last) await this.sleep(generation, wait ?? DEFAULT_WAIT);
      }
      this.options.onState?.('hold');
      await this.sleep(generation, this.options.holdMs ?? 5000);
    }
  }

  /** Movers travel from one frame's stop to the next; along the route when there is one. */
  private travel(from: number, to: number, t: number): void {
    for (const mover of this.movers) {
      if (mover.route && mover.lengths) {
        const length = mover.lengths[from] + (mover.lengths[to] - mover.lengths[from]) * t;
        const point = mover.route.getPointAtLength(length);
        this.place(mover, { x: point.x, y: point.y });
      } else {
        const a = mover.points[from];
        const b = mover.points[to];
        this.place(mover, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
  }

  /** Texts switch, and elements that appear or disappear in this frame fade in or out. */
  private async reveal(generation: number, frame: number): Promise<void> {
    this.current = frame;
    for (const mover of this.movers) this.place(mover, mover.points[frame]);
    for (const { element, texts } of this.texts) element.textContent = texts[frame];
    const changing = this.shows.filter(({ frames }) => frames.has(frame) !== frames.has(frame - 1));
    if (!changing.length) return;
    await this.tween(generation, FADE_MS, (t) => {
      for (const { element, frames } of changing) element.style.opacity = String(frames.has(frame) ? t : 1 - t);
    });
  }

  private place(mover: Mover, point: Point): void {
    mover.element.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
  }

  private sleep(generation: number, ms: number): Promise<void> {
    return this.tween(generation, ms, () => undefined);
  }

  /** Runs step(t) for t from 0 to 1 (eased) over ms of unpaused time. */
  private tween(generation: number, ms: number, step: (t: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let elapsed = 0;
      let last = this.clock.now();
      const tick = () => {
        this.cancelFrame = null;
        if (generation !== this.generation) return reject(new Cancelled());
        const now = this.clock.now();
        if (this.paused) {
          this.resume = () => {
            last = this.clock.now();
            this.cancelFrame = this.clock.frame(tick);
          };
          return;
        }
        elapsed += now - last;
        last = now;
        const t = ms <= 0 ? 1 : Math.min(1, elapsed / ms);
        step(ease(t));
        if (t < 1) this.cancelFrame = this.clock.frame(tick);
        else resolve();
      };
      this.cancelFrame = this.clock.frame(tick);
    });
  }
}
