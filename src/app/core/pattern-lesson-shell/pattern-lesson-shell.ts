import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ContentItemSummary,
  InterviewQuestion,
  PatternLesson,
  ResolvedPatternCheck,
} from '../../content/content.models';
import { InteractiveTheoryVisual } from '../interactive-theory-visual/interactive-theory-visual';
import { InterviewQuestionBankLink } from '../interview-question-bank-link/interview-question-bank-link';
import { PatternCodeTabs } from '../pattern-code-tabs/pattern-code-tabs';
import { PatternProblemWorkbench } from '../pattern-problem-workbench/pattern-problem-workbench';
import { PatternUnderstandingChecks } from '../pattern-understanding-checks/pattern-understanding-checks';

@Component({
  selector: 'app-pattern-lesson-shell',
  imports: [
    RouterLink,
    InteractiveTheoryVisual,
    InterviewQuestionBankLink,
    PatternCodeTabs,
    PatternProblemWorkbench,
    PatternUnderstandingChecks,
  ],
  template: `
    <article class="golden-lesson" aria-label="Pattern lesson">
      <header class="lesson-intro">
        <p>{{ lesson().summary }}</p>
        <section aria-labelledby="lesson-outcomes-heading">
          <span>After this lesson</span>
          <h2 id="lesson-outcomes-heading">You will be able to</h2>
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

      <section id="pattern-what" class="lesson-section" aria-labelledby="pattern-what-heading">
        <p class="section-label"><span>01 / 14</span>Define</p>
        <h2 id="pattern-what-heading">{{ lesson().definition.heading }}</h2>
        @for (paragraph of lesson().definition.body; track paragraph) {
          <p [innerHTML]="paragraph"></p>
        }
        <aside class="invariant-card">
          <span>State we maintain</span>
          <p>{{ lesson().definition.maintainedState }}</p>
        </aside>
      </section>

      <section id="pattern-why" class="lesson-section" aria-labelledby="pattern-why-heading">
        <p class="section-label"><span>02 / 14</span>Motivate</p>
        <h2 id="pattern-why-heading">{{ lesson().motivation.heading }}</h2>
        @for (paragraph of lesson().motivation.body; track paragraph) {
          <p [innerHTML]="paragraph"></p>
        }
        <aside class="decision-card">
          <span>Repeated work removed</span>
          <p>{{ lesson().motivation.avoidedWork }}</p>
        </aside>
      </section>

      <section id="pattern-where" class="lesson-section" aria-labelledby="pattern-where-heading">
        <p class="section-label"><span>03 / 14</span>Recognize</p>
        <h2 id="pattern-where-heading">{{ lesson().recognition.heading }}</h2>
        @for (paragraph of lesson().recognition.body; track paragraph) {
          <p [innerHTML]="paragraph"></p>
        }
        <div class="recognition-grid">
          <section>
            <h3>Signals that should trigger the pattern</h3>
            <ul class="signal-list">
              @for (signal of lesson().recognition.signals; track signal) {
                <li>{{ signal }}</li>
              }
            </ul>
          </section>
          <section class="false-friends">
            <h3>Nearby problems that need something else</h3>
            <ul>
              @for (friend of lesson().recognition.falseFriends; track friend) {
                <li>{{ friend }}</li>
              }
            </ul>
          </section>
        </div>
      </section>

      <section
        id="pattern-model"
        class="lesson-section model-section"
        aria-labelledby="pattern-model-heading"
      >
        <p class="section-label"><span>04 / 14</span>Reason</p>
        <h2 id="pattern-model-heading">{{ lesson().model.heading }}</h2>
        <div class="model-grid">
          <article>
            <span>State</span>
            <p>{{ lesson().model.state }}</p>
          </article>
          <article class="model-invariant">
            <span>Invariant</span>
            <p>{{ lesson().model.invariant }}</p>
          </article>
          <article>
            <span>Decision rule</span>
            <p>{{ lesson().model.decisionRule }}</p>
          </article>
          <article>
            <span>Why it is correct</span>
            <p>{{ lesson().model.proof }}</p>
          </article>
        </div>
      </section>

      <section
        id="pattern-variations"
        class="lesson-section wide-section variation-section"
        aria-labelledby="pattern-variations-heading"
      >
        <p class="section-label"><span>05 / 14</span>Adapt</p>
        <h2 id="pattern-variations-heading">Choose the right pattern variant</h2>
        <div class="variation-grid">
          @for (variation of lesson().variations; track variation.id) {
            <article>
              <h3>{{ variation.title }}</h3>
              <p><strong>Why this variant:</strong> {{ variation.trigger }}</p>
              <p><strong>Invariant:</strong> {{ variation.invariant }}</p>
            </article>
          }
        </div>
        @if (lesson().namedAlgorithms?.length) {
          <section class="named-algorithms" aria-labelledby="named-algorithms-heading">
            <h3 id="named-algorithms-heading">Named algorithms in this family</h3>
            <div>
              @for (algorithm of lesson().namedAlgorithms; track algorithm.name) {
                <article>
                  <span>{{ algorithm.family }}</span>
                  <h4>{{ algorithm.name }}</h4>
                  <p><strong>Why this algorithm:</strong> {{ algorithm.useWhen }}</p>
                  <p><strong>Invariant:</strong> {{ algorithm.invariant }}</p>
                  <p><strong>Complexity:</strong> {{ algorithm.complexity }}</p>
                  <p class="algorithm-anchor">{{ algorithm.memoryAnchor }}</p>
                </article>
              }
            </div>
          </section>
        }
      </section>

      <section
        id="pattern-template"
        class="lesson-section wide-section"
        aria-labelledby="pattern-template-heading"
      >
        <p class="section-label"><span>06 / 14</span>Implement</p>
        <h2 id="pattern-template-heading">{{ lesson().template.heading }}</h2>
        @for (paragraph of lesson().template.introduction; track paragraph) {
          <p [innerHTML]="paragraph"></p>
        }
        <app-pattern-code-tabs
          [pseudocode]="lesson().template.pseudocode"
          [implementations]="lesson().template.implementations"
        />
      </section>

      <section
        id="pattern-visualize"
        class="lesson-section wide-section"
        aria-labelledby="pattern-visualize-heading"
      >
        <p class="section-label"><span>07 / 14</span>Visualize</p>
        <h2 id="pattern-visualize-heading">{{ lesson().conceptVisual.heading }}</h2>
        @for (paragraph of lesson().conceptVisual.body; track paragraph) {
          <p [innerHTML]="paragraph"></p>
        }
        <figure class="concept-visual">
          <app-interactive-theory-visual [visual]="lesson().conceptVisual.visual" />
          @if (lesson().conceptVisual.visual.caption; as caption) {
            <figcaption>{{ caption }}</figcaption>
          }
        </figure>
        <details class="visual-transcript">
          <summary>Read the complete visual transcript</summary>
          <ol>
            @for (step of lesson().conceptVisual.transcript; track step) {
              <li>{{ step }}</li>
            }
          </ol>
        </details>
      </section>

      <section
        id="pattern-complexity"
        class="lesson-section"
        aria-labelledby="pattern-complexity-heading"
      >
        <p class="section-label"><span>08 / 14</span>Evaluate</p>
        <h2 id="pattern-complexity-heading">Complexity and trade-offs</h2>
        <div class="complexity-grid">
          <article>
            <span>Time</span><strong>{{ lesson().complexity.time }}</strong>
          </article>
          <article>
            <span>Space</span><strong>{{ lesson().complexity.space }}</strong>
          </article>
        </div>
        <p>{{ lesson().complexity.note }}</p>
        <ul>
          @for (reason of lesson().complexity.why; track reason) {
            <li>{{ reason }}</li>
          }
        </ul>
        <div class="tradeoff-list">
          @for (tradeoff of lesson().complexity.tradeoffs; track tradeoff) {
            <p>{{ tradeoff }}</p>
          }
        </div>
      </section>

      <section
        id="pattern-pitfalls"
        class="lesson-section"
        aria-labelledby="pattern-pitfalls-heading"
      >
        <p class="section-label"><span>09 / 14</span>Debug</p>
        <h2 id="pattern-pitfalls-heading">Common failure modes</h2>
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
        id="pattern-guidance"
        class="lesson-section"
        aria-labelledby="pattern-guidance-heading"
      >
        <p class="section-label"><span>10 / 14</span>Choose</p>
        <h2 id="pattern-guidance-heading">Use it deliberately</h2>
        <div class="guidance-grid">
          <section>
            <h3>Use when</h3>
            <ul>
              @for (item of lesson().guidance.useWhen; track item) {
                <li>{{ item }}</li>
              }
            </ul>
          </section>
          <section class="avoid">
            <h3>Avoid when</h3>
            <ul>
              @for (item of lesson().guidance.avoidWhen; track item) {
                <li>{{ item }}</li>
              }
            </ul>
          </section>
        </div>
      </section>

      <section id="pattern-worked" class="lesson-section" aria-labelledby="pattern-worked-heading">
        <p class="section-label"><span>11 / 14</span>Rehearse</p>
        <h2 id="pattern-worked-heading">Worked examples</h2>
        <label class="example-picker">
          Example
          <select
            [value]="workedExampleIndex()"
            (change)="selectWorkedExample($any($event.target).value)"
          >
            @for (example of lesson().workedExamples; track example.id; let index = $index) {
              <option [value]="index">{{ example.title }}</option>
            }
          </select>
        </label>
        @if (workedExample(); as example) {
          <article class="worked-example">
            <div>
              <p><span>Input</span>{{ example.input }}</p>
              <p><span>Output</span>{{ example.expectedOutput }}</p>
            </div>
            <p>{{ example.explanation }}</p>
            <ol>
              @for (step of example.steps; track $index) {
                <li>{{ step }}</li>
              }
            </ol>
          </article>
        }
      </section>

      <section
        id="pattern-understand"
        class="lesson-section wide-section"
        aria-labelledby="pattern-understand-heading"
      >
        <p class="section-label"><span>12 / 14</span>Retrieve</p>
        <h2 id="pattern-understand-heading">Check your understanding</h2>
        <p>
          Answer before revealing the reference response. The set deliberately covers recognition,
          invariant, complexity, edge cases, and comparison.
        </p>
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
        id="pattern-essential"
        class="lesson-section wide-section"
        aria-labelledby="pattern-essential-heading"
      >
        <p class="section-label"><span>13 / 14</span>Transfer</p>
        <app-pattern-problem-workbench [problems]="essentialProblems()" />
      </section>

      <section class="lesson-section takeaways" aria-labelledby="pattern-takeaways-heading">
        <p class="section-label">Keep</p>
        <h2 id="pattern-takeaways-heading">Key takeaways</h2>
        <ul>
          @for (takeaway of lesson().keyTakeaways; track takeaway) {
            <li>{{ takeaway }}</li>
          }
        </ul>
        <div class="language-notes">
          @for (note of lesson().languageNotes; track note.language) {
            <p>
              <strong>{{ note.language }}</strong
              >{{ note.note }}
            </p>
          }
        </div>
        <aside class="interview-recall" aria-labelledby="interview-recall-heading">
          <span>Interview recall prompt</span>
          <h3 id="interview-recall-heading">{{ lesson().interviewRecall.prompt }}</h3>
          <ol>
            @for (step of lesson().interviewRecall.answerFramework; track step) {
              <li>{{ step }}</li>
            }
          </ol>
        </aside>
      </section>

      <section
        id="pattern-practice"
        class="lesson-section practice-section"
        aria-labelledby="pattern-practice-heading"
      >
        <p class="section-label"><span>14 / 14</span>Continue</p>
        <h2 id="pattern-practice-heading">Practice with intent</h2>
        <p>
          These problems are explicitly linked to this lesson and ordered to increase transfer, not
          merely grouped by module.
        </p>
        <a
          class="practice-hub-link"
          routerLink="/learn/hands-on-dsa"
          [queryParams]="{ pattern: practicePatternId() }"
          >Open this pattern in Hands-On DSA <span aria-hidden="true">→</span></a
        >
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
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .golden-lesson {
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
        grid-column: 1/-1;
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
        gap: 24px;
        padding: 25px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background:
          radial-gradient(circle at 92% 5%, color-mix(in srgb, var(--accent-secondary) 18%, transparent), transparent 29%),
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
      .lesson-intro section {
        padding: 17px 19px;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: var(--surface);
      }
      .memory-anchor {
        grid-column: 1/-1;
        padding: 17px 19px;
        border: 1px solid var(--line);
        border-left: 5px solid var(--accent-strong);
        border-radius: 13px;
        background: var(--surface-accent);
      }
      .memory-anchor strong {
        display: block;
        margin-top: 5px;
        color: var(--lesson-ink);
        font-size: 1.05rem;
      }
      .memory-anchor p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
      .lesson-intro span,
      .memory-anchor span,
      .section-label,
      .lesson-section aside span,
      .model-grid span,
      .complexity-grid span,
      .worked-example span,
      .practice-grid span {
        display: block;
        color: var(--lesson-teal);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.075em;
        text-transform: uppercase;
      }
      .practice-hub-link {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin: 4px 0 18px;
        padding: 9px 13px;
        border: 1px solid var(--lesson-teal);
        border-radius: 999px;
        color: var(--accent-on-primary);
        background: var(--lesson-teal);
        font-size: 0.79rem;
        font-weight: 850;
        text-decoration: none;
      }
      .practice-hub-link:hover,
      .practice-hub-link:focus-visible {
        background: var(--accent-strong);
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
        grid-column: 1/-1;
      }
      .section-label {
        width: fit-content;
        margin: 0 0 9px;
        display: inline-flex;
        align-items: center;
        gap: 9px;
        padding-left: 11px;
        border-left: 3px solid var(--lesson-teal);
        line-height: 1.2;
      }
      .section-label > span {
        padding-right: 9px;
        border-right: 1px solid var(--line);
        color: var(--text-subtle);
        font-variant-numeric: tabular-nums;
      }
      .lesson-section h2 {
        margin: 0 0 13px;
        color: var(--lesson-ink);
        font-size: clamp(1.3rem, 2.3vw, 1.72rem);
        line-height: 1.25;
      }
      .lesson-section > p {
        margin: 0 0 12px;
        font-size: 1rem;
        line-height: 1.66;
        text-wrap: pretty;
      }
      .lesson-section > p:last-child {
        margin-bottom: 0;
      }
      .invariant-card,
      .decision-card {
        margin-top: 17px;
        padding: 14px 16px;
        border-left: 4px solid var(--warning);
        border-radius: 0 10px 10px 0;
        background: var(--warning-surface);
      }
      .lesson-section aside p {
        margin: 5px 0 0;
        color: var(--lesson-ink);
        font-weight: 700;
        line-height: 1.55;
      }
      .recognition-grid,
      .guidance-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-top: 17px;
      }
      .recognition-grid > section,
      .guidance-grid > section {
        padding: 17px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface-accent);
      }
      .recognition-grid .false-friends,
      .guidance-grid .avoid {
        border-color: var(--line);
        background: var(--warning-surface);
      }
      .recognition-grid h3,
      .guidance-grid h3 {
        margin: 0;
        color: var(--lesson-ink);
        font-size: 0.94rem;
      }
      .signal-list li::marker {
        color: var(--accent-link);
      }
      .model-section {
        background: linear-gradient(145deg, var(--code-panel), var(--code-bg));
        color: var(--code-ink);
        border-color: var(--code-line);
      }
      .model-section h2 {
        color: var(--code-ink);
      }
      .model-section .section-label {
        border-left-color: var(--code-keyword);
        color: var(--code-keyword);
      }
      .model-section .section-label > span {
        border-right-color: var(--code-line);
        color: var(--code-ink);
      }
      .model-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 11px;
      }
      .model-grid article {
        padding: 15px;
        border: 1px solid var(--code-line);
        border-radius: 10px;
        background: var(--code-panel);
      }
      .model-grid .model-invariant {
        border-color: var(--code-line);
        background: var(--code-panel);
      }
      .model-grid span {
        color: var(--code-keyword);
      }
      .model-grid p {
        margin: 5px 0 0;
        color: var(--code-ink);
        line-height: 1.55;
      }
      .variation-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .variation-grid article {
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 11px;
        background: var(--surface);
      }
      .variation-grid h3,
      .pitfall-list h3 {
        margin: 0 0 7px;
        color: var(--lesson-ink);
        font-size: 1rem;
      }
      .variation-grid p,
      .pitfall-list p {
        margin: 5px 0;
        line-height: 1.5;
      }
      .named-algorithms {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
      }
      .named-algorithms > h3 {
        margin: 0 0 12px;
        color: var(--lesson-ink);
        font-size: 1.05rem;
      }
      .named-algorithms > div {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .named-algorithms article {
        padding: 15px;
        border: 1px solid var(--line);
        border-radius: 11px;
        background: var(--surface-accent);
      }
      .named-algorithms article > span {
        color: var(--lesson-teal);
        font-size: 0.66rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .named-algorithms h4 {
        margin: 4px 0 9px;
        color: var(--lesson-ink);
        font-size: 1rem;
      }
      .named-algorithms p {
        margin: 6px 0;
        line-height: 1.5;
      }
      .named-algorithms .algorithm-anchor {
        padding: 8px 10px;
        border-left: 3px solid var(--warning);
        color: var(--warning);
        background: var(--warning-surface);
        font-weight: 750;
      }
      .concept-visual {
        margin: 18px 0 0;
        padding: 0;
        overflow: hidden;
        border: 1px solid var(--lesson-line);
        border-radius: 14px;
        background: var(--surface-accent);
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
        padding: 13px 15px;
        color: var(--lesson-teal);
        cursor: pointer;
        font-weight: 800;
      }
      .visual-transcript summary:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: -3px;
      }
      .visual-transcript ol {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0 36px 17px;
      }
      .complexity-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 15px;
      }
      .complexity-grid article {
        padding: 15px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface-accent);
      }
      .complexity-grid strong {
        display: block;
        margin-top: 3px;
        color: var(--lesson-ink);
        font:
          800 1rem 'JetBrains Mono',
          monospace;
      }
      .tradeoff-list {
        display: grid;
        gap: 7px;
        margin-top: 15px;
      }
      .tradeoff-list p {
        margin: 0;
        padding: 10px 12px;
        border-left: 3px solid var(--warning);
        background: var(--warning-surface);
        line-height: 1.5;
      }
      .pitfall-list {
        display: grid;
        gap: 10px;
      }
      .pitfall-list article {
        padding: 15px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--warning-surface);
      }
      .guidance-grid ul {
        margin-top: 9px;
      }
      .example-picker {
        display: grid;
        min-width: 0;
        gap: 5px;
        width: 100%;
        max-width: 420px;
        color: var(--text-subtle);
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .example-picker select {
        min-width: 0;
        min-height: 42px;
        width: 100%;
        max-width: 100%;
        padding: 9px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--lesson-ink);
        background: var(--surface);
        font:
          750 0.84rem 'Avenir Next',
          sans-serif;
      }
      .example-picker select:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .worked-example {
        margin-top: 14px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .worked-example > div {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .worked-example > div p {
        margin: 0;
        padding: 10px;
        border-radius: 8px;
        background: var(--surface-accent);
        font:
          700 0.8rem/1.5 'JetBrains Mono',
          monospace;
        overflow-wrap: anywhere;
      }
      .worked-example > p {
        margin: 15px 0 0;
        line-height: 1.6;
      }
      .takeaways {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
        gap: 0 28px;
        border-top-color: var(--accent-strong);
        background: linear-gradient(145deg, var(--success-surface), var(--surface));
      }
      .takeaways .section-label,
      .takeaways h2 {
        grid-column: 1/-1;
      }
      .takeaways > ul {
        font-weight: 700;
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
        font-size: 0.72rem;
        text-transform: uppercase;
      }
      .interview-recall {
        grid-column: 1/-1;
        margin-top: 20px;
        padding: 17px 19px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .interview-recall span {
        color: var(--success);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.075em;
        text-transform: uppercase;
      }
      .interview-recall h3 {
        margin: 5px 0 8px;
        color: var(--lesson-ink);
        font-size: 1.02rem;
      }
      .interview-recall ol {
        margin: 0;
      }
      .practice-section {
        border-top-color: var(--warning);
        background:
          radial-gradient(circle at 100% 0, color-mix(in srgb, var(--accent-secondary) 17%, transparent), transparent 32%), var(--surface);
      }
      .practice-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 18px;
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
        outline: none;
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
        .golden-lesson {
          grid-template-columns: 1fr;
        }
        .lesson-intro,
        .lesson-section.wide-section,
        .takeaways,
        .practice-section {
          grid-column: auto;
        }
        .lesson-intro {
          grid-template-columns: 1fr;
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
        .recognition-grid,
        .guidance-grid,
        .model-grid,
        .variation-grid,
        .complexity-grid,
        .worked-example > div,
        .practice-grid {
          grid-template-columns: 1fr;
        }
        .named-algorithms > div {
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
        .model-section,
        .model-grid article,
        .recognition-grid > section,
        .guidance-grid > section,
        .variation-grid article,
        .named-algorithms article,
        .memory-anchor,
        .interview-recall,
        .pitfall-list article,
        .worked-example,
        .practice-grid a {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .practice-hub-link {
          border-color: LinkText;
          color: LinkText;
          background: Canvas;
        }
        .section-label,
        .section-label > span {
          border-color: CanvasText;
          color: CanvasText;
        }
        .practice-grid a:focus-visible,
        .example-picker select:focus-visible,
        .visual-transcript summary:focus-visible {
          outline: 3px solid Highlight;
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class PatternLessonShell {
  readonly lesson = input.required<PatternLesson>();
  readonly checks = input.required<ResolvedPatternCheck[]>();
  readonly practiceItems = input.required<InterviewQuestion[]>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly practicePatternId = input.required<string>();
  readonly questionModuleId = input<string | null>(null);
  readonly questionCount = input(0);
  readonly questionItems = input<ContentItemSummary[]>([]);
  protected readonly workedExampleIndex = signal(0);
  protected readonly workedExample = computed(
    () =>
      this.lesson().workedExamples[this.workedExampleIndex()] ?? this.lesson().workedExamples[0],
  );
  protected readonly essentialProblems = computed(() => {
    const problems = this.lesson().essentialProblems ?? [];
    const reviewOrder = this.lesson().essentialProblemReviewOrder;
    if (!reviewOrder?.length) return problems;

    const rank = new Map(reviewOrder.map((id, index) => [id, index]));
    return problems
      .map((problem, sourceIndex) => ({ problem, sourceIndex }))
      .sort(
        (left, right) =>
          (rank.get(left.problem.id) ?? reviewOrder.length + left.sourceIndex) -
          (rank.get(right.problem.id) ?? reviewOrder.length + right.sourceIndex),
      )
      .map(({ problem }) => problem);
  });

  protected selectWorkedExample(value: string): void {
    this.workedExampleIndex.set(Number(value));
  }

  protected practiceReason(questionId: string): string {
    return this.lesson().practice.find((item) => item.questionId === questionId)?.reason ?? '';
  }

  protected practiceVariation(questionId: string): string {
    return (
      this.lesson().practice.find((item) => item.questionId === questionId)?.variation ??
      'Pattern transfer'
    );
  }
}
