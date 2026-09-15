import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StudioEssentialState } from './studio-essential-state';

describe('window best answer qualification', () => {
  it('does not present an initialization sentinel as a valid window answer', () => {
    const component = TestBed.createComponent(StudioEssentialState);
    component.componentRef.setInput('problem', {
      id: 'algorithmic-maximum-sum-subarray-size-k',
      implementations: [
        {
          language: 'java',
          lines: [
            { id: 'init', text: 'int sum = 0, best = Integer.MIN_VALUE;' },
            { id: 'add', text: 'sum += values[right];' },
            { id: 'best', text: 'best = Math.max(best, sum);' },
          ],
        },
      ],
    });
    component.componentRef.setInput('fixture', {
      arguments: { values: [-5], k: 1 },
      expectedOutput: '-5',
    });
    component.componentRef.setInput('language', 'java');
    const event = (anchor: string, sum: number, best: number) => ({
      sourceAnchor: { java: anchor },
      variables: [
        { name: 'sum', value: String(sum) },
        { name: 'best', value: String(best) },
        { name: 'right', value: '0' },
      ],
    });
    const initial = event('init', 0, -2147483648);
    component.componentRef.setInput('snapshot', {
      step: 0,
      events: [initial],
      event: initial,
      variables: initial.variables,
    });
    component.detectChanges();
    const bestValue = () => [...component.nativeElement.querySelectorAll('dt')]
      .find((term: any) => term.textContent === 'Best valid sum')?.nextElementSibling?.textContent;
    expect(bestValue()).toBe('Not yet');
    const events = [initial, event('add', -5, -2147483648), event('best', -5, -5)];
    component.componentRef.setInput('snapshot', {
      step: 2,
      events,
      event: events[2],
      variables: events[2].variables,
    });
    component.detectChanges();
    expect(bestValue()).toBe('-5');
  });
});
