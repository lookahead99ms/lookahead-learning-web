import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  ACTIVE_SIGN_INS_CLIENT,
  ActiveSignIn,
  ActiveSignInInventory,
  SignInManagementError,
} from './active-sign-ins-client';

@Component({
  selector: 'app-active-sign-ins',
  imports: [DatePipe],
  templateUrl: './active-sign-ins.html',
  styleUrl: './active-sign-ins.css',
})
export class ActiveSignIns implements OnDestroy {
  private readonly client = inject(ACTIVE_SIGN_INS_CLIENT);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly owner = this.accounts.account()?.accountId;
  private destroyed = false;
  protected readonly inventory = signal<ActiveSignInInventory | null>(null);
  protected readonly loading = signal(true);
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected readonly status = signal('');
  protected readonly editing = signal<ActiveSignIn | null>(null);
  protected readonly labelDraft = signal('');
  protected readonly confirmation = signal<ActiveSignIn | 'others' | null>(null);
  protected readonly reauthenticationRequired = signal(false);
  protected readonly currentPassword = signal('');
  protected readonly passwordVisible = signal(false);
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private trigger: HTMLButtonElement | null = null;
  private deferredFocus: (() => HTMLElement | null | undefined) | null = null;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly errorElement = viewChild<ElementRef<HTMLElement>>('errorElement');
  private readonly labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  constructor() {
    void this.load();
  }

  protected name(signIn: ActiveSignIn): string {
    return signIn.label || signIn.clientDescription;
  }

  protected hasOtherSignIns(): boolean {
    return this.inventory()?.signIns.some((signIn) => !signIn.current) ?? false;
  }

  protected currentSignOutMessage(): string {
    const others = this.inventory()?.signIns.filter((signIn) => !signIn.current).length ?? 0;
    const remaining =
      others === 0
        ? 'You have no other active sign-ins.'
        : others === 1
          ? 'Your other sign-in stays active.'
          : `Your other ${others} sign-ins stay active.`;
    return `This browser session will end. ${remaining}`;
  }

  protected async load(trigger?: HTMLButtonElement): Promise<void> {
    if (this.pending()) return;
    this.loading.set(true);
    this.error.set('');
    if (trigger) this.status.set('');
    try {
      const inventory = await this.client.load();
      if (this.currentOwner()) {
        this.inventory.set(inventory);
        if (trigger) this.status.set('Active sign-ins refreshed.');
      }
    } catch (error) {
      if (this.currentOwner()) this.error.set(this.message(error));
    } finally {
      if (!this.destroyed) {
        this.loading.set(false);
        if (trigger && this.currentOwner()) {
          // Disabling the focused button can send focus to the document body.
          // Restore it after the enabled control has rendered, including on failure.
          this.focus(() =>
            this.currentOwner()
              ? trigger.isConnected
                ? trigger
                : this.heading()?.nativeElement
              : null,
          );
        }
      }
    }
  }

  protected edit(signIn: ActiveSignIn, trigger: HTMLButtonElement): void {
    if (this.pending()) return;
    this.trigger = trigger;
    this.confirmation.set(null);
    this.editing.set(signIn);
    this.labelDraft.set(signIn.label ?? '');
    this.error.set('');
    this.status.set('');
    this.focus(() => this.labelInput()?.nativeElement);
  }

  protected cancel(): void {
    if (this.pending()) return;
    this.editing.set(null);
    this.labelDraft.set('');
    this.confirmation.set(null);
    this.error.set('');
    this.reauthenticationRequired.set(false);
    this.currentPassword.set('');
    this.passwordVisible.set(false);
    this.focus(() => (this.trigger?.isConnected ? this.trigger : this.heading()?.nativeElement));
  }

  protected confirm(signIn: ActiveSignIn | 'others', trigger: HTMLButtonElement): void {
    if (this.pending()) return;
    this.trigger = trigger;
    this.editing.set(null);
    this.labelDraft.set('');
    this.confirmation.set(signIn);
    this.error.set('');
    this.status.set('');
    this.focus(() => this.confirmButton()?.nativeElement);
  }

