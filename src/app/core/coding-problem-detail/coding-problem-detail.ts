import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InterviewQuestion, TheoryVisual } from '../../content/content.models';
import { CodingSolutionTabs } from '../coding-solution-tabs/coding-solution-tabs';

@Component({
  selector: 'app-coding-problem-detail',
  imports: [RouterLink, CodingSolutionTabs],
  template: `
    <section class="coding-problem-detail" aria-label="Coding problem workspace">
      <div class="coding-problem-links">
        @if (relatedArticleId()) {
          <a [routerLink]="['/', pathId(), courseId(), relatedArticleId()]"
            >← Review related theory</a
          >
        }
        @if (leetcodeUrl()) {
          <a [href]="leetcodeUrl()" target="_blank" rel="noopener noreferrer"
            >Open the original problem source ↗</a
          >
        }
      </div>
      @if (item().practiceProblem; as practice) {
        <section class="practice-brief" aria-labelledby="practice-objective-heading">
          <div class="practice-brief-heading">
            <div>
              <span>{{ practice.tier }} practice</span>
              <h2 id="practice-objective-heading">Practice objective</h2>
            </div>
            <small [attr.data-status]="practice.implementationStatus">
              {{
                practice.implementationStatus === 'complete' ? 'Practice-ready' : 'Catalogued entry'
              }}
            </small>
          </div>
          <p>{{ practice.objective }}</p>
          @if (practice.implementationStatus === 'starter') {
            <p class="practice-readiness-warning" role="note">
              <strong>Not yet self-contained.</strong> Confirm the exact statement, input/output
              contract, constraints, and examples from the original source or interviewer before
              implementing this catalogued problem.
            </p>
          }
          @if (practice.sourceSets.length) {
            <p class="source-sets">
              <strong>Coverage:</strong> {{ practice.sourceSets.join(' · ') }}
            </p>
          }
          @if (practice.constraints?.length) {
            <ul>
              @for (constraint of practice.constraints; track constraint) {
                <li>{{ constraint }}</li>
              }
            </ul>
          }
        </section>
        @if (practice.examples?.length) {
          <section class="practice-examples" aria-label="Examples">
            @for (example of practice.examples; track example.input + example.output) {
              <article>
                <p>
                  <span>Input</span><code>{{ example.input }}</code>
                </p>
                <p>
                  <span>Output</span><code>{{ example.output }}</code>
                </p>
                @if (example.explanation) {
                  <small>{{ example.explanation }}</small>
                }
              </article>
            }
          </section>
        }
      }
      @if (sampleInput(); as sample) {
        <p class="coding-sample-input">
          <span>Example input</span><code>{{ sample }}</code>
        </p>
      }
      <details class="coding-hint">
        <summary>Show hint <span aria-hidden="true">›</span></summary>
        <p [innerHTML]="item().interviewAnswer"></p>
      </details>
      @if (item().practiceProblem?.hints?.length) {
        <section class="progressive-hints" aria-label="Progressive hints">
          @for (hint of item().practiceProblem!.hints!; track hint; let index = $index) {
            <details>
              <summary>Hint {{ index + 1 }}</summary>
              <p>{{ hint }}</p>
            </details>
          }
        </section>
      }
      @if (item().solutions?.length) {
        <app-coding-solution-tabs
          [solutions]="item().solutions!"
          [complexity]="item().complexity"
          [visual]="visual()"
        />
      }
      <section class="coding-explanation">
        <p class="panel-label">Why this works</p>
        @for (paragraph of item().explanation; track paragraph) {
          <p [innerHTML]="paragraph"></p>
        }
      </section>
      @if (item().followUps.length) {
        <section class="coding-followups">
          <p class="panel-label">Build on the solution</p>
          @for (followUp of item().followUps; track followUp.question) {
            <details>
              <summary>{{ followUp.question }}</summary>
              <p>{{ followUp.answer }}</p>
            </details>
          }
        </section>
      }
    </section>
  `,
  styles: [
    `
      .coding-problem-detail {
        margin: 0 auto 36px;
        max-width: 1120px;
      }
      .coding-problem-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 0 0 12px;
      }
      .coding-problem-links a {
        color: #168ca5;
        font-size: 0.82rem;
        font-weight: 800;
        text-decoration: none;
      }
      .coding-problem-links a:last-child {
        color: #b45309;
      }
      .coding-problem-links a:hover,
      .coding-problem-links a:focus-visible {
        text-decoration: underline;
        outline: none;
      }
      .practice-brief {
        margin: 0 0 14px;
        padding: 20px;
        border: 1px solid #bcdbe3;
        border-radius: 14px;
        background: linear-gradient(135deg, #f1fbfb, #fff);
      }
      .practice-brief-heading {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }
      .practice-brief-heading span {
        color: #0d8192;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .practice-brief h2 {
        margin: 4px 0 0;
        color: #192b3d;
        font:
          800 1.18rem 'Avenir Next',
          Avenir,
          sans-serif;
      }
      .practice-brief-heading small {
        padding: 5px 9px;
        border: 1px solid #c7d9e8;
        border-radius: 999px;
        color: #49637a;
        background: #fff;
        font-weight: 800;
        text-transform: capitalize;
      }
      .practice-brief-heading small[data-status='starter'] {
        border-color: #efc58e;
        color: #9a4d08;
        background: #fff9ef;
      }
      .practice-readiness-warning {
        padding: 11px 13px;
        border-left: 4px solid #b76b00;
        color: #543a17;
        background: #fff7e8;
        line-height: 1.5;
      }
      .practice-brief > p {
        color: #334155;
        line-height: 1.68;
      }
      .practice-brief ul {
        margin: 10px 0 0;
        padding-left: 20px;
        color: #475569;
        line-height: 1.65;
      }
      .source-sets {
        font-size: 0.8rem;
      }
      .practice-examples {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 0 0 14px;
      }
      .practice-examples article {
        padding: 14px;
        border: 1px solid #dbe3ee;
        border-radius: 12px;
        background: #fff;
      }
      .practice-examples p {
        display: grid;
        grid-template-columns: 55px minmax(0, 1fr);
        gap: 8px;
        margin: 0 0 7px;
        color: #475569;
      }
      .practice-examples span {
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .practice-examples code {
        overflow-wrap: anywhere;
      }
      .practice-examples small {
        color: #64748b;
        line-height: 1.5;
      }
      .coding-sample-input {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: baseline;
        margin: 0 0 12px;
        color: #334155;
      }
      .coding-sample-input span {
        color: #64748b;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .coding-sample-input code {
        font-size: 0.84rem;
      }
      .coding-hint {
        margin: 0 0 8px;
        overflow: hidden;
        border: 1px solid #cbdcec;
        border-left: 5px solid #168ca5;
        border-radius: 12px;
        background: #f0f7ff;
      }
      .coding-hint summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 13px 16px;
        color: #315f9d;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 850;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .coding-hint summary::-webkit-details-marker {
        display: none;
      }
      .coding-hint summary span {
        font-size: 1.3rem;
        transition: transform 0.15s ease;
      }
      .coding-hint[open] summary span {
        transform: rotate(90deg);
      }
      .coding-hint p {
        margin: 0;
        padding: 0 16px 15px;
        color: #334155;
        line-height: 1.72;
      }
      .progressive-hints {
        display: grid;
        gap: 7px;
        margin: 10px 0 18px;
      }
      .progressive-hints details {
        border: 1px solid #d8e3eb;
        border-radius: 9px;
        background: #fff;
      }
      .progressive-hints summary {
        padding: 10px 13px;
        color: #315f9d;
        cursor: pointer;
        font-size: 0.78rem;
        font-weight: 800;
      }
      .progressive-hints p {
        margin: 0;
        padding: 0 13px 12px;
        color: #475569;
        line-height: 1.6;
      }
      .coding-explanation,
      .coding-followups {
        margin: 24px 0 0;
        padding: 24px;
        border: 1px solid #dbe3ee;
        border-radius: 14px;
        background: #fff;
      }
      .coding-explanation p:not(.panel-label) {
        color: #334155;
        line-height: 1.72;
      }
      .coding-explanation p:not(.panel-label):last-child {
        margin-bottom: 0;
      }
      .coding-followups details + details {
        margin-top: 8px;
      }
      .coding-followups summary {
        cursor: pointer;
        color: #172033;
        font-weight: 750;
      }
      .coding-followups details p {
        margin: 8px 0 0;
        color: #475569;
        line-height: 1.65;
      }
      @media (max-width: 640px) {
        .practice-brief-heading,
        .practice-examples {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
        }
        .practice-brief-heading small {
          justify-self: start;
        }
      }
    `,
  ],
})
export class CodingProblemDetail {
  readonly item = input.required<InterviewQuestion>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly relatedArticleId = input<string>();
  readonly leetcodeUrl = input<string | null>(null);
  readonly visual = input<TheoryVisual | null>(null);
  readonly sampleInput = computed(
    () =>
      ({
        'core-ds-dynamic-append': 'values = [7, 2, 9, 4, 6]',
        'core-ds-dynamic-remove-stable': 'values = [7, 2, 9, 4], index = 1',
        'core-ds-dynamic-remove-unordered': 'values = [7, 2, 9, 4], index = 1',
        'core-ds-remove-duplicates-sorted': 'nums = [1, 1, 2]',
        'core-ds-insert-delete-random': 'insert(1), remove(2), insert(2), getRandom()',
      })[this.item().id] ?? null,
  );
}
