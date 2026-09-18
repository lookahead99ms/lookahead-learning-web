import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ArchitectureDiagramViewer } from './architecture-diagram-viewer';

describe('Architecture diagram viewer', () => {
  let resize: () => void;
  let port: {
    onmessage: ((event: { data: unknown }) => void) | null;
    close: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'MessageChannel',
      class {
        port1 = (port = { onmessage: null, start: vi.fn(), close: vi.fn() });
        port2 = {};
      },
    );
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value() {},
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value() {},
    });
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.open = false;
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    TestBed.configureTestingModule({ imports: [ArchitectureDiagramViewer] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });
  function create() {
    const fixture = TestBed.createComponent(ArchitectureDiagramViewer);
    fixture.componentRef.setInput(
      'documentHref',
      '/bff/author/previews/architecture/index.html?theme=dark',
    );
    fixture.componentRef.setInput('diagramId', 'content-model');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const viewport = root.querySelector('.diagram-viewport') as HTMLElement;
    Object.defineProperties(viewport, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    });
    resize();
    const frame = root.querySelector('iframe')!;
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    frame.dispatchEvent(new Event('load'));
    return { fixture, root, viewport, frame };
  }
  function ready() {
    port.onmessage!({
      data: {
        type: 'lookahead:architecture:ready',
        version: 1,
        diagramId: 'content-model',
        width: 1600,
        height: 1200,
      },
    });
  }
  function click(root: HTMLElement, label: string) {
    const button = [...root.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === label,
    )!;
    button.click();
  }
  it('opens a modal, fits intrinsic dimensions, restores scroll lock and closes the channel on Escape', () => {
    document.body.style.overflow = 'clip';
    const { fixture, root } = create();
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    ready();
    fixture.detectChanges();
    expect(root.querySelector('output')?.textContent).toBe('47%');
    click(root, '100%');
    fixture.detectChanges();
    expect(root.querySelector('output')?.textContent).toBe('100%');
    click(root, 'Reset');
    fixture.detectChanges();
    expect(root.querySelector('output')?.textContent).toBe('47%');
    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dismissed).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('clip');
    fixture.destroy();
  });
  it('pans by keyboard while preserving browser zoom and ordinary scrolling', () => {
    const { fixture, viewport, root } = create();
    ready();
    fixture.detectChanges();
    click(root, '100%');
    const pan = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    viewport.dispatchEvent(pan);
    expect(viewport.scrollLeft).toBe(48);
    expect(pan.defaultPrevented).toBe(true);
    const browserZoom = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, cancelable: true });
    viewport.dispatchEvent(browserZoom);
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    viewport.dispatchEvent(wheel);
    expect(browserZoom.defaultPrevented).toBe(false);
    expect(wheel.defaultPrevented).toBe(false);
    fixture.destroy();
  });
  it('ignores wrong IDs, exposes recoverable errors and closes old ports on retry/destroy', () => {
    const { fixture, root } = create();
    port.onmessage!({
      data: {
        type: 'lookahead:architecture:ready',
        version: 1,
        diagramId: 'repo-flow',
        width: 800,
        height: 600,
      },
    });
    fixture.detectChanges();
    expect(root.textContent).toContain('Loading diagram');
    port.onmessage!({
      data: { type: 'lookahead:architecture:error', version: 1, diagramId: 'content-model' },
    });
    fixture.detectChanges();
    expect(root.textContent).toContain('Diagram unavailable');
    expect(port.close).toHaveBeenCalled();
    click(root, 'Try again');
    fixture.detectChanges();
    expect(root.textContent).toContain('Loading diagram');
    expect(root.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
    fixture.destroy();
  });

  it('keeps Tab navigation within visible modal controls', () => {
    const { fixture, root, viewport } = create();
    ready();
    fixture.detectChanges();
    const controls = [...root.querySelectorAll<HTMLElement>('button, [tabindex="0"]')];
    for (const element of controls)
      vi.spyOn(element, 'getClientRects').mockReturnValue([{}] as any);
    const close = controls[0];
    viewport.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    viewport.dispatchEvent(forward);
    expect(document.activeElement).toBe(close);
    expect(forward.defaultPrevented).toBe(true);
    close.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(viewport);
    fixture.destroy();
  });

  it('captures mouse panning without taking over touch gestures', () => {
    const { fixture, viewport } = create();
    ready();
    fixture.detectChanges();
    viewport.setPointerCapture = vi.fn();
    viewport.hasPointerCapture = vi.fn(() => true);
    viewport.releasePointerCapture = vi.fn();
    const pointer = (type: string, values: Record<string, unknown>) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        pointerId: 1,
        button: 0,
        pointerType: 'mouse',
        clientX: 200,
        clientY: 200,
        ...values,
      });
      viewport.dispatchEvent(event);
      return event;
    };
    const touch = pointer('pointerdown', { pointerType: 'touch' });
    expect(touch.defaultPrevented).toBe(false);
    expect(viewport.setPointerCapture).not.toHaveBeenCalled();
    pointer('pointerdown', {});
    pointer('pointermove', { clientX: 150, clientY: 120 });
    expect(viewport.scrollLeft).toBe(50);
    expect(viewport.scrollTop).toBe(80);
    pointer('pointerup', {});
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(1);
    fixture.destroy();
  });
});
