import { Component, computed, input } from '@angular/core';
import { DsaProblemFixtureV2, DsaProblemV2, PatternLanguage } from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { parseRecordedValue } from './studio-state-view';

/** Endpoint comparisons use only the selected runtime's recorded locals. */
export function intervalComparison(
  problem: DsaProblemV2,
  snapshot: TraceSnapshot,
  language: PatternLanguage,
) {
  if (snapshot.unavailable) return null;
  const values = new Map(
    snapshot.variables.map((value) => [value.name, parseRecordedValue(value.value)]),
  );
  const ordered = values.get('ordered');
  const index = values.get('index');
  const previousEnd = values.get('previousEnd');
  const currentStart = values.get('currentStart');
  const ranges =
    Array.isArray(ordered) &&
    ordered.every((row) => Array.isArray(row) && row.length === 2 && row.every(Number.isFinite))
      ? (ordered as number[][])
      : null;
  const activeIndex =
    typeof index === 'number' &&
    Number.isInteger(index) &&
    ranges &&
    index > 0 &&
    index < ranges.length
      ? index
      : null;
  const ready =
    activeIndex !== null &&
    typeof previousEnd === 'number' &&
    typeof currentStart === 'number' &&
    previousEnd === ranges![activeIndex - 1][1] &&
    currentStart === ranges![activeIndex][0];
  const source =
    problem.implementations
      .find((item) => item.language === language)
      ?.lines.find((line) => line.id === snapshot.event?.sourceAnchor[language])?.text ?? '';
  const result = snapshot.event?.result;
  const compared =
    ready && /if\s*\(?currentStart\s*<\s*previousEnd|return\s+(?:false|False)/.test(source.trim());
  const relationship = ready
    ? currentStart! < previousEnd!
      ? 'Overlap'
      : currentStart === previousEnd
        ? 'Touching — allowed'
        : 'Separated — allowed'
    : null;
  const phase =
    result !== undefined
      ? `Return ${result}`
      : compared
        ? relationship!
        : ready
          ? 'Endpoints ready to compare'
          : ranges
            ? 'Read the next adjacent pair'
            : 'Copy and sort the meetings';
  const sorted = !!ranges && ranges.every((range, i) => i === 0 || ranges[i - 1][0] <= range[0]);
  return {
    ranges,
    sorted,
    activeIndex,
    previousEnd: ready ? (previousEnd as number) : null,
    currentStart: ready ? (currentStart as number) : null,
    relationship,
    compared,
    phase,
    result,
  };
}

@Component({
  selector: 'app-studio-interval-comparison',
  template: `<section class="interval-comparison" aria-label="Adjacent meeting comparison">
    @if (state(); as value) {
      <p class="phase" role="status">{{ value.phase }}</p>
      <div class="interval-lanes">
        <section>
          <h4>Original intervals · unchanged</h4>
          @for (range of original(); track $index) {
            <p class="interval-row">
              <code>[{{ range[0] }}, {{ range[1] }})</code
              ><span class="axis"
                ><i [style.margin-inline-start.%]="start(range)" [style.width.%]="width(range)"></i
              ></span>
            </p>
          }
          @if (!original().length) {
            <p>No meetings</p>
          }
        </section>
        <section>
          <h4>
            {{
              value.sorted
                ? 'Sorted intervals · recorded copy'
                : 'Recorded copy · awaiting sorted state'
            }}
          </h4>
          @if (value.ranges; as ranges) {
            @for (range of ranges; track $index) {
              <p
                class="interval-row"
                [class.previous]="value.activeIndex !== null && $index === value.activeIndex - 1"
                [class.current]="$index === value.activeIndex"
              >
                <code>[{{ range[0] }}, {{ range[1] }})</code
                ><span class="axis"
                  ><i
                    [style.margin-inline-start.%]="start(range)"
                    [style.width.%]="width(range)"
                  ></i
                ></span>
                @if (value.activeIndex !== null && $index === value.activeIndex - 1) {
                  <small>Previous</small>
                }
                @if ($index === value.activeIndex) {
                  <small>Current</small>
                }
              </p>
            }
            @if (!ranges.length) {
              <p>No adjacent pair to check</p>
            }
          } @else {
            <p>The ordered copy is not recorded at this instruction yet.</p>
          }
        </section>
      </div>
      @if (value.currentStart !== null && value.previousEnd !== null) {
        <dl>
          <div>
            <dt>previousEnd</dt>
            <dd>{{ value.previousEnd }}</dd>
          </div>
          <div>
            <dt>currentStart</dt>
            <dd>{{ value.currentStart }}</dd>
          </div>
        </dl>
        <p class="comparison">
          <code>{{ value.currentStart }} &lt; {{ value.previousEnd }}</code> is
          {{ value.currentStart < value.previousEnd ? 'true' : 'false' }} · {{ value.relationship }}
        </p>
        <p>
          {{
            value.result !== undefined
              ? 'This is the recorded result; the scan has finished.'
              : value.compared
                ? value.currentStart < value.previousEnd
                  ? 'The overlap condition rejects this pair. The return instruction follows.'
                  : 'The overlap condition is false. Continue to the next pair.'
                : 'These recorded endpoints are ready. Predict the condition before stepping.'
          }}
        </p>
      }
      @if (value.result !== undefined) {
        <p class="result">
          {{
            value.result === 'false'
              ? 'An overlap prevents attending every meeting.'
              : 'Every adjacent pair passed, or no pair existed.'
          }}
        </p>
      }
      <p class="rule">
        Half-open [start, end): equal endpoints touch and are allowed. Only currentStart &lt;
        previousEnd rejects.
      </p>
    } @else {
      <p>Recorded interval state is unavailable for this instruction.</p>
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .interval-lanes {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 20px;
      }
      .interval-lanes section {
        min-width: 0;
      }
      h4 {
        font-size: 14px;
        margin: 12px 0;
      }
      p {
        font-size: 13px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      .interval-row {
        display: grid;
        grid-template-columns: minmax(85px, auto) minmax(30px, 1fr);
        gap: 8px;
        padding: 8px;
        margin: 8px 0;
        border-inline-start: 3px solid transparent;
      }
      .interval-row small {
        grid-column: 1 / -1;
        font-weight: 700;
      }
      .previous {
        border-color: var(--accent-link);
        background: var(--surface-subtle);
      }
      .current {
        border-color: var(--accent);
        background: var(--surface-accent);
      }
      .axis {
        align-self: center;
        height: 10px;
        background: var(--surface-subtle);
      }
      .axis i {
        display: block;
        height: 10px;
        background: var(--accent);
        min-width: 2px;
      }
      code {
        font-size: 12px;
      }
      dl {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        margin: 16px 0;
      }
      dt {
        font-size: 12px;
        color: var(--muted);
      }
      dd {
        font-size: 20px;
        font-weight: 700;
        margin: 4px 0;
      }
      .comparison {
        background: var(--surface-accent);
        padding: 12px;
        font-weight: 700;
      }
      .phase,
      .result {
        font-weight: 700;
      }
      .rule {
        color: var(--muted);
        border-top: 1px solid var(--line);
        padding-top: 12px;
      }
      @media (max-width: 700px) {
        .interval-lanes {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class StudioIntervalComparison {
  readonly problem = input.required<DsaProblemV2>();
  readonly fixture = input.required<DsaProblemFixtureV2>();
  readonly snapshot = input.required<TraceSnapshot>();
  readonly language = input.required<PatternLanguage>();
  protected readonly state = computed(() =>
    intervalComparison(this.problem(), this.snapshot(), this.language()),
  );
  protected readonly original = computed(
    () => (this.fixture().arguments['intervals'] ?? []) as number[][],
  );
  private readonly extent = computed(() => Math.max(1, ...this.original().flat()));
  protected start(range: number[]) {
    return (range[0] / this.extent()) * 100;
  }
  protected width(range: number[]) {
    return ((range[1] - range[0]) / this.extent()) * 100;
  }
}
