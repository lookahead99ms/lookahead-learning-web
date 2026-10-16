import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MembershipApi } from './membership-api';
import { PLANS } from './membership-plans';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../pages/study-plan/study-plan-account';

describe('Membership transport',()=>{
  const account=signal<any>(null);
  let calls:{path:string;init?:RequestInit}[];
  let failCsrf:boolean;
  beforeEach(()=>{
    calls=[];failCsrf=false;account.set(null);
    TestBed.configureTestingModule({providers:[
      {provide:StudyPlanAccount,useValue:{account,apiPath:(path:string)=>'/bff/api/v1'+path}},
      {provide:ACCOUNT_FETCH,useValue:async(path:string,init?:RequestInit)=>{
        calls.push({path,init});
        if(path.endsWith('/auth/csrf'))return new Response(JSON.stringify({data:{headerName:'X-CSRF-TOKEN',token:'test-csrf'}}),{status:failCsrf?403:200});
        const data=path.endsWith('/access-summary')?{label:'Regular · Learn'}:path.endsWith('/membership/plans')?PLANS:path.endsWith('/purchases')?{status:'pending',providerStatus:'requires_action'}:[];
        return new Response(JSON.stringify({data}));
      }}
    ]});
  });
  it('loads derived labels only for the current account and clears them on sign-out',async()=>{
    account.set({accountId:'a'});const api=TestBed.inject(MembershipApi);
    await api.loadAccessLabel('a');expect(api.accessLabel()).toBe('Regular · Learn');
    account.set({accountId:'b'});api.accessLabel.set(null);await api.loadAccessLabel('a');expect(api.accessLabel()).toBeNull();
    account.set(null);TestBed.tick();expect(api.accessLabel()).toBeNull();
  });
  it('loads server catalog and sends a session CSRF token and stable purchase key',async()=>{
    const api=TestBed.inject(MembershipApi);await api.refresh();
    expect(api.available()).toBe(true);
    await api.buy('learn','same-request-key',undefined,6999);
    await api.buy('learn','same-request-key',undefined,6999);
    const purchases=calls.filter(c=>c.path.endsWith('/purchases'));
    expect(purchases).toHaveLength(2);
    for(const request of purchases){
      expect(request.init?.method).toBe('POST');
      expect(request.init?.credentials).toBe('same-origin');
      expect(request.init?.cache).toBe('no-store');
      expect(request.init?.headers).toEqual({'X-CSRF-TOKEN':'test-csrf','Content-Type':'application/json','Idempotency-Key':'same-request-key'});
      expect(JSON.parse(request.init!.body as string)).toEqual({planId:'learn',replacesId:null,chosenCourses:[],expectedPriceCents:6999});
    }
  });
  it('does not submit a purchase when session CSRF cannot be obtained',async()=>{
    const api=TestBed.inject(MembershipApi);failCsrf=true;
    await expect(api.buy('learn','blocked-request')).rejects.toThrow('Session verification failed');
    expect(calls.some(c=>c.path.endsWith('/purchases'))).toBe(false);
  });
  it('keeps reference prices but disables buying when the catalog is unavailable',async()=>{
    TestBed.overrideProvider(ACCOUNT_FETCH,{useValue:async()=>{throw new Error('offline');}});
    const api=TestBed.inject(MembershipApi);await api.refresh();
    expect(api.available()).toBe(false);expect(api.plans()).toEqual(PLANS);
    expect(api.error()).toContain('purchases are disabled');
  });
});
