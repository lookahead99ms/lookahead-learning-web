import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { DsaProblemV2 } from '../../content/content.models';

/** Teaching is read from the protected problem; the UI never embeds curriculum. */
@Component({
  selector: 'app-studio-approach',
  template: `<article class="approach-overview" aria-label="Understand the approach">
    <p class="eyebrow">Understand the question first</p>
    <h2>{{ problem().title }}</h2>
    <section class="problem-in-plain-language">
      <h3>What are we trying to find?</h3>
      <p>{{ problem().teaching?.problemFraming ?? problem().practice.statement.prompt }}</p>
      @if (!problem().teaching) {
        <p>{{ problem().description }}</p>
      }
    </section>
    <h3>How can we do less work?</h3>
    <p>Connect the contract to the state the solution needs to keep.</p>
    <div
      class="approach-cards"
      [attr.data-compact]="compact()"
      [attr.data-layout]="paired() ? 'paired' : 'stacked'"
    >
      @if (problem().teaching; as teaching) {
        @for (
          card of [teaching.startingApproach, teaching.selectedApproach];
          track $index;
          let index = $index
        ) {
          <section class="approach-card" [class.selected-approach]="index === 1">
            <div class="approach-explanation-band">
              <p class="eyebrow">
                {{ index === 0 ? 'Learning starting point' : 'Selected solution' }}
              </p>
              <h3>{{ card.title }}</h3>
              @for (paragraph of card.theory; track $index) {
                <p>{{ paragraph }}</p>
              }
            </div>
            <div class="approach-cost-band">
              <p>
                <strong>Time:</strong> {{ card.complexity.time }} · <strong>Extra space:</strong>
                {{ card.complexity.space }}
              </p>
            </div>
            <details class="approach-code-band" [open]="codeOpen(index)">
              <summary (click)="rememberDisclosure(index, $event)">
                {{ codeOpen(index) ? 'Hide' : 'Show' }} teaching pseudocode:
                {{ index === 0 ? 'starting approach' : 'selected solution' }}
              </summary>
              <p class="pseudocode-label">Teaching pseudocode</p>
              <pre><code>{{ card.pseudocode.join('
') }}</code></pre>
            </details>
          </section>
        }
      } @else {
        <section class="approach-card">
          <div class="approach-explanation-band">
            <p class="eyebrow">Learning starting point</p>
            <h3>Recognize the decision</h3>
            <p>{{ problem().variation }}</p>
            <p>{{ problem().invariantAdaptation }}</p>
          </div>
          <div class="approach-cost-band">
            <strong>The invariant</strong>
            <p>{{ problem().trace.invariant }}</p>
          </div>
          <div class="approach-code-band">
            <strong>Check the contract</strong>
            <p>{{ problem().practice.statement.output }}</p>
          </div>
        </section>
        <section class="approach-card selected-approach">
          <div class="approach-explanation-band">
            <p class="eyebrow">Selected solution</p>
            <h3>Keep the necessary state</h3>
            <p>{{ problem().practice.canonicalApproach.whyThisApproach }}</p>
          </div>
          <div class="approach-cost-band">
            <p>
              <strong>Time:</strong> {{ problem().complexity.time }} · <strong>Extra space:</strong>
              {{ problem().complexity.space }}
            </p>
          </div>
          <div class="approach-code-band">
            <strong>Why these bounds fit</strong>
            <p>{{ problem().practice.canonicalApproach.whyOptimal }}</p>
          </div>
        </section>
      }
    </div>
    <section class="key-difference">
      <h3>The key difference</h3>
      <p>{{ problem().teaching?.keyDifference ?? problem().complexity.why }}</p>
    </section>
    @if (problem().teaching?.workedTransition; as worked) {
      <section class="worked-transition">
        <h3>See the change on an example</h3>
        <p><strong>Input:</strong> {{ worked.input }}</p>
        <ol>
          @for (step of worked.steps; track $index) {
            <li>{{ step }}</li>
          }
        </ol>
        <p><strong>Outcome:</strong> {{ worked.outcome }}</p>
      </section>
    }
    <details>
      <summary>Why it works and when the rules change</summary>
      <p>{{ problem().practice.canonicalApproach.whenAssumptionChanges }}</p>
    </details>
  </article>`,
  styleUrl: './studio-approach.css',
})
export class StudioApproach {
  readonly problem = input.required<DsaProblemV2>();
  protected readonly compact = signal(false);
  protected readonly paired = signal(false);
  private readonly choices = signal<Record<string, Record<number, boolean>>>({});
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly remembered = computed(() => this.choices()[this.problem().id] ?? {});
  constructor() {
    afterNextRender(() => {
      const group = this.host.nativeElement.querySelector<HTMLElement>('.approach-cards')!;
      const measure = () => {
        const scale = Math.max(
          1,
          parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
        );
        const width = group.getBoundingClientRect().width / scale;
        if (!width) return;
        this.compact.set(width < 560 || scale >= 1.5);
        this.paired.set(width >= 880);
      };
      const observer =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
      observer?.observe(group);
      window.addEventListener('resize', measure);
      measure();
      this.destroyRef.onDestroy(() => {
        observer?.disconnect();
        window.removeEventListener('resize', measure);
      });
    });
  }
  protected codeOpen(index: number): boolean {
    return !this.compact() || this.remembered()[index] === true;
  }
  protected rememberDisclosure(index: number, event: Event): void {
    event.preventDefault();
    if (!this.compact()) return;
    this.choices.update((choices) => ({
      ...choices,
      [this.problem().id]: { ...this.remembered(), [index]: !this.codeOpen(index) },
    }));
  }
}
