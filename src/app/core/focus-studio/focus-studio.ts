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
  untracked,
  viewChild,
} from '@angular/core';
import { DsaProblemV2, DsaRecallKind, PatternLanguage } from '../../content/content.models';
import { DsaStory } from '../dsa-story/dsa-story';
import { DsaStoryLoader } from '../dsa-story/dsa-story-loader';
import { DsaStoryV1 } from '../dsa-story/dsa-story.model';
import { focusStudioPattern } from '../../content/focus-studio-pilot';
import { CodingSolutionTabs } from '../coding-solution-tabs/coding-solution-tabs';
import { ReferenceLanguageService } from '../reference-language';
import { GuidedAlgorithmTrace } from '../guided-algorithm-trace/guided-algorithm-trace';
import { traceSnapshot } from '../guided-algorithm-trace/trace-model';
import { CodeCopyButton } from '../code-copy-button/code-copy-button';
import { StudioApproach } from './studio-approach';
import { StudioFallbackWalkthrough } from './studio-fallback-walkthrough';
import {
  StudioMode,
  StudioModeState,
  createStudioState,
  studioPosition,
  updateStudioMode,
  stepStudio,
  visualizeStudio,
  closeStudioReference,
  setStudioLanguage,
  lockStudio,
  migrateStudioState,
} from './workspace-state';
import { ComplexityPrediction, PracticeTimer, loadPrediction, savePrediction, defaultTimerMinutes } from './practice-tools';
import {
  StudioComplexity,
  StudioPrediction,
  StudioShortcuts,
  StudioTimer,
  StudioTimerGate,
} from './studio-practice-tools';
import { StudioExamples } from './studio-examples';
import { RecallCardView, StudioRecallGrid } from './studio-recall-grid';
import { PracticeProgressService } from '../practice-progress/practice-progress';

type StudioAction = 'solution' | 'close-visualization' | 'visualize' | 'locked';

/**
 * Recall card tags (card grid, 2026-10-06). A rewritten card names its kind; its tag is that kind.
 * Template cards published before the rewrite have none, so their id keeps today's short tag and
 * borrows the colour of the nearest kind.
 */
const RECALL_TAGS: Record<DsaRecallKind, string> = {
  concept: 'Concept',
  state: 'State',
  correctness: 'Correctness',
  complexity: 'Complexity',
  trap: 'Trap',
  boundary: 'Boundary',
  transfer: 'Transfer',
};
const TEMPLATE_RECALL: Record<string, { tag: string; kind: DsaRecallKind }> = {
  'key-idea': { tag: 'Key idea', kind: 'concept' },
  recognize: { tag: 'Spot it', kind: 'concept' },
  flow: { tag: 'Flow', kind: 'state' },
  invariant: { tag: 'Invariant', kind: 'correctness' },
  complexity: { tag: 'Cost', kind: 'complexity' },
  mistakes: { tag: 'Avoid', kind: 'trap' },
  'failure-mode': { tag: 'Edge case', kind: 'boundary' },
  'contract-change': { tag: 'What if', kind: 'transfer' },
  'fixture-trace': { tag: 'Trace', kind: 'state' },
};
function templateRecall(id: string): { tag: string; kind: DsaRecallKind } {
  return (
    TEMPLATE_RECALL[id] ??
    (id.startsWith('problem-check')
      ? { tag: 'Check', kind: 'correctness' }
      : { tag: 'Recall', kind: 'concept' })
  );
}

