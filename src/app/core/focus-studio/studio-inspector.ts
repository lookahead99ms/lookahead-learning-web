import { Component, computed, input } from '@angular/core';
import {
  DsaProblemFixtureV2,
  PatternLanguage,
  PatternProblemV1,
} from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { currentInputIndices, parseRecordedValue, sourceOrderedLocals } from './studio-state-view';
import { StudioStateValues } from './studio-state-values';

@Component({
  selector: 'app-studio-inspector',
  imports: [StudioStateValues],
  template: `<section class="inspector" aria-label="Recorded runtime state">
    <header>
      <h3>State inspector</h3>
      <p>Inputs, then locals in code order</p>
    </header>
    <div class="inspector-inputs">
      @for (entry of inputs(); track entry.name) {
        <section [class.scalar-input]="!entry.collection">
          <h4>
            Input <code>{{ entry.name }}</code>
          </h4>
          <app-studio-state-values
            [name]="entry.name"
            [value]="entry.value"
            [active]="entry.active"
          />
        </section>
      }
    </div>
    @if (snapshot().unavailable; as reason) {
      <p class="note" role="status">{{ reason }} No local values are inferred.</p>
    } @else {
      <div class="inspector-locals">
        @for (variable of locals(); track variable.name) {
          <section class="inspector-section" [class.value-changed]="variable.changed">
            <h4>
              {{ localLabel(variable.name) }} <code>{{ variable.name }}</code>
            </h4>
            @if (opaque(variable.type, variable.value)) {
              <p class="note">
                The recorded reference does not include this collection's contents.
              </p>
            } @else {
              <app-studio-state-values [name]="variable.name" [value]="parse(variable.value)" />
            }
            @if (variable.changed) {
              <small>Changed this step</small>
            }
          </section>
        } @empty {
          <p class="note">No local values have been recorded yet.</p>
        }
      </div>
    }
    <details>
      <summary>Current instruction</summary>
      <pre>{{ currentLine() }}</pre>
      <p class="note">Published {{ language() }} reference trace, not your draft.</p>
    </details>
    <details>
      <summary>All variables and source data</summary>
      <pre>{{ sourceData() }}</pre>
    </details>
    <footer>
      <span
        >Expected <strong>{{ fixture().expectedOutput }}</strong></span
      ><span
        >Returned <strong>{{ snapshot().event?.result ?? 'Not yet' }}</strong></span
      >
    </footer>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .inspector {
        min-width: 0;
        min-height: 100%;
        box-sizing: border-box;
        background: var(--surface-subtle);
        color: var(--ink);
        border: 1px solid var(--line);
        border-radius: 4px;
        padding: 10px;
        font-size: 13px;
      }
      header {
        margin-bottom: 16px;
      }
      h3 {
        font-size: 15px;
        line-height: 1.4;
        margin: 0;
      }
      header p {
        font-size: 11px;
        color: var(--muted);
        margin: 4px 0 0;
      }
      .inspector-inputs {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        border-bottom: 1px solid var(--line);
        padding-bottom: 12px;
      }
      .inspector-inputs section {
        min-width: 0;
        flex: 1 1 240px;
      }
      .inspector-inputs .scalar-input {
        flex: 0 1 90px;
        padding: 8px;
        background: var(--surface);
        border-bottom: 2px solid var(--line);
      }
      h4 {
        margin: 6px 0 8px;
        font-size: 12px;
        line-height: 1.5;
      }
      code {
        font: inherit;
      }
      .inspector-section {
        padding: 14px 0;
        border-bottom: 1px solid var(--line);
      }
      .inspector-section.value-changed {
        background: var(--surface-accent);
        padding-inline: 8px;
      }
      .inspector-section small {
        display: block;
        font-size: 10px;
        color: var(--accent);
        margin-top: 6px;
      }
      .note {
        font-size: 11px;
        color: var(--muted);
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      details {
        padding: 14px 0;
        border-bottom: 1px solid var(--line);
      }
      summary {
        cursor: pointer;
        font-weight: 700;
        font-size: 13px;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font:
          11px/1.6 ui-monospace,
          monospace;
      }
      footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 14px 0 0;
        font-size: 12px;
      }
      footer strong {
        display: block;
        margin-top: 5px;
        overflow-wrap: anywhere;
      }
      summary:focus-visible {
        outline: 3px solid var(--accent);
        outline-offset: 3px;
      }
    `,
  ],
})
export class StudioInspector {
  readonly problem = input.required<PatternProblemV1>();
  readonly fixture = input.required<DsaProblemFixtureV2>();
  readonly snapshot = input.required<TraceSnapshot>();
  readonly language = input.required<PatternLanguage>();
  protected readonly inputs = computed(() =>
    Object.entries(this.fixture().arguments ?? {}).map(([name, value]) => ({
      name,
      value,
      collection: typeof value === 'object' && value !== null,
      active: currentInputIndices(
        this.problem(),
        this.fixture(),
        this.snapshot(),
        this.language(),
        name,
      ),
    })),
  );
  protected readonly locals = computed(() =>
    sourceOrderedLocals(this.problem(), this.fixture(), this.snapshot(), this.language(), true),
  );
  protected readonly currentLine = computed(
    () =>
      this.problem()
        .implementations.find((item) => item.language === this.language())
        ?.lines.find((line) => line.id === this.snapshot().event?.sourceAnchor[this.language()])
        ?.text.trim() ?? 'Unavailable',
  );
  protected readonly sourceData = computed(() =>
    JSON.stringify({ variables: this.snapshot().variables, rows: this.snapshot().rows }, null, 2),
  );
  protected readonly parse = parseRecordedValue;
  protected opaque(type: string, value: string): boolean {
    const parsed = parseRecordedValue(value);
    return (
      typeof parsed === 'string' &&
      (/object|queue|deque|list|array|map/.test(type) || parsed === 'deque')
    );
  }
  protected localLabel(name: string): string {
    return (
      (
        {
          heap: this.language() === 'java' ? 'Priority queue snapshot' : 'Heap array',
          value: 'Current number',
          v: 'Current number',
          queue: 'Queue / frontier',
          scan: 'Tree scan queue',
          parent: 'Parent map',
          start: 'Start node',
          current: 'Current node',
          distance: 'Distance from target',
          neighbor: 'Neighbor under review',
          next: 'Next node',
          visited: 'Visited nodes',
          size: 'Current level size',
          levels: 'Completed levels',
          level: 'Current level',
          node: 'Current node',
          stack: 'Stack',
          seen: 'Seen values',
          cache: 'Cache',
          merged: 'Merged intervals',
          frequencies: 'Prefix frequencies',
        } as Record<string, string>
      )[name] ?? 'Local'
    );
  }
}
