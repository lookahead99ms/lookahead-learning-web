import { DOCUMENT } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  CodeSolution,
  PatternProblemFixture,
  PatternProblemV1,
} from '../../content/content.models';
import { CodingSolutionTabs } from '../coding-solution-tabs/coding-solution-tabs';
import { GuidedAlgorithmTrace } from '../guided-algorithm-trace/guided-algorithm-trace';

@Component({
  selector: 'app-dsa-problem-pilot',
  imports: [CodingSolutionTabs, GuidedAlgorithmTrace],
  templateUrl: './dsa-problem-pilot.html',
  styleUrl: './dsa-problem-pilot.css',
})
export class DsaProblemPilot {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly focusEntry = viewChild<ElementRef<HTMLButtonElement>>('focusEntry');
  private readonly focusExit = viewChild<ElementRef<HTMLButtonElement>>('focusExit');
  private readonly focusDialog = viewChild<ElementRef<HTMLElement>>('focusDialog');
  private focusOrigin: HTMLElement | null = null;
  private focusScrollY = 0;
  private previousBodyOverflow = '';
  readonly problem = input.required<PatternProblemV1>();
  readonly entryMode = input<'guided' | 'practice'>('practice');
  readonly showProblemHeading = input(true);
  protected readonly mode = signal<'guided' | 'practice'>('practice');
  protected readonly focusMode = signal(false);
  protected readonly fixtureIndex = signal(0);
  protected readonly practice = computed(() => this.problem().practice!);
  protected readonly activeFixture = computed(
    () => this.problem().fixtures[this.fixtureIndex()] ?? this.problem().fixtures[0],
  );
  protected readonly activeTrace = computed(() => {
    const problem = this.problem();
    return (
      [problem.trace, ...(problem.fixtureTraces ?? [])].find(
        (trace) => trace.fixtureId === this.activeFixture().id,
      ) ?? problem.trace
    );
  });
  protected readonly solutions = computed<CodeSolution[]>(() =>
    this.problem().implementations.map((implementation) => ({
      language: implementation.language,
      title: implementation.title,
      source: implementation.lines.map(({ text }) => text).join('\n'),
    })),
  );
  protected readonly complexity = computed(() => ({
    time: this.problem().complexity.time,
    space: this.problem().complexity.space,
    note: this.problem().complexity.why,
  }));

  constructor() {
    effect(() => {
      this.problem().id;
      this.mode.set(this.entryMode());
      this.fixtureIndex.set(0);
    });
    this.destroyRef.onDestroy(() => this.releaseFocusMode(false));
  }

  protected chooseFixture(fixture: PatternProblemFixture): void {
    const index = this.problem().fixtures.findIndex(({ id }) => id === fixture.id);
    if (index >= 0) this.fixtureIndex.set(index);
  }

  protected selectMode(mode: 'guided' | 'practice'): void {
    if (mode !== 'guided') this.releaseFocusMode(false);
    this.mode.set(mode);
    this.revealModeContent(mode);
  }

  protected enterFocusMode(event: Event): void {
    if (this.focusMode()) return;
    this.focusOrigin =
      (event.currentTarget as HTMLElement | null) ?? this.focusEntry()?.nativeElement ?? null;
    this.focusScrollY = window.scrollY;
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    this.focusMode.set(true);
    queueMicrotask(() => this.focusExit()?.nativeElement.focus());
    window.requestAnimationFrame(() => this.focusExit()?.nativeElement.focus());
  }

  protected exitFocusMode(): void {
    this.releaseFocusMode(true);
  }

  protected handleFocusKeydown(event: KeyboardEvent): void {
    if (!this.focusMode()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.exitFocusMode();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = this.focusDialog()?.nativeElement;
    if (!dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  protected handleModeKeydown(event: KeyboardEvent): void {
    const keyToMode: Partial<Record<string, 'guided' | 'practice'>> = {
      ArrowLeft: 'practice',
      ArrowRight: 'guided',
      Home: 'practice',
      End: 'guided',
    };
    const nextMode = keyToMode[event.key];
    if (!nextMode) return;

    event.preventDefault();
    this.selectMode(nextMode);
    const tab = (event.currentTarget as HTMLElement)
      .closest('[role="tablist"]')
      ?.querySelector<HTMLElement>(`[data-mode="${nextMode}"]`);
    tab?.focus();
  }

  protected modeTabId(mode: 'guided' | 'practice'): string {
    return `${this.problem().id}-${mode}-tab`;
  }

  protected modePaneId(mode: 'guided' | 'practice'): string {
    return `${this.problem().id}-${mode}-pane`;
  }

  protected focusDialogTitleId(): string {
    return `${this.problem().id}-focused-debugger-title`;
  }

  private revealModeContent(mode: 'guided' | 'practice'): void {
    window.requestAnimationFrame(() => {
      const tablist = this.host.nativeElement.querySelector<HTMLElement>('.mode-tabs');
      const panel = this.host.nativeElement.querySelector<HTMLElement>(`#${this.modePaneId(mode)}`);
      if (!tablist || !panel) return;

      const reaction = panel.querySelector<HTMLElement>('.mode-reaction') ?? panel;
      const reactionRect = reaction.getBoundingClientRect();
      const visibleReactionHeight = Math.max(
        0,
        Math.min(window.innerHeight, reactionRect.bottom) - Math.max(0, reactionRect.top),
      );
      const minimumVisibleContent = Math.min(240, Math.max(160, window.innerHeight * 0.28));
      if (visibleReactionHeight >= minimumVisibleContent) return;

      tablist.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
    });
  }

  private releaseFocusMode(restorePosition: boolean): void {
    if (!this.focusMode()) return;
    const focusOrigin = this.focusOrigin;
    this.focusMode.set(false);
    this.document.body.style.overflow = this.previousBodyOverflow;
    if (!restorePosition) return;

    window.scrollTo({ top: this.focusScrollY, left: window.scrollX, behavior: 'auto' });
    focusOrigin?.focus();
    window.requestAnimationFrame(() => focusOrigin?.focus());
  }
}
