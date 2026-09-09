import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PracticePresentationItem,
  practicePresentation,
} from '../../content/practice-presentation';

@Component({
  selector: 'app-interview-question-bank-link',
  imports: [RouterLink],
  template: `
    @if (presentation().count > 0) {
      <a
        class="question-bank-link"
        [class.compact]="variant() === 'compact'"
        routerLink="/interview-questions"
        [queryParams]="{ path: pathId(), course: courseId(), module: moduleId() }"
        [attr.aria-label]="presentation().ariaLabel"
      >
        @if (variant() === 'compact') {
          <strong>{{ presentation().compactLabel }}</strong>
          <span>{{ presentation().count }}</span>
        } @else {
          <span>{{ presentation().eyebrow }}</span>
          <strong>{{ presentation().detailLabel }}</strong>
          <b>{{ presentation().actionLabel }}</b>
        }
      </a>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: 16px;
      }
      .question-bank-link {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 4px 18px;
        align-items: center;
        padding: 16px 18px;
        border: 1px solid #9fcbd5;
        border-left: 5px solid #0d8192;
        border-radius: 12px;
        color: #263b4d;
        background: #effbfc;
        text-decoration: none;
      }
      .question-bank-link > span {
        grid-column: 1;
        color: #0d7181;
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .question-bank-link > strong {
        grid-column: 1;
        color: #182a3b;
      }
      .question-bank-link > b {
        grid-column: 2;
        grid-row: 1 / span 2;
        color: #0d7181;
        font-size: 0.8rem;
      }
      .question-bank-link:hover,
      .question-bank-link:focus-visible {
        border-color: #0d8192;
        box-shadow: 0 8px 20px rgba(13, 129, 146, 0.12);
        outline: none;
      }
      :host:has(.compact) {
        display: inline-block;
        margin-top: 16px;
      }
      .question-bank-link.compact {
        display: inline-flex;
        min-height: 44px;
        box-sizing: border-box;
        gap: 7px;
        padding: 9px 13px;
        border: 1px solid #c7d9ec;
        border-radius: 8px;
        color: #168ca5;
        background: #fff;
        font-size: 0.82rem;
        font-weight: 800;
      }
      .question-bank-link.compact > strong,
      .question-bank-link.compact > span,
      .question-bank-link.compact > b {
        display: inline;
        grid-column: auto;
        grid-row: auto;
        color: inherit;
        font: inherit;
        letter-spacing: normal;
        text-transform: none;
      }
      .question-bank-link.compact > span {
        display: grid;
        min-width: 22px;
        min-height: 22px;
        place-items: center;
        border-radius: 999px;
        color: #fff;
        background: #168ca5;
        font-size: 0.72rem;
      }
      @media (max-width: 420px) {
        .question-bank-link:not(.compact) {
          grid-template-columns: minmax(0, 1fr);
          padding: 14px 15px;
        }
        .question-bank-link:not(.compact) > b {
          grid-column: 1;
          grid-row: auto;
          margin-top: 6px;
        }
      }
      @media (forced-colors: active) {
        .question-bank-link,
        .question-bank-link.compact {
          border-color: LinkText;
          color: LinkText;
          background: Canvas;
          box-shadow: none;
        }
      }
    `,
  ],
})
export class InterviewQuestionBankLink {
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly moduleId = input.required<string>();
  readonly questionCount = input.required<number>();
  readonly practiceItems = input<readonly PracticePresentationItem[]>([]);
  readonly variant = input<'bar' | 'compact'>('bar');
  protected readonly presentation = computed(() =>
    practicePresentation(this.practiceItems(), this.questionCount()),
  );
}
