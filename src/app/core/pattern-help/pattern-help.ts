import { htmlText } from '../html-text';
import { Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom, switchMap } from 'rxjs';
import { ContentService } from '../../content/content.service';

interface Signal {
  key: string;
  intro: string;
  candidates: { unit: number; when: string }[];
  check: string;
}

/** Where the explorer's signals live: the Recognize the Pattern lesson's map section (content, not code). */
const MAP_SOURCE = { path: 'learn', course: 'algorithmic-patterns', lesson: 'algorithmic-pattern-foundations' };

/**
 * "Help me recognize the pattern" on a Hands-On DSA problem (user review, 2026-10-05). The learner picks a
 * signal from the problem and sees the patterns that fit, when each fits and what to check first; nothing is
 * chosen for them. "Show this problem's pattern" reveals the answer one click away. Opening, choosing or
 * revealing never changes progress.
 */
@Component({
  selector: 'app-pattern-help',
  imports: [RouterLink],
  template: `
    <dialog #dialog class="pattern-help" aria-labelledby="pattern-help-title" (close)="closed.emit()">
      <div class="shell">
        <div class="head">
          <div>
            <p class="eyebrow">Recognize the pattern</p>
            <h2 id="pattern-help-title">{{ problemTitle() }}</h2>
          </div>
          <button type="button" class="close" (click)="close()">Close</button>
        </div>
        <div class="body">
          @if (statement()) {
            <p class="statement"><strong>The problem.</strong> {{ statement() }}</p>
          }
          <section>
            <h3>1. Work it out: what does the problem say?</h3>
            @if (signals().length) {
              <div class="chips" role="group" aria-label="Signals">
                @for (item of signals(); track item.key) {
                  <button type="button" class="chip" [attr.aria-pressed]="picked()?.key === item.key" (click)="pick(item)">{{ item.key }}</button>
                }
              </div>
            } @else if (loadFailed()) {
              <p class="muted">The signals did not load. You can still show this problem's pattern below.</p>
            } @else {
              <p class="muted">Loading the signals…</p>
            }
            <div class="result" aria-live="polite">
              @if (picked(); as item) {
                <h4>{{ item.intro }}</h4>
                <ul class="cands">
                  @for (candidate of item.candidates; track candidate.unit) {
                    <li><strong>{{ units()[candidate.unit - 1] }}</strong><span>{{ candidate.when }}</span></li>
                  }
                </ul>
                <p class="muted"><strong>Check first.</strong> {{ item.check }}</p>
              } @else {
                <p class="muted">Pick the signal that matches the problem. You get the patterns that fit, when each one fits, and what to check before you choose. Nothing is picked for you.</p>
              }
            </div>
          </section>
          <section class="reveal-box">
            <h3>2. Or show this problem's pattern</h3>
            @if (revealedNow()) {
              <div class="answer">
                <h4>{{ patternName() }}</h4>
                <a class="lesson-link" [routerLink]="lessonRoute()" [queryParams]="lessonQuery()" target="_blank" rel="noopener"
                  >{{ patternName() }} lesson<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3 7.5 8.5M12 9.5V13H3V4h3.5" /></svg
                  ><span class="visually-hidden"> (opens in a new tab)</span></a
                >
              </div>
            } @else {
              <button type="button" class="reveal" (click)="reveal()">Show the pattern</button>
            }
          </section>
          <p class="note">Opening this, choosing a signal or showing the pattern doesn't change your progress.</p>
        </div>
      </div>
    </dialog>
  `,
  styles: [
    `
      .pattern-help {
        width: min(760px, calc(100vw - 32px));
        max-height: calc(100dvh - 40px);
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--surface);
        color: var(--text-body);
        box-shadow: 0 24px 64px rgb(0 0 0 / 30%);
      }
      .pattern-help::backdrop {
        background: rgb(12 24 30 / 55%);
      }
      .shell {
        display: flex;
        flex-direction: column;
        max-height: inherit;
      }
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px 12px;
        border-bottom: 1px solid var(--line);
      }
      .eyebrow {
        margin: 0;
        color: var(--text-subtle);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      h2 {
        margin: 2px 0 0;
        color: var(--text-strong);
        font-size: 1.1rem;
      }
      h3 {
        margin: 0 0 8px;
        color: var(--text-strong);
        font-size: 0.95rem;
      }
      h4 {
        margin: 0 0 8px;
        color: var(--text-strong);
        font-size: 1rem;
      }
      .close,
      .reveal {
        min-height: 36px;
        padding: 6px 14px;
        border-radius: 9px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .close {
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--text-strong);
      }
      .reveal {
        border: 1px solid var(--accent-strong);
        background: transparent;
        color: var(--accent-strong);
      }
      .body {
        display: grid;
        gap: 16px;
        padding: 16px 20px 18px;
        overflow-y: auto;
      }
      .statement {
        margin: 0;
        padding: 10px 14px;
        border-radius: 10px;
        background: var(--surface-muted);
        font-size: 0.92rem;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        padding: 4px 12px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text-strong);
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .chip[aria-pressed='true'] {
        border-color: var(--accent-strong);
        background: var(--accent-strong);
        color: var(--accent-on-primary);
        font-weight: 700;
      }
      .result {
        margin-top: 12px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
      }
      .cands {
        display: grid;
        gap: 8px;
        margin: 0 0 8px;
        padding: 0;
        list-style: none;
      }
      .cands li {
        padding: 8px 10px;
        border-left: 3px solid var(--accent-strong);
        border-radius: 9px;
        background: var(--surface-muted);
      }
      .cands strong {
        color: var(--text-strong);
      }
      .cands span {
        display: block;
        color: var(--text-subtle);
        font-size: 0.87rem;
      }
      .muted,
      .note {
        margin: 0;
        color: var(--text-subtle);
        font-size: 0.88rem;
      }
      .note {
        font-size: 0.8rem;
      }
      .reveal-box {
        padding-top: 14px;
        border-top: 1px solid var(--line);
      }
      .answer {
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--surface-muted);
      }
      .lesson-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--accent-link);
        font-weight: 700;
      }
      .lesson-link svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      :focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      @media (max-width: 640px) {
        .pattern-help {
          width: 100vw;
          max-width: 100vw;
          height: 100dvh;
          max-height: 100dvh;
          margin: 0;
          border: 0;
          border-radius: 0;
        }
        .shell {
          height: 100%;
        }
        .body {
          flex: 1;
        }
      }
    `,
  ],
})
export class PatternHelp {
  readonly open = input(false);
  readonly problemTitle = input('');
  readonly statement = input('');
  readonly patternName = input('');
  readonly revealed = input(false);
  readonly lessonRoute = input<readonly string[]>([]);
  readonly lessonQuery = input<Record<string, string> | null>(null);
  readonly reveal$ = output<void>({ alias: 'revealPattern' });
  readonly closed = output<void>();

