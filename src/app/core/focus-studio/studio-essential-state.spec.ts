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
    const bestValue = () =>
      [...component.nativeElement.querySelectorAll('dt')].find(
        (term: any) => term.textContent === 'Best valid sum',
      )?.nextElementSibling?.textContent;
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

describe('tree traversal essential state', () => {
  it('shows the recorded queue and tree locals with learner-facing labels', () => {
    const component = TestBed.createComponent(StudioEssentialState);
    component.componentRef.setInput('problem', {
      id: 'algorithmic-print-all-nodes-distance-k',
      implementations: [
        {
          language: 'python',
          lines: [{ id: 'visit', text: 'node = queue.popleft()' }],
        },
      ],
    });
    component.componentRef.setInput('fixture', {
      arguments: { root: [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], target: 5, k: 2 },
      expectedOutput: '[7,4,1]',
    });
    component.componentRef.setInput('language', 'python');
    const variables = [
      { name: 'parent', value: '{"5":{"value":3},"2":{"value":5}}' },
      { name: 'scan', value: '[]' },
      { name: 'queue', value: '[{"value":6},{"value":2}]' },
      { name: 'start', value: '{"value":5}' },
      { name: 'node', value: '{"value":2}' },
      { name: 'seen', value: '[{"value":5},{"value":6},{"value":2}]' },
      { name: 'distance', value: '1' },
      { name: 'neighbor', value: '{"value":7}' },
      { name: 'size', value: '1' },
    ];
    const event = { sourceAnchor: { python: 'visit' }, variables };
    component.componentRef.setInput('snapshot', {
      step: 0,
      events: [event],
      event,
      variables,
    });

    component.detectChanges();
    const fields = new Map(
      [...component.nativeElement.querySelectorAll('dt')].map((term: HTMLElement) => [
        term.textContent?.trim(),
        term.nextElementSibling?.textContent?.trim(),
      ]),
    );
    expect(fields.get('Queue / frontier')).toBe('[6, 2]');
    expect(fields.get('Parent map')).toBe('2 recorded links');
    expect(fields.get('Start node')).toBe('5');
    expect(fields.get('Current node')).toBe('2');
    expect(fields.get('Seen nodes')).toBe('[5, 6, 2]');
    expect(fields.get('Distance')).toBe('1');
    expect(fields.get('Neighbor')).toBe('7');
    expect(fields.get('Nodes remaining at this level')).toBe('1');
    expect(fields.has('Tree scan queue')).toBe(false);
  });
});
