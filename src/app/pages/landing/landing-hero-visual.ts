import { Component, input } from '@angular/core';

/** Presentational hero cards; the landing page owns rotation and navigation. */
@Component({
  selector: 'app-landing-hero-visual',
  templateUrl: './landing-hero-visual.html',
  styleUrl: './landing-hero-visual.css',
  host: { '[class.active]': 'active()' },
})
export class LandingHeroVisual {
  readonly visual = input.required<'choose' | 'plan' | 'reason' | 'design' | 'build' | 'diagnose'>();
  readonly active = input(false);
  readonly reducedMotion = input(false);
  /** The Build slide's project tiles: a few examples; the catalog grows, so no count is shown. */
  protected readonly aiTiles = [
    'On-call Assistant',
    'Document Intelligence',
    'Supply Chain Assistant',
    'Research Agent',
    'Full-Stack AI',
  ];
  /** The Build slide's checklist: what every guided project gives you. */
  protected readonly aiChecklist = [
    'A prompt for each step',
    'Tests for every step',
    'Java and Python downloads',
    'You approve every action',
  ];
  /** Hero slides in journey order: Choose, Plan, Reason, Design, Build, Diagnose. */
  protected readonly windowExample =
    'left = 0\nfor right in range(len(values)):\n    # Maintain the valid window\n    while window_is_invalid():\n        left += 1';
  /** The window example, one line per row; the invariant line is highlighted in the hero card. */
  protected readonly windowLines = this.windowExample.split('\n');
  protected readonly invariantLine = 2;
  /** The Reason slide's sketch: a sliding window over example values, between the left and right pointers. */
  protected readonly windowCells = [3, 1, 4, 1, 5, 9, 2, 6];
  protected readonly windowLeft = 2;
  protected readonly windowRight = 5;
  /** The Plan slide's example week: Wednesday gets busy, so the quiz moves to Thursday. */
  protected readonly exampleWeek = [
    { day: 'Mon', task: 'Learn', kind: 'study' },
    { day: 'Tue', task: 'Practice', kind: 'study' },
    { day: 'Wed', task: 'Busy', kind: 'busy' },
    { day: 'Thu', task: 'Quiz', kind: 'quiz' },
    { day: 'Fri', task: 'Review', kind: 'study' },
  ];

}
