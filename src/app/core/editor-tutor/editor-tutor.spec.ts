import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorTutor } from './editor-tutor';
import {
  ScriptedTutorProvider,
  TUTOR_PROVIDER,
  TutorProvider,
  TutorReply,
  TutorRequest,
  tutorLimits,
} from './tutor-provider';

const problem = {
  id: 'algorithmic-two-sum',
  title: 'Two Sum',
  prompt: 'Return two distinct indices whose values sum to the target.',
};
async function setup(provider: TutorProvider = new ScriptedTutorProvider()) {
  await TestBed.configureTestingModule({
    imports: [EditorTutor],
    providers: [{ provide: TUTOR_PROVIDER, useValue: provider }],
  }).compileComponents();
  const fixture = TestBed.createComponent(EditorTutor);
  fixture.componentRef.setInput('problem', problem);
  fixture.componentRef.setInput('code', 'my own attempt');
  fixture.componentRef.setInput('language', 'python');
  fixture.detectChanges();
  return fixture;
}
function ask(
  fixture: ComponentFixture<EditorTutor>,
  question = 'What should I consider?',
  help = 'question',
) {
  const root = fixture.nativeElement as HTMLElement;
  const select = root.querySelector('select')!;
  select.value = help;
  select.dispatchEvent(new Event('change'));
  const input = root.querySelector('textarea')!;
  input.value = question;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}
async function settle(fixture: ComponentFixture<EditorTutor>) {
  await Promise.resolve();
  await Promise.resolve();
  await fixture.whenStable();
  fixture.detectChanges();
}
afterEach(() => vi.useRealTimers());

