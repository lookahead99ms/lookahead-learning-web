import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TheoryLadderStep } from '../../content/content.models';

/**
 * algo-pattern-v1 Problems: rungs from easy to hard, each a link to its hands-on problem page.
 * The host is the lesson's `ol.problem-ladder`.
 */
@Component({
  selector: 'ol[appLessonProblemLadder]',
  imports: [RouterLink],
  template: `
    @for (step of steps(); track step.questionId; let index = $index) {
      <li>
        <span class="ladder-rung" aria-hidden="true">{{ index + 1 }}</span>
        <div class="ladder-body">
          <a [routerLink]="['/', pathId(), courseId(), step.questionId]">{{ step.title }}</a>
          <span class="ladder-level">{{ step.difficulty }}</span>
          <p [innerHTML]="step.newIdea"></p>
        </div>
      </li>
    }
  `,
  styles: [
    `
      :host-context(.system .lesson-section) p {
        max-width: var(--reading-width);
        line-height: 1.8;
      }
      :host(.problem-ladder) li {
        display: grid;
        grid-template-columns: 2.25rem minmax(0, 1fr);
        gap: 0.9rem;
        align-items: start;
        padding: 0.9rem 1rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
      }
      .ladder-rung {
        display: grid;
        place-items: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 50%;
        background: var(--surface-accent);
        color: var(--text-strong);
        font-weight: 700;
      }
      .ladder-body a {
        color: var(--accent-link);
        font-size: 1.05rem;
        font-weight: 650;
      }
      .ladder-level {
        margin-left: 0.6rem;
        color: var(--text-subtle);
        font-size: 0.85rem;
        font-weight: 600;
      }
      :host-context(.system) .ladder-body p {
        margin: 0.3rem 0 0;
        line-height: 1.6;
      }
    `,
  ],
})
export class LessonProblemLadder {
  readonly steps = input.required<TheoryLadderStep[]>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
}
