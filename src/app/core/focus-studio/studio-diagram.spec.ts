import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StudioDiagram } from './studio-diagram';

describe('tree traversal diagram', () => {
  it('labels inputs and renders the recorded queue, parent map, and active nodes', () => {
    const component = TestBed.createComponent(StudioDiagram);
    component.componentRef.setInput('problem', {
      id: 'algorithmic-print-all-nodes-distance-k',
      fixtures: [
        {
          id: 'distance-two',
          label: 'Distance two',
          input: 'root = [3,5,1,6,2,0,8,null,null,7,4], target = 5, k = 2',
          category: 'representative',
          explanation: 'Nodes two edges away from five are returned.',
          arguments: {
            root: [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4],
            target: 5,
            k: 2,
          },
          expectedOutput: '[7,4,1]',
        },
      ],
      implementations: [
        {
          language: 'python',
          lines: [{ id: 'visit', text: 'node = queue.popleft()' }],
        },
      ],
    });
    component.componentRef.setInput('fixture', {
      id: 'distance-two',
      label: 'Distance two',
      input: 'root = [3,5,1,6,2,0,8,null,null,7,4], target = 5, k = 2',
      category: 'representative',
      explanation: 'Nodes two edges away from five are returned.',
      arguments: {
        root: [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4],
        target: 5,
        k: 2,
      },
      expectedOutput: '[7,4,1]',
    });
    component.componentRef.setInput('pattern', 'trees');
    component.componentRef.setInput('language', 'python');
    component.componentRef.setInput('linked', true);
    const variables = [
      { name: 'parent', value: '{"5":{"value":3},"2":{"value":5}}' },
      { name: 'queue', value: '[{"value":6},{"value":2}]' },
      { name: 'start', value: '{"value":5}' },
      { name: 'node', value: '{"value":2}' },
      { name: 'seen', value: '[{"value":5},{"value":6},{"value":2}]' },
      { name: 'distance', value: '1' },
      { name: 'neighbor', value: '{"value":7}' },
    ];
    const event = { sourceAnchor: { python: 'visit' }, variables };
    component.componentRef.setInput('snapshot', {
      step: 0,
      events: [event],
      event,
      variables,
    });

    component.detectChanges();
    const root = component.nativeElement as HTMLElement;
    expect(
      [...root.querySelectorAll('.input-entry h4')].map((item) => item.textContent?.trim()),
    ).toEqual(['Input root', 'Input target', 'Input k']);
    expect(root.querySelector('.queue-view')?.textContent).toContain('Distance BFS queue');
    expect(root.querySelector('.queue-view')?.textContent).toContain('front6');
    expect(root.querySelector('.queue-view')?.textContent).toContain('back2');
    expect(root.querySelector('.tree-facts')?.textContent).toContain('Current node2');
    expect(root.querySelector('.tree-facts')?.textContent).toContain('Neighbor under review7');
    expect(root.querySelector('.parent-links')?.textContent).toContain('2 links');
    expect(root.querySelectorAll('circle.current')).toHaveLength(1);
  });
});
