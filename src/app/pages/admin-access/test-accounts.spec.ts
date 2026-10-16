import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { TestAccounts, TestAccountRow } from './test-accounts';
import { MembershipApi } from '../../content/membership-api';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
const row:TestAccountRow={accountId:'test-id',username:'learner09',roles:[],revision:3,access:{label:'Free'},lastChangedBy:'seed',lastChangedAt:'2026-10-16',legacyPresetAvailable:true};
describe('Test account maintenance',()=>{
 let request:ReturnType<typeof vi.fn>;let account:ReturnType<typeof signal<any>>;let component:TestAccounts;
 beforeEach(()=>{request=vi.fn(async()=>[row]);account=signal({permissions:{manageAccess:false,triageFeedback:true}});
 TestBed.configureTestingModule({providers:[{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});component=TestBed.runInInjectionContext(()=>new TestAccounts());});
 it('loads labels and attribution and requires exact username confirmation',async()=>{
  await component.load();expect(component.rows()[0].access.label).toBe('Free');expect(component.actorName('seed')).toBe('seed');
  component.select(row);await component.reset();expect(request).toHaveBeenCalledTimes(1);
  component.confirmation='learner09';component.preset='legacy';await component.reset();
  expect(request).toHaveBeenCalledWith('/admin/test-accounts/test-id/reset',expect.objectContaining({confirmation:'learner09',preset:'legacy',expectedRevision:3}));expect(component.pending()).toBeNull();
 });
 it('retains one immutable retry request after uncertain responses',async()=>{
  component.select(row);component.confirmation=row.username;request.mockRejectedValue(new Error('network'));await component.reset();
  const first=component.pending();expect(first).not.toBeNull();component.preset='legacy';await component.reset();expect(component.pending()).toBe(first);
  expect(request.mock.calls[0][1]).toEqual(request.mock.calls[1][1]);component.cancel();expect(component.pending()).toBeNull();
 });
 it('co-authors can read but cannot select or reset accounts',async()=>{
  account.set({permissions:{feedbackRole:'co-author'}});await component.load();component.select(row);expect(component.selected()).toBeNull();
  component.selected.set(row);component.confirmation=row.username;await component.reset();expect(request).toHaveBeenCalledTimes(1);
 });
});
