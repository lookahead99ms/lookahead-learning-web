import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { DsaApproachFamily, DsaApproachSibling } from '../../content/content.models';

/** Where the family is shown; each place asks for a different amount of detail. */
export type OptimalApproachesVariant = 'label' | 'block' | 'finish';

export interface OptimalApproachLink {
  problemId: string;
  approach: number;
  title: string;
  pattern: string;
  time: string;
  space: string;
  whenToPrefer: string;
  /** Approach 1: the best approach for the problem's own pattern. */
  best: boolean;
  route: string[];
}

/** The siblings as links, Approach 1 first, then by approach number. */
export function optimalApproachLinks(family: DsaApproachFamily | null | undefined): OptimalApproachLink[] {
  if (!family?.siblings?.length) return [];
  return [...family.siblings]
    .sort((left, right) => left.approach - right.approach)
    .map((sibling: DsaApproachSibling) => ({
      problemId: sibling.problemId,
      approach: sibling.approach,
      title: sibling.title,
      pattern: sibling.pattern,
      time: sibling.complexity.time,
      space: sibling.complexity.space,
      whenToPrefer: sibling.whenToPrefer,
      best: sibling.approach === 1 || sibling.problemId === family.bestProblemId,
      route: ['/', sibling.path, sibling.courseId, sibling.questionId],
    }));
}

/**
 * DLV-965 (user decision 2026-10-16): a problem whose contract has several equally optimal
 * approaches is published once per approach, and the pages link the family both ways. One
 * component renders all three places, so no problem has its own variant:
 *
 * - `label`: a switch like the header's Light / Dark one, beside "Show solution" in the problem
 *   workspace: this page filled, each other approach an outlined segment linking to it. No spoilers
 *   (user, 2026-10-16): it is on screen before the learner tries, so its text, titles and
 *   accessible names never name a pattern or a method: "Approach 1", "Approach 2 of 2, this page".
 * - `block`: "Other optimal approaches" under the approach rationale (after the learner has opened
 *   the approach or the solution, never before they try): title, pattern, the shared bounds, one
 *   line on when to prefer it. Approach 1 is marked as the best for its pattern. Its heading takes
 *   focus when the workspace's "Other optimal solutions" control jumps to it.
 * - `finish`: one line in Finish and review. With `named` (the learner revealed the pattern or
 *   solved the problem) "Also solvable optimally with <pattern>: <title>"; otherwise "Another optimal
 *   approach: <title>", so Finish and review never names a pattern the learner has not seen.
 *
 * Links are prose links (AGENTS "Interaction Visual Semantics"): styled, no pills, no arrows.
 */
