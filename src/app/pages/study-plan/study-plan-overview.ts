import { Component, input, output } from '@angular/core';
import { StudyPlan } from '../../content/study-plan';

/** Minutes of the plan's first week by kind of work, and where each kind ends on the compass ring (percent). */
export interface StudyPlanWeekAllocation {
  total: number;
  understand: number;
  practice: number;
  recall: number;
  learningEnd: number;
  practiceEnd: number;
}

/**
 * Your active plan: the plan line with its revision, the study day picker and plan actions, then the first week's
 * time split (the compass) with what the plan does and does not promise. The host is the page's
 * `section.active-plan-overview`; the page owns the plan, the selected day and the dialogs these actions open.
 */
@Component({
  selector: 'section[appStudyPlanOverview]',
  templateUrl: './study-plan-overview.html',
  styleUrls: ['./study-plan-base.css', './study-plan-overview.css'],
})
export class StudyPlanOverview {
  readonly plan = input.required<StudyPlan>();
  readonly revision = input.required<number>();
  /** Recovery days added to the plan so far. */
  readonly shiftedDays = input.required<number>();
  readonly selectedDay = input.required<number>();
  readonly allocation = input.required<StudyPlanWeekAllocation>();
  readonly editsLocked = input(false);
  readonly accountMode = input(false);
  readonly selectDay = output<number>();
  readonly openSchedule = output<void>();
  readonly openRecovery = output<void>();
  /** Review a study day (the selected one) in the complete schedule. */
  readonly reviewDay = output<number>();
}
