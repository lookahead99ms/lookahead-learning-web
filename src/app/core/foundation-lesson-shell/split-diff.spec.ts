import { changeCount, DiffRow, fileRows, pairFiles, similarity, splitDiff } from './split-diff';

/** Compact view of rows: "=" same, "-" removed, "+" added, "." filler; left|right with line numbers. */
function shape(rows: DiffRow[]): string[] {
  const side = (cell: DiffRow['left']) => (cell ? `${{ same: '=', del: '-', add: '+' }[cell.kind]}${cell.line}` : '.');
  return rows.map((row) => `${side(row.left)}|${side(row.right)}`);
}

const tab = (title: string, source: string, language = 'java') => ({ title, source, language });

describe('splitDiff', () => {
  it('starts both sides on the same first line and keeps unchanged lines side by side', () => {
    const before = 'a\nb\nc\n';
    expect(shape(splitDiff(before, before))).toEqual(['=1|=1', '=2|=2', '=3|=3']);
  });

  it('pairs a changed block row by row, removed lines on the left and added lines on the right', () => {
    const rows = splitDiff('while (fast != null) {\n  step();\n}', 'while (fast != null && fast.next != null) {\n  step();\n}');
    expect(shape(rows)).toEqual(['-1|+1', '=2|=2', '=3|=3']);
    expect(rows[0].left?.text).toBe('while (fast != null) {');
    expect(rows[0].right?.text).toBe('while (fast != null && fast.next != null) {');
  });

  it('pads the shorter side of a changed block with filler rows', () => {
    expect(shape(splitDiff('a\nx\nz', 'a\ny1\ny2\ny3\nz'))).toEqual(['=1|=1', '-2|+2', '.|+3', '.|+4', '=3|=5']);
    expect(shape(splitDiff('a\nx1\nx2\nz', 'a\nz'))).toEqual(['=1|=1', '-2|.', '-3|.', '=4|=2']);
  });

  it('treats a class renamed after its file as unchanged, so only the real fix is marked', () => {
    const before = 'public class NoNextCheck {\n    while (fast != null) {}\n}';
    const after = 'public class NextChecked {\n    while (fast != null && fast.next != null) {}\n}';
    expect(shape(splitDiff(before, after, 'NoNextCheck.java', 'NextChecked.java'))).toEqual(['=1|=1', '-2|+2', '=3|=3']);
    // Python and Go file names are snake case; a name used in the code still matches.
    expect(shape(splitDiff('print("no_next_check")', 'print("next_checked")', 'no_next_check.py', 'next_checked.py'))).toEqual(['=1|=1']);
  });

  it('ignores trailing spaces and a final newline, but not indentation', () => {
    expect(shape(splitDiff('a  \nb\n', 'a\nb'))).toEqual(['=1|=1', '=2|=2']);
    expect(shape(splitDiff('  a', '    a'))).toEqual(['-1|+1']);
  });

  it('keeps long lines whole (the page wraps them) and very different programs aligned row by row', () => {
    const long = `String message = "${'x'.repeat(240)}";`;
    expect(splitDiff(long, long)[0].left?.text).toBe(long);
    const rows = splitDiff('one\ntwo\nthree', 'alpha\nbeta');
    expect(shape(rows)).toEqual(['-1|+1', '-2|+2', '-3|.']);
    expect(changeCount(rows)).toEqual({ removed: 3, added: 2 });
  });

  it('falls back to one changed block for very large files instead of a slow comparison', () => {
    const big = (prefix: string) => Array.from({ length: 600 }, (_, index) => `${prefix}${index}`).join('\n');
    const rows = splitDiff(big('a'), big('a'));
    expect(rows.length).toBe(600);
    expect(rows.every((row) => row.left?.kind === 'del' && row.right?.kind === 'add')).toBe(true);
  });
});

