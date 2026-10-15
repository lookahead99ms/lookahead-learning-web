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
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { AuthorDocHero } from '../../core/author-workspace-nav/author-doc-hero';
import {
  authorDocumentPages,
  authorDocumentationSection,
  authorDocumentationLinks,
  isAuthorDocumentPageId,
} from '../../core/author-workspace-nav/author-workspace-links';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformThemeService } from '../../core/platform-theme';
import {
  apiEndpointAnchor,
  embeddedAnchor,
  embeddedAnchorPosition,
  requestEmbeddedAnchor,
  scrollToEmbeddedAnchor,
} from '../../core/author-embedded-anchor';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

// Long operator references wrap beyond 30,000px on narrow screens. Keep a
// finite limit while allowing the verified AWS guide to use one page scroll.
const maxDocumentHeight = 60_000;

@Component({
  selector: 'app-author-operations',
  imports: [PlatformHeader, AuthorWorkspaceNav, AuthorAdminMenu, AuthorDocHero, RouterLink],
  templateUrl: './author-operations.html',
  styleUrls: ['./author-operations.css', '../../core/author-workspace-nav/reference-footer.css'],
})
export class AuthorOperationsPage implements OnDestroy {
  private readonly hostDocument = inject(DOCUMENT);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly documents = inject(AUTHOR_DOCUMENTS_CLIENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly theme = inject(PlatformThemeService);
  // Routes name one of the published private documents; anything else is Operations.
  protected readonly pageId = ((value: unknown) =>
    isAuthorDocumentPageId(value) ? value : 'operations')(
    inject(ActivatedRoute).snapshot.data['authorDocument'],
  );
  protected readonly page = authorDocumentPages[this.pageId];
  protected readonly documentId = this.page.documentId;
  private readonly link = authorDocumentationLinks.find((page) => page.id === this.pageId)!;
  protected readonly pageTitle = this.link.label;
  /** Sub-pages of a long reference read as one section, in order. */
  protected readonly section = authorDocumentationSection(this.pageId);
  protected readonly sectionIndex = this.section?.pages.findIndex((page) => page.id === this.pageId) ?? -1;
  protected readonly previousPage = this.section && this.sectionIndex > 0 ? this.section.pages[this.sectionIndex - 1] : null;
  protected readonly nextPage = this.section?.pages[this.sectionIndex + 1] ?? null;
  protected readonly pageRoute = this.link.href;
  protected readonly documentFrame = viewChild<ElementRef<HTMLIFrameElement>>('documentFrame');
  private destroyed = false;
  private request = 0;
  private readonly loadedOwner = signal<string | null>(null);
  private readonly navigationHash = signal(this.hostDocument.defaultView?.location.hash ?? '');
  private pendingAnchor = this.hostDocument.defaultView?.location.hash ?? '';
  protected readonly authorized = computed(
    () => (this.accounts.account()?.permissions?.previewDocuments ?? this.accounts.account()?.authorPreview === true) && !this.accounts.sessionExpired(),
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
  protected readonly referenceLinks = computed(() => this.document()?.references ?? []);
  /** Local setup only: the published setup script, offered here because the document sandbox cannot. */
  protected readonly setupDownload = computed(() =>
    this.pageId === 'local-development'
      ? (this.document()?.downloads.find((item) => item.filename === 'lookahead_setup.py') ?? null)
      : null,
  );
  protected readonly setupSteps = [
    { icon: '📥', text: 'Clones or updates the six repositories into one folder.' },
    { icon: '🌿', text: 'Stays on main, or creates your branch from the latest origin/main.' },
    { icon: '🛠️', text: 'Builds Gateway BFF and Identity (Gradle), Domain API (Maven) and their Docker images.' },
    { icon: '🐳', text: 'Starts the Local backend on ports 4350–4352.' },
    { icon: '🌐', text: 'Installs and starts the web app: protected on 4301 or demo on 4300.' },
  ];
  protected readonly setupNeeds = ['Git', 'Python 3', 'Java 21', 'Docker (running)', 'Node 24 and npm'];
  protected readonly setupCommands = [
    { label: 'Ask each question (press Enter for the default)', command: 'python3 lookahead_setup.py' },
    { label: 'Accept every default', command: 'python3 lookahead_setup.py --yes' },
    { label: 'Preview the commands without changing anything', command: 'python3 lookahead_setup.py --yes --dry-run' },
    {
      label: 'Task branch for a UI-only change, demo web app',
      command:
        'python3 lookahead_setup.py --branch feature/DLV-123-short-description --repos web-public,content --web demo',
    },
  ];
  protected readonly copiedCommand = signal<string | null>(null);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected async copyCommand(command: string): Promise<void> {
    try {
      await this.hostDocument.defaultView?.navigator.clipboard.writeText(command);
      this.copiedCommand.set(command);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copiedCommand.set(null), 2000);
    } catch {
      this.copiedCommand.set(null);
    }
  }

  protected fileSize(bytes: number): string {
    return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`;
  }
  protected readonly outline = computed<AuthorOutlineItem[]>(() => {
    const href = this.documentFrameHref();
    const document = this.document();
    if (!href || !document) return [];
    return [
      ...(this.setupDownload()
        ? [{ label: 'One-command setup', href: `${this.pageRoute}#one-command-setup` }]
        : []),
      ...document.sections.map((section) => ({
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
    if (data?.type === 'lookahead:author-document:api-navigate' && data.version === 1 && data.documentId === this.documentId) {
      const endpoint = apiEndpointAnchor(data.anchor);
      if (endpoint) this.hostDocument.defaultView?.location.assign(`/admin/api#${endpoint}`);
      return;
    }
    const anchor = embeddedAnchor(
      this.pendingAnchor,
      this.document()?.sections.map((section) => section.anchor) ?? [],
    );
    const position = embeddedAnchorPosition(
      data,
      this.documentId,
      anchor,
      this.documentHeight() ?? maxDocumentHeight,
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
      data.height > maxDocumentHeight
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
    clearTimeout(this.copiedTimer);
  }
}
