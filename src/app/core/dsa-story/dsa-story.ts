import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { PatternLanguage, PatternProblemV1 } from '../../content/content.models';
import { highlightStudioSource } from '../focus-studio/code-presentation';
import { REFERENCE_LANGUAGES, ReferenceLanguageService } from '../reference-language';
import { traceArrowKey } from '../guided-algorithm-trace/trace-player';
import {
  DsaStoryV1,
  StoryTone,
  StoryView,
  callTimeline,
  callsModel,
  fillSay,
  formatValue,
  graphModel,
  gridModel,
  languageLines,
  linkedListModel,
  mapModel,
  outOfScope,
  sentinelNames,
  sequenceModel,
  shownStep,
  treeModel,
  trieModel,
  variableRows,
  viewSummary,
} from './dsa-story.model';
import { STORY_STEP_MS, StoryPlayer } from './story-player';

let nextStoryId = 0;
/** Views drawn as a row (or column) of cells. */
const SEQUENCE_VIEWS = new Set<StoryView['kind']>(['array', 'stack', 'queue', 'string', 'number-line', 'bits']);
const LANGUAGE_LABELS: Record<PatternLanguage, string> = { java: 'Java', python: 'Python', go: 'Go' };

/**
 * Option B: a hand-made, step-by-step animation of the one optimal reference solution. Every
 * data structure the code uses is drawn in sync, with every local in the Variables panel and the
 * reference code (Java | Python | Go, the page-wide choice) highlighting the lines each step ran.
 */
@Component({
  selector: 'app-dsa-story',
  templateUrl: './dsa-story.html',
  styleUrl: './dsa-story.css',
  host: { class: 'option-b-story' },
})
export class DsaStory {
  readonly story = input.required<DsaStoryV1>();
  readonly problem = input.required<PatternProblemV1>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly languageService = inject(ReferenceLanguageService);
  private readonly codeBox = viewChild<ElementRef<HTMLElement>>('codeBox');
  protected readonly uid = `story-${++nextStoryId}`;
  protected readonly languages = REFERENCE_LANGUAGES;
  protected readonly languageLabels = LANGUAGE_LABELS;
  protected readonly language = computed(() => this.languageService.selected());

  private readonly reducedMotion = (() => {
    try {
      return !!this.view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  })();
  private readonly storage = (() => {
    try {
      return this.view?.localStorage ?? null;
    } catch {
      return null;
    }
  })();
  protected readonly player = new StoryPlayer(
    () => this.story().steps.length,
    () => this.story().ms ?? STORY_STEP_MS,
    () => this.reducedMotion,
    this.storage,
  );
  protected readonly index = computed(() =>
    Math.min(this.player.index(), this.story().steps.length - 1),
  );
  protected readonly step = computed(() => this.story().steps[this.index()]);
  protected readonly count = computed(() => this.story().steps.length);
  protected readonly last = computed(() => this.index() === this.count() - 1);
  protected readonly caption = computed(() => fillSay(this.step(), this.language()));
  protected readonly fixture = computed(() =>
    this.problem().fixtures.find((item) => item.id === this.story().fixtureId),
  );
  protected readonly variables = computed(() =>
    variableRows(this.story(), this.index(), this.language()),
  );
  private readonly allLines = computed(() =>
    languageLines(this.problem(), this.story(), this.language()),
  );
  protected readonly code = computed(() => {
    const language = this.language();
    const implementation = this.problem().implementations.find((item) => item.language === language);
    if (!implementation) return [];
    const html = highlightStudioSource(implementation.lines.map((line) => line.text).join('\n'), language);
    const { current, ran } = this.allLines()[this.index()] ?? { current: null, ran: [] };
    const ranSet = new Set(ran);
    return implementation.lines.map((line, number) => ({
      id: line.id,
      number: number + 1,
      html: html[number] ?? '',
      current: line.id === current,
      ran: ranSet.has(line.id) && line.id !== current,
    }));
  });
  protected readonly currentLineNumber = computed(
    () => this.code().find((line) => line.current)?.number ?? null,
  );
  protected readonly panels = computed(() => {
    const story = this.story();
    const index = this.index();
    // A midline step (a one-line statement that calls down) draws the moment of that call.
    const step = shownStep(this.step());
    const language = this.language();
    return story.views.map((view) => ({
      view,
      summary: viewSummary(view, story, index, language),
      // Shown instead of "not created yet" when the local's call has already returned.
      gone: outOfScope(view, story, index),
      sequence: SEQUENCE_VIEWS.has(view.kind) ? sequenceModel(view, step, language) : null,
      map: view.kind === 'map' || view.kind === 'set' ? mapModel(view, step, language) : null,
      grid: view.kind === 'grid' ? gridModel(view, step, language) : null,
      calls:
        view.kind === 'calls'
          ? callsModel(view, step, language, callTimeline(story)[index], sentinelNames(story, step, language))
          : null,
      diagram:
        view.kind === 'tree'
          ? treeModel(view, step, language, { story, index })
          : view.kind === 'trie'
            ? trieModel(view, step, language, story)
            : view.kind === 'graph'
              ? graphModel(view, step, language, story)
              : view.kind === 'linked-list'
                ? linkedListModel(view, story, index, language)
                : null,
    }));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    // A different story starts from its first step.
    effect(() => {
      this.story();
      untracked(() => this.player.reset());
    });
    // Keep the current line visible inside the code box without moving the page.
    effect(() => {
      const number = this.currentLineNumber();
      const box = this.codeBox()?.nativeElement;
      if (!box || number === null) return;
      const line = box.querySelector<HTMLElement>(`[data-line="${number}"]`);
      if (!line) return;
      const top = line.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - line.offsetHeight * 2)
        box.scrollTop = Math.max(0, top - box.clientHeight / 3);
    });
    afterNextRender(() => {
      const Observer = this.view?.IntersectionObserver;
      if (!Observer) return;
      const observer = new Observer(
        (entries) => entries.forEach((entry) => this.player.setVisible(entry.isIntersecting)),
        { threshold: 0.25 },
      );
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => this.player.destroy());
  }

  protected selectLanguage(language: PatternLanguage): void {
    this.languageService.select(language);
  }
  protected languageKeys(event: KeyboardEvent, language: PatternLanguage): void {
    const index = this.languages.indexOf(language);
    const target =
      event.key === 'ArrowRight'
        ? this.languages[(index + 1) % this.languages.length]
        : event.key === 'ArrowLeft'
          ? this.languages[(index + this.languages.length - 1) % this.languages.length]
          : null;
    if (!target) return;
    event.preventDefault();
    this.selectLanguage(target);
    this.host.nativeElement
      .querySelector<HTMLButtonElement>(`[data-story-language="${target}"]`)
      ?.focus({ preventScroll: true });
  }
  protected keys(event: KeyboardEvent): void {
    const delta = traceArrowKey(event);
    if (!delta) return;
    event.preventDefault();
    if (delta < 0) this.player.previous();
    else this.player.next();
  }
  protected scrub(value: string): void {
    this.player.go(Number(value) - 1);
  }
  protected tones(tones: StoryTone[]): string {
    return tones.map((tone) => `tone-${tone}`).join(' ');
  }
  protected kindLabel(view: StoryView): string {
    return view.kind === 'calls' ? 'call stack' : view.kind === 'bits' ? 'binary' : view.kind.replace('-', ' ');
  }
  protected reversed<T>(items: T[]): T[] {
    return [...items].reverse();
  }
  /** The empty-reference word of the selected language: None, null or nil. */
  protected noneText(): string {
    return formatValue(null, this.language());
  }
}
