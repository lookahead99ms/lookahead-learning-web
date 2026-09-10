import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';

type LandingSuggestion = {
  type: 'Question' | 'Theory' | 'DSA' | 'Module' | 'Course' | 'Topic' | 'Tool';
  label: string;
  detail?: string;
  route: string[];
  queryParams?: Record<string, string>;
};

@Component({
  selector: 'app-landing-search',
  imports: [FormsModule],
  templateUrl: './landing-search.html',
  styles: [
    `
      .landing-search {
        position: relative;
        z-index: 2;
        width: min(660px, 100%);
        margin: 0 auto;
        text-align: left;
      }
      .landing-search-form {
        position: relative;
      }
      .landing-search-icon {
        position: absolute;
        top: 50%;
        left: 20px;
        width: 20px;
        height: 20px;
        color: var(--accent-link);
        pointer-events: none;
        transform: translateY(-50%);
      }
      .landing-search-input {
        box-sizing: border-box;
        width: 100%;
        height: 50px;
        padding: 0 48px 0 48px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--text-strong);
        background: var(--surface);
        box-shadow: 0 10px 28px var(--shadow);
        font: inherit;
        font-size: 0.95rem;
        transition:
          border-color 160ms ease,
          box-shadow 160ms ease,
          border-radius 160ms ease;
      }
      .landing-search-input:focus {
        border-color: var(--accent-strong);
        outline: 3px solid var(--accent-focus);
        box-shadow: 0 14px 34px var(--shadow);
      }
      .landing-search.open .landing-search-input {
        border-radius: 18px 18px 0 0;
        border-bottom-color: transparent;
      }
      .landing-search-clear {
        position: absolute;
        top: 50%;
        right: 16px;
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: var(--text-subtle);
        background: transparent;
        cursor: pointer;
        font: inherit;
        font-size: 1.5rem;
        line-height: 1;
        transform: translateY(-50%);
      }
      .landing-search-clear:hover,
      .landing-search-clear:focus-visible {
        color: var(--text-strong);
        background: var(--surface-accent);
        outline: none;
      }
      .landing-search-dropdown {
        position: absolute;
        top: 50px;
        left: 0;
        width: 100%;
        box-sizing: border-box;
        overflow: hidden;
        border: 1px solid var(--line);
        border-top: 0;
        border-radius: 0 0 18px 18px;
        background: var(--surface);
        box-shadow: 0 18px 40px var(--shadow);
      }
      .landing-search-stages {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        padding: 14px;
        border-bottom: 1px solid var(--line);
      }
      .landing-search-stage {
        min-height: 38px;
        padding: 8px 10px;
        border: 0;
        border-radius: 8px;
        color: var(--text-strong);
        background: var(--surface-accent);
        cursor: pointer;
        font: inherit;
        font-size: 0.84rem;
        font-weight: 760;
      }
      .landing-search-stage:hover,
      .landing-search-stage:focus-visible {
        background: var(--surface-accent);
        outline: none;
      }
      .landing-search-stage.learn {
        color: var(--accent-link);
      }
      .landing-search-stage.grow {
        color: var(--warning);
      }
      .landing-search-stage.look-ahead {
        color: var(--text-strong);
      }
      .landing-search-stage.search {
        color: var(--accent-link);
      }
      .landing-search-results {
        max-height: 360px;
        overflow: auto;
        padding: 6px 0;
      }
      .landing-search-result {
        display: grid;
        grid-template-columns: 76px minmax(0, 1fr);
        column-gap: 14px;
        width: 100%;
        padding: 11px 18px;
        border: 0;
        color: var(--text-strong);
        background: transparent;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .landing-search-result:hover,
      .landing-search-result:focus-visible {
        background: var(--surface-accent);
        outline: none;
      }
      .landing-search-result-type {
        padding-top: 2px;
        color: var(--accent-link);
        font-size: 0.66rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .landing-search-result-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.93rem;
        font-weight: 730;
      }
      .landing-search-result-detail {
        grid-column: 2;
        overflow: hidden;
        margin-top: 2px;
        color: var(--text-subtle);
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.76rem;
      }
      .landing-search-empty {
        margin: 0;
        padding: 26px 18px;
        color: var(--text-subtle);
        text-align: center;
        font-size: 0.9rem;
      }
      .landing-search-hint {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        padding: 11px 18px;
        border-top: 1px solid var(--line);
        color: var(--text-subtle);
        font-size: 0.75rem;
      }
      .landing-search-hint kbd {
        padding: 1px 5px;
        border: 1px solid var(--line);
        border-radius: 4px;
        color: var(--text-body);
        background: var(--surface);
        font: inherit;
        font-size: 0.7rem;
      }
      @media (max-width: 620px) {
        .landing-search-input {
          height: 48px;
          font-size: 0.88rem;
        }
        .landing-search-dropdown {
          top: 48px;
        }
        .landing-search-stages {
          grid-template-columns: repeat(2, 1fr);
        }
        .landing-search-hint span:last-child {
          display: none;
        }
      }
    `,
  ],
})
export class LandingSearch {
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private loaded = false;

  protected readonly query = signal('');
  protected readonly open = signal(false);
  private readonly documents = signal<SearchDocument[]>([]);
  protected readonly suggestions = computed(() =>
    this.buildSuggestions(this.documents(), this.query().trim().toLowerCase()),
  );

