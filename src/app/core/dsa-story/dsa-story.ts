import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  untracked,
} from '@angular/core';
import {
  GuidedTraceCellState,
  PatternLanguage,
  PatternProblemV1,
} from '../../content/content.models';
import { ArrayVisual, CellTone, ListVisual } from '../guided-algorithm-trace/trace-visual';
import { ReferenceLanguageService } from '../reference-language';
import { traceSnapshot } from '../guided-algorithm-trace/trace-model';
import { TRACE_PLAY_INTERVAL_MS } from '../guided-algorithm-trace/trace-player';
import { WalkthroughPlayer } from '../walkthrough/walkthrough-player';
import { WalkthroughLineDetail } from '../walkthrough/walkthrough-line-detail';
import {
  WalkthroughApproach,
  WalkthroughExample,
  WalkthroughValue,
  codeLines,
  exampleLabel,
  firstSentence,
  hasLineTrace,
  lineView,
  referenceSource,
} from '../walkthrough/walkthrough.model';
import {
  DsaStoryV1,
  NodeDiagram,
  SequenceModel,
  StoryTone,
  StoryView,
  callTimeline,
  callsModel,
  displayName,
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

/** One drawn view of the stage: a story view, or a recorded-state view in Every line. */
interface StoryPanel {
  view: StoryView;
  /** The small word after the title ("array", "call stack", "recorded"). */
  kindLabel: string;
  focal: boolean;
  summary: string;
  /** Shown when the view's value does not exist at this step. */
  missingText: string;
  sequence: SequenceModel | null;
  cell: string | null;
  cellFit: string | null;
  map: ReturnType<typeof mapModel> | null;
  grid: ReturnType<typeof gridModel> | null;
  calls: ReturnType<typeof callsModel> | null;
  diagram: NodeDiagram | null;
  frame: ReturnType<typeof diagramFrame> | null;
}
let nextStoryId = 0;
/** Views drawn as a row (or column) of cells. */
const SEQUENCE_VIEWS = new Set<StoryView['kind']>(['array', 'stack', 'queue', 'string', 'number-line', 'bits']);
/**
 * Views that are the focal drawing when the story has other views beside them. A linked list is
 * not one: it is a long row, so it takes the whole width of the stage (review, 2026-10-06).
 */
const FOCAL_VIEWS = new Set<StoryView['kind']>(['tree', 'graph', 'trie', 'grid']);
/**
 * A node drawing never scales below this, so its smallest text (14 px labels in viewBox units)
 * renders at 12 px or more; a wider drawing scrolls inside its view instead of shrinking.
 */
const MIN_SCALE = 12 / 14;
const MAX_SCALE = 1.15;
/** Approximate rendered width of a label in viewBox units (bold sans, `size` px). */
function labelWidth(text: string, size: number): number {
  return text.length * size * 0.62;
}
/**
 * The viewBox that holds every node, pointer label, badge and the null marker: labels such as
 * `greater_dummy` over the first node are wider than the node and used to be cut at the edge.
 */
export function diagramFrame(model: NodeDiagram): {
  viewBox: string;
  width: number;
  min: number;
  max: number;
} {
  let left = 0;
  let right = model.width;
  let top = -34;
  let bottom = model.height;
  const span = (x: number, width: number) => {
    left = Math.min(left, x - width / 2 - 6);
    right = Math.max(right, x + width / 2 + 6);
  };
  const labels = (x: number, y: number, names: string[], below = false) =>
    names.forEach((name, row) => {
      span(x, labelWidth(name, 14));
      const at = below ? y + 40 + row * 16 : y - 32 - row * 16;
      top = Math.min(top, at - 12);
      bottom = Math.max(bottom, at + 12);
    });
  for (const node of model.nodes) {
    span(node.x, Math.max(48, labelWidth(node.text, 15)));
    labels(node.x, node.y, node.pointers, node.labelsBelow);
    if (node.badge) right = Math.max(right, node.x + 25 + labelWidth(node.badge, 14) + 6);
  }
  if (model.nullAt) {
    span(model.nullAt.x, labelWidth('null', 14));
    labels(model.nullAt.x, model.nullAt.y, model.nullPointers);
  }
  left = Math.floor(left);
  top = Math.floor(top);
  const width = Math.ceil(right) - left;
  const height = Math.ceil(bottom) - top;
  return {
    viewBox: `${left} ${top} ${width} ${height}`,
    width,
    min: Math.ceil(width * MIN_SCALE),
    max: Math.round(width * MAX_SCALE),
  };
}
/** A recorded cell's tone in the story's palette. */
const VISUAL_TONES: Record<Exclude<CellTone, null>, StoryTone> = {
  outside: 'dim',
  compare: 'compare',
  found: 'found',
  changed: 'new',
};
/** Base cell width (px) and the width a cell needs per character of its value at 16 px bold. */
const CELL_BASE = 52;
const CELL_PER_CHAR = 10.5;
const CELL_PADDING = 18;
/** The width (px) a row of cells needs so its longest value is never cut. */
function cellFit(texts: string[]): number {
  return Math.ceil(Math.max(0, ...texts.map((text) => text.length)) * CELL_PER_CHAR + CELL_PADDING);
}
const TRACE_TONES: Partial<Record<GuidedTraceCellState, StoryTone>> = {
  active: 'active',
  changed: 'new',
  boundary: 'compare',
  related: 'compare',
  resolved: 'found',
  discarded: 'dim',
};

/**
 * The Visual walkthrough of a problem (Option B story, laid out as "Code beside", user-approved
 * 2026-10-06): a hand-made, step-by-step animation of the one optimal reference solution, every
 * data structure drawn in sync, the values not already drawn under one caption, and the
 * reference code (Java | Python | Go, the page-wide choice) beside it highlighting the lines
 * each step ran. "Every line" turns the same player into the recorded line trace of the same
 * example; other examples step line by line. Nothing plays until the learner presses Play.
 */
@Component({
  selector: 'app-dsa-story',
  imports: [NgTemplateOutlet, WalkthroughPlayer, WalkthroughLineDetail],
  templateUrl: './dsa-story.html',
  styleUrl: './dsa-story.css',
  host: { class: 'option-b-story' },
})
export class DsaStory {
  readonly story = input.required<DsaStoryV1>();
  readonly problem = input.required<PatternProblemV1>();
  /** The walkthrough's example. Null (or one without a recorded trace) is the story's own. */
  readonly fixtureId = model<string | null>(null);
  /** Step through the recorded line trace instead of the story's steps. */
  readonly everyLine = model(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly languageService = inject(ReferenceLanguageService);
  protected readonly uid = `story-${++nextStoryId}`;
  protected readonly language = computed(() => this.languageService.selected());

  private readonly reducedMotion = (() => {
    try {
      return !!this.view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  })();
  protected readonly player = new StoryPlayer(
    () => this.story().steps.length,
    () => this.story().ms ?? STORY_STEP_MS,
    () => this.reducedMotion,
    null,
    { autoplay: false },
  );
  protected readonly linePlayer = new StoryPlayer(
    () => this.lineCount(),
    () => TRACE_PLAY_INTERVAL_MS,
    () => this.reducedMotion,
    null,
    { autoplay: false },
  );

  // ---------------------------------------------------------------- example and mode
  private readonly traced = computed(() => {
    const problem = this.problem();
    return new Set(
      [problem.trace, ...(problem.fixtureTraces ?? [])].filter(Boolean).map((trace) => trace.fixtureId),
    );
  });
  protected readonly examples = computed<WalkthroughExample[]>(() => {
    const story = this.story();
    return this.problem()
      .fixtures.filter((item) => item.id === story.fixtureId || this.traced().has(item.id))
      .map((item) => ({
        id: item.id,
        label: exampleLabel(item) + (item.id === story.fixtureId ? '' : ' (line by line)'),
      }));
  });
  protected readonly selectedFixtureId = computed(() => {
    const id = this.fixtureId();
    return id && this.examples().some((item) => item.id === id) ? id : this.story().fixtureId;
  });
  protected readonly fixture = computed(() => {
    const fixtures = this.problem().fixtures;
    return fixtures.find((item) => item.id === this.selectedFixtureId()) ?? fixtures[0];
  });
  private readonly storyFixture = computed(() =>
    this.problem().fixtures.find((item) => item.id === this.story().fixtureId),
  );
  /** The selected example is the one the story animates. */
  protected readonly animated = computed(() => this.selectedFixtureId() === this.story().fixtureId);
  /** A recorded line trace exists for the example in this language: show the switch. */
  protected readonly lineAvailable = computed(() =>
    hasLineTrace(this.problem(), this.selectedFixtureId(), this.language()),
  );
  protected readonly lineMode = computed(
    () => !this.animated() || (this.everyLine() && this.lineAvailable()),
  );
  protected readonly notice = computed(() => {
    if (this.animated()) return null;
    const story = this.storyFixture();
    const explanation = this.fixture().explanation?.trim();
    return (
      `Steps animate ${story?.input ?? 'the first example'}. This example runs line by line with its recorded values.` +
      (explanation ? ` ${explanation}` : '')
    );
  });
  protected readonly approach = computed<WalkthroughApproach>(() => {
    const story = this.story();
    const problem = this.problem();
    const fixture = this.fixture();
    const { time, space } = problem.complexity;
    const invariant = problem.invariantAdaptation?.trim() || problem.trace?.invariant?.trim() || '';
    return {
      summary: firstSentence(story.approach.variant),
      time,
      space,
      rows: [
        { label: 'Approach', text: story.approach.variant },
        { label: 'Why', text: story.approach.why },
        { label: 'Cost', text: `Time ${time} · Extra space ${space}` },
        ...(invariant ? [{ label: 'Invariant', text: invariant }] : []),
        ...(fixture.explanation
          ? [{ label: 'This example', text: `${fixture.input} → ${fixture.expectedOutput}. ${fixture.explanation}` }]
          : []),
      ],
    };
  });

  // ---------------------------------------------------------------- story steps
  protected readonly index = computed(() =>
    Math.min(this.player.index(), this.story().steps.length - 1),
  );
  protected readonly step = computed(() => this.story().steps[this.index()]);
  protected readonly count = computed(() => this.story().steps.length);
  private readonly drawnNames = computed(() => {
    const story = this.story();
    const language = this.language();
    return new Set(
      story.views
        .filter((view) => view.var && view.kind !== 'calls')
        .map((view) => displayName(story, view.var!, language)),
    );
  });
  private readonly storyValues = computed<WalkthroughValue[]>(() =>
    variableRows(this.story(), this.index(), this.language()).map((row) => ({
      ...row,
      drawn: !row.kind && this.drawnNames().has(row.name),
    })),
  );
  private readonly allLines = computed(() =>
    languageLines(this.problem(), this.story(), this.language()),
  );
  protected readonly panels = computed(() => {
    const story = this.story();
    const index = this.index();
    // A midline step (a one-line statement that calls down) draws the moment of that call.
    const step = shownStep(this.step());
    const language = this.language();
    const focal = story.views.length > 1 && story.views.some((view) => FOCAL_VIEWS.has(view.kind));
    return story.views.map((view): StoryPanel => {
      const sequence = SEQUENCE_VIEWS.has(view.kind) ? sequenceModel(view, step, language) : null;
      const fit = cellFit((sequence?.cells ?? []).map((cell) => cell.text));
      const diagram =
        view.kind === 'tree'
          ? treeModel(view, step, language, { story, index })
          : view.kind === 'trie'
            ? trieModel(view, step, language, story)
            : view.kind === 'graph'
              ? graphModel(view, step, language, story)
              : view.kind === 'linked-list'
                ? linkedListModel(view, story, index, language)
                : null;
      return {
        view,
        kindLabel: this.kindLabel(view),
        focal: focal && FOCAL_VIEWS.has(view.kind),
        summary: viewSummary(view, story, index, language),
        // "no longer in scope" instead of "not created yet" once the local's call has returned.
        missingText: outOfScope(view, story, index) ? 'no longer in scope' : 'not created yet',
        sequence,
        // Every cell of a row shares one width wide enough for its longest value, so values are
        // never cut ("TreeNode(9)", not "Tre…") and the pointers stay under their cells.
        cell: sequence && view.cell ? `${Math.max(view.cell, fit)}px` : null,
        cellFit: sequence && !view.cell && fit > CELL_BASE ? `${fit}px` : null,
        map: view.kind === 'map' || view.kind === 'set' ? mapModel(view, step, language) : null,
        grid: view.kind === 'grid' ? gridModel(view, step, language) : null,
        calls:
          view.kind === 'calls'
            ? callsModel(view, step, language, callTimeline(story)[index], sentinelNames(story, step, language))
            : null,
        diagram,
        frame: diagram && !diagram.missing ? diagramFrame(diagram) : null,
      };
    });
  });
  protected readonly focalPanels = computed(() => this.panels().filter((panel) => panel.focal));
  protected readonly sidePanels = computed(() => this.panels().filter((panel) => !panel.focal));
  /**
   * The width the focal drawing needs to keep its text at 12 px or more. When the stage cannot
   * give it that and still fit the side column, the side column wraps below it.
   */
  protected readonly focalMin = computed(() => {
    const widths = this.focalPanels().map((panel) => panel.frame?.min ?? 0);
    return `${Math.max(300, ...widths)}px`;
  });

  // ---------------------------------------------------------------- every line
  protected readonly lineCount = computed(
    () => traceSnapshot(this.problem(), this.selectedFixtureId(), this.language(), 0).events.length,
  );
  protected readonly lineIndex = computed(() =>
    Math.min(this.linePlayer.index(), Math.max(0, this.lineCount() - 1)),
  );
  protected readonly line = computed(() =>
    this.lineMode() ? lineView(this.problem(), this.fixture(), this.language(), this.lineIndex()) : null,
  );
  /**
   * Every line draws the recorded state with the story's own cells and nodes, so the drawing keeps
   * one look when the switch flips: the recorded arrays with their index pointers, the recorded
   * list, or else the recorded rows (or array locals) as plain rows of cells.
   */
  protected readonly linePanels = computed<StoryPanel[]>(() => {
    const line = this.line();
    if (!line?.snapshot.event) return [];
    if (line.visual === 'array') return line.arrays.map((array, index) => arrayPanel(array, index));
    if (line.visual === 'list' && line.list) return [listPanel(line.list, line.label, this.noneText())];
    return line.rows.map((row, index) =>
      sequencePanel(
        `row-${index}`,
        row.label,
        row.cells.map((cell, cellIndex) => ({
          key: String(cellIndex),
          index: cellIndex,
          text: cell.value,
          tones: (cell.states ?? [])
            .map((state) => TRACE_TONES[state])
            .filter((tone): tone is StoryTone => !!tone),
        })),
        [],
      ),
    );
  });

  // ---------------------------------------------------------------- what the player shows
  protected readonly shownIndex = computed(() => (this.lineMode() ? this.lineIndex() : this.index()));
  protected readonly shownCount = computed(() =>
    this.lineMode() ? Math.max(1, this.lineCount()) : this.count(),
  );
  protected readonly playing = computed(() =>
    this.lineMode() ? this.linePlayer.playing() : this.player.playing(),
  );
  protected readonly caption = computed(() => this.line()?.caption ?? fillSay(this.step(), this.language()));
  protected readonly values = computed(() => this.line()?.values ?? this.storyValues());
  protected readonly code = computed(() => {
    const line = this.line();
    if (line) return codeLines(this.problem(), this.language(), line.current, line.ran);
    const { current, ran } = this.allLines()[this.index()] ?? { current: null, ran: [] };
    return codeLines(this.problem(), this.language(), current, ran);
  });
  protected readonly source = computed(() => referenceSource(this.problem(), this.language()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    // A different story starts from its first step.
    effect(() => {
      this.story();
      untracked(() => {
        this.player.reset();
        this.linePlayer.reset();
      });
    });
    // Another example or language restarts the line trace, as the old debugger did.
    effect(() => {
      this.selectedFixtureId();
      this.language();
      untracked(() => this.linePlayer.reset());
    });
    // A drawing wider or taller than its box scrolls inside it: keep what this step marks in view.
    effect(() => {
      this.shownIndex();
      this.lineMode();
      this.language();
      untracked(() => afterFrame(this.view, () => this.revealMarks()));
    });
    // Switching between Steps and Every line pauses whichever player was running.
    effect(() => {
      this.lineMode();
      untracked(() => {
        this.player.pause();
        this.linePlayer.pause();
      });
    });
    afterNextRender(() => {
      const Observer = this.view?.IntersectionObserver;
      if (!Observer) return;
      const observer = new Observer(
        (entries) =>
          entries.forEach((entry) => {
            this.player.setVisible(entry.isIntersecting);
            this.linePlayer.setVisible(entry.isIntersecting);
          }),
        { threshold: 0.1 },
      );
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => {
      this.player.destroy();
      this.linePlayer.destroy();
    });
  }

  /**
   * A long list or a wide tree keeps 12 px text by scrolling inside its view, and a stage with
   * many views scrolls inside the player: bring the cells, nodes or pointers this step marks into
   * view when none of them is visible (the page itself never moves).
   */
  private revealMarks(): void {
    const stage = this.host.nativeElement.querySelector<HTMLElement>('.wt-stage');
    if (!stage) return;
    const smooth = this.reducedMotion ? 'auto' : 'smooth';
    const marked = (scope: Element) => [
      ...scope.querySelectorAll<Element>('.tone-active, .tone-compare, .tone-found, .tone-new'),
    ];
    for (const drawing of stage.querySelectorAll<HTMLElement>('.drawing')) {
      if (drawing.scrollWidth <= drawing.clientWidth + 1) continue;
      const marks = marked(drawing);
      const targets = marks.length ? marks : [...drawing.querySelectorAll('.pointer-label, .pointer:not(.past)')];
      if (!targets.length) continue;
      const box = drawing.getBoundingClientRect();
      const rects = targets.map((item) => item.getBoundingClientRect());
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      if (left >= box.left && right <= box.right) continue;
      const centre = (left + right) / 2 - box.left + drawing.scrollLeft;
      const target = right - left > box.width ? left - box.left + drawing.scrollLeft - 16 : centre - box.width / 2;
      drawing.scrollTo({ left: Math.max(0, target), behavior: smooth });
    }
    if (stage.scrollHeight <= stage.clientHeight + 1) return;
    const view = stage.getBoundingClientRect();
    const marks = marked(stage);
    const seen = marks.some((item) => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > view.top && rect.top < view.bottom;
    });
    const first = marks[0]?.closest('figure');
    if (seen || !first) return;
    const top = stage.scrollTop + first.getBoundingClientRect().top - view.top - 8;
    stage.scrollTo({ top: Math.max(0, top), behavior: smooth });
  }

  protected selectLanguage(language: PatternLanguage): void {
    this.languageService.select(language);
  }
  protected selectExample(id: string): void {
    this.fixtureId.set(id);
    if (id === this.story().fixtureId) this.everyLine.set(false);
  }
  /** Steps on another example returns to the animated one; Every line keeps the example. */
  protected setEveryLine(on: boolean): void {
    if (!on && !this.animated()) this.fixtureId.set(this.story().fixtureId);
    this.everyLine.set(on);
  }
  protected go(index: number): void {
    (this.lineMode() ? this.linePlayer : this.player).go(index);
  }
  protected toggle(): void {
    (this.lineMode() ? this.linePlayer : this.player).toggle();
  }
  /** An idea in the jump list: its first story step. */
  protected jumpToIdea(idea: number): void {
    const target = this.story().steps.findIndex((step) => step.idea === idea);
    if (target < 0) return;
    if (!this.animated()) this.fixtureId.set(this.story().fixtureId);
    if (this.everyLine()) this.everyLine.set(false);
    this.player.go(target);
  }
  /** Types the shared view template's context (one figure markup for every column and mode). */
  protected asPanel(item: unknown): StoryPanel {
    return item as StoryPanel;
  }
  protected tones(tones: StoryTone[]): string {
    return tones.map((tone) => `tone-${tone}`).join(' ');
  }
  private kindLabel(view: StoryView): string {
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

/** A recorded row of cells (Every line) in the shape of a story view. */
function sequencePanel(
  id: string,
  title: string,
  cells: SequenceModel['cells'],
  pointers: SequenceModel['pointers'],
  missing = false,
): StoryPanel {
  const fit = cellFit(cells.map((cell) => cell.text));
  const pointed = pointers.map((pointer) => `${pointer.label} ${pointer.past ? 'at the end' : `at index ${pointer.index}`}`);
  return {
    view: { id, kind: 'array', title },
    kindLabel: 'recorded',
    focal: false,
    summary: missing
      ? `${title}: no recorded value at this line.`
      : `${title}: ${cells.map((cell) => cell.text).join(', ') || 'empty'}.${pointed.length ? ` ${pointed.join(', ')}.` : ''}`,
    missingText: 'no recorded value at this line',
    sequence: { kind: 'array', missing, cells, pointers },
    cell: null,
    cellFit: fit > CELL_BASE ? `${fit}px` : null,
    map: null,
    grid: null,
    calls: null,
    diagram: null,
    frame: null,
  };
}
function arrayPanel(array: ArrayVisual, index: number): StoryPanel {
  const cells = array.cells.map((cell, cellIndex) => ({
    key: String(cellIndex),
    index: cellIndex,
    text: cell.value,
    tones: cell.tone ? [VISUAL_TONES[cell.tone]] : [],
  }));
  const pointers: SequenceModel['pointers'] = [];
  for (const pointer of array.pointers) {
    if (pointer.index === null || pointer.index < 0 || pointer.index > cells.length) continue;
    pointers.push({
      label: pointer.name,
      index: pointer.index,
      slot: pointer.index,
      past: pointer.index === cells.length,
      row: pointers.filter((item) => item.slot === pointer.index).length,
    });
  }
  return sequencePanel(`array-${index}`, array.name, cells, pointers, array.pending);
}
/** The recorded list as the story draws a list: one slot per node, pointers above. */
function listPanel(list: ListVisual, label: string, none: string): StoryPanel {
  const gap = 84;
  const y = 70;
  const radius = 22;
  const x = (slot: number) => 40 + slot * gap;
  const names = (slot: number) => list.pointers.filter((pointer) => pointer.index === slot).map((pointer) => pointer.name);
  const nodes = list.nodes.map((node, slot) => ({
    id: `n${slot}`,
    x: x(slot),
    y,
    text: node.value,
    tones: node.tone ? [VISUAL_TONES[node.tone]] : [],
    pointers: names(slot),
  }));
  const edges: NodeDiagram['edges'] = nodes.slice(0, -1).map((node, slot) => ({
    id: `${node.id}-next`,
    from: node.id,
    to: nodes[slot + 1].id,
    path: `M${node.x + radius} ${y}H${nodes[slot + 1].x - radius - 4}`,
    directed: true,
  }));
  const last = nodes.at(-1);
  const target = list.cycleTo === null ? null : nodes[list.cycleTo];
  if (last && target) {
    const path =
      target === last
        ? `M${last.x - 10} ${y + radius - 2}C${last.x - 34} ${y + 64} ${last.x + 34} ${y + 64} ${last.x + 10} ${y + radius + 3}`
        : `M${last.x} ${y + radius}C${last.x} ${y + 68} ${target.x} ${y + 68} ${target.x} ${y + radius + 4}`;
    edges.push({ id: `${last.id}-cycle`, from: last.id, to: target.id, path, directed: true, tone: 'compare' });
  } else if (last) {
    edges.push({ id: `${last.id}-null`, from: last.id, to: 'null', path: `M${last.x} ${y + radius}v16h-10m10 0h10`, directed: false });
  }
  const diagram: NodeDiagram = {
    missing: !nodes.length,
    width: x(nodes.length) + 40,
    height: target ? 170 : 150,
    nodes,
    edges,
    nullPointers: [],
    nullAt: target || !last ? null : { x: x(nodes.length), y },
  };
  const cycle = target && last ? ` The last node links back to ${target.text}: a cycle.` : '';
  return {
    view: { id: 'list', kind: 'linked-list', title: 'Linked list' },
    kindLabel: target ? 'recorded · cycle' : 'recorded',
    focal: false,
    summary: `${label || `Linked list: ${nodes.map((node) => node.text).join(' → ')} → ${none}.`}${cycle}`,
    missingText: 'no recorded value at this line',
    sequence: null,
    cell: null,
    cellFit: null,
    map: null,
    grid: null,
    calls: null,
    diagram,
    frame: diagram.missing ? null : diagramFrame(diagram),
  };
}

/** Runs a DOM read after Angular has rendered the step (a no-op without a window). */
function afterFrame(view: Window | null, task: () => void): void {
  if (view?.requestAnimationFrame) view.requestAnimationFrame(() => task());
}
