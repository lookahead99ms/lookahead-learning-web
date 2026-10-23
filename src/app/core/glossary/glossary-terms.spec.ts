import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Glossary } from '../../content/content.models';
import { GlossaryTerms } from './glossary-terms';

const GLOSSARY: Glossary = {
  schemaVersion: 'glossary/v1',
  path: 'blaze',
  terms: [
    {
      id: 'shard',
      term: 'Shard',
      match: ['shard', 'shards'],
      definition: 'One part of a data set split across databases.',
      lessons: [
        { courseId: 'design-fundamentals', lessonId: 'design-fundamentals-sharding-partitioning-guide', title: 'Sharding' },
        { courseId: 'design-fundamentals', lessonId: 'design-fundamentals-consistent-hashing-guide', title: 'Consistent Hashing' },
      ],
    },
    {
      id: 'replica',
      term: 'Replica',
      match: ['replica', 'replicas'],
      definition: 'A database server that holds a copy of the data.',
      lessons: [
        { courseId: 'design-fundamentals', lessonId: 'design-fundamentals-replication-failover-guide', title: 'Replication' },
        { path: 'grow', courseId: 'aws-cloud', lessonId: 'aws-cloud-storage-databases-guide', title: 'Storage and Databases' },
      ],
    },
  ],
};

@Component({
  imports: [GlossaryTerms],
  template: `
    <article [appGlossaryTerms]="path()" [glossaryLesson]="lesson()">
      <section id="first"><h2>Replicas and shards</h2><p [innerHTML]="html()"></p></section>
      <section id="second"><p>Each shard has <code>replicas</code>.</p></section>
    </article>
  `,
})
class Host {
  readonly path = signal('blaze');
  readonly lesson = signal('design-fundamentals-one-server-to-millions-guide');
  readonly html = signal('A cache, then <strong>replicas</strong>, then shards.');
}

