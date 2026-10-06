import { Component, input, output } from '@angular/core';

/** Labeled disclosure; its heading stays visible when its contents are collapsed. */
@Component({
  selector: 'app-sidebar-toggle',
  template: `
    <button
      type="button"
      [attr.aria-label]="heading() ? label() + ': ' + heading() : label()"
      [attr.title]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="controls()"
      (click)="toggled.emit($event)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path [attr.d]="open() ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'" />
      </svg>
      <span class="sidebar-title" [id]="headingId()">{{ heading() }}</span>
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-height: 44px;
      }
      button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        font: inherit;
        font-weight: 650;
        text-align: start;
        width: 100%;
        min-height: 44px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--text-strong);
        cursor: pointer;
      }
      button:hover {
        color: var(--text-strong);
        background: var(--surface-muted);
      }
      button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: -3px;
      }
      .sidebar-title {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      button[aria-expanded='false'] svg:dir(rtl) {
        transform: scaleX(-1);
      }
      svg {
        flex: 0 0 20px;
        width: 20px;
        height: 24px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
      }
    `,
  ],
})
export class SidebarToggle {
  readonly heading = input('');
  readonly headingId = input<string | null>(null);
  readonly side = input<'left' | 'right'>('left');
  readonly open = input(false);
  readonly controls = input.required<string>();
  readonly label = input.required<string>();
  readonly toggled = output<Event>();
}
