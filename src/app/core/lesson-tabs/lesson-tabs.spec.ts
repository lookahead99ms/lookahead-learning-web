import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LessonTabItem, LessonTabs } from './lesson-tabs';

@Component({
  imports: [LessonTabs],
  template: `<app-lesson-tabs [items]="items" [selected]="selected()" idPrefix="demo" ariaLabel="Common mistakes" (select)="selected.set($event)" />`,
})
class Host {
  readonly items: LessonTabItem[] = [
    { key: '1', label: 'Counting brackets', title: 'Counting brackets instead of keeping them' },
    { key: '2', label: 'Empty stack' },
    { key: '3', label: 'Shrinking window' },
  ];
  readonly selected = signal(0);
}

describe('LessonTabs', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const tabs = () => Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    return { fixture, element, tabs };
  }

  it('renders an ARIA tab list wired to its panels', () => {
    const { element, tabs } = render();
    expect(element.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Common mistakes');
    expect(tabs().map((tab) => tab.getAttribute('aria-controls'))).toEqual(['demo-panel-0', 'demo-panel-1', 'demo-panel-2']);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs()[0].title).toBe('Counting brackets instead of keeping them');
  });

  it('selects on click and moves with arrow keys, Home and End', () => {
    const { fixture, tabs } = render();
    tabs()[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe(1);
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe(2);
    expect(document.activeElement === tabs()[2] || !tabs()[2].isConnected).toBe(true);
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe(0);
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe(2);
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe(0);
  });

  it('hides both scroll chevrons when every tab fits', () => {
    const { element } = render();
    const more = Array.from(element.querySelectorAll<HTMLButtonElement>('.tab-more'));
    expect(more.length).toBe(2);
    expect(more.every((button) => button.hidden)).toBe(true);
  });
});
