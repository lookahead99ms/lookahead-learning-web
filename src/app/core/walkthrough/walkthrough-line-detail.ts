import { Component, computed, input } from '@angular/core';
import {
  DsaProblemFixtureV2,
  PatternLanguage,
  PatternProblemFixture,
  PatternProblemV1,
} from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { StudioEssentialState } from '../focus-studio/studio-essential-state';
import { StudioInspector } from '../focus-studio/studio-inspector';

/**
 * Every line mode, under the value strip: the former guided debugger's state inspector (the
 * essential and semantic state), every recorded local, and the full line transcript, each
 * folded until asked for so the player shows each fact once.
 */
@Component({
  selector: 'app-walkthrough-line-detail',
  imports: [StudioEssentialState, StudioInspector],
  template: `<details class="line-detail">
      <summary>State inspector and all recorded locals</summary>
      <div class="body">
        <!-- The player's three type sizes (13, 14, 16 px); the studio's own sizes stay elsewhere. -->
        <app-studio-essential-state
          scale="player"
          [problem]="problem()"
          [fixture]="dsaFixture()"
          [snapshot]="snapshot()"
          [language]="language()"
        />
        <app-studio-inspector
          scale="player"
          [problem]="problem()"
          [fixture]="dsaFixture()"
          [snapshot]="snapshot()"
          [language]="language()"
        />
      </div>
    </details>
    <details class="line-detail">
      <summary>Read every line as text</summary>
      <div class="body">
        <p><b>Invariant:</b> {{ invariant() }}</p>
        <ol>
          @for (line of transcript(); track $index) {
            <li [attr.aria-current]="$index === snapshot().step ? 'step' : null">
              <b>{{ line.label }}</b> {{ line.what }}
            </li>
          }
        </ol>
      </div>
    </details>`,
  styles: `
    :host {
      display: grid;
      gap: 0;
      min-width: 0;
      border-top: 1px solid var(--line);
    }
    .line-detail + .line-detail {
      border-top: 1px solid var(--line);
    }
    summary {
      cursor: pointer;
      padding: 8px 14px;
      font-size: var(--wt-fs-s, 13px);
      font-weight: 700;
      color: var(--text-subtle);
    }
    summary:focus-visible {
      outline: 3px solid var(--accent-focus, var(--accent-strong));
      outline-offset: -3px;
    }
    .body {
      display: grid;
      gap: 10px;
      padding: 0 14px 12px;
      min-width: 0;
      font-size: var(--wt-fs-s, 13px);
    }
    .body p {
      margin: 0;
    }
    ol {
      margin: 0;
      padding-left: 22px;
      display: grid;
      gap: 4px;
    }
    li[aria-current='step'] {
      font-weight: 700;
    }
    li b {
      font-family: var(--font-mono, ui-monospace, monospace);
      font-weight: 600;
    }
  `,
})
export class WalkthroughLineDetail {
  readonly problem = input.required<PatternProblemV1>();
  readonly fixture = input.required<PatternProblemFixture>();
  readonly snapshot = input.required<TraceSnapshot>();
  readonly language = input.required<PatternLanguage>();
  protected readonly dsaFixture = computed(() => this.fixture() as DsaProblemFixtureV2);
  protected readonly invariant = computed(() => {
    const problem = this.problem();
    const trace = [problem.trace, ...(problem.fixtureTraces ?? [])].find(
      (item) => item?.fixtureId === this.fixture().id,
    );
    return trace?.invariant || problem.invariantAdaptation || problem.trace?.invariant || '';
  });
  protected readonly transcript = computed(() => {
    const language = this.language();
    const lines =
      this.problem().implementations.find((item) => item.language === language)?.lines ?? [];
    return this.snapshot().events.map((event) => {
      const index = lines.findIndex((line) => line.id === event.sourceAnchor[language]);
      return {
        label: index >= 0 ? `${event.phase} · line ${index + 1}: ${lines[index].text.trim()}` : event.label,
        what: /^Execute .+ (at source line \d+:|in the selected implementation\.)/u.test(event.what)
          ? event.result !== undefined
            ? `Returns ${event.result}.`
            : ''
          : event.what,
      };
    });
  });
}
