import {
  Component,
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DsaProblemV2, PatternLanguage } from '../../content/content.models';
import { FocusStudioPattern } from '../../content/focus-studio-pilot';
import { traceSnapshot } from '../guided-algorithm-trace/trace-model';
import { TracePlayer } from '../guided-algorithm-trace/trace-player';
import { WalkthroughPlayer } from '../walkthrough/walkthrough-player';
import { WalkthroughLineDetail } from '../walkthrough/walkthrough-line-detail';
import {
  WalkthroughApproach,
  WalkthroughValue,
  codeLines,
  exampleLabel,
  firstSentence,
  lineView,
  referenceSource,
} from '../walkthrough/walkthrough.model';
import { StudioDiagram } from './studio-diagram';
import { StudioPatternDiagram } from './studio-pattern-diagram';
import { conceptualFrames, linkedWalkthrough, walkthroughKind } from './studio-walkthrough';

/**
 * The conceptual walkthrough's position per problem and example. It outlives the walkthrough,
 * which is destroyed on every tab switch, so Approach and back returns to the same step (the
 * recorded-line position lives in the studio state instead).
 */
@Injectable({ providedIn: 'root' })
export class ConceptPositions {
  private readonly positions = signal<Record<string, number>>({});
  get(problemId: string, fixtureId: string): number {
    return this.positions()[`${problemId}/${fixtureId}`] ?? 0;
  }
  set(problemId: string, fixtureId: string, step: number): void {
    this.positions.update((positions) => ({ ...positions, [`${problemId}/${fixtureId}`]: step }));
  }
}

/** Step interval for the fallback's Play, the same as the recorded line trace's. */
const STEP_MS = 1000;

/**
 * The Visual walkthrough when a problem's story fails to load: the shared conceptual and
 * recorded-state diagrams in the same "Code beside" player as the story. Steps are the
 * conceptual frames (Container With Most Water, fixed-size window) or the recorded lines that
 * change state; "Every line" (the old "Open guided debugger") steps every recorded line, with
 * the diagram linked to it. The studio owns the example, language, line position and switch.
 */
@Component({
  selector: 'app-studio-fallback-walkthrough',
  imports: [WalkthroughPlayer, WalkthroughLineDetail, StudioDiagram, StudioPatternDiagram],
  template: `<app-walkthrough-player
    [examples]="examples()"
    [example]="fixture().id"
    [language]="language()"
    [approach]="approach()"
    [index]="index()"
    [count]="count()"
    [playing]="player.playing()"
    [everyLine]="lines()"
    [everyLineAvailable]="lineAvailable()"
    [caption]="caption()"
    [captionLine]="captionLine()"
    [captionDetail]="captionDetail()"
    [values]="values()"
    [valuesNote]="valuesNote()"
    [code]="code()"
    [source]="source()"
    (exampleChange)="choose($event)"
    (languageChange)="languageChange.emit($event)"
    (everyLineChange)="switchLines($event)"
    (step)="go($event)"
    (toggle)="player.toggle()"
  >
    <div walkthroughStage class="fallback-stage">
      @if (frame(); as current) {
        <app-studio-pattern-diagram
          [problem]="problem()"
          [fixture]="fixture()"
          [frame]="current"
          [linked]="lines()"
          [compact]="true"
          (fixtureChange)="choose($event)"
        />
      } @else {
        <app-studio-diagram
          [problem]="problem()"
          [pattern]="pattern()"
          [fixture]="fixture()"
          [language]="language()"
          [snapshot]="snapshot()"
          [linked]="lines()"
          [compact]="true"
          (fixtureChange)="choose($event)"
        />
      }
    </div>
    @if (lines() && snapshot().event) {
      <app-walkthrough-line-detail
        walkthroughExtra
        [problem]="problem()"
        [fixture]="fixture()"
        [snapshot]="snapshot()"
        [language]="language()"
      />
    }
  </app-walkthrough-player>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .fallback-stage {
      min-width: 0;
    }
  `,
})
export class StudioFallbackWalkthrough {
  readonly problem = input.required<DsaProblemV2>();
  readonly pattern = input<FocusStudioPattern>('generic');
  readonly fixtureId = input.required<string>();
  readonly language = input.required<PatternLanguage>();
  /** The studio's recorded-line position for this example and language. */
  readonly step = input(0);
  readonly everyLine = input(false);
  readonly fixtureChange = output<string>();
  readonly languageChange = output<PatternLanguage>();
  readonly everyLineChange = output<boolean>();
  readonly stepChange = output<number>();

