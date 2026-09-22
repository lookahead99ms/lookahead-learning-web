import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudyDeskEntry } from './study-desk-model';

@Component({
  selector: 'app-study-desk',
  imports: [RouterLink],
  templateUrl: './study-desk.html',
  styleUrl: './study-desk.css',
})
export class StudyDesk {
  readonly entries = input.required<StudyDeskEntry[]>();
  readonly resume = input<StudyDeskEntry | null>(null);
  readonly planKey = input.required<string>();
  readonly locked = input(false);
  readonly initialActivity = input('');
  readonly selectedDay = input.required<number>();
  readonly complete = output<StudyDeskEntry>();
  readonly record = output<{
    entry: StudyDeskEntry;
    outcome: 'attempted' | 'needs-review' | 'completed';
  }>();
  readonly note = output<{ entry: StudyDeskEntry; text: string }>();
  readonly selectDay = output<number>();
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly selectedId = signal('');
  protected readonly pathOpen = signal(
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 641px)').matches
      : true,
  );
  protected readonly expandedTopics = signal(new Set<string>());
  protected readonly dayEntries = computed(() =>
    this.entries().filter((entry) => entry.day === this.selectedDay() && !entry.outsideWindow),
  );
  protected readonly selected = computed(
    () =>
      this.entries().find((entry) => entry.assignment.id === this.selectedId()) ??
      this.entries().find((entry) => entry.assignment.id === this.initialActivity()) ??
      this.dayEntries().find(
        (entry) => entry.assignment.id === this.resume()?.assignment.id,
      ) ??
      this.dayEntries()[0] ??
      this.resume() ??
      this.entries()[0] ??
      null,
  );
  protected readonly topics = computed(() => {
    const topics = new Map<
      string,
      {
        id: string;
        title: string;
        items: { id: string; title: string; entries: StudyDeskEntry[] }[];
      }
    >();
    for (const entry of this.entries()) {
      const assignment = entry.assignment;
      let topic = topics.get(assignment.topicId);
      if (!topic) {
        topic = { id: assignment.topicId, title: assignment.topicTitle, items: [] };
        topics.set(topic.id, topic);
      }
      let item = topic.items.find((item) => item.id === entry.sourceId);
      if (!item) {
        item = { id: entry.sourceId, title: assignment.title, entries: [] };
        topic.items.push(item);
      }
      item.entries.push(entry);
    }
    return [...topics.values()];
  });
  protected readonly browsing = computed(
    () => !!this.resume() && this.selected()?.assignment.id !== this.resume()?.assignment.id,
  );
  private ownerKey = '';
  private readonly writeFocus = signal<{
    action: string;
    assignmentId: string;
    owner: string;
  } | null>(null);
  constructor() {
    effect(() => {
      const key = this.planKey();
      if (key !== this.ownerKey) {
        this.ownerKey = key;
        this.selectedId.set('');
        this.expandedTopics.set(new Set());
      }
    });
    effect(() => {
      const target = this.writeFocus();
      if (!target || this.locked()) return;
      this.writeFocus.set(null);
      afterNextRender(
        () => {
          if (
            this.planKey() === target.owner &&
            this.selected()?.assignment.id === target.assignmentId
          )
            this.host.nativeElement
              .querySelector<HTMLButtonElement>(`[data-desk-action="${target.action}"]`)
              ?.focus();
        },
        { injector: this.injector },
      );
    });
  }
  protected topicOpen(id: string): boolean {
    return (
      this.expandedTopics().has(id) ||
      (!this.expandedTopics().has(`closed:${id}`) && this.selected()?.assignment.topicId === id)
    );
  }
  protected toggleTopic(id: string): void {
    const open = this.topicOpen(id);
    this.expandedTopics.update((current) => {
      const next = new Set(current);
      next.delete(id);
      next.delete(`closed:${id}`);
      next.add(open ? `closed:${id}` : id);
      return next;
    });
  }
  protected sequenceFor(entry: StudyDeskEntry): StudyDeskEntry[] {
    return this.entries()
      .filter((candidate) => candidate.sourceId === entry.sourceId)
      .sort((left, right) => left.day - right.day);
  }
  protected browse(entry: StudyDeskEntry, moveFocus = false, moveDay = false): void {
    this.selectedId.set(entry.assignment.id);
    if (moveDay && entry.day !== this.selectedDay()) this.selectDay.emit(entry.day);
    this.expandedTopics.update((current) => {
      const next = new Set(current);
      next.delete(`closed:${entry.assignment.topicId}`);
      next.add(entry.assignment.topicId);
      return next;
    });
    if (moveFocus) this.focusActivity(entry.assignment.id);
  }
  protected toggleComplete(entry: StudyDeskEntry): void {
    // Pin the viewed session while the parent's authoritative progress response updates Resume.
    this.selectedId.set(entry.assignment.id);
    this.writeFocus.set({
      action: `complete-${entry.assignment.id}`,
      assignmentId: entry.assignment.id,
      owner: this.planKey(),
    });
    this.complete.emit(entry);
  }
  protected recordOutcome(
    entry: StudyDeskEntry,
    outcome: 'attempted' | 'needs-review' | 'completed',
  ): void {
    this.selectedId.set(entry.assignment.id);
    this.writeFocus.set({
      action: `${outcome}-${entry.assignment.id}`,
      assignmentId: entry.assignment.id,
      owner: this.planKey(),
    });
    this.record.emit({ entry, outcome });
  }
  protected openMaterialLabel(entry: StudyDeskEntry): string {
    switch (entry.assignment.contentType) {
      case 'theory':
      case 'dsa-pattern':
      case 'guide':
      case 'language-comparison':
        return 'Open lesson';
      case 'q-and-a':
        return 'Open question';
      case 'dsa-problem':
        return 'Open problem';
      default:
        return 'Open material';
    }
  }
  protected offeringLabel(entry: StudyDeskEntry): string {
    const { courseTitle, topicTitle } = entry.assignment;
    return courseTitle === topicTitle ? courseTitle : `${courseTitle} · ${topicTitle}`;
  }
  focusDayHeading(): void {
    const focusHeading = () => {
      const heading = this.host.nativeElement.querySelector<HTMLElement>('#desk-day-heading');
      heading?.focus();
      heading?.scrollIntoView?.({ block: 'start' });
      return !!heading;
    };
    if (!focusHeading()) afterNextRender(focusHeading, { injector: this.injector });
  }
  private focusActivity(assignmentId: string): void {
    afterNextRender(
      () =>
        [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-desk-activity]')]
          .find((element) => element.dataset['deskActivity'] === assignmentId)
          ?.focus(),
      { injector: this.injector },
    );
  }
}
