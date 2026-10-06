import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PracticeDisplayStatus } from './practice-progress';
import { PracticeStatusMark } from './practice-status-mark';

@Component({
  imports: [PracticeStatusMark],
  template: `<app-practice-status-mark
    [status]="status()"
    [compact]="compact()"
    [markOnly]="markOnly()"
  />`,
})
class Host {
  readonly status = signal<PracticeDisplayStatus>(null);
  readonly compact = signal(false);
  readonly markOnly = signal(false);
}

describe('PracticeStatusMark', () => {
  function render(status: PracticeDisplayStatus, options: { compact?: boolean; markOnly?: boolean }) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.status.set(status);
    fixture.componentInstance.compact.set(options.compact ?? false);
    fixture.componentInstance.markOnly.set(options.markOnly ?? false);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('app-practice-status-mark') as HTMLElement;
  }

  it('shows an empty outlined circle for a problem not started in a mark-only column', () => {
    const mark = render(null, { compact: true, markOnly: true });
    expect(mark.getAttribute('data-status')).toBe('none');
    const circle = mark.querySelector('.mark')!;
    expect(circle.classList).toContain('empty');
    expect(circle.getAttribute('aria-hidden')).toBe('true');
    // Nothing inside the circle: the outline alone says "not started".
    expect(circle.textContent).toBe('');
    // Screen readers and the tooltip still say it in words.
    expect(mark.querySelector('.label')!.textContent!.trim()).toBe('Not started');
    expect(mark.getAttribute('title')).toBe('Not started');
  });

  it('shows the same empty circle in a compact list', () => {
    const mark = render(null, { compact: true });
    expect(mark.querySelector('.mark.empty')).not.toBeNull();
    expect(mark.querySelector('.label')!.textContent!.trim()).toBe('Not started');
    expect(mark.getAttribute('title')).toBeNull();
  });

  it('keeps a full-size status without a circle when nothing is started', () => {
    const mark = render(null, {});
    expect(mark.querySelector('.mark')).toBeNull();
    expect(mark.querySelector('.label.none')!.textContent!.trim()).toBe('Not started');
  });

  it.each([
    ['solved', '✓', 'Solved'],
    ['started', '…', 'Started'],
    ['review-due', '↻', 'Review due'],
  ] as const)('marks %s with %s and its label', (status, glyph, label) => {
    const mark = render(status, { compact: true, markOnly: true });
    const circle = mark.querySelector('.mark')!;
    expect(circle.classList).not.toContain('empty');
    expect(circle.textContent).toBe(glyph);
    expect(mark.querySelector('.label')!.textContent).toBe(label);
    expect(mark.getAttribute('title')).toBe(label);
  });
});
