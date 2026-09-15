import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StudioInspector } from './studio-inspector';

describe('recorded collection presentation', () => {
  it('discloses an opaque deque reference instead of presenting it as queue contents', () => {
    const component = TestBed.createComponent(StudioInspector);
    component.componentRef.setInput('problem', {
      implementations: [
        { language: 'python', lines: [{ id: 'line', text: 'levels, queue = [], deque(root)' }] },
      ],
    });
    component.componentRef.setInput('fixture', {
      arguments: { root: [3, 9, 20] },
      expectedOutput: '[[3],[9,20]]',
    });
    component.componentRef.setInput('language', 'python');
    component.componentRef.setInput('snapshot', {
      step: 0,
      events: [],
      rows: [],
      unavailable: null,
      event: { sourceAnchor: { python: 'line' } },
      variables: [{ name: 'queue', type: 'string', value: '"deque"' }],
    });
    component.detectChanges();
    const section = component.nativeElement.querySelector('.inspector-section') as HTMLElement;
    expect(section.textContent).toContain("does not include this collection's contents");
    expect(section.querySelector('app-studio-state-values')).toBeNull();
    expect(
      component.nativeElement.querySelectorAll('.inspector-inputs .indexed-cell'),
    ).toHaveLength(3);
  });
});
