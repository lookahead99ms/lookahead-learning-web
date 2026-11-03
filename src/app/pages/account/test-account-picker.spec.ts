import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MembershipApi } from '../../content/membership-api';
import { TestAccountPicker, UsableTestAccount } from './test-account-picker';

const learner = (n: number, scenario: string | null = 'Free · no study plan'): UsableTestAccount => ({
  accountId: `id-learner${n}`, username: `learner${String(n).padStart(2, '0')}@lookahead.dev`, displayName: `Learner${String(n).padStart(2, '0')}`, roles: [], scenario,
});
const staff = (name: string, role: string): UsableTestAccount => ({
  accountId: `id-${name}`, username: `${name}@lookahead.dev`, displayName: name, roles: [role], scenario: null,
});

/** DLV-969 S35: the sign-in page's test accounts inside the open DEV gate. */
describe('TestAccountPicker', () => {
  let request: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    request = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: MembershipApi, useValue: { request } }] });
  });

  async function render(list: unknown) {
    request.mockResolvedValueOnce(list);
    const fixture = TestBed.createComponent(TestAccountPicker);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows nothing to anyone the Gateway lists no test accounts for, or when the list cannot load', async () => {
    expect((await render([])).root.querySelector('section')).toBeNull();
    expect(request).toHaveBeenCalledWith('/auth/test-accounts');
    request.mockRejectedValueOnce(new Error('down'));
    const fixture = TestBed.createComponent(TestAccountPicker);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    expect((await render({ not: 'a list' })).root.querySelector('section')).toBeNull();
  });

  it('groups learners, co-authors and admins, opens learners, and filters by name, role or scenario', async () => {
    const list = [...Array.from({ length: 9 }, (_, i) => learner(i + 1)), learner(10, 'Learn · ending soon · custom plan'), staff('coauthor01', 'co-author'), staff('admin01', 'admin')];
    list.push({ ...learner(11, null) });
    const { fixture, root } = await render(list);
    expect(root.querySelector('h2')?.textContent).toBe('Use a test account');
    const groups = [...root.querySelectorAll<HTMLDetailsElement>('details.group')];
    expect(groups.map((group) => group.querySelector('summary')?.textContent)).toEqual(['Learners', 'Co-authors', 'Admins']);
    expect(groups.map((group) => group.open)).toEqual([true, false, false]);
    expect(groups[1].querySelector('.scenario')?.textContent).toBe('Full curriculum');
    expect(root.querySelector('button[aria-busy] .username, .account .username')?.textContent).toBe('learner01@lookahead.dev');
    expect([...root.querySelectorAll('.scenario')].some((item) => item.textContent === 'Created test account')).toBe(true);
    const find = root.querySelector<HTMLInputElement>('.find input')!;
    find.value = 'ending soon';
    find.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect([...root.querySelectorAll('.account .name')].map((name) => name.textContent)).toEqual(['Learner10']);
    expect(root.querySelector<HTMLDetailsElement>('details.group')!.open).toBe(true);
    find.value = 'admin';
    find.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect([...root.querySelectorAll('summary')].map((summary) => summary.textContent)).toEqual(['Admins']);
    find.value = 'nobody here';
    find.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.textContent).toContain('No test account matches.');
  });

  it('keeps a short list without the find box', async () => {
    const { root } = await render([learner(1), staff('admin01', 'admin')]);
    expect(root.querySelector('.find')).toBeNull();
    expect(root.querySelectorAll('.account').length).toBe(2);
  });

  describe('using an account', () => {
    let assign: ReturnType<typeof vi.fn>;
    let picker: TestAccountPicker;
    beforeEach(() => {
      assign = vi.fn();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: MembershipApi, useValue: { request } }, { provide: DOCUMENT, useValue: { defaultView: { location: { assign } } } }],
      });
      picker = TestBed.runInInjectionContext(() => new TestAccountPicker());
    });

    it('starts the test session and loads the platform, only ever on this site', async () => {
      request.mockResolvedValueOnce({ next: '/' });
      await picker.use(learner(7));
      expect(request).toHaveBeenCalledWith('/auth/test-session', { accountId: 'id-learner7' });
      expect(assign).toHaveBeenCalledWith('/');
      for (const next of ['//evil.example', 'https://evil.example', undefined]) {
        request.mockResolvedValueOnce({ next });
        picker.starting.set(null);
        await picker.use(learner(7));
        expect(assign).toHaveBeenLastCalledWith('/');
      }
      request.mockResolvedValueOnce({ next: '/study-plan' });
      picker.starting.set(null);
      await picker.use(learner(7));
      expect(assign).toHaveBeenLastCalledWith('/study-plan');
    });

    it('starts one at a time and says why a start failed', async () => {
      picker.starting.set('id-other');
      await picker.use(learner(7));
      expect(request).not.toHaveBeenCalled();
      picker.starting.set(null);
      request.mockRejectedValueOnce(new Error('Your role cannot use this test account.'));
      await picker.use(staff('coauthor01', 'co-author'));
      expect(picker.error()).toBe('Your role cannot use this test account.');
      expect(picker.starting()).toBeNull();
      request.mockRejectedValueOnce('not an error');
      await picker.use(learner(7));
      expect(picker.error()).toBe('The test account could not be opened. Retry.');
      expect(assign).not.toHaveBeenCalled();
    });
  });
});
