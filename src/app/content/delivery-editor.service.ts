import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DeliveryPlan, DeliveryWorkItem } from './delivery-plan.models';

export type DeliveryWorkItemInput = Pick<
  DeliveryWorkItem,
  | 'title'
  | 'summary'
  | 'type'
  | 'stageId'
  | 'statusId'
  | 'priorityId'
  | 'labels'
  | 'acceptanceCriteria'
  | 'dependencies'
  | 'blockedBy'
  | 'notes'
>;

export interface DeliverySnapshot {
  plan: DeliveryPlan;
  revision: string;
  workItemId?: string;
}

@Injectable({ providedIn: 'root' })
export class DeliveryEditorService {
  private readonly http = inject(HttpClient);
  private readonly base = '/__local/delivery';

  load() {
    return this.http.get<DeliverySnapshot>(`${this.base}/plan`);
  }

  save(revision: string, item: DeliveryWorkItemInput, id?: string) {
    const options = { headers: { 'X-Delivery-Request': '1' } };
    const body = { revision, item };
    return id
      ? this.http.put<DeliverySnapshot>(
          `${this.base}/work-items/${encodeURIComponent(id)}`,
          body,
          options,
        )
      : this.http.post<DeliverySnapshot>(`${this.base}/work-items`, body, options);
  }
}
