import { Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core';
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
  readonly problem = input.required<PatternProblemV1>();
  readonly entryMode = input<'guided' | 'practice'>('practice');
  readonly showProblemHeading = input(true);
  protected readonly mode = signal<'guided' | 'practice'>('practice');
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
  }

  protected chooseFixture(fixture: PatternProblemFixture): void {
    const index = this.problem().fixtures.findIndex(({ id }) => id === fixture.id);
    if (index >= 0) this.fixtureIndex.set(index);
  }

  protected selectMode(mode: 'guided' | 'practice'): void {
    this.mode.set(mode);
    this.revealModeContent(mode);
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

  private revealModeContent(mode: 'guided' | 'practice'): void {
    window.requestAnimationFrame(() => {
      const tablist = this.host.nativeElement.querySelector<HTMLElement>('.mode-tabs');
      const panel = this.host.nativeElement.querySelector<HTMLElement>(
        mode === 'practice' ? '#two-sum-practice-pane' : '#two-sum-guided-pane',
      );
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
}
