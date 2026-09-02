import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';

type LandingSuggestion = {
  type: 'Question' | 'Theory' | 'DSA' | 'Module' | 'Course' | 'Topic';
  label: string;
  detail?: string;
  route: string[];
  queryParams?: Record<string, string>;
};

@Component({
  selector: 'app-landing-search',
  imports: [FormsModule],
  templateUrl: './landing-search.html',
  styles: [`
    .landing-search { position: relative; z-index: 2; width: min(660px, 100%); margin: 0 auto; text-align: left; }
    .landing-search-form { position: relative; }
    .landing-search-icon { position: absolute; top: 50%; left: 20px; width: 20px; height: 20px; color: #5f96d1; pointer-events: none; transform: translateY(-50%); }
    .landing-search-input { box-sizing: border-box; width: 100%; height: 50px; padding: 0 48px 0 48px; border: 1px solid #cbd8e8; border-radius: 999px; color: #172033; background: rgba(255, 255, 255, .96); box-shadow: 0 10px 28px rgba(30, 64, 102, .1); font: inherit; font-size: .95rem; transition: border-color 160ms ease, box-shadow 160ms ease, border-radius 160ms ease; }
    .landing-search-input:focus { border-color: #65bfe4; outline: 3px solid rgba(101, 191, 228, .22); box-shadow: 0 14px 34px rgba(30, 64, 102, .14); }
    .landing-search.open .landing-search-input { border-radius: 18px 18px 0 0; border-bottom-color: transparent; }
    .landing-search-clear { position: absolute; top: 50%; right: 16px; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; color: #4771a8; background: transparent; cursor: pointer; font: inherit; font-size: 1.5rem; line-height: 1; transform: translateY(-50%); }
    .landing-search-clear:hover, .landing-search-clear:focus-visible { color: #172033; background: #eef5fb; outline: none; }
    .landing-search-dropdown { position: absolute; top: 50px; left: 0; width: 100%; box-sizing: border-box; overflow: hidden; border: 1px solid #cbd8e8; border-top: 0; border-radius: 0 0 18px 18px; background: rgba(255, 255, 255, .98); box-shadow: 0 18px 40px rgba(30, 64, 102, .18); }
    .landing-search-stages { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 14px; border-bottom: 1px solid #e1e9f2; }
    .landing-search-stage { min-height: 38px; padding: 8px 10px; border: 0; border-radius: 8px; color: #334155; background: #f7f9fc; cursor: pointer; font: inherit; font-size: .84rem; font-weight: 760; }
    .landing-search-stage:hover, .landing-search-stage:focus-visible { background: #e7f4fb; outline: none; }
    .landing-search-stage.learn { color: #168ca5; }
    .landing-search-stage.grow { color: #b45309; }
    .landing-search-stage.look-ahead { color: #334155; }
    .landing-search-stage.search { color: #5f96d1; }
    .landing-search-results { max-height: 360px; overflow: auto; padding: 6px 0; }
    .landing-search-result { display: grid; grid-template-columns: 76px minmax(0, 1fr); column-gap: 14px; width: 100%; padding: 11px 18px; border: 0; color: #172033; background: transparent; cursor: pointer; font: inherit; text-align: left; }
    .landing-search-result:hover, .landing-search-result:focus-visible { background: #edf7fc; outline: none; }
    .landing-search-result-type { padding-top: 2px; color: #5f96d1; font-size: .66rem; font-weight: 850; letter-spacing: .06em; text-transform: uppercase; }
    .landing-search-result-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .93rem; font-weight: 730; }
    .landing-search-result-detail { grid-column: 2; overflow: hidden; margin-top: 2px; color: #65758b; text-overflow: ellipsis; white-space: nowrap; font-size: .76rem; }
    .landing-search-empty { margin: 0; padding: 26px 18px; color: #64748b; text-align: center; font-size: .9rem; }
    .landing-search-hint { display: flex; justify-content: space-between; gap: 14px; padding: 11px 18px; border-top: 1px solid #e1e9f2; color: #64748b; font-size: .75rem; }
    .landing-search-hint kbd { padding: 1px 5px; border: 1px solid #cbd5e1; border-radius: 4px; color: #475569; background: #f8fafc; font: inherit; font-size: .7rem; }
    @media (max-width: 620px) { .landing-search-input { height: 48px; font-size: .88rem; } .landing-search-dropdown { top: 48px; } .landing-search-stages { grid-template-columns: repeat(2, 1fr); } .landing-search-hint span:last-child { display: none; } }
  `],
})
export class LandingSearch {
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private loaded = false;

