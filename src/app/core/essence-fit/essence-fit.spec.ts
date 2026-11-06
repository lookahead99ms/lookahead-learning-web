import { Component, ElementRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fitEssence, keepEssenceFitted } from './essence-fit';

/** DLV-969 (owner, 2026-11-04): /welcome and locked lessons fit the screen without scrolling. */
describe('fitEssence', () => {
  const view = window as unknown as { innerWidth: number; innerHeight: number };
  let size: [number, number];
  beforeEach(() => (size = [view.innerWidth, view.innerHeight]));
  afterEach(() => Object.assign(view, { innerWidth: size[0], innerHeight: size[1] }));

  function essence(top: number, height: number, pageHeight: number) {
    const element = document.createElement('section');
    element.getBoundingClientRect = () => ({ top, height, width: 1216 } as DOMRect);
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: pageHeight });
    return element;
  }

  it('scales it to the height left between what is above and what the page still shows below', () => {
    Object.assign(view, { innerWidth: 1440, innerHeight: 900 });
    const card = essence(250, 740, 250 + 740 + 100);
    fitEssence(card);
    expect(Number(card.style.getPropertyValue('zoom'))).toBe(Math.floor(((900 - 250 - 100 - 2) / 740) * 1000) / 1000);
  });

  it('scales the stage inside the card, never the card itself (owner, 2026-11-06)', () => {
    Object.assign(view, { innerWidth: 1440, innerHeight: 1000 });
    const card = essence(250, 740, 250 + 740 + 100);
    const stage = document.createElement('div');
    stage.className = 'essence-stage';
    stage.getBoundingClientRect = () => ({ top: 310, height: 620, width: 1096 } as DOMRect);
    card.append(stage);
    fitEssence(card);
    // Below the stage: the page's 1090px less the stage's bottom at 930px, so the card's padding and the footer.
    expect(Number(stage.style.getPropertyValue('zoom'))).toBe(Math.floor(((1000 - 310 - 160 - 2) / 620) * 1000) / 1000);
    expect(card.style.getPropertyValue('zoom')).toBe('');
    expect(card.style.getPropertyValue('width')).toBe('');
    expect(stage.style.getPropertyValue('width')).toBe('');
  });

  it('in screen mode fits the window height below the header, whatever the page shows below (owner, 2026-11-06)', () => {
    Object.assign(view, { innerWidth: 1512, innerHeight: 982 });
    const header = document.createElement('div');
    header.className = 'platform-header';
    header.getBoundingClientRect = () => ({ height: 85 } as DOMRect);
    document.body.append(header);
    try {
      const card = essence(2400, 1100, 4000);
      fitEssence(card, { screen: true });
      expect(Number(card.style.getPropertyValue('zoom'))).toBe(Math.floor(((982 - 85 - 40) / 1100) * 1000) / 1000);
      expect(card.style.getPropertyValue('width')).toBe('');
      fitEssence(card);
      expect(card.style.getPropertyValue('zoom')).toBe('0.72');
    } finally {
      header.remove();
    }
  });

  it('never grows it, never shrinks it below readable, and leaves phones and unmeasured cards alone', () => {
    Object.assign(view, { innerWidth: 1920, innerHeight: 2000 });
    const card = essence(100, 700, 900);
    fitEssence(card);
    expect(card.style.getPropertyValue('zoom')).toBe('1');
    Object.assign(view, { innerWidth: 1280, innerHeight: 300 });
    fitEssence(card);
    expect(card.style.getPropertyValue('zoom')).toBe('0.72');
    Object.assign(view, { innerWidth: 390, innerHeight: 844 });
    fitEssence(card);
    expect(card.style.getPropertyValue('zoom')).toBe('1');
    Object.assign(view, { innerWidth: 1440 });
    const empty = essence(100, 0, 900);
    fitEssence(empty);
    expect(empty.style.getPropertyValue('zoom')).toBe('1');
    expect(() => fitEssence(null)).not.toThrow();
  });

  it('fits once drawn and again after a resize, and stops listening when the page goes', async () => {
    @Component({ selector: 'app-fit-host', template: '<section class="home-essence"></section>' })
    class FitHost {
      constructor() { keepEssenceFitted(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement); }
    }
    Object.assign(view, { innerWidth: 1440, innerHeight: 900 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 900 });
    const fixture = TestBed.createComponent(FitHost);
    const card = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('section')!;
    card.getBoundingClientRect = () => ({ top: 100, height: 1000 } as DOMRect);
    fixture.detectChanges();
    await fixture.whenStable();
    const first = card.style.getPropertyValue('zoom');
    expect(Number(first)).toBeLessThan(1);
    Object.assign(view, { innerHeight: 2000 });
    window.dispatchEvent(new Event('resize'));
    await new Promise((done) => requestAnimationFrame(() => done(null)));
    expect(card.style.getPropertyValue('zoom')).toBe('1');
    fixture.destroy();
    Object.assign(view, { innerHeight: 500 });
    window.dispatchEvent(new Event('resize'));
    await new Promise((done) => requestAnimationFrame(() => done(null)));
    expect(card.style.getPropertyValue('zoom')).toBe('1');
  });
});
