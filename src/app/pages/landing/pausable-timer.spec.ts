import { vi } from 'vitest';
import { PausableTimer, freezeAnimations } from './pausable-timer';

describe('PausableTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs after its time, and only once', () => {
    const run = vi.fn();
    const timer = new PausableTimer();
    timer.start(run, 1000);
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    timer.resume();
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('pauses with the time left and carries on from there', () => {
    const run = vi.fn();
    const timer = new PausableTimer();
    timer.start(run, 1000);
    vi.advanceTimersByTime(600);
    timer.pause();
    timer.pause();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
    timer.resume();
    timer.resume();
    vi.advanceTimersByTime(399);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('replaces what was waiting when started again, and forgets it when cleared', () => {
    const first = vi.fn();
    const second = vi.fn();
    const timer = new PausableTimer();
    timer.start(first, 1000);
    timer.start(second, 500);
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    timer.start(first, 500);
    timer.clear();
    timer.resume();
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
  });
});

describe('freezeAnimations', () => {
  it('pauses only running animations and plays just those again', () => {
    const running = { playState: 'running', pause: vi.fn(), play: vi.fn() };
    const finished = { playState: 'finished', pause: vi.fn(), play: vi.fn() };
    const root = { getAnimations: vi.fn(() => [running, finished]) } as unknown as Element;
    const resume = freezeAnimations(root);
    expect(root.getAnimations).toHaveBeenCalledWith({ subtree: true });
    expect(running.pause).toHaveBeenCalledTimes(1);
    expect(finished.pause).not.toHaveBeenCalled();
    resume();
    expect(running.play).toHaveBeenCalledTimes(1);
    expect(finished.play).not.toHaveBeenCalled();
  });

  it('does nothing where the browser cannot list animations', () => {
    expect(() => freezeAnimations({} as Element)()).not.toThrow();
  });
});