@Component({
  selector: 'app-focus-studio',
  imports: [
    NgTemplateOutlet,
    CodingSolutionTabs,
    GuidedAlgorithmTrace,
    CodeCopyButton,
    StudioApproach,
    StudioFallbackWalkthrough,
    DsaStory,
    StudioTimer,
    StudioTimerGate,
    StudioPrediction,
    StudioComplexity,
    StudioShortcuts,
    StudioExamples,
    StudioRecallGrid,
  ],
  templateUrl: './focus-studio.html',
  styleUrl: './focus-studio.css',
})
export class FocusStudio {
  protected readonly Math = Math;
  readonly problem = input.required<DsaProblemV2>();
  readonly initialLanguage = input<PatternLanguage>('java');
  /** The reference language is remembered for the next problem and for DSA core Learn lessons. */
  private readonly referenceLanguage = inject(ReferenceLanguageService);
  private readonly storyLoader = inject(DsaStoryLoader);
  /** Browser-local practice progress: started on first engagement, solved by a rating. */
  private readonly progress = inject(PracticeProgressService);
  /** The Recall tab's number becomes a ✓ once this problem is rated on this device. */
  protected readonly solved = computed(
    () => this.progress.records()[this.problem().id]?.status === 'solved',
  );
  /**
   * Option B: the problem's hand-made story, when one is published. Without one (or while it
   * loads, or if it is malformed) the page keeps the fallback walkthrough (StudioFallbackWalkthrough).
   */
  protected readonly story = signal<DsaStoryV1 | null>(null);
  protected readonly state = signal(createStudioState('', 'java'));
  /**
   * The Visual walkthrough's memory ("Code beside", 2026-10-06): its example, language, recorded
   * line position, and `debugger`, which is the player's "Every line" switch.
   */
  protected readonly visualMode = computed(() => this.state().modes.visual);
  protected readonly visualStep = computed(() => {
    const visual = this.visualMode();
    return visual.positions[`${visual.fixtureId}/${visual.language}`] ?? 0;
  });
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
  protected readonly pattern = computed(() => focusStudioPattern(this.problem()) ?? 'generic');
  protected readonly problemPinned = computed(() => this.state().problemExpanded);
  protected readonly peek = signal(false);
  protected readonly peekTop = signal(160);
  protected readonly hintCount = signal(0);
  /** Hints stay closed until the learner opens them (the Hints button or H). */
  protected readonly hintsVisible = signal(false);
  protected readonly railShare = signal(22);
  protected readonly referenceShare = signal(46);
  protected readonly contextualShare = signal(68);
  protected readonly effectiveShare = computed(() =>
    this.mode() === 'practice' ? this.referenceShare() : this.contextualShare(),
  );
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly draftLanguage = signal<PatternLanguage>('java');
  /**
   * Recall cards for the grid: the authored recall, or the problem's practice checks when none is
   * published. A card's kind picks its tag; a template card without one keeps its id-based tag.
   */
  protected readonly recallCards = computed<RecallCardView[]>(() => {
    const recall = this.problem().teaching?.recall ?? [];
    if (recall.length)
      return recall.map((card) => ({
        id: card.id,
        label: card.label,
        question: card.question,
        answer: card.answer,
        steps: card.steps,
        ...(card.kind && RECALL_TAGS[card.kind]
          ? { kind: card.kind, tag: RECALL_TAGS[card.kind] }
          : templateRecall(card.id)),
      }));
    return this.problem().practice.checks.map((check, index) => ({
      id: `problem-check-${index + 1}`,
      label: `Check ${index + 1}`,
      question: check.prompt,
      answer: [check.expected],
      tag: 'Check',
      kind: 'correctness',
    }));
  });
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
  /** The invariant shown above the reference's "Why this approach" card (review note #24). */
  protected readonly rationaleInvariant = computed(
    () =>
      this.problem().invariantAdaptation?.trim() || this.problem().trace?.invariant?.trim() || '',
  );
  /**
   * Presentation only (review note #24): many published mistakes open by restating the
   * invariant ("Breaking this invariant: <invariant>"). The invariant now sits above the
   * cards, so such a mistake reads as a short pointer instead of repeating it. Content files
   * stay unchanged; drop this once the content rewrite removes the restated invariant.
   */
  protected readonly commonMistakes = computed(() =>
    this.problem().practice.commonMistakes.map((mistake) =>
      this.rationaleInvariant() && /^breaking this invariant:/i.test(mistake.trim())
        ? 'Breaking the invariant above.'
        : mistake,
    ),
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
  /** Timed attempt (practice tools): while it runs, hints and the solution stay locked. */
  protected readonly timer = new PracticeTimer();
  protected readonly locked = computed(() => this.timer.running());
  /** Tabs the learner chose to open anyway during this attempt ("Continue anyway?"). */
  protected readonly peeked = signal<ReadonlySet<StudioMode>>(new Set());
  protected readonly gated = computed(
    () => this.locked() && this.mode() !== 'practice' && !this.peeked().has(this.mode()),
  );
  protected readonly prediction = signal<ComplexityPrediction | null>(null);
  /**
   * The side column: on Try it yourself it always holds the examples (hints join them while open)
   * or the reference; Recall uses the full width unless a reference is open there.
   */
  protected readonly contextVisible = computed(() =>
    this.mode() === 'recall' ? this.current().revealed : true,
  );
  protected readonly composition = signal<'stack' | 'laptop' | 'wide'>('laptop');
  protected readonly modeIndex = computed(() => this.modes.findIndex((item) => item.id === this.mode()));
  /** One line under the tabs that says what the selected tab is for (user review 2026-10-05, option B). */
  protected readonly modeGuide = computed(() => {
    switch (this.mode()) {
      case 'practice':
        return 'Write your solution, then trace it through each example.';
      case 'approach':
        return 'Understand the question and the plan before you write code.';
      case 'visual':
        // The example is in the walkthrough's own selector; the guide line does not repeat it.
        return 'Watch the reference solution run, one step at a time.';
      default:
        return 'Answer from memory first, then open each answer to check yourself.';
    }
  });
  /**
   * Each tab has one action at rest, in the same place: Try it yourself shows the solution, Approach and
   * Recall visualize the solution. The Visual walkthrough brings its own player ("Every line" replaced the
   * separate guided debugger, 2026-10-06), so it only offers "Close visualization" after a handoff, which
   * returns to the tab it came from (Escape does the same). An open solution always offers its close
   * action. During a timed attempt every opening action gives way to one "unlock when you stop" note.
   */
  protected readonly actions = computed<StudioAction[]>(() => {
    const actions = this.restingActions();
    return this.locked() && actions.some((action) => action !== 'close-visualization')
      ? ['locked']
      : actions;
  });
  private readonly restingActions = computed<StudioAction[]>(() => {
    const current = this.current();
    if (this.mode() === 'visual') return this.state().visualizationOrigin ? ['close-visualization'] : [];
    switch (this.mode()) {
      case 'practice':
        return ['solution'];
      case 'approach':
        return current.revealed ? ['solution'] : ['visualize'];
      default:
        return ['visualize'];
    }
  });
  protected readonly modes: { id: StudioMode; label: string; description: string }[] = [
    { id: 'practice', label: 'Try it yourself', description: 'Write your own solution and test your reasoning against the examples (1)' },
    { id: 'approach', label: 'Approach', description: 'Review the invariant, reasoning and complexity of the canonical approach (2)' },
    { id: 'visual', label: 'Visual walkthrough', description: 'Follow the algorithm visually, including each executed line (3)' },
    { id: 'recall', label: 'Recall', description: 'Answer the recall questions from memory, then check each answer (4)' },
  ];
  protected readonly languages: PatternLanguage[] = ['java', 'python', 'go'];
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly problemButton = viewChild<ElementRef<HTMLButtonElement>>('problemButton');
  private readonly problemRail = viewChild<ElementRef<HTMLElement>>('problemRail');
  private readonly draftEditor = viewChild(CodingSolutionTabs);
  private peekTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect((onCleanup) => {
      const problem = this.problem();
      this.story.set(null);
      const subscription = this.storyLoader.load(problem.id).subscribe((value) =>
        this.story.set(
          value && problem.fixtures.some((fixture) => fixture.id === value.fixtureId) ? value : null,
        ),
      );
      onCleanup(() => subscription.unsubscribe());
    });
    // A story page uses the full screen width (see question.ts .option-b-page).
    effect((onCleanup) => {
      const page = this.host.nativeElement.closest('main');
      const active = !!this.story();
      page?.classList.toggle('option-b-page', active);
      onCleanup(() => page?.classList.remove('option-b-page'));
    });
    // A state from before "Code beside" moves its guided debugger to the walkthrough's Every line.
    effect(() => {
      const state = this.state();
      const migrated = migrateStudioState(state);
      if (migrated !== state) untracked(() => this.state.set(migrated));
    });
    effect(() => {
      this.state.set(createStudioState(this.problem().fixtures[0].id, this.initialLanguage()));
      this.draftLanguage.set(this.initialLanguage());
      this.drafts.set({});
      this.hintCount.set(0);
      this.hintsVisible.set(false);
      this.peek.set(false);
    });
    // The walkthrough opens on the story's animated example until the learner picks another.
    effect(() => {
      const story = this.story();
      if (!story) return;
      untracked(() =>
        this.state.update((state) => {
          const visual = state.modes.visual;
          const pristine =
            visual.fixtureId === this.problem().fixtures[0].id &&
            !visual.chosen &&
            !visual.debugger &&
            !state.visualizationOrigin;
          return pristine && visual.fixtureId !== story.fixtureId
            ? { ...state, modes: { ...state.modes, visual: { ...visual, fixtureId: story.fixtureId } } }
            : state;
        }),
      );
    });
    // Practice tools are kept per problem for this tab session (sessionStorage).
    effect(() => {
      const id = this.problem().id;
      const difficulty = this.problem().difficulty;
      untracked(() => {
        this.timer.load(id, defaultTimerMinutes(difficulty));
        this.peeked.set(new Set());
        this.prediction.set(loadPrediction(id));
      });
    });
    // Starting, resuming or restoring a timed attempt closes any open solution, Every line or hints.
    effect(() => {
      if (!this.locked()) return;
      untracked(() => {
        this.state.update(lockStudio);
        this.hintsVisible.set(false);
      });
    });
    const shortcuts = (event: KeyboardEvent) => this.shortcutKeys(event);
    document.addEventListener('keydown', shortcuts);
    // The page-wide language can also change from the walkthrough or another tab: follow it here.
    effect(() => {
      const language = this.referenceLanguage.selected();
      untracked(() => this.applyLanguage(language));
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
      this.timer.destroy();
      document.removeEventListener('keydown', shortcuts);
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
  /** Your code, the reference solution and the visual walkthrough share one language. */
  protected selectLanguage(language: string): void {
    if (!this.languages.includes(language as PatternLanguage)) return;
    this.applyLanguage(language as PatternLanguage);
    this.referenceLanguage.select(language);
  }
  protected selectDraftLanguage(language: string): void {
    this.selectLanguage(language);
  }
  private applyLanguage(language: PatternLanguage): void {
    if (this.position().language !== language || Object.values(this.state().modes).some((mode) => mode.language !== language))
      this.state.update((state) => setStudioLanguage(state, language));
    if (this.draftLanguage() !== language) this.draftLanguage.set(language);
  }
  protected updateDraft(code: string): void {
    this.markStarted();
    this.drafts.update((drafts) => ({ ...drafts, [this.draftKey()]: code }));
  }
  protected resetDraft(): void {
    this.updateDraft(this.problem().practice.starters[this.draftLanguage()]);
  }
  protected formatDraft(): void {
    this.draftEditor()?.formatStudioCode();
  }
  /** The walkthrough's example, chosen in its header (or the Problem panel while on the tab). */
  protected setVisualFixture(fixtureId: string): void {
    if (!this.problem().fixtures.some((item) => item.id === fixtureId)) return;
    this.state.update((state) => ({
      ...state,
      modes: { ...state.modes, visual: { ...state.modes.visual, fixtureId, chosen: true } },
    }));
  }
  /** "Every line": the walkthrough steps the recorded line trace (it replaced "Open guided debugger"). */
  protected setEveryLine(on: boolean): void {
    if (on) this.markStarted();
    this.state.update((state) => ({
      ...state,
      modes: { ...state.modes, visual: { ...state.modes.visual, debugger: on, revealed: on } },
    }));
  }
  /** The fallback walkthrough's recorded line position, kept per example and language. */
  protected setVisualStep(step: number): void {
    this.state.update((state) =>
      state.mode === 'visual' ? stepStudio(state, Math.max(0, step)) : state,
    );
  }
  protected toggleSolution(): void {
    if (this.current().revealed) this.closeReference();
    else if (!this.locked()) {
      this.markStarted();
      this.patch({ revealed: true });
    }
  }
  /** Reveals the next hint; the first one opened marks the problem started on this device. */
  protected revealHint(): void {
    this.markStarted();
    this.hintCount.update((count) => count + 1);
  }
  private markStarted(): void {
    this.progress.markStarted(this.problem().id);
  }
  protected startTimer(): void {
    this.peeked.set(new Set());
    this.timer.start();
  }
  /** "Continue anyway?": open this tab during the attempt; the timer keeps running. */
  protected continueAnyway(): void {
    const mode = this.mode();
    this.peeked.update((modes) => new Set(modes).add(mode));
    this.focusTab(mode);
  }
  protected leaveGate(): void {
    this.selectMode('practice');
    this.focusTab('practice');
  }
  protected savePrediction(prediction: ComplexityPrediction): void {
    this.prediction.set(prediction);
    savePrediction(this.problem().id, prediction);
  }
  private focusTab(mode: StudioMode): void {
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLButtonElement>(`[data-studio-mode="${mode}"]`)
        ?.focus({ preventScroll: true }),
    );
  }
  /**
   * Keyboard shortcuts (practice tools): 1–4 switch tabs, P toggles the Problem panel and H the
   * hints; Escape closes a "Visualize solution" handoff (visualEscape). They never fire while typing
   * (editor, inputs, selects), with a modifier, or when focus is elsewhere on the page; the tabs keep
   * their own arrow, Home and End keys (modeKeys).
   */
  protected shortcutKeys(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const host = this.host.nativeElement;
    if (target && target !== document.body && target !== document.documentElement && !host.contains(target))
      return;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, app-studio-editor',
      )
    )
      return;
    if (event.key === 'Escape') {
      if (this.visualEscape(target)) event.preventDefault();
      return;
    }
    const key = event.key.toLowerCase();
    const index = ['1', '2', '3', '4'].indexOf(key);
    if (index >= 0 && index < this.modes.length) {
      const mode = this.modes[index].id;
      this.selectMode(mode);
      host
        .querySelector<HTMLButtonElement>(`[data-studio-mode="${mode}"]`)
        ?.focus({ preventScroll: true });
    } else if (key === 'p') this.toggleProblem();
    else if (key === 'h' && this.mode() === 'practice' && !this.locked() && !this.current().revealed)
      this.toggleHints();
    else return;
    event.preventDefault();
  }
  /**
   * Escape on the Visual walkthrough after a handoff does what "Close visualization" does: back to
   * the tab it came from, with focus on that tab. The Problem panel's peek keeps its own Escape, and
   * an open dialog (pattern help, a confirmation) owns Escape while it is open.
   */
  private visualEscape(target: Element | null): boolean {
    if (this.mode() !== 'visual' || !this.state().visualizationOrigin || this.peek()) return false;
    if (target?.closest('dialog, [role="dialog"], [role="alertdialog"], .problem-rail, .problem-toggle'))
      return false;
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return false;
    this.closeReference();
    return true;
  }
  /**
   * "Visualize solution" from Approach or Recall: the Visual walkthrough on the same language, with
   * "Close visualization" to return. An example the learner picked in this tab stays, even one the
   * story does not animate (the player runs it line by line with its notice); otherwise the
   * walkthrough opens on the story's animated example.
   */
  protected visualize(): void {
    if (this.locked()) return;
    const story = this.story();
    this.state.update((state) => visualizeStudio(state, story ? { fixtureId: story.fixtureId } : {}));
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
