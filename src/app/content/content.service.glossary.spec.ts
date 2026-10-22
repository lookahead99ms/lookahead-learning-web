import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from './content.models';
import { ContentService } from './content.service';

const TERM: GlossaryTerm = {
  id: 'shard',
  term: 'Shard',
  match: ['shard'],
  definition: 'One part of a split data set.',
  lessons: [{ courseId: 'design-fundamentals', lessonId: 'design-fundamentals-sharding-partitioning-guide', title: 'Sharding' }],
};

describe('ContentService glossary', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    return { service: TestBed.inject(ContentService), http: TestBed.inject(HttpTestingController) };
  }

  it('loads a path glossary once and keeps only well-formed terms', () => {
    const { service, http } = setup();
    const results: GlossaryTerm[][] = [];
    service.getGlossary('blaze').subscribe((terms) => results.push(terms));
    http.expectOne('/content/blaze/glossary.json').flush({
      schemaVersion: 'glossary/v1',
      path: 'blaze',
      terms: [TERM, { id: 'broken', term: 'Broken' }, { ...TERM, id: 'no-lessons', lessons: [] }, { ...TERM, id: 'bad-skip', skipLessons: [1] }, null],
    });
    service.getGlossary('blaze').subscribe((terms) => results.push(terms));
    http.expectNone('/content/blaze/glossary.json');
    expect(results).toEqual([[TERM], [TERM]]);
    http.verify();
  });

  it('yields no terms for a bad path, a missing file or a foreign schema', () => {
    const { service, http } = setup();
    const results: GlossaryTerm[][] = [];
    service.getGlossary('../etc').subscribe((terms) => results.push(terms));
    http.expectNone('/content/../etc/glossary.json');
    service.getGlossary('learn').subscribe((terms) => results.push(terms));
    http.expectOne('/content/learn/glossary.json').flush('missing', { status: 404, statusText: 'Not Found' });
    service.getGlossary('grow').subscribe((terms) => results.push(terms));
    http.expectOne('/content/grow/glossary.json').flush({ schemaVersion: 'other/v1', terms: [TERM] });
    expect(results).toEqual([[], [], []]);
    http.verify();
  });
});
