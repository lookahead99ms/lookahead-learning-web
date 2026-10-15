import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformBrand } from '../../core/platform-brand/platform-brand';
import { PlatformThemeService } from '../../core/platform-theme';
import { CATALOG_NAMES, PLANS, formatUsd } from '../../content/membership-plans';

/**
 * Staff-only design review (user, 2026-10-15): three header designs that point people to paid
 * plans, each drawn as static pictures in three states. Nothing here is the live header and
 * nothing in a mock can be clicked; the real header lives in core/platform-header.
 */

export type MockStateId = 'free' | 'sale' | 'paid';

/** One segment of Option A's grouped pair. */
export interface MockSegment {
  label: string;
  /** Shorter wording on the phone mock, when the full label would not fit. */
  phoneLabel?: string;
  tone: 'plain' | 'accent';
}

export interface MockMenuItem {
  icon: string;
  label: string;
  detail: string;
  accent?: boolean;
}

/** What a static header picture shows. Every field is drawn, never wired to anything. */
export interface MockHeader {
  /** Plain "Study Plan" link in the utilities. */
  studyPlan?: boolean;
  /** Option A: one bordered group of segments. */
  group?: readonly MockSegment[];
  /** Small text next to the account area (Option B during a sale). */
  greeting?: string;
  account: { kind: 'sign-in' } | { kind: 'sign-in-sign-up' } | { kind: 'chip'; dot?: boolean };
  /** An open account menu, drawn under the chip. */
  menu?: readonly MockMenuItem[];
  /** Option C: slim strip under the header. */
  strip?: { text: string; action: string };
}

export interface MockState {
  state: MockStateId;
  label: string;
  /** Plain-text description of the picture, read by screen readers and shown as the caption. */
  summary: string;
  header: MockHeader;
}

export interface HeaderOption {
  id: 'a' | 'b' | 'c';
  letter: string;
  name: string;
  idea: string;
  pros: readonly string[];
  cons: readonly string[];
  states: readonly MockState[];
}

const yearly = PLANS.filter((plan) => plan.group === 'regular' && plan.priceBasis === 'per-year');
/** "$69.99": the cheapest yearly plan, read from the shared catalog so the mock cannot drift. */
export const STARTING_PRICE = formatUsd(Math.min(...yearly.map((plan) => plan.priceCents)));
const catalogs = Object.values(CATALOG_NAMES);
const catalogList = `${catalogs.slice(0, -1).join(', ')} and ${catalogs.at(-1)}`;

/** An example only: each sale sets its own name and emoji, and shows only while it runs. */
export const SAMPLE_SALE = { emoji: '🎄', name: 'Holiday sale' } as const;
const saleGreeting = `${SAMPLE_SALE.emoji} ${SAMPLE_SALE.name}`;

const STUDY_PLAN: MockSegment = { label: 'Study Plan', tone: 'plain' };
const STANDARD_MENU: readonly MockMenuItem[] = [
  { icon: '📅', label: 'View study plan', detail: 'Schedule and progress' },
  { icon: '👤', label: 'Manage account', detail: 'Profile, sign-in and access' },
  { icon: '💬', label: 'Support and feedback', detail: 'Report a problem or share an idea' },
];

