import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DsaProblemV2 } from '../../content/content.models';
import { StudioFallbackWalkthrough } from './studio-fallback-walkthrough';

/** Container With Most Water as the story-failure fallback draws it: conceptual frames. */
function containerWater(): DsaProblemV2 {
  return {
    id: 'algorithmic-container-water',
    title: 'Container With Most Water',
    complexity: { time: 'O(n)', space: 'O(1)', why: '' },
    fixtures: [
      {
        id: 'standard',
        label: 'Standard',
        input: 'heights = [1,8,6,2,5,4,8,3,7]',
        expectedOutput: '49',
        arguments: { heights: [1, 8, 6, 2, 5, 4, 8, 3, 7] },
      },
    ],
    implementations: [{ language: 'java', title: 'Java', lines: [{ id: 'j-1', text: 'int maxArea() {}' }] }],
    practice: { canonicalApproach: { whyThisApproach: 'Move the shorter wall inward.' } },
    invariantAdaptation: '',
    trace: { schemaVersion: 'guided-trace/v1', id: 't', fixtureId: 'standard', invariant: '', legend: [], events: [], languagePaths: {} },
    fixtureTraces: [],
  } as unknown as DsaProblemV2;
}

function render(problem: DsaProblemV2 = containerWater()) {
  const fixture = TestBed.createComponent(StudioFallbackWalkthrough);
  fixture.componentRef.setInput('problem', problem);
  fixture.componentRef.setInput('fixtureId', 'standard');
  fixture.componentRef.setInput('language', 'java');
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const next = () => {
    element.querySelector<HTMLButtonElement>('button[aria-label="Next step"]')!.click();
    fixture.detectChanges();
  };
  const count = () => element.querySelector('.step-count')?.textContent?.trim();
  return { fixture, element, next, count };
}

describe('StudioFallbackWalkthrough', () => {
  it('keeps the conceptual step across a tab switch (the walkthrough is destroyed and rebuilt)', () => {
    const first = render();
    first.next();
    first.next();
    const at = first.count();
    expect(at).toMatch(/^Step 3 of \d+$/);
    first.fixture.destroy();
    const again = render();
    expect(again.count()).toBe(at);
  });

  it('draws the recorded state without the input tables inside the player', () => {
    const { element } = render({ ...containerWater(), id: 'algorithmic-heights' } as DsaProblemV2);
    expect(element.querySelector('app-studio-diagram')).not.toBeNull();
    expect(element.querySelector('.input-data')).toBeNull();
  });
});
