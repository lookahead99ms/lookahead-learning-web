import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ContentItemSummary,
  FoundationLessonV1,
  InterviewQuestion,
  ResolvedPatternCheck,
} from '../../content/content.models';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';
import { CodingSolutionTabs } from '../coding-solution-tabs/coding-solution-tabs';
import { InteractiveTheoryVisual } from '../interactive-theory-visual/interactive-theory-visual';
import { InterviewQuestionBankLink } from '../interview-question-bank-link/interview-question-bank-link';
import { PatternUnderstandingChecks } from '../pattern-understanding-checks/pattern-understanding-checks';

@Component({
  selector: 'app-foundation-lesson-shell',
  imports: [
    RouterLink,
    CodeCopyButton,
    CodingSolutionTabs,
    InteractiveTheoryVisual,
    InterviewQuestionBankLink,
    PatternUnderstandingChecks,
  ],
  template: `
    <article class="foundation-lesson" aria-label="Foundation lesson">
      <header class="lesson-intro">
        <p>{{ lesson().summary }}</p>
        <section aria-labelledby="foundation-outcomes-heading">
          <span>After this lesson</span>
          <h2 id="foundation-outcomes-heading">You will be able to</h2>
          <ul>
            @for (outcome of lesson().learningOutcomes; track outcome) {
              <li>{{ outcome }}</li>
            }
          </ul>
        </section>
        <aside class="memory-anchor" aria-label="Memory anchor and interview retrieval cue">
          <span>Memory anchor</span>
          <strong>{{ lesson().memoryAnchor.phrase }}</strong>
          <p>{{ lesson().memoryAnchor.mentalModel }}</p>
          <p><b>Interview cue:</b> {{ lesson().memoryAnchor.retrievalCue }}</p>
        </aside>
      </header>

      <section
        id="foundation-model"
        class="lesson-section model-section"
        aria-labelledby="foundation-model-heading"
      >
        <p class="section-label"><span>Model</span>Reason before choosing</p>
        <h2 id="foundation-model-heading">{{ lesson().foundationModel.heading }}</h2>
        <div class="model-grid">
          <article>
            <span>Representation</span>
            <p>{{ lesson().foundationModel.representation }}</p>
          </article>
          <article class="model-invariant">
            <span>Invariant</span>
            <p>{{ lesson().foundationModel.invariant }}</p>
          </article>
          <article>
            <span>Operation lens</span>
            <p>{{ lesson().foundationModel.operationLens }}</p>
          </article>
          <article>
            <span>Selection rule</span>
            <p>{{ lesson().foundationModel.selectionRule }}</p>
          </article>
        </div>
      </section>

      @for (section of lesson().sections; track section.id) {
        <section
          class="lesson-section"
          [class.wide-section]="section.visual || section.solutions?.length"
          [id]="section.id"
        >
          <p class="section-label">{{ section.navLabel }}</p>
          <h2>{{ section.heading }}</h2>
          @for (paragraph of section.body; track paragraph) {
            <p [innerHTML]="paragraph"></p>
          }
          @if (section.callout; as callout) {
            <aside class="lesson-callout" [attr.data-callout-type]="callout.type">
              <strong>{{ callout.title }}</strong>
              <p [innerHTML]="callout.text"></p>
            </aside>
          }
          @if (section.code; as code) {
            @if (!section.solutions?.length) {
              <section class="foundation-code">
                <header>
                  <span>{{ code.title }}</span>
                  <div>
                    <small>{{ code.language }}</small
                    ><app-code-copy-button [code]="code.source" />
                  </div>
                </header>
                <pre><code>{{ code.source }}</code></pre>
              </section>
            }
          }
          @if (section.solutions?.length) {
            <app-coding-solution-tabs
              [solutions]="section.solutions!"
              [pseudocode]="section.code ?? null"
              [showPractice]="section.showPractice !== false"
              [useLanguageThemes]="section.useLanguageThemes === true"
            />
          }
          @if (section.visual; as visual) {
            <figure class="concept-visual">
              @if (visual.type === 'interactive') {
                <app-interactive-theory-visual [visual]="visual" />
              } @else {
                <img [src]="visual.assetPath" [alt]="visual.alt" />
              }
              @if (visual.caption; as caption) {
                <figcaption>{{ caption }}</figcaption>
              }
            </figure>
            @if (section.visualTranscript?.length) {
              <details class="visual-transcript">
                <summary>Read the complete visual transcript</summary>
                <ol>
                  @for (step of section.visualTranscript; track step) {
                    <li>{{ step }}</li>
                  }
                </ol>
              </details>
            }
          }
        </section>
      }

      <section
        id="foundation-pitfalls"
        class="lesson-section wide-section"
        aria-labelledby="foundation-pitfalls-heading"
      >
        <p class="section-label"><span>Debug</span>Failure contrasts</p>
        <h2 id="foundation-pitfalls-heading">Common failure modes</h2>
        <div class="pitfall-list">
          @for (pitfall of lesson().pitfalls; track pitfall.failedAssumption) {
            <article>
              <h3>{{ pitfall.failedAssumption }}</h3>
              <p><strong>Symptom:</strong> {{ pitfall.symptom }}</p>
              <p><strong>Correction:</strong> {{ pitfall.correction }}</p>
            </article>
          }
        </div>
      </section>

      <section
        id="foundation-understand"
        class="lesson-section wide-section"
        aria-labelledby="foundation-understand-heading"
      >
        <p class="section-label"><span>Retrieve</span>Answer before revealing</p>
        <h2 id="foundation-understand-heading">Check your understanding</h2>
        <app-pattern-understanding-checks [checks]="checks()" />
        @if (questionModuleId(); as moduleId) {
          @if (questionCount() > 0) {
            <app-interview-question-bank-link
              [pathId]="pathId()"
              [courseId]="courseId()"
              [moduleId]="moduleId"
              [questionCount]="questionCount()"
              [practiceItems]="questionItems()"
            />
          }
        }
      </section>

      <section
        id="foundation-recall"
        class="lesson-section takeaways"
        aria-labelledby="foundation-recall-heading"
      >
        <p class="section-label"><span>Keep</span>Recall under pressure</p>
        <h2 id="foundation-recall-heading">Key takeaways</h2>
        <ul>
          @for (takeaway of lesson().keyTakeaways; track takeaway) {
            <li>{{ takeaway }}</li>
          }
        </ul>
        <div class="language-notes" aria-label="Language notes">
          @for (note of lesson().languageNotes; track note.language) {
            <p>
              <strong>{{ note.language }}</strong
              >{{ note.note }}
            </p>
          }
        </div>
        <aside class="interview-recall" aria-labelledby="interview-recall-prompt">
          <span>Interview recall prompt</span>
          <h3 id="interview-recall-prompt">{{ lesson().interviewRecall.prompt }}</h3>
          <ol>
            @for (step of lesson().interviewRecall.answerFramework; track step) {
              <li>{{ step }}</li>
            }
          </ol>
        </aside>
      </section>

      @if (practiceItems().length) {
        <section
          id="foundation-practice"
          class="lesson-section practice-section"
          aria-labelledby="foundation-practice-heading"
        >
          <p class="section-label"><span>Continue</span>Transfer the model</p>
          <h2 id="foundation-practice-heading">Practice with intent</h2>
          <div class="practice-grid">
            @for (item of practiceItems(); track item.id) {
              <a [routerLink]="['/', pathId(), courseId(), item.id]">
                <span>{{ item.difficulty }} · {{ practiceVariation(item.id) }}</span>
                <strong>{{ item.title }}</strong>
                <p>{{ practiceReason(item.id) }}</p>
                <b aria-hidden="true">Start problem →</b>
              </a>
            }
          </div>
        </section>
      }
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .foundation-lesson {
        --lesson-ink: var(--text-strong);
        --lesson-body: var(--text-body);
        --lesson-teal: var(--accent-link);
        --lesson-line: var(--line);
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: 22px;
        color: var(--lesson-body);
        font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
      }
      .lesson-intro,
      .lesson-section {
        scroll-margin-top: 148px;
      }
      .lesson-intro {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
        gap: 22px;
        padding: 25px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background:
          radial-gradient(circle at 94% 8%, color-mix(in srgb, var(--accent-secondary) 18%, transparent), transparent 29%),
          linear-gradient(135deg, var(--surface-accent), var(--surface));
        box-shadow: 0 12px 30px var(--shadow);
      }
      .lesson-intro > p {
        align-self: center;
        margin: 0;
        color: var(--lesson-ink);
        font-size: clamp(1.08rem, 1vw + 0.72rem, 1.25rem);
        font-weight: 550;
        line-height: 1.7;
      }
      .lesson-intro section,
      .memory-anchor {
        padding: 17px 19px;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: var(--surface);
      }
      .memory-anchor {
        grid-column: 1 / -1;
        border-color: var(--line);
        border-left: 5px solid var(--lesson-teal);
        background: var(--surface-accent);
      }
      .memory-anchor strong {
        display: block;
        margin-top: 5px;
        color: var(--lesson-ink);
        font-size: 1.06rem;
      }
      .memory-anchor p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
      .lesson-intro h2 {
        margin: 4px 0 9px;
        color: var(--lesson-ink);
        font-size: 1.02rem;
      }
      .lesson-intro ul,
      .lesson-section ul,
      .lesson-section ol {
        margin: 8px 0 0;
        padding-left: 20px;
        line-height: 1.65;
      }
      .lesson-intro span,
      .memory-anchor span,
      .section-label,
      .model-grid span,
      .language-notes strong,
      .interview-recall span,
      .practice-grid span {
        color: var(--lesson-teal);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.075em;
        text-transform: uppercase;
      }
      .lesson-section {
        min-width: 0;
        padding: 23px 24px;
        border: 1px solid var(--lesson-line);
        border-top: 4px solid var(--lesson-teal);
        border-radius: 14px;
        background: var(--surface);
        box-shadow: 0 8px 22px var(--shadow);
      }
      .lesson-section.wide-section,
      .takeaways,
      .practice-section {
        grid-column: 1 / -1;
      }
      .lesson-section h2 {
        margin: 8px 0 14px;
        color: var(--lesson-ink);
        font-size: clamp(1.28rem, 1.6vw, 1.68rem);
        line-height: 1.2;
      }
      .lesson-section > p:not(.section-label) {
        line-height: 1.7;
      }
      .section-label {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        width: fit-content;
        margin: 0;
        padding-left: 11px;
        border-left: 3px solid var(--lesson-teal);
        line-height: 1.2;
      }
      .section-label span {
        padding-right: 9px;
        border-right: 1px solid var(--line);
        color: var(--text-subtle);
      }
      .model-section {
        --lesson-ink: var(--code-ink);
        --lesson-body: var(--code-ink);
        --lesson-teal: var(--code-keyword);
        grid-column: 1 / -1;
        color: var(--lesson-body);
        border-top-color: var(--code-line);
        background: var(--code-highlight);
      }
      .model-section .section-label span {
        color: var(--code-muted);
        border-right-color: var(--code-keyword);
      }
      .model-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .model-grid article {
        padding: 15px;
        border: 1px solid var(--code-keyword);
        border-radius: 10px;
        background: var(--code-highlight);
      }
      .model-grid article.model-invariant {
        border-color: var(--code-keyword);
        background: var(--code-highlight);
      }
      .model-grid p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
      .lesson-callout {
        margin-top: 15px;
        padding: 14px 16px;
        border-left: 4px solid var(--lesson-teal);
        border-radius: 8px;
        background: var(--surface-accent);
      }
      .lesson-callout[data-callout-type='production'] {
        border-left-color: var(--warning);
        background: var(--warning-surface);
      }
      .lesson-callout p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
      .foundation-code {
        overflow: hidden;
        margin-top: 17px;
        border: 1px solid var(--code-line);
        border-radius: 12px;
        background: var(--code-bg);
        color: var(--code-ink);
      }
      .foundation-code header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 13px;
        border-bottom: 1px solid var(--code-line);
        background: var(--code-bg);
      }
      .foundation-code header div {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .foundation-code small {
        color: var(--code-muted);
        text-transform: uppercase;
      }
      .foundation-code pre {
        overflow-x: auto;
        margin: 0;
        padding: 16px;
        font:
          0.82rem/1.65 'JetBrains Mono',
          monospace;
      }
      .concept-visual {
        overflow: hidden;
        margin: 18px 0 0;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .concept-visual img {
        display: block;
        width: 100%;
        height: auto;
      }
      .concept-visual figcaption {
        padding: 10px 14px;
        color: var(--text-subtle);
        font-size: 0.82rem;
        line-height: 1.5;
      }
      .visual-transcript {
        margin-top: 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
      }
      .visual-transcript summary {
        min-height: 44px;
        box-sizing: border-box;
        padding: 13px 15px;
        color: var(--lesson-teal);
        cursor: pointer;
        font-weight: 800;
      }
      .visual-transcript ol {
        padding: 0 36px 17px;
      }
      .pitfall-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .pitfall-list article {
        padding: 15px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--warning-surface);
      }
      .pitfall-list h3 {
        margin: 0 0 8px;
        color: var(--lesson-ink);
        font-size: 1rem;
      }
      .pitfall-list p {
        margin: 5px 0 0;
        line-height: 1.5;
      }
      .takeaways {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
        gap: 0 28px;
        border-top-color: var(--accent-strong);
        background: linear-gradient(145deg, var(--success-surface), var(--surface));
      }
      .takeaways > .section-label,
      .takeaways > h2,
      .interview-recall {
        grid-column: 1 / -1;
      }
      .language-notes {
        display: grid;
        gap: 8px;
      }
      .language-notes p {
        margin: 0;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        line-height: 1.45;
      }
      .language-notes strong {
        display: block;
        color: var(--success);
      }
      .interview-recall {
        margin-top: 20px;
        padding: 17px 19px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .interview-recall h3 {
        margin: 5px 0 8px;
        color: var(--lesson-ink);
        font-size: 1.02rem;
      }
      .practice-section {
        border-top-color: var(--warning);
      }
      .practice-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .practice-grid a {
        display: flex;
        min-width: 0;
        flex-direction: column;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 12px;
        color: var(--lesson-body);
        background: var(--surface);
        text-decoration: none;
      }
      .practice-grid a:hover,
      .practice-grid a:focus-visible {
        border-color: var(--warning);
        box-shadow: 0 8px 20px var(--shadow);
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .practice-grid strong {
        margin: 5px 0;
        color: var(--lesson-ink);
        font-size: 1.02rem;
      }
      .practice-grid p {
        flex: 1;
        margin: 0;
        line-height: 1.5;
      }
      .practice-grid b {
        margin-top: 13px;
        color: var(--warning);
        font-size: 0.8rem;
      }
      @media (max-width: 850px) {
        .foundation-lesson {
          grid-template-columns: 1fr;
        }
        .lesson-intro,
        .lesson-section.wide-section,
        .model-section,
        .takeaways,
        .practice-section {
          grid-column: auto;
        }
        .lesson-intro {
          grid-template-columns: 1fr;
        }
        .memory-anchor {
          grid-column: auto;
        }
        .takeaways {
          display: block;
        }
        .language-notes {
          margin-top: 18px;
        }
      }
      @media (max-width: 600px) {
        .lesson-intro,
        .lesson-section {
          padding: 18px;
        }
        .model-grid,
        .pitfall-list,
        .practice-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          scroll-behavior: auto !important;
          transition: none !important;
        }
      }
      @media (forced-colors: active) {
        .lesson-intro,
        .lesson-section,
        .model-grid article,
        .memory-anchor,
        .lesson-callout,
        .pitfall-list article,
        .interview-recall,
        .practice-grid a {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .section-label,
        .section-label span {
          border-color: CanvasText;
          color: CanvasText;
        }
        .practice-grid a:focus-visible,
        .visual-transcript summary:focus-visible {
          outline: 3px solid Highlight;
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class FoundationLessonShell {
  readonly lesson = input.required<FoundationLessonV1>();
  readonly checks = input.required<ResolvedPatternCheck[]>();
  readonly practiceItems = input.required<InterviewQuestion[]>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly questionModuleId = input<string | null>(null);
  readonly questionCount = input(0);
  readonly questionItems = input<ContentItemSummary[]>([]);

  protected practiceReason(questionId: string): string {
    return this.lesson().practice?.find((item) => item.questionId === questionId)?.reason ?? '';
  }

  protected practiceVariation(questionId: string): string {
    return (
      this.lesson().practice?.find((item) => item.questionId === questionId)?.variation ??
      'Foundation transfer'
    );
  }
}
