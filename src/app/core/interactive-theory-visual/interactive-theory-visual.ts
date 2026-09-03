import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TheoryVisual } from '../../content/content.models';

@Component({
  selector: 'app-interactive-theory-visual',
  template: `
    @if (safeSource(); as source) {
      <iframe
        #frame
        class="interactive-theory-frame"
        [src]="source"
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        loading="lazy"
        [title]="visual().alt"
        [style.height.px]="frameHeight()"
      ></iframe>
    }
  `,
  styles: [
    `
      .interactive-theory-frame {
        display: block;
        width: 100%;
        min-height: 0;
        border: 0;
        background: #ffffff;
      }
    `,
  ],
})
export class InteractiveTheoryVisual {
  readonly visual = input.required<TheoryVisual>();
  // The embedded visual reports its own document height. A compact starting
  // height prevents a blank panel while that first postMessage arrives.
  protected readonly frameHeight = signal(280);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly sanitizer = inject(DomSanitizer);

  @HostListener('window:message', ['$event'])
  protected updateFrameHeight(event: MessageEvent): void {
    // Several local visuals can exist on an article. Only the iframe that sent
    // this event may resize itself; otherwise another visual can create space
    // far below this one while the reader scrolls.
    if (event.source !== this.frame()?.nativeElement.contentWindow) return;
    const height = event.data?.type === 'algorithmic-visual-height' ? event.data.height : null;
    if (typeof height === 'number' && Number.isFinite(height)) {
      // Narrow-screen teaching visuals can legitimately exceed 2,500px after
      // their cards stack. Bound only extreme reports so mobile content is not
      // clipped or forced into a nested scrollbar.
      // Apply the reported height exactly. Adding padding here causes a resize
      // feedback loop for documents whose scrollHeight is at least the iframe
      // viewport height: 280 becomes 288, then 296, until the safety cap.
      this.frameHeight.set(Math.max(260, Math.min(Math.ceil(height), 3200)));
    }
  }

  protected readonly safeSource = computed<SafeResourceUrl | null>(() => {
    const path = this.visual().assetPath;
    // Course JSON is authored content, but the renderer still accepts only
    // local, static HTML assets rather than arbitrary remote embeds.
    if (
      !/^\/content\/.+\.html(?:\?v=[a-z0-9-]+|\?mode=[a-z0-9-]+|\?track=[a-z0-9-]+|\?lang=(?:java|python|go)&input=(?:default|zero|negative)&problem=[a-z0-9-]+&source=[a-z0-9%+/_=-]+)?(?:#[a-z0-9-]+)?$/i.test(
        path,
      )
    )
      return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(path);
  });
}
