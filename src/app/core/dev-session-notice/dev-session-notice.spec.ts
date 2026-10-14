import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DevSessionNotice, parseDevStatus } from './dev-session-notice';
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
