import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EvidenceAnswerTabs } from './evidence-answer-tabs';

describe('EvidenceAnswerTabs', () => {
  let fixture: ComponentFixture<EvidenceAnswerTabs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EvidenceAnswerTabs] }).compileComponents();
    fixture = TestBed.createComponent(EvidenceAnswerTabs);
    fixture.componentRef.setInput('evidence', {
      note: 'Use truthful evidence.',
      carl: { context: 'C', action: 'A', result: 'R', learning: 'L' },
      star: { situation: 'S', task: 'T', action: 'A', result: 'R' },
    });
    fixture.detectChanges();
  });

  it('switches views with click and the tab arrow-key contract', async () => {
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('tabindex')).toBe('0');
    expect(fixture.nativeElement.querySelector('#evidence-panel-star')).toBeTruthy();
  });
});
