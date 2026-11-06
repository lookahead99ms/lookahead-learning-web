import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { TestAccounts, TestAccountRow } from './test-accounts';
import { MembershipApi, MembershipRequestError } from '../../content/membership-api';
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
  // Owner, 2026-11-06: one list, no kind-of-account tabs and no Role menu on Test accounts.
  expect(root.querySelector('.list-tabs')).toBeNull();
  expect(root.querySelector('.directory-tools select')).toBeNull();
  expect(root.querySelectorAll('tbody tr[data-account]')).toHaveLength(2);
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
  // Owner, 2026-11-06: one list, so the admin-role row sits beside the learner; selecting it moves the selection.
  const selectAdmin=root.querySelector('tr[data-account="admin01"] input[type="checkbox"]') as HTMLInputElement;
  selectAdmin.click();fixture.detectChanges();
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
  // DLV-969 (owner, DEV test 2026-11-04): the reason stays inside the open panel, not in the page notice.
  expect(component.panelError()).toBe('Test account changed; reload before resetting Reset was not confirmed. Retry the same reset, or cancel and refresh before another change.');
  expect(component.notice()).toBe('');expect(component.selected()).toBe(row);
  component.cancel();expect(component.panelError()).toBe('');
  (component as any).api.remove=vi.fn(async()=>{throw new Error('Your role cannot delete this test account.');});
  component.deleting.set(row);component.deleteConfirmation=row.username;
  await component.deleteAccount();
  expect(component.panelError()).toBe('Your role cannot delete this test account. Deletion was not confirmed. Retry the same account.');
  expect(component.deleting()).toBe(row);
  (component as any).api.remove=vi.fn(async()=>{throw 'no message';});
  await component.deleteAccount();
  expect(component.panelError()).toBe('Deletion was not confirmed. Retry the same account.');
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
  // DLV-969 (owner, DEV test 2026-11-04): a failure keeps the panel open with the server's message inside it.
  request.mockRejectedValueOnce(new Error('Request body is not valid JSON'));
  confirm().click();await fixture.whenStable();fixture.detectChanges();
  expect(panel.querySelector('.panel-error')?.textContent).toBe('Request body is not valid JSON Disable was not confirmed. Refresh and retry.');
  expect(panel.querySelector('.panel-error')?.getAttribute('role')).toBe('alert');
  expect(root.querySelector('.removal + .reset-panel.danger-panel')).toBe(panel);
  confirm().click();await fixture.whenStable();fixture.detectChanges();
  expect(root.querySelector('.reset-panel')).toBeNull();
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
  expect(page.panelError()).toBe('down Disable was not confirmed. Refresh and retry.');expect(page.removing()).not.toBeNull();
  page.startRemoval({...row,canRemove:true},'remove');expect(page.panelError()).toBe('');page.removalConfirmation='DELETE';await page.confirmRemoval();
  expect(page.panelError()).toBe('down Deletion was not confirmed. Refresh and retry the same account.');
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
   expect(root.querySelector('.note')?.textContent).toContain('Switch to a test account in your account menu');
   let ready=0;
   request.mockImplementation(async(path:string,body?:any)=>{
    if(body?.roster){ready=Math.min(35,ready+5);return {total:35,ready,deleted:0};}
    return path==='/admin/test-accounts/allowance'?{limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready,deleted:0},scenarios}:[];
   });
   (card.querySelector('.roster-actions button') as HTMLButtonElement).click();
   await fixture.whenStable();fixture.detectChanges();
   expect(request.mock.calls.filter(([,body])=>body?.roster).length).toBe(7);
   expect(fixture.componentInstance.notice()).toContain('The test roster is ready');
   // Every account exists: the card stays as a record, without a button.
   expect(root.querySelector('.roster-status')?.textContent?.trim()).toBe('35 of 35 ready.');
   expect(root.querySelector('.roster-actions')).toBeNull();
  });

  it('a stopped roster says so and continues with the remaining accounts',async()=>{
   const fixture=page({limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready:10,deleted:1},scenarios});
   const root=await shown(fixture);
   expect(root.querySelector('.roster-card')?.textContent?.replace(/\s+/g,' ')).toContain('10 of 35 ready, 1 deleted.');
   expect(root.querySelector('.roster-actions button')?.textContent?.trim()).toBe('Create the other 24');
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
   // An older Domain without roster.changed keeps Reset all available.
   expect(resetAll.disabled).toBe(false);
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

  /** DLV-969 (owner, 2026-11-04): Restore brings deleted roster accounts back with their scenarios. */
  describe('Restore',()=>{
   const allowance=(deleted:number)=>({limit:2147483647,used:0,remaining:2147483647,roster:{total:35,ready:35-deleted,deleted},scenarios});
   const buttons=(root:HTMLElement,selector:string)=>[...root.querySelectorAll<HTMLButtonElement>(selector)];
   const restoreButton=(root:HTMLElement)=>buttons(root,'.roster-card button').find(b=>b.textContent?.trim().startsWith('Restore'));

   it('the owner restores the deleted roster accounts after typing RESTORE once',async()=>{
    let deleted=3;
    const page2=page(allowance(3));
    request.mockImplementation(async(path:string,body?:any)=>{
     if(path==='/admin/test-accounts'&&body?.restoreRoster){deleted=0;return {restored:3};}
     return path==='/admin/test-accounts/allowance'?allowance(deleted):path==='/admin/test-accounts'?[]:body?{}:{accounts:[],page:0,hasNext:false};
    });
    const root=await shown(page2);const component=page2.componentInstance;
    expect(root.querySelector('.roster-card')?.textContent?.replace(/\s+/g,' ')).toContain('32 of 35 ready, 3 deleted.');
    expect(root.querySelector('.roster-card')?.textContent).not.toContain('not created again');
    const open=restoreButton(root)!;
    expect(open.textContent?.trim()).toBe('Restore 3');
    // Opening it closes any other confirmation, such as Reset all.
    component.openRosterReset();page2.detectChanges();
    open.click();page2.detectChanges();
    expect(component.rosterReset()).toBeNull();
    const panel=root.querySelector('.roster-restore')!;
    expect(panel.querySelector('h3')?.textContent).toBe('Restore 3 deleted roster accounts');
    expect(panel.querySelector('p')?.textContent).toBe('Each comes back with its scenario: learners get their membership, purchases and study plan; staff get their role.');
    expect(panel.querySelector('label')?.textContent).toContain('Type RESTORE to confirm');
    const confirm=buttons(panel as HTMLElement,'.actions button');
    expect(confirm.map(b=>b.textContent?.trim())).toEqual(['Restore 3','Cancel']);
    expect(confirm[0].disabled).toBe(true);
    // Nothing is sent until RESTORE is typed exactly.
    component.rosterRestoreConfirmation='restore';await component.restoreRoster();
    expect(request.mock.calls.some(([path,body])=>path==='/admin/test-accounts'&&(body as any)?.restoreRoster)).toBe(false);
    const input=panel.querySelector('input') as HTMLInputElement;
    input.value='RESTORE';input.dispatchEvent(new Event('input'));page2.detectChanges();
    expect(confirm[0].disabled).toBe(false);
    confirm[0].click();
    await page2.whenStable();page2.detectChanges();
    expect(request).toHaveBeenCalledWith('/admin/test-accounts',{restoreRoster:true,confirm:'RESTORE'});
    expect(component.notice()).toBe('Restored 3 roster accounts.');
    expect(root.querySelector('.notice')?.textContent).toBe('Restored 3 roster accounts.');
    expect(component.rosterRestore()).toBeNull();
    expect(component.rosterRestoreConfirmation).toBe('');
    // The counts were loaded again at once: nothing deleted, so the line says so, Restore is gone, and so is the panel.
    expect(request.mock.calls.filter(([path])=>path==='/admin/test-accounts/allowance').length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector('.roster-status')?.textContent?.trim()).toBe('35 of 35 ready.');
    expect(restoreButton(root)).toBeUndefined();
    expect(root.querySelector('.roster-restore')).toBeNull();
   });

   it('names one account in the singular and falls back to the deleted count when the Domain sends no number',async()=>{
    const fixture=page(allowance(1));
    const root=await shown(fixture);const component=fixture.componentInstance;
    restoreButton(root)!.click();fixture.detectChanges();
    expect(root.querySelector('.roster-restore h3')?.textContent).toBe('Restore 1 deleted roster account');
    request.mockImplementation(async(path:string,body?:any)=>path==='/admin/test-accounts/allowance'?allowance(0):body?null:[]);
    component.rosterRestoreConfirmation='RESTORE';await component.restoreRoster();
    expect(component.notice()).toBe('Restored 1 roster account.');
   });

   it('says an older Domain has no Restore yet (404), and keeps the panel open on other refusals',async()=>{
    const fixture=page(allowance(2));
    const root=await shown(fixture);const component=fixture.componentInstance;
    component.openRosterRestore();component.rosterRestoreConfirmation='RESTORE';
    request.mockRejectedValueOnce(new MembershipRequestError('Request body is not valid JSON',400));
    await component.restoreRoster();fixture.detectChanges();
    // DLV-969 (owner, DEV test 2026-11-04): the panel stays open, with the server's message inside it.
    expect(component.panelError()).toBe('Request body is not valid JSON Restore was not confirmed. Refresh and retry.');
    expect(root.querySelector('.roster-restore .panel-error')?.textContent).toBe('Request body is not valid JSON Restore was not confirmed. Refresh and retry.');
    expect(root.querySelector('.roster-restore .panel-error')?.getAttribute('role')).toBe('alert');
    expect(component.notice()).toBe('');
    expect(component.rosterRestore()).toEqual({total:2});
    expect(component.busy()).toBe(false);
    request.mockRejectedValueOnce(new MembershipRequestError('Not found',404));
    await component.restoreRoster();
    fixture.detectChanges();
    expect(root.querySelector('.roster-restore .panel-error')?.textContent).toBe('Restore needs the newer Domain release.');
    expect(component.rosterRestore()).toEqual({total:2});
    // Cancel closes it, and its message, without a request.
    buttons(root,'.roster-restore .actions button').find(b=>b.textContent?.trim()==='Cancel')!.click();fixture.detectChanges();
    expect(root.querySelector('.roster-restore')).toBeNull();expect(component.panelError()).toBe('');
    component.openRosterRestore();fixture.detectChanges();
    buttons(root,'.roster-restore .actions button').find(b=>b.textContent?.trim()==='Cancel')!.click();fixture.detectChanges();
    expect(root.querySelector('.roster-restore')).toBeNull();
    expect(request.mock.calls.filter(([path,body])=>path==='/admin/test-accounts'&&(body as any)?.restoreRoster)).toHaveLength(2);
   });

   it('hides Restore when nothing is deleted, and offers it to nobody but the owner',async()=>{
    const none=page(allowance(0));const empty=await shown(none);
    expect(empty.querySelector('.roster-status')?.textContent?.trim()).toBe('35 of 35 ready.');
    expect(restoreButton(empty)).toBeUndefined();
    none.componentInstance.openRosterRestore();expect(none.componentInstance.rosterRestore()).toBeNull();
    // An admin given a roster status by mistake still gets no Restore or Reset all.
    account.set({accountId:'admin-1',permissions:{feedbackRole:'admin',manageAccess:false,triageFeedback:true}});
    const fixture=page(allowance(2));
    const root=await shown(fixture);
    expect(root.querySelector('.roster-card')?.textContent).toContain('33 of 35 ready, 2 deleted.');
    expect(restoreButton(root)).toBeUndefined();
    expect(buttons(root,'.test-actions button').map(b=>b.textContent?.trim())).toEqual(['Refresh','Create test account']);
    expect(buttons(root,'.roster-card button')).toHaveLength(0);
    fixture.componentInstance.openRosterRestore();
    expect(fixture.componentInstance.rosterRestore()).toBeNull();
    fixture.componentInstance.rosterRestoreConfirmation='RESTORE';
    await fixture.componentInstance.restoreRoster();
    expect(request.mock.calls.some(([path,body])=>path==='/admin/test-accounts'&&(body as any)?.restoreRoster)).toBe(false);
    // authorPreview without a feedback role counts as the owner, as elsewhere on this page.
    account.set({accountId:'owner-1',authorPreview:true});
    expect(restoreButton(await shown(page(allowance(2))))?.textContent?.trim()).toBe('Restore 2');
   });
  });

  /** DLV-969 (owner, 2026-11-04): two cards with their own actions, one panel under both, a tabbed list. */
  describe('layout',()=>{
   const roster=(name:string,roles:string[]=[])=>({...row,accountId:name+'-id',username:name+'@lookahead.dev',roles,initialization:'scenario',creatorId:'owner-1'});
   const listed=[roster('learner01'),roster('learner02'),roster('learner03')];
   const allowance=(extra:Record<string,unknown>={})=>({limit:2147483647,used:4,remaining:2147483647,roster:{total:35,ready:33,deleted:2,changed:3,withoutPlan:0,...extra},scenarios});
   function layout(quota:Record<string,unknown>){
    const fixture=page(quota);
    request.mockImplementation(async(path:string,body?:any)=>path==='/admin/test-accounts/allowance'?quota:path==='/admin/test-accounts'&&!body?listed:body?{}:{accounts:[],page:0,hasNext:false});
    return fixture;
   }
   const labels=(root:HTMLElement,selector:string)=>[...root.querySelectorAll<HTMLButtonElement>(selector+' button')].map(b=>b.textContent?.trim());
   const action=(root:HTMLElement,label:string)=>[...root.querySelectorAll<HTMLButtonElement>('.test-cards button')].find(b=>b.textContent?.trim().startsWith(label))!;

   it('puts Test accounts and Test roster side by side, each with its own actions next to the line they act on',async()=>{
    const root=await shown(layout(allowance()));
    const cards=root.querySelector('.test-cards')!;
    expect(cards.classList).not.toContain('single');
    expect([...cards.children].map(card=>card.className)).toEqual(['test-card','roster-card']);
    const left=cards.children[0] as HTMLElement,right=cards.children[1] as HTMLElement;
    expect(left.querySelector('.card-heading h2')?.textContent).toBe('Test accounts');
    expect(left.textContent).toContain('Switch to a test account in your account menu');
    expect(left.querySelector('.lifetime')?.textContent?.replace(/\s+/g,' ')).toContain('Lifetime creations: 4 used · unlimited');
    // Test accounts: its two actions at the bottom of the card, Refresh (secondary) then Create test account (primary).
    const own=left.querySelector('.card-actions')!;
    expect(own.getAttribute('role')).toBe('group');
    expect(own.previousElementSibling?.classList).toContain('card-body');
    expect(labels(left,'.card-actions')).toEqual(['Refresh','Create test account']);
    expect([...own.querySelectorAll('button')].map(b=>b.className)).toEqual(['action-link','action-button']);
    // Test roster: Restore beside the status line, Reset all beside the line about resetting.
    expect(right.querySelector('.card-heading h3')?.textContent).toBe('Test roster');
    const lines=[...right.querySelectorAll('.roster-line')];
    expect(lines.map(line=>[line.querySelector('p')?.textContent?.replace(/\s+/g,' ').trim(),labels(line as HTMLElement,'')])).toEqual([
     ['33 of 35 ready, 2 deleted.',['Restore 2']],
     ['Roster accounts are never deleted; Reset puts one back to its scenario.',['Reset all']],
    ]);
    expect([...right.querySelectorAll<HTMLButtonElement>('button')].map(b=>b.disabled)).toEqual([false,false]);
    expect(right.querySelector('.line-hint')).toBeNull();
    // No separate row of buttons under the cards, no old heading buttons and no Role menu on this tab.
    expect(cards.nextElementSibling?.classList.contains('test-actions')).toBe(false);
    expect(root.querySelector('.test-actions-hint')).toBeNull();
    expect(root.querySelector('.directory-heading, .heading-actions')).toBeNull();
    expect(root.querySelector('.directory-tools select')).toBeNull();
   });

   it('says "35 of 35 ready." without Restore when nothing is deleted, and greys Reset all when nothing changed',async()=>{
    let root=await shown(layout(allowance({changed:0,deleted:0,ready:35})));
    expect(root.querySelector('.roster-status')?.textContent?.trim()).toBe('35 of 35 ready.');
    expect(root.querySelector('.roster-line')?.querySelector('button')).toBeNull();
    expect(action(root,'Restore')).toBeUndefined();
    expect(action(root,'Reset all').disabled).toBe(true);
    expect(action(root,'Reset all').getAttribute('title')).toBe('Nothing to reset: every roster account is at its scenario');
    expect(root.querySelector('#reset-hint')?.textContent).toBe('Nothing to reset: every roster account is at its scenario');
    expect(root.querySelector('#reset-hint')?.closest('.roster-line')).toBe(action(root,'Reset all').closest('.roster-line'));
    expect(action(root,'Reset all').getAttribute('aria-describedby')).toBe('reset-hint');
    expect(action(root,'Create test account').disabled).toBe(false);
    expect(action(root,'Refresh').disabled).toBe(false);
    // openRosterReset sends nothing and opens nothing while there is nothing to reset.
    const fixture=layout(allowance({changed:0}));root=await shown(fixture);
    fixture.componentInstance.openRosterReset();expect(fixture.componentInstance.rosterReset()).toBeNull();
    // Without the changed field (older Domain) Reset all stays available.
    root=await shown(layout(allowance({changed:undefined})));
    expect(action(root,'Reset all').disabled).toBe(false);
    expect(action(root,'Reset all').getAttribute('title')).toBe('Put every roster account back to its scenario');
    expect(root.querySelector('#reset-hint')).toBeNull();
   });

   it('reloads the counts at once after Reset all, so the lines and buttons update',async()=>{
    let changed=3;
    const fixture=page(allowance());
    request.mockImplementation(async(path:string,body?:any)=>{
     if(String(path).endsWith('/reset')){changed=0;return {};}
     return path==='/admin/test-accounts/allowance'?allowance({changed}):path==='/admin/test-accounts'&&!body?listed:body?{}:{accounts:[],page:0,hasNext:false};
    });
    const root=await shown(fixture);const component=fixture.componentInstance;
    expect(action(root,'Reset all').disabled).toBe(false);
    action(root,'Reset all').click();fixture.detectChanges();
    component.rosterResetConfirmation='RESET ALL';await component.resetRoster();fixture.detectChanges();
    expect(action(root,'Reset all').disabled).toBe(true);
    expect(root.querySelector('#reset-hint')?.textContent).toBe('Nothing to reset: every roster account is at its scenario');
   });

   it('opens one panel at a time, full width under both cards, closes it on success and reports the result',async()=>{
    const fixture=layout(allowance());
    const root=await shown(fixture);const component=fixture.componentInstance;
    const panels=()=>[...root.querySelectorAll('.action-panel')];
    const underButtons=()=>{
     expect(panels()).toHaveLength(1);
     let sibling=root.querySelector('.test-cards')!.nextElementSibling;
     while(sibling&&!sibling.classList.contains('action-panel'))sibling=sibling.nextElementSibling;
     expect(sibling).toBe(panels()[0]);
     // The panel comes before the list.
     expect(panels()[0].compareDocumentPosition(root.querySelector('.directory-table')!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    };
    action(root,'Create test account').click();fixture.detectChanges();
    underButtons();expect(panels()[0].classList).toContain('create-panel');
    expect(action(root,'Create test account').getAttribute('aria-expanded')).toBe('true');
    action(root,'Restore 2').click();fixture.detectChanges();
    underButtons();expect(panels()[0].classList).toContain('roster-restore');expect(component.creating()).toBe(false);
    action(root,'Reset all').click();fixture.detectChanges();
    underButtons();expect(panels()[0].classList).toContain('roster-reset');expect(component.rosterRestore()).toBeNull();
    // Choosing a row's action closes the top panel too.
    component.select(listed[0] as any);fixture.detectChanges();
    expect(panels()).toHaveLength(0);
    // Create succeeds: the panel goes and the notice says what happened.
    action(root,'Create test account').click();fixture.detectChanges();
    request.mockImplementation(async(path:string,body?:any)=>body?{username:'test-1@lookahead.dev'}:path==='/admin/test-accounts/allowance'?allowance():path==='/admin/test-accounts'?listed:{accounts:[],page:0,hasNext:false});
    [...panels()[0].querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='Create account')!.click();
    await fixture.whenStable();fixture.detectChanges();
    expect(panels()).toHaveLength(0);
    expect(root.querySelector('.notice')?.textContent).toBe('test-1@lookahead.dev created. To use it, choose Switch to a test account in your account menu.');
    // Reset all succeeds: the panel goes and the notice reports it.
    action(root,'Reset all').click();fixture.detectChanges();
    component.rosterResetConfirmation='RESET ALL';await component.resetRoster();fixture.detectChanges();
    expect(panels()).toHaveLength(0);
    expect(component.notice()).toBe('All 3 roster accounts are back to their scenarios.');
   });

   it('keeps a failed panel open with the server message inside it',async()=>{
    const fixture=layout(allowance());
    const root=await shown(fixture);const component=fixture.componentInstance;
    action(root,'Create test account').click();fixture.detectChanges();
    request.mockRejectedValueOnce(new MembershipRequestError('Request body is not valid JSON',400));
    await component.create();fixture.detectChanges();
    expect(root.querySelector('.create-panel .panel-error')?.textContent).toBe('Request body is not valid JSON Creation was not confirmed. Retry; the same request key is reused.');
    expect(root.querySelector('.notice')?.textContent).toBe('');
    // Every reset refused: Reset all keeps its panel, with each reason inside it.
    action(root,'Reset all').click();fixture.detectChanges();
    expect(component.panelError()).toBe('');
    request.mockImplementation(async(path:string,body?:any)=>{
     if(String(path).endsWith('/reset'))throw new MembershipRequestError('Request body is not valid JSON',400);
     return path==='/admin/test-accounts/allowance'?allowance():path==='/admin/test-accounts'?listed:body?{}:{accounts:[],page:0,hasNext:false};
    });
    component.rosterResetConfirmation='RESET ALL';await component.resetRoster();fixture.detectChanges();
    expect(component.rosterReset()).toEqual({open:true,done:0,total:3});
    expect(root.querySelector('.roster-reset .panel-error')?.textContent).toContain('None reset. Not reset: learner01@lookahead.dev (Request body is not valid JSON)');
    expect(component.busy()).toBe(false);
   });

   it('lists every test account in one list with no kind-of-account tabs (owner, 2026-11-06); People keeps its role filter',async()=>{
    const fixture=layout(allowance());
    const root=await shown(fixture);
    expect(root.querySelector('.list-tabs')).toBeNull();
    expect([...root.querySelectorAll('tbody tr[data-account]')].map(tr=>tr.getAttribute('data-account'))).toEqual(['learner01@lookahead.dev','learner02@lookahead.dev','learner03@lookahead.dev']);
    expect(root.querySelector('.count')?.textContent).toBe('3 of 3');
    expect(root.querySelector('#test-account-list')?.hasAttribute('role')).toBe(false);
    fixture.componentInstance.query.set('02');fixture.detectChanges();
    expect(root.querySelector('.count')?.textContent).toBe('1 of 3');
    fixture.componentInstance.query.set('');fixture.componentRef.setInput('view','people');fixture.detectChanges();
    expect(root.querySelector('.directory-tools select')).not.toBeNull();
   });

   it('shows the Test accounts card across the row when there is no roster card',async()=>{
    account.set({accountId:'admin-1',username:'admin01',permissions:{feedbackRole:'admin',triageFeedback:true}});
    const root=await shown(layout({limit:10,used:1,remaining:9,roster:null,scenarios}));
    expect(root.querySelector('.test-cards')?.classList).toContain('single');
    expect(root.querySelector('.roster-card')).toBeNull();
    expect(labels(root,'.test-card .card-actions')).toEqual(['Refresh','Create test account']);
    expect(root.querySelector('.lifetime')?.textContent?.replace(/\s+/g,' ')).toContain('1 used · 9 remaining of 10');
   });
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
   // Learners only (owner, 2026-11-04): the admin scenario is never offered, even to the owner.
   expect([...panel.querySelectorAll('option')].map(option=>option.textContent)).toEqual(['learner01 · Free · no study plan','learner05 · Learn · active · ready-made plan · in progress']);
   expect(panel.querySelector('.learner-only')?.textContent).toBe('New test accounts are learners. Staff test accounts come from the roster.');
   expect(panel.textContent).not.toContain('roles up to your own');
   expect(panel.querySelector('input[type="password"]')).toBeNull();
   expect(component.mayCreate()).toBe(true);
   component.createScenario='learner05';
   request.mockImplementation(async(path:string,body?:any)=>body?{username:'test-0a1b2c3d4e@lookahead.dev'}:path==='/admin/test-accounts/allowance'?{limit:10,used:1,remaining:9,scenarios}:[]);
   await component.create();
   const call=request.mock.calls.find(([path,body])=>path==='/admin/test-accounts'&&body)!;
   expect(call[1]).toEqual({key:expect.any(String),scenario:'learner05'});
   expect(component.notice()).toBe('test-0a1b2c3d4e@lookahead.dev created. To use it, choose Switch to a test account in your account menu.');
   component.creating.set(true);
   request.mockRejectedValueOnce(new Error('uncertain'));
   await component.create();
   expect(component.panelError()).toBe('uncertain Creation was not confirmed. Retry; the same request key is reused.');
   expect(component.creating()).toBe(true);
   component.createScenario='';
   expect(component.mayCreate()).toBe(false);
  });

  it('every role picks from learner scenarios only, and a staff scenario is never sent (DLV-969, owner 2026-11-04)',async()=>{
   const staffScenarios=[...scenarios,{id:'coauthor',label:'Co-author with the full curriculum',roles:['co-author']},{id:'reviewer',label:'Reviewer',roles:['reviewer']}];
   for(const feedbackRole of ['owner','co-author','admin']){
    account.set({accountId:feedbackRole+'-1',permissions:{feedbackRole,manageAccess:feedbackRole==='owner',triageFeedback:true}});
    const fixture=page({limit:10,used:0,remaining:10,roster:null,scenarios:staffScenarios});
    const root=await shown(fixture);const component=fixture.componentInstance;
    component.creating.set(true);fixture.detectChanges();
    expect([...root.querySelectorAll('.reset-panel option')].map(option=>option.getAttribute('value'))).toEqual(['learner01','learner05']);
    expect(component.learnerScenarios().map(scenario=>scenario.id)).toEqual(['learner01','learner05']);
    // A staff scenario chosen some other way is not sent.
    component.createScenario='admin';
    expect(component.mayCreate()).toBe(false);
    await component.create();
    expect(request.mock.calls.some(([path,body])=>path==='/admin/test-accounts'&&body)).toBe(false);
   }
  });

  it('shows the server\'s learner-only refusal in its own words',async()=>{
   const fixture=page({limit:10,used:0,remaining:10,roster:null,scenarios});
   const root=await shown(fixture);const component=fixture.componentInstance;
   component.creating.set(true);fixture.detectChanges();
   request.mockRejectedValueOnce(new MembershipRequestError('Only learner test accounts can be created. Staff test accounts come from the roster.',403));
   await component.create();fixture.detectChanges();
   // The panel stays open with the refusal inside it (owner, DEV test 2026-11-04).
   expect(component.panelError()).toBe('Only learner test accounts can be created. Staff test accounts come from the roster.');
   expect(root.querySelector('.create-panel .panel-error')?.textContent).toBe('Only learner test accounts can be created. Staff test accounts come from the roster.');
   expect(root.querySelector('.notice')?.textContent).not.toContain('Only learner test accounts');
   expect(component.creating()).toBe(true);
   // A refusal is final: the next try is a new request.
   expect(component.createKey()).toBeNull();
   expect(component.busy()).toBe(false);
  });
 });
});