describe('GlossaryTerms', () => {
  let fixture: ComponentFixture<Host>;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;
  const dialogPrototype = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  const original = { showModal: dialogPrototype['showModal'], close: dialogPrototype['close'] };

  beforeEach(() => {
    vi.useFakeTimers();
    dialogPrototype['showModal'] = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    dialogPrototype['close'] = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.inject(Router).navigateByUrl = navigate as unknown as Router['navigateByUrl'];
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    dialogPrototype['showModal'] = original.showModal;
    dialogPrototype['close'] = original.close;
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function marks(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button.glossary-term'));
  }

  async function load(glossary: object = GLOSSARY): Promise<void> {
    http.expectOne('/content/blaze/glossary.json').flush(glossary);
    await settle();
  }

  it('marks the first mention per section once the glossary arrives, skipping code', async () => {
    expect(marks()).toEqual([]);
    await load();
    expect(marks().map((mark) => [mark.closest('section')!.id, mark.textContent])).toEqual([
      ['first', 'replicas'],
      ['first', 'shards'],
      ['second', 'shard'],
    ]);
    expect(fixture.nativeElement.querySelector('h2 .glossary-term')).toBeNull();
  });

  it('marks text that changes after the glossary loaded', async () => {
    await load();
    fixture.componentInstance.html.set('Only replicas now, and a shard.');
    await settle();
    await settle();
    expect(marks().filter((mark) => mark.closest('#first')).map((mark) => mark.textContent)).toEqual(['replicas', 'shard']);
  });

  it('never marks the terms the current lesson teaches', async () => {
    fixture.componentInstance.lesson.set('design-fundamentals-replication-failover-guide');
    await load();
    expect(marks().map((mark) => mark.textContent)).toEqual(['shards', 'shard']);
  });

  it('shows the definition in a tooltip on hover and focus, and hides it again', async () => {
    await load();
    const [mark] = marks();
    mark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.getElementById('glossary-tip')).toBeNull();
    vi.advanceTimersByTime(130);
    const tip = document.getElementById('glossary-tip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.querySelector('.glossary-tip-term')!.textContent).toBe('Replica');
    expect(tip.querySelector('.glossary-tip-text')!.textContent).toBe('A database server that holds a copy of the data.');
    expect(mark.getAttribute('aria-describedby')).toBe('glossary-tip');
    mark.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(tip.hidden).toBe(true);
    expect(mark.hasAttribute('aria-describedby')).toBe(false);

    const second = marks()[1];
    second.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.glossary-tip-term')!.textContent).toBe('Shard');
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tip.hidden).toBe(true);
    second.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    second.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(tip.hidden).toBe(true);
  });

  it('keeps the tooltip while the pointer moves within the mark or the mark has focus', async () => {
    await load();
    const [mark] = marks();
    mark.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const tip = document.getElementById('glossary-tip')!;
    mark.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: mark }));
    expect(tip.hidden).toBe(false);
    mark.focus();
    mark.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(tip.hidden).toBe(false);
    mark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(130);
    expect(tip.hidden).toBe(false);
    window.dispatchEvent(new Event('scroll'));
    expect(tip.hidden).toBe(true);
  });

  it('opens a dialog listing the lessons and navigates to the chosen one', async () => {
    await load();
    const shard = marks()[1];
    shard.click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.glossary-dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('#glossary-dialog-title')!.textContent).toBe('Shard');
    expect(dialog.querySelector('.glossary-definition')!.textContent).toBe('One part of a data set split across databases.');
    const links = Array.from(dialog.querySelectorAll<HTMLAnchorElement>('a.glossary-link'));
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Sharding', '/blaze/design-fundamentals/design-fundamentals-sharding-partitioning-guide'],
      ['Consistent Hashing', '/blaze/design-fundamentals/design-fundamentals-consistent-hashing-guide'],
    ]);
    expect(document.activeElement).toBe(links[0]);
    links[1].click();
    expect(navigate).toHaveBeenCalledWith('/blaze/design-fundamentals/design-fundamentals-consistent-hashing-guide');
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(shard);
  });

  it('closes the dialog from its Close button and from a backdrop click', async () => {
    await load();
    const [mark] = marks();
    mark.click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.glossary-dialog')!;
    expect(Array.from(dialog.querySelectorAll<HTMLAnchorElement>('a.glossary-link')).map((link) => link.getAttribute('href'))).toEqual([
      '/blaze/design-fundamentals/design-fundamentals-replication-failover-guide',
      '/grow/aws-cloud/aws-cloud-storage-databases-guide',
    ]);
    dialog.querySelector<HTMLButtonElement>('.glossary-close')!.click();
    expect(dialog.hasAttribute('open')).toBe(false);
    mark.click();
    expect(dialog.hasAttribute('open')).toBe(true);
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog.hasAttribute('open')).toBe(false);
    dialog.querySelector('.glossary-definition')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('falls back to the open attribute where the dialog API is missing', async () => {
    delete dialogPrototype['showModal'];
    delete dialogPrototype['close'];
    await load();
    const [mark] = marks();
    mark.click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.glossary-dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    dialog.querySelector<HTMLButtonElement>('.glossary-close')!.click();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(mark);
  });

  it('leaves the text alone when the path has no glossary', async () => {
    http.expectOne('/content/blaze/glossary.json').flush('missing', { status: 404, statusText: 'Not Found' });
    await settle();
    expect(marks()).toEqual([]);
    expect(fixture.nativeElement.querySelector('#first p')!.innerHTML).toBe('A cache, then <strong>replicas</strong>, then shards.');
  });

  it('removes its tooltip and dialog when the host is destroyed', async () => {
    await load();
    marks()[0].click();
    marks()[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.querySelector('dialog.glossary-dialog')).not.toBeNull();
    fixture.destroy();
    expect(document.querySelector('dialog.glossary-dialog')).toBeNull();
    expect(document.getElementById('glossary-tip')).toBeNull();
  });
});
