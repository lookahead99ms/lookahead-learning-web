import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { AuthorDocHero } from '../../core/author-workspace-nav/author-doc-hero';
import {
  AuthorOutlineItem,
  AuthorWorkspaceNav,
} from '../../core/author-workspace-nav/author-workspace-nav';
import { planCatalogRows } from '../../content/membership-plans';
import { PLAN_RULES } from '../pricing/pricing-plans';
import { AccountAccessRecords } from '../account/account-access-records';
import { AccessRecord, accessRecordView } from '../account/account-membership';

export interface PurchaseStep {
  title: string;
  detail: string;
  built: boolean;
  /** Where to see it, when it exists. */
  link?: { label: string; href: string };
}

/** DLV-209: how a learner buys today, step by step, with what is and is not built. */
export const PURCHASE_STEPS: readonly PurchaseStep[] = [
  {
    title: 'See the plans',
    detail:
      'Everyone can see prices: the plans section on the home page (before the Essence), “What you’re missing” on Start free, “See pricing” (opens the home page plans) or “See plans” on a locked lesson, and “Choose a plan” in Manage account. The header has no pricing link.',
    built: true,
    link: { label: 'Open Pricing', href: '/pricing' },
  },
  {
    title: 'Sign in, then choose a plan',
    detail:
      'Buying needs an account: a signed-out visitor’s “Choose …” asks them to sign in or create an account, then brings them back. Offers with undecided terms have no button.',
    built: true,
    link: { label: 'See the Choose buttons', href: '/pricing' },
  },
  {
    title: 'Course Pass: pick 1–3 courses',
    detail: 'Not designed yet: the Course Pass length is still undecided, so there is no course picker.',
    built: false,
  },
  {
    title: 'Pay at checkout (Stripe)',
    detail:
      'Not connected. Today every Choose button opens “Payment connection in progress”, and nothing is charged.',
    built: false,
  },
  {
    title: 'The server records the purchase and opens the courses',
    detail:
      'Not built. The server has no plans or purchases yet; it grants access only through course grants set on People and access.',
    built: false,
  },
  {
    title: 'See it in Manage account, with Renew and Upgrade',
    detail:
      'Built in the web app: each purchase shows what it includes, price paid, discount, dates and “Expires … · Manual renewal”. It appears once the server sends purchase records; the preview below uses sample data.',
    built: true,
    link: { label: 'Open Manage account', href: '/account' },
  },
  {
    title: 'Reminder 7 to 10 days before access ends',
    detail: 'Not built. Schedule and channel are not decided (DLV-717).',
    built: false,
  },
];

const SAMPLE_RECORDS: readonly AccessRecord[] = [
  {
    id: 'sample-advance',
    planId: 'advance',
    courses: [],
    startsAt: '2026-03-02T00:00:00Z',
    endsAt: '2027-03-02T00:00:00Z',
    status: 'active',
    pricePaidCents: 12999,
    discount: { label: 'Student discount', amountCents: 1500 },
  },
  {
    id: 'sample-sprint',
    planId: 'interview-sprint',
    courses: [],
    startsAt: '2026-09-01T00:00:00Z',
    endsAt: '2026-12-10T00:00:00Z',
    status: 'active',
    pricePaidCents: 9999,
    discount: null,
  },
  {
    id: 'sample-course-pass',
    planId: 'course-pass',
    courses: [
      { id: 'learn:sql', title: 'SQL' },
      { id: 'grow:api-design', title: 'API Design' },
    ],
    startsAt: '2025-06-01T00:00:00Z',
    endsAt: '2026-06-01T00:00:00Z',
    status: 'expired',
    pricePaidCents: 5598,
    discount: null,
  },
];

/**
 * DLV-209 admin documentation: the plan catalog, where a learner buys, and a sample of what a
 * buyer sees. Staff can open it (authors and admins); it changes nothing and loads no data.
 */
@Component({
  selector: 'app-admin-plans',
  imports: [
    PlatformHeader,
    RouterLink,
    AuthorAdminMenu,
    AuthorDocHero,
    AuthorWorkspaceNav,
    AccountAccessRecords,
  ],
  templateUrl: './admin-plans.html',
  styleUrl: './admin-plans.css',
})
export class AdminPlansPage {
  protected readonly steps = PURCHASE_STEPS;
  protected readonly rows = planCatalogRows();
  protected readonly rules = PLAN_RULES;
  protected readonly sampleRecords = SAMPLE_RECORDS.map((record) => accessRecordView(record)!);
  protected readonly outline: readonly AuthorOutlineItem[] = [
    { label: 'How to review', href: '#how-to-review' },
    { label: 'How a learner buys', href: '#purchase-flow' },
    { label: 'What a buyer sees', href: '#buyer-preview' },
    { label: 'Configured plans', href: '#configured-plans' },
    { label: 'Changing and renewing', href: '#plan-rules' },
    { label: 'Not built yet', href: '#not-built' },
  ];
}
