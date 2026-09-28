import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContentRecovery, RecoveryKind } from '../../core/content-recovery/content-recovery';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-author-content-access',
  imports: [ContentRecovery, PlatformHeader, RouterLink],
  template: `<app-platform-header />
    <main id="main-content" class="content-page reader-page">
      <h1>Content access review</h1>
      <p>
        Author preview with synthetic metadata. These controls do not change your access or load a
        protected lesson.
      </p>
      <nav aria-label="Preview states" style="display:flex;flex-wrap:wrap;gap:20px;margin:24px 0">
        @for (state of states; track state) {
          <a
            routerLink="/author/content-access"
            [queryParams]="{ state }"
            [attr.aria-current]="kind() === state ? 'page' : null"
            >{{ state }}</a
          >
        }
      </nav>
      @for (state of [kind()]; track state) {
        <app-content-recovery
          [kind]="state"
          [preview]="preview"
          [destination]="destination()"
          (retry)="retryPreview()"
        />
      }
      <p>{{ retried ? 'Retry requested. In a real lesson, this starts a fresh read.' : '' }}</p>
      <a routerLink="/author/operations">Open Author documentation</a>
    </main>`,
})
export class AuthorContentAccess {
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly states: RecoveryKind[] = ['locked', 'sign-in', 'planned', 'temporary', 'missing'];
  readonly kind = computed<RecoveryKind>(() => {
    const value = this.query().get('state') as RecoveryKind;
    return this.states.includes(value) ? value : 'locked';
  });
  readonly destination = computed(() => '/author/content-access?state=' + this.kind());
  readonly preview = {
    title: 'Designing a reliable message queue',
    description: 'A sample lesson preview for reviewing the access experience.',
    premium: true,
  };
  retried = false;
  retryPreview(): void {
    this.retried = true;
  }
}
