import { Component, computed, input, signal } from '@angular/core';
import { InterviewQuestion } from '../../content/content.models';

@Component({
  selector: 'app-inline-understanding-pager',
  template: `
    @if (activeQuestion(); as question) {
      <section class="understanding-pager" aria-label="Check your understanding">
        <header>
          <div>
            <p class="panel-label">💡 Quick check</p>
            <h2>Check your understanding</h2>
          </div>
          <p class="pager-count">{{ activeIndex() + 1 }} of {{ questions().length }}</p>
        </header>
        <div class="pager-question">
          <h3>{{ question.title }}</h3>
          <button type="button" class="reveal-toggle" (click)="toggleAnswer()" [attr.aria-expanded]="answerRevealed()">
            <span class="reveal-icon" aria-hidden="true">{{ answerRevealed() ? '🙈' : '👀' }}</span>
            {{ answerRevealed() ? 'Hide answer' : 'Reveal answer' }}
          </button>
          @if (answerRevealed()) {
            <section class="quick-answer" aria-label="Interview answer">
              <span>Answer</span>
              <p [innerHTML]="question.interviewAnswer"></p>
            </section>
            <div class="pager-explanation">
              @for (paragraph of question.explanation; track paragraph) {
                <p [innerHTML]="paragraph"></p>
              }
            </div>
          }
        </div>
        @if (questions().length > 1) {
          <footer>
            <button type="button" class="nav-link" (click)="previous()" [disabled]="activeIndex() === 0">← Previous</button>
            <div class="pager-pages" aria-label="Understanding questions">
              @for (item of questions(); track item.id; let index = $index) {
                <button type="button" [class.active]="index === activeIndex()" [attr.aria-label]="'Question ' + (index + 1)" [attr.aria-current]="index === activeIndex() ? 'step' : null" (click)="select(index)">{{ index + 1 }}</button>
              }
            </div>
            <button type="button" class="nav-link" (click)="next()" [disabled]="activeIndex() === questions().length - 1">Next →</button>
          </footer>
        }
      </section>
    }
  `,
  styles: [`
    .understanding-pager { margin: 42px 0 8px; padding: 28px; border: 1px solid var(--line); border-radius: 20px; background: linear-gradient(160deg, var(--surface), var(--surface)); box-shadow: 0 12px 28px var(--shadow); }
    header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
    .panel-label { margin: 0; color: var(--accent-link); font-size: .82rem; font-weight: 700; }
    h2 { margin: 4px 0 0; color: var(--text-strong); font-size: clamp(1.2rem, 2.6vw, 1.45rem); font-weight: 700; }
    .pager-count { margin: 2px 0 0; color: var(--text-subtle); font-size: .78rem; font-weight: 600; white-space: nowrap; }
    .pager-question { margin-top: 18px; padding: 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
    h3 { margin: 0 0 16px; color: var(--text-strong); font-size: 1.08rem; font-weight: 600; line-height: 1.55; }
    .reveal-toggle { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px 16px; border: none; border-radius: 999px; color: var(--accent-link); background: var(--surface-accent); cursor: pointer; font: inherit; font-size: .84rem; font-weight: 700; transition: background .15s ease, transform .1s ease; }
    .reveal-toggle:hover, .reveal-toggle:focus-visible { background: var(--surface-accent); outline: none; }
    .reveal-toggle:active { transform: scale(.98); }
    .reveal-icon { font-size: 1rem; }
    .quick-answer { margin: 18px 0 0; padding: 16px 18px; border-radius: 14px; background: var(--success-surface); }
    .quick-answer span { display: block; margin-bottom: 6px; color: var(--success); font-size: .76rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .quick-answer p { margin-bottom: 0; color: var(--text-strong); line-height: 1.65; }
    .pager-explanation { margin-top: 14px; padding: 0 2px; color: var(--text-subtle); line-height: 1.75; }
    .pager-explanation p:last-child { margin-bottom: 0; }
    footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; }
    .nav-link { min-height: 34px; padding: 6px 4px; border: none; color: var(--accent-link); background: transparent; cursor: pointer; font: inherit; font-size: .84rem; font-weight: 700; }
    .nav-link:hover:not(:disabled), .nav-link:focus-visible { color: var(--accent-link); outline: none; text-decoration: underline; }
    .nav-link:disabled { color: var(--text-subtle); cursor: not-allowed; }
    .pager-pages { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
    .pager-pages button { min-width: 30px; height: 30px; padding-inline: 6px; border: none; border-radius: 999px; color: var(--text-subtle); background: var(--surface-accent); cursor: pointer; font: inherit; font-size: .76rem; font-weight: 700; }
    .pager-pages button:hover { background: var(--surface-accent); color: var(--accent-link); }
    .pager-pages button.active { color: var(--accent-on-primary); background: var(--accent-strong); }
    @media (max-width: 620px) { .understanding-pager { padding: 18px; } header, footer { align-items: stretch; flex-direction: column; } .pager-count { order: -1; } }
  `],
})
export class InlineUnderstandingPager {
  readonly questions = input.required<InterviewQuestion[]>();
  protected readonly activeIndex = signal(0);
  protected readonly activeQuestion = computed(() => this.questions()[this.activeIndex()] ?? null);
  /** The answer starts hidden so learners try to answer first; it resets whenever the question changes. */
  protected readonly answerRevealed = signal(false);

  protected toggleAnswer(): void {
    this.answerRevealed.update((revealed) => !revealed);
  }

  protected select(index: number): void {
    this.activeIndex.set(index);
    this.answerRevealed.set(false);
  }

  protected previous(): void {
    this.activeIndex.update((index) => Math.max(0, index - 1));
    this.answerRevealed.set(false);
  }

  protected next(): void {
    this.activeIndex.update((index) => Math.min(this.questions().length - 1, index + 1));
    this.answerRevealed.set(false);
  }
}