describe('pairFiles', () => {
  it('matches files by name, keeps a file only the broken side has, and adds a file only the fix has', () => {
    const files = pairFiles(
      [tab('application.properties', 'a=1', 'properties'), tab('ShortUrlService.java', 'class S {}'), tab('ViralLinkTest.java', 'class T {}')],
      [tab('application.properties', 'a=2', 'properties'), tab('ShortUrlService.java', 'class S { int x; }')],
    );
    expect(files.map((file) => [file.label, !!file.broken, !!file.fixed])).toEqual([
      ['application.properties', true, true],
      ['ShortUrlService.java', true, true],
      ['ViralLinkTest.java', true, false],
    ]);
  });

  it('pairs a program renamed by its fix when one file is left on each side', () => {
    const [file] = pairFiles([tab('NullMatch.java', 'class NullMatch {}')], [tab('OptionalMatch.java', 'record X() {}')]);
    expect(file.label).toBe('NullMatch.java → OptionalMatch.java');
    expect(file.fixed?.title).toBe('OptionalMatch.java');
  });

  it('pairs a renamed file by its shared lines when several are left, and never across languages', () => {
    const test = (name: string, last: string) =>
      `class ${name} {\n  void check() {\n    var demand = mock(DemandSource.class);\n    var sink = mock(QuoteSink.class);\n    ${last}\n  }\n}`;
    const files = pairFiles(
      [tab('SurgePricing.java', 'class SurgePricing {\n  int quote() { return 1; }\n}'), tab('QuoteOrderTest.java', test('QuoteOrderTest', 'order.verify();'))],
      [tab('BusyZoneQuoteTest.java', test('BusyZoneQuoteTest', 'assertEquals(2500, cents);'))],
    );
    expect(files.map((file) => file.label)).toEqual(['SurgePricing.java', 'QuoteOrderTest.java → BusyZoneQuoteTest.java']);
    const docker = pairFiles(
      [tab('SendsEverything.py', 'import os\nsend(os.listdir())\nprint("done")', 'python'), tab('Dockerfile', 'COPY . .', 'dockerfile')],
      [tab('SendsOnlyWhatIsNeeded.py', 'import os\nsend(needed())\nprint("done")', 'python'), tab('.dockerignore', '.git', 'text')],
    );
    expect(docker.map((file) => file.label)).toEqual(['SendsEverything.py → SendsOnlyWhatIsNeeded.py', 'Dockerfile', '.dockerignore']);
    expect(docker[1].fixed).toBeNull();
    expect(docker[2].broken).toBeNull();
  });

  it('leaves unrelated files apart', () => {
    const files = pairFiles([tab('A.java', 'one\ntwo\nthree'), tab('B.java', 'b')], [tab('C.java', 'x\ny\nz')]);
    expect(files.map((file) => file.label)).toEqual(['A.java', 'B.java', 'C.java']);
    expect(similarity('one\ntwo\nthree', 'x\ny\nz')).toBe(0);
  });
});

describe('fileRows', () => {
  it('shows a file the fix adds as added lines only, and a file it leaves alone as unchanged lines', () => {
    expect(shape(fileRows({ label: '.dockerignore', broken: null, fixed: tab('.dockerignore', '.git\nnode_modules', 'text') }))).toEqual(['.|+1', '.|+2']);
    const kept = fileRows({ label: 'Test.java', broken: tab('Test.java', 'class T {}'), fixed: null });
    expect(shape(kept)).toEqual(['=1|.']);
    expect(changeCount(kept)).toEqual({ removed: 0, added: 0 });
  });

  it('shows a file the fix deletes as removed lines only', () => {
    const gone = fileRows({ label: 'old_test.go', broken: tab('old_test.go', 'package a\nfunc T() {}', 'go'), fixed: null }, true);
    expect(shape(gone)).toEqual(['-1|.', '-2|.']);
    expect(changeCount(gone)).toEqual({ removed: 2, added: 0 });
  });
});
