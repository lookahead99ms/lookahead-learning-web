import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ScrollLock } from '../scroll-lock/scroll-lock';
import { GithubPrompt } from './github-account';
import { GithubAccessCard } from './github-access-card';

/**
 * DLV-969 (owner, 2026-11-06): the GitHub question as a dialog over whatever page a staff member opened after signing
 * in. Save closes it; Not now (or Escape) closes it for this sign-in. The prompt service decides when it opens.
 */
@Component({
  selector: 'app-github-access-dialog',
  imports: [GithubAccessCard, ScrollLock],
  templateUrl: './github-access-dialog.html',
  styleUrl: './github-access-dialog.css',
})
export class GithubAccessDialog {
  protected readonly prompt = inject(GithubPrompt);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;
      if (!element) return;
      if (this.prompt.open()) {
        if (!element.open) element.showModal();
      } else if (element.open) {
        element.close();
      }
    });
  }

  /** Save or Not now from the card. */
  protected finished(outcome: 'saved' | 'later'): void {
    this.prompt.close(outcome);
  }

  /** Escape, or a close while the card is still asking, counts as Not now. */
  protected closed(): void {
    if (this.prompt.open()) this.prompt.close('later');
  }
}
