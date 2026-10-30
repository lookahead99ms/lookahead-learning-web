import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DevSessionNotice, DevSessionStatus, parseDevStatus } from './dev-session-notice';
describe('DEV session status', () => {
  it('requires the explicit DEV response and valid deadline', () => {
    expect(parseDevStatus({ dev: true, deadline: '2026-10-15T04:00:00Z', warning: true, maintenance: false })?.warning).toBe(true);
    for (const value of [null, {}, { dev: true, deadline: 'bad', warning: true, maintenance: false }, { dev: false, deadline: '', warning: false, maintenance: false }]) expect(parseDevStatus(value)).toBeNull();
  });
});

describe('DEV session notices', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  it('renders the Eastern cutoff and an actionable leave button', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }));
    const fixture = TestBed.createComponent(DevSessionNotice);
    fixture.componentInstance.status.set({dev:true,deadline:'2026-10-15T04:00:00Z',warning:true,maintenance:false});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('DEV shuts down at');
    expect(fixture.nativeElement.textContent).toContain('12:00 AM');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Leave DEV');
  });
  it('shows the protected maintenance hold instead of promising immediate shutdown', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }));
    const fixture = TestBed.createComponent(DevSessionNotice);
    fixture.componentInstance.status.set({dev:true,deadline:'2026-10-15T04:00:00Z',warning:true,maintenance:true});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Maintenance is in progress');
    expect(fixture.nativeElement.textContent).not.toContain('DEV shuts down at');
  });
  it('does not submit leave without a valid CSRF response', async () => {
    const fetchMock=vi.fn().mockResolvedValue({status:404,ok:false});vi.stubGlobal('fetch',fetchMock);
    const fixture=TestBed.createComponent(DevSessionNotice);
    await fixture.componentInstance.leave();
    expect(fixture.componentInstance.error()).toContain('Unable to confirm sign-out');
    expect(fixture.componentInstance.leaving()).toBe(false);
    expect(fetchMock.mock.calls.some(call => call[0] === '/dev/leave')).toBe(false);
  });
});

// DLV-914: Gateway's /dev/session contract (October 30, 2026): 200 JSON status when admitted, 401 DEV_ADMISSION_REQUIRED
// when not admitted or expired, 503 DEV_STATUS_UNAVAILABLE / DEV_ADMISSION_UNAVAILABLE on outages, 404 outside DEV.
describe('DEV session polling contract', () => {
  const admitted: DevSessionStatus = { dev: true, deadline: '2026-10-15T04:00:00Z', warning: false, maintenance: false };
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  // Angular schedules its own timers; count only the component's 30-second poll timer.
  function notice() {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(DevSessionNotice);
    const component = fixture.componentInstance;
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    const cleared = vi.spyOn(globalThis, 'clearTimeout');
    const polls = () => scheduled.mock.calls.filter(call => call[1] === 30000).length;
    return { fixture, component, polls, cleared, poll: () => (component as unknown as { poll(): Promise<void> }).poll() };
  }
  it('applies an admitted 200 status and schedules the next poll', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => admitted });
    vi.stubGlobal('fetch', fetchMock);
    const { fixture, component, poll, polls, cleared } = notice();
    await poll();
    expect(fetchMock).toHaveBeenCalledWith('/dev/session', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
    expect(component.status()).toEqual(admitted);
    expect(polls()).toBe(1);
    fixture.destroy();
    expect(cleared).toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps the last status on 401 DEV_ADMISSION_REQUIRED and 503 outages without parsing the error body', async () => {
    for (const status of [401, 503]) {
      const json = vi.fn();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, ok: false, json }));
      const { fixture, component, poll, polls } = notice();
      component.status.set(admitted);
      await poll();
      expect(component.status()).toEqual(admitted);
      expect(json).not.toHaveBeenCalled();
      expect(polls()).toBe(1);
      fixture.destroy();
    }
  });
  it('stops polling on 404 because ordinary delivery has no DEV control', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false }));
    const { fixture, component, poll, polls } = notice();
    await poll();
    expect(component.status()).toBeNull();
    expect(polls()).toBe(0);
    fixture.destroy();
  });
  it('ignores a malformed 200 body and a failed request without changing the deadline', async () => {
    const { fixture, component, poll } = notice();
    component.status.set(admitted);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ dev: true }) }));
    await poll();
    expect(component.status()).toBeNull();
    component.status.set(admitted);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await poll();
    expect(component.status()).toEqual(admitted);
    fixture.destroy();
  });
  it('refuses a Leave DEV logout destination that is not the Cognito managed logout', async () => {
    for (const logoutUrl of ['https://evil.example/logout', 'https://lookahead.auth.us-east-2.amazoncognito.com/oauth2/authorize', 'http://lookahead.auth.us-east-2.amazoncognito.com/logout']) {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/dev/csrf') return { ok: true, json: async () => ({ headerName: 'X-CSRF-TOKEN', token: 'synthetic' }) };
        if (url === '/dev/leave') { expect(init?.method).toBe('POST'); expect((init?.headers as Record<string, string>)['X-CSRF-TOKEN']).toBe('synthetic'); return { ok: true, json: async () => ({ logoutUrl }) }; }
        throw new Error('unexpected ' + url);
      });
      vi.stubGlobal('fetch', fetchMock);
      const { fixture, component } = notice();
      await component.leave();
      expect(component.error()).toContain('Unable to confirm sign-out');
      expect(component.leaving()).toBe(false);
      fixture.destroy();
    }
  });
});
