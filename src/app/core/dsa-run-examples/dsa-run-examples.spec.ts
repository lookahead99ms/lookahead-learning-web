import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { DsaRunExamples } from './dsa-run-examples';
import { DsaExecutionClient, ExecutionJob } from './dsa-execution-client';

const owner = '00000000-0000-4000-8000-000000000001';
const capability = {
  schemaVersion: 'execution/v1',
  enabled: true,
  problems: [
    {
      problemId: 'algorithmic-two-sum',
      languages: ['java', 'python', 'go'],
      contractVersion: 'two-sum/v1',
      fixtureVersion: 'visible/v1',
    },
  ],
  limits: { sourceBytes: 65536 },
};
async function hash(source: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function result(
  source = 'source',
  status: ExecutionJob['status'] = 'passed',
): Promise<ExecutionJob> {
  return {
    schemaVersion: 'execution/v1',
    id: 'job-1',
    status,
    problemId: 'algorithmic-two-sum',
    language: 'python',
    sourceSha256: await hash(source),
    contractVersion: 'two-sum/v1',
    fixtureVersion: 'visible/v1',
    results: [
      {
        fixtureId: 'standard',
        status: 'passed',
        actual: [3, 2],
        diagnostics: '<img src=x onerror=alert(1)>',
      },
    ],
  };
}
describe('DsaRunExamples lifecycle', () => {
  const account = { account: signal<any>(null), sessionExpired: signal(false) };
  let client: {
    capabilities: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<DsaRunExamples>;
  beforeEach(async () => {
    account.account.set(null);
    account.sessionExpired.set(false);
    client = {
      capabilities: vi.fn().mockResolvedValue(capability),
      start: vi.fn(),
      status: vi.fn(),
      cancel: vi.fn().mockResolvedValue(null),
    };
    await TestBed.configureTestingModule({
      imports: [DsaRunExamples],
      providers: [
        { provide: StudyPlanAccount, useValue: account },
        { provide: DsaExecutionClient, useValue: client },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DsaRunExamples);
    fixture.componentRef.setInput('problemId', 'algorithmic-two-sum');
    fixture.componentRef.setInput('language', 'python');
    fixture.componentRef.setInput('source', 'source');
    fixture.componentRef.setInput('fixtures', [
      {
        id: 'standard',
        label: 'Standard example',
        input: '[2,7,11,15], target 26',
        expectedOutput: '[2,3]',
      },
    ]);
  });
  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });
  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function buttons() {
    return [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
  }
  it('makes zero execution requests for anonymous users and unsupported problems', async () => {
    await settle();
    expect(client.capabilities).not.toHaveBeenCalled();
    expect(buttons()).toHaveLength(0);
    account.account.set({ accountId: owner, authorPreview: true });
    fixture.componentRef.setInput('problemId', 'another-problem');
    await settle();
    expect(client.capabilities).not.toHaveBeenCalled();
  });
  it('checks readiness without submitting code; unavailable runner disables Run', async () => {
    client.capabilities.mockResolvedValue({ ...capability, enabled: false });
    account.account.set({ accountId: owner, authorPreview: true });
    await settle();
    expect(buttons()[0].disabled).toBe(true);
    expect(client.start).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('unavailable');
  });
  it('keeps Check runner focus during refresh and ignores duplicate activation', async () => {
    client.capabilities.mockResolvedValue({ ...capability, enabled: false });
    account.account.set({ accountId: owner, authorPreview: true });
    await settle();
    let deliver!: (value: typeof capability) => void;
    client.capabilities.mockReturnValueOnce(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );
    const check = buttons().find((button) => button.textContent?.includes('Check runner'))!;
    check.focus();
    check.click();
    fixture.detectChanges();
    expect(check.disabled).toBe(false);
    expect(check.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(check);
    check.click();
    fixture.detectChanges();
    expect(client.capabilities).toHaveBeenCalledTimes(2);
    deliver({ ...capability, enabled: false });
    await settle();
    expect(document.activeElement).toBe(check);
    expect(check.getAttribute('aria-disabled')).toBe('false');
  });
  it('escapes diagnostics, displays contract/results and flags edits against submitted snapshot', async () => {
    account.account.set({ accountId: owner, authorPreview: true });
    client.start.mockResolvedValue(await result());
    await settle();
    await (fixture.componentInstance as any).run();
    await settle();
    expect(fixture.nativeElement.textContent).toContain('Examples passed');
    expect(fixture.nativeElement.textContent).toContain('Either index order');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<img');
    fixture.componentRef.setInput('source', 'new draft');
    await settle();
    expect(fixture.nativeElement.textContent).toContain('editor has changed');
    expect(client.start).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatched source results', async () => {
    account.account.set({ accountId: owner, authorPreview: true });
    client.start.mockResolvedValue(await result('other source'));
    await settle();
    await (fixture.componentInstance as any).run();
    await settle();
    expect(fixture.nativeElement.textContent).toContain('does not match');
    expect(fixture.nativeElement.textContent).not.toContain('Examples passed');
  });
  it('cancels its accepted job after route teardown while submission is pending', async () => {
    let complete!: (value: ExecutionJob) => void;
    account.account.set({ accountId: owner, authorPreview: true });
    client.start.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    await settle();
    const run = (fixture.componentInstance as any).run();
    await vi.waitFor(() => expect(client.start).toHaveBeenCalled());
    fixture.componentRef.setInput('problemId', 'other');
    fixture.detectChanges();
    complete(await result('source', 'running'));
    await run;
    expect(client.cancel).toHaveBeenCalledWith(owner, 'job-1');
  });

  it('gives a clear secure-context message without submitting when crypto is unavailable', async () => {
    account.account.set({ accountId: owner, authorPreview: true });
    await settle();
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', {});
    try {
      await (fixture.componentInstance as any).run();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('requires HTTPS or localhost');
      expect(client.start).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });
  it('does not overlap polls or let a late running response undo cancellation', async () => {
    const running = await result('source', 'running');
    const canceled = await result('source', 'canceled');
    let deliverStatus!: (value: ExecutionJob) => void;
    account.account.set({ accountId: owner, authorPreview: true });
    client.start.mockResolvedValue(running);
    client.status.mockReturnValue(
      new Promise((resolve) => {
        deliverStatus = resolve;
      }),
    );
    client.cancel.mockResolvedValue(canceled);
    await settle();
    vi.useFakeTimers();
    await (fixture.componentInstance as any).run();
    await vi.advanceTimersByTimeAsync(2400);
    expect(client.status).toHaveBeenCalledTimes(1);
    await (fixture.componentInstance as any).cancel();
    deliverStatus(running);
    await vi.advanceTimersByTimeAsync(2400);
    fixture.detectChanges();
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Canceled');
    expect(buttons().some((button) => button.textContent?.includes('Cancel run'))).toBe(false);
  });
  it('discards stale capabilities when the author signs out', async () => {
    let deliver!: (value: typeof capability) => void;
    client.capabilities.mockReturnValue(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );
    account.account.set({ accountId: owner, authorPreview: true });
    fixture.detectChanges();
    account.account.set(null);
    fixture.detectChanges();
    deliver(capability);
    await settle();
    expect(buttons()).toHaveLength(0);
    expect(client.start).not.toHaveBeenCalled();
  });
  it('retains editor content and cancels actual job on explicit cancel', async () => {
    account.account.set({ accountId: owner, authorPreview: true });
    client.start.mockResolvedValue(await result('source', 'running'));
    client.cancel.mockResolvedValue(await result('source', 'canceled'));
    await settle();
    await (fixture.componentInstance as any).run();
    fixture.detectChanges();
    buttons()
      .find((b) => b.textContent?.includes('Cancel run'))!
      .click();
    await settle();
    expect(client.cancel).toHaveBeenCalledWith(owner, 'job-1');
    expect(fixture.componentInstance.source()).toBe('source');
    expect(fixture.nativeElement.textContent).toContain('Canceled');
  });
});
