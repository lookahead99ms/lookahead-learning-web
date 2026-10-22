import { withoutHiddenCourseDocuments } from '../../content/hidden-courses';
import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';
import {
  closestSearchWords,
  foldSearchText,
  hasSearchWord,
  matchesSearchWords,
  searchDocumentText,
  searchRank,
  searchVocabulary,
  searchWords,
} from '../search-text';

type LandingSuggestion = {
  type: 'Question' | 'Theory' | 'DSA' | 'Module' | 'Course' | 'Topic' | 'Tool';
  label: string;
  detail?: string;
  route: string[];
  queryParams?: Record<string, string>;
  /** Relevance of the item this row stands for, when it is an indexed item. */
  rank?: number;
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
      }
      .landing-search-stage.learn {
        color: var(--accent-link);
      }
      .landing-search-stage.grow {
        color: var(--accent-link);
      }
      .landing-search-stage.blaze {
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
      .landing-search-correction {
        margin: 0;
        padding: 8px 18px;
        color: var(--text-subtle);
        font-size: 0.8rem;
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
  private readonly foldedDocuments = computed(() =>
    this.documents().map((document) => ({ document, text: searchDocumentText(document) })),
  );
  private readonly vocabulary = computed(() =>
    searchVocabulary(this.foldedDocuments().map(({ text }) => text)),
  );
  /**
   * The words the suggestions use: the same rule as Search and the header quick search
   * (search-text.ts). A spelling fix is used only when the typed words find nothing, and the
   * dropdown names it.
   */
  private readonly searchedWords = computed(() => {
    const words = searchWords(this.query());
    const documents = this.foldedDocuments();
    if (!words.length || documents.some(({ text }) => matchesSearchWords(text, words)))
      return { words, corrected: false };
    const fixed = closestSearchWords(words, this.vocabulary(), (word) =>
      documents.some(({ text }) => hasSearchWord(text, word)),
    );
    return fixed && documents.some(({ text }) => matchesSearchWords(text, fixed))
      ? { words: fixed, corrected: true }
      : { words, corrected: false };
  });
  protected readonly correctedQuery = computed(() => {
    const { words, corrected } = this.searchedWords();
    return corrected ? words.join(' ') : null;
  });
  protected readonly suggestions = computed(() => {
    const { words } = this.searchedWords();
    const matches = this.foldedDocuments()
      .filter(({ text }) => matchesSearchWords(text, words))
      .map(({ document, text }) => ({ document, score: this.score(document, text, words) }))
      .sort(
        (left, right) =>
          right.score - left.score || left.document.title.localeCompare(right.document.title),
      )
      .map(({ document }) => document);
    // With a query the most relevant items are kept first and only then spread across courses,
    // so the spread never pushes a strong title match out for a weak one.
    const spread = words.length
      ? this.spreadAcrossCourses(matches.slice(0, 28))
      : this.spreadAcrossCourses(matches).slice(0, 28);
    return this.buildSuggestions(spread, words);
  });

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
    this.content.getSearchIndex().subscribe({ next: (documents) => this.documents.set(withoutHiddenCourseDocuments(documents)) });
  }

  private buildSuggestions(
    documents: SearchDocument[],
    words: readonly string[],
  ): LandingSuggestion[] {
    const folded = new Map(this.foldedDocuments().map(({ document, text }) => [document, text]));
    const candidates: LandingSuggestion[] = [
      ...documents.map((document) => ({
        type: this.documentType(document),
        label: document.title,
        detail:
          document.discoveryKind === 'course' || document.discoveryKind === 'tool'
            ? this.pathLabel(document.path)
            : `${document.courseTitle} · ${document.moduleTitle}`,
        route: document.route ?? ['/', document.path, document.courseId],
        rank: this.score(document, folded.get(document) ?? searchDocumentText(document), words),
      })),
      ...documents
        .filter((document) => !document.discoveryKind)
        .map((document) => ({
          type: 'Module' as const,
          label: document.moduleTitle,
          detail: document.courseTitle,
          route: ['/', document.path, document.courseId, 'module', document.moduleId],
        })),
      ...documents
        .filter((document) => !document.discoveryKind)
        .map((document) => ({
          type: 'Course' as const,
          label: document.courseTitle,
          detail: document.path === 'grow' ? 'Grow capability' : 'Learn competency',
          route: ['/', document.path, document.courseId],
        })),
      ...documents.flatMap((document) =>
        (document.subjects ?? document.tags).map((tag) => ({
          type: 'Topic' as const,
          label: tag,
          detail: `${document.courseTitle} · ${document.moduleTitle}`,
          route: ['/search'],
          queryParams: { tags: tag },
        })),
      ),
    ];
    const unique = new Map<string, LandingSuggestion>();
    for (const candidate of candidates) {
      const key = `${candidate.type}:${candidate.label.toLowerCase()}`;
      if (!unique.has(key)) unique.set(key, candidate);
    }
    // With a query, rows follow relevance: exact titles first, unrelated subjects last.
    const scores = new Map<LandingSuggestion, number>();
    for (const candidate of unique.values())
      scores.set(candidate, words.length ? this.suggestionRank(candidate, words) : 1);
    const available = [...unique.values()].sort(
      (left, right) => scores.get(right)! - scores.get(left)!,
    );
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
      // One row per type only when its label holds every typed word; weak matches wait.
      const typed = available.filter(
        (item) =>
          item.type === type &&
          (!words.length || matchesSearchWords(foldSearchText(item.label), words)),
      );
      const candidate =
        typed.find((item) => !item.detail || !courses.has(item.detail.split(' · ')[0])) ?? typed[0];
      if (candidate) {
        result.push(candidate);
        if (candidate.detail) courses.add(candidate.detail.split(' · ')[0]);
      }
    }
    for (const candidate of available)
      if (result.length < 8 && !result.includes(candidate)) result.push(candidate);
    return words.length
      ? result.sort((left, right) => scores.get(right)! - scores.get(left)!)
      : result;
  }

  private suggestionRank(suggestion: LandingSuggestion, words: readonly string[]): number {
    const kind =
      suggestion.type === 'Course' ? 'course' : suggestion.type === 'Topic' ? 'topic' : undefined;
    const rank = suggestion.rank ?? searchRank({ title: suggestion.label, kind }, words);
    // A subject of a matching item that does not itself hold the words ranks last.
    return suggestion.type === 'Topic' &&
      !matchesSearchWords(foldSearchText(suggestion.label), words)
      ? Math.min(rank, 0.5)
      : rank;
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
    return path === 'blaze' ? 'Blaze' : `${path[0].toUpperCase()}${path.slice(1)}`;
  }

  /** The Search page's relevance (search-text.ts), so Home lists what Search lists first. */
  private score(document: SearchDocument, text: string, words: readonly string[]): number {
    if (!words.length)
      return document.contentType === 'theory' ? 3 : document.contentType === 'dsa-pattern' ? 2 : 1;
    return searchRank(
      {
        title: document.title,
        subjects: [...(document.subjects ?? []), ...document.tags],
        context: [document.courseTitle, document.moduleTitle],
        kind: document.discoveryKind,
        text,
      },
      words,
    );
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