describe('People sign-in methods (DLV-969 account linking)',()=>{
 const real=(id:string,extra:object={})=>({accountId:id,username:id,displayName:'Person '+id,email:id+'@gmail.com',roles:['user'],testAccount:false,fullCurriculum:false,access:{label:'Free',labels:['Free'],grantedCourseIds:[]},...extra});
 const directory={accounts:[
  real('linked',{sameEmailAccounts:1,signInMethods:[{provider:'cognito',email:'linked@gmail.com'},{provider:'google',email:'linked@gmail.com'}]}),
  real('google-only',{sameEmailAccounts:0,signInMethods:[{provider:'google',email:'google-only@gmail.com'}]}),
  real('older'),
 ],page:0,hasNext:false};
 async function render(feedbackRole:'owner'|'co-author'){
  const request=vi.fn(async(path:string)=>path.startsWith('/admin/accounts')?directory:path==='/admin/test-accounts'?[row]:[]);
  const account=signal<any>({accountId:'me',username:'author',topicGrants:[],permissions:{manageAccess:feedbackRole==='owner',feedbackRole}});
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  const fixture=TestBed.createComponent(TestAccounts);fixture.componentRef.setInput('view','people');
  await fixture.componentInstance.load();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  return {root:fixture.nativeElement as HTMLElement,request};
 }
 const person=(root:HTMLElement,id:string)=>root.querySelector(`tr[data-account="Person ${id}"] th[data-label="Person"]`) as HTMLElement|null;
 it('shows the owner each person\'s methods as plain labels and flags the same Gmail',async()=>{
  const {root}=await render('owner');
  const linked=person(root,'linked')!;
  expect([...linked.querySelectorAll('.method-label')].map(label=>label.textContent)).toEqual(['Google','Password']);
  expect(linked.querySelector('.same-email-flag')?.textContent?.trim()).toBe('⚠ Same Gmail as 1 other account');
  const google=person(root,'google-only')!;
  expect([...google.querySelectorAll('.method-label')].map(label=>label.textContent)).toEqual(['Google']);
  expect(google.querySelector('.same-email-flag')).toBeNull();
  // An older Domain sends neither: the row stays as it was.
  expect(person(root,'older')!.querySelector('.sign-in-labels, .same-email-flag')).toBeNull();
  // Passive labels, never buttons or links.
  expect(root.querySelector('.sign-in-labels button, .sign-in-labels a')).toBeNull();
 });
 it('gives other operators no identity data: no directory, no methods, no flag',async()=>{
  const {root,request}=await render('co-author');
  expect(request.mock.calls.some(([path])=>String(path).startsWith('/admin/accounts'))).toBe(false);
  expect(root.querySelector('.sign-in-labels, .same-email-flag')).toBeNull();
  expect(root.textContent).not.toContain('@gmail.com');
 });
});

