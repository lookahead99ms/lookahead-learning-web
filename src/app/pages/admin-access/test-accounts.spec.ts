import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { TestAccounts, TestAccountRow } from './test-accounts';
import { MembershipApi } from '../../content/membership-api';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
const row:TestAccountRow={accountId:'test-id',username:'learner09',roles:[],revision:3,access:{label:'Free'},lastChangedBy:'seed',lastChangedAt:'2026-10-16',legacyPresetAvailable:true,canDelete:true};
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

 it('lists people with role and plain access, filters them and opens purchase history',async()=>{
  account.set({accountId:'owner-1',username:'author',displayName:'Author',topicGrants:[],permissions:{manageAccess:true,feedbackRole:'owner'}});
  const records=[{id:'r1',planId:'advance',courses:[],startsAt:'2026-01-01T00:00:00Z',endsAt:'2027-01-01T00:00:00Z',status:'active',pricePaidCents:14499,discount:null},
   {id:'r2',planId:'grow',courses:[],startsAt:'2027-01-01T00:00:00Z',endsAt:'2028-01-01T00:00:00Z',status:'scheduled',pricePaidCents:9999,discount:null}];
  request.mockImplementation(async(path:string)=>path.endsWith('/access-records')?records:[{...row,username:'learner12',access:{label:'Regular · Advance',labels:['Regular · Advance'],grantedCourseIds:[]}}]);
  await component.load();
  expect(component.people().map(person=>[person.name,person.roles[0],person.access[0]])).toEqual([['author','Author (owner)','Full curriculum'],['learner12','Learner','Advance']]);
  component.query.set('full curr');expect(component.visible().map(person=>person.name)).toEqual(['author']);
  component.role.set('Admin');expect(component.visible()).toEqual([]);component.role.set('');component.query.set('');
  const learner=component.people()[1];
  expect(component.changedText(learner)).toBe('Default setup, 16 Oct 2026');expect(component.changedText(component.people()[0])).toBe('—');
  await component.toggle(learner);
  const history=component.historyOf(learner);
  expect(history?.state).toBe('ready');
  if(history?.state==='ready')expect(history.items.map(item=>[item.name,item.status])).toEqual([['Advance','active'],['Grow','scheduled']]);
  await component.toggle(learner);expect(component.expanded()).toBeNull();
  await component.toggle(learner);expect(request.mock.calls.filter(call=>String(call[0]).endsWith('/access-records'))).toHaveLength(1);
  await component.toggle(component.people().find(person=>!person.accountId)??{...learner,accountId:null});
 });
 it('shows when purchase history cannot load, and survives a failed catalog',async()=>{
  request.mockRejectedValue(new Error('down'));await component.load();expect(component.notice()).toContain('unavailable');
  const learner={key:'k',accountId:'acc',name:'x',detail:null,roles:['Learner'],access:['Free'],isTest:false,isSelf:false,pending:false,changedBy:null,changedAt:null,test:null};
  await component.toggle(learner);expect(component.historyOf(learner)?.state).toBe('error');
  await component.loadTitles();expect(component.titles().size).toBe(0);
 });
 it('loads every owner directory page and keeps real accounts without staff assignments',async()=>{
  account.set({accountId:'owner',username:'author',topicGrants:[],permissions:{manageAccess:true,feedbackRole:'owner'}});
  const real={accountId:'real',username:'real-user',displayName:'Real User',email:'real@example.test',roles:['user'],testAccount:false,fullCurriculum:false,access:{label:'Regular · Learn',labels:['Regular · Learn'],grantedCourseIds:[]}};
  request.mockImplementation(async(path:string)=>path==='/admin/test-accounts'?[row]:path.endsWith('page=0')?{accounts:[real],page:0,hasNext:true}:{accounts:[{...real,accountId:'test-id',username:'learner09',testAccount:true}],page:1,hasNext:false});
  await component.load();
  expect(component.notice()).toBe('');expect(component.people().filter(p=>p.accountId==='test-id')).toHaveLength(1);
  expect(component.people().find(p=>p.accountId==='real')).toMatchObject({name:'real-user',roles:['Learner'],access:['Learn'],isTest:false,test:null});
  expect(component.people().find(p=>p.accountId==='test-id')?.test).toEqual(row);
  expect(request).toHaveBeenCalledWith('/admin/accounts?query=&page=1');
 });
 it('splits test accounts from people, offers only the roles present and lets the owner give access',async()=>{
  account.set({accountId:'owner',username:'author',topicGrants:[],permissions:{manageAccess:true,feedbackRole:'owner'}});
  const real={accountId:'real',username:'real-user',displayName:'real-user',email:null,roles:['user'],testAccount:false,fullCurriculum:false,access:{label:'Free',labels:['Free'],grantedCourseIds:[]}};
  request.mockImplementation(async(path:string)=>path==='/admin/test-accounts'?[row,{...row,accountId:'admin-id',username:'admin01',roles:['admin'],canDelete:false}]:{accounts:[real],page:0,hasNext:false});
  await component.load();
  expect(component.view()).toBe('people');
  expect(component.inView().map(p=>p.name)).toEqual(['author','real-user']);
  expect(component.roleFilters()).toEqual(['Author (owner)','Learner']);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  const fixture=TestBed.createComponent(TestAccounts);fixture.componentRef.setInput('view','test');
  const given:string[]=[];fixture.componentInstance.giveAccess.subscribe(person=>given.push(person.name));
  await fixture.componentInstance.load();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const list=fixture.componentInstance;
  expect(list.inView().map(p=>p.name)).toEqual(['admin01','learner09']);
  expect(list.roleFilters()).toEqual(['Admin','Learner']);
  const root=fixture.nativeElement as HTMLElement;
  expect(root.querySelector('section')?.id).toBe('test-accounts');
  expect(root.querySelector('h2')?.textContent).toBe('Test accounts');
  expect(root.textContent).toContain('Staff can create independent learner logins here');
  const guide=root.querySelector('a.prose-link') as HTMLAnchorElement;
  expect(guide.textContent).toContain('Managed test accounts and saved plans');
  expect(guide.getAttribute('href')).toBe('/admin/local-development#managed-test-accounts-and-saved-plans');
  expect(root.querySelector('.row-actions')).toBeNull();
  expect(root.querySelectorAll('tbody input[type="checkbox"]')).toHaveLength(2);
  expect(root.querySelector('.selection-toolbar')).toBeNull();
  const selectLearner=root.querySelector('tr[data-account="learner09"] input[type="checkbox"]') as HTMLInputElement;
  selectLearner.click();fixture.detectChanges();
  expect(root.querySelector('.selection-toolbar')?.textContent).toContain('learner09 selected');
  expect([...root.querySelectorAll('.selection-actions button')].map(b=>b.textContent?.trim())).toEqual(['Details','Give access','Reset','Delete']);
  const give=[...root.querySelectorAll<HTMLButtonElement>('.selection-actions button')].find(b=>b.textContent?.trim()==='Give access');
  give?.click();expect(given).toEqual(['learner09']);
  const selectAdmin=root.querySelector('tr[data-account="admin01"] input[type="checkbox"]') as HTMLInputElement;
  selectAdmin.click();fixture.detectChanges();
  expect(selectLearner.checked).toBe(false);
  expect(root.querySelector('.selection-toolbar')?.textContent).toContain('admin01 selected');
  expect(root.querySelector('.selection-toolbar')?.textContent).not.toContain('Delete');
  account.set({permissions:{feedbackRole:'co-author'}});fixture.detectChanges();
  expect([...root.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Give access')).toBe(false);
 });
 it('creates with one retry key and deletes only an authorized learner',async()=>{
  account.set({accountId:'owner-1',permissions:{feedbackRole:'owner',manageAccess:true}});
  component.createPassword='synthetic-learner-fixture-only';
  request.mockRejectedValueOnce(new Error('uncertain'));
  await component.create();const key=component.createKey();expect(key).toBeTruthy();
  request.mockResolvedValueOnce({username:'test-0123456789abcdef01234567'});
  await component.create();expect(component.createKey()).toBeNull();
  expect(request.mock.calls[0][1]).toEqual(request.mock.calls[1][1]);
  const remove=vi.fn(async()=>({deleted:true}));(component as any).api.remove=remove;
  component.deleting.set(row);component.deleteConfirmation=row.username;
  await component.deleteAccount();expect(remove).toHaveBeenCalledWith('/admin/test-accounts/test-id');
  expect(component.notice()).toContain('lifetime count remains');
  expect(component.mayDelete({...row,username:'admin01',roles:['admin'],canDelete:false})).toBe(false);
 });
 it('offers owner downgrade before real learner deletion from the selection toolbar',async()=>{
  account.set({accountId:'owner',username:'author',topicGrants:[],permissions:{manageAccess:true,feedbackRole:'owner'}});
  let state:'admin'|'free'|'deleted'='admin';
  const real={accountId:'real-id',username:'real-user',displayName:'Real User',email:null,roles:['admin'],testAccount:false,fullCurriculum:true,
    access:{label:'Free',labels:['Free'],grantedCourseIds:[]},canDowngrade:true,canDelete:false};
  request.mockImplementation(async(path:string)=>{
    if(path==='/admin/test-accounts')return [];
    if(path.includes('/downgrade')){state='free';return {downgraded:true};}
    if(path.includes('/delete')){state='deleted';return {deleted:true};}
    return {accounts:state==='deleted'?[]:[state==='free'?{...real,roles:['user'],fullCurriculum:false,canDowngrade:false,canDelete:true}:real],page:0,hasNext:false};
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  const fixture=TestBed.createComponent(TestAccounts);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const root=fixture.nativeElement as HTMLElement;
  (root.querySelector('tr[data-account="real-user"] input[type="checkbox"]') as HTMLInputElement).click();fixture.detectChanges();
  expect(root.querySelector('.selection-toolbar')?.textContent).toContain('Downgrade to free');
  expect(root.querySelector('.selection-toolbar')?.textContent).not.toContain('Delete learner');
  [...root.querySelectorAll<HTMLButtonElement>('.selection-actions button')].find(button=>button.textContent?.includes('Downgrade'))?.click();fixture.detectChanges();
  fixture.componentInstance.realConfirmation='DOWNGRADE';await fixture.componentInstance.downgradeReal();fixture.detectChanges();
  expect(request).toHaveBeenCalledWith('/admin/accounts/real-id/downgrade',{confirmation:'DOWNGRADE'});
  (root.querySelector('tr[data-account="real-user"] input[type="checkbox"]') as HTMLInputElement).click();fixture.detectChanges();
  expect(root.querySelector('.selection-toolbar')?.textContent).toContain('Delete learner');
  fixture.componentInstance.deletingReal.set(fixture.componentInstance.selectedRow());
  fixture.componentInstance.realConfirmation='DELETE';await fixture.componentInstance.deleteReal();fixture.detectChanges();
  expect(request).toHaveBeenCalledWith('/admin/accounts/real-id/delete',{confirmation:'DELETE'});
  expect(root.querySelector('tr[data-account="real-user"]')).toBeNull();
 });
 it('discloses a partial directory and clears previous owner results after failure',async()=>{
  account.set({permissions:{manageAccess:true}});
  request.mockImplementation(async(path:string)=>path==='/admin/test-accounts'?[row]:{accounts:[],page:0,hasNext:true});
  await component.load();expect(component.notice()).toContain('full People directory could not be loaded');expect(component.directoryAccounts()).toEqual([]);
 });
});
