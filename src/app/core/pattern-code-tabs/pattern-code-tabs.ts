import { Component, computed, input, signal } from '@angular/core';
import { PatternCodeBlock } from '../../content/content.models';

@Component({
  selector: 'app-pattern-code-tabs',
  template: `
    <section class="code-tabs" aria-label="Core pattern template">
      <div class="tab-list" role="tablist" aria-label="Template language">
        @for (block of blocks(); track block.language; let index = $index) {
          <button
            type="button"
            role="tab"
            [id]="tabId(index)"
            [attr.aria-controls]="panelId(index)"
            [attr.aria-selected]="selectedIndex() === index"
            [attr.tabindex]="selectedIndex() === index ? 0 : -1"
            (click)="select(index)"
            (keydown)="moveTab($event, index)"
          >
            {{ label(block) }}
          </button>
        }
      </div>
      @if (activeBlock(); as block) {
        <section
          class="code-panel"
          role="tabpanel"
          [id]="panelId(selectedIndex())"
          [attr.aria-labelledby]="tabId(selectedIndex())"
        >
          <div class="code-heading">
            <strong>{{ block.title }}</strong
            ><span>{{ label(block) }}</span>
          </div>
          <pre
            tabindex="0"
          ><code>@for (line of block.lines; track line.id) {<span>{{ line.text || ' ' }}</span>}</code></pre>
        </section>
      }
    </section>
  `,
  styles: [
    `
      .code-tabs {
        overflow: hidden;
        border: 1px solid #c8d9e9;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 10px 28px rgba(26, 50, 80, 0.08);
      }
      .tab-list {
        display: flex;
        overflow-x: auto;
        padding: 0 10px;
        border-bottom: 1px solid #334155;
        background: #172033;
      }
      .tab-list button {
        flex: 0 0 auto;
        min-height: 48px;
        padding: 0 16px;
        border: 0;
        border-bottom: 3px solid transparent;
        color: #cbd5e1;
        background: transparent;
        cursor: pointer;
        font:
          800 0.78rem 'Avenir Next',
          sans-serif;
        text-transform: capitalize;
      }
      .tab-list button[aria-selected='true'] {
        border-bottom-color: #4bb7ca;
        color: #fff;
        background: #24354a;
      }
      .tab-list button:focus-visible {
        outline: 3px solid #8bd8e6;
        outline-offset: -3px;
      }
      .code-panel {
        background: #111827;
      }
      .code-heading {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid #334155;
        color: #cbd5e1;
        background: #1e293b;
        font:
          700 0.75rem 'JetBrains Mono',
          monospace;
      }
      .code-heading span {
        color: #7dd3fc;
      }
      .code-panel pre {
        max-height: 520px;
        margin: 0;
        padding: 18px;
        overflow: auto;
        color: #dbeafe;
        background: #111827;
        font:
          14px/1.7 'JetBrains Mono',
          monospace;
        tab-size: 2;
      }
      .code-panel code span {
        display: block;
        min-height: 1.7em;
        white-space: pre;
      }
      @media (max-width: 620px) {
        .tab-list button {
          padding: 0 12px;
        }
        .code-panel pre {
          font-size: 0.78rem;
        }
      }
      @media (forced-colors: active) {
        .code-tabs,
        .tab-list,
        .code-panel,
        .code-heading,
        .code-panel pre {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .tab-list button {
          border: 1px solid ButtonText;
          color: ButtonText;
          background: ButtonFace;
        }
        .tab-list button[aria-selected='true'] {
          border: 3px solid Highlight;
          color: HighlightText;
          background: Highlight;
        }
        .tab-list button:focus-visible {
          outline: 3px solid Highlight;
          outline-offset: -4px;
        }
      }
    `,
  ],
})
export class PatternCodeTabs {
  readonly pseudocode = input.required<PatternCodeBlock>();
  readonly implementations = input.required<PatternCodeBlock[]>();
  protected readonly selectedIndex = signal(0);
  protected readonly blocks = computed(() => [this.pseudocode(), ...this.implementations()]);
  protected readonly activeBlock = computed(
    () => this.blocks()[this.selectedIndex()] ?? this.blocks()[0],
  );

  protected label(block: PatternCodeBlock): string {
    return block.language === 'pseudocode' ? 'Pseudocode' : block.language;
  }

  protected tabId(index: number): string {
    return `pattern-template-tab-${index}`;
  }
  protected panelId(index: number): string {
    return `pattern-template-panel-${index}`;
  }

  protected select(index: number): void {
    this.selectedIndex.set(index);
  }

  protected moveTab(event: KeyboardEvent, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const count = this.blocks().length;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % count
            : (index - 1 + count) % count;
    this.select(next);
    const buttons = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  }
}
