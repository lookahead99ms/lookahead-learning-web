import { vi } from 'vitest';
import { PathSceneTimeline } from './path-scene-timeline';

type Id = 'learn' | 'grow' | 'look-ahead';
const IDS: readonly Id[] = ['learn', 'grow', 'look-ahead'];
// The three path stories share one length (data-story-ms in each SVG).
const STORY: Record<Id, number | null> = { learn: 19500, grow: 19500, 'look-ahead': 19500 };

function setup(durations: Record<Id, number | null> = STORY) {
  const log: string[] = [];
  const frozen = new Set<Id>();
  const timeline = new PathSceneTimeline<Id>(IDS, {
    play: (id) => log.push(`play ${id}`),
    hold: (id) => log.push(`hold ${id}`),
    freeze: (id, on) => (on ? frozen.add(id) : frozen.delete(id)),
    duration: (id) => durations[id],
  });
  return { timeline, log, frozen };
}

describe('PathSceneTimeline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts learn, grow and look ahead at 3, 4 and 5 s on load and lets them overlap', () => {
    const { timeline, log } = setup();
    timeline.start();
    expect(log).toEqual(['hold learn', 'hold grow', 'hold look-ahead']);

    vi.advanceTimersByTime(2999);
    expect(timeline.playing).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(timeline.playing).toEqual(['learn']);
    vi.advanceTimersByTime(1000);
    expect(timeline.playing).toEqual(['learn', 'grow']);
    vi.advanceTimersByTime(1000);
    expect(timeline.playing).toEqual(['learn', 'grow', 'look-ahead']);

    // Equal stories end in the same order, 1 s apart: 22.5, 23.5 and 24.5 s.
    vi.advanceTimersByTime(22500 - 5000);
    expect(timeline.playing).toEqual(['grow', 'look-ahead']);
    expect(log.at(-1)).toBe('hold learn');
    vi.advanceTimersByTime(1000);
    expect(timeline.playing).toEqual(['look-ahead']);
    vi.advanceTimersByTime(1000);
    expect(timeline.playing).toEqual([]);
    timeline.destroy();
  });

  it('starts every later round the same way: 3, 4 and 5 s after all three are back', () => {
    const { timeline, log } = setup();
    timeline.start();
    vi.advanceTimersByTime(24500); // look ahead, the last to start, is back on its summary
    expect(timeline.playing).toEqual([]);
    const plays = () => log.filter((line) => line.startsWith('play'));
    expect(plays()).toHaveLength(3);

    vi.advanceTimersByTime(2999);
    expect(timeline.playing).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(timeline.playing).toEqual(['learn']);
    vi.advanceTimersByTime(1000);
    expect(timeline.playing).toEqual(['learn', 'grow']);
    vi.advanceTimersByTime(1000);
    expect(timeline.playing).toEqual(['learn', 'grow', 'look-ahead']);
    expect(plays().slice(3)).toEqual(['play learn', 'play grow', 'play look-ahead']);
    timeline.destroy();
  });

  it('waits for the longest story before the next round starts', () => {
    const { timeline } = setup({ learn: 10000, grow: 30000, 'look-ahead': 10000 });
    timeline.start();
    vi.advanceTimersByTime(34000 - 1);
    expect(timeline.playing).toEqual(['grow']);
    vi.advanceTimersByTime(1);
    expect(timeline.playing).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(timeline.playing).toEqual(['learn']);
    timeline.destroy();
  });

  it('pauses every playing story with the visitor toggle and resumes with the time left', () => {
    const { timeline, frozen } = setup();
    timeline.start();
    vi.advanceTimersByTime(4500);
    expect(timeline.playing).toEqual(['learn', 'grow']);

    timeline.setStopped('user', true);
    expect([...frozen]).toEqual(['learn', 'grow']);
    vi.advanceTimersByTime(60000);
    expect(timeline.playing).toEqual(['learn', 'grow']);

    timeline.setStopped('user', false);
    expect(frozen.size).toBe(0);
    vi.advanceTimersByTime(499);
    expect(timeline.playing).toEqual(['learn', 'grow']);
    vi.advanceTimersByTime(1);
    expect(timeline.playing).toEqual(['learn', 'grow', 'look-ahead']);
    timeline.destroy();
  });

  it('does not advance while the cards are off screen or the tab is hidden', () => {
    const { timeline } = setup();
    timeline.setStopped('offscreen', true);
    timeline.start();
    vi.advanceTimersByTime(30000);
    expect(timeline.playing).toEqual([]);
    expect(timeline.running).toBe(false);

    timeline.setStopped('offscreen', false);
    timeline.setStopped('hidden', true);
    vi.advanceTimersByTime(30000);
    expect(timeline.playing).toEqual([]);

    timeline.setStopped('hidden', false);
    vi.advanceTimersByTime(3000);
    expect(timeline.playing).toEqual(['learn']);
    timeline.destroy();
  });

  it('never plays with reduced motion and returns every card to its summary', () => {
    const { timeline, log } = setup();
    timeline.start();
    vi.advanceTimersByTime(4000);
    expect(timeline.playing).toEqual(['learn', 'grow']);

    log.length = 0;
    timeline.setStopped('reduced-motion', true);
    expect(timeline.playing).toEqual([]);
    expect(log).toEqual(['hold learn', 'hold grow', 'hold look-ahead']);
    vi.advanceTimersByTime(120000);
    expect(log.some((line) => line.startsWith('play'))).toBe(false);
    timeline.destroy();
  });

  it('lets a scene that has not loaded sit out the round', () => {
    const { timeline } = setup({ learn: 13500, grow: null, 'look-ahead': 13500 });
    timeline.start();
    vi.advanceTimersByTime(5000);
    expect(timeline.playing).toEqual(['learn', 'look-ahead']);
    vi.advanceTimersByTime(13500);
    expect(timeline.playing).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(timeline.playing).toEqual(['learn']);
    timeline.destroy();
  });
});
