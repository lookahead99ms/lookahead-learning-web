import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MembershipApi, MembershipRequestError } from './membership-api';
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
  it('throws refusals with their HTTP status, with or without a JSON body (DLV-969)',async()=>{
    TestBed.overrideProvider(ACCOUNT_FETCH,{useValue:async(path:string)=>path.endsWith('/auth/csrf')
      ?new Response(JSON.stringify({data:{headerName:'X-CSRF-TOKEN',token:'test-csrf'}}))
      :path.endsWith('/missing')?new Response('Not Found',{status:404}):new Response(JSON.stringify({message:'Type RESTORE to confirm.'}),{status:400})});
    const api=TestBed.inject(MembershipApi);
    const missing=await api.request('/missing',{}).catch((failure)=>failure);
    expect(missing).toBeInstanceOf(MembershipRequestError);
    expect(missing).toMatchObject({status:404,message:'Membership service unavailable. Try again.'});
    await expect(api.request('/refused',{})).rejects.toMatchObject({status:400,message:'Type RESTORE to confirm.'});
  });
  it('keeps reference prices but disables buying when the catalog is unavailable',async()=>{
    TestBed.overrideProvider(ACCOUNT_FETCH,{useValue:async()=>{throw new Error('offline');}});
    const api=TestBed.inject(MembershipApi);await api.refresh();
    expect(api.available()).toBe(false);expect(api.plans()).toEqual(PLANS);
    expect(api.error()).toContain('purchases are disabled');
  });
  describe('DEV purchase requests (DLV-969, owner 2026-11-04)',()=>{
    function serve(purchase:()=>Response,records:()=>unknown[]){
      TestBed.overrideProvider(ACCOUNT_FETCH,{useValue:async(path:string,init?:RequestInit)=>{
        calls.push({path,init});
        if(path.endsWith('/auth/csrf'))return new Response(JSON.stringify({data:{headerName:'X-CSRF-TOKEN',token:'test-csrf'}}));
        if(path.endsWith('/account/purchases'))return purchase();
        if(path.endsWith('/access-records'))return new Response(JSON.stringify({data:records()}));
        return new Response(JSON.stringify({data:path.endsWith('/membership/plans')?PLANS:{label:'Free'}}));
      }});
    }
    const record=(id:string)=>({id,planId:'learn',courses:[],startsAt:'2026-01-01T00:00:00Z',endsAt:'2027-01-01T00:00:00Z',status:'active',pricePaidCents:6999,discount:null});

    it('marks a request waiting from the pending answer, without reloading the account, and clears it once the plan changes',async()=>{
      let records:unknown[]=[record('old')];
      serve(()=>new Response(JSON.stringify({data:{status:'pending',providerStatus:'awaiting_owner_approval'}})),()=>records);
      account.set({accountId:'tester'});const api=TestBed.inject(MembershipApi);
      const result=await api.buy('advance','key-1');
      expect(result).toEqual({status:'pending',providerStatus:'awaiting_owner_approval'});
      expect(api.requestWaiting()).toBe(true);
      expect(calls.some(c=>c.path.endsWith('/auth/me'))).toBe(false);
      await api.loadRecords('tester');expect(api.requestWaiting()).toBe(true);
      records=[{...record('old'),supersededAt:'2026-11-04T10:00:00Z'},record('new')];
      await api.loadRecords('tester');expect(api.requestWaiting()).toBe(false);
    });

    it('marks a request waiting after 409 PURCHASE_REQUEST_PENDING and keeps the server code and words',async()=>{
      serve(()=>new Response(JSON.stringify({status:409,code:'PURCHASE_REQUEST_PENDING',message:'A request is already waiting for the owner or an admin.'}),{status:409}),()=>[]);
      account.set({accountId:'tester'});const api=TestBed.inject(MembershipApi);
      await expect(api.buy('advance','key-2')).rejects.toMatchObject({status:409,code:'PURCHASE_REQUEST_PENDING',message:'A request is already waiting for the owner or an admin.'});
      expect(api.requestWaiting()).toBe(true);
      account.set({accountId:'someone-else'});TestBed.tick();expect(api.requestWaiting()).toBe(false);
    });

    it('does not mark anything for 403 PURCHASES_TEST_ACCOUNTS_ONLY, read from a nested error code too',async()=>{
      serve(()=>new Response(JSON.stringify({error:{code:'PURCHASES_TEST_ACCOUNTS_ONLY',message:'In DEV, purchases are for test accounts; an owner or admin approves them.'}}),{status:403}),()=>[]);
      const api=TestBed.inject(MembershipApi);
      await expect(api.buy('learn','key-3')).rejects.toMatchObject({status:403,code:'PURCHASES_TEST_ACCOUNTS_ONLY',message:'In DEV, purchases are for test accounts; an owner or admin approves them.'});
      expect(api.requestWaiting()).toBe(false);
    });

    it('has no code when the refusal sends none',async()=>{
      serve(()=>new Response(JSON.stringify({message:'Busy'}),{status:409}),()=>[]);
      const api=TestBed.inject(MembershipApi);
      await expect(api.buy('learn','key-4')).rejects.toMatchObject({status:409,code:null});
      expect(api.requestWaiting()).toBe(false);
    });
  });
});
