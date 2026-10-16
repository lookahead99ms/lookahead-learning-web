import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AccessLevels, AccessLevelsService, parseAccessLevels } from '../../content/access-levels';
import { CourseOutline } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { StudyAccount, StudyPlanAccount } from '../study-plan/study-plan-account';
import { Module } from './module';

/**
 * DLV-942: a module page names its unit's access level in plain text.
 * DLV-209: the line depends on who is looking.
 */
const outline: CourseOutline = {
  id: 'system-design',
  path: 'blaze',
  title: 'System Design',
  description: 'Design systems.',
  version: '1',
  layout: 'learning-map',
  modules: [
    { id: 'method', order: 1, title: 'Interview Method', description: 'Method.' },
    { id: 'method-practice', order: 2, title: 'Method Practice', description: 'Practice.' },
    { id: 'caching', order: 3, title: 'Caching', description: 'Caching.' },
    { id: 'orphan', order: 4, title: 'Orphan', description: 'No unit.' },
  ],
  learningUnits: [
    {
      id: 'interview-method',
      title: 'Interview Method',
      description: 'Method.',
      theoryModuleId: 'method',
      practiceModuleId: 'method-practice',
    },
    { id: 'caching', title: 'Caching', description: 'Caching.', theoryModuleId: 'caching' },
  ],
  questions: [],
  moduleDetailRefs: [],
};

const levels = parseAccessLevels({
  schemaVersion: 'content-access-levels/v1',
  policyVersion: 'test',
  defaultLevel: 'pro',
  units: { 'blaze/system-design/interview-method': 'open' },
});

describe('Module access label', () => {
  async function render(
    url: string,
    published: AccessLevels | null,
    account: Partial<StudyAccount> | null = null,
  ) {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'blaze/:courseId/module/:moduleId', component: Module, data: { pathId: 'blaze' } },
        ]),
        {
          provide: ContentService,
          useValue: {
            getCatalog: () => of([{ id: 'system-design', title: 'System Design' }]),
            getCourseOutline: () => of(outline),
          },
        },
        {
          provide: AccessLevelsService,
          useValue: { levels$: of(published), levels: signal(published) },
        },
      ],
    }).compileComponents();
    if (account)
      TestBed.inject(StudyPlanAccount).account.set({
        accountId: 'a1',
        username: 'learner',
        displayName: 'Learner',
        topicGrants: [],
        ...account,
      });
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  it('labels a practice module with its unit level', async () => {
    const root = await render('/blaze/system-design/module/method-practice', levels);
    const label = root.querySelector<HTMLElement>('.module-access');
    expect(label?.textContent?.trim()).toBe('Access: Open');
    expect(label?.dataset['accessLevel']).toBe('open');
  });

  it('labels a unit the policy does not list as Paid plan for a signed-out visitor', async () => {
    const root = await render('/blaze/system-design/module/caching', levels);
    expect(root.querySelector('.module-access')?.textContent?.trim()).toBe('Access: Paid plan');
  });

  it('shows a signed-in learner without course access only Paid plan', async () => {
    const paid = await render('/blaze/system-design/module/caching', levels, { topicGrants: [] });
    expect(paid.querySelector('.module-access')?.textContent?.trim()).toBe('Access: Paid plan');
    TestBed.resetTestingModule();
    const open = await render('/blaze/system-design/module/method', levels, { topicGrants: [] });
    expect(open.querySelector('.module-access')).toBeNull();
  });

  it('shows no line to a learner who can open the course, including legacy grants', async () => {
    const root = await render('/blaze/system-design/module/caching', levels, {
      topicGrants: ['look-ahead:system-design'],
    });
    expect(root.querySelector('.module-access')).toBeNull();
  });

  it('shows no label for a module outside any unit or without published levels', async () => {
    expect((await render('/blaze/system-design/module/orphan', levels)).querySelector('.module-access')).toBeNull();
    TestBed.resetTestingModule();
    expect((await render('/blaze/system-design/module/method', null)).querySelector('.module-access')).toBeNull();
  });
});
