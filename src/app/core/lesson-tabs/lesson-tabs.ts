import { AfterViewInit, Component, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';

export interface LessonTabItem {
  /** Short marker before the label: a variation letter or a mistake number. */
  key: string;
  label: string;
  /** Full name, shown as a tooltip when the label is cut short. */
  title?: string;
}

/**
 * Underlined tabs for small groups inside a lesson (Variations, Common mistakes). The panels stay in the
 * host template: tab i controls `panelIds[i]`, or `${idPrefix}-panel-${i}` when no ids are given. When the row is wider than its column, a
 * double chevron at each edge shows that more tabs are hidden there and scrolls to them (user review,
 * 2026-10-05). Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern, automatic activation).
 */
@Component({
  selector: 'app-lesson-tabs',
  template: `
    <div class="tab-strip">
      <button
        type="button"
        class="tab-more left"
        [hidden]="!moreBefore()"
        [attr.aria-label]="'Scroll to earlier ' + ariaLabel() + ' tabs'"
        (click)="scrollBy(-1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.5 4 4.5 8l4 4M12.5 4l-4 4 4 4" /></svg>
      </button>
      <div #list class="tab-list" role="tablist" [attr.aria-label]="ariaLabel()" (scroll)="update()">
        @for (item of items(); track item.key; let index = $index) {
          <button
            type="button"
            class="tab"
            role="tab"
            [id]="idPrefix() + '-tab-' + index"
            [attr.aria-controls]="panelIds()?.[index] ?? idPrefix() + '-panel-' + index"
            [attr.aria-selected]="index === selected()"
            [attr.tabindex]="index === selected() ? 0 : -1"
            [attr.title]="item.title ?? null"
            (click)="choose(index)"
            (keydown)="onKey($event, index)"
          >
            <span class="tab-key">{{ item.key }}</span><span class="tab-label">{{ item.label }}</span>
          </button>
        }
      </div>
      <button
        type="button"
        class="tab-more right"
        [hidden]="!moreAfter()"
        [attr.aria-label]="'Scroll to more ' + ariaLabel() + ' tabs'"
        (click)="scrollBy(1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4l4 4-4 4M7.5 4l4 4-4 4" /></svg>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin: 0 0 18px;
      }
      .tab-strip {
        position: relative;
      }
      .tab-list {
        display: flex;
        overflow-x: auto;
        border-bottom: 1px solid var(--line);
        scroll-behavior: smooth;
        scrollbar-width: thin;
      }
      .tab {
        flex: 0 0 auto;
        display: flex;
        gap: 8px;
        align-items: baseline;
        margin-bottom: -1px;
        padding: 10px 16px;
        border: 0;
        border-bottom: 3px solid transparent;
        background: transparent;
        color: var(--text-body);
        font: inherit;
        font-size: 0.95rem;
        white-space: nowrap;
        cursor: pointer;
      }
      .tab:hover {
        background: var(--surface-muted);
      }
      .tab[aria-selected='true'] {
        border-bottom-color: var(--accent-strong);
        color: var(--text-strong);
        font-weight: 700;
      }
      .tab-key {
        font-family: var(--lesson-mono, ui-monospace, monospace);
        font-weight: 800;
        color: var(--text-subtle);
      }
      .tab[aria-selected='true'] .tab-key {
        color: var(--accent-strong);
      }
      .tab-label {
        max-width: 30ch;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tab:focus-visible,
      .tab-more:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: -3px;
      }
      .tab-more {
        position: absolute;
        top: 0;
        bottom: 1px;
        z-index: 1;
        display: flex;
        align-items: center;
        width: 56px;
        padding: 0 6px;
        border: 0;
        color: var(--accent-strong);
        cursor: pointer;
      }
      .tab-more[hidden] {
        display: none;
      }
      .tab-more.right {
        right: 0;
        justify-content: flex-end;
        background: linear-gradient(90deg, transparent, var(--tab-fade, var(--surface)) 55%);
      }
      .tab-more.left {
        left: 0;
        justify-content: flex-start;
        background: linear-gradient(270deg, transparent, var(--tab-fade, var(--surface)) 55%);
      }
      .tab-more svg {
        width: 22px;
        height: 22px;
        padding: 3px;
        border-radius: 50%;
        background: var(--surface-muted);
        box-shadow: 0 0 0 1px var(--line);
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .tab-more:hover svg {
        background: var(--accent-strong);
        color: var(--accent-on-primary);
      }
      @media (prefers-reduced-motion: reduce) {
        .tab-list {
          scroll-behavior: auto;
        }
      }
    `,
  ],
})
export class LessonTabs implements AfterViewInit {
  readonly items = input.required<readonly LessonTabItem[]>();
  readonly selected = input(0);
  readonly idPrefix = input.required<string>();
  /** Existing panel ids (e.g. a mistake's anchor) when the panels already have one. */
  readonly panelIds = input<readonly string[] | null>(null);
  readonly ariaLabel = input.required<string>();
  readonly select = output<number>();

  protected readonly moreBefore = signal(false);
  protected readonly moreAfter = signal(false);
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.resize?.disconnect());
  }

  private resize?: ResizeObserver;

  ngAfterViewInit(): void {
    const Observer = this.host.nativeElement.ownerDocument.defaultView?.ResizeObserver;
    if (Observer) {
      const resize = new Observer(() => this.update());
      resize.observe(this.list().nativeElement);
      this.resize = resize;
    }
    this.update();
  }

  /** Show a chevron only on an edge that hides tabs. */
  protected update(): void {
    const list = this.list().nativeElement;
    const max = list.scrollWidth - list.clientWidth;
    this.moreBefore.set(list.scrollLeft > 2);
    this.moreAfter.set(max > 2 && list.scrollLeft < max - 2);
  }

  protected scrollBy(direction: 1 | -1): void {
    const list = this.list().nativeElement;
    list.scrollLeft += direction * list.clientWidth * 0.7;
    this.update();
  }

  protected choose(index: number, focus = false): void {
    this.select.emit(index);
    const tab = this.list().nativeElement.querySelectorAll<HTMLElement>('[role="tab"]')[index];
    if (focus) tab?.focus();
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    const count = this.items().length;
    const target =
      event.key === 'ArrowRight' ? (index + 1) % count
      : event.key === 'ArrowLeft' ? (index - 1 + count) % count
      : event.key === 'Home' ? 0
      : event.key === 'End' ? count - 1
      : null;
    if (target === null) return;
    event.preventDefault();
    this.choose(target, true);
  }
}