describe('People GitHub accounts (DLV-969, owner 2026-11-05)',()=>{
 const real=(id:string,extra:object={})=>({accountId:id,username:id,displayName:'Person '+id,email:null,roles:['user'],testAccount:false,fullCurriculum:false,access:{label:'Free',labels:['Free'],grantedCourseIds:[]},...extra});
 const directory={accounts:[real('given',{github:'https://github.com/given-person'}),real('none',{github:null}),real('older')],page:0,hasNext:false};
 async function render(feedbackRole:'owner'|'co-author'){
  const request=vi.fn(async(path:string)=>path.startsWith('/admin/accounts')?directory:path==='/admin/test-accounts'?[row]:[]);
  const account=signal<any>({accountId:'me',username:'author',topicGrants:[],permissions:{manageAccess:feedbackRole==='owner',feedbackRole}});
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  const fixture=TestBed.createComponent(TestAccounts);fixture.componentRef.setInput('view','people');
  await fixture.componentInstance.load();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  return {root:fixture.nativeElement as HTMLElement,fixture};
 }
 const person=(root:HTMLElement,id:string)=>root.querySelector(`tr[data-account="Person ${id}"] th[data-label="Person"]`) as HTMLElement|null;
 afterEach(()=>vi.restoreAllMocks());
 it('shows the owner each GitHub account as a link with Copy, or Not given',async()=>{
  const writeText=vi.fn(async()=>undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  const {root,fixture}=await render('owner');
  const given=person(root,'given')!.querySelector('.github-line')!;
  expect(given.querySelector('.github-label')?.textContent).toBe('GitHub');
  const link=given.querySelector('a')!;
  expect([link.getAttribute('href'),link.textContent,link.getAttribute('rel'),link.getAttribute('target')]).toEqual(['https://github.com/given-person','github.com/given-person','noopener noreferrer','_blank']);
  const copy=given.querySelector('button.copy-github') as HTMLButtonElement;
  expect([copy.textContent?.trim(),copy.getAttribute('aria-label')]).toEqual(['Copy','Copy the GitHub address of Person given']);
  copy.click();await fixture.whenStable();fixture.detectChanges();
  expect(writeText).toHaveBeenCalledWith('https://github.com/given-person');
  expect(copy.textContent?.trim()).toBe('Copied');
  expect(person(root,'none')!.querySelector('.github-missing')?.textContent).toBe('Not given');
  expect(person(root,'older')!.querySelector('.github-line')).toBeNull();
 });
 it('keeps the link to select when the clipboard is refused',async()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn(async()=>{throw new Error('denied');})}});
  const {root,fixture}=await render('owner');
  const copy=person(root,'given')!.querySelector('button.copy-github') as HTMLButtonElement;
  copy.click();await fixture.whenStable();fixture.detectChanges();
  expect(copy.textContent?.trim()).toBe('Copy');
  expect(person(root,'given')!.querySelector('a')).not.toBeNull();
  await fixture.componentInstance.copyGithub({key:'x',github:null} as never);
  expect(fixture.componentInstance.copiedGithub()).toBeNull();
 });
 it('gives other operators no GitHub accounts at all',async()=>{
  const {root}=await render('co-author');
  expect(root.querySelector('.github-line')).toBeNull();
  expect(root.textContent).not.toContain('github.com');
 });
});

