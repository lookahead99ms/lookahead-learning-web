import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AuthorDocumentsApi } from '../../core/author-documents-api';
import { AuthorDocument, AuthorDocumentError } from '../../core/author-documents-client';
import { PlatformThemeService } from '../../core/platform-theme';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AuthorReviewControls } from './author-review-controls';

@Component({
  selector: 'app-author-review-packet',
  imports: [RouterLink, AuthorReviewControls],
  templateUrl: './author-review-packet.html',
  styleUrl: './author-review-packet.css',
})
export class AuthorReviewPacket {
  readonly expanded = input(false);
  private readonly documents = inject(AuthorDocumentsApi);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly theme = inject(PlatformThemeService);
  private generation = 0;
  private destroyed = false;
  protected readonly authorized = computed(
    () => this.accounts.account()?.authorPreview === true && !this.accounts.sessionExpired(),
  );
  protected readonly document = signal<AuthorDocument | null>(null);
  protected readonly state = signal<
    'loading' | 'ready' | 'unavailable' | 'unpublished' | 'unauthorized' | 'forbidden'
  >('loading');
  protected readonly href = computed(() =>
    this.authorized() && this.document()
      ? this.document()!.href + '?theme=' + this.theme.selected()
      : null,
  );
  protected readonly frameUrl = computed(() =>
    this.href() ? this.sanitizer.bypassSecurityTrustResourceUrl(this.href()!) : null,
  );

  constructor() {
    effect(() => {
      this.accounts.account()?.accountId;
      this.authorized();
      void this.load();
    });
  }
  protected async load(): Promise<void> {
    const generation = ++this.generation,
      owner = this.accounts.account()?.accountId;
    this.document.set(null);
    if (!this.authorized()) {
      this.state.set('forbidden');
      return;
    }
    this.state.set('loading');
    try {
      const document = await this.documents.load('study-plan-review');
      if (
        this.destroyed ||
        generation !== this.generation ||
        !this.authorized() ||
        this.accounts.account()?.accountId !== owner
      )
        return;
      this.document.set(document);
      this.state.set('ready');
    } catch (error) {
      if (
        this.destroyed ||
        generation !== this.generation ||
        !this.authorized() ||
        this.accounts.account()?.accountId !== owner
      )
        return;
      this.state.set(
        error instanceof AuthorDocumentError && error.kind !== 'invalid'
          ? error.kind
          : 'unavailable',
      );
    }
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.generation++;
  }
}
