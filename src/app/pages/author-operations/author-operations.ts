import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AUTHOR_DOCUMENTS_CLIENT,
  AuthorDocument,
  AuthorDocumentError,
  AuthorDocumentFailure,
} from '../../core/author-documents-client';
import {
  AuthorOutlineItem,
  AuthorWorkspaceNav,
} from '../../core/author-workspace-nav/author-workspace-nav';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformThemeService } from '../../core/platform-theme';
import {
  embeddedAnchor,
  embeddedAnchorPosition,
  requestEmbeddedAnchor,
  scrollToEmbeddedAnchor,
} from '../../core/author-embedded-anchor';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

@Component({
  selector: 'app-author-operations',
  imports: [PlatformHeader, AuthorWorkspaceNav, RouterLink],
  templateUrl: './author-operations.html',
  styleUrl: './author-operations.css',
})
export class AuthorOperationsPage implements OnDestroy {
  private readonly hostDocument = inject(DOCUMENT);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly documents = inject(AUTHOR_DOCUMENTS_CLIENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly theme = inject(PlatformThemeService);
  protected readonly documentId =
    inject(ActivatedRoute).snapshot.data['authorDocument'] === 'local-development'
      ? 'local-development'
      : 'operations-reference';
  protected readonly isLocalDevelopment = this.documentId === 'local-development';
  protected readonly pageTitle = this.isLocalDevelopment
    ? 'Local setup & development'
    : 'Operations';
  protected readonly pageRoute = this.isLocalDevelopment
    ? '/author/local-development'
    : '/author/operations';
  protected readonly documentFrame = viewChild<ElementRef<HTMLIFrameElement>>('documentFrame');
  private destroyed = false;
  private request = 0;
  private readonly loadedOwner = signal<string | null>(null);
  private readonly navigationHash = signal(this.hostDocument.defaultView?.location.hash ?? '');
  private pendingAnchor = this.hostDocument.defaultView?.location.hash ?? '';
  protected readonly authorized = computed(
    () => this.accounts.account()?.authorPreview === true && !this.accounts.sessionExpired(),
  );
  protected readonly document = signal<AuthorDocument | null>(null);
  protected readonly documentHeight = signal<number | null>(null);
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
  protected readonly documentFrameHref = computed(() => {
    const href = this.documentHref();
    if (!href) return null;
    const url = new URL(href, 'https://private.invalid');
    url.searchParams.set('layout', 'shared');
    return url.pathname + url.search;
  });
  protected readonly documentUrl = computed(() => {
    const href = this.documentFrameHref();
    if (!href) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(href);
  });
  protected readonly referenceLinks = computed(() =>
    this.isLocalDevelopment ? [] : (this.document()?.references ?? []),
  );
  protected readonly outline = computed<AuthorOutlineItem[]>(() => {
    const href = this.documentFrameHref();
    const document = this.document();
    if (!href || !document) return [];
    return [
      ...document.sections
        .filter((section) => section.anchor !== 'local-development-workflow')
        .map((section) => ({
          label: section.title,
          href: `${this.pageRoute}#${section.anchor}`,
        })),

    ];
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
    this.documentHeight.set(null);
    this.document.set(null);
    this.loadedOwner.set(null);
    if (!this.authorized()) {
      this.state.set('forbidden');
      return;
    }
    const owner = this.accounts.account()?.accountId;
    this.state.set('loading');
    try {
      const document = await this.documents.load(this.documentId);
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

  @HostListener('window:message', ['$event'])
  protected onDocumentMessage(event: MessageEvent): void {
    const frame = this.documentFrame()?.nativeElement;
    if (!frame || event.source !== frame.contentWindow || event.origin !== 'null') return;
    if (!this.authorized() || this.state() !== 'ready') return;
    const data = event.data;
    const anchor = embeddedAnchor(
      this.pendingAnchor,
      this.document()?.sections.map((section) => section.anchor) ?? [],
    );
    const position = embeddedAnchorPosition(
      data,
      this.documentId,
      anchor,
      this.documentHeight() ?? 30_000,
    );
    if (position !== null) {
      const hostWindow = this.hostDocument.defaultView;
      if (hostWindow) scrollToEmbeddedAnchor(frame, position, hostWindow);
      this.pendingAnchor = '';
      return;
    }
    if (
      !data ||
      typeof data !== 'object' ||
      data.type !== 'lookahead:author-document:height' ||
      data.version !== 1 ||
      data.documentId !== this.documentId ||
      !Number.isFinite(data.height) ||
      data.height < 300 ||
      data.height > 30_000
    )
      return;
    this.documentHeight.set(Math.ceil(data.height));
    requestEmbeddedAnchor(frame, this.documentId, anchor);
  }

  @HostListener('window:hashchange')
  @HostListener('window:popstate')
  protected onNavigationHashChange(): void {
    this.navigationHash.set(this.hostDocument.defaultView?.location.hash ?? '');
    this.onEmbeddedSectionSelected(this.navigationHash());
  }

  protected onEmbeddedSectionSelected(hash: string): void {
    this.pendingAnchor = hash;
    requestEmbeddedAnchor(
      this.documentFrame()?.nativeElement,
      this.documentId,
      embeddedAnchor(
        this.pendingAnchor,
        this.document()?.sections.map((section) => section.anchor) ?? [],
      ),
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
