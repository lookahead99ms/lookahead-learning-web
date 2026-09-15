import { Component, computed, input, output } from '@angular/core';
import { DsaProblemV2, DsaProblemFixtureV2 } from '../../content/content.models';
import { WalkthroughFrame } from './studio-walkthrough';

@Component({
  selector: 'app-studio-pattern-diagram',
  template: `<section class="concept-pane">
    @if (linked()) {
      <p class="link-notice">
        Linked to published source instructions. Geometry is derived; the inspector lists recorded
        locals.
      </p>
    }
    <p class="eyebrow">See the decision. Then the change.</p>
    <h3>
      {{
        frame().kind === 'window'
          ? 'Add the new value. Release the old one.'
          : 'Two walls. One safe elimination.'
      }}
    </h3>
    <p class="mode-note">
      {{
        linked()
          ? 'Shared instruction cursor. Derived geometry is not additional native state.'
          : 'Conceptual steps, not source instructions. Reference code remains opt-in.'
      }}
    </p>
    <label
      >Visualization example<select
        [value]="fixture().id"
        (change)="fixtureChange.emit($any($event.target).value)"
      >
        @for (example of problem().fixtures; track example.id) {
          <option [value]="example.id" [selected]="fixture().id === example.id">
            {{ example.label }} / {{ example.input }}
          </option>
        }
      </select></label
    >
    <div class="pattern-stage">
      <p class="phase">{{ linked() ? 'Linked' : 'Conceptual' }} / {{ frame().phase }}</p>
      @if (frame().kind === 'container') {
        <svg
          viewBox="0 0 400 270"
          role="img"
          [attr.aria-label]="description()"
          class="container-chart"
        >
          <line class="axis" x1="20" y1="220" x2="385" y2="220" />
          @if (active()) {
            <rect
              class="water"
              [attr.x]="barX(frame().left)"
              [attr.y]="barY(waterHeight())"
              [attr.width]="barX(frame().right) - barX(frame().left)"
              [attr.height]="220 - barY(waterHeight())"
            />
          }
          @for (value of frame().values; track $index; let index = $index) {
            <line
              class="height-bar"
              [class.endpoint]="active() && (index === frame().left || index === frame().right)"
              [attr.x1]="barX(index)"
              [attr.x2]="barX(index)"
              y1="220"
              [attr.y2]="barY(value)"
            />
            <text [attr.x]="barX(index)" [attr.y]="barY(value) - 10" text-anchor="middle">
              {{ value }}
            </text>
            <text [attr.x]="barX(index)" y="240" text-anchor="middle">{{ index }}</text>
          }
          @if (active()) {
            <text class="pointer" [attr.x]="barX(frame().left)" y="32" text-anchor="middle">
              left
            </text>
            <text class="pointer" [attr.x]="barX(frame().right)" y="32" text-anchor="middle">
              right
            </text>
          }
          <text x="200" y="264" text-anchor="middle">Index = horizontal position</text>
        </svg>
      } @else {
        <svg
          viewBox="0 0 400 270"
          role="img"
          [attr.aria-label]="description()"
          class="window-chart"
        >
          @for (value of frame().values; track $index; let index = $index) {
            <rect
              class="array-cell"
              [class.member]="active() && index >= frame().left && index <= frame().right"
              [class.entering]="index === frame().entering"
              [class.leaving]="index === frame().leaving"
              [attr.x]="cellX(index)"
              y="88"
              [attr.width]="cellSize() - 6"
              height="70"
            />
            <text [attr.x]="cellX(index) + (cellSize() - 6) / 2" y="73" text-anchor="middle">
              {{ index }}
            </text>
            <text
              class="cell-value"
              [attr.x]="cellX(index) + (cellSize() - 6) / 2"
              y="129"
              text-anchor="middle"
            >
              {{ value }}
            </text>
            @if (index === frame().entering) {
              <text [attr.x]="cellX(index) + (cellSize() - 6) / 2" y="45" text-anchor="middle">
                IN
              </text>
            }
            @if (index === frame().leaving) {
              <text [attr.x]="cellX(index) + (cellSize() - 6) / 2" y="185" text-anchor="middle">
                OUT
              </text>
            }
          }
          @if (active()) {
            <path
              class="window-bracket"
              [class.transient]="size() > frame().k"
              [attr.d]="bracket()"
            />
            <text x="200" y="232" text-anchor="middle">
              {{
                size() === frame().k
                  ? 'Exact-k window'
                  : size() > frame().k
                    ? 'Transient k+1: not a candidate'
                    : 'Partial: not a candidate'
              }}
            </text>
          }
          <text x="200" y="261" text-anchor="middle">Configured k = {{ frame().k }}</text>
        </svg>
      }
      <p class="visual-text" aria-live="polite">{{ description() }}</p>
    </div>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .concept-pane {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        padding: 16px;
        min-width: 0;
      }
      .eyebrow {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-weight: 700;
        color: var(--muted);
        margin: 8px 0;
      }
      h3 {
        font-size: 21px;
        line-height: 1.3;
        margin: 8px 0;
      }
      .mode-note,
      .link-notice {
        font-size: 12px;
        margin: 8px 0;
      }
      .link-notice {
        padding: 8px;
        background: var(--surface-accent);
      }
      label {
        font-size: 12px;
      }
      select {
        display: block;
        max-width: 100%;
        width: 100%;
        min-height: 36px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface);
        color: var(--ink);
        margin-top: 6px;
        font: inherit;
      }
      .pattern-stage {
        display: grid;
        grid-template-rows: 42px 220px 105px;
        border: 1px solid var(--line);
        border-radius: 8px;
        min-width: 0;
        padding: 10px;
        margin-top: 12px;
      }
      .phase,
      .visual-text {
        font-size: 12px;
        line-height: 1.45;
        margin: 4px 0;
        overflow-wrap: anywhere;
      }
      .phase {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--accent);
      }
      svg {
        width: 100%;
        height: 220px;
      }
      text {
        fill: var(--ink);
        font-family: inherit;
        font-size: 12px;
      }
      .axis {
        stroke: var(--line);
        stroke-width: 2;
      }
      .height-bar {
        stroke: var(--muted);
        stroke-width: 9;
      }
      .height-bar.endpoint {
        stroke: var(--accent);
        stroke-width: 11;
      }
      .water {
        fill: var(--accent);
        fill-opacity: 0.18;
        stroke: var(--accent);
        stroke-dasharray: 5 3;
        stroke-width: 1.5;
      }
      .pointer {
        font-weight: 800;
      }
      .array-cell {
        fill: var(--surface);
        stroke: var(--line);
        stroke-width: 1.5;
      }
      .array-cell.member {
        fill: var(--surface-accent);
        stroke: var(--accent);
        stroke-width: 2;
      }
      .array-cell.entering {
        stroke-width: 4;
      }
      .array-cell.leaving {
        stroke-dasharray: 4 3;
        stroke: var(--ink);
        stroke-width: 3;
      }
      .cell-value {
        font-size: 21px;
        font-weight: 700;
      }
      .window-bracket {
        fill: none;
        stroke: var(--accent);
        stroke-width: 3;
      }
      .window-bracket.transient {
        stroke-dasharray: 6 3;
      }
      select:focus-visible {
        outline: 3px solid var(--accent);
        outline-offset: 3px;
      }
      @media (max-width: 700px) {
        .concept-pane {
          padding: 12px;
        }
        .pattern-stage {
          grid-template-rows: 54px 230px 120px;
        }
        svg {
          height: 230px;
        }
      }
    `,
  ],
})
export class StudioPatternDiagram {
  readonly problem = input.required<DsaProblemV2>();
  readonly fixture = input.required<DsaProblemFixtureV2>();
  readonly frame = input.required<WalkthroughFrame>();
  readonly linked = input(false);
  readonly fixtureChange = output<string>();
  protected readonly size = computed(() => this.frame().right - this.frame().left + 1);
  protected readonly active = computed(
    () => this.frame().valid && this.size() > (this.frame().kind === 'container' ? 1 : 0),
  );
  protected readonly cellSize = computed(() => Math.min(76, 350 / this.frame().values.length));
  protected readonly waterHeight = computed(() =>
    Math.min(this.frame().values[this.frame().left], this.frame().values[this.frame().right]),
  );
  protected readonly bracket = computed(
    () =>
      `M${this.cellX(this.frame().left)} 174v24H${this.cellX(this.frame().right) + this.cellSize() - 6}v-24`,
  );
  protected barX(index: number): number {
    return 30 + (index * 340) / Math.max(1, this.frame().values.length - 1);
  }
  protected barY(value: number): number {
    return 220 - (value / Math.max(1, ...this.frame().values)) * 155;
  }
  protected cellX(index: number): number {
    return 25 + index * this.cellSize();
  }
  protected readonly description = computed(() => {
    const f = this.frame();
    if (!f.valid) return f.why;
    if (f.kind === 'container')
      return `${f.done ? 'Last evaluated pair' : 'Pair'} [${f.left}, ${f.right}]: width ${f.right - f.left}, limiting height ${this.waterHeight()}, area ${f.total}. Best ${f.best ?? 'Not yet'}. ${this.linked() ? 'Geometry derived from recorded pointers.' : f.done ? 'Pointers have met.' : f.evaluated ? 'Evaluated.' : 'Not yet evaluated.'}`;
    return `Range [${f.left}, ${f.right}], ${this.size()} of ${f.k} values. Sum ${f.total}; best valid sum ${f.best ?? 'Not yet'}. Entering ${f.entering ?? 'none'}; leaving ${f.leaving ?? 'none'}. ${this.size() === f.k ? 'Exact-k candidate.' : 'Not an exact-k candidate.'}`;
  });
}
