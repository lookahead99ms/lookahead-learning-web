import { describe, expect, it } from 'vitest';
import { PracticeTimer, defaultTimerMinutes } from './practice-tools';

describe('practice timer defaults', () => {
  it('follows the problem difficulty: Beginner 15, Intermediate 25, Advanced 45 minutes', () => {
    expect(defaultTimerMinutes('Beginner')).toBe(15);
    expect(defaultTimerMinutes('Intermediate')).toBe(25);
    expect(defaultTimerMinutes('Advanced')).toBe(45);
    expect(defaultTimerMinutes(undefined)).toBe(25);
  });

  it('uses the difficulty default for a new problem and keeps a length the learner chose', () => {
    const memory = new Map<string, string>();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
    } as unknown as Storage;
    const timer = new PracticeTimer(store);
    timer.load('beginner-problem', 15);
    expect(timer.minutes()).toBe(15);
    expect(timer.clock()).toBe('15:00');
    timer.setMinutes(45);
    timer.load('another-problem', 25);
    expect(timer.minutes()).toBe(25);
    timer.load('beginner-problem', 15);
    expect(timer.minutes()).toBe(45);
  });
});