@Component({
  selector: 'app-optimal-approaches',
  imports: [RouterLink],
  template: `
    @if (links().length) {
      @switch (variant()) {
        @case ('label') {
          <nav class="approach-switch" aria-label="Optimal approaches">
            @for (segment of segments(); track segment.approach) {
              @if (segment.current) {
                <span class="segment" aria-current="page" [attr.aria-label]="'Approach ' + segment.approach + ' of ' + total() + ', this page'"
                  >Approach {{ segment.approach }}</span
                >
              } @else {
                <a class="segment" [routerLink]="segment.route" [queryParams]="planContext()">Approach {{ segment.approach }}</a>
              }
            }
          </nav>
        }
        @case ('finish') {
          <ul class="also-optimal" aria-label="Other optimal approaches">
            @for (link of links(); track link.problemId) {
              <li>
                @if (named()) {
                  Also solvable optimally with {{ link.pattern }}:
                } @else {
                  Another optimal approach:
                }
                <a [routerLink]="link.route">{{ link.title }}</a>
              </li>
            }
          </ul>
        }
        @default {
          <section class="other-approaches" [attr.aria-labelledby]="headingId()">
            <h4 class="other-approaches-heading" [id]="headingId()" tabindex="-1">Other optimal approaches</h4>
            <p class="same-bounds">
              Same bounds as this one: time {{ links()[0].time }}, extra space {{ links()[0].space }}.
              The pattern you reach for decides which to carry.
            </p>
            <ul>
              @for (link of links(); track link.problemId) {
                <li>
                  <p class="approach-line">
                    <a [routerLink]="link.route">{{ link.title }}</a>
                    <span class="approach-pattern"
                      >{{ link.pattern }}@if (link.best) {, best for this pattern}</span
                    >
                  </p>
                  <p class="approach-when">{{ link.whenToPrefer }}</p>
                </li>
              }
            </ul>
          </section>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    :host:empty {
      display: none;
    }
    a {
      color: var(--accent-link, var(--accent-strong));
      text-decoration: underline;
      text-decoration-color: var(--link-underline, currentColor);
      text-underline-offset: 0.14em;
      border-radius: 4px;
    }
    a:hover {
      text-decoration-thickness: 2px;
    }
    a:focus-visible {
      outline: 3px solid var(--accent-focus, var(--accent-strong));
      outline-offset: 2px;
    }
    /* The header's Light / Dark switch, at the size it had beside "Help me recognize the pattern"
       (user, 2026-10-16), now beside "Show solution": this page's approach is the filled segment, the
       others are outlined in the same accent, so it never reads as if this page were Approach 1. */
    .approach-switch {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 3px;
      padding: 3px;
      border: 1px solid var(--accent-strong);
      border-radius: 10px;
      background: var(--surface);
    }
    .approach-switch .segment {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 6px 14px;
      border-radius: 7px;
      color: var(--accent-strong);
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.2;
      text-decoration: none;
      white-space: nowrap;
    }
    .approach-switch a.segment:hover {
      background: color-mix(in srgb, var(--accent-strong) 12%, var(--surface));
    }
    .approach-switch .segment[aria-current='page'] {
      color: var(--accent-on-primary);
      background: var(--accent-strong);
    }
    @media (pointer: coarse) {
      .approach-switch .segment {
        min-height: 40px;
        min-width: 44px;
      }
    }
    .also-optimal {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 4px;
      font-size: 0.92rem;
      line-height: 1.5;
      color: var(--text-subtle);
      overflow-wrap: anywhere;
    }
    .other-approaches {
      margin: 0;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface-muted, transparent);
    }
    .other-approaches h4 {
      margin: 0 0 4px;
      font-size: 0.95rem;
      scroll-margin-top: calc(var(--stage-top, 82px) + 12px);
    }
    .other-approaches h4:focus {
      outline: none;
    }
    .other-approaches h4:focus-visible {
      outline: 3px solid var(--accent-focus, var(--accent-strong));
      outline-offset: 3px;
      border-radius: 4px;
    }
    .same-bounds {
      margin: 0 0 8px;
      font-size: 0.88rem;
      color: var(--text-subtle);
    }
    .other-approaches ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 10px;
    }
    .other-approaches li {
      min-width: 0;
    }
    .approach-line {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 2px 10px;
      align-items: baseline;
      overflow-wrap: anywhere;
    }
    .approach-pattern {
      font-size: 0.85rem;
      color: var(--text-subtle);
    }
    .approach-when {
      margin: 2px 0 0;
      font-size: 0.9rem;
      line-height: 1.5;
    }
  `,
})
export class OptimalApproaches {
  readonly family = input<DsaApproachFamily | null | undefined>(null);
  readonly variant = input<OptimalApproachesVariant>('block');
  /** Lets a page with two blocks keep distinct heading ids. */
  readonly idPrefix = input('optimal-approaches');
  /** `finish` only: the learner revealed the pattern or solved the problem, so patterns may be named. */
  readonly named = input(false);

  protected readonly links = computed(() => optimalApproachLinks(this.family()));
  private readonly queryParamMap = toSignal(
    inject(ActivatedRoute, { optional: true })?.queryParamMap ?? of<ParamMap | null>(null),
    { initialValue: null },
  );
  /**
   * DLV-962: opened from a study plan, switching approach keeps the plan's return context, since
   * either approach completes the plan item. Only the plan's own three parameters are carried.
   */
  protected readonly planContext = computed(() => {
    const params = this.queryParamMap();
    const plan = params?.get('plan'),
      day = params?.get('day'),
      activity = params?.get('activity');
    return plan && day && activity ? { plan, day, activity } : null;
  });
  protected readonly total = computed(() => this.links().length + 1);
  /** Every approach in order, this page included, for the switch. */
  protected readonly segments = computed(() => {
    const family = this.family();
    if (!family) return [];
    // Only the number and the route: the switch is on screen before the learner tries (no spoilers).
    const others = this.links().map(({ approach, route }) => ({ approach, route, current: false }));
    const self = { approach: family.approach, current: true, route: [] as string[] };
    return [...others, self].sort((left, right) => left.approach - right.approach);
  });
  protected readonly headingId = computed(() => `${this.idPrefix()}-${this.family()?.bestProblemId ?? 'family'}`);
}
