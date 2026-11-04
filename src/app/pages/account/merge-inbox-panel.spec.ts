import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountMergeClient, MergeRequestResult } from './account-merge-client';
import { MERGE_EMAIL_COOLDOWN, MergeInboxPanel } from './merge-inbox-panel';

function mount(inputs: Record<string, unknown>, result: () => Promise<MergeRequestResult> = async () => ({ kind: 'sent' })) {
  const client = { requestMergeEmail: vi.fn(result) };
  TestBed.configureTestingModule({
    imports: [MergeInboxPanel],
    providers: [{ provide: AccountMergeClient, useValue: client }],
  });
  const fixture = TestBed.createComponent(MergeInboxPanel);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const button = () => element.querySelector('.merge-resend') as HTMLButtonElement;
  const text = () => element.textContent!.replace(/\s+/g, ' ').trim();
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };
  return { fixture, element, client, button, text, settle };
}

describe('MergeInboxPanel', () => {
  afterEach(() => vi.useRealTimers());

  it('sends once on open, shows the masked email and waits 60 s before sending again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const view = mount({ email: 'priya@gmail.com' });
    await view.settle();
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
    expect(view.element.querySelector('h2')!.textContent).toBe('Check your inbox');
    expect(view.text()).toContain("Check your inbox to confirm it's you. We sent an email to p•••a@gmail.com.");
    expect(view.button().textContent!.trim()).toBe('Send the email again');
    expect(view.button().disabled).toBe(true);
    expect(view.text()).toContain('You can send it again in 60 s.');

    vi.advanceTimersByTime(1000);
    view.fixture.detectChanges();
    expect(view.text()).toContain('You can send it again in 59 s.');
    vi.advanceTimersByTime((MERGE_EMAIL_COOLDOWN - 2) * 1000);
    view.fixture.detectChanges();
    expect(view.button().disabled).toBe(true);
    expect(view.text()).toContain('in 1 s.');
    vi.advanceTimersByTime(1000);
    view.fixture.detectChanges();
    expect(view.button().disabled).toBe(false);
    expect(view.text()).not.toContain('You can send it again');

    view.button().click();
    await view.settle();
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(2);
    expect(view.button().disabled).toBe(true);
    expect(view.text()).toContain('in 60 s.');
    view.fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('only starts the wait when the email was already sent, and words an unknown address plainly', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const view = mount({ alreadySent: true, titled: false });
    await view.settle();
    expect(view.client.requestMergeEmail).not.toHaveBeenCalled();
    expect(view.element.querySelector('h2')).toBeNull();
    expect(view.text()).toContain('We sent an email to the address you signed in with.');
    expect(view.button().disabled).toBe(true);
    expect(view.element.querySelector('.merge-continue')).toBeNull();
  });

  it('shows the same text whatever the Domain did, and a plain error only when the request failed', async () => {
    let result: MergeRequestResult = { kind: 'unavailable' };
    const view = mount({ email: 'priya@gmail.com', next: '/learn' }, async () => result);
    await view.settle();
    expect(view.element.querySelector('[role="alert"]')!.textContent!.trim()).toBe(
      "We couldn't send the email right now. Try again in a minute.",
    );
    expect(view.button().disabled).toBe(false);
    result = { kind: 'signed-out' };
    view.button().click();
    await view.settle();
    expect(view.element.querySelector('[role="alert"]')!.textContent).toContain('Your sign-in has ended.');
    result = { kind: 'sent' };
    view.button().click();
    await view.settle();
    expect(view.element.querySelector('[role="alert"]')).toBeNull();
    expect(view.text()).toContain("Check your inbox to confirm it's you. We sent an email to p•••a@gmail.com.");
    view.fixture.destroy();
  });

  it('lets the person continue to where the sign-in was going', async () => {
    const view = mount({ email: 'priya@gmail.com', next: '/dev/access?access=pending' });
    await view.settle();
    const link = view.element.querySelector('.step-links a.merge-continue') as HTMLAnchorElement;
    expect(link.textContent!.trim()).toBe('Continue for now');
    expect(link.getAttribute('href')).toBe('/dev/access?access=pending');
    view.fixture.destroy();
  });

  it('reports each accepted send, and does nothing once it is gone', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let answer!: (result: MergeRequestResult) => void;
    const view = mount({ email: 'priya@gmail.com' }, () => new Promise<MergeRequestResult>((resolve) => (answer = resolve)));
    const sent = vi.fn();
    view.fixture.componentInstance.sent.subscribe(sent);
    expect(view.client.requestMergeEmail).toHaveBeenCalledTimes(1);
    view.fixture.destroy();
    answer({ kind: 'sent' });
    await view.settle().catch(() => undefined);
    expect(sent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('emits sent after an accepted request', async () => {
    const view = mount({ email: 'priya@gmail.com', alreadySent: false });
    const sent = vi.fn();
    view.fixture.componentInstance.sent.subscribe(sent);
    await view.settle();
    expect(sent).toHaveBeenCalledTimes(1);
    view.fixture.destroy();
  });
});
