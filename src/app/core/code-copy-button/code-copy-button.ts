import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';

@Component({
  selector: 'app-code-copy-button',
  template: `
    <button
      type="button"
      [attr.aria-label]="buttonLabel()"
      [attr.title]="buttonLabel()"
      (click)="copyCode()"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="8" y="8" width="11" height="11" rx="2"></rect>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
      </svg>
      <span>{{ visibleLabel() }}</span>
    </button>
    <span class="copy-status" aria-live="polite" aria-atomic="true">{{ announcement() }}</span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      button {
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        gap: 6px;
        padding: 5px 9px;
        border: 1px solid #465568;
        border-radius: 7px;
        color: #d7e1ee;
        background: #202938;
        cursor: pointer;
        font:
          700 0.7rem 'JetBrains Mono',
          'SFMono-Regular',
          Consolas,
          monospace;
      }
      button:hover {
        border-color: #66c7d4;
        color: #fff;
        background: #29374a;
      }
      button:focus-visible {
        outline: 3px solid #8de7ed;
        outline-offset: 2px;
      }
      svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
      }
      .copy-status {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      @media (forced-colors: active) {
        button {
          border-color: ButtonText;
          color: ButtonText;
          background: ButtonFace;
        }
        button:focus-visible {
          outline-color: Highlight;
        }
      }
    `,
  ],
})
export class CodeCopyButton {
  readonly code = input.required<string>();

  private readonly document = inject(DOCUMENT);
  private resetTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly status = signal<'idle' | 'copied' | 'failed'>('idle');

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.resetTimer));
  }

  protected visibleLabel(): string {
    return this.status() === 'copied' ? 'Copied' : this.status() === 'failed' ? 'Retry' : 'Copy';
  }

  protected buttonLabel(): string {
    return this.status() === 'copied'
      ? 'Code copied to clipboard'
      : this.status() === 'failed'
        ? 'Copy failed. Try copying code again'
        : 'Copy code to clipboard';
  }

  protected announcement(): string {
    return this.status() === 'copied'
      ? 'Code copied to clipboard.'
      : this.status() === 'failed'
        ? 'Code could not be copied. Try again.'
        : '';
  }

  protected async copyCode(): Promise<void> {
    try {
      const clipboard = this.document.defaultView?.navigator.clipboard;
      if (clipboard?.writeText) {
        await clipboard.writeText(this.code());
      } else if (!this.legacyCopy()) {
        throw new Error('Clipboard unavailable');
      }
      this.setStatus('copied');
    } catch {
      this.setStatus(this.legacyCopy() ? 'copied' : 'failed');
    }
  }

  private legacyCopy(): boolean {
    const textarea = this.document.createElement('textarea');
    textarea.value = this.code();
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    this.document.body.append(textarea);
    textarea.select();
    const copied = this.document.execCommand?.('copy') ?? false;
    textarea.remove();
    return copied;
  }

  private setStatus(status: 'copied' | 'failed'): void {
    this.status.set(status);
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.status.set('idle'), 2200);
  }
}