export const HEADER_OPTIONS: readonly HeaderOption[] = [
  {
    id: 'a',
    letter: 'A',
    name: 'Grouped pair',
    idea: 'Study Plan and the plans link sit together in one bordered group on the right, so they read as one place for “what I study and what I can open”.',
    pros: [
      'The two links are clustered, not scattered across the header.',
      '“Unlock all” says what you get rather than naming a price page.',
      'One spot changes with the visitor: Unlock all, the sale, or My plan.',
    ],
    cons: [
      'The right side gets one more control next to the theme switch.',
      'On phones the sale greeting is shortened to “Sale” to fit.',
    ],
    states: [
      {
        state: 'free',
        label: 'Free or signed out',
        summary: 'One group reads Study Plan, then Unlock all. Sign in sits on the far right.',
        header: {
          group: [STUDY_PLAN, { label: 'Unlock all', tone: 'accent' }],
          account: { kind: 'sign-in' },
        },
      },
      {
        state: 'sale',
        label: 'During a sale',
        summary: `The second half of the group becomes the sale greeting, ${SAMPLE_SALE.name}.`,
        header: {
          group: [
            STUDY_PLAN,
            { label: saleGreeting, phoneLabel: `${SAMPLE_SALE.emoji} Sale`, tone: 'accent' },
          ],
          account: { kind: 'chip' },
        },
      },
      {
        state: 'paid',
        label: 'Paid member',
        summary: 'The group reads Study Plan, then My plan. Nothing asks them to buy.',
        header: {
          group: [STUDY_PLAN, { label: 'My plan', tone: 'plain' }],
          account: { kind: 'chip' },
        },
      },
    ],
  },
  {
    id: 'b',
    letter: 'B',
    name: 'Account-led',
    idea: 'The header keeps only Study Plan. Plans live in the account area: a small dot on the account button and “Unlock all” as the first item in its menu.',
    pros: [
      'The calmest header: nothing new except a small dot.',
      'The price shows where people already manage their account.',
      '“Sign up free” gives signed-out visitors a clear first step.',
    ],
    cons: [
      'Easy to miss: people must open the menu to find plans.',
      'A dot alone does not say what it means.',
    ],
    states: [
      {
        state: 'free',
        label: 'Signed out',
        summary: 'Study Plan only. On the right, Sign in next to a Sign up free button.',
        header: { studyPlan: true, account: { kind: 'sign-in-sign-up' } },
      },
      {
        state: 'free',
        label: 'Signed in, free, menu open',
        summary: `The account button has a small dot. Its menu starts with Unlock all, from ${STARTING_PRICE}/year.`,
        header: {
          studyPlan: true,
          account: { kind: 'chip', dot: true },
          menu: [
            {
              icon: '🔓',
              label: 'Unlock all',
              detail: `From ${STARTING_PRICE}/year`,
              accent: true,
            },
            ...STANDARD_MENU,
          ],
        },
      },
      {
        state: 'sale',
        label: 'During a sale',
        summary: `A small greeting, ${SAMPLE_SALE.name}, sits just before the account button, which keeps its dot.`,
        header: { studyPlan: true, greeting: saleGreeting, account: { kind: 'chip', dot: true } },
      },
      {
        state: 'paid',
        label: 'Paid member, menu open',
        summary: 'No dot. The menu starts with My plan, which shows the plan and when it ends.',
        header: {
          studyPlan: true,
          account: { kind: 'chip' },
          menu: [
            { icon: '🎓', label: 'My plan', detail: 'Complete, until 15 Oct 2027' },
            ...STANDARD_MENU,
          ],
        },
      },
    ],
  },
  {
    id: 'c',
    letter: 'C',
    name: 'Slim strip',
    idea: 'The header stays as it is, with Study Plan only. A thin strip just under it names what plans open and the starting price, and anyone can close it.',
    pros: [
      'The header itself does not change at all.',
      'A full sentence with the starting price explains itself.',
      'Paid members never see it, and anyone can close it.',
    ],
    cons: [
      'Takes a thin row on every page until it is closed.',
      'Strips are easy to stop noticing after a few visits.',
      'Closing it has to be remembered, per browser or per account.',
    ],
    states: [
      {
        state: 'free',
        label: 'Free or signed out',
        summary: `A strip under the header reads: Unlock ${catalogList} from ${STARTING_PRICE}/year, See plans, with a close button.`,
        header: {
          studyPlan: true,
          account: { kind: 'sign-in' },
          strip: { text: `Unlock ${catalogList} from ${STARTING_PRICE}/year`, action: 'See plans' },
        },
      },
      {
        state: 'sale',
        label: 'During a sale',
        summary: `The strip shows the greeting, ${SAMPLE_SALE.name}, and See sale prices.`,
        header: {
          studyPlan: true,
          account: { kind: 'chip' },
          strip: { text: saleGreeting, action: 'See sale prices' },
        },
      },
      {
        state: 'paid',
        label: 'Paid member',
        summary: 'No strip. The header is exactly today’s, with Study Plan only.',
        header: { studyPlan: true, account: { kind: 'chip' } },
      },
    ],
  },
];

@Component({
  selector: 'app-header-plans-preview',
  imports: [PlatformHeader, PlatformBrand, NgTemplateOutlet],
  templateUrl: './header-plans-preview.html',
  styleUrl: './header-plans-preview.css',
})
export class HeaderPlansPreview {
  protected readonly theme = inject(PlatformThemeService);
  protected readonly options = HEADER_OPTIONS;
  protected readonly startingPrice = STARTING_PRICE;
  protected readonly sale = SAMPLE_SALE;
  protected readonly plans = yearly.map((plan) => `${plan.name} ${formatUsd(plan.priceCents)}`);
}
