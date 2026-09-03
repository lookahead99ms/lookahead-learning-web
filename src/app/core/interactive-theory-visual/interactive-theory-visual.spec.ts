import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InteractiveTheoryVisual } from './interactive-theory-visual';

describe('InteractiveTheoryVisual', () => {
  let fixture: ComponentFixture<InteractiveTheoryVisual>;
  let frame: HTMLIFrameElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InteractiveTheoryVisual],
    }).compileComponents();

    fixture = TestBed.createComponent(InteractiveTheoryVisual);
    fixture.componentRef.setInput('visual', {
      type: 'interactive',
      assetPath: '/content/learn/course/visuals/model.html',
      alt: 'Interactive model',
    });
    fixture.detectChanges();
    frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
  });

  it('uses the exact reported content height without cumulative growth', () => {
    const report = () =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frame.contentWindow,
          data: { type: 'algorithmic-visual-height', height: 612.2 },
        }),
      );

    report();
    fixture.detectChanges();
    expect(frame.style.height).toBe('613px');

    report();
    fixture.detectChanges();
    expect(frame.style.height).toBe('613px');
  });

  it('ignores height messages from another source', () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { type: 'algorithmic-visual-height', height: 900 },
      }),
    );
    fixture.detectChanges();

    expect(frame.style.height).toBe('280px');
  });
});
