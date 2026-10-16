import { Injectable, inject, signal, effect } from '@angular/core';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { PLANS, PlanDefinition, PlanId } from './membership-plans';
import type { AccessRecord } from '../pages/account/account-membership';

export interface Purchase extends AccessRecord { providerStatus: string; status: AccessRecord['status']; }
@Injectable({providedIn:'root'})
export class MembershipApi {
  private readonly transport=inject(ACCOUNT_FETCH);
  private readonly accounts=inject(StudyPlanAccount);
  readonly plans=signal<readonly PlanDefinition[]>(PLANS);
  readonly available=signal(false);
  readonly error=signal('');
  readonly records=signal<AccessRecord[]>([]);
  readonly accessLabel=signal<string | null>(null);
  constructor(){
    void this.refresh();
    effect(()=>{const account=this.accounts.account();this.records.set([]);this.accessLabel.set(null);if(account){void this.loadRecords(account.accountId);void this.loadAccessLabel(account.accountId);}});
  }
  async request<T>(path:string,body?:unknown,key?:string):Promise<T>{
    const headers:Record<string,string>={};
    if(body!==undefined){
      const csrf=await this.transport('/bff/api/v1/auth/csrf',{credentials:'same-origin',cache:'no-store'});
      if(!csrf.ok)throw new Error('Session verification failed. Sign in again.');
      const token=(await csrf.json()).data;
      if(typeof token?.headerName!=='string'||typeof token?.token!=='string')throw new Error('Session verification failed.');
      headers[token.headerName]=token.token;headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
    }
    const response=await this.transport('/bff/api/v1'+path,{method:body===undefined?'GET':'POST',headers,credentials:'same-origin',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.message??result.error?.message??'Membership service unavailable. Try again.');
    return result.data as T;
  }
  async refresh(){try{const plans=await this.request<PlanDefinition[]>('/membership/plans');if(!Array.isArray(plans)||!plans.length)throw new Error('Catalog unavailable');this.plans.set(plans);this.available.set(true);this.error.set('');}catch{this.available.set(false);this.error.set('Membership service unavailable. Displayed prices are reference only; purchases are disabled.');}}
  async loadRecords(owner:string){try{const records=await this.request<AccessRecord[]>('/account/access-records');if(this.accounts.account()?.accountId===owner)this.records.set(records);}catch{if(this.accounts.account()?.accountId===owner)this.error.set('Purchase records could not be loaded.');}}
  async loadAccessLabel(owner:string){try{const summary=await this.request<{label:string}>('/account/access-summary');if(this.accounts.account()?.accountId===owner && typeof summary?.label==='string')this.accessLabel.set(summary.label);}catch{if(this.accounts.account()?.accountId===owner)this.accessLabel.set(null);}}
  async buy(planId:PlanId,key:string,replacesId?:string,expectedPriceCents?:number){const p=await this.request<{status:string;providerStatus:string}>('/account/purchases',{planId,replacesId:replacesId??null,chosenCourses:[],expectedPriceCents},key);const owner=this.accounts.account()?.accountId;if(owner){await this.loadRecords(owner);await this.loadAccessLabel(owner);if(['succeeded','scheduled'].includes(p.status)){const account=await this.request<NonNullable<ReturnType<typeof this.accounts.account>>>('/auth/me');if(this.accounts.account()?.accountId===owner&&account.accountId===owner)this.accounts.account.set(account);}}return p;}
}
