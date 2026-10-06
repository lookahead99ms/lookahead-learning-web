import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORY_HOLD_MS, STORY_PAUSED_KEY, StoryPlayer } from './story-player';

function memory(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}

describe('StoryPlayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('autoplays in view, holds the last frame for 5 s, then loops', () => {
    const player = new StoryPlayer(() => 3, () => 1000);
    player.setVisible(true);
    expect(player.playing()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(player.index()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(player.index()).toBe(2);
    vi.advanceTimersByTime(STORY_HOLD_MS - 1);
    expect(player.index()).toBe(2);
    vi.advanceTimersByTime(1);
    expect(player.index()).toBe(0);
  });

  it('stops when scrolled away', () => {
    const player = new StoryPlayer(() => 3, () => 1000);
    player.setVisible(true);
    player.setVisible(false);
    expect(player.playing()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(player.index()).toBe(0);
  });

  it('never autoplays with reduced motion, but Play still works', () => {
    const player = new StoryPlayer(() => 3, () => 1000, () => true);
    player.setVisible(true);
    expect(player.playing()).toBe(false);
    player.toggle();
    expect(player.playing()).toBe(true);
    vi.advanceTimersByTime(350);
    expect(player.index()).toBe(1);
  });

  it('remembers a pause and does not autoplay afterwards', () => {
    const storage = memory();
    const player = new StoryPlayer(() => 3, () => 1000, () => false, storage);
    player.setVisible(true);
    player.toggle();
    expect(storage.values[STORY_PAUSED_KEY]).toBe('1');
    const next = new StoryPlayer(() => 3, () => 1000, () => false, storage);
    next.setVisible(true);
    expect(next.playing()).toBe(false);
  });

  it('manual stepping pauses and clamps to the story', () => {
    const player = new StoryPlayer(() => 3, () => 1000);
    player.setVisible(true);
    player.next();
    expect(player.playing()).toBe(false);
    expect(player.index()).toBe(1);
    player.go(99);
    expect(player.index()).toBe(2);
    player.previous();
    player.restart();
    expect(player.index()).toBe(0);
  });

  it('Play from the last step starts over', () => {
    const player = new StoryPlayer(() => 3, () => 1000);
    player.go(2);
    player.toggle();
    expect(player.index()).toBe(0);
    expect(player.playing()).toBe(true);
  });

  describe('with autoplay off (Visual walkthrough, option B)', () => {
    it('never starts on its own, even with a remembered "not paused" choice', () => {
      const storage = memory({ [STORY_PAUSED_KEY]: '0' });
      const player = new StoryPlayer(() => 3, () => 1000, () => false, storage, { autoplay: false });
      player.setVisible(true);
      expect(player.playing()).toBe(false);
      vi.advanceTimersByTime(10_000);
      expect(player.index()).toBe(0);
    });

    it('Play runs to the last step and stops there instead of looping', () => {
      const player = new StoryPlayer(() => 3, () => 1000, () => false, null, { autoplay: false });
      player.toggle();
      expect(player.playing()).toBe(true);
      vi.advanceTimersByTime(350);
      expect(player.index()).toBe(1);
      vi.advanceTimersByTime(1000);
      expect(player.index()).toBe(2);
      expect(player.playing()).toBe(false);
      vi.advanceTimersByTime(STORY_HOLD_MS * 2);
      expect(player.index()).toBe(2);
      // Play from the end starts over.
      player.toggle();
      expect(player.index()).toBe(0);
      expect(player.playing()).toBe(true);
      player.toggle();
      expect(player.playing()).toBe(false);
    });

    it('still pauses when scrolled away', () => {
      const player = new StoryPlayer(() => 4, () => 1000, () => false, null, { autoplay: false });
      player.toggle();
      player.setVisible(false);
      expect(player.playing()).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(player.index()).toBe(0);
    });
  });
});
