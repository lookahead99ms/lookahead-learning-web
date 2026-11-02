import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable, switchMap } from 'rxjs';
import { DeliverySnapshot } from './delivery-editor.service';
import { PUBLISHED_DELIVERY_PLAN_HREF, shapeDeliverySnapshot } from './delivery-plan-publication';

/** Read-only copy of the delivery plan from the Content publication Domain serves to staff. */
@Injectable({ providedIn: 'root' })
export class DeliveryPublicationService {
  private readonly http = inject(HttpClient);

  load(): Observable<DeliverySnapshot> {
    return this.http
      .get(PUBLISHED_DELIVERY_PLAN_HREF, { responseType: 'text' })
      .pipe(switchMap((text) => from(shapeDeliverySnapshot(text))));
  }
}
