import { Component, input } from '@angular/core';
import { TheoryTable } from '../../content/content.models';

/**
 * A small lesson table (cells allow inline HTML). The host is the lesson's `div.lesson-table-wrap`, the frame
 * that scrolls a wide table inside itself; where the frame sits is set by the lesson around it.
 */
@Component({
  selector: 'div[appLessonTable]',
  template: `
    <table class="lesson-table">
      @if (table().caption) {
        <caption><span class="rich" [innerHTML]="table().caption"></span></caption>
      }
      <thead>
        <tr>
          @for (column of table().columns; track $index) {
            <th scope="col">{{ column }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of table().rows; track $index) {
          <tr>
            @for (cell of row; track $index; let first = $first) {
              @if (first) {
                <th scope="row" [innerHTML]="cell"></th>
              } @else {
                <td [innerHTML]="cell"></td>
              }
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [
    `
      /* System lessons: table headers in a readable demi-bold, little tracking, no heavy capitals. */
      :host-context(.system) .lesson-table thead th {
        font-size: 0.85rem;
        font-weight: 650;
        letter-spacing: 0;
        text-transform: none;
      }
      .lesson-table {
        width: 100%;
        border-collapse: collapse;
        line-height: 1.55;
      }
      .lesson-table caption {
        padding: 0.7rem 1rem;
        color: var(--text-strong);
        font-weight: 700;
        text-align: start;
      }
      .lesson-table :is(th, td) {
        padding: 0.7rem 1rem;
        border-top: 1px solid var(--line);
        text-align: start;
        vertical-align: top;
      }
      .lesson-table thead th {
        border-top: 0;
        background: var(--surface-muted);
        color: var(--text-strong);
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .lesson-table tbody th {
        font-weight: 600;
        white-space: nowrap;
      }
      .lesson-table tbody tr:nth-child(even) {
        background: color-mix(in srgb, var(--surface-muted) 45%, transparent);
      }
      /* When to use: a "Use this" / "Look-alike" pill in the first column (authored cell HTML, so ::ng-deep). */
      .lesson-table ::ng-deep .kind {
        display: inline-block;
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 700;
        white-space: nowrap;
      }
      .lesson-table ::ng-deep .kind-use {
        background: color-mix(in srgb, var(--success) 16%, var(--surface));
        color: var(--success);
      }
      .lesson-table ::ng-deep .kind-alt {
        background: color-mix(in srgb, var(--warning) 16%, var(--surface));
        color: var(--warning);
      }
    `,
  ],
})
export class LessonTable {
  readonly table = input.required<TheoryTable>();
}
