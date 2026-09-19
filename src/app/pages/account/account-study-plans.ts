import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

function nonNegativeInteger(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

@Component({
  selector: 'app-account-study-plans',
  imports: [DatePipe, RouterLink],
  templateUrl: './account-study-plans.html',
  styleUrl: './account-study-plans.css',
})
export class AccountStudyPlans {
  protected readonly store = inject(StudyPlanAccount);
  protected readonly plans = computed(() =>
    this.store.plans().map((plan) => {
      const card =
        plan.card?.schemaVersion === 'plan-card/v1' && plan.card.metadataStatus === 'available'
          ? plan.card
          : null;
      const completed = card?.completedSessionCount;
      const total = card?.totalSessionCount;
      return {
        planId: plan.planId,
        name: plan.goal.trim() || 'Untitled study plan',
        progress:
          nonNegativeInteger(completed) && nonNegativeInteger(total) && completed <= total
            ? { completed, total }
            : null,
        durationDays:
          nonNegativeInteger(card?.durationDays) && card.durationDays > 0
            ? card.durationDays
            : null,
        dailyMinutes:
          nonNegativeInteger(card?.configuredDailyMinutes) && card.configuredDailyMinutes > 0
            ? card.configuredDailyMinutes
            : null,
        updatedAt:
          /^\d{4}-\d{2}-\d{2}T/.test(plan.updatedAt) && Number.isFinite(Date.parse(plan.updatedAt))
            ? plan.updatedAt
            : null,
      };
    }),
  );
}
