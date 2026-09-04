import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentService } from '../../content/content.service';
import {
  DeliveryEditorService,
  DeliverySnapshot,
  DeliveryWorkItemInput,
} from '../../content/delivery-editor.service';
import {
  DeliveryDecision,
  DeliveryPlan,
  DeliveryPriority,
  DeliveryStage,
  DeliveryWorkItem,
  DeliveryWorkItemType,
  DeliveryWorkflowState,
} from '../../content/delivery-plan.models';
import { PlatformHeader } from '../../core/platform-header/platform-header';

type DeliveryView = 'board' | 'roadmap' | 'decisions';
type WorkItemDraft = Omit<
  DeliveryWorkItemInput,
  'labels' | 'acceptanceCriteria' | 'dependencies' | 'blockedBy' | 'notes'
> & {
  labels: string;
  acceptanceCriteria: string;
  dependencies: string;
  blockedBy: string;
  notes: string;
};

@Component({
  selector: 'app-delivery-plan',
  imports: [PlatformHeader, RouterLink, FormsModule],
  templateUrl: './delivery-plan.html',
  styleUrl: './delivery-plan.css',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class DeliveryPlanPage implements OnInit {
  private readonly content = inject(ContentService);
  private readonly editor = inject(DeliveryEditorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workItemDialog = viewChild<ElementRef<HTMLDialogElement>>('workItemDialog');
  private readonly editorDialog = viewChild<ElementRef<HTMLDialogElement>>('editorDialog');
  private revision = '';
  private draftRevision = '';
  private initialDraft = '';
  private refreshPending = false;
  private writeGeneration = 0;
  private backdropPointerStart: HTMLDialogElement | null = null;
  protected readonly editable = signal(false);
  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly saveError = signal('');
  protected readonly conflict = signal(false);
  protected readonly discardRequested = signal(false);
  protected readonly draggedItemId = signal<string | null>(null);
  protected readonly dropTarget = signal<string | null>(null);
  protected draft: WorkItemDraft | null = null;
  protected draftId: string | undefined;

  protected readonly plan = signal<DeliveryPlan | null>(null);
  protected readonly error = signal('');
  protected readonly view = signal<DeliveryView>('board');
  protected readonly query = signal('');
  protected readonly stageFilter = signal('current');
  protected readonly priorityFilter = signal('all');
  protected readonly typeFilter = signal<'all' | DeliveryWorkItemType>('all');
  protected readonly selectedWorkItem = signal<DeliveryWorkItem | null>(null);
  protected readonly workItemTypes: { id: DeliveryWorkItemType; label: string }[] = [
    { id: 'epic', label: 'Epic' },
    { id: 'story', label: 'Story' },
    { id: 'task', label: 'Task' },
    { id: 'bug', label: 'Defect' },
    { id: 'spike', label: 'Research' },
    { id: 'decision', label: 'Decision' },
  ];

  protected readonly filteredItems = computed(() => {
    const plan = this.plan();
    if (!plan) return [];
    const query = this.query().trim().toLowerCase();
    return plan.workItems.filter((item) => {
      const matchesQuery =
        !query ||
        [item.id, item.title, item.summary, ...item.labels].join(' ').toLowerCase().includes(query);
      const requestedStage = this.stageFilter();
      const matchesStage =
        requestedStage === 'all' ||
        (requestedStage === 'current' && item.stageId === plan.currentStageId) ||
        item.stageId === requestedStage;
      const matchesPriority =
        this.priorityFilter() === 'all' || item.priorityId === this.priorityFilter();
      const matchesType = this.typeFilter() === 'all' || item.type === this.typeFilter();
      return matchesQuery && matchesStage && matchesPriority && matchesType;
    });
  });

  protected readonly activeStage = computed(() => {
    const plan = this.plan();
    return plan?.stages.find((stage) => stage.id === plan.currentStageId) ?? null;
  });

  protected readonly completedCount = computed(
    () => this.plan()?.workItems.filter((item) => item.statusId === 'done').length ?? 0,
  );
  protected readonly blockedCount = computed(
    () => this.plan()?.workItems.filter((item) => item.blockedBy.length > 0).length ?? 0,
  );
  protected readonly activeCount = computed(
    () => this.plan()?.workItems.filter((item) => item.statusId === 'in-progress').length ?? 0,
  );
  protected readonly completionPercent = computed(() => {
    const total = this.plan()?.workItems.length ?? 0;
    return total ? Math.round((this.completedCount() / total) * 100) : 0;
  });

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const requestedView = params.get('view');
      this.view.set(
        requestedView === 'roadmap' || requestedView === 'decisions' ? requestedView : 'board',
      );
      this.query.set(params.get('q') ?? '');
      this.stageFilter.set(params.get('stage') ?? 'current');
      this.priorityFilter.set(params.get('priority') ?? 'all');
      const type = params.get('type');
      this.typeFilter.set(
        this.workItemTypes.some((candidate) => candidate.id === type)
          ? (type as DeliveryWorkItemType)
          : 'all',
      );
    });

    this.editor
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.editable.set(true);
          this.acceptSnapshot(snapshot);
          const interval = window.setInterval(() => this.refreshPlan(true), 5000);
          this.destroyRef.onDestroy(() => window.clearInterval(interval));
        },
        error: (error: HttpErrorResponse) => {
          if ([0, 200, 404, 502, 503, 504].includes(error.status)) {
            this.content
              .getDeliveryPlan()
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (plan) => this.plan.set(plan),
                error: () =>
                  this.error.set(
                    'The delivery plan could not be loaded. Sync private content and try again.',
                  ),
              });
          } else {
            this.error.set(
              'The local editor could not read the private plan. Check its JSON and the server terminal before saving.',
            );
          }
        },
      });
  }

  private acceptSnapshot(snapshot: DeliverySnapshot): void {
    this.plan.set(snapshot.plan);
    this.revision = snapshot.revision;
    const selected = this.selectedWorkItem();
    if (selected)
      this.selectedWorkItem.set(
        snapshot.plan.workItems.find((item) => item.id === selected.id) ?? null,
      );
    const stage = this.stageFilter();
    if (
      !['all', 'current'].includes(stage) &&
      !snapshot.plan.stages.some((entry) => entry.id === stage)
    ) {
      this.stageFilter.set('current');
      this.syncUrl();
    }
  }

  protected refreshPlan(quiet = false): void {
    if (!this.editable() || this.saving() || this.refreshPending) return;
    this.refreshPending = true;
    const generation = this.writeGeneration;
    this.editor
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.refreshPending = false;
          if (generation !== this.writeGeneration) return;
          if (snapshot.revision !== this.revision) {
            this.acceptSnapshot(snapshot);
            this.notice.set(
              this.draft
                ? 'The file changed. Your draft is preserved; saving will check for conflicts.'
                : 'Board refreshed from the private JSON.',
            );
          } else if (!quiet) this.notice.set('Board is up to date.');
        },
        error: () => {
          this.refreshPending = false;
          this.notice.set(
            'Cannot reach the local editor. Current data is retained; unsaved changes are not on disk.',
          );
        },
      });
  }

  protected evidenceUrl(itemId: string, evidenceId: string): string {
    return `/__local/delivery/evidence/${encodeURIComponent(itemId)}/${encodeURIComponent(evidenceId)}`;
  }

  protected openEditor(item?: DeliveryWorkItem): void {
    if (!this.editable() || this.saving()) return;
    const plan = this.plan()!;
    this.closeWorkItem();
    this.draftId = item?.id;
    this.draftRevision = this.revision;
    this.draft = {
      title: item?.title ?? '',
      summary: item?.summary ?? '',
      type: item?.type ?? 'story',
      stageId:
        item?.stageId ??
        (plan.stages.some((stage) => stage.id === this.stageFilter())
          ? this.stageFilter()
          : plan.currentStageId),
      statusId: item?.statusId ?? plan.workflow[0].id,
      priorityId:
        item?.priorityId ??
        (plan.priorities.find((priority) => priority.id === 'P2') ?? plan.priorities[0]).id,
      labels: item?.labels.join(', ') ?? '',
      acceptanceCriteria: item?.acceptanceCriteria.join('\n') ?? '',
      dependencies: item?.dependencies.join(', ') ?? '',
      blockedBy: item?.blockedBy.join(', ') ?? '',
      notes: item?.notes?.join('\n') ?? '',
    };
    this.initialDraft = JSON.stringify(this.draft);
    this.saveError.set('');
    this.conflict.set(false);
    this.discardRequested.set(false);
    queueMicrotask(() => {
      const dialog = this.editorDialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  protected closeEditor(discard = false): void {
    if (this.saving()) return;
    if (!discard && this.hasUnsavedDraft()) {
      this.discardRequested.set(true);
      return;
    }
    this.editorDialog()?.nativeElement.close();
    this.draft = null;
    this.discardRequested.set(false);
  }

  private hasUnsavedDraft(): boolean {
    return this.draft !== null && JSON.stringify(this.draft) !== this.initialDraft;
  }

  canDeactivate(): boolean {
    if (this.saving()) {
      this.notice.set('Wait for the current save to finish before leaving the board.');
      return false;
    }
    return (
      !this.hasUnsavedDraft() ||
      window.confirm('Discard your unsaved changes and leave the delivery board?')
    );
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.saving() && !this.hasUnsavedDraft()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  protected cancelEditor(event: Event): void {
    event.preventDefault();
    this.closeEditor();
  }

  protected reloadDraft(): void {
    if (this.saving()) return;
    this.editor
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.acceptSnapshot(snapshot);
          if (!this.draftId) {
            this.draftRevision = snapshot.revision;
            this.conflict.set(false);
            this.saveError.set('');
            return;
          }
          const item = snapshot.plan.workItems.find((entry) => entry.id === this.draftId);
          if (item) this.openEditor(item);
          else
            this.saveError.set(
              'This item was removed from the JSON. Keep your text before closing this draft.',
            );
        },
        error: () =>
          this.saveError.set('Could not load the latest item. Your draft is still here.'),
      });
  }

  protected saveDraft(): void {
    if (!this.draft || this.saving()) return;
    const split = (text: string, delimiter: string) => [
      ...new Set(
        text
          .split(delimiter)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const input: DeliveryWorkItemInput = {
      ...this.draft,
      labels: split(this.draft.labels, ','),
      acceptanceCriteria: split(this.draft.acceptanceCriteria, '\n'),
      dependencies: split(this.draft.dependencies, ','),
      blockedBy: split(this.draft.blockedBy, ','),
      notes: split(this.draft.notes, '\n'),
    };
    if (!input.title.trim() || !input.summary.trim() || !input.acceptanceCriteria.length) {
      this.saveError.set('Add a title, an outcome, and at least one acceptance criterion.');
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    this.writeGeneration++;
    this.editor
      .save(this.draftRevision, input, this.draftId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.acceptSnapshot(snapshot);
          this.saving.set(false);
          this.closeEditor(true);
          this.notice.set(
            `${snapshot.workItemId} saved to private JSON. No commit or push was made.`,
          );
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.conflict.set(error.status === 409);
          this.saveError.set(
            error.error?.message ??
              'Save failed. Your draft is retained; check the local server and retry.',
          );
        },
      });
  }

  protected moveItem(item: DeliveryWorkItem, statusId: string): void {
    if (!this.editable() || this.saving() || item.statusId === statusId) return;
    const {
      title,
      summary,
      type,
      stageId,
      priorityId,
      labels,
      acceptanceCriteria,
      dependencies,
      blockedBy,
    } = item;
    this.saving.set(true);
    this.writeGeneration++;
    this.editor
      .save(
        this.revision,
        {
          title,
          summary,
          type,
          stageId,
          statusId,
          priorityId,
          labels,
          acceptanceCriteria,
          dependencies,
          blockedBy,
          notes: item.notes ?? [],
        },
        item.id,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.acceptSnapshot(snapshot);
          this.saving.set(false);
          this.notice.set(
            `${item.id} moved to ${snapshot.plan.workflow.find((status) => status.id === statusId)?.label} and saved.`,
          );
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.notice.set(
            error.status === 409
              ? 'Move not saved: the plan changed. Refresh the board, then try again.'
              : 'Move could not be saved. The item stays in its original column.',
          );
        },
      });
  }

  protected moveFromSelect(item: DeliveryWorkItem, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const status = select.value;
    select.value = item.statusId;
    this.moveItem(item, status);
  }

  protected startDrag(event: DragEvent, item: DeliveryWorkItem): void {
    if (!this.editable() || this.saving()) {
      event.preventDefault();
      return;
    }
    this.draggedItemId.set(item.id);
    event.dataTransfer?.setData('text/plain', item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected dragOver(event: DragEvent, statusId: string): void {
    if (!this.draggedItemId() || this.saving()) return;
    event.preventDefault();
    this.dropTarget.set(statusId);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected dropItem(event: DragEvent, statusId: string): void {
    event.preventDefault();
    const item = this.plan()?.workItems.find((entry) => entry.id === this.draggedItemId());
    this.endDrag();
    if (item) this.moveItem(item, statusId);
  }

  protected endDrag(): void {
    this.draggedItemId.set(null);
    this.dropTarget.set(null);
  }

  protected setView(view: DeliveryView): void {
    this.view.set(view);
    this.syncUrl();
  }

  protected updateQuery(value: string): void {
    this.query.set(value);
    this.syncUrl();
  }

  protected setStageFilter(value: string): void {
    this.stageFilter.set(value);
    this.syncUrl();
  }

  protected setPriorityFilter(value: string): void {
    this.priorityFilter.set(value);
    this.syncUrl();
  }

  protected setTypeFilter(value: string): void {
    this.typeFilter.set(value as 'all' | DeliveryWorkItemType);
    this.syncUrl();
  }

  protected resetView(): void {
    this.query.set('');
    this.stageFilter.set('current');
    this.priorityFilter.set('all');
    this.typeFilter.set('all');
    this.syncUrl();
  }

  protected itemsForStatus(statusId: string): DeliveryWorkItem[] {
    return this.filteredItems().filter((item) => item.statusId === statusId);
  }

  protected totalForStatus(statusId: string): number {
    return this.plan()?.workItems.filter((item) => item.statusId === statusId).length ?? 0;
  }

  protected itemsForStage(stageId: string): DeliveryWorkItem[] {
    return this.plan()?.workItems.filter((item) => item.stageId === stageId) ?? [];
  }

  protected completedForStage(stageId: string): number {
    return this.itemsForStage(stageId).filter((item) => item.statusId === 'done').length;
  }

  protected stageProgress(stageId: string): number {
    const items = this.itemsForStage(stageId);
    return items.length
      ? Math.round((items.filter((item) => item.statusId === 'done').length / items.length) * 100)
      : 0;
  }

  protected stageFor(item: DeliveryWorkItem): DeliveryStage | undefined {
    return this.plan()?.stages.find((stage) => stage.id === item.stageId);
  }

  protected priorityFor(item: DeliveryWorkItem): DeliveryPriority | undefined {
    return this.plan()?.priorities.find((priority) => priority.id === item.priorityId);
  }

  protected workflowFor(item: DeliveryWorkItem): DeliveryWorkflowState | undefined {
    return this.plan()?.workflow.find((status) => status.id === item.statusId);
  }

  protected typeLabel(type: DeliveryWorkItemType): string {
    return this.workItemTypes.find((candidate) => candidate.id === type)?.label ?? type;
  }

  protected stageStateLabel(state: DeliveryStage['state']): string {
    return state.replace('-', ' ');
  }

  protected decisionStateLabel(state: DeliveryDecision['state']): string {
    return state.replace('-', ' ');
  }

  protected columnExceedsLimit(status: DeliveryWorkflowState): boolean {
    return !!status.wipLimit && this.totalForStatus(status.id) > status.wipLimit;
  }

  protected openWorkItem(item: DeliveryWorkItem): void {
    this.selectedWorkItem.set(item);
    queueMicrotask(() => this.workItemDialog()?.nativeElement.showModal());
  }

  protected closeWorkItem(): void {
    this.workItemDialog()?.nativeElement.close();
    this.selectedWorkItem.set(null);
  }

  protected rememberDialogPointerStart(event: PointerEvent): void {
    this.backdropPointerStart =
      event.button === 0 && this.isDialogBackdrop(event)
        ? (event.currentTarget as HTMLDialogElement)
        : null;
  }

  protected dismissDialogBackdrop(event: MouseEvent, editor = false): void {
    const startedOutside = this.backdropPointerStart === event.currentTarget;
    this.backdropPointerStart = null;
    // Requiring both ends outside prevents text-selection drags from dismissing the ticket.
    if (!startedOutside || !this.isDialogBackdrop(event)) return;
    if (editor) this.closeEditor();
    else this.closeWorkItem();
  }

  private isDialogBackdrop(event: MouseEvent): boolean {
    if (event.target !== event.currentTarget) return false;
    const bounds = (event.currentTarget as HTMLDialogElement).getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }

  protected selectStage(stageId: string): void {
    this.stageFilter.set(stageId);
    this.view.set('board');
    this.syncUrl();
  }

  protected openRelatedWorkItem(itemId: string): void {
    const item = this.plan()?.workItems.find((candidate) => candidate.id === itemId);
    if (item) this.openWorkItem(item);
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        view: this.view() === 'board' ? null : this.view(),
        q: this.query().trim() || null,
        stage: this.stageFilter() === 'current' ? null : this.stageFilter(),
        priority: this.priorityFilter() === 'all' ? null : this.priorityFilter(),
        type: this.typeFilter() === 'all' ? null : this.typeFilter(),
      },
    });
  }
}
