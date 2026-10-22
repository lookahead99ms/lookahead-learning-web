import {
  isPatternContextToken,
  matchesPatternContext,
  normalizePatternContext,
  patternContextQuery,
  patternContextToken,
  resolvePatternContext,
} from './pattern-context';

// Synthetic pattern ids only.
const ids = ['demo-course:first-unit', 'demo-course:second-unit', 'other-course:third-unit'];

describe('opaque pattern context (DLV-962)', () => {
  it('turns a pattern id into a short opaque id that never contains the id', () => {
    for (const id of ids) {
      const token = patternContextToken(id);
      expect(token).toMatch(/^[01][0-9a-z]{6}$/);
      expect(token).not.toContain('unit');
      expect(token).not.toContain(':');
      expect(isPatternContextToken(token)).toBe(true);
    }
  });

  it('is the same on every call, so reloads, shared links and new tabs agree', () => {
    expect(patternContextToken('demo-course:first-unit')).toBe(
      patternContextToken('demo-course:first-unit'),
    );
    // A fixed value guards the hash itself: changing it would break every shared link.
    expect(patternContextToken('demo-course:first-unit')).toBe('1q49kj1');
  });

  it('gives different patterns different ids', () => {
    expect(new Set(ids.map(patternContextToken)).size).toBe(ids.length);
  });

  it('has no id for no pattern', () => {
    expect(patternContextToken('')).toBe('');
    expect(patternContextToken(null)).toBe('');
    expect(patternContextToken(undefined)).toBe('');
    expect(patternContextQuery('')).toEqual({});
    expect(patternContextQuery(null)).toEqual({});
  });

  it('builds link query params with the opaque id only', () => {
    expect(patternContextQuery('demo-course:first-unit')).toEqual({
      pattern: patternContextToken('demo-course:first-unit'),
    });
  });

  it('never mistakes a readable id for an opaque one', () => {
    for (const value of [...ids, 'arrays', 'hashing', 'sorting', '0-1-bfs', '', null]) {
      expect(isPatternContextToken(value)).toBe(false);
    }
  });

  it('matches the opaque id and the old readable id of a pattern, and nothing else', () => {
    const [first, second] = ids;
    expect(matchesPatternContext(patternContextToken(first), first)).toBe(true);
    expect(matchesPatternContext(first, first)).toBe(true);
    expect(matchesPatternContext(patternContextToken(first), second)).toBe(false);
    expect(matchesPatternContext(second, first)).toBe(false);
    expect(matchesPatternContext('', first)).toBe(false);
    expect(matchesPatternContext(patternContextToken(first), '')).toBe(false);
    expect(matchesPatternContext(null, undefined)).toBe(false);
  });

  it('resolves a value to the pattern id it names among the known ones', () => {
    expect(resolvePatternContext(patternContextToken(ids[1]), ids)).toBe(ids[1]);
    expect(resolvePatternContext(ids[2], ids)).toBe(ids[2]);
    expect(resolvePatternContext(patternContextToken('demo-course:unknown'), ids)).toBeNull();
    expect(resolvePatternContext('', ids)).toBeNull();
    expect(resolvePatternContext(null, ids)).toBeNull();
  });

  it('normalises an old readable id to the opaque id and keeps an opaque id as it is', () => {
    const token = patternContextToken(ids[0]);
    expect(normalizePatternContext(ids[0])).toBe(token);
    expect(normalizePatternContext(token)).toBe(token);
    expect(normalizePatternContext('')).toBe('');
  });
});
