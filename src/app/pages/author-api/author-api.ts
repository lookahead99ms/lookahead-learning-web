import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformThemeService } from '../../core/platform-theme';
import {
  AUTHOR_PREVIEWS_BASE_URL,
  apiReferencePreviewUrl,
  previewManifestUrl,
} from '../../core/author-preview-config';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { parsePreviewInventory, PreviewEntry } from '../author-previews/preview-inventory';

const downloadSections: ReadonlyArray<{ id: string; title: string; files: readonly string[] }> = [
  {
    id: 'start',
    title: 'Start testing',
    files: [
      'local-testing.md',
      'http/local-jetbrains.http',
      'http/local-vscode.http',
      'postman/local.postman_environment.json',
    ],
  },
  {
    id: 'identity',
    title: 'Identity',
    files: [
      'identity.openapi.json',
      'http/identity.http',
      'postman/identity.postman_collection.json',
    ],
  },
  {
    id: 'gateway',
    title: 'Gateway BFF',
    files: [
      'gateway-bff.openapi.json',
      'http/gateway-bff.http',
      'postman/gateway-bff.postman_collection.json',
    ],
  },
  {
    id: 'domain',
    title: 'Domain API',
    files: [
      'domain-api.openapi.json',
      'http/domain-api.http',
      'postman/domain-api.postman_collection.json',
    ],
  },
  {
    id: 'reference',
    title: 'Reference',
    files: ['credentials.md', 'README.md', 'access-model.md'],
  },
];
const allowedDownloads = new Set(downloadSections.flatMap((section) => section.files));

@Component({
  selector: 'app-author-api',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './author-api.html',
  styleUrl: './author-api.css',
})
export class AuthorApiPage {
  private readonly accounts = inject(StudyPlanAccount);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly theme = inject(PlatformThemeService);
  private readonly base = inject(AUTHOR_PREVIEWS_BASE_URL);
  protected readonly authorized = computed(
    () => this.accounts.account()?.authorPreview === true && !this.accounts.sessionExpired(),
  );
  protected readonly state = signal<'disabled' | 'loading' | 'ready' | 'error'>('disabled');
  private readonly entry = signal<PreviewEntry | null>(null);
  protected readonly documentHref = computed(() => {
    if (!this.authorized() || !this.entry()?.available) return null;
    const expected = apiReferencePreviewUrl(this.base);
    const href = this.entry()?.links[0]?.href;
    if (!href || !expected) return null;
    const url = new URL(href, 'https://preview.invalid');
    // The viewer has one fixed document; the manifest cannot redirect it elsewhere.
    if (url.pathname !== expected) return null;
    url.searchParams.set('theme', this.theme.selected());
    url.searchParams.delete('layout');
    return `${url.pathname}${url.search}${url.hash}`;
  });
  protected readonly documentUrl = computed(() => {
    const href = this.documentHref();
    if (!href) return null;
    const url = new URL(href, 'https://preview.invalid');
    url.searchParams.set('layout', 'shared');
    return this.sanitizer.bypassSecurityTrustResourceUrl(`${url.pathname}${url.search}${url.hash}`);
  });
  protected readonly downloads = computed(() => {
    if (!this.documentHref()) return [];
    const directory = apiReferencePreviewUrl(this.base)!.replace(/index\.html$/, '');
    return (this.entry()?.links.slice(1) ?? []).filter((link) => {
      const url = new URL(link.href, 'https://preview.invalid');
      return (
        url.pathname.startsWith(directory) &&
        allowedDownloads.has(url.pathname.slice(directory.length)) &&
        !url.search &&
        !url.hash
      );
    });
  });
  protected readonly downloadGroups = computed(() => {
    const links = this.downloads();
    if (!links.length) return [];
    const directory = apiReferencePreviewUrl(this.base)!.replace(/index\.html$/, '');
    return downloadSections
      .map((section) => ({
        id: section.id,
        title: section.title,
        links: section.files.flatMap((file) => {
          const link = links.find((candidate) => candidate.href === directory + file);
          return link ? [link] : [];
        }),
      }))
      .filter((section) => section.links.length > 0);
  });

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.entry.set(null);
    const manifest = previewManifestUrl(this.base);
    if (!manifest || !this.authorized()) {
      this.state.set('disabled');
      return;
    }
    this.state.set('loading');
    try {
      const data = await firstValueFrom(this.http.get<unknown>(manifest).pipe(timeout(10000)));
      if (!this.authorized()) {
        this.state.set('disabled');
        return;
      }
      this.entry.set(
        parsePreviewInventory(data, this.base).find((entry) => entry.id === 'api-reference') ??
          null,
      );
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
