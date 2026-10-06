import { Component, computed, input, linkedSignal, output } from '@angular/core';
import {
  ComplexityPrediction,
  PracticeTimer,
  SPACE_OPTIONS,
  TIME_OPTIONS,
  TIMER_MINUTES,
  complexityVerdict,
} from './practice-tools';

/**
 * Practice tools (user-approved preview, 2026-10-05). Their styles live here, next to the markup,
 * so the Focus Studio stylesheet stays inside its component budget.
 */
const BASE = `
  button,
  select {
    min-height: 32px;
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink, var(--text-strong));
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  button:hover {
    background: var(--surface-soft, var(--surface-subtle));
  }
  button:focus-visible,
  select:focus-visible {
    outline: 3px solid var(--accent, var(--accent-strong));
    outline-offset: 3px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
`;

/** Start, stop, resume and reset a timed attempt; it sits at the end of the workspace heading. */
@Component({
  selector: 'app-studio-timer',
  template: `@if (timer().started()) {
      <span class="clock" [class.low]="timer().low()" role="timer" aria-label="Time left">{{
        timer().clock()
      }}</span>
      @if (timer().running()) {
        <button type="button" (click)="timer().stop()">Stop</button>
      } @else {
        @if (!timer().expired()) {
          <button type="button" (click)="timer().resume()">Resume</button>
        }
        <button type="button" (click)="timer().reset()">Reset</button>
      }
    } @else if (available()) {
      <select
        aria-label="Attempt length"
        [value]="timer().minutes()"
        (change)="timer().setMinutes(+$any($event.target).value)"
      >
        @for (minutes of options; track minutes) {
          <option [value]="minutes" [selected]="minutes === timer().minutes()">
            {{ minutes }} min
          </option>
        }
      </select>
      <button type="button" class="start" (click)="start.emit()">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9 2h6" />
        </svg>
        Start timed attempt
      </button>
    }
    <span class="visually-hidden" aria-live="polite">{{ timer().announcement() }}</span>`,
  styles: [
    BASE +
      `
      :host {
        display: inline-flex;
        flex: 0 1 auto;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-width: 0;
        max-width: 100%;
        margin-inline-start: auto;
      }
      .start {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
      }
      svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
      }
      .clock {
        padding: 4px 10px;
        border-radius: 8px;
        background: var(--surface-muted);
        color: var(--ink, var(--text-strong));
        font: 700 15px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-variant-numeric: tabular-nums;
      }
      .clock.low {
        background: var(--warning-surface);
        color: var(--warning);
      }
    `,
  ],
})
export class StudioTimer {
  readonly timer = input.required<PracticeTimer>();
  /** Start lives on Try it yourself; a started attempt stays visible on every tab. */
  readonly available = input(true);
  readonly start = output<void>();
  protected readonly options = TIMER_MINUTES;
}

/** Shown on Approach, Visual walkthrough and Recall while a timed attempt runs. */
@Component({
  selector: 'app-studio-timer-gate',
  template: `<p>
      <strong>{{ tab() }}</strong> reveals the approach, and your timed attempt is still running.
      Continue anyway?
    </p>
    <div role="group" aria-label="Timed attempt">
      <button type="button" class="primary" (click)="proceed.emit()">Continue anyway</button>
      <button type="button" (click)="back.emit()">Back to Try it yourself</button>
    </div>`,
  host: { role: 'note', 'aria-label': 'Timed attempt running' },
  styles: [
    BASE +
      `
      :host {
        display: grid;
        gap: 12px;
        max-width: 640px;
        margin: 8px 0 20px;
        padding: 16px 18px;
        border: 1px solid var(--line);
        border-left: 4px solid var(--warning);
        border-radius: 10px;
        background: var(--warning-surface);
        font-size: 14px;
      }
      p {
        margin: 0;
      }
      div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .primary {
        border-color: var(--accent);
        background: var(--accent);
        color: var(--accent-ink, #fff);
        font-weight: 700;
      }
    `,
  ],
})
export class StudioTimerGate {
  readonly tab = input.required<string>();
  readonly proceed = output<void>();
  readonly back = output<void>();
}

