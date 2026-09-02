import { Component, computed, effect, input, signal } from '@angular/core';
import { PatternProblemV1 } from '../../content/content.models';
import { GuidedAlgorithmTrace } from '../guided-algorithm-trace/guided-algorithm-trace';

@Component({
  selector: 'app-pattern-problem-workbench',
  imports: [GuidedAlgorithmTrace],
  template: `
    <section class="problem-workbench" [attr.aria-label]="ariaLabel()">
      <header>
        <div>
          <span>{{ eyebrow() }}</span>
          <h3>{{ activeProblem().title }}</h3>
          <p>{{ activeProblem().description }}</p>
        </div>
        <label
          >Problem<select
            [value]="problemIndex()"
            (change)="chooseProblem($any($event.target).value)"
          >
            @for (problem of problems(); track problem.id; let index = $index) {
              <option [value]="index">{{ index + 1 }}. {{ problem.title }}</option>
            }
          </select></label
        >
      </header>
      <div class="problem-context">
        <label
          >Input fixture<select
            [value]="fixtureIndex()"
            (change)="chooseFixture($any($event.target).value)"
          >
            @for (fixture of activeProblem().fixtures; track fixture.id; let index = $index) {
              <option [value]="index">{{ fixture.label }}</option>
            }
          </select></label
        >
        <p><span>Active input</span>{{ activeFixture().input }}</p>
        <p><span>Expected output</span>{{ activeFixture().expectedOutput }}</p>
      </div>
      <div class="problem-model">
        <p><span>Variation</span>{{ activeProblem().variation }}</p>
        <p><span>Invariant adaptation</span>{{ activeProblem().invariantAdaptation }}</p>
        <p>
          <span>Complexity</span>{{ activeProblem().complexity.time }} time ·
          {{ activeProblem().complexity.space }} space. {{ activeProblem().complexity.why }}
        </p>
      </div>
      <app-guided-algorithm-trace [problem]="activeProblem()" [selectedFixture]="activeFixture()" />
    </section>
  `,
  styles: [
    `
      .problem-workbench {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        gap: 14px;
      }
      .problem-workbench > header {
        display: flex;
        min-width: 0;
        justify-content: space-between;
        gap: 20px;
        padding: 18px;
        border: 1px solid #b9dce6;
        border-radius: 14px;
        background: linear-gradient(120deg, #effbfc, #fff);
      }
      header span,
      .problem-context span,
      .problem-model span {
        display: block;
        color: #168ca5;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      header h3 {
        margin: 4px 0;
        color: #172033;
        font-size: 1.18rem;
      }
      header p {
        max-width: 680px;
        margin: 0;
        color: #52657e;
        line-height: 1.5;
      }
      label {
        display: grid;
        align-content: start;
        gap: 5px;
        color: #52657e;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      select {
        min-height: 42px;
        max-width: 100%;
        min-width: 220px;
        padding: 8px 28px 8px 9px;
        border: 1px solid #9db7ca;
        border-radius: 7px;
        color: #172033;
        background: #fff;
        font:
          700 0.8rem 'Avenir Next',
          sans-serif;
      }
      select:focus-visible {
        outline: 3px solid rgba(22, 140, 165, 0.3);
        outline-offset: 2px;
      }
      .problem-context {
        display: grid;
        grid-template-columns: auto 1fr 1fr;
        gap: 16px;
        align-items: end;
        padding: 13px 17px;
        border: 1px solid #d8e8ee;
        border-radius: 12px;
        background: #f8fcfd;
      }
      .problem-context p,
      .problem-model p {
        margin: 0;
        color: #172033;
        font:
          700 0.8rem/1.5 'JetBrains Mono',
          monospace;
        overflow-wrap: anywhere;
      }
      .problem-context p span,
      .problem-model span {
        margin-bottom: 3px;
        font-family: 'Avenir Next', sans-serif;
      }
      .problem-model {
        display: grid;
        grid-template-columns: 0.7fr 1.4fr 1fr;
        gap: 13px;
        padding: 14px 17px;
        border: 1px solid #d8e8ee;
        border-radius: 12px;
        background: #fff;
      }
      @media (max-width: 760px) {
        .problem-workbench > header,
        .problem-context,
        .problem-model {
          display: grid;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          grid-template-columns: minmax(0, 1fr);
        }
        select {
          min-width: 0;
          width: 100%;
        }
      }
      @media (forced-colors: active) {
        .problem-workbench > header,
        .problem-context,
        .problem-model {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
        }
        select:focus-visible {
          outline: 3px solid Highlight;
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class PatternProblemWorkbench {
  readonly problems = input.required<PatternProblemV1[]>();
  readonly initialProblemId = input('');
  readonly eyebrow = input('Three essential problems');
  readonly ariaLabel = input('Three essential pattern problems');
  protected readonly problemIndex = signal(0);
  protected readonly fixtureIndex = signal(0);
  protected readonly activeProblem = computed(
    () => this.problems()[this.problemIndex()] ?? this.problems()[0],
  );
  protected readonly activeFixture = computed(
    () => this.activeProblem().fixtures[this.fixtureIndex()] ?? this.activeProblem().fixtures[0],
  );

  constructor() {
    effect(() => {
      const requestedId = this.initialProblemId();
      const index = this.problems().findIndex(({ id }) => id === requestedId);
      this.problemIndex.set(index >= 0 ? index : 0);
      this.fixtureIndex.set(0);
    });
  }

  protected chooseProblem(value: string): void {
    this.problemIndex.set(Number(value));
    this.fixtureIndex.set(0);
  }
  protected chooseFixture(value: string): void {
    this.fixtureIndex.set(Number(value));
  }
}
