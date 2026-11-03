import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { EssenceStory } from './essence-story';

@Component({ imports: [EssenceStory], template: '<section appEssenceStory></section>' })
class Host {}

describe('EssenceStory', () => {
  afterEach(() => vi.useRealTimers());

  it('is the section itself: same classes, heading, children and sidebar label as the homepage had', () => {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const essence: HTMLElement = fixture.nativeElement.querySelector('section');
    expect(essence.classList.contains('brand-story')).toBe(true);
    expect(essence.classList.contains('home-essence')).toBe(true);
    expect(essence.getAttribute('aria-labelledby')).toBe('brand-story-title');
    expect([...essence.children].map((child) => child.tagName.toLowerCase()).filter((tag) => tag.startsWith('app-'))).toEqual([
      'app-platform-brand',
      'app-wordmark-key',
      'app-essence-steps',
    ]);
    expect(essence.querySelector('.brand-context')?.textContent).toBe('Our platform');
    expect(essence.querySelector('#brand-story-title')?.getAttribute('data-sidebar-label')).toBe('The essence');
    expect(essence.querySelector('app-platform-brand.essence-corner-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(essence.hasAttribute('data-motion')).toBe(false);
    expect(essence.hasAttribute('data-skip')).toBe(false);
  });

  it('plays the wordmark, then the statements and steps; pauses, skips, loops and restarts', () => {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const essence: HTMLElement = fixture.nativeElement.querySelector('section');
    const steps = essence.querySelector('app-essence-steps');
    const sentence = essence.querySelector('.essence-sentence');
    const key = fixture.debugElement.query((node) => node.name === 'app-wordmark-key');
    const stepsNode = fixture.debugElement.query((node) => node.name === 'app-essence-steps');
    // The wordmark's light travels across the section itself.
    expect(key.componentInstance.stageElement()).toBe(essence);
    expect(steps?.getAttribute('data-state')).toBe('hidden');
    expect(sentence?.classList.contains('shown')).toBe(false);

    key.triggerEventHandler('finished');
    fixture.detectChanges();
    expect(steps?.getAttribute('data-state')).toBe('shown');
    expect(sentence?.classList.contains('shown')).toBe(true);
    expect(sentence?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Look ahead to the obstacle, put AI to work in your code, explore and engineer with algorithms and architecture, and find the way through.',
    );

    stepsNode.triggerEventHandler('settled');
    key.triggerEventHandler('passed');
    fixture.detectChanges();
    expect(key.componentInstance.settled()).toBe(true);
    expect(stepsNode.componentInstance.loop()).toBe(1);

    key.triggerEventHandler('stillChange', true);
    fixture.detectChanges();
    expect(essence.getAttribute('data-motion')).toBe('still');
    expect(stepsNode.componentInstance.still()).toBe(true);
    key.triggerEventHandler('stillChange', false);

    key.triggerEventHandler('cycle', 'apart');
    fixture.detectChanges();
    expect(steps?.hasAttribute('data-away')).toBe(true);
    key.triggerEventHandler('cycle', 'joined');
    fixture.detectChanges();
    expect(steps?.hasAttribute('data-away')).toBe(false);

    vi.useFakeTimers();
    key.triggerEventHandler('cycle', 'apart');
    key.triggerEventHandler('skipped');
    fixture.detectChanges();
    expect(essence.hasAttribute('data-skip')).toBe(true);
    expect(steps?.hasAttribute('data-away')).toBe(false);
    expect(stepsNode.componentInstance.instant()).toBe(true);
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(essence.hasAttribute('data-skip')).toBe(false);
    vi.useRealTimers();

    key.triggerEventHandler('restarted');
    fixture.detectChanges();
    expect(steps?.getAttribute('data-state')).toBe('hidden');
    expect(sentence?.classList.contains('shown')).toBe(false);
    expect(stepsNode.componentInstance.loop()).toBe(0);
    expect(key.componentInstance.settled()).toBe(false);
    expect(essence.hasAttribute('data-motion')).toBe(false);
  });
});
