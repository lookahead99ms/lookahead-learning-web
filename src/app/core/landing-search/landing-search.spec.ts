import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';
import { LandingSearch } from './landing-search';

describe('LandingSearch topic suggestions', () => {
  const urlShortener: SearchDocument = {
    id: 'learn:solid-design-patterns:lld-url-shortener',
    contentId: 'lld-url-shortener',
    path: 'learn',
    courseId: 'solid-design-patterns',
    courseTitle: 'Object-Oriented Design and SOLID',
    moduleId: 'lld-practice',
    moduleTitle: 'Low-Level Design Practice',
    title: 'Design a URL Shortener at the LLD Level',
    contentType: 'q-and-a',
    discoveryKind: 'practice',
    practiceFormat: 'explain',
    subjects: ['Reusable Platform Components LLD'],
    tags: ['Low-Level Design', 'URL Shortener', 'Repository'],
    filterTags: ['Learn', 'Q&A'],
    languages: ['java'],
    difficulty: 'Intermediate',
    preview: '',
    access: { tier: 'free' },
    searchableText: 'design a url shortener at the lld level url shortener repository',
    route: ['/', 'learn', 'solid-design-patterns', 'lld-url-shortener'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingSearch],
      providers: [
        provideRouter([]),
        { provide: ContentService, useValue: { getSearchIndex: () => of([urlShortener]) } },
      ],
    }).compileComponents();
  });

  it('routes only curated subjects through the Search subject parameter', async () => {
    const fixture = TestBed.createComponent(LandingSearch);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.landing-search-input') as HTMLInputElement;
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = 'URL Shortener';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const topicButtons = [
      ...(fixture.nativeElement.querySelectorAll(
        '.landing-search-result',
      ) as NodeListOf<HTMLButtonElement>),
    ].filter(
      (button) =>
        button.querySelector('.landing-search-result-type')?.textContent?.trim() === 'Topic',
    );
    expect(topicButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Reusable Platform Components LLD'),
    ]);
    expect(topicButtons.map((button) => button.textContent).join(' ')).not.toContain(
      'URL Shortener',
    );

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    topicButtons[0].click();
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { tags: 'Reusable Platform Components LLD' },
    });
  });
});

describe('LandingSearch uses the shared Search matcher', () => {
  const document = (id: string, title: string, extra: Partial<SearchDocument> = {}) =>
    ({
      id: `learn:course-${id}:${id}`,
      contentId: id,
      path: 'learn',
      courseId: `course-${id}`,
      courseTitle: `Course ${id}`,
      moduleId: 'module',
      moduleTitle: 'Module',
      title,
      contentType: 'q-and-a',
      subjects: [],
      tags: [],
      filterTags: ['Learn'],
      languages: ['java'],
      difficulty: 'Beginner',
      preview: '',
      access: { tier: 'free' },
      searchableText: title.toLowerCase(),
      route: ['/', 'learn', `course-${id}`, id],
      ...extra,
    }) as SearchDocument;

  const twoSum = document('two-sum', 'Two-Sum With a Hash Map');
  const deadlock = document('deadlock', 'Why Threads Deadlock');
  const summary = document('summary', 'Summary Statistics in Java');
  const assume = document('assume', 'What You Can Assume About Ordering');
  const queues = document('queues', 'Message Queues and Retries');

  async function typed(query: string, documents: SearchDocument[]) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LandingSearch],
      providers: [
        provideRouter([]),
        { provide: ContentService, useValue: { getSearchIndex: () => of(documents) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(LandingSearch);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.landing-search-input') as HTMLInputElement;
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = query;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      labels: [...element.querySelectorAll('.landing-search-result-label')].map((label) =>
        label.textContent?.trim(),
      ),
      correction: element.querySelector('.landing-search-correction')?.textContent?.trim() ?? null,
      empty: element.querySelector('.landing-search-empty')?.textContent?.trim() ?? null,
    };
  }

  const all = [twoSum, deadlock, summary, assume, queues];

  it('matches every word in any order, ignoring quotes, case and hyphen/space', async () => {
    expect((await typed('map hash', all)).labels).toContain('Two-Sum With a Hash Map');
    expect((await typed('"two sum"', all)).labels).toContain('Two-Sum With a Hash Map');
    expect((await typed('hash tree', all)).labels).toEqual([]);
  });

  it('matches singular and plural forms and longer words inside words', async () => {
    expect((await typed('queue retry', all)).labels).toContain('Message Queues and Retries');
    expect((await typed('lock', all)).labels).toContain('Why Threads Deadlock');
  });

  it('requires words of up to three letters to start a word', async () => {
    const { labels } = await typed('sum', all);
    expect(labels).toContain('Summary Statistics in Java');
    expect(labels).toContain('Two-Sum With a Hash Map');
    expect(labels).not.toContain('What You Can Assume About Ordering');
  });

  it('ranks an exact title above an item that only mentions the words', async () => {
    const exact = document('threads', 'Threads');
    const { labels } = await typed('threads', [deadlock, exact]);
    expect(labels.indexOf('Threads')).toBeLessThan(labels.indexOf('Why Threads Deadlock'));
  });

  it('offers a spelling fix only when nothing matches, and names it on screen', async () => {
    const fixed = await typed('deadlcok', all);
    expect(fixed.labels).toContain('Why Threads Deadlock');
    expect(fixed.correction).toBe('No matches for “deadlcok”. Showing matches for “deadlock”.');

    const exact = await typed('deadlock', all);
    expect(exact.correction).toBeNull();
  });

  it('says nothing matched instead of asking the visitor to start typing', async () => {
    const none = await typed('zzzzqqqq', all);
    expect(none.labels).toEqual([]);
    expect(none.correction).toBeNull();
    expect(none.empty).toBe('No matches for “zzzzqqqq”.');
  });
});
