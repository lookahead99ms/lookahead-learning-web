import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TheoryPair } from '../../content/content.models';
import { LessonSplitDiff, PairDiff } from './lesson-split-diff';
import { changeCount, fileRows, pairFiles } from './split-diff';

const tab = (title: string, source: string) => ({ id: title, title, language: 'go', source });

function diffOf(pair: TheoryPair): PairDiff {
  return {
    languages: null,
    brokenOutput: null,
    fixedOutput: null,
    files: pairFiles(pair.broken.codeTabs ?? [], pair.fixed.codeTabs ?? []).map((file) => {
      const deleted = !file.fixed && !!pair.fixed.deletedFiles?.includes(file.broken!.title);
      const rows = fileRows(file, deleted);
      const { removed, added } = changeCount(rows);
      return { label: file.label, language: 'go', broken: file.broken, fixed: file.fixed, rows, renamed: false, deleted, unchanged: !removed && !added, removed, added };
    }),
  };
}

@Component({
  imports: [LessonSplitDiff],
  template: `
    <ng-template #block let-code><pre class="block">{{ code.source }}</pre></ng-template>
    <div appLessonSplitDiff [pair]="pair" [diff]="diff" brokenLabel="What broke" fixedLabel="The fix" [codeBlock]="block" [lessonTable]="block" [runConsole]="block"></div>
  `,
})
class Host {
  pair: TheoryPair = {
    n: 1,
    title: 'Pair',
    problem: [],
    broken: { body: [], codeTabs: [tab('routes.go', 'a\nb'), tab('old_test.go', 'x\ny\nz'), tab('kept_test.go', 'k')] },
    fixed: { body: [], codeTabs: [tab('routes.go', 'a\nc')], deletedFiles: ['old_test.go'] },
  };
  diff = diffOf(this.pair);
}

describe('LessonSplitDiff', () => {
  it('shows a file the fix deletes as removed lines, and only a file it leaves alone as not changed', () => {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const heads = Array.from(root.querySelectorAll('.d-file.d-r'));
    const deleted = heads.find((head) => head.textContent?.includes('Deleted by the fix'))!;
    expect(deleted.querySelector('.d-count')?.getAttribute('aria-label')).toBe('3 lines removed');
    expect(deleted.querySelector('.d-count-del')?.textContent).toBe('−3');
    const folded = Array.from(root.querySelectorAll('details.d-shared summary')).map((summary) => summary.textContent);
    expect(folded.length).toBe(1);
    expect(folded[0]).toContain('kept_test.go');
    expect(folded[0]).toContain('Not changed by the fix');
    expect(root.textContent).not.toContain('old_test.go Not changed');
  });
});
