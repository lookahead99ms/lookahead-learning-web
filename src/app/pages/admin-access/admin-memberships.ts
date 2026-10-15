import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MembershipApi } from '../../content/membership-api';
import { AccessRecord } from '../account/account-membership';
@Component({selector:'app-admin-memberships',imports:[FormsModule],template:`
  <p>Local purchase records. Staff upgrades cost nothing and cannot reduce access.</p>
  <p role="status">{{notice()}}</p>
  <ul>@for(record of records();track record.id){<li>{{record.planId}} · {{record.status}} · Expires {{record.endsAt}} · Paid {{record.pricePaidCents / 100}} USD</li>}</ul>
  <label>Upgrade to <select [(ngModel)]="planId">@for(plan of plans();track plan.id){<option [value]="plan.id">{{plan.name}}</option>}</select></label>
  <button type="button" class="action-button" [disabled]="busy() || !accountId()" (click)="upgrade()">Apply free staff upgrade</button>
`})
export class AdminMemberships {
  readonly accountId=input<string|null>(null);
  private readonly api=inject(MembershipApi);
  readonly plans=computed(()=>this.api.plans().filter(p=>['learn','grow','advance','complete'].includes(p.id)));
  readonly records=signal<AccessRecord[]>([]);readonly notice=signal('');readonly busy=signal(false);
  planId='learn';private key=crypto.randomUUID();
  constructor(){effect(()=>{const id=this.accountId();this.records.set([]);this.key=crypto.randomUUID();if(id)void this.load(id);});}
  async load(id:string){try{const records=await this.api.request<AccessRecord[]>('/admin/accounts/'+id+'/access-records');if(this.accountId()===id)this.records.set(records);}catch(error){this.notice.set(error instanceof Error?error.message:'Records unavailable.');}}
  async upgrade(){const id=this.accountId();if(!id||this.busy())return;this.busy.set(true);try{const active=this.records().find(r=>r.status==='active');await this.api.request('/admin/accounts/'+id+'/plan-upgrades',{planId:this.planId,replacesId:active?.id??null,chosenCourses:[]},this.key);this.key=crypto.randomUUID();await this.load(id);this.notice.set('Staff upgrade recorded. No money charged.');}catch(error){this.notice.set(error instanceof Error?error.message:'Upgrade unavailable.');}finally{this.busy.set(false);}}
}
