import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  AUTHOR_PREVIEWS_BASE_URL,
  parsePreviewInventory,
  previewManifestUrl,
  PreviewEntry,
  PreviewCollection,
  parsePreviewCollections,
} from './preview-inventory';

@Component({
  selector: 'app-author-previews',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './author-previews.html',
  styleUrl: './author-previews.css',
})
export class AuthorPreviewsPage {
  protected readonly accounts = inject(StudyPlanAccount);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly base = inject(AUTHOR_PREVIEWS_BASE_URL);
  protected readonly architectureOnly =
    inject(ActivatedRoute).snapshot.data['architectureOnly'] === true;
  protected readonly title = this.architectureOnly ? 'Architecture' : 'Author previews';
  protected readonly state = signal<'disabled' | 'loading' | 'ready' | 'error'>('disabled');
  protected readonly entries = signal<PreviewEntry[]>([]);
  protected readonly query = signal('');
  protected readonly groupFilter = signal('');
  protected readonly availableEntries = computed(() =>
    this.architectureOnly
      ? this.entries().filter((entry) => entry.id === 'architecture')
      : this.entries(),
  );
  protected readonly architectureDocumentUrl = computed<SafeResourceUrl | null>(() => {
    if (!this.architectureOnly) return null;
    const href = this.availableEntries()[0]?.links[0]?.href;
    return href ? this.sanitizer.bypassSecurityTrustResourceUrl(href) : null;
  });
  protected readonly collections = signal<PreviewCollection[]>([]);
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

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    const url = previewManifestUrl(this.base);
    if (!url || !this.accounts.account()?.authorPreview || this.accounts.sessionExpired()) {
      this.state.set('disabled');
      return;
    }
    this.state.set('loading');
    this.entries.set([]);
    this.collections.set([]);
    try {
      const manifest = await firstValueFrom(this.http.get<unknown>(url).pipe(timeout(10000)));
      const entries = parsePreviewInventory(manifest, this.base);
      this.entries.set(entries);
      this.collections.set(parsePreviewCollections(manifest, entries));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
