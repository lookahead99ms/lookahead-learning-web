import { DOCUMENT } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MembershipApi } from '../../content/membership-api';

/** One test account the gate holder may use (Domain DevTestSessions.Usable). */
export interface UsableTestAccount {
  accountId: string;
  username: string;
  displayName: string;
  roles: string[];
  scenario: string | null;
}

interface Group { id: 'learners' | 'co-authors' | 'admins'; title: string; items: UsableTestAccount[] }

/**
 * DLV-969 S35: staff use DEV test accounts inside the open gate. After Sign out (not Exit DEV) the sign-in page lists
 * the test accounts this browser's gate holder may use; choosing one opens the platform as that account. The Gateway
 * answers an empty list for everyone else, and then nothing is shown.
 */
@Component({
  selector: 'app-test-account-picker',
  templateUrl: './test-account-picker.html',
  styleUrl: './test-account-picker.css',
})
export class TestAccountPicker implements OnInit {
  private readonly api = inject(MembershipApi);
  private readonly document = inject(DOCUMENT);
  readonly accounts = signal<UsableTestAccount[]>([]);
  readonly query = signal('');
  readonly starting = signal<string | null>(null);
  readonly error = signal('');
  readonly groups = computed<Group[]>(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = this.accounts().filter((account) => {
      const text = [account.displayName, account.username, account.scenario ?? '', ...account.roles].join(' ').toLowerCase();
      return words.every((word) => text.includes(word));
    });
    const groups: Group[] = [
      { id: 'learners', title: 'Learners', items: shown.filter((account) => !account.roles.length) },
      { id: 'co-authors', title: 'Co-authors', items: shown.filter((account) => account.roles.includes('co-author')) },
      { id: 'admins', title: 'Admins', items: shown.filter((account) => account.roles.includes('admin') && !account.roles.includes('co-author')) },
    ];
    return groups.filter((group) => group.items.length);
  });

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.api.request<UsableTestAccount[]>('/auth/test-accounts');
      this.accounts.set(Array.isArray(list) ? list : []);
    } catch {
      // Nothing to offer: the sign-in page stays as it is.
    }
  }

  async use(account: UsableTestAccount): Promise<void> {
    if (this.starting()) return;
    this.starting.set(account.accountId);
    this.error.set('');
    try {
      const started = await this.api.request<{ next?: string }>('/auth/test-session', { accountId: account.accountId });
      const next = typeof started?.next === 'string' && /^\/(?!\/)/.test(started.next) ? started.next : '/';
      this.document.defaultView?.location.assign(next);
    } catch (failure) {
      this.error.set(failure instanceof Error && failure.message ? failure.message : 'The test account could not be opened. Retry.');
      this.starting.set(null);
    }
  }
}
