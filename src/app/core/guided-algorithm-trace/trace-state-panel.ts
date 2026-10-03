import { Component, computed, input } from '@angular/core';
import type { PatternLanguage, PatternProblemV1 } from '../../content/content.models';
import { TraceSnapshot, traceSnapshot } from './trace-model';
import { ArrayVisual, ListVisual, stepNarration, traceVisual, VisualPointer } from './trace-visual';

const PAD = 18;
const CELL_HEIGHT = 48;
const GAP = 6;
const LANE = 36;
const CAPTION = 28;
const NODE_RADIUS = 26;
const NODE_SPACING = 96;
/** The drawing never shrinks below this scale, keeping SVG text at 13px or more. */
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.1;

interface PointerShape {
  name: string;
  x: number;
  hidden: boolean;
  /** Label baseline and the arrow tip, in the pointer's own coordinates (x = 0). */
  labelY: number;
  stemFrom: number;
  stemTo: number;
  arrow: string;
  tone: 'a' | 'b' | 'c' | 'd';
}

interface ArrayBlock {
  name: string;
  y: number;
  cellTop: number;
  pending: boolean;
  cells: { x: number; width: number; value: string; tone: string }[];
  pointers: PointerShape[];
}

interface Drawing {
  width: number;
  height: number;
  arrays: ArrayBlock[];
  list: {
    cy: number;
    nodes: { cx: number; value: string; tone: string }[];
    edges: string[];
    nullAt: { x1: number; x2: number; textX: number } | null;
    cycle: { path: string; noteX: number; noteY: number; note: string } | null;
    pointers: PointerShape[];
  } | null;
}

let drawingIds = 0;
const TONES = ['a', 'b', 'c', 'd'] as const;

function labelPad(pointers: VisualPointer[], cellWidth: number): number {
  const longest = Math.max(0, ...pointers.map((pointer) => pointer.name.length));
  return Math.max(PAD, Math.ceil(longest * 5.6 - cellWidth / 2) + 6);
}

function arrayDrawing(arrays: ArrayVisual[]): Drawing {
  let y = 6;
  let width = 0;
  const blocks: ArrayBlock[] = arrays.map((array) => {
    const above = array.pointers.filter((pointer) => pointer.lane % 2 === 0).length;
    const below = array.pointers.length - above;
    const pad = labelPad(array.pointers, array.cellWidth);
    const cellTop = y + CAPTION + above * LANE + (above ? 8 : 0);
    const cellBottom = cellTop + CELL_HEIGHT;
    const indexBottom = cellBottom + 26;
    const step = array.cellWidth + GAP;
    const cells = array.cells.map((cell, index) => ({
      x: pad + index * step,
      width: array.cellWidth,
      value: cell.value,
      tone: cell.tone ?? '',
    }));
    const pointers = array.pointers.map((pointer) => {
      const level = Math.floor(pointer.lane / 2);
      const up = pointer.lane % 2 === 0;
      const index = pointer.index ?? 0;
      const x = pad + index * step + array.cellWidth / 2;
      if (up) {
        const tip = cellTop - 5;
        const labelY = cellTop - 26 - level * LANE;
        return {
          name: pointer.name,
          x,
          hidden: pointer.index === null,
          labelY,
          stemFrom: labelY + 5,
          stemTo: tip - 11,
          arrow: `M-7 ${tip - 12}h14l-7 12z`,
          tone: TONES[pointer.lane],
        };
      }
      const tip = indexBottom + 2;
      const labelY = indexBottom + 32 + level * LANE;
      return {
        name: pointer.name,
        x,
        hidden: pointer.index === null,
        labelY,
        stemFrom: tip + 11,
        stemTo: labelY - 17,
        arrow: `M-7 ${tip + 12}h14l-7 -12z`,
        tone: TONES[pointer.lane],
      };
    });
    const blockWidth = Math.max(
      pad * 2 + Math.max(1, array.cells.length) * step - GAP,
      array.name.length * 10 + PAD * 2,
      array.pending ? 340 : 0,
    );
    width = Math.max(width, blockWidth);
    const block = { name: array.name, y, cellTop, pending: array.pending, cells, pointers };
    y = indexBottom + (below ? 14 + below * LANE : 4) + 12;
    return block;
  });
  return { width, height: y, arrays: blocks, list: null };
}

