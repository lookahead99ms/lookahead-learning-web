import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { SignInChallengePage } from './sign-in-challenge';
import { SIGN_IN_CHALLENGE_CLIENT, SignInChallenge } from './sign-in-challenge-client';
import { SignInManagementError } from './active-sign-ins-client';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

const challenge: SignInChallenge = {
  limit: 2,
  expiresAt: '2026-09-19T14:10:00Z',
  signIns: [
    {
      id: 'opaque-one',
      current: false,
      label: null,
      clientDescription: 'Chrome on macOS',
      createdAt: '2026-09-18T12:00:00Z',
      lastActiveAt: '2026-09-19T12:00:00Z',
    },
    {
      id: 'opaque-two',
      current: false,
      label: 'Home browser',
      clientDescription: 'Safari on iOS',
      createdAt: '2026-09-18T13:00:00Z',
      lastActiveAt: '2026-09-19T13:00:00Z',
    },
  ],
};

describe('Restricted third-sign-in chooser', () => {
  let fixture: ComponentFixture<SignInChallengePage>;
  let client: {
    loadChallenge: ReturnType<typeof vi.fn>;
    replace: ReturnType<typeof vi.fn>;
    cancelChallenge: ReturnType<typeof vi.fn>;
  };
  let returnTo: string;
  beforeEach(() => {
    returnTo = '/study-plan?plan=owned#schedule';
    client = {
      loadChallenge: vi.fn().mockResolvedValue(structuredClone(challenge)),
      replace: vi.fn().mockResolvedValue({ oauth: false }),
      cancelChallenge: vi.fn().mockResolvedValue(undefined),
    };
  });
  async function mount() {
    TestBed.configureTestingModule({
      imports: [SignInChallengePage],
      providers: [
        provideRouter([]),
        { provide: SIGN_IN_CHALLENGE_CLIENT, useValue: client },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ returnTo }) } },
        },
      ],
    });
    const initialize = vi.spyOn(TestBed.inject(StudyPlanAccount), 'initialize');
    fixture = TestBed.createComponent(SignInChallengePage);
    await settle();
    expect(initialize).not.toHaveBeenCalled();
  }
  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function button(text: string) {
    const result = [
      ...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
    ].find((button) => button.textContent?.trim() === text);
    expect(result, text).toBeDefined();
    return result!;
  }
  function choose(index: number) {
    const choice = fixture.nativeElement.querySelectorAll('input[type="radio"]')[
      index
    ] as HTMLInputElement;
    choice.click();
    fixture.detectChanges();
  }
  it('shows only restricted choices, with no protected navigation, identity, raw IDs or preselection', async () => {
    await mount();
    expect(fixture.nativeElement.textContent).toContain('2 of 2 active sign-ins');
    expect(fixture.nativeElement.querySelector('app-platform-header')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('a')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toMatch(
      /opaque-one|opaque-two|Manage account|Study Plan|Search|learner@example/,
    );
    expect(fixture.nativeElement.querySelectorAll('input:checked')).toHaveLength(0);
    expect(button('End selected sign-in and continue').disabled).toBe(true);
    expect(client.replace).not.toHaveBeenCalled();
    expect(client.cancelChallenge).not.toHaveBeenCalled();
  });
  it('replaces only the explicit selection and continues only after admission acknowledgement', async () => {
    await mount();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    let admit!: (value: { oauth: boolean }) => void;
    client.replace.mockReturnValue(
      new Promise<{ oauth: boolean }>((resolve) => {
        admit = resolve;
      }),
    );
    choose(1);
    button('End selected sign-in and continue').click();
    fixture.detectChanges();
    expect(client.replace).toHaveBeenCalledExactlyOnceWith('opaque-two');
    expect(navigate).not.toHaveBeenCalled();
    expect(button('Cancel sign-in').disabled).toBe(true);
    admit({ oauth: false });
    await settle();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/study-plan?plan=owned#schedule');
  });
  it('cancels the challenge without selecting or revoking an existing sign-in', async () => {
    await mount();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button('Cancel sign-in').click();
    await settle();
    expect(client.cancelChallenge).toHaveBeenCalledExactlyOnceWith();
    expect(client.replace).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/sign-in'], {
      queryParams: { returnTo },
      state: { signInCanceled: true },
    });
  });
  it('preserves the selection and gives focused safe feedback on a failed replacement', async () => {
    client.replace.mockRejectedValue(new Error('private transport response'));
    await mount();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    choose(0);
    button('End selected sign-in and continue').click();
    await settle();
    expect(fixture.nativeElement.querySelectorAll('input:checked')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('could not confirm this request');
    expect(fixture.nativeElement.textContent).not.toContain('private transport response');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[role="alert"]'));
    expect(navigate).not.toHaveBeenCalled();
  });
  it('does not imply cancellation succeeded when its acknowledgement is lost', async () => {
    client.cancelChallenge.mockRejectedValue(new Error('uncertain'));
    await mount();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    button('Cancel sign-in').click();
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('could not confirm this request');
    expect(client.replace).not.toHaveBeenCalled();
  });
  it('removes expired choices and offers an explicit fresh sign-in', async () => {
    client.loadChallenge.mockRejectedValue(new SignInManagementError('expired'));
    await mount();
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe(
      '/sign-in?returnTo=%2Fstudy-plan%3Fplan%3Downed%23schedule',
    );
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[role="alert"]'));
  });
  it.each([
    '/sign-in/choose',
    '/sign-in',
    '//outside.test',
    'https://outside.test',
    '/learn/../sign-in',
  ])('rejects looping or unsafe return %s', async (unsafe) => {
    returnTo = unsafe;
    await mount();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    choose(0);
    button('End selected sign-in and continue').click();
    await settle();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/');
  });
});
