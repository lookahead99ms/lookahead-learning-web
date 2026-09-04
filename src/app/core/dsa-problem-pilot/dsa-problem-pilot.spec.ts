import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PatternProblemV1 } from '../../content/content.models';
import { DsaProblemPilot } from './dsa-problem-pilot';

function twoSumProblem(): PatternProblemV1 {
  const implementation = (language: 'java' | 'python' | 'go') => ({
    language,
    title: `${language} solution`,
    lines: [
      { id: 'scan', text: 'scan values' },
      { id: 'return', text: 'return indices' },
    ],
  });

  return {
    id: 'two-sum',
    title: 'Two Sum',
    description: 'Return the two indices whose values add to the target.',
    difficulty: 'Beginner',
    variation: 'Complement lookup',
    invariantAdaptation: 'The map contains only values seen before the current index.',
    complexity: {
      time: 'O(n)',
      space: 'O(n)',
      why: 'Each value is scanned once and stored once.',
    },
    fixtures: [
      {
        id: 'standard',
        label: 'Standard pair',
        input: 'nums = [2, 7, 11, 15], target = 9',
        expectedOutput: '[0, 1]',
      },
      {
        id: 'duplicate',
        label: 'Duplicate values',
        input: 'nums = [3, 3], target = 6',
        expectedOutput: '[0, 1]',
        explanation: 'Equal values are valid when they occupy distinct positions.',
      },
    ],
    implementations: [implementation('java'), implementation('python'), implementation('go')],
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: 'two-sum-trace',
      fixtureId: 'standard',
      invariant: 'Before checking an index, the map contains every earlier value and its index.',
      legend: [{ state: 'active', label: 'Current value' }],
      events: [
        {
          id: 'start',
          label: 'Scan first value',
          phase: 'Scan',
          timing: 'before',
          sourceAnchor: { java: 'scan', python: 'scan', go: 'scan' },
          what: 'Calculate the complement before storing the current value.',
          why: 'This prevents one element from matching itself.',
          variables: [{ name: 'index', type: 'int', value: '0' }],
          rows: [
            {
              id: 'values',
              label: 'Values',
              cells: [{ value: '2', states: ['active'] }, { value: '7' }],
            },
          ],
        },
      ],
    },
    fixtureTraces: [
      {
        schemaVersion: 'guided-trace/v1',
        id: 'two-sum-duplicate-trace',
        fixtureId: 'duplicate',
        invariant: 'The map contains only earlier indices, so an item cannot pair with itself.',
        legend: [{ state: 'active', label: 'Current value' }],
        events: [
          {
            id: 'duplicate-start',
            label: 'Store the first 3',
            phase: 'Insert',
            timing: 'after',
            sourceAnchor: { java: 'scan', python: 'scan', go: 'scan' },
            what: 'Store index 0 only after its lookup misses.',
            why: 'A later equal value can then recover a distinct earlier index.',
            variables: [{ name: 'seen', type: 'map', value: '{3:0}', changed: true }],
            rows: [
              {
                id: 'values',
                label: 'Values',
                cells: [{ value: '3', states: ['active'] }, { value: '3' }],
              },
            ],
          },
          {
            id: 'duplicate-return',
            label: 'Return distinct indices',
            phase: 'Resolve',
            timing: 'after',
            sourceAnchor: { java: 'return', python: 'return', go: 'return' },
            what: 'The second 3 finds the first 3 at index 0.',
            why: 'The two positions are distinct and sum to 6.',
            variables: [{ name: 'result', type: 'indices', value: '[0, 1]', changed: true }],
            rows: [
              {
                id: 'values',
                label: 'Values',
                cells: [
                  { value: '3', states: ['active'] },
                  { value: '3', states: ['active'] },
                ],
              },
            ],
            result: '[0, 1]',
          },
        ],
      },
    ],
    practice: {
      statement: {
        prompt: 'Given an integer array and a target, return the indices of the unique pair.',
        inputs: ['An integer array nums.', 'An integer target.'],
        output: 'Two distinct indices.',
        constraints: ['Exactly one valid answer exists.'],
        edgeCases: ['The same value may appear twice.'],
      },
      starters: {
        java: 'int[] twoSum(int[] nums, int target) {\n  return new int[0];\n}',
        python: 'def two_sum(nums, target):\n    return []',
        go: 'func twoSum(nums []int, target int) []int {\n\treturn nil\n}',
      },
      hints: ['Ask what value would complete the current number.'],
      approaches: [
        {
          title: 'Brute force',
          explanation: 'Check each pair.',
          complexity: 'O(n^2) time, O(1) space',
        },
        {
          title: 'Complement map',
          explanation: 'Remember values already seen.',
          complexity: 'O(n) expected time, O(n) space',
        },
      ],
      commonMistakes: ['Storing the current value before checking its complement.'],
      checks: [
        {
          kind: 'explain',
          prompt: 'Why do we check before inserting?',
          expected: 'An index cannot pair with itself.',
        },
      ],
    },
  };
}

