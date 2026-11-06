import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountSettingsError } from '../../pages/account/account-settings-client';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { GithubAccessCard } from './github-access-card';

const links = { github: null, linkedin: 'https://linkedin.com/in/staff', x: null, website: 'https://staff.example' };

async function render(update = vi.fn(async () => ({ displayName: 'S', username: 's' }))) {
  const loadProfile = vi.fn(async () => ({ displayName: 'S', username: 's', links }));
  TestBed.configureTestingModule({
    imports: [GithubAccessCard],
    providers: [provideRouter([]), { provide: StudyPlanAccount, useValue: { loadProfile, updateProfileLinks: update } }],
  });
  const fixture = TestBed.createComponent(GithubAccessCard);
  fixture.componentRef.setInput('accountId', 'staff-1');
  const finished = vi.fn();
  fixture.componentInstance.finished.subscribe(finished);
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
  return { fixture, root, type, press, update, finished, loadProfile };
}

describe('GithubAccessCard (DLV-969)', () => {
  it('explains why, with the field and Save before Not now', async () => {
    const { root } = await render();
    expect(root.querySelector('h2')?.textContent).toBe('Your GitHub account');
    expect(root.querySelector('.github-note')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'If your role needs our private repositories, the owner adds your GitHub account to them. You can also add it later in Account settings.',
    );
    expect(root.querySelector('label')?.textContent).toBe('GitHub username or profile address');
    expect([...root.querySelectorAll('.github-actions button')].map((button) => [button.textContent?.trim(), button.className])).toEqual([
      ['Save', 'action-button'],
      ['Not now', 'action-link'],
    ]);
  });

  it('saves the GitHub address and keeps the other three links as they were, then reports saved', async () => {
    const { root, type, press, update, finished } = await render();
    await type('@octocat');
    await press('Save');
    expect(update).toHaveBeenCalledWith({ ...links, github: 'https://github.com/octocat' });
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Saved. The owner can now add you to the repositories and workflows you work on.');
    expect(finished).toHaveBeenCalledWith('saved');
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
      const { root, type, press, finished } = await render(vi.fn(async () => { throw failure; }));
      await type('octocat');
      await press('Save');
      expect(root.querySelector('.github-error')?.textContent).toBe(message);
      expect(finished).not.toHaveBeenCalled();
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

  it('Not now reports later and shows where to add it, without saving anything', async () => {
    const { root, press, update, finished } = await render();
    await press('Not now');
    expect(update).not.toHaveBeenCalled();
    expect(finished).toHaveBeenCalledWith('later');
    expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe('No problem. You can add it any time in Account settings.');
    expect(root.querySelector('[role="status"] a')?.getAttribute('href')).toBe('/account');
  });
});
