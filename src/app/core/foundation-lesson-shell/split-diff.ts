/**
 * Split ("side by side") diff of a Debug pair: the broken program on the left, the fix on the right, one row
 * per line, as a code review shows it. Rows start on the same first line; an unchanged line sits beside its
 * twin, a changed block pairs removed and added lines row by row and pads the shorter side with filler rows.
 */
export type DiffKind = 'same' | 'del' | 'add';

export interface DiffCell {
  /** 1-based line number in its own file. */
  line: number;
  text: string;
  kind: DiffKind;
}

/** One row of the split view; null is a filler cell (the other side has more lines in this block). */
export interface DiffRow {
  left: DiffCell | null;
  right: DiffCell | null;
}

/** Above this many line comparisons the diff falls back to a plain changed block (keeps rendering cheap). */
const MAX_CELLS = 250_000;

function stem(fileName: string | undefined): string {
  return (fileName ?? '').replace(/^.*\//, '').replace(/\.[^.]+$/, '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The comparison key of a line: trailing spaces dropped, and the file's own name (a Java class named after its
 * file, e.g. NoNextCheck vs NextChecked) replaced by one placeholder, so a renamed class is not a change.
 */
function keys(lines: string[], fileName: string | undefined, otherName: string | undefined): string[] {
  const own = stem(fileName);
  const other = stem(otherName);
  const rename = own && other && own !== other ? new RegExp(`\\b${escapeRegExp(own)}\\b`, 'g') : null;
  return lines.map((line) => {
    const trimmed = line.replace(/\s+$/, '');
    return rename ? trimmed.replace(rename, '\u0000') : trimmed;
  });
}

function splitLines(source: string): string[] {
  return source.replace(/\n$/, '').split('\n');
}

/** Longest common subsequence of line keys, as index pairs in order. */
function commonLines(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_CELLS) return [];
  // suffix[i][j]: LCS length of a[i..] and b[j..], stored row-major in one array.
  const width = m + 1;
  const suffix = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      suffix[i * width + j] =
        a[i] === b[j]
          ? suffix[(i + 1) * width + j + 1] + 1
          : Math.max(suffix[(i + 1) * width + j], suffix[i * width + j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (suffix[(i + 1) * width + j] >= suffix[i * width + j + 1]) {
      i++; // removed lines come before added lines in a block, as in git
    } else {
      j++;
    }
  }
  return pairs;
}

/** Rows of the split view for one file before (broken) and after (fixed). */
export function splitDiff(before: string, after: string, beforeName?: string, afterName?: string): DiffRow[] {
  const left = splitLines(before);
  const right = splitLines(after);
  const matches = commonLines(keys(left, beforeName, afterName), keys(right, afterName, beforeName));
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  const changedBlock = (toI: number, toJ: number) => {
    const count = Math.max(toI - i, toJ - j);
    for (let k = 0; k < count; k++) {
      rows.push({
        left: i + k < toI ? { line: i + k + 1, text: left[i + k], kind: 'del' } : null,
        right: j + k < toJ ? { line: j + k + 1, text: right[j + k], kind: 'add' } : null,
      });
    }
    i = toI;
    j = toJ;
  };
  for (const [mi, mj] of matches) {
    changedBlock(mi, mj);
    rows.push({ left: { line: mi + 1, text: left[mi], kind: 'same' }, right: { line: mj + 1, text: right[mj], kind: 'same' } });
    i = mi + 1;
    j = mj + 1;
  }
  changedBlock(left.length, right.length);
  return rows;
}

/** A file of a Debug pair: matched on both sides, or shown on one side only. */
export interface DiffFile<T> {
  /** File name, or "Old.java → New.java" when the fix renamed the file. */
  label: string;
  broken: T | null;
  fixed: T | null;
}

/** Below this share of common lines, two differently named files are not treated as one renamed file. */
const RENAME_SIMILARITY = 0.3;

/** Share of lines two programs have in common (0 to 1), comparing lines as the diff does. */
export function similarity(before: string, after: string, beforeName?: string, afterName?: string): number {
  const left = splitLines(before);
  const right = splitLines(after);
  const common = commonLines(keys(left, beforeName, afterName), keys(right, afterName, beforeName)).length;
  return (2 * common) / (left.length + right.length);
}

/**
 * Pairs the files of a broken side with the files of its fix, as a code review would: the same file name first;
 * then renamed files, the most similar pairs of the same language that share at least 30% of their lines (or, when
 * exactly one file is left on each side, those two); anything else is shown on one side only. A file only on the
 * broken side is one the fix leaves alone (often the check that both versions run) unless the fixed side names it in
 * `deletedFiles`; a file only on the fixed side
 * is one the fix adds. Broken order first, then new files.
 */
export function pairFiles<T extends { title: string; source: string; language?: string }>(
  broken: readonly T[],
  fixed: readonly T[],
): DiffFile<T>[] {
  const files: DiffFile<T>[] = [];
  const freeFixed = [...fixed];
  const unmatched: DiffFile<T>[] = [];
  for (const tab of broken) {
    const index = freeFixed.findIndex((other) => other.title === tab.title);
    const file: DiffFile<T> = { label: tab.title, broken: tab, fixed: null };
    if (index >= 0) {
      file.fixed = freeFixed[index];
      freeFixed.splice(index, 1);
    } else {
      unmatched.push(file);
    }
    files.push(file);
  }
  const rename = (file: DiffFile<T>, other: T) => {
    file.fixed = other;
    file.label = `${file.broken!.title} → ${other.title}`;
    freeFixed.splice(freeFixed.indexOf(other), 1);
  };
  if (unmatched.length === 1 && freeFixed.length === 1) {
    rename(unmatched[0], freeFixed[0]);
  } else {
    // Best matches first, so a file that merely shares a class line does not take another file's real rename.
    const candidates: { file: DiffFile<T>; other: T; score: number }[] = [];
    for (const file of unmatched) {
      for (const other of freeFixed) {
        if ((other.language ?? '') !== (file.broken!.language ?? '')) continue;
        const score = similarity(file.broken!.source, other.source, file.broken!.title, other.title);
        if (score >= RENAME_SIMILARITY) candidates.push({ file, other, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const { file, other } of candidates) {
      if (!file.fixed && freeFixed.includes(other)) rename(file, other);
    }
  }
  for (const tab of freeFixed) files.push({ label: tab.title, broken: null, fixed: tab });
  return files;
}

/**
 * Rows of one file of a pair: the split diff when both sides have it; all added lines for a file the fix adds;
 * the file as unchanged lines on the broken side when the fix leaves it alone, or as removed lines when the fix
 * deletes it.
 */
export function fileRows<T extends { title: string; source: string }>(file: DiffFile<T>, deleted = false): DiffRow[] {
  if (file.broken && file.fixed) return splitDiff(file.broken.source, file.fixed.source, file.broken.title, file.fixed.title);
  if (file.fixed) return splitLines(file.fixed.source).map((text, index) => ({ left: null, right: { line: index + 1, text, kind: 'add' } }));
  const kind = deleted ? 'del' : 'same';
  return splitLines(file.broken!.source).map((text, index) => ({ left: { line: index + 1, text, kind }, right: null }));
}

/** Lines removed from the broken side and added on the fixed side. */
export function changeCount(rows: readonly DiffRow[]): { removed: number; added: number } {
  let removed = 0;
  let added = 0;
  for (const row of rows) {
    if (row.left?.kind === 'del') removed++;
    if (row.right?.kind === 'add') added++;
  }
  return { removed, added };
}