/** Predict time and space before opening the solution; the reference chips are marked against it. */
@Component({
  selector: 'app-studio-prediction',
  template: `<p class="title">Predict the complexity before you open the solution</p>
    <div class="row">
      <label
        >Time
        <select [value]="time()" (change)="time.set($any($event.target).value)">
          @for (option of timeOptions; track option) {
            <option [value]="option" [selected]="option === time()">{{ option }}</option>
          }
        </select></label
      >
      <label
        >Space
        <select [value]="space()" (change)="space.set($any($event.target).value)">
          @for (option of spaceOptions; track option) {
            <option [value]="option" [selected]="option === space()">{{ option }}</option>
          }
        </select></label
      >
      <button type="button" (click)="save.emit({ time: time(), space: space() })">
        Save my prediction
      </button>
      <span role="status">{{
        saved() ? 'Saved: ' + saved()!.time + ' time, ' + saved()!.space + ' space' : ''
      }}</span>
    </div>`,
  host: { role: 'group', 'aria-label': 'Predict the complexity' },
  styles: [
    BASE +
      `
      :host {
        display: grid;
        gap: 8px;
        margin: 12px 12px 0;
        padding: 10px 12px;
        border: 1px solid color-mix(in srgb, var(--accent-strong) 45%, var(--line));
        border-left-width: 4px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--accent-strong) 8%, var(--surface));
        font-size: 13px;
      }
      .title {
        margin: 0;
        font-weight: 700;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
      }
      label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--muted);
        font-size: 12px;
      }
      [role='status'] {
        color: var(--muted);
        font-size: 12px;
      }
    `,
  ],
})
export class StudioPrediction {
  readonly saved = input<ComplexityPrediction | null>(null);
  readonly save = output<ComplexityPrediction>();
  protected readonly timeOptions = TIME_OPTIONS;
  protected readonly spaceOptions = SPACE_OPTIONS;
  protected readonly time = linkedSignal(() => this.saved()?.time ?? 'O(n)');
  protected readonly space = linkedSignal(() => this.saved()?.space ?? 'O(1)');
}

/** The reference cost as two chips, marked match or miss against a saved prediction. */
@Component({
  selector: 'app-studio-complexity',
  template: `<dl class="complexity-chips" aria-label="Complexity">
      @for (chip of chips(); track chip.label) {
        <div [attr.data-verdict]="chip.verdict">
          <dt>{{ chip.label }}</dt>
          <dd>
            <code>{{ chip.value }}</code>
            @if (chip.verdict) {
              <span class="verdict"
                ><span aria-hidden="true">{{ chip.verdict === 'match' ? '✓' : '✗' }}</span
                ><span class="visually-hidden">{{
                  chip.verdict === 'match'
                    ? 'matches your prediction'
                    : 'differs from your prediction'
                }}</span></span
              >
            }
          </dd>
        </div>
      }
    </dl>
    @if (prediction(); as predicted) {
      <p class="prediction-result">
        Your prediction: {{ predicted.time }} time, {{ predicted.space }} space. {{ summary() }}
      </p>
    }`,
  styles: [
    BASE +
      `
      :host {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .complexity-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
      }
      .complexity-chips > div {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
        min-width: 0;
        padding: 3px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface-muted);
      }
      .complexity-chips dt {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .complexity-chips dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .complexity-chips code {
        font:
          600 12px/1.6 ui-monospace,
          monospace;
        color: var(--text-strong);
      }
      .complexity-chips > [data-verdict='match'] {
        border-color: var(--success);
        background: var(--success-surface);
      }
      .complexity-chips > [data-verdict='miss'] {
        border-color: var(--warning);
        background: var(--warning-surface);
      }
      .verdict {
        margin-inline-start: 6px;
        font-weight: 700;
      }
      [data-verdict='match'] .verdict {
        color: var(--success);
      }
      [data-verdict='miss'] .verdict {
        color: var(--warning);
      }
      .prediction-result {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
      }
    `,
  ],
})
export class StudioComplexity {
  readonly time = input.required<string>();
  readonly space = input.required<string>();
  readonly prediction = input<ComplexityPrediction | null>(null);
  protected readonly chips = computed(() => {
    const predicted = this.prediction();
    return [
      {
        label: 'Time',
        value: this.time(),
        verdict: predicted ? complexityVerdict(this.time(), predicted.time) : null,
      },
      {
        label: 'Space',
        value: this.space(),
        verdict: predicted ? complexityVerdict(this.space(), predicted.space) : null,
      },
    ];
  });
  protected readonly summary = computed(() => {
    const [time, space] = this.chips().map((chip) => chip.verdict);
    if (time === 'match' && space === 'match') return 'Both match.';
    if (time === 'miss' && space === 'miss') return 'Both miss.';
    return time === 'match' ? 'Time matches; space misses.' : 'Space matches; time misses.';
  });
}

/** One line under the editor and its prediction box; the keys themselves are handled by Focus Studio. */
@Component({
  selector: 'app-studio-shortcuts',
  template: `<span>Shortcuts outside the editor</span>
    <span><kbd>1</kbd>–<kbd>4</kbd> tabs</span>
    <span><kbd>P</kbd> problem</span>
    <span><kbd>H</kbd> hints</span>`,
  host: { role: 'note', 'aria-label': 'Keyboard shortcuts' },
  styles: [
    `
      :host {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 14px;
        padding: 10px 12px 12px;
        color: var(--muted);
        font-size: 12px;
      }
      kbd {
        padding: 0 5px;
        border: 1px solid var(--line);
        border-bottom-width: 2px;
        border-radius: 5px;
        background: var(--surface);
        color: var(--ink, var(--text-strong));
        font:
          600 11px/1.5 ui-monospace,
          'SF Mono',
          Menlo,
          Consolas,
          monospace;
      }
    `,
  ],
})
export class StudioShortcuts {}