// DLV-969 (owner, 2026-11-04): DEV test accounts' purchases wait in People and access for the owner or an admin.
// DLV-969 (owner, DEV test 2026-11-04): the requests themselves moved to Waiting for access → Purchase requests
// (purchase-requests-panel.spec.ts); Test accounts keeps only the badge on each waiting account.
describe('Purchase requests on Test accounts',()=>{
 const waiting=(id:string,username:string,pendingPurchase:Record<string,unknown>|null):TestAccountRow=>({...row,accountId:id,username,pendingPurchase:pendingPurchase as never});
 const advance={purchaseId:'pur-2',kind:'upgrade',fromPlan:{code:'learn',name:'Learn'},toPlan:{code:'advance',name:'Advance'},priceCents:14499,requestedAt:'2026-11-04T10:30:00Z',requestedBy:{self:false,label:'Admin 2'}};
 let rows:TestAccountRow[];let request:ReturnType<typeof vi.fn>;
 async function render(feedbackRole:'owner'|'admin'|'co-author'|'user'){
  request=vi.fn(async(path:string)=>path==='/admin/test-accounts'?rows:path==='/admin/test-accounts/allowance'?{limit:10,used:0,remaining:10,roster:null,scenarios:[]}:{accounts:[],page:0,hasNext:false});
  const account=signal<any>({accountId:'me',username:'staff',displayName:'Staff',topicGrants:[],permissions:{manageAccess:feedbackRole==='owner',triageFeedback:feedbackRole==='owner'||feedbackRole==='admin',feedbackRole}});
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  TestBed.inject(DevSession).status.set({dev:true,deadline:'',warning:false,maintenance:false});
  const fixture=TestBed.createComponent(TestAccounts);fixture.componentRef.setInput('view','test');
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
 }
 const text=(element:Element|null|undefined)=>(element?.textContent??'').replace(/\s+/g,' ').trim();
 beforeEach(()=>{rows=[waiting('acc-12','learner12',advance),waiting('acc-03','learner03',null)];});
 for(const role of ['owner','admin'] as const){
  it(`marks the ${role}’s waiting accounts in the list, with no request section on this tab`,async()=>{
   const root=await render(role);
   expect(text(root.querySelector('tr[data-account="learner12"] .request-badge'))).toBe('Purchase request waiting');
   expect(root.querySelector('tr[data-account="learner03"] .request-badge')).toBeNull();
   expect(root.querySelector('.purchase-requests, .request-item, .decision-result')).toBeNull();
   expect(root.textContent).not.toContain('Approve (mock payment)');
  });
 }
 for(const role of ['co-author','user'] as const){
  it(`shows a ${role} nothing of purchase requests, even if a row carries one`,async()=>{
   const root=await render(role);
   expect(root.querySelector('.request-badge')).toBeNull();
   expect(root.textContent).not.toMatch(/Purchase request/);
  });
 }
});