describe('EditorTutor snapshot and request boundary', () => {
  it('does not request on mount, edits or language changes; submit sends only explicit bounded context', async () => {
    const review = vi.fn(async (request: TutorRequest) => ({
      snapshotId: request.snapshot.id,
      text: 'Scripted question.',
    }));
    const fixture = await setup({ review });
    fixture.componentRef.setInput('code', 'new own attempt');
    fixture.componentRef.setInput('language', 'go');
    fixture.detectChanges();
    expect(review).not.toHaveBeenCalled();
    ask(fixture, 'Why does this lookup return zero?', 'syntax');
    await settle(fixture);
    expect(review).toHaveBeenCalledTimes(1);
    const request = review.mock.calls[0]![0];
    expect(request.snapshot).toMatchObject({ problem, language: 'go', code: 'new own attempt' });
    expect(Object.keys(request).sort()).toEqual([
      'help',
      'hintLevel',
      'history',
      'question',
      'snapshot',
    ]);
    expect(fixture.nativeElement.textContent).toContain('Matches the current editor');
    expect(fixture.componentInstance.code()).toBe('new own attempt');
  });

  it('retains the exact submitted snapshot when edits occur during a delayed reply and blocks duplicate submission', async () => {
    let resolve!: (reply: TutorReply) => void;
    const review = vi.fn(
      () =>
        new Promise<TutorReply>((done) => {
          resolve = done;
        }),
    );
    const fixture = await setup({ review });
    ask(fixture);
    ask(fixture);
    expect(review).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('code', 'changed while pending');
    fixture.detectChanges();
    resolve({ snapshotId: 1, text: 'Example response' });
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('code').textContent).toBe('my own attempt');
    expect(fixture.nativeElement.textContent).toContain('Editor changed since submission');
    fixture.componentRef.setInput('code', 'my own attempt');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Editor changed since submission');
  });

  it('marks old language feedback stale even after switching back', async () => {
    const fixture = await setup();
    ask(fixture);
    await settle(fixture);
    fixture.componentRef.setInput('language', 'java');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Editor changed since submission');
    fixture.componentRef.setInput('language', 'python');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Editor changed since submission');
  });

  it('labels earlier provider history with its original language and revision after an editor change', async () => {
    const review = vi.fn(async (request: TutorRequest) => ({
      snapshotId: request.snapshot.id,
      text: 'Example feedback',
    }));
    const fixture = await setup({ review });
    ask(fixture);
    await settle(fixture);
    const original = review.mock.calls[0]![0].snapshot;
    fixture.componentRef.setInput('language', 'java');
    fixture.componentRef.setInput('code', 'new Java attempt');
    fixture.detectChanges();
    ask(fixture);
    await settle(fixture);
    expect(review.mock.calls[1]![0].history[0]).toMatchObject({
      snapshotId: original.id,
      editorRevision: original.revision,
      language: 'python',
      problemId: problem.id,
      matchesCurrentEditor: false,
    });
    expect(review.mock.calls[1]![0].snapshot.language).toBe('java');
  });

  it('clears per-problem history and discards a late reply from the previous problem', async () => {
    let resolve!: (reply: TutorReply) => void;
    const fixture = await setup({
      review: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    ask(fixture);
    fixture.componentRef.setInput('problem', { ...problem, id: 'different-problem' });
    fixture.detectChanges();
    resolve({ snapshotId: 1, text: 'Old problem feedback' });
    await settle(fixture);
    expect(fixture.nativeElement.querySelectorAll('.exchanges li')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain('Old problem feedback');
  });

  it('retains the question after provider failure and retries only on another submit', async () => {
    const review = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockImplementation(async (request: TutorRequest) => ({
        snapshotId: request.snapshot.id,
        text: 'Retry example',
      }));
    const fixture = await setup({ review });
    ask(fixture, 'Keep this question');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'could not respond',
    );
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('Keep this question');
    expect(review).toHaveBeenCalledTimes(1);
    ask(fixture, 'Keep this question');
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Retry example');
  });

  it('rejects misattributed and oversized provider output', async () => {
    const review = vi
      .fn()
      .mockResolvedValueOnce({ snapshotId: 999, text: 'Wrong snapshot' })
      .mockImplementation(async (request: TutorRequest) => ({
        snapshotId: request.snapshot.id,
        text: 'x'.repeat(tutorLimits.response + 1),
      }));
    const fixture = await setup({ review });
    ask(fixture);
    await settle(fixture);
    ask(fixture);
    await settle(fixture);
    expect(fixture.nativeElement.querySelectorAll('.exchanges li')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain('Wrong snapshot');
  });

  it('times out and aborts a stalled provider without changing code', async () => {
    const review = vi.fn(
      (_request: TutorRequest, _signal: AbortSignal) => new Promise<TutorReply>(() => {}),
    );
    const fixture = await setup({ review });
    vi.useFakeTimers();
    ask(fixture);
    await vi.advanceTimersByTimeAsync(tutorLimits.timeoutMs);
    fixture.detectChanges();
    expect(review.mock.calls[0]![1].aborted).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('could not respond');
    expect(fixture.componentInstance.code()).toBe('my own attempt');
  });

  it('enforces input and conversation limits without truncating learner code', async () => {
    const review = vi.fn(async (request: TutorRequest) => ({
      snapshotId: request.snapshot.id,
      text: 'Example',
    }));
    const fixture = await setup({ review });
    fixture.componentRef.setInput('code', 'x'.repeat(tutorLimits.code + 1));
    fixture.detectChanges();
    ask(fixture);
    await settle(fixture);
    expect(review).not.toHaveBeenCalled();
    fixture.componentRef.setInput('code', 'small attempt');
    fixture.detectChanges();
    ask(fixture, 'x'.repeat(tutorLimits.question + 1));
    await settle(fixture);
    expect(review).not.toHaveBeenCalled();
    for (let index = 0; index < tutorLimits.exchanges; index++) {
      ask(fixture);
      await settle(fixture);
    }
    ask(fixture);
    await settle(fixture);
    expect(review).toHaveBeenCalledTimes(12);
    expect(review.mock.calls.at(-1)![0].history).toHaveLength(4);
  });

  it('renders learner and provider text without interpreting HTML', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    const fixture = await setup({
      review: async (request) => ({ snapshotId: request.snapshot.id, text: attack }),
    });
    ask(fixture, attack);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.response').textContent).toContain(attack);
  });

  it('clears conversation without changing editor or submitting and ignores late cancelled replies', async () => {
    let resolve!: (reply: TutorReply) => void;
    const review = vi.fn(
      () =>
        new Promise<TutorReply>((done) => {
          resolve = done;
        }),
    );
    const fixture = await setup({ review });
    ask(fixture);
    fixture.detectChanges();
    const clear = [...fixture.nativeElement.querySelectorAll('button')].find((button: any) =>
      button.textContent.includes('Clear conversation'),
    ) as HTMLButtonElement;
    clear.click();
    resolve({ snapshotId: 1, text: 'Cancelled' });
    await settle(fixture);
    expect(fixture.nativeElement.querySelectorAll('.exchanges li')).toHaveLength(0);
    expect(fixture.componentInstance.code()).toBe('my own attempt');
    expect(review).toHaveBeenCalledTimes(1);
  });
});

describe('Scripted tutor disclosure and help choices', () => {
  it('offers free questions, progressive hints, language checklists and deliberate deeper help without evaluating source', async () => {
    const fixture = await setup();
    expect(fixture.nativeElement.textContent).toContain(
      'not live Codex or an analysis of arbitrary code',
    );
    ask(fixture, 'hint please', 'hint');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.response').textContent).toContain(
      'same input position',
    );
    ask(fixture, 'another hint', 'hint');
    await settle(fixture);
    expect(fixture.nativeElement.querySelectorAll('.response')[1].textContent).toContain(
      'earlier positions',
    );
    ask(fixture, 'Explain in depth', 'deeper');
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Requested worked explanation');
    expect(fixture.nativeElement.textContent).not.toContain('tests passed');
    expect(fixture.nativeElement.querySelector('pre code').textContent).toBe('my own attempt');
  });
});
