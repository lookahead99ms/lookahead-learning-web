import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { PatternProblemFixture } from '../../content/content.models';

/**
 * The problem's examples beside "Your code" (user-approved preview, "+ Practice tools",
 * 2026-10-05): every fixture as input → expected, with its explanation one click away. Examples
 * are part of the problem statement, so they stay visible during a timed attempt.
 */
@Component({
  selector: 'app-studio-examples',
  template: `
    <h3>Examples</h3>
    <ol>
      @for (example of fixtures(); track example.id; let index = $index) {
        <li>
          @if (example.explanation) {
            <details>
              <summary>
                <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: example, index, why: true }" />
              </summary>
              <p>{{ example.explanation }}</p>
            </details>
          } @else {
            <div class="plain">
              <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: example, index }" />
            </div>
          }
        </li>
      }
    </ol>
    <ng-template #row let-example let-index="index" let-why="why">
      <span class="name"
        >Example {{ index + 1 }}<span class="label">{{ example.label }}</span>
        @if (why) {
          <span class="why" aria-hidden="true"></span>
        }
      </span>
      <span class="io"
        ><code>{{ example.input }}</code> <span class="arrow" aria-hidden="true">→</span
        ><span class="visually-hidden">expected</span> <code>{{ example.expectedOutput }}</code></span
      >
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
  host: { role: 'region', 'aria-label': 'Examples' },
  styles: [
    `
      :host {
        display: grid;
        gap: 10px;
        min-width: 0;
        padding: 14px 16px 16px;
        font-size: 13px;
      }
      h3 {
        margin: 0;
        color: var(--text-strong);
        font-size: 15px;
      }
      ol {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      details,
      .plain {
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
      }
      summary,
      .plain {
        display: grid;
        gap: 2px;
        padding: 8px 10px;
      }
      summary {
        cursor: pointer;
        list-style: none;
      }
      summary::-webkit-details-marker {
        display: none;
      }
      summary:focus-visible {
        outline: 3px solid var(--accent-focus, var(--accent-strong));
        outline-offset: 2px;
        border-radius: 8px;
      }
      details[open] {
        border-color: var(--accent-strong);
      }
      .name {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 2px 8px;
        color: var(--text-strong);
        font-weight: 700;
      }
      .why {
        margin-inline-start: auto;
        color: var(--accent-link);
        font-size: 12px;
        font-weight: 600;
      }
      .why::after {
        content: 'Why ▾';
      }
      details[open] .why::after {
        content: 'Hide ▴';
      }
      .label {
        color: var(--text-subtle);
        font-weight: 500;
      }
      .io {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 6px;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      code {
        font:
          12px/1.6 ui-monospace,
          'SF Mono',
          Menlo,
          Consolas,
          monospace;
        color: var(--text-strong);
        overflow-wrap: anywhere;
      }
      .arrow {
        color: var(--text-subtle);
      }
      details p {
        margin: 0;
        padding: 0 10px 10px;
        color: var(--text-body);
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `,
  ],
})
export class StudioExamples {
  readonly fixtures = input.required<readonly PatternProblemFixture[]>();
}
