import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { TestAccounts, TestAccountRow } from './test-accounts';
import { MembershipApi } from '../../content/membership-api';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { DevSession } from '../../core/dev-session-notice/dev-session';
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
  expect(component.people().map(person=>[person.name,person.roles[0],person.access[0]])).toEqual([['Author','Author (owner)','Full curriculum'],['learner12','Learner','Advance']]);
  component.query.set('full curr');expect(component.visible().map(person=>person.name)).toEqual(['Author']);
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
  // The People view never shows the Test accounts note; it only loses the test rows (DLV-969).
  request.mockRejectedValue(new Error('down'));await component.load();expect(component.notice()).toBe('');expect(component.rows()).toEqual([]);
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
  expect(component.people().find(p=>p.accountId==='real')).toMatchObject({name:'Real User',detail:'real@example.test · real-user',roles:['Learner'],access:['Learn'],isTest:false,test:null});
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
  // DLV-969 (owner, 2026-11-04): the toolbar and its confirmations open in the row right under the selected account.
  expect(root.querySelector('tr[data-account="learner09"]')!.nextElementSibling!.matches('tr.selection-row')).toBe(true);
  expect(root.querySelectorAll('.selection-row')).toHaveLength(1);
  const action=(label:string)=>[...root.querySelectorAll<HTMLButtonElement>('.selection-actions button')].find(b=>b.textContent?.trim()===label)!;
  const opensUnderTheToolbar=(title:string)=>{
    const panel=root.querySelector('.selection-toolbar')!.nextElementSibling as HTMLElement;
    expect(panel.classList).toContain('reset-panel');
    expect(panel.textContent).toContain(title);
    expect(panel.closest('tr')!.previousElementSibling!.getAttribute('data-account')).toBe('learner09');
  };
  action('Reset').click();fixture.detectChanges();
  opensUnderTheToolbar('Reset learner09');
  [...root.querySelectorAll<HTMLButtonElement>('.reset-panel button')].find(b=>b.textContent?.trim()==='Cancel')!.click();fixture.detectChanges();
  expect(root.querySelector('.reset-panel')).toBeNull();
  action('Delete').click();fixture.detectChanges();
  opensUnderTheToolbar('Delete learner09');
  // DLV-969 (2026-11-04): one confirmation at a time; switching from Delete to Reset and back closes the other, typed text and all.
  (root.querySelector('.reset-panel input') as HTMLInputElement).value='learner09';
  fixture.componentInstance.deleteConfirmation='learner09';
  action('Reset').click();fixture.detectChanges();
  expect(root.querySelectorAll('.reset-panel')).toHaveLength(1);
  opensUnderTheToolbar('Reset learner09');
  action('Delete').click();fixture.detectChanges();
  expect(root.querySelectorAll('.reset-panel')).toHaveLength(1);
  opensUnderTheToolbar('Delete learner09');
  expect(fixture.componentInstance.deleteConfirmation).toBe('');
  [...root.querySelectorAll<HTMLButtonElement>('.reset-panel button')].find(b=>b.textContent?.trim()==='Cancel')!.click();fixture.detectChanges();
  const selectAdmin=root.querySelector('tr[data-account="admin01"] input[type="checkbox"]') as HTMLInputElement;
  selectAdmin.click();fixture.detectChanges();
  expect(selectLearner.checked).toBe(false);
  expect(root.querySelector('.selection-toolbar')?.textContent).toContain('admin01 selected');
  expect(root.querySelector('.selection-row')!.previousElementSibling!.getAttribute('data-account')).toBe('admin01');
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
 it('says why a reset or a deletion was refused, in the server\'s own words',async()=>{
  account.set({accountId:'owner-1',permissions:{feedbackRole:'owner',manageAccess:true}});
  component.select(row);component.confirmation=row.username;
  request.mockRejectedValueOnce(new Error('Test account changed; reload before resetting'));
  await component.reset();
  expect(component.notice()).toBe('Test account changed; reload before resetting Reset was not confirmed. Retry the same reset, or cancel and refresh before another change.');
  (component as any).api.remove=vi.fn(async()=>{throw new Error('Your role cannot delete this test account.');});
  component.deleting.set(row);component.deleteConfirmation=row.username;
  await component.deleteAccount();
  expect(component.notice()).toBe('Your role cannot delete this test account. Deletion was not confirmed. Retry the same account.');
  (component as any).api.remove=vi.fn(async()=>{throw 'no message';});
  await component.deleteAccount();
  expect(component.notice()).toBe('Deletion was not confirmed. Retry the same account.');
 });
 it('keeps one confirmation open at a time, whichever action opened it (DLV-969)',()=>{
  account.set({accountId:'owner-1',permissions:{feedbackRole:'owner',manageAccess:true}});
  const person={key:'p',name:'Real User'} as any;
  const open=()=>[component.selected(),component.deleting(),component.downgradingReal(),component.deletingReal(),component.removing()].filter(Boolean).length;
  component.select(row);component.confirmation=row.username;
  component.startDelete(row);expect(open()).toBe(1);expect(component.deleting()).toBe(row);expect(component.confirmation).toBe('');
  component.startDowngrade(person);expect(open()).toBe(1);expect(component.downgradingReal()).toBe(person);
  component.realConfirmation='DOWNGRADE';
  component.startRealDelete(person);expect(open()).toBe(1);expect(component.deletingReal()).toBe(person);expect(component.realConfirmation).toBe('');
  component.startRemoval(person,'disable');expect(open()).toBe(1);expect(component.removing()).toEqual({row:person,action:'disable'});
  component.select(row);expect(open()).toBe(1);expect(component.selected()).toBe(row);
  // An uncertain reset keeps its panel for the retry; Delete waits until it is retried or cancelled.
  component.pending.set({} as any);
  component.startDelete(row);expect(component.selected()).toBe(row);expect(component.deleting()).toBeNull();
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
  (root.querySelector('tr[data-account="Real User"] input[type="checkbox"]') as HTMLInputElement).click();fixture.detectChanges();
  expect(root.querySelector('.selection-toolbar')?.textContent).toContain('Downgrade to free');
  expect(root.querySelector('.selection-toolbar')?.textContent).not.toContain('Delete learner');
  [...root.querySelectorAll<HTMLButtonElement>('.selection-actions button')].find(button=>button.textContent?.includes('Downgrade'))?.click();fixture.detectChanges();
  expect(root.querySelector('.selection-toolbar')!.nextElementSibling?.textContent).toContain('Downgrade Real User to a free learner');
  fixture.componentInstance.realConfirmation='DOWNGRADE';await fixture.componentInstance.downgradeReal();fixture.detectChanges();
  expect(request).toHaveBeenCalledWith('/admin/accounts/real-id/downgrade',{confirmation:'DOWNGRADE'});
  (root.querySelector('tr[data-account="Real User"] input[type="checkbox"]') as HTMLInputElement).click();fixture.detectChanges();
  expect(root.querySelector('.selection-toolbar')?.textContent).toContain('Delete learner');
  [...root.querySelectorAll<HTMLButtonElement>('.selection-actions button')].find(b=>b.textContent?.trim()==='Delete learner')!.click();fixture.detectChanges();
  expect(root.querySelectorAll('.reset-panel')).toHaveLength(1);
  expect(root.querySelector('.selection-toolbar')!.nextElementSibling?.textContent).toContain('Delete learner Real User');
  fixture.componentInstance.realConfirmation='DELETE';await fixture.componentInstance.deleteReal();fixture.detectChanges();
  expect(request).toHaveBeenCalledWith('/admin/accounts/real-id/delete',{confirmation:'DELETE'});
  expect(root.querySelector('tr[data-account="Real User"]')).toBeNull();
 });
 it('offers Disable (strongest, with a warning mark) and Delete, each explained on screen and on hover (DLV-969)',async()=>{
  account.set({accountId:'owner',username:'author',topicGrants:[],permissions:{manageAccess:true,feedbackRole:'owner'}});
  let state:'active'|'disabled'|'deleted'='active';
  const cloud={accountId:'cloud-id',username:'alex@example.com',displayName:'Alex',email:'alex@example.com',roles:['user'],testAccount:false,fullCurriculum:false,
    access:{label:'Free',labels:['Free'],grantedCourseIds:[]},canDowngrade:false,canDelete:false};
  request.mockImplementation(async(path:string)=>{
    if(path==='/admin/test-accounts')return [];
    if(path.endsWith('/disable')){state='disabled';return {};}
    if(path.endsWith('/enable')){state='active';return {};}
    if(path.endsWith('/remove')){state='deleted';return {};}
    return {accounts:state==='deleted'?[]:[state==='active'?{...cloud,signIn:'active',canDisable:true,canRemove:true}:{...cloud,signIn:'disabled',canEnable:true,canRemove:true}],page:0,hasNext:false};
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  const fixture=TestBed.createComponent(TestAccounts);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const root=fixture.nativeElement as HTMLElement,page=fixture.componentInstance;
  const choose=()=>{(root.querySelector('tr[data-account="Alex"] input[type="checkbox"]') as HTMLInputElement).click();fixture.detectChanges();};
  const option=(label:string)=>[...root.querySelectorAll<HTMLElement>('.removal-option')].find(item=>item.querySelector('button')?.textContent?.includes(label));
  choose();
  const removal=root.querySelector('.removal')!;
  expect(removal.getAttribute('aria-label')).toBe('Remove access for Alex');
  expect([...removal.querySelectorAll('.removal-option button')].map(button=>button.textContent?.replace(/\s+/g,' ').trim())).toEqual(['⚠ Disable','Delete']);
  const disable=option('Disable')!.querySelector('button')!;
  expect(disable.classList).toContain('danger-button');
  expect(disable.getAttribute('title')).toBe(page.removalText.disable);
  expect(option('Disable')!.querySelector('p')?.textContent).toBe(page.removalText.disable);
  expect(page.removalText.disable).toMatch(/^Strongest\. Blocks every sign-in/);
  expect(document.getElementById(disable.getAttribute('aria-describedby')!)?.textContent).toBe(page.removalText.disable);
  expect(option('Delete')!.querySelector('button')!.getAttribute('title')).toBe(page.removalText.remove);
  expect(option('Delete')!.querySelector('p')?.textContent).toContain('appear in Waiting for access as a new person');
  // Disable asks for DISABLE before it calls the Domain.
  disable.click();fixture.detectChanges();
  const panel=root.querySelector('.removal + .reset-panel.danger-panel')!;
  expect(panel.querySelector('h3')?.textContent?.replace(/\s+/g,' ').trim()).toBe('⚠ Disable Alex');
  const confirm=()=>[...panel.querySelectorAll<HTMLButtonElement>('.actions button')][0];
  expect(confirm().disabled).toBe(true);
  page.removalConfirmation='DELETE';await page.confirmRemoval();
  expect(request).not.toHaveBeenCalledWith('/admin/accounts/cloud-id/disable',expect.anything());
  page.removalConfirmation='DISABLE';fixture.detectChanges();expect(confirm().disabled).toBe(false);
  confirm().click();await fixture.whenStable();fixture.detectChanges();
  expect(request).toHaveBeenCalledWith('/admin/accounts/cloud-id/disable',{confirmation:'DISABLE'});
  expect(page.notice()).toBe('Alex is disabled. Every sign-in is blocked and their open session closes within 5 minutes.');
  expect(root.querySelector('tr[data-account="Alex"] .state-badge.disabled')?.textContent?.replace(/\s+/g,' ').trim()).toBe('⚠ Disabled');
  // A disabled account offers Enable (one click) instead of Disable.
  choose();
  expect([...root.querySelectorAll('.removal-option button')].map(button=>button.textContent?.trim())).toEqual(['Enable','Delete']);
  expect(option('Enable')!.querySelector('p')?.textContent).toBe(page.removalText.enable);
  option('Enable')!.querySelector('button')!.click();await fixture.whenStable();fixture.detectChanges();
  expect(request).toHaveBeenCalledWith('/admin/accounts/cloud-id/enable',{});
  expect(page.notice()).toBe('Alex can sign in again.');
  // Delete asks for DELETE; the person leaves the list.
  choose();option('Delete')!.querySelector('button')!.click();fixture.detectChanges();
  expect(root.querySelector('.removal + .reset-panel')?.classList).not.toContain('danger-panel');
  expect(root.querySelector('.removal + .reset-panel')?.textContent).toContain('Purchase history stays for the audit.');
  page.removalConfirmation='DELETE';await page.confirmRemoval();fixture.detectChanges();
  expect(request).toHaveBeenCalledWith('/admin/accounts/cloud-id/remove',{confirmation:'DELETE'});
  expect(page.notice()).toBe('Alex is deleted. If they sign in again, they appear in Waiting for access as a new person.');
  expect(root.querySelector('tr[data-account="Alex"]')).toBeNull();
 });
 it('keeps removal off for yourself, for an older Domain without the flags, and reports failures (DLV-969)',async()=>{
  account.set({accountId:'owner',username:'author',topicGrants:[],permissions:{manageAccess:true,feedbackRole:'owner'}});
  const old={accountId:'old-id',username:'old@example.com',displayName:'Old',email:null,roles:['user'],testAccount:false,fullCurriculum:false,
    access:{label:'Free',labels:['Free'],grantedCourseIds:[]}};
  request.mockImplementation(async(path:string)=>{
    if(path==='/admin/test-accounts')return [];
    if(path.startsWith('/admin/accounts/'))throw new Error('down');
    return {accounts:[old],page:0,hasNext:false};
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  const fixture=TestBed.createComponent(TestAccounts);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const root=fixture.nativeElement as HTMLElement,page=fixture.componentInstance;
  (root.querySelector('tr[data-account="Old"] input[type="checkbox"]') as HTMLInputElement).click();fixture.detectChanges();
  expect(root.querySelector('.removal')).toBeNull();
  const row=page.selectedRow()!;
  expect([row.disabled,row.canDisable,row.canEnable,row.canRemove]).toEqual([false,false,false,false]);
  // Nothing is sent without the Domain's permission, for yourself, or without a selection.
  page.startRemoval(row,'disable');page.removalConfirmation='DISABLE';await page.confirmRemoval();
  page.startRemoval({...row,isSelf:true,canDisable:true},'disable');page.removalConfirmation='DISABLE';await page.confirmRemoval();
  await page.enable(row);page.removing.set(null);await page.confirmRemoval();
  expect(request.mock.calls.filter(([path])=>String(path).startsWith('/admin/accounts/'))).toEqual([]);
  // A failed call keeps the panel and says so.
  page.startRemoval({...row,canDisable:true},'disable');page.removalConfirmation='DISABLE';await page.confirmRemoval();
  expect(page.notice()).toBe('Disable was not confirmed. Refresh and retry.');expect(page.removing()).not.toBeNull();
  page.startRemoval({...row,canRemove:true},'remove');page.removalConfirmation='DELETE';await page.confirmRemoval();
  expect(page.notice()).toBe('Deletion was not confirmed. Refresh and retry the same account.');
  await page.enable({...row,canEnable:true});expect(page.notice()).toBe('Enable was not confirmed. Refresh and retry.');
  expect(page.busy()).toBe(false);
 });
 it('names everyone from the directory even when test accounts are switched off, as in DEV today (DLV-969)',async()=>{
  account.set({accountId:'owner',username:'author',topicGrants:[],permissions:{manageAccess:true,feedbackRole:'owner'}});
  const coauthor={accountId:'co-id',username:'google_1176',displayName:'Priya Raman',email:'priya@gmail.example',roles:['co-author'],testAccount:false,fullCurriculum:false,
    access:{label:'Free',labels:['Free'],grantedCourseIds:[]},signIn:'active',canDisable:true,canRemove:true};
  request.mockImplementation(async(path:string)=>{
    if(path.startsWith('/admin/test-accounts'))throw new Error('Test account maintenance is disabled.');
    return {accounts:[coauthor],page:0,hasNext:false};
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  const fixture=TestBed.createComponent(TestAccounts);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const root=fixture.nativeElement as HTMLElement,page=fixture.componentInstance;
  expect(request).toHaveBeenCalledWith('/admin/accounts?query=&page=0');
  // The owner sees the name and the Gmail, never Cognito's google_ id.
  const row=root.querySelector('tr[data-account="Priya Raman"]')!;
  expect(row.querySelector('.person')?.textContent).toBe('Priya Raman');
  expect(row.textContent).toContain('priya@gmail.example');
  expect(row.textContent).not.toContain('google_1176');
  expect(root.textContent).not.toContain('Test account maintenance is unavailable');
  expect(root.textContent).not.toContain('Account co-id');
  (row.querySelector('input[type="checkbox"]') as HTMLInputElement).click();fixture.detectChanges();
  expect([...root.querySelectorAll('.removal-option button')].map(button=>button.textContent?.replace(/\s+/g,' ').trim())).toEqual(['⚠ Disable','Delete']);
  // On the Test accounts tab the same failure is said once, and the list is simply empty.
  fixture.componentRef.setInput('view','test');await page.load();fixture.detectChanges();
  expect(page.notice()).toBe('Test account maintenance is unavailable in this environment.');
  expect(page.rows()).toEqual([]);
 });
 it('discloses a partial directory and clears previous owner results after failure',async()=>{
  account.set({permissions:{manageAccess:true}});
  request.mockImplementation(async(path:string)=>path==='/admin/test-accounts'?[row]:{accounts:[],page:0,hasNext:true});
  await component.load();expect(component.notice()).toContain('full People directory could not be loaded');expect(component.directoryAccounts()).toEqual([]);
 });
 /** DLV-969 S35: DEV test accounts are database-only; the roster is the owner's alone, and only in DEV. */
 describe('in DEV',()=>{
  const scenarios=[{id:'learner01',label:'Free · no study plan',roles:[]},{id:'learner05',label:'Learn · active · ready-made plan · in progress',roles:[]},{id:'admin',label:'Admin with the full curriculum',roles:['admin']}];
  function page(allowance:Record<string,unknown>,dev=true){
   TestBed.resetTestingModule();
   TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
   if(dev)TestBed.inject(DevSession).status.set({dev:true,deadline:'',warning:false,maintenance:false});
   request.mockImplementation(async(path:string)=>path==='/admin/test-accounts/allowance'?allowance:[]);
   const fixture=TestBed.createComponent(TestAccounts);fixture.componentRef.setInput('view','test');
   return fixture;
  }
  async function shown(fixture:ReturnType<typeof page>){fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();return fixture.nativeElement as HTMLElement;}
  beforeEach(()=>account.set({accountId:'owner-1',permissions:{feedbackRole:'owner',manageAccess:true}}));

  it('the owner creates the 35-account roster, a few per call, until every account exists',async()=>{
   const fixture=page({limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready:0,deleted:0},scenarios});
   const root=await shown(fixture);
   const card=root.querySelector('.roster-card')!;
   expect(card.textContent).toContain('0 of 35 ready');
   expect(root.querySelector('.note')?.textContent).toContain('sign out (not Exit DEV)');
   let ready=0;
   request.mockImplementation(async(path:string,body?:any)=>{
    if(body?.roster){ready=Math.min(35,ready+5);return {total:35,ready,deleted:0};}
    return path==='/admin/test-accounts/allowance'?{limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready,deleted:0},scenarios}:[];
   });
   (card.querySelector('button') as HTMLButtonElement).click();
   await fixture.whenStable();fixture.detectChanges();
   expect(request.mock.calls.filter(([,body])=>body?.roster).length).toBe(7);
   expect(fixture.componentInstance.notice()).toContain('The test roster is ready');
   // Every account exists: the card stays as a record, without a button.
   expect(root.querySelector('.roster-card')?.textContent).toContain('35 of 35 ready');
   expect(root.querySelector('.roster-card button')).toBeNull();
  });

  it('a stopped roster says so and continues with the remaining accounts',async()=>{
   const fixture=page({limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready:10,deleted:1},scenarios});
   const root=await shown(fixture);
   expect(root.querySelector('.roster-card')?.textContent).toContain('1 deleted (not created again)');
   expect(root.querySelector('.roster-card button')?.textContent?.trim()).toBe('Create the other 24');
   request.mockRejectedValueOnce(new Error('Test accounts are unavailable. Retry shortly.'));
   await fixture.componentInstance.createRoster();
   expect(fixture.componentInstance.notice()).toBe('Test accounts are unavailable. Retry shortly. The roster stopped part way. Create again to continue.');
   expect(fixture.componentInstance.rosterBusy()).toBe(false);
   request.mockRejectedValueOnce('no message');
   await fixture.componentInstance.createRoster();
   expect(fixture.componentInstance.notice()).toBe('The roster stopped part way. Create again to continue.');
  });

  it('says how many learners still wait for their study plan, in plain words (DLV-969 S37)',async()=>{
   const note=async(withoutPlan?:number)=>(await shown(page({limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready:35,deleted:0,withoutPlan},scenarios}))).querySelector('.roster-plans')?.textContent?.replace(/\s+/g,' ').trim()??null;
   expect(await note(25)).toBe('25 learners don’t have their study plan yet, because they were created before DEV had study plans. Reset all gives each one its plan.');
   expect(await note(1)).toBe('1 learner doesn’t have their study plan yet, because they were created before DEV had study plans. Reset all gives each one its plan.');
   expect(await note(0)).toBeNull();
   expect(await note(undefined)).toBeNull();
  });

  it('Reset all puts every roster account back to its scenario after one typed confirmation (DLV-969)',async()=>{
   const roster=(name:string,revision:number)=>({...row,accountId:name+'-id',username:name+'@lookahead.dev',revision,initialization:'scenario',creatorId:'owner-1'});
   const listed=[roster('learner01',3),roster('learner02',4),roster('admin01',2),{...row,accountId:'made-id',username:'test-1@lookahead.dev',initialization:'created',creatorId:'owner-1'}];
   const allowance={limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready:3,deleted:0,withoutPlan:2},scenarios};
   const fixture=page(allowance);
   request.mockImplementation(async(path:string)=>path==='/admin/test-accounts/allowance'?allowance:path==='/admin/test-accounts'?listed:{accounts:[],page:0,hasNext:false});
   const root=await shown(fixture);const component=fixture.componentInstance;
   expect(root.querySelector('.roster-note')?.textContent).toContain('never deleted');
   const resetAll=[...root.querySelectorAll<HTMLButtonElement>('.roster-card button')].find(b=>b.textContent?.trim()==='Reset all')!;
   // Opening it closes any confirmation that was open on a row.
   component.select(listed[0] as any);
   resetAll.click();fixture.detectChanges();
   expect(component.selected()).toBeNull();
   const panel=root.querySelector('.roster-reset')!;
   expect(panel.querySelector('h3')?.textContent).toBe('Reset all 3 roster accounts');
   const confirm=[...panel.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Reset all 3'))!;
   expect(confirm.disabled).toBe(true);
   await component.resetRoster();
   expect(request.mock.calls.some(([path])=>String(path).endsWith('/reset'))).toBe(false);
   component.rosterResetConfirmation='RESET ALL';
   request.mockImplementation(async(path:string,body?:any)=>{
    if(path==='/admin/test-accounts/admin01-id/reset')throw new Error('Test account changed; reload before resetting');
    return path==='/admin/test-accounts/allowance'?allowance:path==='/admin/test-accounts'?listed:body?{}:{accounts:[],page:0,hasNext:false};
   });
   await component.resetRoster();
   const resets=request.mock.calls.filter(([path])=>String(path).endsWith('/reset'));
   expect(resets.map(([path])=>path)).toEqual(['/admin/test-accounts/learner01-id/reset','/admin/test-accounts/learner02-id/reset','/admin/test-accounts/admin01-id/reset']);
   expect(resets[0][1]).toEqual({key:expect.any(String),expectedRevision:3,confirmation:'learner01@lookahead.dev',preset:'scenario'});
   expect(component.notice()).toBe('2 of 3 reset. Not reset: admin01@lookahead.dev (Test account changed; reload before resetting). Reset all again to retry.');
   expect(component.rosterReset()).toBeNull();
   expect(component.rosterResetConfirmation).toBe('');
   component.openRosterReset();component.rosterResetConfirmation='RESET ALL';
   request.mockImplementation(async(path:string,body?:any)=>{
    if(path==='/admin/test-accounts/admin01-id/reset')throw 'no message';
    return path==='/admin/test-accounts/allowance'?allowance:path==='/admin/test-accounts'?listed:body?{}:{accounts:[],page:0,hasNext:false};
   });
   await component.resetRoster();
   expect(component.notice()).toBe('2 of 3 reset. Not reset: admin01@lookahead.dev. Reset all again to retry.');
   component.openRosterReset();component.rosterResetConfirmation='RESET ALL';
   request.mockImplementation(async(path:string,body?:any)=>path==='/admin/test-accounts/allowance'?allowance:path==='/admin/test-accounts'?listed:body?{}:{accounts:[],page:0,hasNext:false});
   await component.resetRoster();
   expect(component.notice()).toBe('All 3 roster accounts are back to their scenarios.');
  });

  it('nobody but the owner sees the roster, and nobody sees it outside DEV',async()=>{
   account.set({accountId:'admin-1',permissions:{feedbackRole:'admin',manageAccess:true}});
   expect((await shown(page({limit:10,used:0,remaining:10,roster:null,scenarios}))).querySelector('.roster-card')).toBeNull();
   account.set({accountId:'owner-1',permissions:{feedbackRole:'owner',manageAccess:true}});
   const local=page({limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready:0,deleted:0},scenarios},false);
   expect((await shown(local)).querySelector('.roster-card')).toBeNull();
   await local.componentInstance.createRoster();
   expect(request.mock.calls.some(([,body])=>body?.roster)).toBe(false);
  });

  it('a new test account starts from a scenario and needs no password',async()=>{
   const fixture=page({limit:10,used:0,remaining:10,roster:null,scenarios});
   const root=await shown(fixture);const component=fixture.componentInstance;
   component.creating.set(true);fixture.detectChanges();
   const panel=root.querySelector('.reset-panel')!;
   expect([...panel.querySelectorAll('option')].map(option=>option.textContent)).toEqual(['learner01 · Free · no study plan','learner05 · Learn · active · ready-made plan · in progress','admin · Admin with the full curriculum']);
   expect(panel.querySelector('input[type="password"]')).toBeNull();
   expect(component.mayCreate()).toBe(true);
   component.createScenario='learner05';
   request.mockImplementation(async(path:string,body?:any)=>body?{username:'test-0a1b2c3d4e@lookahead.dev'}:path==='/admin/test-accounts/allowance'?{limit:10,used:1,remaining:9,scenarios}:[]);
   await component.create();
   const call=request.mock.calls.find(([path,body])=>path==='/admin/test-accounts'&&body)!;
   expect(call[1]).toEqual({key:expect.any(String),scenario:'learner05'});
   expect(component.notice()).toBe('test-0a1b2c3d4e@lookahead.dev created. To use it, sign out (not Exit DEV) and choose it under Use a test account.');
   request.mockRejectedValueOnce(new Error('uncertain'));
   await component.create();
   expect(component.notice()).toBe('Creation was not confirmed. Retry; the same request key is reused.');
   component.createScenario='';
   expect(component.mayCreate()).toBe(false);
  });
 });
});