  protected activate(): void {
    this.open.set(true);
    this.loadIndex();
  }

  protected update(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.loadIndex();
  }

  protected clear(): void {
    this.query.set('');
    this.focusInput();
  }

  protected submit(): void {
    const query = this.query().trim();
    this.close();
    this.router.navigate(['/search'], { queryParams: query ? { q: query } : {} });
  }

  protected choose(suggestion: LandingSuggestion): void {
    this.close();
    this.router.navigate(suggestion.route, { queryParams: suggestion.queryParams });
  }

  protected navigate(path: string[]): void {
    this.close();
    this.router.navigate(path);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close();
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    if (this.open()) this.close();
  }

  @HostListener('document:click', ['$event'])
  protected onOutsideClick(event: MouseEvent): void {
    if (this.open() && !event.composedPath().includes(this.elementRef.nativeElement)) this.close();
  }

  private close(): void {
    this.open.set(false);
    (this.elementRef.nativeElement.querySelector('input') as HTMLInputElement | null)?.blur();
  }

  private focusInput(): void {
    requestAnimationFrame(() =>
      (this.elementRef.nativeElement.querySelector('input') as HTMLInputElement | null)?.focus(),
    );
  }

  private loadIndex(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.content.getSearchIndex().subscribe({ next: (documents) => this.documents.set(documents) });
  }

  private buildSuggestions(documents: SearchDocument[], query: string): LandingSuggestion[] {
    const matches = documents
      .filter((document) => !query || document.searchableText.includes(query))
      .sort(
        (a, b) => this.score(b, query) - this.score(a, query) || a.title.localeCompare(b.title),
      );
    const spread = this.spreadAcrossCourses(matches).slice(0, 28);
    const candidates: LandingSuggestion[] = [
      ...spread.map((document) => ({
        type: this.documentType(document),
        label: document.title,
        detail:
          document.discoveryKind === 'course' || document.discoveryKind === 'tool'
            ? this.pathLabel(document.path)
            : `${document.courseTitle} · ${document.moduleTitle}`,
        route: document.route ?? ['/', document.path, document.courseId],
      })),
      ...spread
        .filter((document) => !document.discoveryKind)
        .map((document) => ({
          type: 'Module' as const,
          label: document.moduleTitle,
          detail: document.courseTitle,
          route: ['/', document.path, document.courseId, 'module', document.moduleId],
        })),
      ...spread
        .filter((document) => !document.discoveryKind)
        .map((document) => ({
          type: 'Course' as const,
          label: document.courseTitle,
          detail: document.path === 'grow' ? 'Grow capability' : 'Learn competency',
          route: ['/', document.path, document.courseId],
        })),
      ...spread.flatMap((document) =>
        document.tags.map((tag) => ({
          type: 'Topic' as const,
          label: tag,
          detail: `${document.courseTitle} · ${document.moduleTitle}`,
          route: ['/search'],
          queryParams: { tags: tag },
        })),
      ),
    ];
    const unique = [
      ...new Map(
        candidates.map((candidate) => [
          `${candidate.type}:${candidate.label.toLowerCase()}`,
          candidate,
        ]),
      ).values(),
    ];
    const result: LandingSuggestion[] = [];
    const courses = new Set<string>();
    for (const type of [
      'Course',
      'Topic',
      'Theory',
      'Question',
      'DSA',
      'Tool',
      'Module',
    ] as const) {
      const typed = unique.filter((candidate) => candidate.type === type);
      const candidate =
        typed.find((item) => !item.detail || !courses.has(item.detail.split(' · ')[0])) ?? typed[0];
      if (candidate) {
        result.push(candidate);
        if (candidate.detail) courses.add(candidate.detail.split(' · ')[0]);
      }
    }
    for (const candidate of unique)
      if (result.length < 8 && !result.includes(candidate)) result.push(candidate);
    return result;
  }

  private documentType(document: SearchDocument): LandingSuggestion['type'] {
    if (document.discoveryKind === 'course') return 'Course';
    if (document.discoveryKind === 'topic') return 'Topic';
    if (document.discoveryKind === 'tool') return 'Tool';
    if (document.contentType === 'theory') return 'Theory';
    if (document.contentType === 'dsa-pattern' || document.contentType === 'dsa-problem')
      return 'DSA';
    return 'Question';
  }

  private pathLabel(path: SearchDocument['path']): string {
    return path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
  }

  private score(document: SearchDocument, query: string): number {
    if (!query)
      return document.contentType === 'theory' ? 3 : document.contentType === 'dsa-pattern' ? 2 : 1;
    const title = document.title.toLowerCase();
    if (title === query) return 100;
    if (title.includes(query)) return 80;
    if (
      document.moduleTitle.toLowerCase().includes(query) ||
      document.courseTitle.toLowerCase().includes(query)
    )
      return 60;
    return 20;
  }

  private spreadAcrossCourses(documents: SearchDocument[]): SearchDocument[] {
    const queues = [
      ...documents
        .reduce((map, document) => {
          const key = `${document.path}:${document.courseId}`;
          map.set(key, [...(map.get(key) ?? []), document]);
          return map;
        }, new Map<string, SearchDocument[]>())
        .values(),
    ];
    const result: SearchDocument[] = [];
    while (queues.some((queue) => queue.length))
      for (const queue of queues) {
        const next = queue.shift();
        if (next) result.push(next);
      }
    return result;
  }
}
