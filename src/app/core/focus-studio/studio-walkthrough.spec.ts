import { describe, expect, it } from 'vitest';
import { DsaProblemFixtureV2 } from '../../content/content.models';
import { conceptualFrames } from './studio-walkthrough';

const fixture = (argumentsValue: DsaProblemFixtureV2['arguments']) =>
  ({ arguments: argumentsValue }) as DsaProblemFixtureV2;
describe('conceptual playback boundaries', () => {
  it('evaluates only exact-k windows, retaining negative answers and explicit transient membership', () => {
    const frames = conceptualFrames('window', fixture({ values: [-5, -2, -7, -1], k: 2 }));
    expect(frames[0].best).toBeNull();
    expect(frames.at(-1)?.best).toBe(-7);
    expect(
      frames
        .filter((frame) => frame.evaluated)
        .every((frame) => frame.right - frame.left + 1 === 2),
    ).toBe(true);
    expect(frames.some((frame) => frame.right - frame.left + 1 === 3 && !frame.evaluated)).toBe(
      true,
    );
    for (const frame of frames)
      expect(frame.total).toBe(
        frame.values.slice(frame.left, frame.right + 1).reduce((sum, value) => sum + value, 0),
      );
  });
  it('handles k=1 and k=n without inventing an initial zero answer', () => {
    expect(conceptualFrames('window', fixture({ values: [-4, 2, -1], k: 1 })).at(-1)?.best).toBe(2);
    expect(conceptualFrames('window', fixture({ values: [2, -1, 3], k: 3 })).at(-1)?.best).toBe(4);
    expect(conceptualFrames('window', fixture({ values: [-3], k: 1 })).at(-1)?.best).toBe(-3);
  });
  it('separates measuring a pair from recording best and preserves the final measured geometry', () => {
    const frames = conceptualFrames('container', fixture({ heights: [1, 8, 6, 2, 5, 4, 8, 3, 7] }));
    expect(frames[0].evaluated).toBe(false);
    expect(frames[0].best).toBe(0);
    expect(frames[1].evaluated).toBe(true);
    expect(frames[1].best).toBe(8);
    expect(frames.at(-1)?.best).toBe(49);
    expect(frames.at(-1)?.bestRange).toEqual([1, 8]);
    expect(frames.at(-1)?.done).toBe(true);
    for (const frame of frames)
      expect(frame.total).toBe(
        (frame.right - frame.left) * Math.min(frame.values[frame.left], frame.values[frame.right]),
      );
  });
  it('keeps zero and equal-height pairs valid and avoids 32-bit truncation', () => {
    expect(conceptualFrames('container', fixture({ heights: [0, 0] })).at(-1)?.best).toBe(0);
    expect(conceptualFrames('container', fixture({ heights: [1e9, 0, 0, 1e9] })).at(-1)?.best).toBe(
      3e9,
    );
    const frames = conceptualFrames('container', fixture({ heights: [4, 2, 4] }));
    expect(frames[2].left).toBe(1);
  });
});
