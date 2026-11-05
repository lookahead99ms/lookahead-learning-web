import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { githubDismissed } from '../../core/github-account/github-account';
import { AccountSettingsError } from '../account/account-settings-client';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { GithubAccessCard } from './github-access-card';

/** An in-memory Storage for this spec (the test environment has none); `blocked` makes every call throw. */
function memoryStorage(blocked = false): Storage {
  const data = new Map<string, string>();
  const guard = <T>(run: () => T): T => { if (blocked) throw new Error('blocked'); return run(); };
  return {
    get length() { return data.size; },
    clear: () => guard(() => data.clear()),
    getItem: (key: string) => guard(() => data.get(key) ?? null),
    key: (index: number) => guard(() => [...data.keys()][index] ?? null),
    removeItem: (key: string) => guard(() => { data.delete(key); }),
    setItem: (key: string, value: string) => guard(() => { data.set(key, String(value)); }),
  };
}
const saved = { local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
function useStorage(local: Storage, session: Storage = memoryStorage()): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
}
beforeEach(() => useStorage(memoryStorage()));
afterEach(() => {
  for (const [name, descriptor] of [['localStorage', saved.local], ['sessionStorage', saved.session]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

const links = { github: null, linkedin: 'https://linkedin.com/in/staff', x: null, website: 'https://staff.example' };

async function render(next: string | null = '/learn/java', update = vi.fn(async () => ({ displayName: 'S', username: 's' }))) {
  const loadProfile = vi.fn(async () => ({ displayName: 'S', username: 's', links }));
  TestBed.configureTestingModule({
    imports: [GithubAccessCard],
    providers: [provideRouter([]), { provide: StudyPlanAccount, useValue: { loadProfile, updateProfileLinks: update } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(GithubAccessCard);
  fixture.componentRef.setInput('accountId', 'staff-1');
  fixture.componentRef.setInput('next', next);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const type = async (value: string) => {
    const input = root.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const press = async (label: string) => {
    ([...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === label) as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, root, type, press, update, navigate, loadProfile };
}

describe('GithubAccessCard (DLV-969)', () => {
  it('explains why, with the field and Save before Not now', async () => {
    const { root } = await render();
    expect(root.querySelector('h2')?.textContent).toBe('Your GitHub account');
    expect(root.querySelector('.github-note')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      "Look Ahead's code, content and release workflows live in private GitHub repositories. If your role needs them, the owner adds your GitHub account to the repositories and workflows you work on. No GitHub account? Choose Not now. You can add it any time in Account settings, and the owner may ask for it later.",
    );
    expect(root.querySelector('label')?.textContent).toBe('GitHub username or profile address');
    expect([...root.querySelectorAll('.github-actions button')].map((button) => [button.textContent?.trim(), button.className])).toEqual([
      ['Save', 'action-button'],
      ['Not now', 'action-link'],
    ]);
  });

  it('saves the GitHub address and keeps the other three links as they were, then continues', async () => {
    const { root, type, press, update, navigate } = await render();
    await type('@octocat');
    await press('Save');
    expect(update).toHaveBeenCalledWith({ ...links, github: 'https://github.com/octocat' });
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Saved. The owner can now add you to the repositories and workflows you work on.');
    expect(navigate).toHaveBeenCalledWith('/learn/java');
  });

  it('checks the username first and sends nothing that GitHub would refuse', async () => {
    const { root, type, press, update } = await render();
    await type('octo--cat');
    await press('Save');
    expect(update).not.toHaveBeenCalled();
    expect(root.querySelector('.github-error')?.textContent).toContain('That isn’t a GitHub username.');
    expect(root.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the Domain refusal, an expired session or a failure in words, and stays on the card', async () => {
    for (const [failure, message] of [
      [new AccountSettingsError('invalid-link'), 'Use an https://github.com/… address for GitHub.'],
      [new AccountSettingsError('session-expired'), 'Your session expired. Sign in again, then add your GitHub account in Account settings.'],
      [new Error('down'), 'We couldn’t save it just now. Retry, or add it later in Account settings.'],
    ] as const) {
      TestBed.resetTestingModule();
      const { root, type, press, navigate } = await render('/learn', vi.fn(async () => { throw failure; }));
      await type('octocat');
      await press('Save');
      expect(root.querySelector('.github-error')?.textContent).toBe(message);
      expect(navigate).not.toHaveBeenCalled();
      expect(root.querySelector('button.action-button')?.hasAttribute('disabled')).toBe(false);
    }
  });

  it('starts from empty links when the profile has none', async () => {
    const { type, press, update, loadProfile } = await render();
    loadProfile.mockResolvedValue({ displayName: 'S', username: 's' } as never);
    await type('octocat');
    await press('Save');
    expect(update).toHaveBeenCalledWith({ github: 'https://github.com/octocat', linkedin: null, x: null, website: null });
  });

  it('Not now is remembered for this account and continues to the page they opened', async () => {
    const { root, press, update, navigate } = await render();
    await press('Not now');
    expect(githubDismissed('staff-1')).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/learn/java');
    expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe('No problem. You can add it any time in Account settings.');
    expect(root.querySelector('[role="status"] a')?.getAttribute('href')).toBe('/account');
  });

  it('never follows a next that leaves this site, and stays with the confirmation instead', async () => {
    for (const next of ['https://evil.example/', '//evil.example', '/\\evil.example', null]) {
      TestBed.resetTestingModule();
      const { root, press, navigate } = await render(next);
      await press('Not now');
      expect(navigate).not.toHaveBeenCalled();
      expect(root.querySelector('[role="status"]')).not.toBeNull();
    }
  });
});
