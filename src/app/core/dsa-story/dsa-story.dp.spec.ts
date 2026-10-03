import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DsaStory } from './dsa-story';
import { DsaStoryV1 } from './dsa-story.model';
import { twoSumProblem, twoSumStory } from './dsa-story.fixture';

// DP tables: a 1-D dp array runs from 0 to the target (amount + 1 cells), so it is often much
// longer than the input. Its view asks for the width of every cell, so the target cell (where the
// answer lands) is drawn instead of hidden behind a scrollbar.
function coinChangeLike(): DsaStoryV1 {
  const base = twoSumStory();
  const dp = [0, 1, 1, 2, 2, 1, 2, 2, 3, 3, 2, 3];
  return {
    ...base,
    views: [
      { id: 'coins', kind: 'array', title: 'coins', var: 'coins' },
      { id: 'dp', kind: 'array', title: 'dp', var: 'dp', pointers: [{ var: 'i' }, { var: 'amount' }] },
      { id: 'wide', kind: 'array', title: 'words', var: 'words', cell: 64 },
      { id: 'stack', kind: 'stack', title: 'stack', var: 'stack' },
    ],
    variables: ['coins', 'amount', 'dp', 'i', 'words', 'stack'],
    steps: [
      {
        lines: ['py-2'],
        say: 'Amount {i}.',
        idea: 0,
        marks: { dp: { found: ['@amount'] } },
        state: { coins: [1, 2, 5], amount: 11, dp, i: 11, words: ['ab', 'cd'], stack: [1, 2, 3] },
      },
    ],
  } as DsaStoryV1;
}

function render(story: DsaStoryV1) {
  const fixture = TestBed.createComponent(DsaStory);
  fixture.componentRef.setInput('story', story);
  fixture.componentRef.setInput('problem', twoSumProblem());
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const figure = (title: string) =>
    [...element.querySelectorAll<HTMLElement>('figure.view')].find((node) =>
      node.querySelector('figcaption')?.textContent?.trim().startsWith(title),
    )!;
  return { element, figure };
}

describe('Option B DP tables: a long dp array keeps every cell in view', () => {
  it('gives each array view its cell count, so a long table asks for the width of all its cells', () => {
    const { figure } = render(coinChangeLike());
    expect(figure('coins').style.getPropertyValue('--cells')).toBe('3');
    expect(figure('dp').style.getPropertyValue('--cells')).toBe('12');
    // A view with wider cells passes its cell width up, so the requested width uses it too.
    expect(figure('words').style.getPropertyValue('--cell')).toBe('64px');
    expect(figure('dp').style.getPropertyValue('--cell')).toBe('');
    // A stack is drawn top first, one row per item: no row width to ask for.
    expect(figure('stack').style.getPropertyValue('--cells')).toBe('');
  });

  it('draws the target cell and both pointers on it when the loop reaches the answer', () => {
    const { figure } = render(coinChangeLike());
    const dp = figure('dp');
    expect(dp.querySelectorAll('.cell')).toHaveLength(12);
    expect(dp.querySelector('.cell.tone-found .i')?.textContent).toBe('11');
    const pointers = [...dp.querySelectorAll<HTMLElement>('.pointer')].map((node) => [
      node.textContent?.replace('▲', '').trim(),
      node.style.getPropertyValue('--i'),
      node.style.getPropertyValue('--row'),
    ]);
    expect(pointers).toEqual([
      ['i', '11', '0'],
      ['amount', '11', '1'],
    ]);
  });

  it('leaves a short array at the default request (no cell count is missing)', () => {
    const { element } = render(twoSumStory());
    const values = element.querySelector<HTMLElement>('figure.view[data-kind="array"]')!;
    expect(values.style.getPropertyValue('--cells')).toBe('4');
  });
});