  protected readonly query = signal('');
  protected readonly open = signal(false);
  private readonly documents = signal<SearchDocument[]>([]);
  protected readonly suggestions = computed(() => this.buildSuggestions(this.documents(), this.query().trim().toLowerCase()));

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
  protected onEscape(): void { this.close(); }

  @HostListener('window:scroll')
  protected onScroll(): void { if (this.open()) this.close(); }

  @HostListener('document:click', ['$event'])
  protected onOutsideClick(event: MouseEvent): void {
    if (this.open() && !event.composedPath().includes(this.elementRef.nativeElement)) this.close();
  }

  private close(): void {
    this.open.set(false);
    (this.elementRef.nativeElement.querySelector('input') as HTMLInputElement | null)?.blur();
  }

  private focusInput(): void {
    requestAnimationFrame(() => (this.elementRef.nativeElement.querySelector('input') as HTMLInputElement | null)?.focus());
  }

  private loadIndex(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.content.getSearchIndex().subscribe({ next: (documents) => this.documents.set(documents) });
  }

  private buildSuggestions(documents: SearchDocument[], query: string): LandingSuggestion[] {
    const matches = documents
      .filter((document) => !query || document.searchableText.includes(query))
      .sort((a, b) => this.score(b, query) - this.score(a, query) || a.title.localeCompare(b.title));
    const spread = this.spreadAcrossCourses(matches).slice(0, 28);
    const candidates: LandingSuggestion[] = [
      ...spread.map((document) => ({
        type: document.contentType === 'theory' ? 'Theory' as const : document.contentType === 'dsa-pattern' ? 'DSA' as const : 'Question' as const,
        label: document.title,
        detail: `${document.courseTitle} · ${document.moduleTitle}`,
        route: document.route ?? ['/', document.path, document.courseId],
      })),
      ...spread.map((document) => ({ type: 'Module' as const, label: document.moduleTitle, detail: document.courseTitle, route: ['/', document.path, document.courseId, 'module', document.moduleId] })),
      ...spread.map((document) => ({ type: 'Course' as const, label: document.courseTitle, detail: document.path === 'grow' ? 'Grow capability' : 'Learn competency', route: ['/', document.path, document.courseId] })),
      ...spread.flatMap((document) => document.tags.map((tag) => ({ type: 'Topic' as const, label: tag, detail: `${document.courseTitle} · ${document.moduleTitle}`, route: ['/search'], queryParams: { tags: tag } }))),
    ];
    const unique = [...new Map(candidates.map((candidate) => [`${candidate.type}:${candidate.label.toLowerCase()}`, candidate])).values()];
    const result: LandingSuggestion[] = [];
    const courses = new Set<string>();
    for (const type of ['Theory', 'Question', 'DSA', 'Module', 'Course', 'Topic'] as const) {
      const typed = unique.filter((candidate) => candidate.type === type);
      const candidate = typed.find((item) => !item.detail || !courses.has(item.detail.split(' · ')[0])) ?? typed[0];
      if (candidate) { result.push(candidate); if (candidate.detail) courses.add(candidate.detail.split(' · ')[0]); }
    }
    for (const candidate of unique) if (result.length < 8 && !result.includes(candidate)) result.push(candidate);
    return result;
  }

  private score(document: SearchDocument, query: string): number {
    if (!query) return document.contentType === 'theory' ? 3 : document.contentType === 'dsa-pattern' ? 2 : 1;
    const title = document.title.toLowerCase();
    if (title === query) return 100;
    if (title.includes(query)) return 80;
    if (document.moduleTitle.toLowerCase().includes(query) || document.courseTitle.toLowerCase().includes(query)) return 60;
    return 20;
  }

  private spreadAcrossCourses(documents: SearchDocument[]): SearchDocument[] {
    const queues = [...documents.reduce((map, document) => {
      const key = `${document.path}:${document.courseId}`;
      map.set(key, [...(map.get(key) ?? []), document]);
      return map;
    }, new Map<string, SearchDocument[]>()).values()];
    const result: SearchDocument[] = [];
    while (queues.some((queue) => queue.length)) for (const queue of queues) { const next = queue.shift(); if (next) result.push(next); }
    return result;
  }
}