  protected async saveLabel(): Promise<void> {
    const signIn = this.editing();
    if (!signIn || this.pending() || !this.currentOwner()) return;
    const label = this.labelDraft().trim();
    if (Array.from(label).length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(label)) {
      this.error.set(
        'Use up to 80 characters without control characters, or leave the label empty.',
      );
      this.focus(() => this.errorElement()?.nativeElement);
      return;
    }
    await this.mutate(async () => {
      const inventory = await this.client.rename(signIn.id, label);
      if (!this.currentOwner()) return;
      this.inventory.set(inventory);
      this.editing.set(null);
      this.labelDraft.set('');
      this.status.set(label ? 'Sign-in label saved.' : 'Sign-in label removed.');
      this.focus(() => (this.trigger?.isConnected ? this.trigger : this.heading()?.nativeElement));
    });
  }

  protected async signOut(): Promise<void> {
    const target = this.confirmation();
    if (!target || this.pending() || !this.currentOwner()) return;
    await this.mutate(async () => {
      if (target === 'others') {
        const inventory = await this.client.revokeOthers();
        if (!this.currentOwner()) return;
        this.inventory.set(inventory);
        this.status.set('Other sign-ins have been signed out. This sign-in stays active.');
      } else {
        const result = await this.client.revoke(target.id);
        if (this.destroyed) return;
        if (result.signedOut) {
          await this.router.navigate(['/sign-in']);
          return;
        }
        if (!this.currentOwner()) return;
        if (!result.inventory) throw new SignInManagementError('unconfirmed');
        this.inventory.set(result.inventory);
        this.status.set('The selected sign-in has been signed out. This sign-in stays active.');
      }
      this.confirmation.set(null);
      this.focus(() => this.heading()?.nativeElement);
    });
  }

  protected async reauthenticate(): Promise<void> {
    if (this.pending() || !this.currentOwner() || !this.currentPassword()) return;
    const password = this.currentPassword();
    this.currentPassword.set('');
    this.passwordVisible.set(false);
    await this.mutate(async () => {
      await this.client.reauthenticate(password);
      if (!this.currentOwner()) return;
      this.reauthenticationRequired.set(false);
      this.status.set('Identity confirmed. Review your change and submit it again.');
      this.focus(
        () =>
          this.confirmButton()?.nativeElement ??
          this.labelInput()?.nativeElement ??
          this.heading()?.nativeElement,
      );
    });
  }

  private async mutate(action: () => Promise<void>): Promise<void> {
    this.pending.set(true);
    this.error.set('');
    this.status.set('');
    try {
      await action();
    } catch (error) {
      if (this.currentOwner()) {
        this.error.set(this.message(error));
        if (error instanceof SignInManagementError && error.kind === 'reauthentication-required') {
          this.reauthenticationRequired.set(true);
          this.focus(() => this.passwordInput()?.nativeElement);
        } else {
          this.focus(() => this.errorElement()?.nativeElement);
        }
      }
    } finally {
      if (!this.destroyed) {
        this.pending.set(false);
        const focusTarget = this.deferredFocus;
        this.deferredFocus = null;
        if (focusTarget) this.focus(focusTarget);
      }
    }
  }

  private message(error: unknown): string {
    switch (error instanceof SignInManagementError ? error.kind : 'unconfirmed') {
      case 'expired':
        return 'Your sign-in expired. Sign in again to manage active sign-ins.';
      case 'reauthentication-required':
        return 'Confirm your current password before making this change. Your current sign-in stays active.';
      case 'reauthentication-rejected':
        return 'We could not confirm your password. Re-enter it to try again. Your current sign-in stays active.';
      case 'invalid-label':
        return 'We could not use that label. Your draft is still here; check it and try again.';
      case 'changed':
        return 'The active sign-ins changed. Refresh the list before trying again.';
      case 'rate-limited':
        return 'Too many attempts. Wait a few minutes, then try again.';
      case 'unavailable':
        return 'Active sign-ins are unavailable. Your draft is still here. Try again when the service is available.';
      default:
        return 'We could not confirm the result. Refresh the list to check before trying again.';
    }
  }

  private currentOwner(): boolean {
    return (
      !this.destroyed &&
      this.accounts.account()?.accountId === this.owner &&
      !this.accounts.sessionExpired()
    );
  }

  private focus(element: () => HTMLElement | null | undefined): void {
    if (this.pending()) {
      this.deferredFocus = element;
      return;
    }
    afterNextRender(
      () => {
        if (!this.destroyed) element()?.focus();
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.labelDraft.set('');
    this.currentPassword.set('');
    this.passwordVisible.set(false);
  }
}
