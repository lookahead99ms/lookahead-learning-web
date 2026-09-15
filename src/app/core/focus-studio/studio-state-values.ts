import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-studio-state-values',
  template: `@if (value() === undefined) {
      <p class="empty">Not recorded at this instruction.</p>
    } @else if (collection(); as values) {
      @if (!values.length) {
        <p class="empty">Empty collection []</p>
      } @else {
        <div class="indexed-values" tabindex="0" [attr.aria-label]="name() + ' indexed values'">
          @for (item of values.slice(0, 100); track $index; let index = $index) {
            <div class="indexed-cell" [class.current-value]="active().includes(index)">
              <small>{{ name() }}[{{ index }}]</small><strong>{{ display(item) }}</strong>
              @if (showCurrentLabel() && active().includes(index)) {
                <span>current</span>
              }
            </div>
          }
        </div>
        @if (values.length > 100) {
          <p class="empty">
            Showing 100 of {{ values.length }} entries. Full value in source data.
          </p>
        }
      }
    } @else if (entries(); as values) {
      <dl class="object-values">
        @for (entry of values; track entry[0]) {
          <div>
            <dt>{{ entry[0] }}</dt>
            <dd>{{ display(entry[1]) }}</dd>
          </div>
        }
      </dl>
    } @else {
      <strong class="scalar-value">{{ display(value()) }}</strong>
    }`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .indexed-values {
        display: flex;
        gap: 5px;
        overflow: auto;
        padding: 3px 1px 7px;
        max-height: 170px;
      }
      .indexed-cell {
        flex: 0 0 auto;
        min-width: 44px;
        max-width: 180px;
        padding: 7px;
        background: var(--surface);
        border: 1px solid var(--line);
        text-align: center;
        line-height: 1.35;
      }
      small {
        display: block;
        font-size: 9px;
        color: var(--muted);
      }
      .indexed-cell strong {
        display: block;
        margin-top: 5px;
        font:
          600 16px/1.5 ui-monospace,
          monospace;
        overflow-wrap: anywhere;
      }
      .indexed-cell span {
        font-size: 9px;
        display: block;
        line-height: 1.35;
      }
      .current-value {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
        background: var(--surface-accent);
      }
      .empty {
        font-size: 12px;
        color: var(--muted);
        margin: 8px 0;
      }
      .scalar-value {
        display: block;
        font-size: 20px;
        line-height: 1.35;
        margin-top: 5px;
        overflow-wrap: anywhere;
      }
      .object-values {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 8px 0;
      }
      .object-values div {
        border-bottom: 1px solid var(--line);
        padding: 8px;
        min-width: 44px;
      }
      dt {
        color: var(--muted);
        font-size: 11px;
      }
      dd {
        margin: 5px 0 0;
        font:
          600 14px/1.5 ui-monospace,
          monospace;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class StudioStateValues {
  readonly value = input<unknown>();
  readonly name = input.required<string>();
  readonly active = input<number[]>([]);
  readonly showCurrentLabel = input(true);
  protected readonly collection = computed(() =>
    Array.isArray(this.value()) ? (this.value() as unknown[]) : null,
  );
  protected readonly entries = computed(() =>
    this.value() && typeof this.value() === 'object' && !Array.isArray(this.value())
      ? Object.entries(this.value() as object)
      : null,
  );
  protected display(value: unknown): string {
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'Unavailable');
  }
}
