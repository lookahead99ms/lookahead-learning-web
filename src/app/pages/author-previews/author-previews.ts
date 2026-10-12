import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  AuthorOutlineItem,
  AuthorWorkspaceNav,
} from '../../core/author-workspace-nav/author-workspace-nav';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { AuthorDocHero } from '../../core/author-workspace-nav/author-doc-hero';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { PlatformThemeService } from '../../core/platform-theme';
import {
  embeddedAnchor,
  embeddedAnchorPosition,
  embeddedChildNavigation,
  requestEmbeddedAnchor,
  scrollToEmbeddedAnchor,
} from '../../core/author-embedded-anchor';
import { ArchitectureDiagramViewer } from './architecture-diagram-viewer';
import { AuthorReviewPacket } from './author-review-packet';
import { ArchitectureDiagramId, connectArchitectureFrame } from './architecture-diagram-protocol';
import {
  AUTHOR_PREVIEWS_BASE_URL,
  parsePreviewInventory,
  previewManifestUrl,
  PreviewEntry,
  PreviewCollection,
  parsePreviewCollections,
  previewInventoryDate,
} from './preview-inventory';

@Component({
  selector: 'app-author-previews',
  imports: [
    PlatformHeader,
    AuthorWorkspaceNav,
    AuthorAdminMenu,
    AuthorDocHero,
    ArchitectureDiagramViewer,
    AuthorReviewPacket,
    RouterLink,
  ],
  templateUrl: './author-previews.html',
  styleUrls: ['./author-previews.css', '../../core/author-workspace-nav/reference-footer.css'],
  host: { '[class.architecture-page]': 'architectureOnly' },
})
export class AuthorPreviewsPage {
  private readonly hostDocument = inject(DOCUMENT);
  protected readonly accounts = inject(StudyPlanAccount);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly base = inject(AUTHOR_PREVIEWS_BASE_URL);
  private readonly theme = inject(PlatformThemeService);
  private readonly navigationHash = signal(this.hostDocument.defaultView?.location.hash ?? '');
  private pendingArchitectureAnchor = this.hostDocument.defaultView?.location.hash ?? '';
  private readonly architectureSections = [
    'overview-panel',
    'components-panel',
    'signin-panel',
    'data-panel',
    'journeys-panel',
    'publication-panel',
    'model-panel',
    'deferred-panel',
  ];
  protected readonly architectureOnly =
    inject(ActivatedRoute).snapshot.data['architectureOnly'] === true;
  protected readonly state = signal<'disabled' | 'loading' | 'ready' | 'error'>('disabled');
  protected readonly entries = signal<PreviewEntry[]>([]);
  protected readonly query = signal('');
  protected readonly groupFilter = signal('');
  protected readonly availableEntries = computed(() =>
    this.architectureOnly
      ? this.entries().filter((entry) => entry.id === 'architecture')
      : this.entries(),
  );
  protected readonly architectureDocumentHref = computed(() => {
    if (
      !this.architectureOnly ||
      !(this.accounts.account()?.permissions?.previewDocuments ?? this.accounts.account()?.authorPreview === true) ||
      this.accounts.sessionExpired()
    )
      return null;
    const href = this.availableEntries()[0]?.links[0]?.href;
    if (!href) return null;
    // The inventory parser has already restricted this URL to the private mount.
    const url = new URL(href, 'https://preview.invalid');
    url.searchParams.set('theme', this.theme.selected());
    if (url.searchParams.get('layout') === 'shared') url.searchParams.delete('layout');
    return `${url.pathname}${url.search}${url.hash}`;
  });
  protected readonly architectureFrameHref = computed(() => {
    const href = this.architectureDocumentHref();
    if (!href) return null;
    const url = new URL(href, 'https://preview.invalid');
    url.searchParams.set('layout', 'shared');
    return `${url.pathname}${url.search}${url.hash}`;
  });
  protected readonly architectureOutline = computed<AuthorOutlineItem[]>(() => {
    if (!this.architectureFrameHref()) return [];
    return [
      ['System overview', 'overview-panel'],
      ['Runtime components', 'components-panel'],
      ['Sign-in and authorization', 'signin-panel'],
      ['Data ownership and failures', 'data-panel'],
      ['Request journeys', 'journeys-panel'],
      ['Content publication', 'publication-panel'],
      ['Content data model', 'model-panel'],
      ['Deferred boundaries', 'deferred-panel'],
    ].map(([label, anchor]) => ({ label, href: `/admin/architecture#${anchor}` }));
  });
  protected readonly architectureNavigationHref = computed(() => {
    return this.architectureFrameHref();
  });
  protected readonly architectureDocumentUrl = computed<SafeResourceUrl | null>(() => {
    const href = this.architectureNavigationHref();
    return href ? this.sanitizer.bypassSecurityTrustResourceUrl(href) : null;
  });
  protected readonly expandedDiagram = signal<ArchitectureDiagramId | null>(null);
  protected readonly architectureFrameHeight = signal<number | null>(null);
  protected readonly architectureFrame =
    viewChild<ElementRef<HTMLIFrameElement>>('architectureFrame');
  private documentPort: MessagePort | null = null;

