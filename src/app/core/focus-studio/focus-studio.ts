import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DsaProblemV2, PatternLanguage } from '../../content/content.models';
import { focusStudioPattern } from '../../content/focus-studio-pilot';
import { CodingSolutionTabs } from '../coding-solution-tabs/coding-solution-tabs';
import { GuidedAlgorithmTrace } from '../guided-algorithm-trace/guided-algorithm-trace';
import { traceSnapshot } from '../guided-algorithm-trace/trace-model';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';
import { StudioDiagram } from './studio-diagram';
import { StudioApproach } from './studio-approach';
import { StudioPatternDiagram } from './studio-pattern-diagram';
import { conceptualFrames, linkedWalkthrough, walkthroughKind } from './studio-walkthrough';
import {
  StudioMode,
  StudioModeState,
  createStudioState,
  studioPosition,
  updateStudioMode,
  stepStudio,
  visualizeStudio,
  closeStudioReference,
} from './workspace-state';

@Component({
  selector: 'app-focus-studio',
  imports: [
    NgTemplateOutlet,
    CodingSolutionTabs,
    GuidedAlgorithmTrace,
    CodeCopyButton,
    StudioDiagram,
    StudioApproach,
    StudioPatternDiagram,
  ],
  templateUrl: './focus-studio.html',
  styleUrl: './focus-studio.css',
})
export class FocusStudio {
  protected readonly Math = Math;
  readonly problem = input.required<DsaProblemV2>();
  readonly initialLanguage = input<PatternLanguage>('java');
  protected readonly state = signal(createStudioState('', 'java'));
  protected readonly current = computed(() => this.state().modes[this.state().mode]);
  protected readonly mode = computed(() => this.state().mode);
  protected readonly position = computed(() => studioPosition(this.state()));
  protected readonly fixture = computed(
    () =>
      this.problem().fixtures.find((item) => item.id === this.position().fixtureId) ??
      this.problem().fixtures[0],
  );
  protected readonly snapshot = computed(() =>
    traceSnapshot(
      this.problem(),
      this.fixture().id,
      this.position().language,
      this.position().step,
    ),
  );
  protected readonly walkthroughEvent = computed(() => {
    const event = this.snapshot().event;
    if (this.problem().id !== 'algorithmic-meeting-rooms' || !event) return event;
    const language = this.position().language;
    const lines = this.problem().implementations.find(item => item.language === language)?.lines ?? [];
    const index = lines.findIndex(line => line.id === event.sourceAnchor[language]);
    return { ...event, label: `${language} instruction ${index + 1}`, what: lines[index]?.text.trim() ?? event.what,
      why: event.result !== undefined ? `The selected runtime returned ${event.result}.` : 'Observe the recorded state after this instruction, then predict the next comparison.' };
  });
  protected readonly pattern = computed(() => focusStudioPattern(this.problem()) ?? 'generic');
  protected readonly linked = computed(() => this.mode() === 'visual' && this.current().debugger);
  protected readonly problemPinned = computed(() => this.state().problemExpanded);
  protected readonly peek = signal(false);
  protected readonly peekTop = signal(160);
  protected readonly hintCount = signal(0);
  protected readonly hintsVisible = signal(true);
  protected readonly follow = signal(true);
  protected readonly railShare = signal(22);
  protected readonly referenceShare = signal(46);
  protected readonly contextualShare = signal(68);
  protected readonly effectiveShare = computed(() =>
    this.mode() === 'practice' ? this.referenceShare() : this.contextualShare(),
  );
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly draftLanguage = signal<PatternLanguage>('java');
  protected readonly draftKey = computed(
    () => `${this.problem().id}/${this.fixture().id}/${this.draftLanguage()}`,
  );
  protected readonly draft = computed(
    () => this.drafts()[this.draftKey()] ?? this.problem().practice.starters[this.draftLanguage()],
  );
  protected readonly filename = computed(
    () =>
      ({ java: 'Solution.java', python: 'solution.py', go: 'solution.go' })[this.draftLanguage()],
  );
  protected readonly referenceSource = computed(() =>
    this.problem()
      .implementations.find((item) => item.language === this.position().language)!
      .lines.map((line) => line.text)
      .join('\n'),
  );
  protected readonly solutions = computed(() =>
    this.problem().implementations.map((item) => ({
      language: item.language,
      title: item.title,
      source: item.lines.map((line) => line.text).join('\n'),
    })),
  );
  protected readonly tutorProblem = computed(() =>
    this.problem().id === 'algorithmic-two-sum'
      ? {
          id: this.problem().id,
          title: this.problem().title,
          prompt: this.problem().practice.statement.prompt,
        }
      : null,
  );
  protected readonly trace = computed(() =>
    [this.problem().trace, ...(this.problem().fixtureTraces ?? [])].find(
      (item) => item.fixtureId === this.fixture().id,
    )!,
  );
  protected readonly visualSteps = computed(() => {
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
  protected readonly walkthroughKind = computed(() => walkthroughKind(this.problem().id));
  protected readonly conceptPositions = signal<Record<string, number>>({});
  protected readonly conceptFrames = computed(() => {
    const kind = this.walkthroughKind();
    return kind ? conceptualFrames(kind, this.fixture()) : [];
  });
  protected readonly visualIndex = computed(() =>
    this.walkthroughKind()
      ? Math.min(
          this.conceptPositions()[this.fixture().id] ?? 0,
          Math.max(0, this.conceptFrames().length - 1),
        )
      : Math.max(0, this.visualSteps().filter((step) => step <= this.snapshot().step).length - 1),
  );
  protected readonly visualLength = computed(() =>
    this.walkthroughKind() ? this.conceptFrames().length : this.visualSteps().length,
  );
  protected readonly visualFrame = computed(() => {
    const kind = this.walkthroughKind();
    if (!kind) return null;
    return this.linked()
      ? linkedWalkthrough(
          kind,
          this.problem(),
          this.fixture(),
          this.snapshot(),
          this.position().language,
        )
      : (this.conceptFrames()[this.visualIndex()] ?? null);
  });
  protected readonly visualMetrics = computed(() => {
    const f = this.visualFrame();
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
      value:
        value == null ? 'Not yet' : Array.isArray(value) ? `[${value.join(', ')}]` : String(value),
    }));
  });
  protected readonly contextVisible = computed(
    () => this.mode() !== 'practice' || this.current().revealed || this.hintsVisible(),
  );
  protected readonly composition = signal<'stack' | 'laptop' | 'wide'>('laptop');
  protected readonly modes: { id: StudioMode; label: string }[] = [
    { id: 'practice', label: 'Try it yourself' },
    { id: 'approach', label: 'Approach' },
    { id: 'visual', label: 'Visual walkthrough' },
    { id: 'recall', label: 'Recall' },
  ];
  protected readonly languages: PatternLanguage[] = ['java', 'python', 'go'];
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly problemButton = viewChild<ElementRef<HTMLButtonElement>>('problemButton');
  private readonly problemRail = viewChild<ElementRef<HTMLElement>>('problemRail');
  private readonly draftEditor = viewChild(CodingSolutionTabs);
  private peekTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      this.state.set(createStudioState(this.problem().fixtures[0].id, this.initialLanguage()));
      this.draftLanguage.set(this.initialLanguage());
      this.drafts.set({});
      this.hintCount.set(0);
      this.conceptPositions.set({});
      this.hintsVisible.set(true);
      this.peek.set(false);
    });
    const measure = () => {
      const host = this.host.nativeElement;
      const stage = host.querySelector<HTMLElement>('.right-workspace');
      if (!stage) return;
      const scale = Math.max(
        1,
        parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
      );
      const width = stage.getBoundingClientRect().width / scale;
      this.composition.set(
        width < 900
          ? 'stack'
          : width >= 1650 && window.innerHeight / scale >= 850
            ? 'wide'
            : 'laptop',
      );
      const header = document.querySelector<HTMLElement>('.platform-header');
      const headerHeight = header?.getBoundingClientRect().height ?? 76;
      host.style.setProperty('--stage-top', `${headerHeight + 6}px`);
      host.style.setProperty(
        '--studio-source-height',
        `${Math.max(200, Math.min(420, window.innerHeight - headerHeight - 470))}px`,
      );
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    effect(() => {
      this.state();
      this.railShare();
      schedule();
      const stage = this.host.nativeElement.querySelector('.right-workspace');
      if (stage) observer?.observe(stage);
      const header = document.querySelector('.platform-header');
      if (header) observer?.observe(header);
    });
    window.addEventListener('resize', schedule, { passive: true });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.peekTimer);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    });
  }
  protected patch(patch: Partial<StudioModeState>): void {
    this.state.update((state) => updateStudioMode(state, patch));
  }
  protected selectMode(mode: StudioMode): void {
    this.peek.set(false);
    this.state.update((state) => ({ ...state, mode }));
  }
  protected modeKeys(event: KeyboardEvent): void {
    const index = this.modes.findIndex((item) => item.id === this.mode());
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? this.modes.length - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % this.modes.length
            : event.key === 'ArrowLeft'
              ? (index + this.modes.length - 1) % this.modes.length
              : -1;
    if (target < 0) return;
    event.preventDefault();
    this.selectMode(this.modes[target].id);
    this.host.nativeElement
      .querySelector<HTMLButtonElement>(`[data-studio-mode="${this.modes[target].id}"]`)
      ?.focus({ preventScroll: true });
  }
  protected selectFixture(fixtureId: string): void {
    if (this.problem().fixtures.some((item) => item.id === fixtureId)) this.patch({ fixtureId });
  }
  protected selectLanguage(language: string): void {
    if (this.languages.includes(language as PatternLanguage))
      this.patch({ language: language as PatternLanguage });
  }
  protected selectDraftLanguage(language: string): void {
    if (this.languages.includes(language as PatternLanguage))
      this.draftLanguage.set(language as PatternLanguage);
  }
  protected updateDraft(code: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [this.draftKey()]: code }));
  }
  protected resetDraft(): void {
    this.updateDraft(this.problem().practice.starters[this.draftLanguage()]);
  }
  protected formatDraft(): void {
    this.draftEditor()?.formatStudioCode();
  }
  protected setStep(step: number, event?: Event): void {
    this.state.update((state) =>
      stepStudio(
        state,
        Math.min(Math.max(0, step), Math.max(0, this.snapshot().events.length - 1)),
      ),
    );
    const button = event?.currentTarget as HTMLButtonElement | null;
    if (button)
      requestAnimationFrame(() => {
        const target = button.disabled
          ? button.closest('nav')?.querySelector<HTMLButtonElement>('button:not(:disabled)')
          : button;
        target?.focus({ preventScroll: true });
      });
  }
  protected visualStep(delta: number): void {
    if (this.walkthroughKind()) {
      this.conceptPositions.update((positions) => ({
        ...positions,
        [this.fixture().id]: Math.max(
          0,
          Math.min(this.visualLength() - 1, this.visualIndex() + delta),
        ),
      }));
      return;
    }
    const steps = this.visualSteps();
    this.setStep(steps[Math.min(steps.length - 1, Math.max(0, this.visualIndex() + delta))] ?? 0);
  }
  protected restartVisual(): void {
    if (this.walkthroughKind())
      this.conceptPositions.update((positions) => ({ ...positions, [this.fixture().id]: 0 }));
    else this.setStep(0);
  }
  protected toggleSolution(): void {
    this.current().revealed ? this.closeReference() : this.patch({ revealed: true });
  }
  protected toggleDebugger(): void {
    this.current().debugger
      ? this.closeReference()
      : this.patch({ revealed: true, debugger: true });
    this.peek.set(false);
  }
  protected visualize(): void {
    this.state.update(visualizeStudio);
    this.peek.set(false);
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLButtonElement>('[data-studio-mode="visual"]')
        ?.focus({ preventScroll: true }),
    );
  }
  protected closeReference(): void {
    const returning = this.mode() === 'visual' && this.state().visualizationOrigin;
    this.state.update(closeStudioReference);
    this.peek.set(false);
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLButtonElement>(
          returning
            ? `[data-studio-mode="${this.mode()}"]`
            : '.workspace-actions button:not([hidden])',
        )
        ?.focus({ preventScroll: true }),
    );
  }
  protected toggleHints(): void {
    this.hintsVisible.update((visible) => !visible);
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLButtonElement>(
          this.hintsVisible() ? '[aria-label="Close hints"]' : '[aria-label="Show hints panel"]',
        )
        ?.focus({ preventScroll: true }),
    );
  }
  protected toggleProblem(): void {
    this.state.update((state) => ({ ...state, problemExpanded: !state.problemExpanded }));
    this.peek.set(false);
  }
  protected showPeek(event?: PointerEvent): void {
    clearTimeout(this.peekTimer);
    if (this.problemPinned() || (event && event.pointerType !== 'mouse')) return;
    this.peekTop.set(
      (this.problemButton()?.nativeElement.getBoundingClientRect().bottom ?? 140) + 8,
    );
    this.peek.set(true);
  }
  protected leavePeek(): void {
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => this.peek.set(false), 160);
  }
  protected problemKeys(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Escape') this.closePeek();
    else {
      this.showPeek();
      requestAnimationFrame(() => this.problemRail()?.nativeElement.focus({ preventScroll: true }));
    }
  }
  protected closePeek(): void {
    this.peek.set(false);
    this.problemButton()?.nativeElement.focus({ preventScroll: true });
  }
  protected fixtureLabel(input: string): string {
    if (this.pattern() === 'heaps') {
      const match = input.match(/nums\s*=\s*(\[[^\]]*\]),\s*k\s*=\s*(\d+)/);
      if (match) return `k = ${match[2]} / ${match[1].replaceAll(',', ', ')}`;
    }
    return input.length > 84 ? `${input.slice(0, 81)}…` : input;
  }
  protected resizeKeys(event: KeyboardEvent, panel: 'problem' | 'reference'): void {
    const current =
      panel === 'problem'
        ? this.railShare
        : this.mode() === 'practice'
          ? this.referenceShare
          : this.contextualShare;
    const min = panel === 'problem' ? 18 : 35,
      max = panel === 'problem' ? 32 : 72;
    const step = (event.shiftKey ? 5 : 2) * (panel === 'reference' ? -1 : 1);
    const value =
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? max
          : event.key === 'ArrowRight'
            ? current() + step
            : event.key === 'ArrowLeft'
              ? current() - step
              : NaN;
    if (!Number.isFinite(value)) return;
    event.preventDefault();
    current.set(Math.max(min, Math.min(max, value)));
  }
  protected resizePointer(event: PointerEvent, panel: 'problem' | 'reference'): void {
    const handle = event.currentTarget as HTMLElement,
      container = handle.parentElement!;
    handle.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const value =
        panel === 'problem'
          ? ((next.clientX - rect.left) / rect.width) * 100
          : ((rect.right - next.clientX) / rect.width) * 100;
      (panel === 'problem'
        ? this.railShare
        : this.mode() === 'practice'
          ? this.referenceShare
          : this.contextualShare
      ).set(
        Math.max(panel === 'problem' ? 18 : 35, Math.min(panel === 'problem' ? 32 : 72, value)),
      );
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }
}
