import { Component, input } from '@angular/core';
import { FoundationLessonV1, LearningScenario } from '../../content/content.models';

/**
 * The Scenario card that opens a system lesson: the lesson in one line, why the subject and why it matters,
 * the learning scenario and what this lesson does in it, then the outcomes (user review, 2026-10-05: stacked,
 * one below the other). The host is the lesson's `section.lesson-section.scenario-card`.
 */
@Component({
  selector: 'section[appLessonScenarioCard]',
  template: `
    <p class="section-label stage-label"><span>{{ stageLabel() }}</span>Scenario</p>
    <div class="lesson-one-line">
      <span class="one-line-label">In one line</span>
      <p><span class="rich" [innerHTML]="lesson().summary"></span></p>
    </div>
    @if (lesson().learningScenario; as scenario) {
      <!-- Order (user review, 2026-10-05): why the subject and why it matters, then the scenario and what
           this lesson does in it (problems and their fixes), then the outcomes. Stacked, one below the other. -->
      @if (scenario.subject && scenario.whySubject) {
        <div class="scenario-block">
          <h3>Why {{ scenario.subject }}?</h3>
          <div class="rich scenario-why-text" [innerHTML]="scenario.whySubject"></div>
        </div>
        @if (lesson().learningFlow; as flow) {
          <div class="scenario-block">
            <h3>Why {{ scenario.subject }} matters</h3>
            <p><span class="rich" [innerHTML]="flow.whyItMatters"></span></p>
          </div>
        }
      }
      <h2 data-sidebar-label="Scenario">Learning scenario: {{ scenario.system }}</h2>
      <p class="scenario-brands">Think of {{ brandList(scenario.brands) }}.</p>
      <div class="scenario-block">
        <h3>{{ scenarioHeading(scenario) }}</h3>
        <div class="rich scenario-why-text" [innerHTML]="scenario.why"></div>
      </div>
      @if (!(scenario.subject && scenario.whySubject) && lesson().learningFlow; as flow) {
        <div class="scenario-block">
          <h3>Why it matters</h3>
          <p><span class="rich" [innerHTML]="flow.whyItMatters"></span></p>
        </div>
      }
      <h3>After this lesson you can</h3>
      <ul>
        @for (outcome of lesson().learningOutcomes; track outcome) {
          <li><span class="rich" [innerHTML]="outcome"></span></li>
        }
      </ul>
    } @else {
      <h2 data-sidebar-label="Scenario">What you will learn</h2>
      <ul>
        @for (outcome of lesson().learningOutcomes; track outcome) {
          <li><span class="rich" [innerHTML]="outcome"></span></li>
        }
      </ul>
      @if (lesson().learningFlow; as flow) {
        <p><strong>Why it matters:</strong>{{ ' ' }}<span class="rich" [innerHTML]="flow.whyItMatters"></span></p>
      }
    }
  `,
  styles: [
    `
      /* The lesson card parts this card shares with the others (stage label, headings, text, lists),
         as the lesson shell sets them. */
      .section-label {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        width: fit-content;
        margin: 0;
        padding-left: 11px;
        border-left: 3px solid var(--lesson-teal);
        color: var(--lesson-teal);
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.075em;
        line-height: 1.2;
        text-transform: uppercase;
      }
      .section-label span {
        padding-right: 9px;
        border-right: 1px solid var(--line);
        color: var(--text-subtle);
      }
      :host-context(.system) :is(.section-label, .one-line-label) {
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        text-transform: none;
      }
      :host(.lesson-section) ul {
        margin: 8px 0 0;
        padding-left: 20px;
        line-height: 1.65;
      }
      h2 {
        margin: 8px 0 14px;
        color: var(--lesson-ink);
        font-size: clamp(1.28rem, 1.6vw, 1.68rem);
        line-height: 1.2;
      }
      :host > p:not(.section-label) {
        line-height: 1.7;
      }
      :host-context(.system) h2 {
        margin: 0.6rem 0 1.25rem;
        font-size: clamp(1.35rem, 1.4vw + 0.9rem, 1.7rem);
        line-height: 1.25;
      }
      :host-context(.system) h3 {
        margin: 1.75rem 0 0.5rem;
        color: var(--text-strong);
        font-size: 1.08rem;
      }
      :host-context(.system) p,
      :host-context(.system) > ul {
        max-width: var(--reading-width);
      }
      :host-context(.system) p {
        line-height: 1.8;
      }
      :host-context(.system) > ul {
        margin: 0.4rem 0 0;
        padding-left: 1.4rem;
        line-height: 1.75;
      }
      :host-context(.system) > ul > li + li {
        margin-top: 0.6rem;
      }
      /* A scenario note may hold paragraphs and a short list (2026-10-05). */
      .scenario-why-text {
        max-width: var(--reading-width);
        margin: 0 0 1rem;
        line-height: 1.8;
      }
      .scenario-why-text ::ng-deep :is(p, ul) {
        margin: 0 0 0.5rem;
      }
      .scenario-why-text ::ng-deep ul {
        padding-left: 1.2rem;
      }
      :host-context(.system) .lesson-one-line {
        margin: 0.75rem 0 1.25rem;
        padding: 1rem 1.25rem;
        border-left: 3px solid var(--lesson-teal);
        border-radius: 6px;
        background: var(--surface-accent);
      }
      .one-line-label {
        display: block;
        margin-bottom: 0.3rem;
        color: var(--lesson-teal);
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      :host-context(.system) .lesson-one-line p {
        margin: 0;
        color: var(--text-strong);
        font-size: 1.12rem;
        line-height: 1.6;
      }
      /* Scenario card blocks, one below the other (2026-10-05). */
      .scenario-block {
        margin: 1rem 0;
        padding: 1rem 1.2rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface-muted);
      }
      :host-context(.system) .scenario-block h3 {
        margin: 0 0 0.35rem;
      }
      :host-context(.system) .scenario-block p {
        margin: 0;
      }
      .lesson-one-line {
        margin: 0.75rem 0 1rem;
        font-size: 1.1rem;
        line-height: 1.6;
        color: var(--text-strong);
      }
      .scenario-brands {
        color: var(--text-subtle);
      }
      @media (forced-colors: active) {
        .section-label,
        .section-label span {
          border-color: CanvasText;
          color: CanvasText;
        }
      }
    `,
  ],
})
export class LessonScenarioCard {
  readonly lesson = input.required<FoundationLessonV1>();
  /** The label of the stage the card opens (shown before "Scenario"). */
  readonly stageLabel = input.required<string>();

  protected brandList(brands: string[]): string {
    return brands.length < 2 ? brands.join('') : `${brands.slice(0, -1).join(', ')} or ${brands.at(-1)}`;
  }

  /** "This lesson: auto-configuration in a currency conversion service", or the older "Why this scenario?". */
  protected scenarioHeading(scenario: LearningScenario): string {
    if (!scenario.focus) return 'Why this scenario?';
    const system = scenario.system.replace(/^(A|An|The) /, (word) => word.toLowerCase());
    return `This lesson: ${scenario.focus} in ${system}`;
  }
}
