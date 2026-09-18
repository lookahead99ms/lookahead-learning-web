import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  ArchitectureDiagramId,
  architectureDiagramHref,
  architectureDiagrams,
  connectArchitectureFrame,
} from './architecture-diagram-protocol';

@Component({
  selector: 'app-architecture-diagram-viewer',
  templateUrl: './architecture-diagram-viewer.html',
  styleUrl: './architecture-diagram-viewer.css',
})
export class ArchitectureDiagramViewer {
  readonly documentHref = input.required<string>();
  readonly diagramId = input.required<ArchitectureDiagramId>();
  readonly dismissed = output<void>();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  protected readonly href = computed(() =>
    architectureDiagramHref(this.documentHref(), this.diagramId()),
  );
  protected readonly safeHref = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.href()),
  );
  protected readonly title = computed(() => architectureDiagrams[this.diagramId()]);
  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly zoom = signal(1);
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly size = signal({ width: 1, height: 1 });
  protected readonly viewportSize = signal({ width: 1, height: 1 });
  protected readonly stageWidth = computed(() =>
    Math.max(this.viewportSize().width, this.size().width * this.zoom() + 32),
  );
  protected readonly stageHeight = computed(() =>
    Math.max(this.viewportSize().height, this.size().height * this.zoom() + 32),
  );
  protected readonly offsetX = computed(
    () => (this.stageWidth() - this.size().width * this.zoom()) / 2,
  );
  protected readonly offsetY = computed(
    () => (this.stageHeight() - this.size().height * this.zoom()) / 2,
  );
  protected readonly dragging = signal(false);
  protected readonly frameGeneration = signal(0);
  private port: MessagePort | null = null;
  private observer?: ResizeObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private animationFrame = 0;
  private fitting = true;
  private priorOverflow = '';
  private priorFocus: HTMLElement | null = null;
  private priorScroll = { x: 0, y: 0 };
  private drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
  private closed = false;

  ngAfterViewInit() {
    this.priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.priorScroll = { x: window.scrollX, y: window.scrollY };
    this.priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.dialog().nativeElement.showModal();
    this.observer = new ResizeObserver(() => {
      const viewport = this.viewport().nativeElement;
      this.viewportSize.set({ width: viewport.clientWidth, height: viewport.clientHeight });
      if (this.fitting && this.status() === 'ready') this.fit();
    });
    this.observer.observe(this.viewport().nativeElement);
    this.startTimeout();
  }

  protected frameLoaded(frame: HTMLIFrameElement) {
    this.port?.close();
    this.port = connectArchitectureFrame(frame, this.href(), this.diagramId(), (message) => {
      if (this.closed) return;
      if (message.type === 'lookahead:architecture:error') this.fail();
      if (message.type !== 'lookahead:architecture:ready') return;
      clearTimeout(this.timer);
      this.size.set({ width: message.width, height: message.height });
      this.status.set('ready');
      this.fit();
    });
    if (!this.port) this.fail();
  }

  private startTimeout() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(), 20000);
  }

  protected fail() {
    clearTimeout(this.timer);
    this.port?.close();
    this.port = null;
    this.status.set('error');
  }

  protected retry() {
    this.port?.close();
    this.port = null;
    this.status.set('loading');
    this.frameGeneration.update((value) => value + 1);
    this.startTimeout();
  }

  protected fit() {
    this.fitting = true;
    const viewport = this.viewport().nativeElement;
    const scale = Math.min(
      (viewport.clientWidth - 32) / this.size().width,
      (viewport.clientHeight - 32) / this.size().height,
      1,
    );
    this.setZoom(scale, true);
  }

  protected changeZoom(scale: number) {
    this.fitting = false;
    this.setZoom(scale, false);
  }

  private setZoom(scale: number, reset: boolean) {
    const viewport = this.viewport().nativeElement;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2 - this.offsetX()) / this.zoom();
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2 - this.offsetY()) / this.zoom();
    this.zoom.set(Math.max(0.01, Math.min(4, scale)));
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = requestAnimationFrame(() => {
      if (this.closed) return;
      viewport.scrollLeft = reset
        ? (this.stageWidth() - viewport.clientWidth) / 2
        : centerX * this.zoom() + this.offsetX() - viewport.clientWidth / 2;
      viewport.scrollTop = reset
        ? (this.stageHeight() - viewport.clientHeight) / 2
        : centerY * this.zoom() + this.offsetY() - viewport.clientHeight / 2;
    });
  }

  protected pointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0 || this.status() !== 'ready') return;
    const viewport = this.viewport().nativeElement;
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    this.dragging.set(true);
    event.preventDefault();
  }

  protected pointerMove(event: PointerEvent) {
    if (!this.drag || this.drag.id !== event.pointerId) return;
    const viewport = this.viewport().nativeElement;
    viewport.scrollLeft = this.drag.left - (event.clientX - this.drag.x);
    viewport.scrollTop = this.drag.top - (event.clientY - this.drag.y);
  }

  protected pointerEnd(event: PointerEvent) {
    if (this.drag?.id !== event.pointerId) return;
    this.drag = null;
    this.dragging.set(false);
    const viewport = this.viewport().nativeElement;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  }

  protected keydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || this.status() !== 'ready') return;
    const viewport = this.viewport().nativeElement;
    const delta = event.shiftKey ? 160 : 48;
    switch (event.key) {
      case 'ArrowLeft':
        viewport.scrollLeft -= delta;
        break;
      case 'ArrowRight':
        viewport.scrollLeft += delta;
        break;
      case 'ArrowUp':
        viewport.scrollTop -= delta;
        break;
      case 'ArrowDown':
        viewport.scrollTop += delta;
        break;
      case '+':
      case '=':
        this.changeZoom(this.zoom() * 1.25);
        break;
      case '-':
        this.changeZoom(this.zoom() / 1.25);
        break;
      case 'Home':
        this.fit();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const controls = [
      ...this.dialog().nativeElement.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      last?.focus({ preventScroll: true });
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first?.focus({ preventScroll: true });
      event.preventDefault();
    }
  }

  protected close(event?: Event) {
    event?.preventDefault();
    this.cleanup();
    this.dismissed.emit();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private cleanup() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.animationFrame);
    this.observer?.disconnect();
    this.port?.close();
    this.port = null;
    if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
    document.body.style.overflow = this.priorOverflow;
    if (this.priorFocus?.isConnected) this.priorFocus.focus({ preventScroll: true });
    window.scrollTo(this.priorScroll.x, this.priorScroll.y);
  }
}
