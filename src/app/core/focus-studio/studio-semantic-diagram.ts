import { Component, computed, input } from '@angular/core';
import type { PatternLanguage, PatternProblemV1 } from '../../content/content.models';
import type { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { displayRecorded, semanticState, StateStructure } from './studio-semantic-state';
import { recordedMapEntries } from './studio-state-view';

@Component({
  selector: 'app-studio-semantic-diagram',
  template: `<div class="semantic-state" aria-label="Recorded algorithm structures">
    @for (field of structures(); track field.name) {
      <section [class.changed]="field.changed" [attr.data-structure]="field.kind">
        <h4>
          <code>{{ field.name }}</code
          ><span>{{ field.label }}</span>
        </h4>
        @if (field.note) {
          <p class="note">{{ field.note }}</p>
        }
        @switch (field.kind) {
          @case ('adjacency') {
            <dl class="pairs">
              @for (entry of adjacency(field); track $index) {
                <div>
                  <dt>Node {{ entry.key }}</dt>
                  <dd>Neighbors {{ entry.value }}</dd>
                </div>
              } @empty {
                <p class="note">No adjacency entries recorded yet.</p>
              }
            </dl>
          }
          @case ('parents') {
            <div class="parent-links" aria-label="Recorded disjoint-set parent relationships">
              @for (parent of items(field); track $index) {
                <div>
                  <b>{{ $index }}</b
                  ><span>parent</span><strong>{{ show(parent) }}</strong>
                </div>
              }
            </div>
          }
          @case ('opaque') {
            <code>{{ field.raw }}</code>
          }
          @case ('heap') {
            @if (heap(field); as tree) {
              <svg
                viewBox="0 0 520 200"
                role="img"
                [attr.aria-label]="field.name + ' recorded heap positions'"
              >
                @for (edge of tree.edges; track edge.to.index) {
                  <line
                    [attr.x1]="edge.from.x"
                    [attr.y1]="edge.from.y"
                    [attr.x2]="edge.to.x"
                    [attr.y2]="edge.to.y"
                  />
                }
                @for (node of tree.nodes; track node.index) {
                  <circle [attr.cx]="node.x" [attr.cy]="node.y" r="19" />
                  <text [attr.x]="node.x" [attr.y]="node.y">
                    <title>{{ node.label }}</title>
                    {{ node.label.length > 7 ? '[' + node.index + ']' : node.label }}
                  </text>
                  <text class="index" [attr.x]="node.x" [attr.y]="node.y + 30">
                    {{ node.index === 0 ? 'root' : node.index }}
                  </text>
                }
              </svg>
            }
            <p class="note">
              Tree preview: first 15 positions. Full values are listed by array index below.
            </p>
            <div class="cells" tabindex="0" [attr.aria-label]="field.name + ' heap array'">
              @for (value of items(field); track $index) {
                <div>
                  <small>[{{ $index }}]</small><strong>{{ show(value) }}</strong>
                </div>
              }
            </div>
          }
          @case ('matrix') {
            <div
              class="table-scroll"
              tabindex="0"
              [attr.aria-label]="field.name + ' indexed table'"
            >
              <table>
                <tbody>
                  @for (row of rows(field); track $index; let r = $index) {
                    <tr>
                      <th scope="row">[{{ r }}]</th>
                      @for (value of row; track $index; let c = $index) {
                        <td [class.marked]="matrixMarker(field, r, c)">
                          <small>[{{ r }},{{ c }}]</small>{{ show(value)
                          }}<small>{{ matrixMarker(field, r, c) }}</small>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @case ('intervals') {
            <div class="ranges">
              @for (row of rows(field); track $index) {
                <div class="range">
                  <span>{{ show(row) }}</span>
                  <div class="range-axis">
                    <i
                      [style.margin-left.%]="rangeStart(field, row)"
                      [style.width.%]="rangeWidth(field, row)"
                    ></i>
                  </div>
                </div>
              }
            </div>
          }
          @case ('node') {
            @if (nodeGraph(field); as graph) {
              <svg
                viewBox="0 0 520 200"
                role="img"
                [attr.aria-label]="field.name + ' recorded reference links'"
              >
                @for (edge of graph.edges; track edge.key) {
                  <line
                    [attr.x1]="edge.from.x"
                    [attr.y1]="edge.from.y"
                    [attr.x2]="edge.to.x"
                    [attr.y2]="edge.to.y"
                  />
                  <text
                    class="index"
                    [attr.x]="(edge.from.x + edge.to.x) / 2"
                    [attr.y]="(edge.from.y + edge.to.y) / 2"
                  >
                    {{ edge.label }}
                  </text>
                }
                @for (node of graph.nodes; track node.key) {
                  <circle [attr.cx]="node.x" [attr.cy]="node.y" r="20" />
                  <text [attr.x]="node.x" [attr.y]="node.y">{{ node.label }}</text>
                }
              </svg>
            }
            <dl class="pairs">
              @for (entry of pairs(field); track $index) {
                <div>
                  <dt>{{ entry.key }}</dt>
                  <dd>{{ entry.value }}</dd>
                </div>
              }
            </dl>
          }
          @case ('map') {
            <dl class="pairs">
              @for (entry of pairs(field); track $index) {
                <div>
                  <dt>{{ entry.key }}</dt>
                  <dd>{{ entry.value }}</dd>
                </div>
              } @empty {
                <p class="note">Empty map</p>
              }
            </dl>
          }
          @default {
            <ol
              class="cells"
              [class.stack]="field.kind === 'stack' || field.kind === 'stack-storage'"
              [class.front-stack]="field.kind === 'stack' && field.topIndex === 0"
              tabindex="0"
              [attr.aria-label]="field.name + ' ' + field.label"
            >
              @for (value of items(field); track $index; let i = $index) {
                <li [class.marked]="markers(field, i)">
                  <small>{{ cellLabel(field, i) }}</small
                  ><strong>{{ show(value) }}</strong>
                  @if (markers(field, i)) {
                    <span>{{ markers(field, i) }}</span>
                  }
                </li>
              } @empty {
                <p class="note">Empty collection</p>
              }
            </ol>
          }
        }
        @if (limited(field)) {
          <p class="note">
            Diagram shows a bounded portion. All recorded entries remain in the state inspector.
          </p>
        }
      </section>
    }
    <dl class="facts">
      @for (field of facts(); track field.name) {
        <div [class.changed]="field.changed">
          <dt>{{ field.name }}</dt>
          <dd>{{ show(field.value) }}</dd>
          @if (field.kind === 'bits') {
            <code>{{ binary(field.value) }}</code>
          }
        </div>
      }
    </dl>
    @if (!structures().length && !facts().length) {
      <p class="note">No working values are recorded at this instruction.</p>
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .semantic-state {
        display: grid;
        gap: 10px;
      }
      section {
        min-width: 0;
        border-bottom: 1px solid var(--line);
        padding: 6px 0 10px;
      }
      h4 {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
        align-items: baseline;
        margin: 0 0 6px;
        font-size: 13px;
      }
      h4 span,
      .note,
      small,
      dt {
        color: var(--muted);
        font-size: 11px;
      }
      .note {
        line-height: 1.5;
        margin: 4px 0 7px;
        overflow-wrap: anywhere;
      }
      .cells {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        list-style: none;
        margin: 0;
        padding: 3px;
      }
      .cells > li,
      .cells > div {
        border: 1px solid var(--line);
        background: var(--surface-subtle);
        padding: 6px;
        min-width: 38px;
        max-width: 100%;
        box-sizing: border-box;
        text-align: center;
      }
      small,
      strong,
      .cells span {
        display: block;
        overflow-wrap: anywhere;
      }
      strong {
        font:
          600 13px/1.5 ui-monospace,
          monospace;
      }
      .cells span {
        font-size: 10px;
        color: var(--accent);
      }
      .stack {
        flex-direction: column-reverse;
        align-items: stretch;
        max-width: 100%;
      }
      .front-stack {
        flex-direction: column;
      }
      .stack li {
        display: flex;
        gap: 12px;
        text-align: left;
      }
      .marked {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }
      .changed > h4,
      .facts .changed {
        border-inline-start: 3px solid var(--accent);
        padding-inline-start: 6px;
      }
      .table-scroll {
        max-width: 100%;
        overflow-x: auto;
      }
      table {
        border-collapse: collapse;
        font:
          12px/1.4 ui-monospace,
          monospace;
      }
      td,
      th {
        border: 1px solid var(--line);
        padding: 7px;
        min-width: 35px;
        overflow-wrap: anywhere;
      }
      .pairs,
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr));
        gap: 6px;
        margin: 0;
      }
      .pairs > div,
      .facts > div {
        min-width: 0;
        padding: 6px;
        background: var(--surface-subtle);
      }
      dd {
        margin: 3px 0 0;
        font:
          600 12px/1.5 ui-monospace,
          monospace;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      dt,
      code {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      svg {
        display: block;
        width: 100%;
        max-height: 200px;
      }
      line {
        stroke: var(--line);
        stroke-width: 2;
      }
      circle {
        fill: var(--surface-subtle);
        stroke: var(--accent);
        stroke-width: 2;
      }
      text {
        fill: var(--ink);
        text-anchor: middle;
        dominant-baseline: middle;
        font:
          11px ui-monospace,
          monospace;
      }
      text.index {
        fill: var(--muted);
        font-size: 9px;
      }
      .range {
        display: grid;
        grid-template-columns: minmax(70px, auto) 1fr;
        gap: 10px;
        margin: 6px 0;
        font:
          11px ui-monospace,
          monospace;
      }
      .range-axis {
        background: var(--surface-subtle);
      }
      .range i {
        display: block;
        min-width: 2px;
        height: 12px;
        background: var(--accent);
      }
      .parent-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .parent-links > div {
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--line);
        padding: 8px;
      }
      .parent-links span {
        color: var(--muted);
        font-size: 10px;
      }
      [tabindex]:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
    `,
  ],
})
export class StudioSemanticDiagram {
  readonly problem = input.required<PatternProblemV1>();
  readonly snapshot = input.required<TraceSnapshot>();
  readonly language = input.required<PatternLanguage>();
  readonly state = computed(() => semanticState(this.problem(), this.snapshot(), this.language()));
  protected readonly structures = computed(() =>
    this.state().filter((field) => !['scalar', 'bits'].includes(field.kind)),
  );
  protected readonly facts = computed(() =>
    this.state().filter((field) => ['scalar', 'bits'].includes(field.kind)),
  );
  protected readonly show = displayRecorded;
  protected items(field: StateStructure): unknown[] {
    return Array.isArray(field.value) ? field.value.slice(0, 64) : [field.value];
  }
  protected rows(field: StateStructure): unknown[][] {
    return this.items(field)
      .filter(Array.isArray)
      .map((row) => row.slice(0, 32));
  }
  protected limited(field: StateStructure): boolean {
    return (
      Array.isArray(field.value) &&
      (field.value.length > 64 || field.value.some((row) => Array.isArray(row) && row.length > 32))
    );
  }
  protected pairs(field: StateStructure) {
    return recordedMapEntries(field.raw).map((entry) => ({
      key: this.show(entry.key),
      value: this.show(entry.value),
    }));
  }
  protected adjacency(field: StateStructure) {
    return Array.isArray(field.value)
      ? field.value.map((value, index) => ({ key: String(index), value: this.show(value) }))
      : this.pairs(field);
  }
  protected markers(field: StateStructure, index: number): string {
    return field.markers
      .filter((marker) => marker.index === index)
      .map((marker) => marker.name)
      .join(', ');
  }
  protected matrixMarker(field: StateStructure, row: number, column: number): string {
    return (
      field.matrixMarkers.find((marker) => marker.row === row && marker.column === column)?.label ??
      ''
    );
  }
  protected cellLabel(field: StateStructure, index: number): string {
    const length = Array.isArray(field.value) ? field.value.length : 0;
    if (field.kind === 'queue')
      return `${index === 0 ? 'front' : index === length - 1 ? 'back' : 'queued'} [${index}]`;
    if (field.kind === 'stack' && index === field.topIndex) return `top [${index}]`;
    return `[${index}]`;
  }
  protected binary(value: unknown): string {
    const number = Number(value);
    return `${number < 0 ? '−' : ''}0b${Math.abs(number).toString(2)}`;
  }
  protected rangeStart(field: StateStructure, row: unknown[]): number {
    const [min, span] = this.rangeScale(field);
    return ((Number(row[0]) - min) / span) * 100;
  }
  protected rangeWidth(field: StateStructure, row: unknown[]): number {
    return (Math.max(0, Number(row[1]) - Number(row[0])) / this.rangeScale(field)[1]) * 100;
  }
  private rangeScale(field: StateStructure): [number, number] {
    const numbers = this.rows(field).flat().map(Number);
    const min = Math.min(...numbers);
    return [min, Math.max(1, Math.max(...numbers) - min)];
  }
  protected heap(field: StateStructure) {
    if (!Array.isArray(field.value) || !field.value.length) return null;
    const nodes = field.value.slice(0, 15).map((value, index) => {
      const depth = Math.floor(Math.log2(index + 1));
      return {
        index,
        label: this.show(value),
        x: (520 * (index - (2 ** depth - 1) + 0.5)) / 2 ** depth,
        y: 25 + depth * 48,
      };
    });
    return {
      nodes,
      edges: nodes
        .slice(1)
        .map((node) => ({ from: nodes[Math.floor((node.index - 1) / 2)], to: node })),
    };
  }
  protected nodeGraph(field: StateStructure) {
    type Node = { key: string; label: string; depth: number; x: number; y: number };
    const nodes: Node[] = [],
      edges: Array<{ key: string; label: string; from: Node; to: Node }> = [];
    const visit = (value: unknown, key: string, depth: number, parent?: Node, link = '') => {
      if (nodes.length >= 15 || depth > 2 || value === null) return;
      const record =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
      const label = record
        ? this.show(record['value'] ?? record['val'] ?? record['Val'] ?? 'node')
        : this.show(value);
      const node = { key, label, depth, x: 0, y: 25 + depth * 70 };
      nodes.push(node);
      if (parent) edges.push({ key, label: link, from: parent, to: node });
      if (!record) return;
      for (const name of ['left', 'right', 'next', 'prev']) {
        if (Object.hasOwn(record, name))
          visit(record[name], `${key}.${name}`, depth + 1, node, name);
      }
    };
    visit(field.value, field.name, 0);
    for (let depth = 0; depth <= 2; depth++) {
      const level = nodes.filter((node) => node.depth === depth);
      level.forEach((node, index) => (node.x = (520 * (index + 0.5)) / level.length));
    }
    return edges.length ? { nodes, edges } : null;
  }
}
