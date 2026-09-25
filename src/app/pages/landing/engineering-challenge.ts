import { Component, computed, signal } from '@angular/core';

// Redistributable, synthetic homepage examples. Private curriculum and preview
// scenarios are deliberately not bundled into the public application.
const examples = [
  {
    category: 'Defaults / Preserve intent',
    question: 'Does zero mean “use the default”?',
    context:
      'A page-size setting allows zero to hide results. The candidate uses a truthy fallback.',
    code: 'const pageSize = requestedSize || 10;\n// requestedSize is 0',
    choices: ['It keeps zero.', 'It selects ten.', 'It throws an error.'],
    correct: 1,
    steps: [
      [
        'Read the contract',
        'Zero is a valid request to hide results. Only null or undefined should select the default.',
      ],
      ['Trace the expression', 'JavaScript treats zero as falsy, so the || expression selects 10.'],
      [
        'Check the boundary',
        'Use requestedSize ?? 10 for this contract. Verify 0, a positive value, null and undefined independently.',
      ],
    ],
    rule: 'Choose a default by the contract for missing values, not by truthiness.',
  },
  {
    category: 'Ownership / Mutation',
    question: 'Did the original list stay in order?',
    context:
      'Two variables refer to the same array. The candidate reverses the display order in place.',
    code: 'const original = [2, 4, 6];\nconst display = original;\ndisplay.reverse();',
    choices: ['Both now read [6, 4, 2].', 'Only display changes.', 'Both arrays become empty.'],
    correct: 0,
    steps: [
      [
        'Follow the reference',
        'Assigning an array to another variable copies the reference, not the array. Both variables point to one object.',
      ],
      [
        'Observe the mutation',
        'reverse() changes that shared array in place. Reading original now returns [6, 4, 2].',
      ],
      [
        'Verify the requirement',
        'If the caller owns the original order, reverse a copy: [...original].reverse(). Test the result and that the input remains unchanged.',
      ],
    ],
    rule: 'A correct return value does not prove that caller-owned input was preserved.',
  },
  {
    category: 'Edge cases / Empty input',
    question: 'What does an empty average return?',
    context: 'The candidate sums an empty list with an initial zero, then divides by its length.',
    code: 'const values = [];\nconst total = values.reduce((sum, n) => sum + n, 0);\nconst average = total / values.length;',
    choices: ['Zero.', 'A thrown exception.', 'NaN.'],
    correct: 2,
    steps: [
      [
        'Identify the input',
        'The list has no values. The initial accumulator makes the sum zero, and the length is also zero.',
      ],
      [
        'Follow the arithmetic',
        'JavaScript evaluates 0 / 0 as NaN. It does not throw or choose a meaningful average.',
      ],
      [
        'Define the empty case',
        'Agree whether empty input should return null, produce an error, or be rejected. Test that choice explicitly before computing the division.',
      ],
    ],
    rule: 'Handle an undefined mathematical result with an explicit product contract.',
  },
] as const;

@Component({
  selector: 'app-engineering-challenge',
  templateUrl: './engineering-challenge.html',
  styleUrl: './engineering-challenge.css',
})
export class EngineeringChallenge {
  protected readonly expanded = signal(false);
  protected readonly exampleIndex = signal(0);
  protected readonly example = computed(() => examples[this.exampleIndex()]);
  protected readonly answer = signal<number | null>(null);
  protected readonly step = signal(0);
  protected readonly reflection = signal('');
  protected readonly count = examples.length;
  protected readonly stages = ['Contract', 'Evidence', 'Verification'];

  protected disclose(event: Event): void {
    this.expanded.set((event.target as HTMLDetailsElement).open);
  }

  protected predict(index: number): void {
    this.answer.set(index);
    this.step.set(0);
  }

  protected moveStep(delta: number): void {
    this.step.update((value) => Math.max(0, Math.min(2, value + delta)));
  }

  protected another(): void {
    this.exampleIndex.update((value) => (value + 1) % examples.length);
    this.answer.set(null);
    this.step.set(0);
    this.reflection.set('');
  }

  protected reflect(event: Event): void {
    this.reflection.set((event.target as HTMLTextAreaElement).value);
  }
}
