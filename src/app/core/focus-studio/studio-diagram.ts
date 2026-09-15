import { Component, computed, input, output } from '@angular/core';
import {
  DsaFixtureValue,
  DsaProblemV2,
  DsaProblemFixtureV2,
  PatternLanguage,
} from '../../content/content.models';
import { FocusStudioPattern } from '../../content/focus-studio-pilot';
import { currentInputIndices, recordedValue } from './studio-state-view';
import { StudioStateValues } from './studio-state-values';
import { traceSnapshot, TraceSnapshot } from '../guided-algorithm-trace/trace-model';

type DisplayValue = { label: string; value: string; changed?: boolean };
function display(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
const diagramNames: Record<FocusStudioPattern, string[]> = {
  arrays: ['matrix'],
  maps: ['seen'],
  trees: ['queue'],
  graphs: ['parent', 'p'],
  heaps: ['heap'],
  stacks: ['stack'],
  'sliding-window': ['values'],
  'two-pointers': ['heights'],
  'dynamic-programming': ['previous_two', 'previous_one', 'previousTwo', 'previousOne'],
  intervals: ['merged'],
  'prefix-sum': ['frequencies'],
  lru: ['cache'],
};
const diagramLabels: Record<FocusStudioPattern, string> = {
  arrays: 'Matrix and traversal',
  maps: 'Previously seen values',
  trees: 'Recorded queue',
  graphs: 'Disjoint-set parents',
  heaps: 'Retained candidates',
  stacks: 'Recorded stack',
  'sliding-window': 'Input and window state',
  'two-pointers': 'Heights and pointer state',
  'dynamic-programming': 'Rolling subproblem state',
  intervals: 'Merged intervals',
  'prefix-sum': 'Prefix frequencies',
  lru: 'Recorded cache state',
};

@Component({
  selector: 'app-studio-diagram',
  imports: [StudioStateValues],
  template: `<section class="diagram" [attr.aria-label]="title()">
    @if (linked()) {
      <p class="link-notice">
        Linked to
        {{ language() === 'python' ? 'Python' : language() === 'java' ? 'Java' : 'Go' }} reference
        instructions. Only published state is shown.
      </p>
    }
    <p class="eyebrow">See the decision. Then the change.</p>
    <h3>{{ heading() }}</h3>
    <p class="mode-note">
      {{
        linked()
          ? 'Linked view: both controls follow the same published trace.'
          : 'Follow recorded changes, then explain the reasoning.'
      }}
    </p>
    <label class="visual-example"
      >Choose example<select
        [value]="fixture().id"
        (change)="fixtureChange.emit($any($event.target).value)"
      >
        @for (example of problem().fixtures; track example.id) {
          <option [value]="example.id" [selected]="example.id === fixture().id">
            {{ exampleLabel(example) }}
          </option>
        }
      </select></label
    >
    <section class="input-data" aria-label="Selected example input">
      @for (entry of inputs(); track entry.label) {
        <app-studio-state-values
          [name]="entry.label"
          [value]="entry.value"
          [active]="entry.active"
          [showCurrentLabel]="false"
        />
      }
    </section>
    <div class="diagram-stage" [class.heap-stage]="pattern() === 'heaps'">
      <p class="phase">
        {{ language() }} / published instruction {{ snapshot().step + 1 }} of
        {{ snapshot().events.length }}
      </p>
      @if (snapshot().unavailable; as reason) {
        <p class="state-note" role="status">{{ reason }}</p>
      } @else {
        @if (matrix(); as rows) {
          <div class="matrix" role="group" aria-label="Recorded matrix">
            @for (row of rows; track $index; let rowIndex = $index) {
              <div class="matrix-row">
                @for (cell of row; track $index; let columnIndex = $index) {
                  <span
                    class="cell"
                    [class.active]="rowIndex === matrixRow() && columnIndex === matrixColumn()"
                    ><small>{{ rowIndex }},{{ columnIndex }}</small
                    >{{ cell }}</span
                  >
                }
              </div>
            }
          </div>
        } @else if (heapGraph(); as tree) {
          <svg
            class="heap-svg"
            viewBox="0 0 540 220"
            role="img"
            aria-label="Recorded heap array with parent-child indexes"
          >
            @for (edge of tree.edges; track edge.key) {
              <line
                [attr.x1]="edge.from.x"
                [attr.y1]="edge.from.y"
                [attr.x2]="edge.to.x"
                [attr.y2]="edge.to.y"
              />
            }
            @for (node of tree.nodes; track node.index) {
              <circle [attr.cx]="node.x" [attr.cy]="node.y" r="24" [class.active]="node.changed" />
              <text [attr.x]="node.x" [attr.y]="node.y">{{ node.value }}</text>
              <text class="index" [attr.x]="node.x" [attr.y]="node.y + 38">
                heap[{{ node.index }}]
              </text>
            }
          </svg>
          <p class="state-note">
            Recorded heap: {{ heapText() }}.
            {{
              heapChanged()
                ? 'Snapshot changed at this instruction.'
                : 'No heap update at this instruction.'
            }}
          </p>
        } @else if (treeInput(); as tree) {
          <svg
            class="heap-svg"
            viewBox="0 0 540 220"
            role="img"
            aria-label="Example input tree; no traversal state implied"
          >
            @for (edge of tree.edges; track edge.key) {
              <line
                [attr.x1]="edge.from.x"
                [attr.y1]="edge.from.y"
                [attr.x2]="edge.to.x"
                [attr.y2]="edge.to.y"
              />
            }
            @for (node of tree.nodes; track node.index) {
              <circle [attr.cx]="node.x" [attr.cy]="node.y" r="22" />
              <text [attr.x]="node.x" [attr.y]="node.y">{{ node.value }}</text>
            }
          </svg>
          <p class="state-note">
            Example input tree. The inspector shows the recorded queue and completed levels;
            unrecorded traversal links are not inferred.
          </p>
        } @else if (graph(); as graph) {
          <svg
            class="parent-graph"
            viewBox="0 0 400 280"
            role="img"
            aria-label="Recorded parent links"
          >
            @for (edge of graph.edges; track edge.key) {
              <line
                [attr.x1]="edge.from.x"
                [attr.y1]="edge.from.y"
                [attr.x2]="edge.to.x"
                [attr.y2]="edge.to.y"
              />
            }
            @for (node of graph.nodes; track node.index) {
              <g>
                <circle [attr.cx]="node.x" [attr.cy]="node.y" r="20" />
                <text [attr.x]="node.x" [attr.y]="node.y + 5">{{ node.index }}</text>
              </g>
            }
          </svg>
          <p class="state-note">
            Lines connect each node to its recorded parent. Roots point to themselves.
          </p>
        } @else if (bars(); as values) {
          <div class="bars" role="group" aria-label="Recorded values">
            @for (bar of values; track $index; let index = $index) {
              <div class="bar-column" [class.active]="index === left() || index === right()">
                <span>{{ bar }}</span
                ><i [style.height.px]="barHeight(bar)"></i><small>{{ index }}</small>
              </div>
            }
          </div>
        } @else if (entries().length) {
          <dl class="entries" [class.stack]="pattern() === 'stacks'">
            @for (entry of entries(); track entry.label) {
              <div>
                <dt>{{ entry.label }}</dt>
                <dd>{{ entry.value }}</dd>
              </div>
            }
          </dl>
        } @else {
          <p class="state-note">This structure has not been recorded at this instruction.</p>
        }
        @if (truncated(); as message) {
          <p class="state-note">
            {{ message }} The complete recorded value remains in the inspector.
          </p>
        }
        <dl class="scalars" [hidden]="pattern() === 'heaps' || pattern() === 'trees'">
          @for (value of scalars(); track value.label) {
            <div [class.changed]="value.changed">
              <dt>{{ value.label }}</dt>
              <dd>{{ value.value }}</dd>
            </div>
          }
        </dl>
        @if (pattern() === 'heaps' && language() === 'java') {
          <p class="state-note">
            PriorityQueue entries are shown in their recorded order. Queue iteration does not expose
            a heap tree.
          </p>
        }
        @if (pattern() === 'lru') {
          <p class="state-note">
            Object references alone do not publish a complete recency chain. No missing links or
            cache values are inferred.
          </p>
        }
        @if (pattern() === 'trees' && !treeInput()) {
          <p class="state-note">
            The queue uses recorded node references. Unrecorded child pointers are not expanded.
          </p>
        }
      }
    </div>
    <p class="state-note provenance" [hidden]="linked()">
      {{
        linked()
          ? 'The diagram and reference share one language, example and instruction.'
          : 'Condensed state changes from the published trace. These visual steps are not a separate source-instruction sequence.'
      }}
    </p>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .diagram {
        padding: 22px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 10px;
        min-width: 0;
        color: var(--ink);
      }
      [hidden] {
        display: none !important;
      }
      h3 {
        font-size: 22px;
        margin: 8px 0 20px;
      }
      h4 {
        font-size: 13px;
        margin: 0 0 10px;
      }
      .eyebrow {
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .input-data {
        border-bottom: 1px solid var(--line);
        padding-bottom: 14px;
        margin-bottom: 24px;
      }
      .input-data p {
        display: flex;
        gap: 12px;
        align-items: baseline;
        font-size: 13px;
      }
      .input-data code {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        font-size: 12px;
        max-height: 160px;
        overflow: auto;
      }
      .input-data strong {
        min-width: 50px;
      }
      .state-note {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.7;
        overflow-wrap: anywhere;
      }
      .matrix,
      .heap,
      .bars {
        overflow: auto;
        padding: 12px 0;
        max-width: 100%;
      }
      .matrix-row,
      .heap-level {
        display: flex;
        gap: 12px;
        margin: 10px 0;
      }
      .heap-level {
        justify-content: space-evenly;
      }
      .cell,
      .node {
        min-width: 42px;
        padding: 8px;
        border: 1px solid var(--line);
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 5px;
        background: var(--surface-soft);
      }
      .node {
        border-radius: 8px;
        min-width: 58px;
      }
      .cell small,
      .node small {
        font:
          10px ui-monospace,
          monospace;
        color: var(--muted);
      }
      .cell.active {
        outline: 2px solid var(--accent);
      }
      .entries {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        max-height: 320px;
        overflow: auto;
      }
      .entries > div {
        padding: 12px;
        border-bottom: 2px solid var(--line);
        min-width: 46px;
        max-width: 100%;
      }
      .entries dt {
        color: var(--muted);
        font-size: 11px;
      }
      .entries dd {
        margin: 6px 0 0;
        font:
          14px/1.5 ui-monospace,
          monospace;
        overflow-wrap: anywhere;
      }
      .entries.stack {
        flex-direction: column-reverse;
      }
      .entries.stack > div {
        border: 1px solid var(--line);
      }
      .scalars {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        border-top: 1px solid var(--line);
        padding-top: 18px;
      }
      .scalars dt {
        font-size: 12px;
        color: var(--muted);
      }
      .scalars dd {
        margin: 5px 0 0;
        font:
          700 17px/1.5 ui-monospace,
          monospace;
      }
      .scalars .changed {
        border-bottom: 2px solid var(--accent);
      }
      .bars {
        display: flex;
        align-items: flex-end;
        gap: 12px;
        min-height: 160px;
      }
      .bar-column {
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: center;
        min-width: 30px;
      }
      .bar-column i {
        display: block;
        background: var(--line);
        width: 30px;
        min-height: 3px;
      }
      .bar-column.active i {
        background: var(--accent);
      }
      .bar-column small {
        font-size: 10px;
        color: var(--muted);
      }
      .parent-graph {
        display: block;
        width: 100%;
        max-height: 320px;
      }
      .parent-graph line {
        stroke: var(--line);
        stroke-width: 3;
      }
      .parent-graph circle {
        fill: var(--surface-soft);
        stroke: var(--accent);
        stroke-width: 2;
      }
      .parent-graph text {
        fill: var(--ink);
        font:
          14px ui-monospace,
          monospace;
        text-anchor: middle;
      }

      .diagram {
        padding: 16px;
        border-radius: 10px 10px 0 0;
        border-bottom: 0;
      }
      .link-notice {
        padding: 12px 14px;
        margin: 0 0 16px;
        background: var(--surface-accent);
        border-left: 3px solid var(--accent);
        font-size: 12px;
        line-height: 1.6;
      }
      .mode-note {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.6;
        margin: 0 0 13px;
      }
      h3 {
        font-size: 21px;
        line-height: 1.3;
        margin: 8px 0 10px;
      }
      .eyebrow {
        font-weight: 800;
        color: var(--accent);
      }
      .visual-example {
        display: block;
        font-size: 12px;
        color: var(--muted);
        margin: 12px 0 8px;
      }
      .visual-example select {
        display: block;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface);
        color: var(--ink);
        font: inherit;
      }
      .input-data {
        border: 0;
        padding: 0;
        margin-bottom: 12px;
      }
      .diagram-stage {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        height: 310px;
        overflow: auto;
        box-sizing: border-box;
      }
      .phase {
        margin: 4px 0;
        color: var(--accent);
        font:
          11px/1.6 ui-monospace,
          monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .heap-svg {
        display: block;
        width: 100%;
        height: 180px;
      }
      .heap-stage {
        height: 245px;
      }
      .heap-stage .heap-svg {
        height: 140px;
      }
      .heap-svg line {
        stroke: var(--line);
        stroke-width: 2;
      }
      .heap-svg circle {
        fill: var(--surface);
        stroke: var(--muted);
        stroke-width: 2;
      }
      .heap-svg circle.active {
        fill: var(--surface-soft);
        stroke: var(--accent);
        stroke-width: 4;
      }
      .heap-svg text {
        fill: var(--ink);
        text-anchor: middle;
        dominant-baseline: middle;
        font-size: 18px;
      }
      .heap-svg .index {
        fill: var(--muted);
        font-size: 11px;
      }
      .provenance {
        margin-bottom: 0;
      }
      select:focus-visible {
        outline: 3px solid var(--accent);
        outline-offset: 3px;
      }
      @media (max-width: 700px) {
        .diagram {
          padding: 16px;
        }
        .heap-level {
          gap: 6px;
        }
        .node {
          min-width: 32px;
          padding: 6px;
        }
        .input-data p {
          display: block;
        }
        .input-data code {
          display: block;
          margin-top: 6px;
        }
      }
    `,
  ],
})
export class StudioDiagram {
  readonly problem = input.required<DsaProblemV2>();
  readonly pattern = input.required<FocusStudioPattern>();
  readonly fixtureChange = output<string>();
  readonly fixture = input.required<DsaProblemFixtureV2>();
  readonly language = input.required<PatternLanguage>();
  readonly snapshot = input.required<TraceSnapshot>();
  readonly linked = input(false);
  protected readonly title = computed(() => diagramLabels[this.pattern()]);
  protected readonly inputs = computed(() =>
    Object.entries(this.fixture().arguments ?? {})
      .filter(([label]) => this.pattern() !== 'heaps' || label === 'nums')
      .map(([label, value]) => ({
        label,
        value,
        active: currentInputIndices(
          this.problem(),
          this.fixture(),
          this.snapshot(),
          this.language(),
          label,
        ),
      })),
  );
  private readonly value = computed(() =>
    recordedValue(this.snapshot(), diagramNames[this.pattern()]),
  );
  protected readonly matrixRow = computed(() => Number(recordedValue(this.snapshot(), ['row'])));
  protected readonly matrixColumn = computed(() =>
    Number(recordedValue(this.snapshot(), ['column'])),
  );
  protected readonly left = computed(() => Number(recordedValue(this.snapshot(), ['left'])));
  protected readonly right = computed(() => Number(recordedValue(this.snapshot(), ['right'])));
  protected readonly matrix = computed(() =>
    this.pattern() === 'arrays' && Array.isArray(this.value())
      ? (this.value() as DsaFixtureValue[][]).map((row) =>
          Array.isArray(row) ? row.map(display) : [],
        )
      : null,
  );
  protected readonly heading = computed(
    () =>
      ({
        arrays: 'Follow the coordinates. Keep the order.',
        maps: 'Remember what you have already seen.',
        trees: 'One level. Then the next.',
        graphs: 'Connect nodes. Track the components.',
        heaps: 'A small heap. The largest candidates.',
        stacks: 'Keep the next match in reach.',
        'sliding-window': 'Move the window. Update what changes.',
        'two-pointers': 'Two boundaries. One decision at a time.',
        'dynamic-programming': 'Build the next answer from known results.',
        intervals: 'Order the ranges. Combine the overlap.',
        'prefix-sum': 'Track the total. Count the matching prefixes.',
        lru: 'Keep the recent work within reach.',
      })[this.pattern()],
  );
  protected exampleLabel(example: DsaProblemFixtureV2): string {
    if (this.pattern() === 'heaps' && Array.isArray(example.arguments['nums']))
      return `k = ${example.arguments['k']} / ${JSON.stringify(example.arguments['nums']).replaceAll(',', ', ')}`;
    return example.input.length > 84 ? example.input.slice(0, 81) + '…' : example.input;
  }
  protected readonly previousHeap = computed(() =>
    this.snapshot().step
      ? recordedValue(
          traceSnapshot(
            this.problem(),
            this.fixture().id,
            this.language(),
            this.snapshot().step - 1,
          ),
          ['heap'],
        )
      : undefined,
  );
  protected readonly heapText = computed(() => display(this.value()));
  protected readonly heapChanged = computed(
    () => JSON.stringify(this.previousHeap()) !== JSON.stringify(this.value()),
  );
  protected readonly heapGraph = computed(() => {
    const values = this.value(),
      previous = this.previousHeap();
    if (
      this.pattern() !== 'heaps' ||
      this.language() === 'java' ||
      !Array.isArray(values) ||
      !values.length
    )
      return null;
    const depthCount = Math.floor(Math.log2(Math.min(values.length, 63)));
    const nodes = values.slice(0, 63).map((value, index) => {
      const depth = Math.floor(Math.log2(index + 1));
      return {
        index,
        value: display(value),
        x: (540 * (index - (2 ** depth - 1) + 0.5)) / 2 ** depth,
        y: 110 + (depth - depthCount / 2) * Math.min(80, 150 / Math.max(1, depthCount)),
        changed: Array.isArray(previous) && previous[index] !== value,
      };
    });
    return {
      nodes,
      edges: nodes.slice(1).map((node) => ({
        key: String(node.index),
        from: nodes[Math.floor((node.index - 1) / 2)],
        to: node,
      })),
    };
  });
  protected readonly treeInput = computed(() => {
    const values = this.fixture().arguments['root'];
    if (
      this.pattern() !== 'trees' ||
      !Array.isArray(values) ||
      !values.length ||
      values[0] === null ||
      values.length > 63
    )
      return null;
    const nodes = [
      { index: 0, value: display(values[0]), depth: 0, slot: 0, x: 270, y: 30, parent: -1 },
    ];
    let cursor = 1;
    for (let i = 0; i < nodes.length && cursor < values.length; i++) {
      for (let side = 0; side < 2 && cursor < values.length; side++, cursor++) {
        if (values[cursor] === null) continue;
        const depth = nodes[i].depth + 1,
          slot = nodes[i].slot * 2 + side;
        nodes.push({
          index: cursor,
          value: display(values[cursor]),
          depth,
          slot,
          x: (540 * (slot + 0.5)) / 2 ** depth,
          y: 30 + depth * 65,
          parent: i,
        });
      }
    }
    const depth = Math.max(...nodes.map((node) => node.depth));
    nodes.forEach((node) => (node.y = 30 + node.depth * Math.min(65, 160 / Math.max(1, depth))));
    return {
      nodes,
      edges: nodes
        .slice(1)
        .map((node) => ({ key: String(node.index), from: nodes[node.parent], to: node })),
    };
  });
  protected readonly bars = computed(() => {
    const value = this.value();
    return ['two-pointers', 'sliding-window'].includes(this.pattern()) &&
      Array.isArray(value) &&
      value.every((item) => typeof item === 'number')
      ? (value as number[]).slice(0, 100)
      : null;
  });
  protected readonly graph = computed(() => {
    const values = this.value();
    if (
      this.pattern() !== 'graphs' ||
      !Array.isArray(values) ||
      values.length > 24 ||
      !values.every((value) => Number.isInteger(value) && value >= 0 && value < values.length)
    )
      return null;
    const nodes = values.map((_, index) => ({
      index,
      x: 200 + 150 * Math.cos((index / values.length) * Math.PI * 2),
      y: 140 + 100 * Math.sin((index / values.length) * Math.PI * 2),
    }));
    return {
      nodes,
      edges: values.flatMap((value, index) =>
        value === index ? [] : [{ key: String(index), from: nodes[index], to: nodes[value] }],
      ),
    };
  });
  protected readonly truncated = computed(() => {
    const value = this.value(),
      limit = this.pattern() === 'heaps' && this.language() !== 'java' ? 63 : 100;
    return Array.isArray(value) && value.length > limit
      ? `Showing ${limit} of ${value.length} recorded entries.`
      : null;
  });
  protected barHeight(value: number): number {
    const max = Math.max(1, ...(this.bars() ?? []).map(Math.abs));
    return Math.max(3, (Math.abs(value) / max) * 140);
  }
  protected readonly entries = computed<DisplayValue[]>(() => {
    const value = this.value();
    if (value === undefined) return [];
    if (Array.isArray(value))
      return value.length
        ? value.slice(0, 100).map((item, index) => ({ label: String(index), value: display(item) }))
        : [{ label: 'Recorded structure', value: 'empty' }];
    if (value && typeof value === 'object')
      return Object.entries(value).map(([label, item]) => ({ label, value: display(item) }));
    return [
      {
        label: diagramNames[this.pattern()][0],
        value:
          typeof value === 'string' && /deque|object|queue/i.test(value)
            ? 'Collection contents not recorded'
            : display(value),
      },
    ];
  });
  protected readonly scalars = computed<DisplayValue[]>(() =>
    this.snapshot().unavailable
      ? []
      : this.snapshot()
          .variables.filter((variable) => /^-?\d+(\.\d+)?$|^(true|false)$/.test(variable.value))
          .map((variable) => ({
            label: variable.name,
            value: variable.value,
            changed: variable.changed,
          })),
  );
}