// DLV-969 (owner, 2026-11-04): an approved request marks the test account; Reset is reserved for the owner and the upgrader.
describe('Upgrade markers and Reset on Test accounts',()=>{
 const upgraded=(by:Record<string,unknown>,approvedBy:Record<string,unknown>|null=null)=>({...by,approvedBy,plan:{code:'grow',name:'Grow'},kind:'upgrade',approvedAt:'2026-11-04T10:30:00Z'});
 let rows:TestAccountRow[];let request:ReturnType<typeof vi.fn>;
 async function render(feedbackRole:'owner'|'admin'|'co-author',options:{dev?:boolean}={}){
  request=vi.fn(async(path:string)=>{
   if(path==='/admin/test-accounts')return rows;
   if(path==='/admin/test-accounts/allowance')return {limit:10,used:0,remaining:10,roster:null,scenarios:[]};
   if(path.endsWith('/reset'))return {};
   return {accounts:[],page:0,hasNext:false};
  });
  const account=signal<any>({accountId:'me',username:'staff',displayName:'Staff',topicGrants:[],permissions:{manageAccess:feedbackRole==='owner',triageFeedback:feedbackRole!=='co-author',feedbackRole}});
  TestBed.configureTestingModule({providers:[provideRouter([]),{provide:MembershipApi,useValue:{request}},{provide:StudyPlanAccount,useValue:{account}}]});
  if(options.dev??true)TestBed.inject(DevSession).status.set({dev:true,deadline:'',warning:false,maintenance:false});
  const fixture=TestBed.createComponent(TestAccounts);fixture.componentRef.setInput('view','test');
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  return fixture;
 }
 const text=(element:Element|null|undefined)=>(element?.textContent??'').replace(/\s+/g,' ').trim();
 const actions=(root:Element)=>[...root.querySelectorAll('.selection-actions button')].map(text);
 function pick(fixture:ReturnType<typeof TestBed.createComponent<TestAccounts>>,username:string){
  const list=fixture.componentInstance;list.choose(list.visible().find(row=>row.name===username)!);fixture.detectChanges();
 }
 beforeEach(()=>{rows=[
  {...row,accountId:'acc-06',username:'learner06',upgradedBy:upgraded({self:false,label:'Admin 2',name:'Priya Rao'},{self:true,label:'Owner'}),canReset:true},
  {...row,accountId:'acc-07',username:'learner07',upgradedBy:upgraded({self:true,label:'Admin 2'},{self:true,label:'Admin 2'}),canReset:false},
  {...row,accountId:'acc-08',username:'learner08'},
 ];});

 it('shows the owner who upgraded each account, with the name, and who approved it when someone else did',async()=>{
  const root=(await render('owner')).nativeElement as HTMLElement;
  expect(text(root.querySelector('tr[data-account="learner06"] .upgrade-badge'))).toBe('Upgraded by Priya Rao (Admin 2) · Grow · 4 Nov');
  expect(text(root.querySelector('tr[data-account="learner06"] .approved-by'))).toBe('approved by you');
  expect(text(root.querySelector('tr[data-account="learner07"] .upgrade-badge'))).toBe('Upgraded by You · Grow · 4 Nov');
  expect(root.querySelector('tr[data-account="learner07"] .approved-by')).toBeNull();
  expect(root.querySelector('tr[data-account="learner08"] .upgrade-marker')).toBeNull();
 });

 it('shows an admin the role label only',async()=>{
  const root=(await render('admin')).nativeElement as HTMLElement;
  expect(text(root.querySelector('tr[data-account="learner06"] .upgrade-badge'))).toBe('Upgraded by Admin 2 · Grow · 4 Nov');
  expect(root.textContent).not.toContain('Priya Rao');
 });

 it('offers Reset to its scenario only when the row allows it, falling back to today’s rule without canReset',async()=>{
  const fixture=await render('admin');const root=fixture.nativeElement as HTMLElement;const list=fixture.componentInstance;
  pick(fixture,'learner06');expect(actions(root)).toContain('Reset to its scenario');
  pick(fixture,'learner07');expect(actions(root)).not.toContain('Reset to its scenario');
  // canReset false: nothing opens even when asked directly.
  list.select(rows[1]);expect(list.selected()).toBeNull();
  pick(fixture,'learner08');expect(actions(root)).toContain('Reset to its scenario');
  TestBed.resetTestingModule();
  const coauthor=await render('co-author');pick(coauthor,'learner08');
  expect(actions(coauthor.nativeElement)).not.toContain('Reset to its scenario');
  // The row's own answer wins over the role: a co-author the Domain allows sees it.
  coauthor.componentInstance.rows.update(all=>all.map(item=>item.accountId==='acc-08'?{...item,canReset:true}:item));
  coauthor.detectChanges();expect(actions(coauthor.nativeElement)).toContain('Reset to its scenario');
 });

 it('explains the reset to its scenario and keeps the typed username',async()=>{
  const fixture=await render('owner');const root=fixture.nativeElement as HTMLElement;const list=fixture.componentInstance;
  pick(fixture,'learner06');
  [...root.querySelectorAll<HTMLButtonElement>('.selection-actions button')].find(button=>text(button)==='Reset to its scenario')!.click();
  fixture.detectChanges();
  const panel=root.querySelector('.reset-panel')!;
  expect(text(panel.querySelector('legend'))).toBe('Reset learner06 to its scenario');
  expect(text(panel.querySelector('.reset-explanation'))).toBe('Puts it back exactly as its scenario starts: plan, purchases and study plan. Clears the upgrade marker.');
  expect(text(panel.querySelector('label:last-of-type'))).toContain('Type learner06 to confirm');
  await list.reset();expect(request).not.toHaveBeenCalledWith(expect.stringMatching(/\/reset$/),expect.anything());
  list.confirmation='learner06';await list.reset();
  expect(request).toHaveBeenCalledWith('/admin/test-accounts/acc-06/reset',expect.objectContaining({confirmation:'learner06',preset:'scenario'}));
  expect(list.notice()).toBe('learner06 reset.');
 });

 it('says the RESET_RESERVED refusal in the server’s words and does not offer the same reset again',async()=>{
  const fixture=await render('admin');const list=fixture.componentInstance;
  list.select(rows[0]);list.confirmation='learner06';
  request.mockRejectedValueOnce(new MembershipRequestError('Only the owner or Admin 2, who upgraded this account, can reset it.',403,'RESET_RESERVED'));
  await list.reset();
  // The panel stays with the reason inside it; the same reset is not offered again (no retry request kept).
  expect(list.panelError()).toBe('Only the owner or Admin 2, who upgraded this account, can reset it.');
  expect(list.notice()).toBe('');
  expect(list.pending()).toBeNull();expect(list.selected()).toBe(rows[0]);
 });

 it('keeps the Local wording for Reset',async()=>{
  const fixture=await render('owner',{dev:false});const root=fixture.nativeElement as HTMLElement;
  pick(fixture,'learner08');expect(actions(root)).toContain('Reset');
  fixture.componentInstance.select(rows[2]);fixture.detectChanges();
  expect(text(root.querySelector('.reset-panel legend'))).toBe('Reset learner08');
  expect(root.querySelector('.reset-explanation')).toBeNull();
 });
});
