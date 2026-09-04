import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  GuidedTraceCell,
  GuidedTraceVariable,
  PatternLanguage,
  PatternProblemFixture,
  PatternProblemV1,
} from '../../content/content.models';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';

type GuidedDebuggerView = 'debugger' | 'why' | 'predict' | 'complexity';

@Component({
  selector: 'app-guided-algorithm-trace',
  imports: [CodeCopyButton],
  template: `
    <section
      class="guided-trace"
      role="region"
      tabindex="0"
      [attr.data-language]="language()"
      [attr.aria-label]="problem().title + ' guided trace'"
      (keydown)="handleShortcut($event)"
    >
      <header class="trace-toolbar">
        <div class="toolbar-brand">
          <span>Guided debugger</span><strong>{{ problem().title }}</strong>
        </div>
        <label class="trace-fixture-picker">
          <span>Guided input</span>
          <select
            aria-label="Guided trace input"
            [value]="selectedFixtureIndex()"
            (change)="chooseFixture($any($event.target).value)"
          >
            @for (fixture of guidedFixtures(); track fixture.id; let index = $index) {
              <option [value]="index">{{ fixture.label }}</option>
            }
          </select>
        </label>
        <div class="language-control">
          <span>Language</span>
          <div class="language-tabs" role="tablist" aria-label="Trace language">
            @for (code of problem().implementations; track code.language; let index = $index) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="language() === code.language"
                [attr.tabindex]="language() === code.language ? 0 : -1"
                [attr.aria-controls]="'guided-source-panel'"
                (click)="selectLanguage(code.language)"
                (keydown)="moveLanguageTab($event, index)"
              >
                {{ code.language }}
              </button>
            }
          </div>
        </div>
        <div class="trace-controls" aria-label="Trace controls">
          <button
            type="button"
            (click)="previous()"
            [disabled]="stepIndex() === 0"
            aria-describedby="trace-boundary-status"
          >
            Previous
          </button>
          <button type="button" (click)="reset()">Reset</button>
          <button
            type="button"
            class="primary"
            (click)="next()"
            [disabled]="stepIndex() === events().length - 1"
            aria-describedby="trace-boundary-status"
          >
            Next
          </button>
        </div>
        <div class="execution-readout" [class.complete]="isComplete()">
          <span>Execution status</span>
          <strong>{{ executionStatus() }}</strong>
          <small class="step-status"
            >Step {{ stepIndex() + 1 }} of {{ events().length }} · {{ event().phase }}</small
          >
        </div>
      </header>

      <div class="trace-context">
        <div class="trace-summary-values">
          <p><span>Selected input</span>{{ tracedFixture().input }}</p>
          <p><span>Expected output</span>{{ tracedFixture().expectedOutput }}</p>
        </div>
        @if (tracedFixture().explanation; as explanation) {
          <p class="fixture-explanation"><span>Why this case matters</span>{{ explanation }}</p>
        }
        @if (selectedFixture().id !== tracedFixture().id) {
          <p class="fixture-note">
            <span>Selected edge case</span>The trace remains on {{ tracedFixture().label }};
            {{ selectedFixture().label }} is available for independent dry-run practice.
          </p>
        }
      </div>

      <div class="trace-workspace ide-workspace">
        <section
          class="source-panel"
          id="guided-source-panel"
          role="tabpanel"
          aria-label="Selected source implementation"
        >
          <div class="pane-heading">
            <span>{{ solutionFileName() }}</span>
            <div class="pane-actions">
              <span>{{ activeLineSummary() }}</span>
              <app-code-copy-button [code]="sourceText()" />
            </div>
          </div>
          <pre
            tabindex="0"
            [attr.aria-label]="'Source editor. ' + activeLineSummary()"
          ><code>@for (line of source().lines; track line.id; let lineNumber = $index) {<span class="source-line" [class.active]="line.id === activeAnchor()" [class.executed]="isExecuted(line.id)" [class.unreachable]="isUnreachable(lineNumber)" [attr.aria-current]="line.id === activeAnchor() ? 'step' : null" [attr.aria-label]="sourceLineLabel(line.id, lineNumber, line.text)"><span class="line-gutter"><i class="current-line-arrow" aria-hidden="true">›</i><b aria-hidden="true">{{ lineNumber + 1 }}</b></span><span class="line-code">{{ line.text || ' ' }}</span></span>}</code></pre>
        </section>

        <aside class="debugger-shell" aria-label="Guided debugger">
          <section class="debugger-summary" aria-label="Pinned current state">
            <header>
              <span>Current state</span>
              <strong [class.returned]="isComplete() && event().result">
                {{ isComplete() && event().result ? 'Returned' : 'Live' }}
              </strong>
            </header>
            <dl>
              @for (variable of summaryVariables(); track variable.name) {
                <div [class.changed]="variable.changed">
                  <dt>{{ variable.name }}</dt>
                  <dd>{{ variable.value }}</dd>
                </div>
              }
              <div class="summary-output" [class.changed]="!!event().result">
                <dt>output</dt>
                <dd>{{ event().result ?? 'Pending' }}</dd>
              </div>
            </dl>
          </section>

          <div class="debugger-view-tabs" role="tablist" aria-label="Debugger views">
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="activeView() === 'debugger'"
              [attr.tabindex]="activeView() === 'debugger' ? 0 : -1"
              aria-controls="debugger-view-panel"
              (click)="selectView('debugger', $event)"
              (keydown)="moveViewTab($event, 0)"
            >
              Debugger
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="activeView() === 'why'"
              [attr.tabindex]="activeView() === 'why' ? 0 : -1"
              aria-controls="debugger-view-panel"
              (click)="selectView('why', $event)"
              (keydown)="moveViewTab($event, 1)"
            >
              Why
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="activeView() === 'predict'"
              [attr.tabindex]="activeView() === 'predict' ? 0 : -1"
              aria-controls="debugger-view-panel"
              [disabled]="isComplete()"
              (click)="selectView('predict', $event)"
              (keydown)="moveViewTab($event, 2)"
            >
              Predict
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="activeView() === 'complexity'"
              [attr.tabindex]="activeView() === 'complexity' ? 0 : -1"
              aria-controls="debugger-view-panel"
              (click)="selectView('complexity', $event)"
              (keydown)="moveViewTab($event, 3)"
            >
              Complexity
            </button>
          </div>

          <div class="debugger-detail-shell">
            <section
              #debuggerPanel
              id="debugger-view-panel"
              class="debugger-panel"
              [class.overflowing]="debuggerOverflow()"
              role="tabpanel"
              [attr.aria-label]="activeViewLabel()"
              tabindex="0"
              (scroll)="updateDebuggerOverflow($event)"
              (window:resize)="measureDebuggerOverflow()"
            >
              @if (activeView() === 'debugger') {
                <section class="variable-inspector" aria-label="Current variables">
                  <h3>Variables</h3>
                  <dl class="variables">
                    @for (variable of visibleVariables(); track variable.name) {
                      <div [class.changed]="variable.changed">
                        <dt>
                          {{ variable.name }} <small>{{ variable.type }}</small>
                          @if (variable.changed) {
                            <em>changed</em>
                          }
                        </dt>
                        <dd>{{ variable.value }}</dd>
                      </div>
                    }
                  </dl>
                </section>

                <section class="state-view" aria-label="Complete data state">
                  <h3>Data state</h3>
                  @for (row of event().rows; track row.id) {
                    <div class="state-row">
                      <strong>{{ row.label }}</strong>
                      <div class="state-cells" role="list" [attr.aria-label]="row.label">
                        @for (cell of row.cells; track $index) {
                          <span
                            role="listitem"
                            [class]="cellClasses(cell)"
                            [attr.aria-label]="cellLabel(cell, $index)"
                            ><b>{{ cell.value }}</b>
                            @if (cell.note) {
                              <small>{{ cell.note }}</small>
                            }
                          </span>
                        }
                      </div>
                    </div>
                  }
                </section>

                <section class="debugger-output" aria-label="Execution result">
                  <span>Returned output</span>
                  <strong>{{ event().result ?? 'Pending' }}</strong>
                </section>
                <p class="debugger-invariant">
                  <strong>Invariant:</strong> {{ activeTrace().invariant }}
                </p>
                <div class="terminal" role="region" aria-label="Terminal output">
                  <span>Terminal</span>
                  <p>{{ terminalMessage() }}</p>
                </div>
              } @else if (activeView() === 'why') {
                <article class="learning-view why-view">
                  <span>Why this line exists</span>
                  <h3>{{ event().label }}</h3>
                  <p>{{ event().what }}</p>
                  <p class="learning-detail">{{ event().why }}</p>
                </article>
              } @else if (activeView() === 'predict') {
                <section class="learning-view predict-view" aria-label="Predict the next step">
                  <span>Predict before Next</span>
                  <h3>{{ predictionPrompt() }}</h3>
                  <div class="prediction-options">
                    @for (option of predictionOptions(); track option.id) {
                      <label [class.selected]="selectedPrediction() === option.id">
                        <input
                          type="radio"
                          name="guided-next-prediction"
                          [value]="option.id"
                          [checked]="selectedPrediction() === option.id"
                          (change)="selectPrediction(option.id)"
                        />
                        <span>{{ option.label }}</span>
                      </label>
                    }
                  </div>
                  <button
                    type="button"
                    class="learning-action"
                    [disabled]="!selectedPrediction()"
                    (click)="submitPrediction()"
                  >
                    Check prediction
                  </button>
                  @if (predictionSubmitted()) {
                    <p class="prediction-feedback" aria-live="polite" aria-atomic="true">
                      <strong>{{ predictionIsCorrect() ? 'Correct.' : 'Not quite.' }}</strong>
                      {{ predictionFeedback() }}
                    </p>
                  }
                </section>
              } @else {
                <section class="learning-view complexity-view" aria-label="Predict complexity">
                  <span>Predict complexity</span>
                  <h3>Choose the implementation's time and space bounds.</h3>
                  <div class="complexity-questions">
                    <fieldset>
                      <legend>Time complexity</legend>
                      @for (option of timeComplexityOptions(); track option) {
                        <label>
                          <input
                            type="radio"
                            name="guided-complexity-time"
                            [value]="option"
                            [checked]="selectedTimeComplexity() === option"
                            (change)="selectComplexity('time', option)"
                          />
                          <span>{{ option }}</span>
                        </label>
                      }
                    </fieldset>
                    <fieldset>
                      <legend>Space complexity</legend>
                      @for (option of spaceComplexityOptions(); track option) {
                        <label>
                          <input
                            type="radio"
                            name="guided-complexity-space"
                            [value]="option"
                            [checked]="selectedSpaceComplexity() === option"
                            (change)="selectComplexity('space', option)"
                          />
                          <span>{{ option }}</span>
                        </label>
                      }
                    </fieldset>
                  </div>
                  <div class="complexity-actions">
                    <button
                      type="button"
                      class="primary"
                      [disabled]="!selectedTimeComplexity() || !selectedSpaceComplexity()"
                      (click)="submitComplexity()"
                    >
                      Submit answer
                    </button>
                    <button type="button" (click)="revealComplexity()">Reveal answer</button>
                  </div>
                  @if (complexityRevealed()) {
                    <section class="complexity-feedback" aria-live="polite" aria-atomic="true">
                      <strong>{{ complexityFeedbackHeading() }}</strong>
                      <p>
                        <b>Time:</b> {{ problem().complexity.time }} · <b>Space:</b>
                        {{ problem().complexity.space }}
                      </p>
                      <p>{{ problem().complexity.why }}</p>
                      @if (problem().complexity.caveat; as caveat) {
                        <p class="complexity-caveat">{{ caveat }}</p>
                      }
                    </section>
                  }
                </section>
              }
            </section>
            @if (debuggerOverflow() && !debuggerAtBottom()) {
              <div class="debugger-more">
                <button
                  type="button"
                  [attr.aria-label]="'Show more ' + activeViewLabel().toLowerCase()"
                  aria-controls="debugger-view-panel"
                  (click)="showMoreDebuggerState()"
                >
                  <span aria-hidden="true">⌄</span>
                </button>
              </div>
            }
          </div>
        </aside>
      </div>

      <details class="trace-transcript">
        <summary>Read the full trace transcript</summary>
        <div class="transcript-context">
          <p><strong>Input:</strong> {{ tracedFixture().input }}</p>
          <p><strong>Expected output:</strong> {{ tracedFixture().expectedOutput }}</p>
          <p>
            <strong>Complexity:</strong> {{ problem().complexity.time }} time ·
            {{ problem().complexity.space }} space
          </p>
        </div>
        <p><strong>Invariant:</strong> {{ activeTrace().invariant }}</p>
        <ol>
          @for (step of events(); track step.id) {
            <li>
              <strong>{{ step.phase }} · {{ step.label }}</strong
              ><span>{{ step.what }}</span
              ><span><b>Why:</b> {{ step.why }}</span
              ><span><b>State:</b> {{ transcriptState(step.variables) }}</span>
              @if (step.result) {
                <span><b>Result:</b> {{ step.result }}</span>
              }
            </li>
          }
        </ol>
      </details>
      <p id="trace-boundary-status" class="boundary-status">{{ boundaryStatus() }}</p>
      <p class="sr-status" aria-live="polite" aria-atomic="true">{{ announcement() }}</p>
    </section>
  `,
  styles: [
    `
      .guided-trace {
        position: relative;
        overflow: clip;
        border: 1px solid #35566c;
        border-radius: 16px;
        color: #e6f4f6;
        background: #102333;
        box-shadow: 0 14px 34px rgba(15, 49, 62, 0.14);
      }
      .trace-toolbar {
        position: relative;
        z-index: 4;
        top: auto;
        display: grid;
        grid-template-columns:
          minmax(150px, 0.85fr) minmax(180px, 1.05fr) minmax(190px, auto)
          auto minmax(165px, 0.8fr);
        align-items: center;
        gap: 12px;
        padding: 11px 15px;
        border-bottom: 1px solid #315569;
        background: rgba(23, 51, 70, 0.97);
        backdrop-filter: blur(10px);
      }
      .trace-toolbar span,
      .trace-context span,
      .pane-heading {
        display: block;
        color: #8fd9e3;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .trace-toolbar strong {
        display: block;
        margin-top: 2px;
        color: #f4fbfc;
      }
      .toolbar-brand,
      .language-control,
      .execution-readout {
        min-width: 0;
      }
      .trace-controls {
        display: flex;
        gap: 7px;
      }
      .trace-controls button {
        min-height: 38px;
        padding: 7px 12px;
        border: 1px solid #4d7789;
        border-radius: 7px;
        color: #edf9fa;
        background: #2d5267;
        cursor: pointer;
        font:
          750 0.78rem 'Avenir Next',
          sans-serif;
      }
      .trace-controls .primary {
        border-color: #24c2cd;
        background: #168a9b;
      }
      .trace-controls button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .trace-controls button:focus-visible,
      .language-tabs button:focus-visible,
      .guided-trace:focus-visible {
        outline: 3px solid #8de7ed;
        outline-offset: 2px;
      }
      .step-status {
        display: block;
        margin-top: 3px;
        color: #a9c6ce;
        font:
          650 0.68rem/1.35 'JetBrains Mono',
          monospace;
      }
      .execution-readout {
        padding: 7px 9px;
        border: 1px solid #426878;
        border-radius: 8px;
        background: #102c3c;
      }
      .execution-readout::before {
        content: '';
        float: left;
        width: 8px;
        height: 8px;
        margin: 6px 8px 0 0;
        border-radius: 50%;
        background: #f8c35a;
        box-shadow: 0 0 0 3px rgba(248, 195, 90, 0.14);
      }
      .execution-readout.complete::before {
        background: #71e1ba;
        box-shadow: 0 0 0 3px rgba(113, 225, 186, 0.14);
      }
      .execution-readout strong {
        overflow: hidden;
        font-size: 0.76rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .trace-context {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: center;
        gap: 8px 18px;
        padding: 9px 15px;
        border-bottom: 1px solid #315569;
        background: #143041;
      }
      .trace-context p {
        margin: 0;
        color: #f1fafa;
        font:
          700 0.78rem/1.5 'JetBrains Mono',
          monospace;
      }
      .trace-summary-values {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(130px, 0.55fr);
        align-items: end;
        gap: 14px;
        min-width: 0;
      }
      .trace-fixture-picker {
        display: grid;
        gap: 5px;
      }
      .trace-fixture-picker select {
        min-width: 0;
        min-height: 40px;
        width: 100%;
        padding: 7px 30px 7px 9px;
        border: 1px solid #4d7789;
        border-radius: 7px;
        color: #f1fafa;
        background: #102333;
        font:
          700 0.78rem 'Avenir Next',
          sans-serif;
      }
      .trace-fixture-picker select:focus-visible {
        outline: 3px solid #8de7ed;
        outline-offset: 2px;
      }
      .trace-context .fixture-explanation {
        grid-column: 1 / -1;
        color: #bdd2d9;
        font-family: 'Avenir Next', Avenir, sans-serif;
        font-weight: 650;
      }
      .trace-context .fixture-note {
        grid-column: 1/-1;
        padding: 8px 10px;
        border-left: 3px solid #f8c35a;
        color: #ffe6a8;
        background: #3d3526;
      }
      .language-tabs {
        display: flex;
        margin-top: 4px;
        padding: 2px;
        border: 1px solid #456c7b;
        border-radius: 8px;
        background: #102b3a;
      }
      .language-tabs button {
        min-width: 58px;
        min-height: 34px;
        border: 0;
        border-radius: 5px;
        color: #aac8cf;
        background: transparent;
        cursor: pointer;
        font:
          800 0.76rem 'Avenir Next',
          sans-serif;
        text-transform: capitalize;
      }
      .language-tabs button[aria-selected='true'] {
        color: #fff;
        background: #1a4556;
        box-shadow: inset 0 -2px #2cd4da;
      }
      .source-panel {
        min-width: 0;
        border-right: 1px solid #315569;
        background: #282c34;
      }
      .pane-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 15px;
        border-bottom: 1px solid #315569;
      }
      .pane-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .source-panel pre {
        height: 286px;
        margin: 0;
        padding: 12px 0;
        overflow: auto;
        font:
          13px/1.7 'JetBrains Mono',
          monospace;
      }
      .source-panel code > span {
        display: grid;
        grid-template-columns: 52px minmax(max-content, 1fr);
        min-height: 1.7em;
        padding-right: 14px;
        border-left: 4px solid transparent;
        color: #cadce3;
        white-space: pre;
      }
      .source-panel code > span.active {
        border-left-color: #61afef;
        color: #fff;
        background: #3a506c;
      }
      .source-panel code > span.unreachable {
        color: #71818a;
        opacity: 0.5;
      }
      .source-panel code > span.unreachable .line-code {
        text-decoration: line-through;
        text-decoration-color: rgba(151, 171, 179, 0.5);
      }
      .guided-trace[data-language='python'] .source-panel {
        background: #282a36;
      }
      .guided-trace[data-language='python'] .source-panel code > span.active {
        border-left-color: #ff79c6;
        background: #4b3e5d;
      }
      .guided-trace[data-language='go'] .source-panel {
        background: #292d3e;
      }
      .guided-trace[data-language='go'] .source-panel code > span.active {
        border-left-color: #89ddff;
        background: #3d4565;
      }
      .line-gutter {
        display: grid;
        grid-template-columns: 15px 1fr;
        align-items: center;
        padding-right: 9px;
        color: #6f91a1;
        text-align: right;
      }
      .line-gutter b {
        font-weight: 500;
      }
      .current-line-arrow {
        visibility: hidden;
        color: #82d8ff;
        font-size: 1rem;
        font-style: normal;
        font-weight: 900;
      }
      .source-line.active .current-line-arrow {
        visibility: visible;
      }
      .line-code {
        font-style: normal;
      }
      .variables {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-content: start;
        gap: 6px;
        margin: 0;
        padding: 0;
      }
      .variables div {
        min-width: 0;
        padding: 7px 8px;
        border: 1px solid #315569;
        border-radius: 7px;
        background: #143041;
      }
      .variables div.changed {
        border-color: #f8c35a;
      }
      .variables dt {
        color: #cda5f5;
        font:
          700 0.75rem 'JetBrains Mono',
          monospace;
      }
      .variables dt small {
        color: #91abb5;
      }
      .variables dt em {
        margin-left: 6px;
        color: #ffd17a;
        font:
          800 0.62rem 'Avenir Next',
          sans-serif;
        text-transform: uppercase;
      }
      .variables dd {
        margin: 5px 0 0;
        color: #fff;
        font:
          700 0.75rem 'JetBrains Mono',
          monospace;
        overflow-wrap: anywhere;
      }
      .terminal > span {
        color: #8fd9e3;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .state-view {
        background: #112b3b;
      }
      .state-row {
        display: grid;
        grid-template-columns: 62px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        margin-top: 9px;
      }
      .state-row > strong {
        color: #8bdfe7;
        font:
          800 0.7rem 'JetBrains Mono',
          monospace;
        text-transform: uppercase;
      }
      .state-cells {
        display: flex;
        overflow: auto;
      }
      .state-cells span {
        display: grid;
        flex: 0 0 auto;
        min-width: 46px;
        min-height: 43px;
        place-items: center;
        padding: 4px;
        border: 1px solid #456c7b;
        border-right: 0;
        color: #d9e8ed;
        background: #183344;
        font:
          700 0.82rem 'JetBrains Mono',
          monospace;
      }
      .state-cells span:first-child {
        border-radius: 6px 0 0 6px;
      }
      .state-cells span:last-child {
        border-right: 1px solid #456c7b;
        border-radius: 0 6px 6px 0;
      }
      .state-cells span.active,
      .state-cells span.changed {
        border-color: #24d2dd;
        color: #fff;
        background: #157082;
      }
      .state-cells span.boundary,
      .state-cells span.related {
        border-color: #f8c35a;
        color: #fff0cf;
        background: #6a4f25;
      }
      .state-cells span.range {
        background: #24546a;
      }
      .state-cells span.resolved {
        background: #22634f;
      }
      .state-cells span.discarded {
        opacity: 0.5;
      }
      .state-cells small {
        color: #a9c2ca;
        font-size: 0.6rem;
      }
      .terminal {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: baseline;
        gap: 12px;
        min-height: 48px;
        padding: 9px 15px;
        border-top: 1px solid #315569;
        color: #d6e8ec;
        background: #081b27;
      }
      .terminal p {
        margin: 0;
        font:
          700 0.75rem/1.45 'JetBrains Mono',
          monospace;
      }
      .terminal p::before {
        content: '> ';
        color: #71e1ba;
      }
      .trace-transcript {
        border-top: 1px solid #315569;
        background: #f8fcfd;
        color: #26384c;
      }
      .trace-transcript summary {
        padding: 14px 17px;
        cursor: pointer;
        color: #116f82;
        font-weight: 800;
      }
      .trace-transcript summary:focus-visible {
        outline: 3px solid #168ca5;
        outline-offset: -3px;
      }
      .trace-transcript > p,
      .trace-transcript ol {
        margin: 0 18px 16px;
      }
      .transcript-context {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin: 0 18px 14px;
      }
      .transcript-context p {
        margin: 0;
        padding: 9px 11px;
        border: 1px solid #d4e2e8;
        border-radius: 8px;
        background: #fff;
        overflow-wrap: anywhere;
      }
      .transcript-context strong {
        display: block;
        margin-bottom: 3px;
        color: #116f82;
        font-size: 0.7rem;
        text-transform: uppercase;
      }
      .trace-transcript ol {
        display: grid;
        gap: 10px;
        padding-left: 22px;
      }
      .trace-transcript li {
        padding-left: 4px;
      }
      .trace-transcript li span {
        display: block;
        margin-top: 3px;
        line-height: 1.5;
      }
      .boundary-status {
        margin: 0;
        padding: 8px 17px;
        color: #9fbcc4;
        background: #173346;
        font-size: 0.72rem;
      }
      .sr-status {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .ide-workspace {
        display: grid;
        grid-template-columns: minmax(0, 7fr) minmax(300px, 3fr);
        min-height: 520px;
      }
      .ide-workspace .source-panel {
        position: relative;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 520px;
        border-right: 1px solid #315569;
        border-bottom: 0;
      }
      .ide-workspace .source-panel pre {
        height: auto;
        min-height: 0;
        max-height: none;
      }
      .ide-workspace .source-line.executed:not(.active):not(.unreachable) {
        color: #b9ccd4;
      }
      .debugger-shell {
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr);
        min-width: 0;
        height: 520px;
        background: #0d2635;
      }
      .debugger-summary {
        position: relative;
        z-index: 2;
        border-bottom: 1px solid #315569;
        background: #17394b;
      }
      .debugger-summary header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 12px 6px;
      }
      .debugger-summary header span,
      .learning-view > span {
        color: #8fd9e3;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .debugger-summary header strong {
        color: #71e1ba;
        font-size: 0.68rem;
        text-transform: uppercase;
      }
      .debugger-summary header strong::before {
        content: '● ';
      }
      .debugger-summary header strong.returned {
        color: #ffd17a;
      }
      .debugger-summary dl {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
        margin: 0;
        padding: 0 12px 10px;
      }
      .debugger-summary dl div {
        min-width: 0;
        padding: 6px 7px;
        border: 1px solid #426878;
        border-radius: 6px;
        background: #102c3c;
      }
      .debugger-summary dl div.changed {
        border-color: #24d2dd;
        background: #17485a;
      }
      .debugger-summary dt {
        overflow: hidden;
        color: #9fbcc4;
        font-size: 0.58rem;
        font-weight: 800;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .debugger-summary dd {
        margin: 3px 0 0;
        display: -webkit-box;
        overflow: hidden;
        color: #fff;
        font:
          750 0.68rem 'JetBrains Mono',
          monospace;
        overflow-wrap: anywhere;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
      }
      .debugger-summary .summary-output {
        grid-column: 1 / -1;
      }
      .debugger-view-tabs {
        position: relative;
        z-index: 2;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        border-bottom: 1px solid #315569;
        background: #102333;
      }
      .debugger-view-tabs button {
        min-width: 0;
        min-height: 42px;
        padding: 8px 5px;
        border: 0;
        border-right: 1px solid #315569;
        border-bottom: 3px solid transparent;
        color: #9fbcc4;
        background: transparent;
        cursor: pointer;
        font:
          750 0.72rem 'Avenir Next',
          sans-serif;
      }
      .debugger-view-tabs button:last-child {
        border-right: 0;
      }
      .debugger-view-tabs button[aria-selected='true'] {
        border-bottom-color: #2cd4da;
        color: #fff;
        background: #1a4556;
      }
      .debugger-view-tabs button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .debugger-view-tabs button:focus-visible,
      .learning-view button:focus-visible {
        position: relative;
        z-index: 1;
        outline: 3px solid #8de7ed;
        outline-offset: -3px;
      }
      .debugger-detail-shell {
        position: relative;
        min-height: 0;
        overflow: hidden;
      }
      .debugger-panel {
        min-width: 0;
        height: 100%;
        overflow: auto;
        background: #0d2635;
      }
      .debugger-panel.overflowing {
        padding-bottom: 52px;
      }
      .learning-view {
        min-height: 100%;
        padding: 16px;
        color: #e6f4f6;
        background: #102b3a;
      }
      .learning-view h3 {
        margin: 8px 0 10px;
        color: #fff;
        font-size: 0.92rem;
        line-height: 1.45;
      }
      .learning-view p {
        margin: 7px 0 0;
        font-size: 0.82rem;
        line-height: 1.55;
      }
      .why-view {
        border-left: 4px solid #27c2d0;
        background: linear-gradient(135deg, #153849, #102b3a);
      }
      .learning-detail {
        padding: 10px;
        border-radius: 8px;
        color: #d8ebee;
        background: #173f52;
      }
      .prediction-options {
        display: grid;
        gap: 7px;
        margin-top: 12px;
      }
      .prediction-options label {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        padding: 9px;
        border: 1px solid #426878;
        border-radius: 8px;
        color: #dbecef;
        cursor: pointer;
        font-size: 0.78rem;
        line-height: 1.45;
      }
      .prediction-options label.selected,
      .prediction-options label:has(input:focus-visible) {
        border-color: #2cd4da;
        background: #17485a;
      }
      .prediction-options input {
        flex: 0 0 auto;
        width: 17px;
        height: 17px;
        margin: 1px 0 0;
        accent-color: #2cd4da;
      }
      .learning-action,
      .complexity-actions button {
        min-height: 36px;
        margin-top: 11px;
        padding: 7px 11px;
        border: 1px solid #24c2cd;
        border-radius: 7px;
        color: #fff;
        background: #168a9b;
        cursor: pointer;
        font:
          750 0.74rem 'Avenir Next',
          sans-serif;
      }
      .learning-action:disabled,
      .complexity-actions button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .prediction-feedback {
        padding: 10px;
        border-left: 4px solid #71e1ba;
        border-radius: 0 8px 8px 0;
        background: #102c3c;
      }
      .prediction-feedback strong {
        color: #71e1ba;
      }
      .complexity-questions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        margin-top: 12px;
      }
      .complexity-questions fieldset {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
        min-width: 0;
        margin: 0;
        padding: 9px;
        border: 1px solid #527789;
        border-radius: 8px;
      }
      .complexity-questions legend {
        padding: 0 5px;
        color: #8fd9e3;
        font-size: 0.7rem;
        font-weight: 800;
        text-transform: uppercase;
      }
      .complexity-questions label {
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 31px;
        padding: 4px 6px;
        border-radius: 6px;
        color: #edf9fa;
        cursor: pointer;
        font:
          700 0.75rem 'JetBrains Mono',
          monospace;
      }
      .complexity-questions label:has(input:checked) {
        background: #24546a;
      }
      .complexity-questions input {
        width: 17px;
        height: 17px;
        margin: 0;
        accent-color: #2cd4da;
      }
      .complexity-questions input:focus-visible {
        outline: 3px solid #8de7ed;
        outline-offset: 2px;
      }
      .complexity-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .complexity-feedback {
        margin-top: 11px;
        padding: 10px;
        border-left: 4px solid #71e1ba;
        border-radius: 0 8px 8px 0;
        background: #102c3c;
      }
      .complexity-feedback > strong {
        color: #71e1ba;
      }
      .complexity-feedback p {
        margin-top: 5px;
      }
      .complexity-feedback .complexity-caveat {
        color: #ffd991;
      }
      .debugger-more {
        pointer-events: none;
        position: absolute;
        z-index: 3;
        right: 0;
        bottom: 0;
        left: 0;
        display: grid;
        min-height: 58px;
        place-items: end center;
        padding-bottom: 8px;
        background: linear-gradient(transparent, rgba(8, 27, 39, 0.98) 70%);
      }
      .debugger-more button {
        pointer-events: auto;
        display: grid;
        width: 38px;
        height: 38px;
        place-items: center;
        border: 1px solid #69c8d2;
        border-radius: 50%;
        color: #edf9fa;
        background: #116f82;
        box-shadow: 0 4px 14px rgba(4, 18, 27, 0.42);
        cursor: pointer;
      }
      .debugger-more button:focus-visible {
        outline: 3px solid #8de7ed;
        outline-offset: 2px;
      }
      .debugger-more span {
        transform: translateY(-2px);
        font-size: 1.5rem;
        line-height: 1;
      }
      .variable-inspector,
      .debugger-panel .state-view {
        padding: 11px 12px;
        border-bottom: 1px solid #315569;
      }
      .variable-inspector h3,
      .debugger-panel .state-view h3 {
        margin: 0 0 7px;
        color: #8fd9e3;
        font-size: 0.68rem;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .debugger-panel .variables {
        grid-template-columns: 1fr;
        gap: 0;
      }
      .debugger-panel .variables div {
        display: grid;
        grid-template-columns: minmax(105px, 0.85fr) minmax(0, 1.15fr);
        align-items: baseline;
        gap: 10px;
        padding: 7px 8px;
        border: 0;
        border-bottom: 1px solid #294a5d;
        border-left: 3px solid transparent;
        border-radius: 0;
        background: transparent;
      }
      .debugger-panel .variables div.changed {
        border-left-color: #24d2dd;
        background: #173f52;
      }
      .debugger-panel .variables dd {
        margin: 0;
        text-align: right;
      }
      .debugger-panel .state-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      .debugger-panel .state-cells {
        padding-bottom: 3px;
      }
      .debugger-output {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 14px;
        padding: 11px 13px;
        border-bottom: 1px solid #315569;
        background: #112b3b;
      }
      .debugger-output span {
        color: #9fbcc4;
        font-size: 0.66rem;
        font-weight: 800;
        text-transform: uppercase;
      }
      .debugger-output strong {
        color: #fff;
        font:
          800 0.78rem 'JetBrains Mono',
          monospace;
        text-align: right;
      }
      .debugger-invariant {
        margin: 0;
        padding: 10px 13px;
        color: #bad0d7;
        font-size: 0.72rem;
        line-height: 1.45;
      }
      .debugger-panel .terminal {
        grid-template-columns: 1fr;
        gap: 4px;
      }
      @media (max-width: 1060px) {
        .trace-toolbar {
          grid-template-columns: minmax(150px, 0.8fr) minmax(180px, 1fr) auto auto;
        }
        .execution-readout {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: baseline;
          gap: 8px;
        }
        .execution-readout::before {
          display: none;
        }
        .execution-readout strong,
        .step-status {
          margin: 0;
        }
      }
      @media (max-width: 850px) {
        .trace-toolbar {
          top: auto;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .language-control,
        .trace-controls {
          align-self: end;
        }
        .execution-readout {
          grid-column: 1 / -1;
        }
        .source-panel {
          border-right: 0;
          border-bottom: 1px solid #315569;
        }
        .source-panel pre {
          height: auto;
          min-height: 0;
          max-height: none;
        }
        .variables {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 560px) {
        .trace-toolbar {
          position: static;
          grid-template-columns: 1fr;
        }
        .execution-readout {
          grid-column: auto;
          grid-template-columns: 1fr;
          gap: 2px;
        }
        .toolbar-brand {
          display: none;
        }
        .trace-context {
          grid-template-columns: 1fr;
        }
        .trace-summary-values,
        .complexity-questions {
          grid-template-columns: 1fr;
        }
        .trace-context .fixture-explanation {
          grid-column: auto;
        }
        .trace-controls {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
        }
        .variables {
          grid-template-columns: 1fr;
        }
        .terminal {
          grid-template-columns: 1fr;
          gap: 4px;
        }
        .state-row {
          grid-template-columns: 1fr;
        }
        .transcript-context {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 850px) {
        .ide-workspace {
          display: grid;
          grid-template-areas: none;
          grid-template-columns: 1fr;
          min-height: 0;
        }
        .ide-workspace .source-panel {
          min-height: 360px;
          border-right: 0;
          border-bottom: 1px solid #315569;
        }
        .debugger-shell,
        .debugger-panel {
          height: auto;
          max-height: none;
        }
        .debugger-detail-shell {
          overflow: visible;
        }
        .debugger-panel.overflowing {
          padding-bottom: 0;
        }
        .debugger-panel .variables {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .debugger-panel .variables div {
          display: block;
          border: 1px solid #315569;
          border-left: 3px solid transparent;
          border-radius: 7px;
          background: #143041;
        }
        .debugger-panel .variables div.changed {
          border-color: #24d2dd;
        }
        .debugger-panel .variables dd {
          margin-top: 4px;
          text-align: left;
        }
      }
      @media (max-width: 560px) {
        .ide-workspace .source-panel {
          min-height: 330px;
        }
        .pane-actions > span {
          display: none;
        }
        .debugger-panel .variables {
          grid-template-columns: 1fr;
        }
        .debugger-summary dl {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .debugger-view-tabs button {
          min-height: 44px;
          font-size: 0.68rem;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .trace-toolbar {
          backdrop-filter: none;
        }
        * {
          scroll-behavior: auto !important;
          transition: none !important;
        }
      }
      @media (forced-colors: active) {
        .guided-trace,
        .trace-toolbar,
        .trace-context,
        .source-panel,
        .debugger-shell,
        .debugger-summary,
        .debugger-view-tabs,
        .debugger-detail-shell,
        .debugger-panel,
        .learning-view,
        .debugger-output,
        .terminal,
        .state-view,
        .trace-transcript,
        .trace-transcript li {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .trace-controls button,
        .language-tabs button,
        .trace-fixture-picker select,
        .debugger-view-tabs button,
        .learning-view button,
        .debugger-more button {
          border: 1px solid ButtonText;
          color: ButtonText;
          background: ButtonFace;
        }
        .language-tabs button[aria-selected='true'] {
          border: 3px solid Highlight;
          color: HighlightText;
          background: Highlight;
        }
        .source-panel code > span[aria-current='step'],
        .source-panel code > span.unreachable,
        .state-cells span:not([class='']) {
          outline: 3px solid Highlight;
          outline-offset: -3px;
        }
        .trace-controls button:focus-visible,
        .language-tabs button:focus-visible,
        .guided-trace:focus-visible,
        summary:focus-visible,
        pre:focus-visible {
          outline-color: Highlight;
        }
      }
    `,
  ],
})
export class GuidedAlgorithmTrace {
  readonly problem = input.required<PatternProblemV1>();
  readonly selectedFixture = input.required<PatternProblemFixture>();
  readonly fixtureChange = output<PatternProblemFixture>();
  protected readonly language = signal<PatternLanguage>('java');
  protected readonly stepIndex = signal(0);
  protected readonly announcement = signal('');
  protected readonly activeView = signal<GuidedDebuggerView>('debugger');
  protected readonly selectedPrediction = signal('');
  protected readonly predictionSubmitted = signal(false);
  protected readonly selectedTimeComplexity = signal('');
  protected readonly selectedSpaceComplexity = signal('');
  protected readonly complexityAnswerMode = signal<'submitted' | 'revealed' | null>(null);
  protected readonly debuggerOverflow = signal(false);
  protected readonly debuggerAtBottom = signal(true);
  private readonly debuggerPanel = viewChild<ElementRef<HTMLElement>>('debuggerPanel');
  protected readonly activeTrace = computed(() => {
    const problem = this.problem();
    return (
      [problem.trace, ...(problem.fixtureTraces ?? [])].find(
        (trace) => trace.fixtureId === this.selectedFixture().id,
      ) ?? problem.trace
    );
  });
  protected readonly guidedFixtures = computed(() => {
    const tracedIds = new Set(
      [this.problem().trace, ...(this.problem().fixtureTraces ?? [])].map(
        (trace) => trace.fixtureId,
      ),
    );
    return this.problem().fixtures.filter((fixture) => tracedIds.has(fixture.id));
  });
  protected readonly selectedFixtureIndex = computed(() =>
    Math.max(
      0,
      this.guidedFixtures().findIndex(({ id }) => id === this.selectedFixture().id),
    ),
  );
  protected readonly events = computed(() => this.activeTrace().events);
  protected readonly event = computed(() => this.events()[this.stepIndex()] ?? this.events()[0]);
  protected readonly isComplete = computed(() => this.stepIndex() === this.events().length - 1);
  protected readonly source = computed(
    () =>
      this.problem().implementations.find((item) => item.language === this.language()) ??
      this.problem().implementations[0],
  );
  protected readonly sourceText = computed(() =>
    this.source()
      .lines.map((line) => line.text)
      .join('\n'),
  );
  protected readonly activeAnchor = computed(() => this.event().sourceAnchor[this.language()]);
  protected readonly executedAnchors = computed(
    () =>
      new Set(
        this.events()
          .slice(0, this.stepIndex() + 1)
          .map((event) => event.sourceAnchor[this.language()]),
      ),
  );
  protected readonly visibleVariables = computed<GuidedTraceVariable[]>(() => {
    const definitions = new Map<string, GuidedTraceVariable>();
    for (const traceEvent of this.events()) {
      for (const variable of traceEvent.variables) {
        const name = this.variableDisplayName(variable.name);
        if (!name || definitions.has(name)) continue;
        definitions.set(name, { ...variable, name, value: '—', changed: false });
      }
    }

    const values = new Map<string, GuidedTraceVariable>();
    for (const traceEvent of this.events().slice(0, this.stepIndex() + 1)) {
      for (const variable of traceEvent.variables) {
        const name = this.variableDisplayName(variable.name);
        if (name) values.set(name, { ...variable, name });
      }
    }
    const changed = new Set<string>();
    for (const variable of this.event().variables) {
      const name = this.variableDisplayName(variable.name);
      if (name && variable.changed) changed.add(name);
    }

    return [...definitions.values()].map((definition) => {
      const value = values.get(definition.name);
      return {
        name: definition.name,
        type: value?.type ?? definition.type,
        value: value?.value ?? '—',
        changed: changed.has(definition.name),
      };
    });
  });
  protected readonly summaryVariables = computed(() => {
    const available = this.visibleVariables().filter(({ value }) => value !== '—');
    const priority = (variable: GuidedTraceVariable): number => {
      if (variable.name === 'returned') return 0;
      if (variable.changed) return 1;
      if (/^(seen|frequency|count|target)$/i.test(variable.name)) return 2;
      if (/^(index|position|value|need|lookup)$/i.test(variable.name)) return 3;
      return 4;
    };
    return [...available].sort((left, right) => priority(left) - priority(right)).slice(0, 4);
  });
  protected readonly activeViewLabel = computed(
    () =>
      ({
        debugger: 'Debugger details',
        why: 'Why this line exists',
        predict: 'Predict the next step',
        complexity: 'Complexity prediction',
      })[this.activeView()],
  );
  protected readonly activeLineSummary = computed(() => {
    const index = this.source().lines.findIndex(({ id }) => id === this.activeAnchor());
    const line = this.source().lines[index];
    return line
      ? `Current instruction is line ${index + 1}: ${line.text}`
      : `Current instruction: ${this.event().label}`;
  });
  protected readonly executionStatus = computed(() =>
    this.isComplete()
      ? this.event().result
        ? `Returned ${this.event().result}`
        : 'Trace complete'
      : `Paused · ${this.event().label}`,
  );
  protected readonly predictionPrompt = computed(() => {
    const next = this.events()[this.stepIndex() + 1];
    if (!next) return 'Execution has finished; there is no next instruction to predict.';
    const changedNames = [
      ...new Set(
        next.variables
          .filter((variable) => variable.changed)
          .map((variable) => this.variableDisplayName(variable.name))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    const state = changedNames.length ? changedNames.join(', ') : 'the live state';
    return `Which source line executes next? Predict how ${state} will change and whether execution continues or returns.`;
  });
  protected readonly predictionOptions = computed(() => {
    const next = this.events()[this.stepIndex() + 1];
    if (!next) return [];
    const changedNames = [
      ...new Set(
        next.variables
          .filter((variable) => variable.changed)
          .map((variable) => this.variableDisplayName(variable.name))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    const change = changedNames.length ? ` update ${changedNames.join(', ')}` : ' preserve state';
    return [
      { id: 'next', label: `Execute “${next.label}” and${change}.` },
      { id: 'skip', label: 'Skip the next traced instruction and keep the current state.' },
      { id: 'restart', label: 'Restart the algorithm from its initial state.' },
    ];
  });
  protected readonly predictionIsCorrect = computed(
    () => this.predictionSubmitted() && this.selectedPrediction() === 'next',
  );
  protected readonly predictionFeedback = computed(() => {
    const next = this.events()[this.stepIndex() + 1];
    if (!next) return 'Execution has already finished.';
    return `The next traced instruction is “${next.label}”. ${next.what}`;
  });
  protected readonly timeComplexityOptions = computed(() =>
    this.complexityOptions(this.problem().complexity.time, [
      'O(1)',
      'O(log n)',
      'O(n) expected',
      'O(n²)',
    ]),
  );
  protected readonly spaceComplexityOptions = computed(() =>
    this.complexityOptions(this.problem().complexity.space, ['O(1)', 'O(log n)', 'O(k)', 'O(n)']),
  );
  protected readonly complexityRevealed = computed(() => this.complexityAnswerMode() !== null);
  protected readonly complexityFeedbackHeading = computed(() => {
    if (this.complexityAnswerMode() === 'revealed') return 'Answer revealed';
    const correct =
      this.selectedTimeComplexity() === this.problem().complexity.time &&
      this.selectedSpaceComplexity() === this.problem().complexity.space;
    return correct ? 'Correct: both bounds match' : 'Review these bounds';
  });
  protected readonly terminalMessage = computed(() => {
    if (this.isComplete() && this.event().result) {
      return `Execution returned ${this.event().result}. Next is disabled because the successful return terminated execution.`;
    }
    if (this.isComplete()) {
      return 'Execution reached the final traced instruction. Next is disabled because no later instruction is available.';
    }
    return `Execution paused ${this.event().timing} ${this.event().label}. Select Next to execute the next meaningful step.`;
  });
  protected readonly solutionFileName = computed(
    () => ({ java: 'Solution.java', python: 'solution.py', go: 'solution.go' })[this.language()],
  );
  protected readonly tracedFixture = computed(
    () =>
      this.problem().fixtures.find((fixture) => fixture.id === this.activeTrace().fixtureId) ??
      this.problem().fixtures[0],
  );

  constructor() {
    let previousProblem = '';
    let previousFixture = '';
    effect(() => {
      const problemId = this.problem().id;
      const fixtureId = this.selectedFixture().id;
      if (previousProblem && previousProblem !== problemId) {
        this.stepIndex.set(0);
        this.activeView.set('debugger');
        this.resetPrediction();
        this.resetComplexity();
        this.announcement.set(`${this.problem().title} selected. Trace reset to step 1.`);
      } else if (previousFixture && previousFixture !== fixtureId) {
        this.stepIndex.set(0);
        this.activeView.set('debugger');
        this.resetPrediction();
        this.resetComplexity();
        const selected = this.selectedFixture();
        const traced = this.tracedFixture();
        this.announcement.set(
          selected.id === traced.id
            ? `${selected.label} selected. Trace reset to step 1.`
            : `${selected.label} selected for independent dry-run practice. Guided trace reset to ${traced.label}, step 1.`,
        );
      }
      previousProblem = problemId;
      previousFixture = fixtureId;
    });
    effect(() => {
      this.stepIndex();
      this.events();
      this.activeView();
      const panel = this.debuggerPanel()?.nativeElement;
      if (panel)
        queueMicrotask(() => {
          panel.scrollTop = 0;
          this.measureDebuggerOverflow(panel);
        });
    });
  }

  protected previous(): void {
    this.setStep(this.stepIndex() - 1);
  }

  protected chooseFixture(value: string): void {
    const fixture = this.guidedFixtures()[Number(value)];
    if (fixture) this.fixtureChange.emit(fixture);
  }
  protected next(): void {
    this.setStep(this.stepIndex() + 1);
  }
  protected reset(): void {
    this.stepIndex.set(0);
    this.activeView.set('debugger');
    this.resetPrediction();
    this.resetComplexity();
    this.announcement.set('Trace reset to step 1.');
  }

  protected selectLanguage(value: string): void {
    this.language.set(value as PatternLanguage);
    this.activeView.set('debugger');
    this.resetPrediction();
    this.resetComplexity();
    this.announcement.set(
      `${value} selected. Still on ${this.event().label}. ${this.assistiveStepSummary()}`,
    );
  }

  protected moveLanguageTab(event: KeyboardEvent, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const count = this.problem().implementations.length;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % count
            : (index - 1 + count) % count;
    const language = this.problem().implementations[next].language as PatternLanguage;
    this.selectLanguage(language);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }

  protected handleShortcut(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.activeView() !== 'debugger') {
      event.preventDefault();
      this.selectView('debugger');
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('.debugger-panel')) return;
    if (target.matches('button, select, summary, a, pre, input, textarea')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previous();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    }
    if (event.key === 'Home') {
      event.preventDefault();
      this.reset();
    }
  }

  protected cellClasses(cell: GuidedTraceCell): string {
    return cell.states?.join(' ') ?? '';
  }

  protected selectView(view: GuidedDebuggerView, event?: Event): void {
    if (view === 'predict' && this.isComplete()) return;
    this.activeView.set(view);
    const panel = this.debuggerPanel()?.nativeElement;
    if (panel) panel.scrollTop = 0;
    this.announcement.set(
      `${this.activeViewLabel()} opened. Trace remains on step ${this.stepIndex() + 1}.`,
    );
    (event?.currentTarget as HTMLElement | null)?.focus();
  }

  protected moveViewTab(event: KeyboardEvent, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const views: GuidedDebuggerView[] = ['debugger', 'why', 'predict', 'complexity'];
    const enabled = views.filter((view) => view !== 'predict' || !this.isComplete());
    const current = enabled.indexOf(views[index]);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabled.length - 1
          : event.key === 'ArrowRight'
            ? (current + 1) % enabled.length
            : (current - 1 + enabled.length) % enabled.length;
    const view = enabled[nextIndex];
    this.selectView(view);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLButtonElement>(`button:nth-child(${views.indexOf(view) + 1})`)
      ?.focus();
  }

  protected selectPrediction(value: string): void {
    this.selectedPrediction.set(value);
    this.predictionSubmitted.set(false);
  }

  protected submitPrediction(): void {
    if (!this.selectedPrediction()) return;
    this.predictionSubmitted.set(true);
  }

  protected selectComplexity(kind: 'time' | 'space', value: string): void {
    if (kind === 'time') this.selectedTimeComplexity.set(value);
    else this.selectedSpaceComplexity.set(value);
    this.complexityAnswerMode.set(null);
  }

  protected submitComplexity(): void {
    if (!this.selectedTimeComplexity() || !this.selectedSpaceComplexity()) return;
    this.complexityAnswerMode.set('submitted');
  }

  protected revealComplexity(): void {
    this.complexityAnswerMode.set('revealed');
  }

  protected updateDebuggerOverflow(event: Event): void {
    this.measureDebuggerOverflow((event.currentTarget as HTMLElement) ?? undefined);
  }

  protected measureDebuggerOverflow(panel = this.debuggerPanel()?.nativeElement): void {
    if (!panel) return;
    const reservedSpace = this.debuggerOverflow() ? 52 : 0;
    const overflowing = panel.scrollHeight - reservedSpace > panel.clientHeight + 2;
    this.debuggerOverflow.set(overflowing);
    this.debuggerAtBottom.set(
      !overflowing || panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2,
    );
  }

  protected showMoreDebuggerState(): void {
    const panel = this.debuggerPanel()?.nativeElement;
    if (!panel) return;
    panel.scrollBy({ top: Math.max(180, panel.clientHeight * 0.65), behavior: 'smooth' });
  }

  protected isExecuted(lineId: string): boolean {
    return this.executedAnchors().has(lineId);
  }

  protected isUnreachable(lineIndex: number): boolean {
    if (!this.isComplete() || !this.event().result) return false;
    const activeIndex = this.source().lines.findIndex(({ id }) => id === this.activeAnchor());
    return activeIndex >= 0 && lineIndex > activeIndex;
  }

  protected sourceLineLabel(id: string, lineIndex: number, text: string): string {
    if (id === this.activeAnchor()) return `Line ${lineIndex + 1}, current instruction: ${text}`;
    if (this.isUnreachable(lineIndex))
      return `Line ${lineIndex + 1}, not executed after return: ${text}`;
    return `Line ${lineIndex + 1}: ${text}`;
  }

  protected cellLabel(cell: GuidedTraceCell, index: number): string {
    const states = cell.states?.length ? `, ${cell.states.join(', ')}` : '';
    return `Position ${index}, value ${cell.value}${cell.note ? `, ${cell.note}` : ''}${states}`;
  }

  protected transcriptState(variables: { name: string; value: string }[]): string {
    return variables.map((variable) => `${variable.name} = ${variable.value}`).join('; ');
  }

  protected boundaryStatus(): string {
    if (this.isComplete() && this.event().result) return this.terminalMessage();
    if (this.stepIndex() === 0) return 'At the first step. Previous is unavailable.';
    if (this.isComplete()) return 'Trace complete. Next is unavailable.';
    return 'Previous, Next, and Reset are available. Focus the trace region and use Left Arrow, Right Arrow, or Home as shortcuts.';
  }

  private assistiveStepSummary(): string {
    const rows = this.event()
      .rows.map(
        (row) =>
          `${row.label}: ${row.cells.map((cell, index) => this.cellLabel(cell, index)).join('; ')}`,
      )
      .join('. ');
    return `Step ${this.stepIndex() + 1} of ${this.events().length}: ${this.event().phase}, ${this.event().label}. ${this.activeLineSummary()}. Variables: ${this.transcriptState(this.event().variables)}. Data state: ${rows}. ${this.terminalMessage()}`;
  }

  private variableDisplayName(name: string): string | null {
    if (/^insertion$|^termination$/i.test(name)) return null;
    if (/^map (before lookup|after insertion)$/i.test(name)) return 'seen';
    if (/^lookup result$/i.test(name)) return 'lookup';
    if (/^result$/i.test(name)) return 'returned';
    return name;
  }

  private complexityOptions(correct: string, distractors: string[]): string[] {
    return [...new Set([...distractors, correct])];
  }

  private resetComplexity(): void {
    this.selectedTimeComplexity.set('');
    this.selectedSpaceComplexity.set('');
    this.complexityAnswerMode.set(null);
  }

  private resetPrediction(): void {
    this.selectedPrediction.set('');
    this.predictionSubmitted.set(false);
  }

  private setStep(next: number): void {
    const index = Math.max(0, Math.min(next, this.events().length - 1));
    if (index === this.stepIndex()) return;
    this.stepIndex.set(index);
    this.resetPrediction();
    if (index === this.events().length - 1 && this.activeView() === 'predict') {
      this.activeView.set('debugger');
    }
    this.announcement.set(this.assistiveStepSummary());
  }
}
