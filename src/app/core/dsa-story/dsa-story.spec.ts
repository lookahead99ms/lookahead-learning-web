import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReferenceLanguageService } from '../reference-language';
import { DsaStory } from './dsa-story';
import { twoSumProblem, twoSumStory } from './dsa-story.fixture';

function render() {
  const fixture = TestBed.createComponent(DsaStory);
  fixture.componentRef.setInput('story', twoSumStory());
  fixture.componentRef.setInput('problem', twoSumProblem());
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const click = (label: string) => {
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === label || button.getAttribute('aria-label') === label)!
      .click();
    fixture.detectChanges();
  };
  return { fixture, element, click };
}

describe('DsaStory', () => {
  it('shows the approach, every view, every variable and the caption', () => {
    const { element } = render();
    expect(element.querySelector('.approach-box')?.textContent).toContain('One pass with a hash map.');
    expect(element.querySelector('.approach-box')?.textContent).toContain('Time O(n)');
    const captions = [...element.querySelectorAll('.view figcaption')].map((node) => node.textContent?.trim());
    expect(captions[0]).toContain('values');
    expect(captions[1]).toContain('seen');
    expect(captions.at(-1)).toContain('Variables');
    const names = [...element.querySelectorAll('.variable dt')].map((node) => node.textContent?.trim());
    expect(names).toEqual(['values', 'target', 'seen', 'index', 'value', 'need', 'result']);
    expect(element.querySelector('.caption')?.textContent?.trim()).toBe('seen starts empty.');
    expect(element.querySelector('.step-count')?.textContent?.trim()).toBe('Step 1 of 6');
  });

  it('steps forward: pointer, tones, changed values, text alternative and code line all move', () => {
    const { element, click } = render();
    click('Next step');
    click('Next step');
    expect(element.querySelector('.step-count')?.textContent?.trim()).toBe('Step 3 of 6');
    expect(element.querySelector('.caption')?.textContent?.trim()).toBe('Is 7 in seen? No.');
    expect(element.querySelector('.entry.tone-miss')?.textContent).toContain('7');
    expect(element.querySelector('.cell.tone-active .v')?.textContent).toBe('2');
    const summaries = [...element.querySelectorAll('.view .sr-only')].map((node) => node.textContent);
    expect(summaries[1]).toContain('Looked up 7: not present.');
    click('Next step');
    const changed = [...element.querySelectorAll('.variable.changed dt')].map((node) => node.textContent?.trim());
    expect(changed).toEqual(['seen']);
    expect(element.querySelector('.entry.tone-new .k')?.textContent).toBe('2');
  });

  it('highlights the lines the step ran in the page-wide language and switches languages', () => {
    const { element, click } = render();
    const language = TestBed.inject(ReferenceLanguageService);
    language.select('python');
    click('Next step');
    expect(element.querySelector('.line.current')?.textContent).toContain('py-5');
    expect([...element.querySelectorAll('.line.ran')].map((line) => line.textContent?.trim())).toEqual([
      '3# py-3',
      '4# py-4',
    ]);
    click('Java');
    expect(language.selected()).toBe('java');
    expect(element.querySelector('pre code')?.getAttribute('data-code-language')).toBe('java');
    expect(element.querySelector('.line.current')?.textContent).toContain('j-5');
  });

  it('ends on the result and lets the learner jump with the scrubber', () => {
    const { element, fixture } = render();
    const range = element.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = '6';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelector('.caption')?.textContent?.trim()).toBe('return [0, 1].');
    const result = element.querySelector('.variable[data-kind="result"] dd');
    expect(result?.textContent).toBe('[0, 1]');
    expect(element.querySelectorAll('.cell.tone-found')).toHaveLength(2);
    expect((element.querySelector('button[aria-label="Next step"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('steps with the arrow keys and keeps the caption quiet while playing', () => {
    const { element, fixture, click } = render();
    element.querySelector('.story')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('.step-count')?.textContent?.trim()).toBe('Step 2 of 6');
    expect(element.querySelector('.caption')?.getAttribute('aria-live')).toBe('polite');
    click('Play');
    expect(element.querySelector('.caption')?.getAttribute('aria-live')).toBe('off');
    click('Pause');
  });
});
