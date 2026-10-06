import { describe, expect, it } from 'vitest';
import { focusStudioPattern } from './focus-studio-pilot';

const family = (title: string, variation = '', tags: string[] = []) =>
  focusStudioPattern({ id: 'catalog-problem', title, variation, tags });

describe('Focus Studio family classification', () => {
  it('matches family words only as whole words', () => {
    // These titles once matched inside longer words: en-trie-s, s-tree-t, c-heap-est, lexico-graph-ic.
    expect(family('Count Interesting Modular Subarrays', 'Selected-entries prefix counts', ['Prefix State'])).toBe(
      'prefix-sum',
    );
    expect(family('Street Lamps', 'Lamp counts')).toBe('generic');
    expect(family('Cheapest Flights Within K Stops', 'Layered Bellman-Ford rounds', ['Advanced Graphs'])).toBe(
      'graphs',
    );
    expect(family('Next Lexicographic Permutation', 'Pivot, swap, reverse', ['Arrays'])).toBe('arrays');
    expect(family('Haystack Search', 'Scan')).toBe('generic');
    expect(family('Bitmap Mapping', 'Bits')).toBe('maps');
  });

  it('keeps plurals, hyphenated forms and the sub- prefix in their family', () => {
    expect(family('Subtree of Another Tree')).toBe('trees');
    expect(family('Merge Subtrees')).toBe('trees');
    expect(family('Word Search', 'Trie-guided search')).toBe('trees');
    expect(family('Prefix Tries')).toBe('trees');
    expect(family('Kth Largest', 'Min-heap of size k')).toBe('heaps');
    expect(family('Task Order', 'Priority queues')).toBe('heaps');
    expect(family('Maximum Subarray')).toBe('arrays');
    expect(family('Max Sliding Windows')).toBe('sliding-window');
    expect(family('Two-stack queue')).toBe('stacks');
    expect(family('Network Delay', 'Shortest paths')).toBe('graphs');
    expect(family('Climbing Steps', 'Linear recurrences')).toBe('dynamic-programming');
    expect(family('Range Updates', 'Difference arrays')).toBe('prefix-sum');
    expect(family('Group Anagrams', 'Hashing by sorted key')).toBe('maps');
    expect(family('Spiral Matrix')).toBe('arrays');
  });
});
