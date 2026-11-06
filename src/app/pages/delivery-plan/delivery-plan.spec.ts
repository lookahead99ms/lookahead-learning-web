import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError, Observable, Subject } from 'rxjs';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { ContentService } from '../../content/content.service';
import { DeliveryPlan } from '../../content/delivery-plan.models';
import { DeliveryEditorService, DeliverySnapshot } from '../../content/delivery-editor.service';
import { DeliveryPublicationService } from '../../content/delivery-publication.service';
import { DeliveryDevPlanService, DeliveryPlanApiError } from '../../content/delivery-dev-plan.service';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { PROTECTED_CONTENT } from '../../content/content-delivery';
import { SearchDocument } from '../../content/content.models';
import { DeliveryPlanPage } from './delivery-plan';
import { routes } from '../../app.routes';

@Component({ template: 'Another page' })
class OtherPage {}

describe('DeliveryPlanPage', () => {
  const plan: DeliveryPlan = {
    schemaVersion: 'delivery-plan/v1',
    id: 'test-plan',
    title: 'Deliver deliberately',
    summary: 'A test delivery plan.',
    lastUpdated: '2026-09-03',
    sourceLabel: 'Test JSON',
    currentStageId: 'foundation',
    workflow: [
      { id: 'backlog', label: 'Backlog', description: 'Future work.', color: '#777' },
      {
        id: 'in-progress',
        label: 'In progress',
        description: 'Active work.',
        color: '#b70',
        wipLimit: 1,
      },
      { id: 'done', label: 'Done', description: 'Delivered.', color: '#087' },
    ],
    priorities: [
      {
        id: 'P1',
        label: 'Protect the stage',
        description: 'Blocks acceptance.',
        color: '#c54',
        interrupt: true,
      },
    ],
    stages: [
      {
        id: 'foundation',
        order: 1,
        title: 'Foundation',
        goal: 'Prove the contract.',
        state: 'active',
        reviewGate: 'Review the evidence.',
      },
      {
        id: 'future-stage',
        order: 2,
        title: 'Future stage from JSON',
        goal: 'Prove stages are data-driven.',
        state: 'planned',
        reviewGate: 'Review the next stage.',
      },
    ],
    workItems: [
      {
        id: 'TEST-1',
        title: 'Render a data-driven board',
        summary: 'Use configured workflow columns.',
        type: 'story',
        stageId: 'foundation',
        statusId: 'in-progress',
        priorityId: 'P1',
        labels: ['board'],
        acceptanceCriteria: ['All configured columns render.'],
        dependencies: [],
        blockedBy: [],
        updatedAt: '2026-09-03',
      },
      {
        id: 'TEST-2',
        title: 'Keep another item',
        summary: 'Support filtering.',
        type: 'task',
        stageId: 'future-stage',
        statusId: 'backlog',
        priorityId: 'P1',
        labels: ['future'],
        acceptanceCriteria: ['Filtering is recoverable.'],
        dependencies: [],
        blockedBy: [],
        updatedAt: '2026-09-03',
      },
    ],
    decisions: [],
    deliverySequence: {
      title: 'A sequence from data',
      note: 'Focused delivery days, not calendar promises.',
      windows: [
        {
          id: 'days-1-2',
          dayRange: 'Days 1-2',
          title: 'Test window',
          checkpoints: [
            {
              id: 'day-1',
              day: 'Day 1',
              outcome: 'Prove the baseline.',
              stageIds: ['foundation'],
              reviewStop: false,
            },
          ],
        },
      ],
    },
    interruptionPolicy: {
      title: 'Protect flow',
      principle: 'Triage before interrupting.',
      rules: [{ priorityId: 'P1', action: 'Interrupt when unsafe.', examples: ['Exposure'] }],
    },
  };

  const content = {
    getDeliveryPlan: vi.fn(() => of(plan)),
    getSearchIndex: vi.fn(() => of([] as SearchDocument[])),
  };
  const editor = {
    load: vi.fn<() => Observable<DeliverySnapshot>>(),
    save: vi.fn(),
  };
  const publication = { load: vi.fn<() => Observable<DeliverySnapshot>>() };
  const devApi = { load: vi.fn(), create: vi.fn(), update: vi.fn(), resolveConflict: vi.fn() };
  // Read lazily when the page first injects PROTECTED_CONTENT, so a nested beforeEach can flip it.
  let protectedBuild = false;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    editor.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    editor.save.mockReset();
    publication.load.mockReset();
    publication.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    devApi.load.mockReset();
    devApi.create.mockReset();
    devApi.update.mockReset();
    devApi.resolveConflict.mockReset();
    protectedBuild = false;
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([
          {
            ...routes.find((route) => route.path === 'delivery-plan')!,
            component: DeliveryPlanPage,
            loadComponent: undefined,
          },
          { path: 'away', component: OtherPage },
        ]),
        { provide: ContentService, useValue: content },
        { provide: DeliveryEditorService, useValue: editor },
        { provide: DeliveryPublicationService, useValue: publication },
        { provide: DeliveryDevPlanService, useValue: devApi },
        { provide: PROTECTED_CONTENT, useFactory: () => protectedBuild },
      ],
    }).compileComponents();
    const accounts = TestBed.inject(StudyPlanAccount);
    accounts.account.set({
      accountId: 'author-test',
      username: 'author@test.invalid',
      displayName: 'Author',
      topicGrants: [],
      authorPreview: true,
    });
    vi.spyOn(accounts, 'initialize').mockResolvedValue();
  });

  it('hides a loaded board and stops refresh after author access is lost', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Deliver deliberately');
    TestBed.inject(StudyPlanAccount).account.set(null);
    harness.detectChanges();
    const reads = editor.load.mock.calls.length;
    page['refreshPlan']();
    expect(editor.load.mock.calls.length).toBe(reads);
    expect(harness.routeNativeElement?.textContent).toContain('Admin access required');
    expect(harness.routeNativeElement?.textContent).not.toContain('Deliver deliberately');
    expect(harness.routeNativeElement?.querySelector('.board-column')).toBeNull();
  });

  it('renders workflow columns and arbitrary stages from JSON', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    harness.detectChanges();

    expect(content.getDeliveryPlan).toHaveBeenCalledOnce();
    expect(publication.load).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.textContent).toContain('Read-only view');
    expect(
      harness.routeNativeElement?.querySelectorAll('.delivery-outline .heading-outline a'),
    ).toHaveLength(3);
    expect(
      harness.routeNativeElement?.querySelector('.delivery-outline a[href$="#delivery-workspace"]'),
    ).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('.editor-toolbar .editor-primary')).toBeNull();
    expect(harness.routeNativeElement?.querySelectorAll('.board-column')).toHaveLength(3);
    expect(harness.routeNativeElement?.textContent).toContain('Render a data-driven board');
    expect(harness.routeNativeElement?.textContent).not.toContain('Keep another item');

    await switchView(harness, 'Roadmap');
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Future stage from JSON');
    expect(harness.routeNativeElement?.textContent).toContain('A sequence from data');
    expect(TestBed.inject(Router).url).toBe('/delivery-plan?view=roadmap');
  });

  it('opens All tickets, clears the filters and marks the ticket a /delivery-plan#<id> link names (DLV-971)', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan?stage=foundation#TEST-2', DeliveryPlanPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(TestBed.inject(Router).url).toBe('/delivery-plan?view=all-tickets');
    const marked = root.querySelector('li#ticket-TEST-2');
    expect(marked?.classList.contains('highlighted')).toBe(true);
    expect(marked?.textContent).toContain('Keep another item');
    expect(root.querySelectorAll('.ticket-results li.highlighted')).toHaveLength(1);
    // An unknown id changes nothing.
    await harness.navigateByUrl('/away', OtherPage);
    await harness.navigateByUrl('/delivery-plan#DLV-9999', DeliveryPlanPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/delivery-plan#DLV-9999');
    expect(harness.routeNativeElement!.querySelector('.highlighted')).toBeNull();
  });

  it('keeps author navigation available when private delivery data is unavailable', async () => {
    content.getDeliveryPlan.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain(
      'The delivery control room needs its local data.',
    );
    expect(
      harness.routeNativeElement?.querySelector(
        'app-author-admin-menu nav[aria-label="Admin navigation"]',
      ),
    ).not.toBeNull();
    expect(
      harness.routeNativeElement?.querySelector('.delivery-outline .heading-outline'),
    ).toBeNull();
  });

  it('keeps board filters in the URL and filters work items', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    const input = harness.routeNativeElement?.querySelector(
      '.board-search input',
    ) as HTMLInputElement;

    input.value = 'data-driven';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/delivery-plan?q=data-driven');
    expect(harness.routeNativeElement?.textContent).toContain('Showing 1 of 2 work items');
    expect(harness.routeNativeElement?.textContent).not.toContain('Keep another item');
  });

  it('restores selected filters when the plan arrives after a filtered URL is opened', async () => {
    const response = new Subject<DeliverySnapshot>();
    editor.load.mockReturnValue(response);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/delivery-plan?stage=future-stage&priority=P1&type=task',
      DeliveryPlanPage,
    );
    response.next({ plan, revision: 'revision-1' });
    response.complete();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const selects =
      harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('.board-controls select');
    expect([...selects].map((select) => select.value)).toEqual(['future-stage', 'P1', 'task']);
    expect(selects[0].selectedOptions[0].textContent).toContain('Future stage from JSON');
    expect(harness.routeNativeElement!.textContent).toContain('Showing 1 of 2 work items');
    expect(harness.routeNativeElement!.querySelector('.work-item-card')!.textContent).toContain(
      'Keep another item',
    );

    await harness.navigateByUrl('/delivery-plan?stage=foundation&type=story', DeliveryPlanPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect([...selects].map((select) => select.value)).toEqual(['foundation', 'all', 'story']);
    (harness.routeNativeElement!.querySelector('.clear-filters') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect([...selects].map((select) => select.value)).toEqual(['current', 'all', 'all']);
    expect(TestBed.inject(Router).url).toBe('/delivery-plan');
  });

  it('keeps total WIP and limit warnings independent of every board filter', async () => {
    const overloaded = structuredClone(plan);
    overloaded.workItems[1].statusId = 'in-progress';
    overloaded.workItems[1].priorityId = 'P2';
    overloaded.priorities.push({ ...overloaded.priorities[0], id: 'P2', label: 'Normal' });
    editor.load.mockReturnValue(of({ plan: overloaded, revision: 'revision-1' }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/delivery-plan?stage=foundation&priority=P1&type=story&q=Render',
      DeliveryPlanPage,
    );
    harness.detectChanges();
    const column = harness.routeNativeElement!.querySelectorAll('.board-column')[1];
    expect(column.querySelector('header > span')!.textContent).toBe('1');
    expect(column.querySelector('.wip-limit')!.textContent).toContain('WIP 2/1');
    expect(column.querySelector('.wip-limit')!.textContent).toContain('all stages');
    expect(column.querySelector('.wip-limit')!.classList.contains('exceeded')).toBe(true);

    await harness.navigateByUrl('/delivery-plan?q=not-a-match', DeliveryPlanPage);
    harness.detectChanges();
    expect(column.querySelector('header > span')!.textContent).toBe('0');
    expect(column.querySelector('.wip-limit')!.textContent).toContain('WIP 2/1');
    expect(column.querySelector('.wip-limit')!.classList.contains('exceeded')).toBe(true);
  });

  async function editableBoard() {
    editor.load.mockReturnValue(of({ plan: structuredClone(plan), revision: 'revision-1' }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    harness.detectChanges();
    return harness;
  }

  async function switchView(harness: RouterTestingHarness, label: string) {
    [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.view-tabs button')]
      .find((button) => button.textContent?.trim() === label)!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it.each(['Board', 'Backlog', 'All tickets', 'Roadmap', 'Decisions'])(
    'opts out of router scroll-to-top when switching to %s',
    async (label) => {
      const harness = await editableBoard();
      if (label === 'Board') await switchView(harness, 'Backlog');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
      await switchView(harness, label);
      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate.mock.lastCall?.[0]).toEqual([]);
      expect(navigate.mock.lastCall?.[1]?.replaceUrl).toBe(true);
      expect(navigate.mock.lastCall?.[1]?.scroll).toBe('manual');
    },
  );

  it('preserves scroll for search, dropdowns, and clearing delivery filters', async () => {
    const harness = await editableBoard();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const input =
      harness.routeNativeElement!.querySelector<HTMLInputElement>('.board-search input')!;
    input.value = 'TEST';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    const selects =
      harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('.board-controls select');
    for (const [index, value] of ['all', 'P1', 'task'].entries()) {
      selects[index].value = value;
      selects[index].dispatchEvent(new Event('change'));
      await harness.fixture.whenStable();
    }
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.clear-filters')!.click();
    await harness.fixture.whenStable();
    expect(navigate).toHaveBeenCalledTimes(5);
    for (const [commands, extras] of navigate.mock.calls) {
      expect(commands).toEqual([]);
      expect(extras?.scroll).toBe('manual');
    }
  });

  it('preserves scroll when opening the active stage from another delivery view', async () => {
    const harness = await editableBoard();
    await switchView(harness, 'Roadmap');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.active-stage-card button')!
      .click();
    await harness.fixture.whenStable();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate.mock.lastCall?.[1]?.scroll).toBe('manual');
  });

  it('opens Backlog across all stages and returns to the current-stage board', async () => {
    const harness = await editableBoard();
    await switchView(harness, 'Backlog');
    expect(TestBed.inject(Router).url).toBe('/delivery-plan?view=backlog');
    expect(harness.routeNativeElement!.querySelectorAll('.ticket-row')).toHaveLength(1);
    expect(harness.routeNativeElement!.querySelector('.ticket-row')!.textContent).toContain(
      'TEST-2',
    );
    expect(harness.routeNativeElement!.querySelector('.delivery-board')).toBeNull();
    expect(
      harness.routeNativeElement!.querySelector<HTMLSelectElement>('.board-controls select')!.value,
    ).toBe('all');
    await switchView(harness, 'Board');
    expect(TestBed.inject(Router).url).toBe('/delivery-plan');
    expect(harness.routeNativeElement!.querySelector('.work-item-card')!.textContent).toContain(
      'TEST-1',
    );
    expect(harness.routeNativeElement!.querySelector('.delivery-board')!.textContent).not.toContain(
      'TEST-2',
    );
  });

  it('shows all tickets including completed work and opens their details', async () => {
    const snapshot = structuredClone(plan);
    snapshot.workItems[0].statusId = 'done';
    editor.load.mockReturnValue(of({ plan: snapshot, revision: 'revision-1' }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    await switchView(harness, 'All tickets');
    expect(TestBed.inject(Router).url).toBe('/delivery-plan?view=all-tickets');
    expect(harness.routeNativeElement!.querySelectorAll('.ticket-row')).toHaveLength(2);
    const row = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.ticket-row')!;
    expect(row.textContent).toContain('Done');
    expect(row.textContent).toContain('Use configured workflow columns.');
    row.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector<HTMLDialogElement>('.work-item-dialog')!.open,
    ).toBe(true);
    expect(harness.routeNativeElement!.querySelector('.dialog-shell')!.textContent).toContain(
      'TEST-1',
    );
    expect(
      harness.routeNativeElement!.querySelector('.dialog-footer .editor-primary'),
    ).not.toBeNull();
    expect(editor.save).not.toHaveBeenCalled();
  });

  it.each(['backlog', 'all-tickets'])(
    'restores the %s URL and clears filters without hiding future stages',
    async (view) => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(
        `/delivery-plan?view=${view}&q=another&stage=future-stage&type=task`,
        DeliveryPlanPage,
      );
      harness.detectChanges();
      expect(harness.routeNativeElement!.querySelectorAll('.ticket-row')).toHaveLength(1);
      expect(harness.routeNativeElement!.querySelector('.ticket-row')!.textContent).toContain(
        'TEST-2',
      );
      const input =
        harness.routeNativeElement!.querySelector<HTMLInputElement>('.board-search input')!;
      input.value = '';
      input.dispatchEvent(new Event('input'));
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).not.toContain('q=');
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.clear-filters')!.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe(`/delivery-plan?view=${view}`);
      expect(
        harness.routeNativeElement!.querySelector<HTMLSelectElement>('.board-controls select')!
          .value,
      ).toBe('all');
      expect(harness.routeNativeElement!.querySelectorAll('.ticket-row')).toHaveLength(
        view === 'backlog' ? 1 : 2,
      );
    },
  );

  it('clears hidden board filters when opening All tickets', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/delivery-plan?q=no-match&stage=foundation&type=story',
      DeliveryPlanPage,
    );
    await switchView(harness, 'All tickets');
    expect(TestBed.inject(Router).url).toBe('/delivery-plan?view=all-tickets');
    expect(harness.routeNativeElement!.querySelectorAll('.ticket-row')).toHaveLength(2);
  });

  it('refreshes the backlog without resetting its view or filters', async () => {
    const harness = await editableBoard();
    await switchView(harness, 'Backlog');
    const snapshot = structuredClone(plan);
    snapshot.workItems[1].title = 'Updated backlog title';
    editor.load.mockReturnValue(of({ plan: snapshot, revision: 'revision-2' }));
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.editor-toolbar .editor-secondary')!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.ticket-row')!.textContent).toContain(
      'Updated backlog title',
    );
    expect(harness.routeNativeElement!.textContent).toContain(
      'Board refreshed from the private JSON.',
    );
    expect(harness.routeNativeElement!.textContent).toContain('automatically every 5 seconds');
    expect(TestBed.inject(Router).url).toBe('/delivery-plan?view=backlog');
    expect(editor.save).not.toHaveBeenCalled();
  });

  it('links private evidence by item and attachment identity, never by filesystem path', async () => {
    const snapshot = structuredClone(plan);
    snapshot.workItems[0].evidence = [
      { id: 'report', title: 'Route inventory report', path: 'docs/evidence/report.md' },
    ];
    editor.load.mockReturnValue(of({ plan: snapshot, revision: 'revision-1' }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    harness.detectChanges();
    (harness.routeNativeElement!.querySelector('.work-item-card') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const section = harness.routeNativeElement!.querySelector('.evidence-section')!;
    expect(section.textContent).toContain('Route inventory report');
    const links = section.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toContain('View report (new tab)');
    expect(links[0].getAttribute('href')).toBe('/__local/delivery/evidence/TEST-1/report');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(links[1].getAttribute('href')).toBe(
      '/__local/delivery/evidence/TEST-1/report?download=1',
    );
  });

  it('does not offer private evidence endpoints in a read-only public board', async () => {
    const snapshot = structuredClone(plan);
    snapshot.workItems[0].evidence = [
      { id: 'report', title: 'Route inventory report', path: 'docs/evidence/report.md' },
    ];
    content.getDeliveryPlan.mockReturnValueOnce(of(snapshot));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    harness.detectChanges();
    (harness.routeNativeElement!.querySelector('.work-item-card') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const section = harness.routeNativeElement!.querySelector('.evidence-section')!;
    expect(section.querySelector('a')).toBeNull();
    expect(section.textContent).toContain('Start the private local app');
  });

  async function fill(harness: RouterTestingHarness, name: string, value: string) {
    const input = harness.routeNativeElement!.querySelector(`[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function newItem(harness: RouterTestingHarness) {
    (
      harness.routeNativeElement!.querySelector(
        '.editor-toolbar .editor-primary',
      ) as HTMLButtonElement
    ).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await fill(harness, 'title', 'A new story');
    await fill(harness, 'summary', 'A measurable outcome.');
    await fill(harness, 'criteria', 'One check\nAnother check');
  }

  function dialogBounds(dialog: HTMLDialogElement): void {
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 600,
      top: 100,
      bottom: 500,
      x: 100,
      y: 100,
      width: 500,
      height: 400,
      toJSON: () => ({}),
    });
  }

  function pointerEvent(target: Element, type: string, clientX: number, clientY: number): void {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 }));
  }

  function clickBackdrop(dialog: HTMLDialogElement): void {
    dialogBounds(dialog);
    pointerEvent(dialog, 'pointerdown', 20, 200);
    pointerEvent(dialog, 'click', 20, 200);
  }

  async function openTicket(harness: RouterTestingHarness): Promise<HTMLDialogElement> {
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.work-item-card')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness.routeNativeElement!.querySelector<HTMLDialogElement>('.work-item-dialog')!;
  }

  it('closes a ticket when a click starts and ends on its backdrop', async () => {
    const harness = await editableBoard();
    const dialog = await openTicket(harness);
    expect(dialog.open).toBe(true);
    clickBackdrop(dialog);
    harness.detectChanges();
    expect(dialog.open).toBe(false);
    expect(dialog.querySelector('.dialog-shell')).toBeNull();
    expect(editor.save).not.toHaveBeenCalled();
  });

  it.each(['content', 'padding', 'selection-drag', 'outside-to-inside'])(
    'keeps the ticket open for a %s interaction',
    async (interaction) => {
      const harness = await editableBoard();
      const dialog = await openTicket(harness);
      dialogBounds(dialog);
      const content = dialog.querySelector('.dialog-shell')!;
      const startTarget =
        interaction === 'content' || interaction === 'selection-drag' ? content : dialog;
      const endTarget = interaction === 'content' ? content : dialog;
      pointerEvent(startTarget, 'pointerdown', interaction === 'outside-to-inside' ? 20 : 200, 200);
      pointerEvent(endTarget, 'click', interaction === 'selection-drag' ? 20 : 200, 200);
      harness.detectChanges();
      expect(dialog.open).toBe(true);
    },
  );

  it('closes an unchanged editor from the backdrop without saving or prompting', async () => {
    const harness = await editableBoard();
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.editor-toolbar .editor-primary')!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const dialog = harness.routeNativeElement!.querySelector<HTMLDialogElement>('.editor-dialog')!;
    clickBackdrop(dialog);
    harness.detectChanges();
    expect(dialog.open).toBe(false);
    expect(editor.save).not.toHaveBeenCalled();
  });

  it('protects an unsaved editor draft when the backdrop is clicked', async () => {
    const harness = await editableBoard();
    await newItem(harness);
    const dialog = harness.routeNativeElement!.querySelector<HTMLDialogElement>('.editor-dialog')!;
    clickBackdrop(dialog);
    harness.detectChanges();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Discard your unsaved changes?');
    expect(dialog.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('A new story');
    expect(editor.save).not.toHaveBeenCalled();
  });

  it('does not dismiss the editor while a save is in progress', async () => {
    const harness = await editableBoard();
    await newItem(harness);
    const saved = new Subject<DeliverySnapshot>();
    editor.save.mockReturnValue(saved);
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
    const dialog = harness.routeNativeElement!.querySelector<HTMLDialogElement>('.editor-dialog')!;
    clickBackdrop(dialog);
    harness.detectChanges();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).not.toContain('Discard your unsaved changes?');
    saved.next({ plan, revision: 'revision-2', workItemId: 'TEST-3' });
    saved.complete();
  });

  it('creates a story through the local service and only reports success after saving', async () => {
    const harness = await editableBoard();
    await newItem(harness);
    const saved = new Subject<DeliverySnapshot>();
    editor.save.mockReturnValue(saved);
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
    expect(editor.save).toHaveBeenCalledWith(
      'revision-1',
      expect.objectContaining({
        title: 'A new story',
        type: 'story',
        acceptanceCriteria: ['One check', 'Another check'],
      }),
      undefined,
    );
    expect(
      (harness.routeNativeElement!.querySelector('[type="submit"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(harness.routeNativeElement!.querySelector('.editor-dialog')!.hasAttribute('open')).toBe(
      true,
    );
    saved.next({ plan, revision: 'revision-2', workItemId: 'TEST-3' });
    saved.complete();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.editor-dialog')!.hasAttribute('open')).toBe(
      false,
    );
    expect(harness.routeNativeElement!.textContent).toContain('TEST-3 saved to private JSON');
  });

  it('edits an existing story and moves its delivery stage without changing its ID', async () => {
    const harness = await editableBoard();
    (harness.routeNativeElement!.querySelector('.work-item-card') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    (
      harness.routeNativeElement!.querySelector(
        '.dialog-footer .editor-primary',
      ) as HTMLButtonElement
    ).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await fill(harness, 'title', 'Revised outcome');
    await fill(harness, 'stage', 'future-stage');
    editor.save.mockReturnValue(of({ plan, revision: 'revision-2', workItemId: 'TEST-1' }));
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    expect(editor.save).toHaveBeenCalledWith(
      'revision-1',
      expect.objectContaining({ title: 'Revised outcome', stageId: 'future-stage' }),
      'TEST-1',
    );
  });

  it('moves a card using the keyboard-accessible selector and handles a failed move honestly', async () => {
    const harness = await editableBoard();
    editor.save.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const select = harness.routeNativeElement!.querySelector(
      '.quick-move select',
    ) as HTMLSelectElement;
    expect(select.value).toBe('in-progress');
    select.value = 'done';
    select.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(editor.save).toHaveBeenCalledWith(
      'revision-1',
      expect.objectContaining({ statusId: 'done' }),
      'TEST-1',
    );
    expect(select.value).toBe('in-progress');
    expect(harness.routeNativeElement!.textContent).toContain('Move not saved: the plan changed');
  });

  it('saves a drag-and-drop move and ignores drops from outside the board', async () => {
    const harness = await editableBoard();
    const columns = harness.routeNativeElement!.querySelectorAll('.board-column');
    const drop = () => columns[2].dispatchEvent(new Event('drop', { cancelable: true }));
    drop();
    expect(editor.save).not.toHaveBeenCalled();
    editor.save.mockReturnValue(of({ plan, revision: 'revision-2', workItemId: 'TEST-1' }));
    const start = new Event('dragstart', { cancelable: true });
    Object.defineProperty(start, 'dataTransfer', {
      value: { setData: vi.fn(), effectAllowed: '' },
    });
    harness.routeNativeElement!.querySelector('.work-item-card')!.dispatchEvent(start);
    const over = new Event('dragover', { cancelable: true });
    columns[2].dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    drop();
    expect(editor.save).toHaveBeenCalledWith(
      'revision-1',
      expect.objectContaining({ statusId: 'done' }),
      'TEST-1',
    );
  });

  it('retains typed text on a conflict and does not silently overwrite a newer file', async () => {
    const harness = await editableBoard();
    await newItem(harness);
    editor.save.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { message: 'The plan changed.' } }),
      ),
    );
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
    expect(
      (harness.routeNativeElement!.querySelector('[name="title"]') as HTMLInputElement).value,
    ).toBe('A new story');
    expect(harness.routeNativeElement!.textContent).toContain('The plan changed.');
    expect(
      (harness.routeNativeElement!.querySelector('[type="submit"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('asks before discarding changes and handles Escape without losing a draft', async () => {
    const harness = await editableBoard();
    await newItem(harness);
    const dialog = harness.routeNativeElement!.querySelector('.editor-dialog')!;
    const event = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(event);
    harness.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('Discard your unsaved changes?');
    expect(editor.save).not.toHaveBeenCalled();
  });

  it('allows navigation without a prompt when an editor has no changes', async () => {
    const harness = await editableBoard();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    (
      harness.routeNativeElement!.querySelector(
        '.editor-toolbar .editor-primary',
      ) as HTMLButtonElement
    ).click();
    await harness.fixture.whenStable();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    expect(await TestBed.inject(Router).navigateByUrl('/away')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps a dirty draft when navigation is cancelled and leaves only after confirmation', async () => {
    const harness = await editableBoard();
    await newItem(harness);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/away')).toBe(false);
    expect(router.url).toBe('/delivery-plan');
    expect(confirm).toHaveBeenCalledOnce();
    expect(
      (harness.routeNativeElement!.querySelector('[name="title"]') as HTMLInputElement).value,
    ).toBe('A new story');
    expect(editor.save).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    expect(await router.navigateByUrl('/away')).toBe(true);
    expect(router.url).toBe('/away');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it('requests a browser warning for a dirty draft but stops warning after saving', async () => {
    const harness = await editableBoard();
    await newItem(harness);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    editor.save.mockReturnValue(of({ plan, revision: 'revision-2', workItemId: 'TEST-3' }));
    harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
    harness.detectChanges();
    const savedUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(savedUnload);
    expect(savedUnload.defaultPrevented).toBe(false);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(await TestBed.inject(Router).navigateByUrl('/away')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('blocks navigation while a save is pending, including moves without an open draft', async () => {
    const harness = await editableBoard();
    const saved = new Subject<DeliverySnapshot>();
    editor.save.mockReturnValue(saved);
    const select = harness.routeNativeElement!.querySelector(
      '.quick-move select',
    ) as HTMLSelectElement;
    select.value = 'done';
    select.dispatchEvent(new Event('change'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await TestBed.inject(Router).navigateByUrl('/away')).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    saved.next({ plan, revision: 'revision-2', workItemId: 'TEST-1' });
    saved.complete();
    expect(await TestBed.inject(Router).navigateByUrl('/away')).toBe(true);
  });

  describe('protected build (no local editor, Content publication served by Domain)', () => {
    const snapshot = structuredClone(plan);
    snapshot.workItems[0].evidence = [
      { id: 'report', title: 'Route inventory report', path: 'docs/evidence/report.md' },
    ];
    beforeEach(() => {
      protectedBuild = true;
      publication.load.mockReturnValue(of({ plan: snapshot, revision: 'published-1' }));
    });

    async function publishedBoard(status = 404): Promise<RouterTestingHarness> {
      editor.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
      harness.detectChanges();
      return harness;
    }

    it.each([404, 0])(
      'shows the published copy read-only when the local editor answers %s',
      async (status) => {
        const harness = await publishedBoard(status);
        const root = harness.routeNativeElement!;
        expect(publication.load).toHaveBeenCalledOnce();
        expect(content.getDeliveryPlan).not.toHaveBeenCalled();
        expect(root.textContent).toContain('Deliver deliberately');
        expect(root.textContent).toContain(
          'Published copy, read-only; edit on the local workstation.',
        );
        expect(root.textContent).not.toContain('npm run start:private');
        expect(root.textContent).not.toContain('Local editing enabled');
        // Every editing control stays off: create, refresh, status moves and drag.
        expect(root.querySelector('.editor-toolbar .editor-primary')).toBeNull();
        expect(root.querySelector('.editor-toolbar .editor-secondary')).toBeNull();
        expect(root.querySelector('.quick-move select')).toBeNull();
        expect(root.querySelector('.work-item-card')!.getAttribute('draggable')).toBe('false');
        const dialog = await openTicket(harness);
        expect(dialog.querySelector('.dialog-footer button')).toBeNull();
        expect(dialog.textContent).toContain('Read-only plan');
        expect(dialog.querySelector('.evidence-section a')).toBeNull();
        expect(dialog.querySelector('.evidence-section')!.textContent).toContain(
          'open this report on the local workstation',
        );
        expect(editor.save).not.toHaveBeenCalled();
      },
    );

    it('keeps a reachable local editor editable in a connected protected workstation', async () => {
      editor.load.mockReturnValue(of({ plan, revision: 'revision-1' }));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
      harness.detectChanges();
      expect(publication.load).not.toHaveBeenCalled();
      expect(harness.routeNativeElement!.textContent).toContain('Local editing enabled');
      expect(harness.routeNativeElement!.querySelector('.editor-toolbar .editor-primary')).not.toBeNull();
    });

    it('ignores programmatic edit attempts on the published copy', async () => {
      const harness = await publishedBoard();
      const page = harness.fixture.debugElement.query((node) => node.componentInstance instanceof DeliveryPlanPage)
        .componentInstance as DeliveryPlanPage;
      page['openEditor']();
      page['moveItem'](snapshot.workItems[0], 'done');
      harness.detectChanges();
      expect(editor.save).not.toHaveBeenCalled();
      expect(harness.routeNativeElement!.querySelector('.editor-dialog')!.hasAttribute('open')).toBe(false);
    });

    it.each([
      [401, 'Sign in again to read the published delivery plan.'],
      [403, 'Your role cannot read the published delivery plan.'],
    ])('explains a Domain %s on the published copy', async (status, message) => {
      publication.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      const harness = await publishedBoard();
      const root = harness.routeNativeElement!;
      expect(root.textContent).toContain('The published delivery plan is not available to this account.');
      expect(root.textContent).toContain(message);
      expect(root.textContent).not.toContain('needs its local data');
      expect(root.querySelector('app-author-admin-menu nav[aria-label="Admin navigation"]')).not.toBeNull();
    });

    it('reports a missing publication without blaming the local workstation', async () => {
      publication.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      const harness = await publishedBoard();
      expect(harness.routeNativeElement!.textContent).toContain(
        'The published delivery plan could not be loaded.',
      );
    });

    it('keeps the local-editor JSON error path unchanged', async () => {
      const harness = await publishedBoard(500);
      expect(publication.load).not.toHaveBeenCalled();
      expect(harness.routeNativeElement!.textContent).toContain(
        'The local editor could not read the private plan.',
      );
    });

    it('drops a published copy that arrives after author access is lost', async () => {
      const pending = new Subject<DeliverySnapshot>();
      publication.load.mockReturnValue(pending);
      const harness = await publishedBoard();
      TestBed.inject(StudyPlanAccount).account.set(null);
      pending.next({ plan: snapshot, revision: 'published-1' });
      pending.complete();
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).not.toContain('Deliver deliberately');
    });
  });

  describe('DEV plan (the Domain serves and edits delivery/plan.json; DLV-971 runtime stores)', () => {
    const owner = {
      manageAccess: true, previewDocuments: true, deliveryRead: true,
      deliveryCreate: true, deliveryReview: true, deliveryDone: true,
      triageFeedback: true, fullCurriculum: true, feedbackRole: 'owner',
    };
    const reader = { ...owner, manageAccess: false, deliveryCreate: false, deliveryReview: false, deliveryDone: false, feedbackRole: 'reviewer' };
    const devItem = (change: Partial<DeliveryPlan['workItems'][number]> = {}) => ({
      ...structuredClone(plan.workItems[0]),
      updatedAt: '2026-11-06T09:30:00.000Z',
      createdIn: 'dev' as const,
      updatedIn: 'dev' as const,
      origin: null,
      pendingLocal: null,
      ...change,
    });
    const devPlan = (items = [devItem(), structuredClone(plan.workItems[1])], version = 7): DeliveryPlan => ({
      ...structuredClone(plan),
      version,
      workItems: items,
    });

    beforeEach(() => {
      protectedBuild = true;
      TestBed.inject(DevSession).gated.set(true);
      TestBed.inject(StudyPlanAccount).account.update((account) => ({ ...account!, permissions: owner }));
      devApi.load.mockResolvedValue(devPlan());
    });
    afterEach(() => {
      TestBed.inject(DevSession).gated.set(false);
      TestBed.inject(DevSession).status.set(null);
    });

    async function devBoard(): Promise<RouterTestingHarness> {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
      await harness.fixture.whenStable();
      harness.detectChanges();
      return harness;
    }
    /** The harness allows one instance per test; leaving and returning recreates the page. */
    async function reopen(harness: RouterTestingHarness, url = '/delivery-plan') {
      await harness.navigateByUrl('/away', OtherPage);
      await harness.navigateByUrl(url, DeliveryPlanPage);
      await settle(harness);
      return harness.routeNativeElement!;
    }
    async function settle(harness: RouterTestingHarness) {
      for (let pass = 0; pass < 3; pass++) {
        await new Promise((resolve) => setTimeout(resolve));
        await harness.fixture.whenStable();
        harness.detectChanges();
      }
    }
    function submitEditor(harness: RouterTestingHarness) {
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      return settle(harness);
    }
    const fieldNames = (root: Element) =>
      [...root.querySelectorAll<HTMLElement>('.editor-fields [name]')].map((field) => field.getAttribute('name'));

    it('reads the plan from the DEV API behind the gate and lets the owner edit a ticket with the plan version', async () => {
      const harness = await devBoard();
      const root = harness.routeNativeElement!;
      expect(devApi.load).toHaveBeenCalledOnce();
      expect(publication.load).not.toHaveBeenCalled();
      expect(editor.load).toHaveBeenCalledOnce();
      expect(root.textContent).toContain('Editing the plan on DEV');
      expect(root.textContent).not.toContain('Published copy');
      expect(root.querySelector('.editor-toolbar .editor-primary')?.textContent?.trim()).toBe('+ New ticket');
      expect(root.querySelector('.editor-toolbar .editor-primary')?.hasAttribute('hidden')).toBe(false);
      expect(root.querySelector('.quick-move select')).not.toBeNull();
      expect(root.querySelector('.work-item-card')!.getAttribute('draggable')).toBe('true');

      const dialog = await openTicket(harness);
      expect(dialog.querySelector('.dialog-footer span')?.textContent).toBe('updated on DEV · 6 Nov');
      expect(dialog.querySelector('.ticket-origin')).toBeNull();
      expect(dialog.querySelector('.conflict-banner')).toBeNull();
      const edit = dialog.querySelector<HTMLButtonElement>('.dialog-footer .editor-primary')!;
      expect(edit.textContent?.trim()).toBe('Edit ticket');
      edit.click();
      await settle(harness);
      expect(root.querySelector('#editor-title')?.textContent?.trim()).toBe('Edit ticket');
      expect(root.textContent).toContain('Saves go to the plan on DEV.');
      expect(fieldNames(root)).toEqual(['title', 'summary', 'type', 'priority', 'stage', 'status', 'labels', 'notes']);
      // The status select offers the ticket's own column and the moves this account may make.
      expect([...root.querySelectorAll<HTMLOptionElement>('[name="status"] option')].map((option) => option.disabled)).toEqual([false, false, false]);
      await fill(harness, 'title', 'Edited on DEV');
      await fill(harness, 'labels', 'board, dev');
      devApi.update.mockResolvedValue({
        version: 8,
        item: devItem({ title: 'Edited on DEV', labels: ['board', 'dev'] }),
      });
      await submitEditor(harness);
      expect(devApi.update).toHaveBeenCalledWith(
        'TEST-1',
        7,
        expect.objectContaining({
          title: 'Edited on DEV',
          labels: ['board', 'dev'],
          // Fields the DEV form does not show keep their stored values.
          acceptanceCriteria: ['All configured columns render.'],
          dependencies: [],
          blockedBy: [],
        }),
      );
      expect(root.querySelector('.editor-dialog')!.hasAttribute('open')).toBe(false);
      expect(root.textContent).toContain('TEST-1 saved to the plan on DEV.');
      expect(root.textContent).toContain('Edited on DEV');
      expect(editor.save).not.toHaveBeenCalled();
    });

    it('creates a ticket from the small form: title, outcome, type, priority and stage', async () => {
      const harness = await devBoard();
      const root = harness.routeNativeElement!;
      root.querySelector<HTMLButtonElement>('.editor-toolbar .editor-primary')!.click();
      await settle(harness);
      expect(root.querySelector('#editor-title')?.textContent?.trim()).toBe('New ticket');
      expect(fieldNames(root)).toEqual(['title', 'summary', 'type', 'priority', 'stage']);
      expect(root.querySelector('[type="submit"]')?.textContent?.trim()).toBe('Save ticket');
      await submitEditor(harness);
      expect(root.textContent).toContain('Add a title and an outcome.');
      expect(devApi.create).not.toHaveBeenCalled();
      await fill(harness, 'title', 'A DEV ticket');
      await fill(harness, 'summary', 'Raised on the page.');
      await fill(harness, 'type', 'bug');
      devApi.create.mockResolvedValue({
        version: 8,
        item: devItem({ id: 'DLV-0042', title: 'A DEV ticket', summary: 'Raised on the page.', type: 'bug', statusId: 'backlog' }),
      });
      await submitEditor(harness);
      expect(devApi.create).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          title: 'A DEV ticket',
          summary: 'Raised on the page.',
          type: 'bug',
          stageId: 'foundation',
          statusId: 'backlog',
          priorityId: 'P1',
          acceptanceCriteria: [],
          labels: [],
        }),
      );
      expect(root.textContent).toContain('DLV-0042 saved to the plan on DEV.');
      expect(root.textContent).toContain('Showing 2 of 3 work items');
    });

    it('reloads the plan on a version conflict and asks for the change again, keeping the draft', async () => {
      const harness = await devBoard();
      const root = harness.routeNativeElement!;
      root.querySelector<HTMLButtonElement>('.editor-toolbar .editor-primary')!.click();
      await settle(harness);
      await fill(harness, 'title', 'Second writer');
      await fill(harness, 'summary', 'Collides.');
      devApi.create.mockRejectedValueOnce(new DeliveryPlanApiError(409, 'VERSION_CONFLICT'));
      devApi.load.mockResolvedValueOnce(devPlan([devItem({ title: 'Changed by someone else' }), structuredClone(plan.workItems[1])], 9));
      await submitEditor(harness);
      expect(devApi.load).toHaveBeenCalledTimes(2);
      expect(root.querySelector('.editor-error')?.textContent).toContain('Someone changed the plan; reloaded, apply your change again.');
      expect((root.querySelector('[name="title"]') as HTMLInputElement).value).toBe('Second writer');
      expect((root.querySelector('[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
      expect(root.textContent).toContain('Changed by someone else');
      devApi.create.mockResolvedValueOnce({ version: 10, item: devItem({ id: 'DLV-0043', title: 'Second writer' }) });
      await submitEditor(harness);
      expect(devApi.create).toHaveBeenLastCalledWith(9, expect.objectContaining({ title: 'Second writer' }));
      expect(root.querySelector('.editor-dialog')!.hasAttribute('open')).toBe(false);
      // A refused save keeps the draft with a plain message.
      root.querySelector<HTMLButtonElement>('.editor-toolbar .editor-primary')!.click();
      await settle(harness);
      await fill(harness, 'title', 'Refused');
      await fill(harness, 'summary', 'Refused.');
      devApi.create.mockRejectedValueOnce(new DeliveryPlanApiError(403, 'FORBIDDEN'));
      await submitEditor(harness);
      expect(root.querySelector('.editor-error')?.textContent).toContain('Your role cannot make this change on DEV.');
      devApi.create.mockRejectedValueOnce(new DeliveryPlanApiError(0, null));
      await submitEditor(harness);
      expect(root.querySelector('.editor-error')?.textContent).toContain('Save failed. Your draft is retained; try again.');
    });

    it('moves a card on DEV with the plan version, and reloads on a conflict', async () => {
      const harness = await devBoard();
      const root = harness.routeNativeElement!;
      const select = root.querySelector('.quick-move select') as HTMLSelectElement;
      devApi.update.mockResolvedValueOnce({ version: 8, item: devItem({ statusId: 'done' }) });
      select.value = 'done';
      select.dispatchEvent(new Event('change'));
      await settle(harness);
      expect(devApi.update).toHaveBeenCalledWith('TEST-1', 7, expect.objectContaining({ statusId: 'done', title: 'Render a data-driven board' }));
      expect(root.textContent).toContain('TEST-1 moved to Done on DEV.');
      expect(root.querySelectorAll('.board-column')[2].textContent).toContain('Render a data-driven board');
      // The version advanced with the write; a later conflict reloads and says so.
      devApi.update.mockRejectedValueOnce(new DeliveryPlanApiError(409, 'VERSION_CONFLICT'));
      devApi.load.mockResolvedValueOnce(devPlan([devItem({ statusId: 'done' }), structuredClone(plan.workItems[1])], 12));
      const back = root.querySelector('.quick-move select') as HTMLSelectElement;
      back.value = 'in-progress';
      back.dispatchEvent(new Event('change'));
      await settle(harness);
      expect(devApi.update).toHaveBeenLastCalledWith('TEST-1', 8, expect.objectContaining({ statusId: 'in-progress' }));
      expect(root.textContent).toContain('Someone changed the plan; reloaded, apply your change again.');
      devApi.update.mockRejectedValueOnce(new DeliveryPlanApiError(500, null));
      back.value = 'in-progress';
      back.dispatchEvent(new Event('change'));
      await settle(harness);
      expect(root.textContent).toContain('Move could not be saved. The item stays in its original column.');
      // Refresh board reads DEV again and reports the version it found.
      devApi.load.mockResolvedValueOnce(devPlan([devItem({ statusId: 'done' }), structuredClone(plan.workItems[1])], 12));
      root.querySelector<HTMLButtonElement>('.editor-toolbar .editor-secondary')!.click();
      await settle(harness);
      expect(root.textContent).toContain('Board is up to date.');
      devApi.load.mockResolvedValueOnce(devPlan([devItem({ statusId: 'done' }), structuredClone(plan.workItems[1])], 13));
      root.querySelector<HTMLButtonElement>('.editor-toolbar .editor-secondary')!.click();
      await settle(harness);
      expect(root.textContent).toContain('Board refreshed from DEV.');
      devApi.load.mockRejectedValueOnce(new DeliveryPlanApiError(0, null));
      root.querySelector<HTMLButtonElement>('.editor-toolbar .editor-secondary')!.click();
      await settle(harness);
      expect(root.textContent).toContain('The plan on DEV could not be refreshed. Current data is retained.');
      expect(editor.load).toHaveBeenCalledOnce();
    });

    it('shows the published copy with a notice until the first DEV plan is uploaded, and outside the gate', async () => {
      devApi.load.mockRejectedValueOnce(new DeliveryPlanApiError(404, 'DELIVERY_PLAN_MISSING'));
      publication.load.mockReturnValue(of({ plan: structuredClone(plan), revision: 'published-1' }));
      const harness = await devBoard();
      let root = harness.routeNativeElement!;
      expect(devApi.load).toHaveBeenCalledOnce();
      expect(publication.load).toHaveBeenCalledOnce();
      expect(root.querySelector('.plan-notice')?.textContent?.trim()).toBe(
        'The plan on DEV has not been uploaded yet; showing the published copy.',
      );
      expect(root.textContent).toContain('Published copy, read-only; edit on the local workstation.');
      expect(root.querySelector('.editor-toolbar .editor-primary')).toBeNull();
      // Outside the DEV gate the API is never asked.
      TestBed.inject(DevSession).gated.set(false);
      devApi.load.mockClear();
      publication.load.mockClear();
      root = await reopen(harness);
      expect(devApi.load).not.toHaveBeenCalled();
      expect(publication.load).toHaveBeenCalledOnce();
      expect(root.querySelector('.plan-notice')).toBeNull();
      // An admitted session (status set) counts as DEV like the bare gate does.
      TestBed.inject(DevSession).status.set({ dev: true, deadline: '', warning: false, maintenance: false });
      devApi.load.mockClear();
      await reopen(harness);
      expect(devApi.load).toHaveBeenCalledOnce();
    });

    it('waits for the first DEV gate answer on a direct link, and gives up on the publication after a while', async () => {
      vi.useFakeTimers();
      try {
        const session = TestBed.inject(DevSession);
        session.gated.set(false);
        session.known.set(false);
        publication.load.mockReturnValue(of({ plan: structuredClone(plan), revision: 'published-1' }));
        const harness = await RouterTestingHarness.create();
        await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
        harness.detectChanges();
        expect(devApi.load).not.toHaveBeenCalled();
        expect(publication.load).not.toHaveBeenCalled();
        session.gated.set(true);
        session.known.set(true);
        await vi.advanceTimersByTimeAsync(10);
        harness.detectChanges();
        expect(devApi.load).toHaveBeenCalledOnce();
        expect(publication.load).not.toHaveBeenCalled();
        session.gated.set(false);
        session.known.set(false);
        devApi.load.mockClear();
        await harness.navigateByUrl('/away', OtherPage);
        await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
        await vi.advanceTimersByTimeAsync(3100);
        harness.detectChanges();
        expect(devApi.load).not.toHaveBeenCalled();
        expect(publication.load).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
        TestBed.inject(DevSession).known.set(true);
      }
    });

    it.each([
      [401, 'Sign in again to read the delivery plan on DEV.'],
      [403, 'Your role cannot read the delivery plan on DEV.'],
      [500, 'The plan on DEV could not be loaded. Try again.'],
    ])('explains a DEV plan the Domain answers %s and never falls back silently', async (status, message) => {
      devApi.load.mockRejectedValueOnce(new DeliveryPlanApiError(status, null));
      const harness = await devBoard();
      const root = harness.routeNativeElement!;
      expect(publication.load).not.toHaveBeenCalled();
      expect(root.textContent).toContain('The delivery plan on DEV is not available.');
      expect(root.textContent).toContain(message);
      expect(root.querySelector('app-author-admin-menu nav[aria-label="Admin navigation"]')).not.toBeNull();
    });

    it('links a promoted ticket to the review or learner request it came from', async () => {
      devApi.load.mockResolvedValue(
        devPlan([
          devItem({ origin: { id: 'REV-000001', kind: 'review' } }),
          { ...structuredClone(plan.workItems[1]), origin: { id: 'SUP-000001', kind: 'request' } },
        ]),
      );
      const harness = await devBoard();
      let dialog = await openTicket(harness);
      let origin = dialog.querySelector<HTMLAnchorElement>('.ticket-origin a')!;
      expect(origin.textContent?.trim()).toBe('From review REV-000001');
      expect(origin.getAttribute('href')).toBe('/admin/feedback#REV-000001');
      const page = harness.fixture.debugElement.query((node) => node.componentInstance instanceof DeliveryPlanPage)
        .componentInstance as DeliveryPlanPage;
      page['closeWorkItem']();
      await switchView(harness, 'All tickets');
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.ticket-row')[1].click();
      await settle(harness);
      dialog = harness.routeNativeElement!.querySelector<HTMLDialogElement>('.work-item-dialog')!;
      origin = dialog.querySelector<HTMLAnchorElement>('.ticket-origin a')!;
      expect(origin.textContent?.trim()).toBe('From learner request SUP-000001');
      expect(origin.getAttribute('href')).toBe('/admin/feedback#SUP-000001');
      // A ticket without stamps keeps the plain date line.
      expect(dialog.querySelector('.dialog-footer span')?.textContent).toBe('Updated 2026-09-03');
    });

    it('shows an unmerged local edit as a field diff and resolves it with Keep DEV or Take local', async () => {
      const conflicted = devItem({
        pendingLocal: devItem({
          title: 'Local title',
          labels: ['board', 'local'],
          notes: ['A note written locally'],
          updatedIn: 'local',
          pendingLocal: null,
        }),
      });
      devApi.load.mockResolvedValue(devPlan([conflicted, structuredClone(plan.workItems[1])]));
      const harness = await devBoard();
      const root = harness.routeNativeElement!;
      expect(root.querySelector('.work-item-card .conflict-mark')?.textContent).toBe('Local edit pending');
      let dialog = await openTicket(harness);
      const banner = dialog.querySelector('.conflict-banner')!;
      expect(banner.querySelector('h3')?.textContent).toBe('A local edit of this ticket was not merged');
      const rows = [...banner.querySelectorAll('.conflict-diff div')].map((row) => ({
        field: row.querySelector('dt')?.textContent,
        dev: row.querySelector('.diff-dev')?.textContent?.replace(/\s+/g, ' ').trim(),
        local: row.querySelector('.diff-local')?.textContent?.replace(/\s+/g, ' ').trim(),
      }));
      expect(rows).toEqual([
        { field: 'Title', dev: 'DEV Render a data-driven board', local: 'Local Local title' },
        { field: 'Labels', dev: 'DEV board', local: 'Local board, local' },
        { field: 'Notes', dev: 'DEV —', local: 'Local A note written locally' },
      ]);
      const buttons = [...banner.querySelectorAll<HTMLButtonElement>('.conflict-actions button')];
      expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Keep DEV', 'Take local']);
      devApi.resolveConflict.mockResolvedValueOnce({ version: 8, item: devItem() });
      buttons[0].click();
      await settle(harness);
      expect(devApi.resolveConflict).toHaveBeenCalledWith('TEST-1', 7, 'dev');
      expect(dialog.querySelector('.conflict-banner')).toBeNull();
      expect(root.textContent).toContain('TEST-1: kept the DEV version; the local edit was dropped.');
      expect(root.querySelector('.conflict-mark')).toBeNull();

      // Take local, from a fresh load with the conflict back.
      devApi.load.mockResolvedValue(devPlan([conflicted, structuredClone(plan.workItems[1])]));
      const second = harness;
      await reopen(second);
      dialog = await openTicket(second);
      devApi.resolveConflict.mockResolvedValueOnce({
        version: 8,
        item: devItem({ title: 'Local title', labels: ['board', 'local'], notes: ['A note written locally'] }),
      });
      [...dialog.querySelectorAll<HTMLButtonElement>('.conflict-actions button')][1].click();
      await settle(second);
      expect(devApi.resolveConflict).toHaveBeenLastCalledWith('TEST-1', 7, 'local');
      expect(dialog.querySelector('.conflict-banner')).toBeNull();
      expect(dialog.querySelector('h2')?.textContent).toBe('Local title');
      expect(second.routeNativeElement!.textContent).toContain('TEST-1: took the local edit.');

      // A conflict while resolving reloads; any other failure leaves the ticket as it was.
      devApi.load.mockResolvedValue(devPlan([conflicted, structuredClone(plan.workItems[1])]));
      const third = harness;
      await reopen(third);
      dialog = await openTicket(third);
      devApi.resolveConflict.mockRejectedValueOnce(new DeliveryPlanApiError(409, 'VERSION_CONFLICT'));
      devApi.load.mockResolvedValueOnce(devPlan([conflicted, structuredClone(plan.workItems[1])], 9));
      dialog.querySelector<HTMLButtonElement>('.conflict-actions button')!.click();
      await settle(third);
      expect(third.routeNativeElement!.textContent).toContain('Someone changed the plan; reloaded, apply your change again.');
      expect(dialog.querySelector('.conflict-banner')).not.toBeNull();
      devApi.resolveConflict.mockRejectedValueOnce(new DeliveryPlanApiError(500, null));
      dialog.querySelector<HTMLButtonElement>('.conflict-actions button')!.click();
      await settle(third);
      expect(third.routeNativeElement!.textContent).toContain('The conflict could not be resolved. The ticket is unchanged; try again.');
      expect(devApi.resolveConflict).toHaveBeenLastCalledWith('TEST-1', 9, 'dev');
    });

    it('keeps the DEV plan read-only for a reviewer: no create, edit, move, drag or conflict buttons', async () => {
      TestBed.inject(StudyPlanAccount).account.update((account) => ({ ...account!, permissions: reader }));
      devApi.load.mockResolvedValue(
        devPlan([devItem({ pendingLocal: devItem({ title: 'Local title', pendingLocal: null }) }), structuredClone(plan.workItems[1])]),
      );
      const harness = await devBoard();
      const root = harness.routeNativeElement!;
      expect(root.textContent).toContain('The plan on DEV, read-only for your role.');
      expect(root.textContent).not.toContain('Editing the plan on DEV');
      expect(root.querySelector('.editor-toolbar .editor-primary')?.hasAttribute('hidden')).toBe(true);
      expect(root.querySelector('.quick-move select')).toBeNull();
      expect(root.querySelector('.work-item-card')!.getAttribute('draggable')).toBe('false');
      const dialog = await openTicket(harness);
      expect(dialog.querySelector('.dialog-footer button')).toBeNull();
      expect(dialog.textContent).toContain('Read-only plan');
      expect(dialog.querySelector('.conflict-banner h3')?.textContent).toBe('A local edit of this ticket was not merged');
      expect(dialog.querySelector('.conflict-actions')).toBeNull();
      const page = harness.fixture.debugElement.query((node) => node.componentInstance instanceof DeliveryPlanPage)
        .componentInstance as DeliveryPlanPage;
      page['openEditor'](devItem());
      page['moveItem'](devItem(), 'done');
      await page['resolveConflict'](devItem(), 'dev');
      harness.detectChanges();
      expect(devApi.update).not.toHaveBeenCalled();
      expect(devApi.resolveConflict).not.toHaveBeenCalled();
      expect(root.querySelector('.editor-dialog')!.hasAttribute('open')).toBe(false);
      // An admin with deliveryCreate edits cards and moves to review, but may not close.
      TestBed.inject(StudyPlanAccount).account.update((account) => ({
        ...account!,
        permissions: { ...reader, deliveryCreate: true, deliveryReview: true },
      }));
      const admin = harness;
      const adminRoot = await reopen(admin);
      expect(adminRoot.querySelector('.editor-toolbar .editor-primary')?.hasAttribute('hidden')).toBe(false);
      const adminDialog = await openTicket(admin);
      expect(adminDialog.querySelector('.dialog-footer .editor-primary')?.textContent?.trim()).toBe('Edit ticket');
      expect(adminDialog.querySelector('.conflict-actions')).not.toBeNull();
      adminDialog.querySelector<HTMLButtonElement>('.dialog-footer .editor-primary')!.click();
      await settle(admin);
      expect([...adminRoot.querySelectorAll<HTMLOptionElement>('[name="status"] option')].map((option) => option.disabled)).toEqual([true, false, true]);
    });
  });
});
