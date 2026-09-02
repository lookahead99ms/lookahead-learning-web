import { Component, computed, input, signal } from '@angular/core';
import { ResolvedPatternCheck } from '../../content/content.models';

@Component({
  selector: 'app-pattern-understanding-checks',
  template: `
    <section class="checks" aria-label="Check your understanding">
      @if (activeCheck(); as check) {
        <header>
          <div>
            <span>Retrieval check · {{ categoryLabel(check.category) }}</span>
            <h3>Check your understanding</h3>
          </div>
          <p>{{ activeIndex() + 1 }} of {{ checks().length }}</p>
        </header>
        <article>
          <h4>{{ check.prompt }}</h4>
          <button
            type="button"
            (click)="revealed.update((value) => !value)"
            [attr.aria-expanded]="revealed()"
          >
            {{ revealed() ? 'Hide answer' : 'Reveal answer' }}
          </button>
          @if (revealed()) {
            <div class="answer">
              <strong>Answer</strong>
              <p [innerHTML]="check.answer"></p>
              @for (paragraph of check.explanation; track $index) {
                <p [innerHTML]="paragraph"></p>
              }
            </div>
          }
        </article>
        <footer>
          <button
            type="button"
            (click)="select(activeIndex() - 1)"
            [disabled]="activeIndex() === 0"
          >
            Previous
          </button>
          <div aria-label="Understanding questions">
            @for (item of checks(); track item.id; let index = $index) {
              <button
                type="button"
                [class.active]="index === activeIndex()"
                [attr.aria-label]="'Question ' + (index + 1) + ': ' + categoryLabel(item.category)"
                [attr.aria-current]="index === activeIndex() ? 'step' : null"
                (click)="select(index)"
              >
                {{ index + 1 }}
              </button>
            }
          </div>
          <button
            type="button"
            (click)="select(activeIndex() + 1)"
            [disabled]="activeIndex() === checks().length - 1"
          >
            Next
          </button>
        </footer>
        <p class="sr-status" aria-live="polite">{{ announcement() }}</p>
      }
    </section>
  `,
  styles: [
    `
      .checks {
        position: relative;
        padding: 24px;
        border: 1px solid #d9dff0;
        border-radius: 18px;
        background: linear-gradient(155deg, #f8f7ff, #fff);
        box-shadow: 0 12px 28px rgba(73, 78, 130, 0.07);
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 14px;
      }
      header span {
        color: #6558c9;
        font-size: 0.72rem;
        font-weight: 800;
        text-transform: uppercase;
      }
      header h3 {
        margin: 4px 0;
        color: #2f3045;
        font-size: 1.25rem;
      }
      header > p {
        margin: 0;
        color: #7d8094;
        font-weight: 700;
      }
      article {
        margin-top: 16px;
        padding: 19px;
        border: 1px solid #e7e5f4;
        border-radius: 14px;
        background: #fff;
      }
      h4 {
        margin: 0 0 14px;
        color: #303146;
        font-size: 1.02rem;
        line-height: 1.5;
      }
      article > button {
        min-height: 40px;
        padding: 8px 15px;
        border: 0;
        border-radius: 999px;
        color: #5145b9;
        background: #ece9fb;
        cursor: pointer;
        font-weight: 800;
      }
      button:focus-visible {
        outline: 3px solid rgba(81, 69, 185, 0.35);
        outline-offset: 2px;
      }
      .answer {
        margin-top: 16px;
        padding: 15px;
        border-left: 4px solid #3a9d70;
        border-radius: 0 10px 10px 0;
        background: #f1faf5;
      }
      .answer strong {
        color: #24724f;
        text-transform: uppercase;
        font-size: 0.72rem;
      }
      .answer p {
        margin: 6px 0 0;
        color: #34364a;
        line-height: 1.6;
      }
      footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 17px;
      }
      footer > button {
        min-height: 40px;
        padding: 7px 10px;
        border: 0;
        color: #5145b9;
        background: transparent;
        cursor: pointer;
        font-weight: 800;
      }
      footer > button:disabled {
        color: #b9bac8;
        cursor: not-allowed;
      }
      footer div {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
      }
      footer div button {
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 50%;
        color: #77798f;
        background: #efeff7;
        cursor: pointer;
        font-weight: 800;
      }
      footer div button.active {
        color: #fff;
        background: #6558c9;
      }
      .sr-status {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }
      @media (max-width: 600px) {
        .checks {
          padding: 17px;
        }
        footer {
          align-items: stretch;
          flex-direction: column;
        }
      }
      @media (forced-colors: active) {
        .checks,
        article,
        .answer {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        article > button,
        footer button,
        footer div button {
          border: 1px solid ButtonText;
          color: ButtonText;
          background: ButtonFace;
        }
        footer div button.active {
          border: 3px solid Highlight;
          color: HighlightText;
          background: Highlight;
        }
        button:focus-visible {
          outline: 3px solid Highlight;
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class PatternUnderstandingChecks {
  readonly checks = input.required<ResolvedPatternCheck[]>();
  protected readonly activeIndex = signal(0);
  protected readonly revealed = signal(false);
  protected readonly announcement = signal('');
  protected readonly activeCheck = computed(() => this.checks()[this.activeIndex()] ?? null);

  protected select(index: number): void {
    const next = Math.max(0, Math.min(index, this.checks().length - 1));
    if (next === this.activeIndex()) return;
    this.activeIndex.set(next);
    this.revealed.set(false);
    this.announcement.set(
      `Question ${next + 1} of ${this.checks().length}: ${this.categoryLabel(this.checks()[next].category)}.`,
    );
  }

  protected categoryLabel(category: ResolvedPatternCheck['category']): string {
    return category.replace('-', ' ');
  }
}