describe('DsaProblemPilot mode tabs', () => {
  it('lets the learner select the exact input used by the guided trace', async () => {
    await TestBed.configureTestingModule({ imports: [DsaProblemPilot] }).compileComponents();
    const fixture = TestBed.createComponent(DsaProblemPilot);
    fixture.componentRef.setInput('problem', twoSumProblem());
    fixture.componentRef.setInput('entryMode', 'guided');
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const selector = root.querySelector<HTMLSelectElement>('[aria-label="Guided trace input"]')!;
    expect(selector.closest('.trace-toolbar')).not.toBeNull();
    selector.value = '1';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.trace-fixture-picker')?.textContent).toContain('Duplicate values');
    expect(root.querySelector('.contract select')).toBeNull();
    expect(root.querySelectorAll('.example-cases article')).toHaveLength(2);
    expect(root.querySelector('.step-status')?.textContent).toContain('1 of 2');
    expect(root.querySelector('.trace-context')?.textContent).toContain(
      'nums = [3, 3], target = 6',
    );
    expect(root.querySelector('.fixture-note')).toBeNull();
  });

  it('keeps the page still when content is visible and supports roving keyboard focus', async () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    );
    const scrollIntoView = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      await TestBed.configureTestingModule({ imports: [DsaProblemPilot] }).compileComponents();
      const fixture = TestBed.createComponent(DsaProblemPilot);
      fixture.componentRef.setInput('problem', twoSumProblem());
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const tabs = root.querySelectorAll<HTMLButtonElement>('.mode-tabs [role="tab"]');
      const practicePane = root.querySelector<HTMLElement>('#two-sum-practice-pane')!;
      const guidedPane = root.querySelector<HTMLElement>('#two-sum-guided-pane')!;
      vi.spyOn(
        practicePane.querySelector<HTMLElement>('.mode-reaction')!,
        'getBoundingClientRect',
      ).mockReturnValue({
        top: 180,
        bottom: 520,
      } as DOMRect);
      vi.spyOn(
        guidedPane.querySelector<HTMLElement>('.mode-reaction')!,
        'getBoundingClientRect',
      ).mockReturnValue({
        top: 180,
        bottom: 520,
      } as DOMRect);

      expect([...tabs].map((tab) => tab.textContent?.trim())).toEqual([
        'Practice independently',
        'Guided explanation',
      ]);
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(practicePane.hidden).toBe(false);
      expect(guidedPane.hidden).toBe(true);

      tabs[1].click();
      fixture.detectChanges();
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(practicePane.hidden).toBe(true);
      expect(guidedPane.hidden).toBe(false);
      expect(scrollIntoView).not.toHaveBeenCalled();

      tabs[1].focus();
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      fixture.detectChanges();
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(tabs[0].tabIndex).toBe(0);
      expect(tabs[1].tabIndex).toBe(-1);
      expect(document.activeElement).toBe(tabs[0]);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
      requestAnimationFrame.mockRestore();
    }
  });

  it('reveals the selected content when the tab row is at the bottom of the viewport', async () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    );
    const scrollIntoView = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      await TestBed.configureTestingModule({ imports: [DsaProblemPilot] }).compileComponents();
      const fixture = TestBed.createComponent(DsaProblemPilot);
      fixture.componentRef.setInput('problem', twoSumProblem());
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const guidedPane = root.querySelector<HTMLElement>('#two-sum-guided-pane')!;
      vi.spyOn(
        guidedPane.querySelector<HTMLElement>('.mode-reaction')!,
        'getBoundingClientRect',
      ).mockReturnValue({
        top: window.innerHeight - 20,
        bottom: window.innerHeight + 600,
      } as DOMRect);

      root.querySelector<HTMLButtonElement>('#two-sum-guided-tab')!.click();
      fixture.detectChanges();

      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect(root.querySelector<HTMLElement>('#two-sum-guided-pane')!.hidden).toBe(false);
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
      requestAnimationFrame.mockRestore();
    }
  });
});
