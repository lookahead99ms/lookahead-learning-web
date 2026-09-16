import { Component, computed, input } from '@angular/core';
import {
  DsaProblemFixtureV2,
  PatternLanguage,
  PatternProblemV1,
} from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { parseRecordedValue, recordedMapEntries, sourceOrderedLocals } from './studio-state-view';
import { linkedWalkthrough, walkthroughKind } from './studio-walkthrough';
import { semanticState, displayRecorded } from './studio-semantic-state';

@Component({
  selector: 'app-studio-essential-state',
  template: `<section class="essential-state" aria-label="Essential state">
    <h3>State inspector</h3>
    <div class="state-inputs">
      @for (entry of inputs(); track entry.name) {
        <span
          ><b>{{ entry.name }}</b> {{ entry.value }}</span
        >
      }
    </div>
    @if (snapshot().unavailable; as reason) {
      <p role="status">{{ reason }} No local values are inferred.</p>
    }
    <dl class="essential-fields">
      @for (field of fields(); track field.name) {
        <div [class.changed]="field.changed">
          <dt>{{ field.name }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
      }
      <div>
        <dt>Expected</dt>
        <dd>{{ fixture().expectedOutput }}</dd>
      </div>
      <div>
        <dt>Returned</dt>
        <dd>{{ snapshot().event?.result ?? 'Not returned yet' }}</dd>
      </div>
    </dl>
    <p class="current-instruction">
      <b>Current instruction</b> <code>{{ currentLine() }}</code>
    </p>
    <p class="state-provenance">
      Inputs and published {{ language() }} reference state. All recorded values remain below the
      source.
    </p>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .essential-state {
        background: var(--surface-subtle);
        color: var(--ink);
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 6px;
        min-width: 0;
      }
      h3 {
        font-size: 14px;
        margin: 0 0 6px;
      }
      .state-inputs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
        font-size: 12px;
        margin: 0 0 8px;
        overflow-wrap: anywhere;
      }
      .state-inputs span {
        min-width: 0;
        max-width: 100%;
      }
      .essential-fields {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin: 0;
      }
      .essential-fields:has(> div:nth-child(8)) {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .essential-fields > div {
        background: var(--surface);
        padding: 6px 8px;
        min-width: 0;
      }
      .essential-fields .changed {
        box-shadow: inset 0 -2px var(--accent);
      }
      dt {
        font-size: 10px;
        color: var(--muted);
        line-height: 1.4;
      }
      dd {
        font-size: 14px;
        font-weight: 700;
        margin: 3px 0 0;
        line-height: 1.4;
        overflow-wrap: anywhere;
        min-height: 20px;
      }
      .current-instruction code {
        margin-inline-start: 0.5em;
      }
      .current-instruction {
        font-size: 11px;
        margin: 8px 0 0;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      code {
        white-space: pre-wrap;
        font-size: 11px;
      }
      .state-provenance {
        font-size: 10px;
        margin: 5px 0 0;
        color: var(--muted);
        line-height: 1.4;
      }
      @media (max-width: 700px) {
        .essential-fields,
        .essential-fields:has(> div:nth-child(8)) {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class StudioEssentialState {
  readonly problem = input.required<PatternProblemV1>();
  readonly fixture = input.required<DsaProblemFixtureV2>();
  readonly snapshot = input.required<TraceSnapshot>();
  readonly language = input.required<PatternLanguage>();
  protected readonly inputs = computed(() =>
    Object.entries(this.fixture().arguments ?? {}).map(([name, value]) => ({
      name,
      value: JSON.stringify(value),
    })),
  );
  protected readonly fields = computed(() => {
    if (this.snapshot().unavailable) return [];
    if (this.problem().id !== 'algorithmic-print-all-nodes-distance-k') {
      return semanticState(this.problem(), this.snapshot(), this.language()).map((field) => {
        if (field.name === 'best' && walkthroughKind(this.problem().id) === 'window') {
          const frame = linkedWalkthrough(
            'window',
            this.problem(),
            this.fixture(),
            this.snapshot(),
            this.language(),
          );
          return {
            name: 'Best valid sum',
            value: frame.best === null ? 'Not yet' : String(frame.best),
            changed: field.changed,
          };
        }
        const raw = displayRecorded(field.value);
        const compact = raw.length > 140 ? `${raw.slice(0, 140)}… · full value below` : raw;
        return {
          name: field.name,
          value: field.kind === 'opaque' ? 'Contents not recorded' : compact,
          changed: field.changed,
        };
      });
    }
    const locals = sourceOrderedLocals(
      this.problem(),
      this.fixture(),
      this.snapshot(),
      this.language(),
    );
    const names = new Set(locals.map(({ name }) => name));
    const activeLocals =
      names.has('distance') || names.has('seen') || names.has('visited')
        ? locals.filter(({ name }) => name !== 'scan')
        : locals;
    return activeLocals
      .filter(
        (field) =>
          /^-?\d+(\.\d+)?$|^(true|false|null)$/.test(field.value) ||
          [
            'queue',
            'scan',
            'stack',
            'heap',
            'parent',
            'start',
            'node',
            'current',
            'seen',
            'visited',
            'distance',
            'level',
            'neighbor',
            'next',
            'size',
          ].includes(field.name),
      )
      .slice(0, 8)
      .map((field) => {
        if (field.name !== 'best' || walkthroughKind(this.problem().id) !== 'window') {
          return {
            ...field,
            name: this.fieldLabel(field.name),
            value: this.fieldValue(field.name, field.value),
          };
        }
        const frame = linkedWalkthrough(
          'window',
          this.problem(),
          this.fixture(),
          this.snapshot(),
          this.language(),
        );
        return {
          ...field,
          name: 'Best valid sum',
          value: frame.best === null ? 'Not yet' : String(frame.best),
        };
      });
  });
  private fieldLabel(name: string): string {
    return (
      (
        {
          queue: 'Queue / frontier',
          scan: 'Tree scan queue',
          stack: 'Stack',
          heap: 'Heap',
          parent: 'Parent map',
          start: 'Start node',
          node: 'Current node',
          current: 'Current node',
          seen: 'Seen nodes',
          visited: 'Visited nodes',
          distance: 'Distance',
          level: 'Level',
          neighbor: 'Neighbor',
          next: 'Next node',
          size: 'Nodes remaining at this level',
        } as Record<string, string>
      )[name] ?? name
    );
  }
  private fieldValue(name: string, raw: string): string {
    const value = parseRecordedValue(raw);
    if (value === null || value === '—') return 'Not assigned';
    if (name === 'parent') {
      const count = recordedMapEntries(raw).length;
      return count ? `${count} recorded ${count === 1 ? 'link' : 'links'}` : 'No links yet';
    }
    if (Array.isArray(value)) {
      const values = value.map((item) => this.nodeValue(item));
      return values.length ? `[${values.join(', ')}]` : 'Empty';
    }
    if (value && typeof value === 'object') return this.nodeValue(value);
    return String(value);
  }
  private nodeValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value !== 'object') return String(value);
    const record = value as Record<string, unknown>;
    return String(record['value'] ?? record['val'] ?? record['Val'] ?? JSON.stringify(value));
  }
  protected readonly currentLine = computed(
    () =>
      this.problem()
        .implementations.find((source) => source.language === this.language())
        ?.lines.find((line) => line.id === this.snapshot().event?.sourceAnchor[this.language()])
        ?.text.trim() ?? 'Unavailable',
  );
}
