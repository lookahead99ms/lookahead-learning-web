import { Component, input, output } from '@angular/core';
import { CardScene } from '../../core/card-scene/card-scene';

export type StudyPlanType = 'authored' | 'custom';

/**
 * Create a study plan, first step: start with an authored preparation path or build a custom plan. The host is
 * the page's `section.plan-type-panel`; the page opens the chosen flow.
 */
@Component({
  selector: 'section[appStudyPlanTypeChoice]',
  imports: [CardScene],
  templateUrl: './study-plan-type-choice.html',
  styleUrls: ['./study-plan-base.css', './study-plan-type-choice.css'],
})
export class StudyPlanTypeChoice {
  /** The page's status line for this step, or '' when there is none to show. */
  readonly status = input('');
  readonly choose = output<StudyPlanType>();
}
