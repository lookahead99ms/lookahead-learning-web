import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AdminPlansPage, PURCHASE_STEPS } from './admin-plans';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

describe('Plans and purchases (admin documentation, DLV-209)', () => {
  let root: HTMLElement;
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: StudyPlanAccount, useValue: { account: signal({ accountId: 'author', username: 'author', displayName: 'Author', topicGrants: [], authorPreview: true }) } },
      ],
    }).overrideComponent(AdminPlansPage, { remove: { imports: [PlatformHeader] }, add: { imports: [HeaderStub] } });
    const fixture = TestBed.createComponent(AdminPlansPage);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });
  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('says nothing is sold and lays out like the other admin pages', () => {
    const main = root.querySelector('main')!;
    expect([...main.children].map((child) => child.tagName.toLowerCase())).toEqual(['aside', 'div', 'app-author-admin-menu']);
    expect(text(root.querySelector('.status-note'))).toContain('No money is charged');
    expect([...root.querySelectorAll('.doc-section h2')].map(text)).toEqual([
      'How to review', 'How a learner buys', 'What a buyer sees in Manage account', 'Configured plans', 'Changing and renewing', 'Not built yet',
    ]);
  });

  it('walks through the purchase flow and says which steps exist', () => {
    const steps = [...root.querySelectorAll('.flow-step')];
    expect(steps).toHaveLength(PURCHASE_STEPS.length);
    expect(steps.map((step) => [text(step.querySelector('h3')), text(step.querySelector('.step-state'))])).toEqual([
      ['See the plans', 'Built'],
      ['Sign in, then choose a plan', 'Built'],
      ['Course Pass: pick 1–3 courses', 'Not built yet'],
      ['Confirm a local mock payment', 'Built'],
      ['The server records the purchase and opens the courses', 'Built'],
      ['See it in Manage account, with Renew and Upgrade', 'Built'],
      ['Reminder 7 to 10 days before access ends', 'Not built yet'],
    ]);
    expect([...root.querySelectorAll('.flow a')].map((link) => link.getAttribute('href'))).toEqual(['/pricing', '/pricing', '/account']);
  });

  it('previews a buyer’s Membership rows from labelled sample data', () => {
    const preview = root.querySelector('#buyer-preview')!;
    expect(text(preview)).toContain('Sample data, not a real account.');
    expect([...preview.querySelectorAll('.access-record h3')].map(text)).toEqual(['Advance', 'Interview Sprint', 'Course Pass']);
    expect(text(preview)).toContain('Expires 2 Mar 2027 · Manual renewal');
    expect(text(preview)).toContain('$129.99 (Student discount −$15.00)');
    expect(text(preview)).toContain('Expired 1 Jun 2026 · Manual renewal');
    expect(text(preview)).toContain('SQL (Learn), API Design (Grow)');
  });

  it('shows the configured catalog with manual renewal and nothing on sale', () => {
    const rows = [...root.querySelectorAll('#configured-plans tbody tr')].map((row) => [...row.children].map(text));
    expect(rows.map((row) => row[0])).toEqual(['Free', 'Learn', 'Grow', 'Advance', 'Complete', 'Course Pass', 'Interview Sprint', 'Monthly Promo', 'Annual Promo', 'Interview Pass Promo']);
    expect(rows[4]).toEqual(['Complete', 'Regular', '$279.99/year', 'Learn + Grow + Blaze', '1 year', 'Manual renewal', 'Not on sale: checkout not connected']);
    expect(rows[8]).toEqual(['Annual Promo', 'Promo', '$104.49/year', 'Learn + Grow + Blaze', '1 year', 'Manual renewal', 'Only during a sale; checkout not connected']);
    expect(rows.every((row) => !row.some((cell) => /automatic|lifetime/i.test(cell)))).toBe(true);
  });
});
