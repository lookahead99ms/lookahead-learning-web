import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError, Observable, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ContentService } from '../../content/content.service';
import { DeliveryPlan } from '../../content/delivery-plan.models';
import { DeliveryEditorService, DeliverySnapshot } from '../../content/delivery-editor.service';
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

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    editor.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    editor.save.mockReset();
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    await TestBed.configureTestingModule({
      providers: [
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
      ],
    }).compileComponents();
  });

  it('renders workflow columns and arbitrary stages from JSON', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/delivery-plan', DeliveryPlanPage);
    harness.detectChanges();

    expect(content.getDeliveryPlan).toHaveBeenCalledOnce();
    expect(harness.routeNativeElement?.textContent).toContain('Read-only view');
    expect(harness.routeNativeElement?.querySelector('.editor-toolbar .editor-primary')).toBeNull();
    expect(harness.routeNativeElement?.querySelectorAll('.board-column')).toHaveLength(3);
    expect(harness.routeNativeElement?.textContent).toContain('Render a data-driven board');
    expect(harness.routeNativeElement?.textContent).not.toContain('Keep another item');

    (
      harness.routeNativeElement?.querySelectorAll('.view-tabs button')[1] as HTMLButtonElement
    ).click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Future stage from JSON');
    expect(harness.routeNativeElement?.textContent).toContain('A sequence from data');
    expect(TestBed.inject(Router).url).toBe('/delivery-plan?view=roadmap');
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
});
