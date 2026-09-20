import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  AUTHOR_DOCUMENTS_CLIENT,
  AuthorDocument,
  AuthorDocumentError,
  AuthorDocumentFailure,
} from '../../core/author-documents-client';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformThemeService } from '../../core/platform-theme';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

@Component({
  selector: 'app-author-operations',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './author-operations.html',
  styleUrl: './author-operations.css',
})
export class AuthorOperationsPage implements OnDestroy {
  private readonly accounts = inject(StudyPlanAccount);
  private readonly documents = inject(AUTHOR_DOCUMENTS_CLIENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly theme = inject(PlatformThemeService);
  private destroyed = false;
  private request = 0;
  private readonly loadedOwner = signal<string | null>(null);
  protected readonly authorized = computed(
    () => this.accounts.account()?.authorPreview === true && !this.accounts.sessionExpired(),
  );
  protected readonly document = signal<AuthorDocument | null>(null);
  protected readonly state = signal<'loading' | 'ready' | AuthorDocumentFailure>('loading');
  protected readonly documentHref = computed(() => {
    if (
      !this.authorized() ||
      this.state() !== 'ready' ||
      this.loadedOwner() !== this.accounts.account()?.accountId
    )
      return null;
    const document = this.document();
    if (!document) return null;
    const url = new URL(document.href, 'https://private.invalid');
    url.searchParams.set('theme', this.theme.selected());
    return url.pathname + url.search;
  });
  protected readonly documentUrl = computed(() => {
    const href = this.documentHref();
    return href ? this.sanitizer.bypassSecurityTrustResourceUrl(href) : null;
  });

  constructor() {
    effect(() => {
      this.accounts.account()?.accountId;
      this.authorized();
      void this.load();
    });
  }

  protected async load(): Promise<void> {
    const request = ++this.request;
    this.document.set(null);
    this.loadedOwner.set(null);
    if (!this.authorized()) {
      this.state.set('forbidden');
      return;
    }
    const owner = this.accounts.account()?.accountId;
    this.state.set('loading');
    try {
      const document = await this.documents.load('operations-reference');
      if (
        this.destroyed ||
        request !== this.request ||
        !this.authorized() ||
        this.accounts.account()?.accountId !== owner
      )
        return;
      this.loadedOwner.set(owner ?? null);
      this.document.set(document);
      this.state.set('ready');
    } catch (error) {
      if (
        !this.destroyed &&
        request === this.request &&
        this.accounts.account()?.accountId === owner
      )
        this.state.set(error instanceof AuthorDocumentError ? error.kind : 'unavailable');
    }
  }
  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
