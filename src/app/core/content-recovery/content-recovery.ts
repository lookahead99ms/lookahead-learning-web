import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { safeAccountReturn } from '../../pages/account/account-navigation';
import { CatalogId, plansIncluding } from '../../content/membership-plans';

export type RecoveryKind = 'sign-in' | 'locked' | 'planned' | 'temporary' | 'missing';
export interface RecoveryPreview {
  title?: string;
  description?: string;
  premium?: boolean;
  planned?: boolean;
}
export function recoveryKind(error: unknown, preview?: RecoveryPreview): RecoveryKind {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return 'sign-in';
  if (status === 403) return 'locked';
  if (status === 404) return preview?.planned ? 'planned' : 'missing';
  return 'temporary';
}

@Component({
  selector: 'app-content-recovery',
  imports: [RouterLink],
  templateUrl: './content-recovery.html',
  styleUrl: './content-recovery.css',
})
export class ContentRecovery {
  readonly kind = input<RecoveryKind>('temporary');
  readonly preview = input<RecoveryPreview>({});
  readonly destination = input('');
  readonly retry = output<void>();
  private readonly router = inject(Router);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('accessDialog');
  private readonly reopen = viewChild<ElementRef<HTMLButtonElement>>('reopen');
  protected readonly locked = computed(() => this.kind() === 'locked' || this.kind() === 'sign-in');
  protected readonly returnTo = computed(() =>
    safeAccountReturn(this.destination() || this.router.url),
  );
  protected readonly backUrl = this.router.parseUrl(
    safeAccountReturn(
      this.router.currentNavigation()?.previousNavigation?.finalUrl?.toString() ??
        this.router.lastSuccessfulNavigation()?.previousNavigation?.finalUrl?.toString() ?? '/',
    ),
  );
  protected readonly heading = computed(
    () =>
      ({
        'sign-in': 'Sign in to continue',
        locked: this.preview().premium ? 'Unlock this premium content' : 'Access required',
        planned: 'This lesson isn’t available yet',
        temporary: 'We couldn’t load this content',
        missing: 'We couldn’t find this page',
      })[this.kind()],
  );
  protected readonly description = computed(
    () =>
      ({
        'sign-in': 'Sign in to check your access. We’ll bring you back to this page.',
        locked: this.preview().premium
          ? 'This content requires eligible course access. Manage your account to review your current access and options.'
          : 'Your account can’t open this content. Manage your account to review your access.',
        planned: 'Explore other published lessons while this content is being prepared.',
        temporary: 'Please try again. You can also go back or explore from Home.',
        missing: 'The link may be out of date. Go back or explore from Home.',
      })[this.kind()],
  );
  /**
   * DLV-209: for premium content, the plans that include its catalog (read from the address,
   * /learn/... -> Learn). Everyone may see prices (user, 2026-10-15): signed-out visitors as well as
   * signed-in learners without access; buying still needs an account. Never shown for temporary,
   * missing or planned content.
   */
  protected readonly includedIn = computed(() => {
    if (!this.locked() || !this.preview().premium) return null;
    const catalog = (this.destination() || this.router.url).split(/[?#]/, 1)[0].split('/')[1];
    const plans = ['learn', 'grow', 'blaze'].includes(catalog)
      ? plansIncluding(catalog as CatalogId)
      : null;
    if (!plans) return null;
    const names = plans.names.length < 2
      ? plans.names[0]
      : `${plans.names.slice(0, -1).join(', ')} and ${plans.names.at(-1)}`;
    return `Included in ${names}, from ${plans.from}.`;
  });
  constructor() {
    afterNextRender(() => this.openDialog());
  }
  protected openDialog(): void {
    const dialog = this.dialog()?.nativeElement;
    if (!this.locked() || !dialog || dialog.open) return;
    dialog.showModal();
  }
  protected closeDialog(): void {
    this.dialog()?.nativeElement.close();
    this.reopen()?.nativeElement.focus();
  }
}
