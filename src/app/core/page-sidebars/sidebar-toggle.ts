import { Component, input, output } from '@angular/core';

/** Icon-only disclosure with its complete action available to assistive technology. */
@Component({
  selector: 'app-sidebar-toggle',
  template: `
    <button
      type="button"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="controls()"
      (click)="toggled.emit($event)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path [attr.d]="side() === 'left' ? 'M9 3v18' : 'M15 3v18'" />
      </svg>
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 44px;
        height: 44px;
      }
      button {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--text-subtle);
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
      svg {
        width: 24px;
        height: 24px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
      }
    `,
  ],
})
export class SidebarToggle {
  readonly side = input<'left' | 'right'>('left');
  readonly open = input(false);
  readonly controls = input.required<string>();
  readonly label = input.required<string>();
  readonly toggled = output<Event>();
}
