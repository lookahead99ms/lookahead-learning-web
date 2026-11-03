import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { PathMarks } from './path-marks';

it('lists the three paths with their landing wording and path colours', () => {
  const fixture = TestBed.createComponent(PathMarks);
  fixture.detectChanges();
  const rows = [...fixture.nativeElement.querySelectorAll('li')] as HTMLElement[];
  expect(rows.map((row) => row.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
    'Learn Understand the fundamentals',
    'Grow Handle production reality',
    'Blaze Lead the larger decision',
  ]);
  expect(rows.map((row) => [...row.classList].sort().join(' '))).toEqual(['path-learn path-mark', 'path-grow path-mark', 'path-blaze path-mark']);
  expect(rows.every((row) => row.querySelector('.path-icon')!.getAttribute('aria-hidden') === 'true')).toBe(true);
});
