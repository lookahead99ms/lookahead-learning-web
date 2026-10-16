import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AccessRecordView } from './account-membership';

/**
 * DLV-209: the plans and passes an account bought, one row per purchase. Renew and Upgrade lead to
 * the plans page, the supported purchase flow; checkout is not connected, so nothing is charged.
 * Nothing renews automatically, so no recurring-billing wording appears here.
 */
@Component({
  selector: 'app-account-access-records',
  imports: [RouterLink],
  templateUrl: './account-access-records.html',
  styleUrl: './account-access-records.css',
})
export class AccountAccessRecords {
  readonly records = input.required<readonly AccessRecordView[]>();
}