  constructor() {
    effect(() => {
      // Every source/capability change invalidates its port and any open viewer.
      this.architectureNavigationHref();
      this.documentPort?.close();
      this.documentPort = null;
      this.expandedDiagram.set(null);
      this.architectureFrameHeight.set(null);
    });
  }

  @HostListener('window:hashchange')
  @HostListener('window:popstate')
  protected onNavigationHashChange(): void {
    this.navigationHash.set(this.hostDocument.defaultView?.location.hash ?? '');
    this.onEmbeddedSectionSelected(this.navigationHash());
  }

  protected onEmbeddedSectionSelected(hash: string): void {
    this.pendingArchitectureAnchor = hash;
    requestEmbeddedAnchor(
      this.architectureFrame()?.nativeElement,
      'architecture-reference',
      embeddedAnchor(this.pendingArchitectureAnchor, this.architectureSections),
    );
  }

  @HostListener('window:message', ['$event'])
  protected onArchitectureHeight(event: MessageEvent): void {
    if (
      !this.architectureOnly ||
      !this.architectureDocumentHref() ||
      this.accounts.sessionExpired()
    )
      return;
    const frame = this.architectureFrame()?.nativeElement;
    if (!frame || event.source !== frame.contentWindow || event.origin !== 'null') return;
    const data = event.data;
    const selected = embeddedChildNavigation(
      data,
      'architecture-reference',
      this.architectureSections,
    );
    if (selected) {
      const hash = `#${selected}`;
      const hostWindow = this.hostDocument.defaultView;
      if (hostWindow && hostWindow.location.hash !== hash) {
        hostWindow.history.replaceState(null, '', `/admin/architecture${hash}`);
        hostWindow.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      this.navigationHash.set(hash);
      this.pendingArchitectureAnchor = '';
      return;
    }
    const anchor = embeddedAnchor(this.pendingArchitectureAnchor, this.architectureSections);
    const position = embeddedAnchorPosition(
      data,
      'architecture-reference',
      anchor,
      this.architectureFrameHeight() ?? 100_000,
    );
    if (position !== null) {
      const hostWindow = this.hostDocument.defaultView;
      if (hostWindow) scrollToEmbeddedAnchor(frame, position, hostWindow);
      this.pendingArchitectureAnchor = '';
      return;
    }
    if (
      !data ||
      typeof data !== 'object' ||
      data.type !== 'lookahead:architecture:height' ||
      data.version !== 1 ||
      !Number.isFinite(data.height) ||
      data.height < 300 ||
      data.height > 100_000
    )
      return;
    this.architectureFrameHeight.set(Math.ceil(data.height));
    requestEmbeddedAnchor(frame, 'architecture-reference', anchor);
  }

  protected connectDocument(frame: HTMLIFrameElement) {
    this.documentPort?.close();
    this.documentPort = null;
    const href = this.architectureNavigationHref();
    if (!href) return;
    this.documentPort = connectArchitectureFrame(frame, href, null, (message) => {
      if (!this.architectureDocumentHref() || this.accounts.sessionExpired()) return;
      if (message.type === 'lookahead:architecture:expand')
        this.expandedDiagram.set(message.diagramId);
    });
  }

  protected closeDiagram() {
    const diagramId = this.expandedDiagram();
    this.expandedDiagram.set(null);
    if (!diagramId || !this.architectureDocumentHref()) return;
    this.architectureFrame()?.nativeElement.focus({ preventScroll: true });
    this.documentPort?.postMessage({
      type: 'lookahead:architecture:restore-focus',
      version: 1,
      diagramId,
    });
  }

  ngOnDestroy() {
    this.documentPort?.close();
  }
  protected readonly collections = signal<PreviewCollection[]>([]);
  protected readonly inventoryDate = signal<string | null>(null);
  // The live application is the current design; these open the real pages.
  protected readonly liveSurfaces = [
    {
      title: 'Learn',
      description: 'Language foundations, DSA, object design and engineering tools.',
      route: '/learn',
    },
    {
      title: 'Grow',
      description: 'Backend, frontend, security, AI engineering and delivery.',
      route: '/grow',
    },
    {
      title: 'Blaze',
      description: 'Architecture, leadership, behavioral preparation and AI systems.',
      route: '/blaze',
    },
    {
      title: 'Pattern lessons',
      description: 'Algorithmic Patterns: problem, walkthrough, variations and mistakes.',
      route: '/learn/algorithmic-patterns',
    },
    {
      title: 'Hands-on DSA',
      description: 'Coding practice, source, trace and the guided debugger.',
      route: '/learn/hands-on-dsa',
    },
    {
      title: 'System design lessons',
      description: 'Blaze design lessons built from tables and diagrams.',
      route: '/blaze/system-design',
    },
    {
      title: 'Search',
      description: 'Find published lessons, questions, practice and supporting readers.',
      route: '/search',
    },
    {
      title: 'Support and feedback',
      description: 'The feedback form and attachment experience.',
      route: '/support',
    },
    {
      title: 'Manage Account',
      description: 'Profile, security, active sign-ins and learning summary.',
      route: '/account',
    },
  ];
  protected readonly savedPlan = computed(
    () =>
      this.accounts.plans().find((plan) => plan.goal === 'Author sample · Saved plan') ??
      this.accounts.plans()[0],
  );
  protected readonly revisedPlan = computed(
    () =>
      this.accounts.plans().find((plan) => plan.goal === 'Author sample · Revised plan') ??
      this.accounts.plans().find((plan) => plan.revision > 1),
  );
  protected readonly groupNames = computed(() =>
    this.collections().map((collection) => collection.title),
  );
  protected readonly visibleCollections = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.collections().filter(
      (collection) =>
        (!this.groupFilter() || collection.title === this.groupFilter()) &&
        [
          collection.title,
          collection.summary,
          ...[collection.featured, ...collection.history].map(
            (entry) => `${entry.title} ${entry.status}`,
          ),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query),
    );
  });
  protected readonly resultCount = computed(() => this.visibleCollections().length);
  protected readonly previewOutline = computed<AuthorOutlineItem[]>(() => {
    if (!(this.accounts.account()?.permissions?.previewDocuments ?? this.accounts.account()?.authorPreview === true) || this.accounts.sessionExpired()) return [];
    return [
      { label: 'Current product', href: '#live-product' },
      { label: 'Study Plan sample views', href: '#study-plan-views' },
      { label: 'Study Plan review', href: '#study-plan-review' },
      { label: 'Design history', href: '#design-history' },
      ...(this.state() === 'ready'
        ? [
            ...this.visibleCollections().map((collection) => ({
              label: collection.title,
              href: `#preview-${collection.id}`,
            })),
          ]
        : []),
    ];
  });

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    const url = previewManifestUrl(this.base);
    if (!url || !(this.accounts.account()?.permissions?.previewDocuments ?? this.accounts.account()?.authorPreview === true) || this.accounts.sessionExpired()) {
      this.state.set('disabled');
      return;
    }
    this.state.set('loading');
    this.entries.set([]);
    this.collections.set([]);
    this.inventoryDate.set(null);
    try {
      const manifest = await firstValueFrom(this.http.get<unknown>(url).pipe(timeout(10000)));
      const entries = parsePreviewInventory(manifest, this.base);
      this.entries.set(entries);
      this.collections.set(parsePreviewCollections(manifest, entries));
      this.inventoryDate.set(previewInventoryDate(manifest));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
