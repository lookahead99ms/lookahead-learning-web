import {
  DestroyRef,
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnInit,
  Renderer2,
  inject,
} from '@angular/core';

let nextHintId = 0;

/**
 * Quiet description for a header utility (DLV-968). Put `appHeaderHint="…"` on the Search
 * button, the Study Plan link, a theme button, Sign in or the account trigger and the directive
 * renders one `span.header-hint` right after the item, wires `aria-describedby` to it and shows it
 * as a small tooltip under the item while the item is hovered (pointer devices only) or has
 * visible keyboard focus. The hint is never the browser's native title tooltip and takes no
 * layout: it is absolutely positioned from the item's own box, so no header container needs
 * `position: relative` and nothing wraps the item. Activating the item hides the hint so it never
 * sits over the panel the click opened.
 */
@Directive({ selector: '[appHeaderHint]' })
export class HeaderHint implements OnInit {
  /** The description; set as a plain input so the text lands in the same change-detection pass. */
  @Input({ required: true, alias: 'appHeaderHint' })
  set text(value: string) {
    this.renderer.setProperty(this.hint, 'textContent', value);
  }
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);
  private readonly hint: HTMLElement = this.renderer.createElement('span');
  private readonly id = `header-hint-${++nextHintId}`;
  private hovered = false;
  private focused = false;
  /** Set by a click or Escape; cleared when the pointer leaves and focus moves away. */
  private suppressed = false;

  constructor() {
    this.renderer.setAttribute(this.hint, 'id', this.id);
    this.renderer.setAttribute(this.hint, 'role', 'tooltip');
    this.renderer.addClass(this.hint, 'header-hint');
    inject(DestroyRef).onDestroy(() => {
      this.hint.remove();
    });
  }

  ngOnInit(): void {
    const parent = this.renderer.parentNode(this.host);
    if (parent) this.renderer.insertBefore(parent, this.hint, this.renderer.nextSibling(this.host));
    const existing = this.host.getAttribute('aria-describedby');
    this.renderer.setAttribute(
      this.host,
      'aria-describedby',
      existing ? `${existing} ${this.id}` : this.id,
    );
  }

  @HostListener('mouseenter')
  protected onEnter(): void {
    if (!this.hoverCapable()) return;
    this.hovered = true;
    this.sync();
  }

  @HostListener('mouseleave')
  protected onLeave(): void {
    this.hovered = false;
    if (!this.focused) this.suppressed = false;
    this.sync();
  }

  @HostListener('focusin')
  protected onFocus(): void {
    this.focused = this.focusVisible();
    this.sync();
  }

  @HostListener('focusout')
  protected onBlur(): void {
    this.focused = false;
    if (!this.hovered) this.suppressed = false;
    this.sync();
  }

  @HostListener('click')
  @HostListener('keydown.escape')
  protected onActivate(): void {
    this.suppressed = true;
    this.sync();
  }

  private sync(): void {
    const visible = !this.suppressed && (this.hovered || this.focused);
    if (visible) this.place();
    if (visible) this.renderer.addClass(this.hint, 'is-visible');
    else this.renderer.removeClass(this.hint, 'is-visible');
  }

  /**
   * Positions the hint under the item's left edge from measured boxes, so it works whichever
   * ancestor is the containing block (the transformed header, the sticky host) and is shifted left
   * only as far as needed to stay inside the viewport.
   */
  private place(): void {
    this.renderer.setStyle(this.hint, 'left', '0px');
    this.renderer.setStyle(this.hint, 'top', '0px');
    const item = this.host.getBoundingClientRect();
    const origin = this.hint.getBoundingClientRect();
    const viewportWidth = this.host.ownerDocument.documentElement.clientWidth;
    const width = origin.width;
    let left = item.left;
    if (viewportWidth > 0 && left + width > viewportWidth - 8) left = Math.max(8, viewportWidth - 8 - width);
    this.renderer.setStyle(this.hint, 'left', `${left - origin.left}px`);
    this.renderer.setStyle(this.hint, 'top', `${item.bottom + 6 - origin.top}px`);
  }

  /** Touch-only devices get no hover hint; where the query is unavailable the hint is allowed. */
  private hoverCapable(): boolean {
    const view = this.host.ownerDocument.defaultView;
    if (!view || typeof view.matchMedia !== 'function') return true;
    return view.matchMedia('(hover: hover)').matches;
  }

  /** Keyboard focus only; a mouse click that focuses the item does not open the hint. */
  private focusVisible(): boolean {
    try {
      return this.host.matches(':focus-visible');
    } catch {
      return true;
    }
  }
}