  protected readonly fixture = computed(
    () =>
      this.problem().fixtures.find((item) => item.id === this.fixtureId()) ?? this.problem().fixtures[0],
  );
  protected readonly examples = computed(() =>
    this.problem().fixtures.map((item) => ({ id: item.id, label: exampleLabel(item) })),
  );
  protected readonly snapshot = computed(() =>
    traceSnapshot(this.problem(), this.fixture().id, this.language(), this.step()),
  );
  protected readonly lineAvailable = computed(() => this.snapshot().events.length > 0);
  /** Every line is on (and has something to step through). */
  protected readonly lines = computed(() => this.everyLine() && this.lineAvailable());
  private readonly kind = computed(() => walkthroughKind(this.problem().id));
  private readonly conceptPositions = inject(ConceptPositions);
  private readonly frames = computed(() => {
    const kind = this.kind();
    return kind ? conceptualFrames(kind, this.fixture()) : [];
  });
  private readonly conceptual = computed(() => !!this.kind() && !this.lines());
  /** Steps without frames: the recorded lines that change state, plus the first and the last. */
  private readonly changes = computed(() => {
    const events = this.snapshot().events;
    return events.flatMap((event, index) =>
      this.problem().id === 'algorithmic-meeting-rooms' ||
      index === 0 ||
      index === events.length - 1 ||
      event.stateUnavailable ||
      event.variables.some((variable) => variable.changed) ||
      event.rows.length
        ? [index]
        : [],
    );
  });
  protected readonly index = computed(() => {
    if (this.lines()) return this.snapshot().step;
    if (this.conceptual())
      return Math.min(
        this.conceptPositions.get(this.problem().id, this.fixture().id),
        Math.max(0, this.frames().length - 1),
      );
    return Math.max(0, this.changes().filter((step) => step <= this.snapshot().step).length - 1);
  });
  protected readonly count = computed(() =>
    Math.max(
      1,
      this.lines() ? this.snapshot().events.length : this.conceptual() ? this.frames().length : this.changes().length,
    ),
  );
  protected readonly frame = computed(() => {
    const kind = this.kind();
    if (!kind) return null;
    return this.lines()
      ? linkedWalkthrough(kind, this.problem(), this.fixture(), this.snapshot(), this.language())
      : (this.frames()[this.index()] ?? null);
  });
  private readonly line = computed(() =>
    this.conceptual() ? null : lineView(this.problem(), this.fixture(), this.language(), this.snapshot().step),
  );
  /** Meeting Rooms explains each recorded instruction with its published runtime wording. */
  private readonly meetingRooms = computed(() => this.problem().id === 'algorithmic-meeting-rooms');
  protected readonly caption = computed(() => {
    const frame = this.frame();
    if (this.conceptual() && frame) return `${frame.phase}. ${frame.why}`;
    return this.line()?.caption ?? '';
  });
  protected readonly captionLine = computed(() => (this.conceptual() ? null : (this.line()?.line ?? null)));
  protected readonly captionDetail = computed(() => {
    if (this.conceptual()) return null;
    const event = this.snapshot().event;
    if (this.meetingRooms() && event)
      return event.result !== undefined
        ? `The selected runtime returned ${event.result}.`
        : 'Observe the recorded state after this instruction, then predict the next comparison.';
    return this.line()?.detail ?? null;
  });
  protected readonly values = computed<WalkthroughValue[]>(() => {
    if (!this.conceptual()) return this.line()?.values ?? [];
    const f = this.frame();
    if (!f) return [];
    const fields: [string, unknown][] =
      f.kind === 'container'
        ? [
            ['left', f.left],
            ['right', f.right],
            ['leftHeight', f.values[f.left]],
            ['rightHeight', f.values[f.right]],
            ['width', f.right - f.left],
            ['currentArea', f.total],
            ['maxArea', f.best],
            ['Best pair', f.bestRange],
          ]
        : [
            ['start', f.left],
            ['end', f.right],
            ['windowSize', f.right - f.left + 1],
            ['Target k', f.k],
            ['currentSum', f.total],
            ['Best valid sum', f.best],
            ['Best window', f.bestRange],
            ['Entering index', f.entering],
            ['Leaving index', f.leaving],
            ['Candidate status', f.right - f.left + 1 === f.k ? 'Exact k' : 'Not exact k'],
          ];
    return fields.map(([name, value]) => ({
      name,
      value: value == null ? 'Not yet' : Array.isArray(value) ? `[${value.join(', ')}]` : String(value),
    }));
  });
  protected readonly valuesNote = computed(() =>
    this.conceptual() ? 'Conceptual teaching values. These are not native Java, Python or Go locals.' : null,
  );
  protected readonly code = computed(() => {
    const line = this.line();
    return codeLines(this.problem(), this.language(), line?.current ?? null, line?.ran ?? []);
  });
  protected readonly source = computed(() => referenceSource(this.problem(), this.language()));
  protected readonly approach = computed<WalkthroughApproach>(() => {
    const problem = this.problem();
    const canonical = problem.practice.canonicalApproach;
    const { time, space } = problem.complexity;
    const invariant =
      [problem.trace, ...(problem.fixtureTraces ?? [])].find((item) => item.fixtureId === this.fixture().id)
        ?.invariant ||
      problem.invariantAdaptation ||
      '';
    const fixture = this.fixture();
    return {
      summary: firstSentence(canonical.whyThisApproach),
      time,
      space,
      rows: [
        { label: 'Why it works', text: canonical.whyThisApproach },
        { label: 'Cost', text: `Time ${time} · Extra space ${space}` },
        ...(invariant ? [{ label: 'Invariant', text: invariant }] : []),
        ...(fixture.explanation
          ? [{ label: 'This example', text: `${fixture.input} → ${fixture.expectedOutput}. ${fixture.explanation}` }]
          : []),
      ],
    };
  });
  protected readonly player = new TracePlayer(
    () => ({ step: this.index(), count: this.count() }),
    (step) => this.go(step),
    STEP_MS,
  );

  constructor() {
    // Playback belongs to one example, language and step size.
    effect(() => {
      this.fixture();
      this.language();
      this.lines();
      untracked(() => this.player.pause());
    });
    inject(DestroyRef).onDestroy(() => this.player.pause());
  }

  protected go(index: number): void {
    if (this.lines()) this.stepChange.emit(index);
    else if (this.conceptual())
      this.conceptPositions.set(
        this.problem().id,
        this.fixture().id,
        Math.max(0, Math.min(this.frames().length - 1, index)),
      );
    else this.stepChange.emit(this.changes()[Math.max(0, Math.min(this.changes().length - 1, index))] ?? 0);
  }
  protected choose(id: string): void {
    if (id !== this.fixture().id) this.fixtureChange.emit(id);
  }
  protected switchLines(on: boolean): void {
    this.player.pause();
    this.everyLineChange.emit(on);
  }
}
