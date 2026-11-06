import { TestBed } from '@angular/core/testing';
import { ReportTips } from './report-tips';

describe('A helpful report strip (DLV-971)', () => {
  it('lists the four tips under a small label, in order', () => {
    TestBed.configureTestingModule({ imports: [ReportTips] });
    const fixture = TestBed.createComponent(ReportTips);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.tips-label')?.textContent?.trim()).toBe('A helpful report');
    expect(root.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('A helpful report');
    expect(
      [...root.querySelectorAll('li > span:last-child')].map((tip) =>
        tip.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual([
      'Steps you took, in order.',
      'What you expected and what happened instead.',
      'The page address, such as /learn/core-java.',
      'A screenshot when the screen looks wrong.',
    ]);
    expect([...root.querySelectorAll('.tip-icon')].map((icon) => icon.textContent)).toEqual([
      '👣',
      '🎯',
      '🔗',
      '🖼️',
    ]);
    expect(root.querySelectorAll('li strong')).toHaveLength(4);
  });
});