  protected readonly signals = signal<Signal[]>([]);
  protected readonly units = signal<string[]>([]);
  protected readonly picked = signal<Signal | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly revealedNow = signal(false);
  private readonly content = inject(ContentService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private loaded = false;

  constructor() {
    effect(() => this.revealedNow.set(this.revealed()));
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.hasAttribute('open')) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        void this.load();
      } else if (!this.open() && dialog.hasAttribute('open')) {
        this.close();
      }
    });
  }

  protected pick(item: Signal): void {
    this.picked.set(this.picked()?.key === item.key ? null : item);
  }

  protected reveal(): void {
    this.revealedNow.set(true);
    this.reveal$.emit();
  }

  protected close(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      this.closed.emit();
    }
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      // The lesson's own detail record: the published snapshot serves lessons one by one, not as module files.
      const lesson = await firstValueFrom(
        this.content.getCourseOutline(MAP_SOURCE.path, MAP_SOURCE.course).pipe(
          switchMap((course) => {
            const summary = course.questions.find((item) => item.id === MAP_SOURCE.lesson);
            if (!summary) throw new Error('Recognize the Pattern lesson not found');
            return this.content.getContentItem(summary);
          }),
        ),
      );
      type MapSection = { patternMap?: { signals: Signal[] }; table?: { rows: string[][] } };
      const section = ((lesson as { sections?: MapSection[] }).sections ?? []).find(
        (candidate) => candidate.patternMap && candidate.table,
      );
      if (!section?.patternMap || !section.table) throw new Error('no pattern map');
      this.units.set(section.table.rows.map((row) => htmlText(row[1] ?? '')));
      this.signals.set(section.patternMap.signals);
    } catch {
      this.loadFailed.set(true);
    }
  }
}
