import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MembershipApi } from '../../content/membership-api';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
export interface TestAccountRow {
 accountId: string; username: string; roles: string[]; revision: number;
 access: { label: string }; lastChangedBy: string; lastChangedAt: string;
 legacyPresetAvailable: boolean;
}
@Component({selector:'app-test-accounts',imports:[FormsModule],template:`
<section id="test-accounts" aria-labelledby="test-accounts-title">
 <h2 id="test-accounts-title">Test accounts</h2>
 <p>Local development fixtures. The existing author is excluded from seeds, resets and password rotation.</p>
 <p role="status">{{notice()}}</p>
 <button type="button" [disabled]="busy()" (click)="load()">Refresh accounts</button>
 <ul>@for(row of rows();track row.accountId){<li>
  <strong>{{row.username}}</strong> · {{row.roles.join(', ') || 'Learner'}} · {{row.access.label}}
  <p>Changed by {{actorName(row.lastChangedBy)}} on {{row.lastChangedAt}}</p>
  @if(canReset()){<button type="button" [disabled]="busy() || !!pending()" (click)="select(row)">Reset {{row.username}}</button>}
 </li>}</ul>
 @if(selected();as row){
  <fieldset [disabled]="busy() || !!pending()"><legend>Reset {{row.username}}</legend>
   <p>This replaces this test account’s plans, progress and access. Purchase and reset audit history remain. Its password and profile stay unchanged.</p>
   <label>Defaults <select [(ngModel)]="preset"><option value="scenario">Learner scenario</option>@if(row.legacyPresetAvailable){<option value="legacy">Original test learner options</option>}</select></label>
   <label>Type {{row.username}} to confirm <input [(ngModel)]="confirmation" autocomplete="off" /></label>
  </fieldset>
  <div class="actions">
   <button type="button" [disabled]="busy() || confirmation !== row.username" (click)="reset()">{{pending() ? 'Retry same reset' : 'Confirm reset'}}</button>
   <button type="button" [disabled]="busy()" (click)="cancel()">Cancel</button>
  </div>
 }
</section>`,styles:[`section{margin-block:2rem}li{padding-block:1rem;border-bottom:1px solid var(--border)}label{display:block;margin-block:1rem}.actions{display:flex;justify-content:center;gap:1rem;margin-block:1rem}@media(max-width:600px){.actions{flex-direction:column}.actions button{width:100%}}`]})
export class TestAccounts implements OnInit {
 private readonly api=inject(MembershipApi);private readonly accounts=inject(StudyPlanAccount);
 readonly canReset=computed(()=>!!this.accounts.account()?.permissions?.manageAccess || !!this.accounts.account()?.permissions?.triageFeedback);
 readonly rows=signal<TestAccountRow[]>([]);readonly notice=signal('');readonly busy=signal(false);readonly selected=signal<TestAccountRow|null>(null);
 readonly pending=signal<{key:string;expectedRevision:number;confirmation:string;preset:string}|null>(null);
 confirmation='';preset='scenario';
 ngOnInit(){void this.load();}
 actorName(id:string){return this.rows().find(row=>row.accountId===id)?.username ?? id;}
 select(row:TestAccountRow){if(!this.canReset()||this.pending())return;this.selected.set(row);this.confirmation='';this.preset='scenario';}
 cancel(){this.selected.set(null);this.pending.set(null);}
 async load(){if(this.busy())return;this.busy.set(true);try{this.rows.set(await this.api.request<TestAccountRow[]>('/admin/test-accounts'));this.notice.set('');}catch{this.notice.set('Test account maintenance is unavailable in this environment.');}finally{this.busy.set(false);}}
 async reset(){const row=this.selected();if(!row||!this.canReset()||this.busy()||this.confirmation!==row.username)return;
  const request=this.pending()??{key:crypto.randomUUID(),expectedRevision:row.revision,confirmation:row.username,preset:this.preset};this.pending.set(request);this.busy.set(true);
  try{await this.api.request('/admin/test-accounts/'+row.accountId+'/reset',request);this.cancel();this.busy.set(false);await this.load();this.notice.set(row.username+' reset.');}
  catch{this.notice.set('Reset was not confirmed. Retry the same reset, or cancel and refresh before another change.');}
  finally{this.busy.set(false);}
 }
}