function listDrawing(list: ListVisual): Drawing {
  const longest = Math.max(0, ...list.pointers.map((pointer) => pointer.name.length));
  const pad = Math.max(PAD, Math.ceil(longest * 5.6 - NODE_RADIUS) + 6);
  const top = list.cycleTo === null ? 10 : 70;
  const cy = top + NODE_RADIUS;
  const nodes = list.nodes.map((node, index) => ({
    cx: pad + NODE_RADIUS + index * NODE_SPACING,
    value: node.value,
    tone: node.tone ?? '',
  }));
  const edges = nodes
    .slice(0, -1)
    .map(
      (node, index) =>
        `M${node.cx + NODE_RADIUS + 2} ${cy}H${nodes[index + 1].cx - NODE_RADIUS - 5}`,
    );
  const last = nodes.at(-1)!;
  let cycle: NonNullable<Drawing['list']>['cycle'] = null;
  let nullAt: NonNullable<Drawing['list']>['nullAt'] = null;
  if (list.cycleTo !== null) {
    const target = nodes[list.cycleTo];
    const rise = cy - NODE_RADIUS - 52;
    const path =
      target === last
        ? `M${last.cx - 12} ${cy - NODE_RADIUS + 1}C${last.cx - 46} ${rise} ${last.cx + 46} ${rise} ${last.cx + 12} ${cy - NODE_RADIUS - 2}`
        : `M${last.cx} ${cy - NODE_RADIUS - 2}C${last.cx} ${rise} ${target.cx} ${rise} ${target.cx} ${cy - NODE_RADIUS - 6}`;
    cycle = {
      path,
      noteX: (last.cx + target.cx) / 2,
      // Above the curve's peak, so the label never sits on the dashed edge.
      noteY: 0.25 * (cy - NODE_RADIUS - 2) + 0.75 * rise - 14,
      note: `cycle: ${last.value}.next = ${target.value}`,
    };
  } else {
    nullAt = {
      x1: last.cx + NODE_RADIUS + 2,
      x2: last.cx + NODE_RADIUS + 34,
      textX: last.cx + NODE_RADIUS + 38,
    };
  }
  const pointers = list.pointers.map((pointer) => {
    const tip = cy + NODE_RADIUS + 5;
    const labelY = tip + 34 + pointer.lane * 30;
    return {
      name: pointer.name,
      x: nodes[pointer.index ?? 0].cx,
      hidden: pointer.index === null,
      labelY,
      stemFrom: tip + 11,
      stemTo: labelY - 17,
      arrow: `M-7 ${tip + 12}h14l-7 -12z`,
      tone: TONES[pointer.lane],
    };
  });
  const width = Math.max(
    last.cx + NODE_RADIUS + (nullAt ? 84 : 0) + pad,
    cycle ? cycle.note.length * 9 + PAD * 2 : 0,
  );
  const height = cy + NODE_RADIUS + 5 + 34 + Math.max(0, list.pointers.length - 1) * 30 + 14;
  return {
    width,
    height,
    arrays: [],
    list: { cy, nodes, edges, nullAt, cycle, pointers },
  };
}

/**
 * Drawn state for one guided-debugger step plus a plain-English description of
 * what the step did. Falls back to nothing drawn when the trace cannot be drawn
 * faithfully; the host keeps its existing HTML state view either way.
 */
