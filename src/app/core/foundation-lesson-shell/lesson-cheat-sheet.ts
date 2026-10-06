import { Component, TemplateRef, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TheoryCheatSheet } from '../../content/content.models';
import { evenGridColumns } from '../even-grid';

/**
 * Quick revision as a cheat sheet: the template (Java | Python | Go, drawn by the lesson's own language-code
 * block), white numbered tiles with the traps last, then the exact facts as chips. Same tile order in every lesson.
 * The host is the lesson's `div.cheat-sheet`.
 */
@Component({
  selector: 'div[appLessonCheatSheet]',
  imports: [NgTemplateOutlet],
  template: `
    @if (languageCode(); as code) {
      <div class="cheat-template">
        <h3>The template</h3>
        <ng-container [ngTemplateOutlet]="code" [ngTemplateOutletContext]="{ $implicit: sheet().codeTabs, key: sectionId() + '-template', label: 'Cheat sheet template' }" />
      </div>
    }
    <ol class="cheat-tiles" [attr.data-columns]="gridColumns(sheet().tiles.length)">
      @for (tile of sheet().tiles; track tile.title; let index = $index, last = $last) {
        <li class="cheat-tile" [class.cheat-traps]="last">
          <h3><span class="cheat-number" aria-hidden="true">{{ index + 1 }}</span><span class="rich" [innerHTML]="tile.title"></span></h3>
          <ul>
            @for (point of tile.points; track point) {
              <li [innerHTML]="point"></li>
            }
          </ul>
        </li>
      }
    </ol>
    <div class="cheat-facts">
      <h3>Exact facts</h3>
      <ul>
        @for (fact of sheet().facts; track fact) {
          <li [innerHTML]="fact"></li>
        }
      </ul>
    </div>
  `,
  styles: [
    `
      /* Lists in a lesson card. */
      :host-context(.lesson-section) ul,
      :host-context(.lesson-section) ol {
        margin: 8px 0 0;
        padding-left: 20px;
        line-height: 1.65;
      }
      .cheat-template {
        margin-bottom: 1.25rem;
      }
      /* Tiles take their column count from the number of tiles (data-columns, even-grid.ts; user review #21):
         4 are 2×2, 6 are 3 + 3, 5 are 3 + 2, so no row ends with one lonely tile. Narrow lessons drop to fewer columns. */
      @container lesson (min-width: 560px) {
        .cheat-tiles:not([data-columns='1']) {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @container lesson (min-width: 860px) {
        .cheat-tiles[data-columns='3'] {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      .cheat-tiles {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0.9rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .cheat-tile,
      .cheat-facts {
        padding: 0.95rem 1.05rem 1rem;
        border: 1px solid var(--sheet-line);
        border-radius: 10px;
        background: var(--sheet-tile);
        box-shadow: 0 1px 2px var(--sheet-shadow);
      }
      .cheat-tile.cheat-traps {
        border-left: 3px solid var(--sheet-accent);
      }
      :host-context(.system) h3 {
        display: flex;
        align-items: flex-start;
        gap: 0.55rem;
        margin: 0 0 0.55rem;
        color: var(--sheet-heading);
        font-size: 0.98rem;
        line-height: 1.4;
      }
      .cheat-number {
        display: inline-grid;
        flex: none;
        width: 1.5rem;
        height: 1.5rem;
        place-items: center;
        border-radius: 50%;
        background: var(--sheet-accent);
        color: var(--sheet-on-accent);
        font-size: 0.8rem;
        font-weight: 700;
      }
      :host(.cheat-sheet) ul {
        margin: 0;
        padding-left: 1.1rem;
        font-size: 0.95rem;
        line-height: 1.6;
      }
      :host(.cheat-sheet) li + li {
        margin-top: 0.35rem;
      }
      :host(.cheat-sheet) li::marker {
        color: var(--sheet-accent);
      }
      .cheat-facts ul {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0;
        list-style: none;
      }
      .cheat-facts li {
        margin: 0 !important;
        padding: 0.3rem 0.7rem;
        border: 1px solid var(--sheet-chip-line);
        border-radius: 999px;
        background: var(--sheet-chip);
        color: var(--sheet-heading);
        font-size: 0.88rem;
      }
    `,
  ],
})
export class LessonCheatSheet {
  readonly sheet = input.required<TheoryCheatSheet>();
  /** The section id, so the template's language tabs get ids of their own. */
  readonly sectionId = input.required<string>();
  /** The lesson's Java | Python | Go code block, or null when the sheet has no template in three languages. */
  readonly languageCode = input<TemplateRef<unknown> | null>(null);
  protected readonly gridColumns = evenGridColumns;
}
