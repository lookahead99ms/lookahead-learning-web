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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { PROTECTED_CONTENT } from '../../content/content-delivery';
import { DeliveryPublicationService } from '../../content/delivery-publication.service';
import {
  DeliveryEditorService,
  DeliverySnapshot,
  DeliveryWorkItemInput,
} from '../../content/delivery-editor.service';
import { DeliveryDevPlanService, DeliveryInboxSync, DeliveryPlanApiError, DeliveryPlanWrite } from '../../content/delivery-dev-plan.service';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import {
  DeliveryDecision,
  DeliveryOrigin,
  DeliveryPlan,
  DeliveryPriority,
  DeliveryStage,
  DeliveryWorkItem,
  DeliveryWorkItemType,
  DeliveryWorkflowState,
} from '../../content/delivery-plan.models';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { ScrollLock } from '../../core/scroll-lock/scroll-lock';

type DeliveryView = 'board' | 'backlog' | 'all-tickets' | 'roadmap' | 'decisions';
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
  imports: [PlatformHeader, AuthorAdminMenu, FormsModule, ScrollLock, RouterLink],
  templateUrl: './delivery-plan.html',
  styleUrl: './delivery-plan.css',
  host: { class: 'admin-surface', '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class DeliveryPlanPage implements OnInit {
  protected readonly workspace = signal(false);
  private readonly accounts = inject(StudyPlanAccount);
  protected readonly authorAccess = computed(
    () => (this.accounts.account()?.permissions?.deliveryRead ?? this.accounts.account()?.authorPreview === true) && !this.accounts.sessionExpired(),
  );
  private readonly content = inject(ContentService);
  private readonly editor = inject(DeliveryEditorService);
  private readonly publication = inject(DeliveryPublicationService);
  private readonly devPlan = inject(DeliveryDevPlanService);
  private readonly devSession = inject(DevSession);
  private readonly devKnown = toObservable(this.devSession.known);
  private readonly protectedContent = inject(PROTECTED_CONTENT);
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
  /** The board shows the published staff copy; every editing control stays off. */
  protected readonly published = signal(false);
  /**
   * DLV-971 runtime stores (owner, 2026-11-06): the board shows the plan the Domain serves on DEV. Owner and admins
   * edit it in place with the plan's version; readers (reviewers, co-authors) see it read-only.
   */
  protected readonly dev = signal(false);
  /** The plan's version on DEV, sent back as `expectedVersion` with every write. */
  private version = 0;
  /** The local editor or the DEV plan: the controls that write are shown. */
  protected readonly writable = computed(() => this.editable() || this.dev());
  /** One line above the board when the DEV plan is not there yet and the published copy stands in. */
  protected readonly planNotice = signal('');
  /** The ticket a /delivery-plan#<id> link asked for: scrolled to and marked once the plan is in. */
  protected readonly highlightedId = signal<string | null>(null);
  protected readonly saving = signal(false);
  /**
   * DLV-971 inbox sync (owner, 2026-11-07): the owner and co-authors push their local delivery-plan.json to DEV
   * (Upload plan file) or merge one already placed in `delivery/inbox/` (Sync plan inbox). Legacy accounts without
   * `permissions` but with authorPreview count as the owner.
   */
  protected readonly canSyncPlan = computed(() => {
    const account = this.accounts.account(), permissions = account?.permissions;
    if (!permissions) return account?.authorPreview === true;
    return permissions.manageAccess || permissions.feedbackRole === 'co-author';
  });
  /** An upload or inbox sync is running: both controls wait for it. */
  protected readonly syncing = signal(false);
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
  protected readonly errorTitle = signal('The delivery control room needs its local data.');
  protected readonly view = signal<DeliveryView>('board');
  protected readonly query = signal('');
  protected readonly stageFilter = signal('current');
  protected readonly priorityFilter = signal('all');
  protected readonly typeFilter = signal<'all' | DeliveryWorkItemType>('all');
  protected readonly selectedWorkItem = signal<DeliveryWorkItem | null>(null);
  protected readonly workView = computed(() =>
    ['board', 'backlog', 'all-tickets'].includes(this.view()),
  );
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
      const matchesView = this.view() !== 'backlog' || item.statusId === 'backlog';
      return matchesView && matchesQuery && matchesStage && matchesPriority && matchesType;
    });
  });

  protected readonly activeStage = computed(() => {
    const plan = this.plan();
    return plan?.stages.find((stage) => stage.id === plan.currentStageId) ?? null;
  });

  protected readonly completedCount = computed(
    () => this.plan()?.workItems.filter((item) => item.statusId === 'done').length ?? 0,
  );
  protected readonly reviewCount = computed(
    () => this.plan()?.workItems.filter((item) => item.statusId === 'review').length ?? 0,
  );
  protected readonly blockedCount = computed(
    () => this.plan()?.workItems.filter((item) => item.blockedBy.length > 0).length ?? 0,
  );
  protected readonly activeCount = computed(
    () => this.plan()?.workItems.filter((item) => item.statusId === 'in-progress').length ?? 0,
  );
  /**
   * DLV-995 (owner, 2026-11-09): the overview no longer shows a completion percentage. Done ÷ every ticket ever
   * written mixed September ideas with merged epics and misled; the summary now says where each stage stands,
   * what is in flight, what is up next and what finished recently.
   */
  protected readonly stageSummaries = computed(() => {
    const plan = this.plan();
    if (!plan) return [];
    return plan.stages.map((stage) => {
      const items = plan.workItems.filter((item) => item.stageId === stage.id);
      const done = items.filter((item) => item.statusId === 'done').length;
      return { stage, total: items.length, done, percent: items.length ? (done / items.length) * 100 : 0 };
    });
  });
  /** The work-in-flight cell fills the rest of the last stage row in the four-column grid (a full row when it is full). */
  protected readonly flowSpan = computed(() => {
    const remainder = (this.plan()?.stages.length ?? 0) % 4;
    return remainder ? 4 - remainder : 4;
  });
  /** Tickets per workflow column for the work-in-flight bar, Done first so the bar grows from the left (owner, 2026-11-09). */
  protected readonly flow = computed(() => {
    const plan = this.plan();
    return [...(plan?.workflow ?? [])].reverse().map((status) => ({
      status,
      count: plan!.workItems.filter((item) => item.statusId === status.id).length,
    }));
  });
  protected readonly flowLabel = computed(() =>
    this.flow().map((entry) => `${entry.status.label} ${entry.count}`).join(', '),
  );
  /** The six highest-priority tickets that are in progress, in review or ready; P0 first, then column order. */
  protected readonly nextUp = computed(() => {
    const plan = this.plan();
    if (!plan) return [];
    const columns = ['in-progress', 'review', 'ready'];
    const rank = (item: DeliveryWorkItem) => {
      const index = plan.priorities.findIndex((priority) => priority.id === item.priorityId);
      return index < 0 ? plan.priorities.length : index;
    };
    return plan.workItems
      .filter((item) => columns.includes(item.statusId))
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          columns.indexOf(a.statusId) - columns.indexOf(b.statusId) ||
          (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      )
      .slice(0, 6);
  });
  /** The five tickets most recently marked Done. */
  protected readonly recentlyDone = computed(() => {
    const plan = this.plan();
    if (!plan) return [];
    return plan.workItems
      .filter((item) => item.statusId === 'done')
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, 5);
  });
  /** "8 Nov" from an ISO date; the text itself when it is not one. */
  protected shortDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  ngOnInit(): void {
    if (!this.authorAccess()) return;
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      // Preserve existing filtered/view bookmarks while the plain route becomes the overview.
      const workspace = this.route.snapshot.routeConfig?.path === 'delivery-plan/work' ||
        ['view', 'q', 'stage', 'priority', 'type'].some((key) => params.has(key)) ||
        this.route.snapshot.fragment === 'delivery-workspace';
      if (this.workspace() && !workspace) {
        // The route's leave guard has approved this return to the overview, including route reuse.
        this.closeEditor(true);
        this.closeWorkItem();
      }
      this.workspace.set(workspace);
      const requestedView = params.get('view');
      this.view.set(
        requestedView === 'roadmap' ||
          requestedView === 'decisions' ||
          requestedView === 'backlog' ||
          requestedView === 'all-tickets'
          ? requestedView
          : 'board',
      );
      this.query.set(params.get('q') ?? '');
      this.stageFilter.set(params.get('stage') ?? this.defaultStageFilter());
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
            if (this.protectedContent) {
              void this.loadDevOrPublishedCopy();
              return;
            }
            this.content
              .getDeliveryPlan()
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (plan) => {
                  this.plan.set(plan);
                  this.revealRequestedTicket();
                },
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

  /**
   * The protected build: on DEV the Domain serves the plan from the assets bucket; until the owner uploads the first
   * one (404 DELIVERY_PLAN_MISSING), and outside DEV, the published copy stands in.
   */
  private async loadDevOrPublishedCopy(): Promise<void> {
    if (await this.onDev()) {
      try {
        const plan = await this.devPlan.load();
        if (!this.authorAccess()) return;
        this.acceptDevPlan(plan);
        return;
      } catch (error) {
        if (!this.authorAccess()) return;
        if (!(error instanceof DeliveryPlanApiError) || !error.planMissing) {
          this.errorTitle.set('The delivery plan on DEV is not available.');
          this.error.set(
            error instanceof DeliveryPlanApiError && error.status === 401
              ? 'Sign in again to read the delivery plan on DEV.'
              : error instanceof DeliveryPlanApiError && error.status === 403
                ? 'Your role cannot read the delivery plan on DEV. Ask an owner or admin for delivery access.'
                : 'The plan on DEV could not be loaded. Try again.',
          );
          return;
        }
        this.planNotice.set('The plan on DEV has not been uploaded yet; showing the published copy.');
      }
    }
    this.loadPublishedCopy();
  }

  /** True behind the DEV gate; waits briefly for the first `/dev/session` answer on a direct link. */
  private async onDev(): Promise<boolean> {
    if (!this.devSession.known())
      await firstValueFrom(this.devKnown.pipe(filter(Boolean), timeout(3000))).catch(() => undefined);
    return this.devSession.gated() || !!this.devSession.status();
  }

  private acceptDevPlan(plan: DeliveryPlan): void {
    this.dev.set(true);
    this.published.set(false);
    this.version = plan.version ?? 0;
    this.acceptSnapshot({ plan, revision: `dev-${this.version}` });
  }

  /** A write's answer replaces (or adds) that ticket and moves the plan to the returned version. */
  private applyWrite(result: DeliveryPlanWrite): void {
    const plan = this.plan();
    if (!plan) return;
    const known = plan.workItems.some((item) => item.id === result.item.id);
    const workItems = known
      ? plan.workItems.map((item) => (item.id === result.item.id ? result.item : item))
      : [...plan.workItems, result.item];
    this.version = result.version;
    this.acceptSnapshot({ plan: { ...plan, version: result.version, workItems }, revision: `dev-${result.version}` });
  }

  private async reloadDevPlan(quiet = false): Promise<void> {
    if (this.refreshPending) return;
    this.refreshPending = true;
    try {
      const plan = await this.devPlan.load();
      if (!this.authorAccess()) return;
      const changed = (plan.version ?? 0) !== this.version;
      this.acceptDevPlan(plan);
      // Say what was read (user, 2026-11-07: an unchanged board looked like a dead button).
      if (!quiet) {
        const checked = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const found = `DEV plan version ${plan.version ?? 0}, ${plan.workItems.length} items, checked ${checked}.`;
        this.notice.set(changed ? `Board refreshed from DEV. ${found}` : `Board is up to date. Nothing new to sync: ${found}`);
      }
    } catch {
      this.notice.set('The plan on DEV could not be refreshed. Current data is retained.');
    } finally {
      this.refreshPending = false;
    }
  }

  /**
   * Upload plan file: the chosen delivery-plan.json goes to DEV as written and is merged at once; the board then reads
   * the plan again. The input is cleared afterwards so the same file can be picked again after a fix.
   */
  protected async uploadPlanFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.dev() || !this.canSyncPlan() || this.saving() || this.syncing()) return;
    this.syncing.set(true);
    try {
      const result = await this.devPlan.uploadInbox(await file.text());
      if (result.synced) {
        this.notice.set(`Plan file uploaded and merged into DEV plan version ${result.version}: ${this.mergeCounts(result)}.`);
        await this.reloadDevPlan(true);
      } else {
        this.notice.set(`Plan file uploaded but not merged: ${result.reason ?? 'no reason given'}.`);
      }
    } catch (error) {
      this.notice.set(`The plan file could not be uploaded: ${this.syncFailure(error)}.`);
    } finally {
      input.value = '';
      this.syncing.set(false);
    }
  }

  /** Sync plan inbox: merges a plan file already placed in `delivery/inbox/` on DEV, then reads the plan again. */
  protected async syncPlanInbox(): Promise<void> {
    if (!this.dev() || !this.canSyncPlan() || this.saving() || this.syncing()) return;
    this.syncing.set(true);
    try {
      const result = await this.devPlan.syncInbox();
      if (result.synced) {
        this.notice.set(`Sync plan inbox: merged into DEV plan version ${result.version}: ${this.mergeCounts(result)}.`);
        await this.reloadDevPlan(true);
      } else {
        this.notice.set(`Sync plan inbox: nothing to sync (${result.reason ?? 'no reason given'}).`);
      }
    } catch (error) {
      this.notice.set(`Sync plan inbox failed: ${this.syncFailure(error)}.`);
    } finally {
      this.syncing.set(false);
    }
  }

  /** "2 added, 1 taken from local, 0 kept from DEV, 0 conflict(s)" from a merge's counts. */
  private mergeCounts(result: DeliveryInboxSync): string {
    const counts = result.counts ?? { added: 0, takenLocal: 0, keptDev: 0, conflicts: 0 };
    return `${counts.added} added, ${counts.takenLocal} taken from local, ${counts.keptDev} kept from DEV, ${counts.conflicts} conflict(s)`;
  }

  /** The Domain's message, else its error code, else what the browser said; the sentence's own full stop follows. */
  private syncFailure(error: unknown): string {
    const text = error instanceof DeliveryPlanApiError
      ? error.message || error.code || `request failed (${error.status})`
      : error instanceof Error && error.message ? error.message : 'unknown error';
    return text.replace(/\.$/, '');
  }

  /** No local editor in the protected build: read the staff copy Domain publishes. */
  private loadPublishedCopy(): void {
    this.publication
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          if (!this.authorAccess()) return;
          this.published.set(true);
          this.acceptSnapshot(snapshot);
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 401 || error.status === 403) {
            this.errorTitle.set('The published delivery plan is not available to this account.');
            this.error.set(
              error.status === 401
                ? 'Sign in again to read the published delivery plan.'
                : 'Your role cannot read the published delivery plan. Ask an owner or admin for staff documents access.',
            );
            return;
          }
          this.error.set(
            'The published delivery plan could not be loaded. Check the latest Content release and try again.',
          );
        },
      });
  }

  private acceptSnapshot(snapshot: DeliverySnapshot): void {
    this.plan.set(snapshot.plan);
    this.revision = snapshot.revision;
    this.revealRequestedTicket();
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
      this.stageFilter.set(this.defaultStageFilter());
      this.syncUrl();
    }
  }

  /**
   * A ticket pill on Support tickets and feedback links to /delivery-plan#<ticketId>: once the plan is in, All tickets opens with the
   * filters cleared, and the ticket is scrolled to and marked.
   */
  private revealRequestedTicket(): void {
    const requested = this.route.snapshot.fragment;
    if (!requested || this.highlightedId() || !this.plan()?.workItems.some((item) => item.id === requested)) return;
    this.highlightedId.set(requested);
    this.workspace.set(true);
    this.view.set('all-tickets');
    this.resetView();
    setTimeout(() =>
      document.getElementById(`ticket-${requested}`)?.scrollIntoView?.({ block: 'center' }),
    );
  }

  protected refreshPlan(quiet = false): void {
    if (!this.authorAccess()) return;
    if (this.dev()) {
      if (!this.saving()) void this.reloadDevPlan(quiet);
      return;
    }
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

  protected canEdit(item?: DeliveryWorkItem): boolean {
    const account = this.accounts.account(), permissions = account?.permissions;
    if (!permissions) return account?.authorPreview === true;
    // On DEV the roles that create tickets also edit their cards (owner and admins); readers stay read-only.
    return permissions.manageAccess || ((!item || this.dev()) && permissions.deliveryCreate);
  }
  /** Whether this account may move the item to at least one other column; decides the move controls. */
  protected canMoveAnywhere(item: DeliveryWorkItem): boolean {
    return (this.plan()?.workflow ?? []).some(
      (status) => status.id !== item.statusId && this.canMove(item, status.id),
    );
  }
  protected canDrag(item: DeliveryWorkItem): boolean {
    return this.writable() && !this.saving() && this.canMoveAnywhere(item);
  }
  /** In the DEV editor the status select offers the item's own status and the moves this account may make. */
  protected statusAllowed(statusId: string): boolean {
    if (!this.dev()) return true;
    const item = this.plan()?.workItems.find((candidate) => candidate.id === this.draftId);
    return !item || item.statusId === statusId || this.canMove(item, statusId);
  }
  protected originLabel(origin: DeliveryOrigin): string {
    return origin.kind === 'request' ? `From learner request ${origin.id}` : `From review ${origin.id}`;
  }
  /** "updated on DEV · 6 Nov" for a stamped ticket; the plain date line for one without stamps. */
  protected updatedLine(item: DeliveryWorkItem): string {
    if (!item.updatedIn) return `Updated ${item.updatedAt}`;
    const date = new Date(item.updatedAt);
    const day = Number.isNaN(date.getTime())
      ? item.updatedAt
      : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `updated ${item.updatedIn === 'dev' ? 'on DEV' : 'locally'} · ${day}`;
  }
  /** The fields where the unmerged local edit differs from the ticket on DEV. */
  protected conflictFields(item: DeliveryWorkItem): { field: string; dev: string; local: string }[] {
    const local = item.pendingLocal;
    if (!local) return [];
    const show = (value: unknown): string => (Array.isArray(value) ? value.join(', ') : String(value ?? ''));
    const fields: [keyof DeliveryWorkItem, string][] = [
      ['title', 'Title'],
      ['summary', 'Outcome'],
      ['type', 'Work type'],
      ['stageId', 'Stage'],
      ['statusId', 'Status'],
      ['priorityId', 'Priority'],
      ['labels', 'Labels'],
      ['acceptanceCriteria', 'Acceptance criteria'],
      ['dependencies', 'Depends on'],
      ['blockedBy', 'Blocked by'],
      ['notes', 'Notes'],
    ];
    return fields
      .filter(([key]) => show(item[key]) !== show(local[key]))
      .map(([key, field]) => ({ field, dev: show(item[key]), local: show(local[key]) }));
  }
  /** Keep DEV drops the local edit; Take local replaces the ticket with it. Either way the conflict is cleared. */
  protected async resolveConflict(item: DeliveryWorkItem, keep: 'dev' | 'local'): Promise<void> {
    if (!this.authorAccess() || !this.dev() || this.saving() || !this.canEdit(item)) return;
    this.saving.set(true);
    this.writeGeneration++;
    try {
      const result = await this.devPlan.resolveConflict(item.id, this.version, keep);
      this.applyWrite(result);
      this.notice.set(
        keep === 'dev'
          ? `${item.id}: kept the DEV version; the local edit was dropped.`
          : `${item.id}: took the local edit.`,
      );
    } catch (error) {
      if (error instanceof DeliveryPlanApiError && error.versionConflict) {
        this.saving.set(false);
        await this.reloadDevPlan(true);
        this.notice.set('Someone changed the plan; reloaded, apply your change again.');
      } else {
        this.notice.set('The conflict could not be resolved. The ticket is unchanged; try again.');
      }
    } finally {
      this.saving.set(false);
    }
  }
  protected canMove(item: DeliveryWorkItem, next: string): boolean {
    const account = this.accounts.account(), permissions = account?.permissions;
    if (!permissions) return account?.authorPreview === true;
    return permissions.manageAccess || (next === 'done' ? permissions.deliveryDone && item.statusId === 'review'
      : permissions.deliveryReview && item.statusId !== 'done' && next === 'review');
  }
  protected openEditor(item?: DeliveryWorkItem): void {
    if (!this.writable() || this.saving() || !this.canEdit(item)) return;
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
    if (!this.authorAccess()) return;
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
    if (this.dev()) {
      if (!input.title.trim() || !input.summary.trim()) {
        this.saveError.set('Add a title and an outcome.');
        return;
      }
      void this.saveDevDraft(input);
      return;
    }
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

  /**
   * The DEV form edits title, outcome, status, priority, stage, labels and notes; the fields it does not show keep the
   * ticket's stored values. A 409 means the plan moved on: it is reloaded and the draft stays for a second Save.
   */
  private async saveDevDraft(input: DeliveryWorkItemInput): Promise<void> {
    const id = this.draftId;
    const existing = id ? this.plan()?.workItems.find((item) => item.id === id) : undefined;
    const item: DeliveryWorkItemInput = existing
      ? {
          ...input,
          acceptanceCriteria: existing.acceptanceCriteria,
          dependencies: existing.dependencies,
          blockedBy: existing.blockedBy,
        }
      : input;
    this.saving.set(true);
    this.saveError.set('');
    this.writeGeneration++;
    try {
      const result = id
        ? await this.devPlan.update(id, this.version, item)
        : await this.devPlan.create(this.version, item);
      this.applyWrite(result);
      this.saving.set(false);
      this.closeEditor(true);
      this.notice.set(`${result.item.id} saved to the plan on DEV.`);
    } catch (error) {
      this.saving.set(false);
      if (error instanceof DeliveryPlanApiError && error.versionConflict) {
        await this.reloadDevPlan(true);
        this.saveError.set('Someone changed the plan; reloaded, apply your change again.');
      } else {
        this.saveError.set(
          error instanceof DeliveryPlanApiError && error.status === 403
            ? 'Your role cannot make this change on DEV.'
            : 'Save failed. Your draft is retained; try again.',
        );
      }
    }
  }

  private async moveDevItem(item: DeliveryWorkItem, statusId: string): Promise<void> {
    const { title, summary, type, stageId, priorityId, labels, acceptanceCriteria, dependencies, blockedBy } = item;
    this.saving.set(true);
    this.writeGeneration++;
    try {
      const result = await this.devPlan.update(item.id, this.version, {
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
      });
      this.applyWrite(result);
      const label = this.plan()?.workflow.find((status) => status.id === statusId)?.label ?? statusId;
      this.notice.set(`${item.id} moved to ${label} on DEV.`);
    } catch (error) {
      if (error instanceof DeliveryPlanApiError && error.versionConflict) {
        this.saving.set(false);
        await this.reloadDevPlan(true);
        this.notice.set('Someone changed the plan; reloaded, apply your change again.');
      } else {
        this.notice.set('Move could not be saved. The item stays in its original column.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected moveItem(item: DeliveryWorkItem, statusId: string): void {
    if (!this.authorAccess()) return;
    if (!this.writable() || this.saving() || item.statusId === statusId || !this.canMove(item, statusId)) return;
    if (this.dev()) {
      void this.moveDevItem(item, statusId);
      return;
    }
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
    if (!this.canDrag(item)) {
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
    if (this.view() === view) return;
    this.view.set(view);
    if (this.workView()) {
      this.resetView();
      return;
    }
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
    this.stageFilter.set(this.defaultStageFilter());
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
      // Same-page controls update the URL without triggering the app-wide scroll-to-top.
      scroll: 'manual',
      queryParams: {
        // The legacy root needs an explicit board marker so clearing filters does not open the overview.
        view: this.view() === 'board' && this.route.snapshot.routeConfig?.path === 'delivery-plan/work'
          ? null : this.view(),
        q: this.query().trim() || null,
        stage: this.stageFilter() === this.defaultStageFilter() ? null : this.stageFilter(),
        priority: this.priorityFilter() === 'all' ? null : this.priorityFilter(),
        type: this.typeFilter() === 'all' ? null : this.typeFilter(),
      },
    });
  }

  private defaultStageFilter(): 'all' | 'current' {
    return this.view() === 'backlog' || this.view() === 'all-tickets' ? 'all' : 'current';
  }
}
