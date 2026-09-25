import { TestBed } from '@angular/core/testing';
import { EngineeringChallenge } from './engineering-challenge';

describe('EngineeringChallenge', () => {
  function setup() {
    const fixture = TestBed.createComponent(EngineeringChallenge);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.answers button')];
    const next = () => {
      root.querySelector<HTMLButtonElement>('.step-controls button:last-child')!.click();
      fixture.detectChanges();
    };
    return { fixture, root, buttons, next };
  }

  it('starts collapsed, labels disclosure and preserves the answer and reflection on close', () => {
    const { fixture, root, buttons, next } = setup();
    const details = root.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(root.querySelector('summary')?.getAttribute('aria-expanded')).toBe('false');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(root.querySelector('.challenge-toggle')?.textContent).toContain('Close challenge');
    buttons()[1].click();
    fixture.detectChanges();
    next();
    next();
    const reflection = root.querySelector('textarea')!;
    reflection.value = 'Zero is an intentional value.';
    reflection.dispatchEvent(new Event('input'));
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(root.querySelector('textarea')?.value).toBe('Zero is an intentional value.');
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.step-controls button:last-child')?.hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('supports every prediction branch, bounded reasoning steps and intentional challenge reset', () => {
    const { fixture, root, buttons, next } = setup();
    const correct = [1, 0, 2];
    const questions: string[] = [];
    for (let example = 0; example < 3; example++) {
      questions.push(root.querySelector('h3')!.textContent!);
      for (let answer = 0; answer < 3; answer++) {
        buttons()[answer].click();
        fixture.detectChanges();
        expect(root.querySelector('.feedback')?.textContent).toContain(
          answer === correct[example] ? 'That fits the evidence' : 'not supported here',
        );
        expect(root.querySelector('.step-controls button')?.hasAttribute('disabled')).toBe(true);
        next();
        next();
        next();
        expect(root.querySelector('.step-controls .small')?.textContent).toBe('3 / 3');
        expect(root.querySelector('.rule')).not.toBeNull();
      }
      root.querySelector<HTMLButtonElement>('.challenge-end button')!.click();
      fixture.detectChanges();
      expect(root.querySelector('.challenge-evidence')).toBeNull();
      expect(buttons().some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(
        false,
      );
    }
    expect(new Set(questions).size).toBe(3);
    expect(root.querySelector('h3')?.textContent).toBe(questions[0]);
  });

  it('resets transient reflection on a new page instance and exposes no execution or login simulation', () => {
    const { fixture, root } = setup();
    expect(root.textContent).not.toContain('Simulate next login');
    expect(root.querySelector('iframe, form')).toBeNull();
    fixture.destroy();
    const fresh = setup();
    expect(fresh.root.querySelector('details')!.open).toBe(false);
    expect(fresh.root.querySelector('.challenge-evidence')).toBeNull();
  });
});