@Component({
  selector: 'app-trace-state-panel',
  template: `
    @if (drawing(); as d) {
      <h3 class="state-label">State</h3>
      <div class="stage" [class.multi]="d.arrays.length > 1">
        <svg
          role="img"
          [attr.aria-label]="label()"
          [attr.viewBox]="'0 0 ' + d.width + ' ' + d.height"
          [style.min-width.px]="d.width * minScale"
          [style.max-width.px]="d.width * maxScale"
          preserveAspectRatio="xMidYMin meet"
        >
          <defs>
            <marker
              [attr.id]="ids + '-edge'"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10z" class="arrowhead" />
            </marker>
            <marker
              [attr.id]="ids + '-cycle'"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10z" class="arrowhead cycle" />
            </marker>
          </defs>
          @for (block of d.arrays; track block.name) {
            <text class="caption" [attr.x]="6" [attr.y]="block.y + 18">{{ block.name }}</text>
            @if (block.pending) {
              <text class="pending" [attr.x]="6" [attr.y]="block.cellTop + 30">
                No recorded value at this instruction
              </text>
            }
            @for (cell of block.cells; track $index) {
              <g [class]="'cell ' + cell.tone">
                <rect
                  [attr.x]="cell.x"
                  [attr.y]="block.cellTop"
                  [attr.width]="cell.width"
                  [attr.height]="cellHeight"
                  rx="9"
                />
                <text class="v" [attr.x]="cell.x + cell.width / 2" [attr.y]="block.cellTop + 25">
                  {{ cell.value }}
                </text>
                <text
                  class="idx"
                  [attr.x]="cell.x + cell.width / 2"
                  [attr.y]="block.cellTop + cellHeight + 19"
                >
                  {{ $index }}
                </text>
              </g>
            }
            @for (pointer of block.pointers; track pointer.name) {
              <g
                [class]="'ptr tone-' + pointer.tone"
                [class.hidden]="pointer.hidden"
                [style.transform]="'translate(' + pointer.x + 'px, 0px)'"
              >
                <text x="0" [attr.y]="pointer.labelY">{{ pointer.name }}</text>
                <line x1="0" x2="0" [attr.y1]="pointer.stemFrom" [attr.y2]="pointer.stemTo" />
                <path [attr.d]="pointer.arrow" />
              </g>
            }
          }
          @if (d.list; as list) {
            @for (edge of list.edges; track $index) {
              <path class="edge" [attr.d]="edge" [attr.marker-end]="'url(#' + ids + '-edge)'" />
            }
            @if (list.nullAt; as end) {
              <path
                class="edge"
                [attr.d]="'M' + end.x1 + ' ' + list.cy + 'H' + end.x2"
                [attr.marker-end]="'url(#' + ids + '-edge)'"
              />
              <text class="null" [attr.x]="end.textX" [attr.y]="list.cy">null</text>
            }
            @if (list.cycle; as cycle) {
              <path
                class="edge cycle"
                [attr.d]="cycle.path"
                [attr.marker-end]="'url(#' + ids + '-cycle)'"
              />
              <text class="note" [attr.x]="cycle.noteX" [attr.y]="cycle.noteY">
                {{ cycle.note }}
              </text>
            }
            @for (node of list.nodes; track $index) {
              <g [class]="'node ' + node.tone">
                <circle [attr.cx]="node.cx" [attr.cy]="list.cy" [attr.r]="nodeRadius" />
                <text [attr.x]="node.cx" [attr.y]="list.cy">{{ node.value }}</text>
              </g>
            }
            @for (pointer of list.pointers; track pointer.name) {
              <g
                [class]="'ptr tone-' + pointer.tone"
                [class.hidden]="pointer.hidden"
                [style.transform]="'translate(' + pointer.x + 'px, 0px)'"
              >
                <text x="0" [attr.y]="pointer.labelY">{{ pointer.name }}</text>
                <line x1="0" x2="0" [attr.y1]="pointer.stemFrom" [attr.y2]="pointer.stemTo" />
                <path [attr.d]="pointer.arrow" />
              </g>
            }
          }
        </svg>
      </div>
    }
    @if (narration(); as story) {
      <p class="explain" aria-live="polite">
        <small>{{ story.line }}</small>
        {{ story.text }}
      </p>
    }
  `,
  styles: [
    `
      :host {
        display: grid;
        gap: 10px;
        min-width: 0;
      }
      .state-label {
        margin: 0;
        color: var(--text-subtle);
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .stage {
        min-width: 0;
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface-page, var(--surface));
        padding: 8px;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
        margin-inline: auto;
        overflow: visible;
      }
      text {
        dominant-baseline: central;
        text-anchor: middle;
      }
      .caption {
        text-anchor: start;
        dominant-baseline: auto;
        font:
          600 17.5px ui-monospace,
          'JetBrains Mono',
          monospace;
        fill: var(--text-subtle);
      }
      .pending {
        text-anchor: start;
        font:
          600 17.5px 'Avenir Next',
          Avenir,
          sans-serif;
        fill: var(--text-subtle);
      }
      .cell rect {
        fill: var(--surface);
        stroke: var(--line);
        stroke-width: 2;
        transition:
          fill 0.25s,
          stroke 0.25s;
      }
      .cell .v {
        fill: var(--text-strong);
        font:
          700 21px 'Avenir Next',
          Avenir,
          sans-serif;
      }
      .cell .idx {
        fill: var(--text-subtle);
        font:
          500 17.5px ui-monospace,
          'JetBrains Mono',
          monospace;
      }
      .cell.outside rect {
        fill: transparent;
        stroke-dasharray: 5 4;
      }
      .cell.outside .v {
        fill: var(--text-subtle);
        opacity: 0.65;
      }
      .cell.compare rect,
      .node.compare circle {
        fill: color-mix(in srgb, var(--warning) 18%, var(--surface));
        stroke: var(--warning);
        stroke-width: 3;
      }
      .cell.changed rect {
        fill: color-mix(in srgb, var(--accent-strong) 16%, var(--surface));
        stroke: var(--accent-strong);
        stroke-width: 3;
      }
      .cell.found rect,
      .node.found circle {
        fill: color-mix(in srgb, var(--success) 22%, var(--surface));
        stroke: var(--success);
        stroke-width: 3.5;
      }
      .ptr {
        transition:
          transform 0.45s cubic-bezier(0.3, 0.7, 0.3, 1),
          opacity 0.2s;
      }
      .ptr.hidden {
        opacity: 0;
      }
      .ptr text {
        font:
          700 18px 'Avenir Next',
          Avenir,
          sans-serif;
      }
      .ptr line {
        stroke-width: 2.5;
      }
      .tone-a text,
      .tone-a path {
        fill: var(--accent-strong);
      }
      .tone-a line {
        stroke: var(--accent-strong);
      }
      .tone-b text,
      .tone-b path {
        fill: var(--accent-link);
      }
      .tone-b line {
        stroke: var(--accent-link);
      }
      .tone-c text,
      .tone-c path {
        fill: var(--success);
      }
      .tone-c line {
        stroke: var(--success);
      }
      .tone-d text,
      .tone-d path {
        fill: var(--text-strong);
      }
      .tone-d line {
        stroke: var(--text-strong);
      }
      .node circle {
        fill: var(--surface);
        stroke: var(--line);
        stroke-width: 2.5;
        transition:
          fill 0.25s,
          stroke 0.25s;
      }
      .node text {
        fill: var(--text-strong);
        font:
          700 21px 'Avenir Next',
          Avenir,
          sans-serif;
      }
      .edge {
        stroke: var(--text-subtle);
        stroke-width: 2.5;
        fill: none;
      }
      .edge.cycle {
        stroke: var(--danger);
        stroke-dasharray: 7 5;
      }
      .arrowhead {
        fill: var(--text-subtle);
      }
      .arrowhead.cycle {
        fill: var(--danger);
      }
      .note {
        font:
          600 17.5px 'Avenir Next',
          Avenir,
          sans-serif;
        fill: var(--danger);
      }
      .null {
        text-anchor: start;
        font:
          600 17.5px ui-monospace,
          'JetBrains Mono',
          monospace;
        fill: var(--text-subtle);
      }
      .explain {
        margin: 0;
        padding: 9px 13px;
        border-left: 3px solid var(--accent-strong);
        border-radius: 0 10px 10px 0;
        background: var(--surface-accent, var(--surface));
        color: var(--text-strong);
        font-size: 15px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .explain small {
        display: block;
        margin-bottom: 2px;
        color: var(--text-subtle);
        font:
          500 13px/1.45 ui-monospace,
          'JetBrains Mono',
          monospace;
        overflow-wrap: anywhere;
      }
      @media (prefers-reduced-motion: reduce) {
        .ptr,
        .cell rect,
        .node circle {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .cell.compare rect,
        .cell.found rect,
        .cell.changed rect,
        .node.found circle,
        .node.compare circle {
          stroke: Highlight;
        }
      }
    `,
  ],
})
export class TraceStatePanel {
  readonly problem = input.required<PatternProblemV1>();
  readonly fixture = input.required<{ id: string }>();
  readonly snapshot = input.required<TraceSnapshot>();
  readonly language = input.required<PatternLanguage>();
  protected readonly ids = `trace-state-${++drawingIds}`;
  protected readonly cellHeight = CELL_HEIGHT;
  protected readonly nodeRadius = NODE_RADIUS;
  protected readonly minScale = MIN_SCALE;
  protected readonly maxScale = MAX_SCALE;
  private readonly previous = computed(() => {
    const snapshot = this.snapshot();
    return snapshot.step > 0
      ? traceSnapshot(this.problem(), this.fixture().id, this.language(), snapshot.step - 1)
      : null;
  });
  protected readonly visual = computed(() =>
    traceVisual(this.problem(), this.fixture(), this.snapshot(), this.language(), this.previous()),
  );
  protected readonly drawing = computed<Drawing | null>(() => {
    const visual = this.visual();
    if (visual.kind === 'array') return arrayDrawing(visual.arrays);
    if (visual.kind === 'list') return listDrawing(visual.list);
    return null;
  });
  protected readonly label = computed(() => {
    const visual = this.visual();
    return visual.kind === 'none' ? '' : visual.label;
  });
  protected readonly narration = computed(() =>
    stepNarration(
      this.problem(),
      this.fixture(),
      this.snapshot(),
      this.language(),
      this.previous(),
    ),
  );
}
