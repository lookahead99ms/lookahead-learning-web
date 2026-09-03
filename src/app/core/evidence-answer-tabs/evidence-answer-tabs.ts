import { Component, input, signal } from '@angular/core';
import { EvidenceResponse } from '../../content/content.models';

type EvidenceView = 'carl' | 'star';

@Component({
  selector: 'app-evidence-answer-tabs',
  template: `
    <section class="evidence-tabs" aria-labelledby="evidence-heading">
      <div class="evidence-heading-row">
        <div>
          <span class="evidence-eyebrow">Experience evidence</span>
          <h2 id="evidence-heading">Structure the same truthful example two ways</h2>
        </div>
        <div class="evidence-tablist" role="tablist" aria-label="Answer framework">
          <button
            id="evidence-tab-carl"
            data-evidence-view="carl"
            type="button"
            role="tab"
            [attr.aria-selected]="activeView() === 'carl'"
            [attr.tabindex]="activeView() === 'carl' ? 0 : -1"
            aria-controls="evidence-panel-carl"
            (click)="activeView.set('carl')"
            (keydown)="moveView($event)"
          >
            CARL
          </button>
          <button
            id="evidence-tab-star"
            data-evidence-view="star"
            type="button"
            role="tab"
            [attr.aria-selected]="activeView() === 'star'"
            [attr.tabindex]="activeView() === 'star' ? 0 : -1"
            aria-controls="evidence-panel-star"
            (click)="activeView.set('star')"
            (keydown)="moveView($event)"
          >
            STAR
          </button>
        </div>
      </div>
      <p class="evidence-note">{{ evidence().note }}</p>

      @if (activeView() === 'carl') {
        <div
          id="evidence-panel-carl"
          class="evidence-panel"
          role="tabpanel"
          aria-labelledby="evidence-tab-carl"
        >
          <article>
            <span>C</span>
            <div>
              <h3>Context</h3>
              <p>{{ evidence().carl.context }}</p>
            </div>
          </article>
          <article>
            <span>A</span>
            <div>
              <h3>Action</h3>
              <p>{{ evidence().carl.action }}</p>
            </div>
          </article>
          <article>
            <span>R</span>
            <div>
              <h3>Result</h3>
              <p>{{ evidence().carl.result }}</p>
            </div>
          </article>
          <article>
            <span>L</span>
            <div>
              <h3>Learning</h3>
              <p>{{ evidence().carl.learning }}</p>
            </div>
          </article>
        </div>
      } @else {
        <div
          id="evidence-panel-star"
          class="evidence-panel"
          role="tabpanel"
          aria-labelledby="evidence-tab-star"
        >
          <article>
            <span>S</span>
            <div>
              <h3>Situation</h3>
              <p>{{ evidence().star.situation }}</p>
            </div>
          </article>
          <article>
            <span>T</span>
            <div>
              <h3>Task</h3>
              <p>{{ evidence().star.task }}</p>
            </div>
          </article>
          <article>
            <span>A</span>
            <div>
              <h3>Action</h3>
              <p>{{ evidence().star.action }}</p>
            </div>
          </article>
          <article>
            <span>R</span>
            <div>
              <h3>Result</h3>
              <p>{{ evidence().star.result }}</p>
            </div>
          </article>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .evidence-tabs {
        max-width: 1120px;
        margin: 24px auto;
        padding: clamp(18px, 3vw, 28px);
        border: 1px solid #bed8e4;
        border-radius: 16px;
        background: linear-gradient(145deg, #f4fbfc, #fffaf1);
      }
      .evidence-heading-row {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
      }
      .evidence-eyebrow {
        color: #0d8192;
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h2 {
        margin: 5px 0 0;
        color: #192b3d;
        font-family: 'Avenir Next', Avenir, sans-serif;
        font-size: clamp(1.15rem, 2vw, 1.45rem);
      }
      .evidence-tablist {
        display: inline-flex;
        padding: 4px;
        border: 1px solid #b9d0df;
        border-radius: 10px;
        background: #fff;
      }
      .evidence-tablist button {
        min-width: 70px;
        padding: 8px 12px;
        border: 0;
        border-radius: 7px;
        color: #49637a;
        background: transparent;
        cursor: pointer;
        font:
          800 0.76rem 'Avenir Next',
          Avenir,
          sans-serif;
        letter-spacing: 0.06em;
      }
      .evidence-tablist button[aria-selected='true'] {
        color: #fff;
        background: #0d8192;
      }
      .evidence-tablist button:focus-visible {
        outline: 3px solid #f59e0b;
        outline-offset: 2px;
      }
      .evidence-note {
        margin: 14px 0 18px;
        color: #52697d;
        font-size: 0.84rem;
        line-height: 1.55;
      }
      .evidence-panel {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      article {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 10px;
        padding: 14px;
        border: 1px solid #d9e6ec;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.88);
      }
      article > span {
        display: grid;
        width: 32px;
        height: 32px;
        place-items: center;
        border-radius: 9px;
        color: #fff;
        background: #be6708;
        font-weight: 900;
      }
      h3 {
        margin: 0 0 5px;
        color: #192b3d;
        font-size: 0.82rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      article p {
        margin: 0;
        color: #40566a;
        line-height: 1.62;
      }
      @media (max-width: 640px) {
        .evidence-heading-row,
        .evidence-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
        }
        .evidence-tablist {
          justify-self: start;
        }
      }
      @media (forced-colors: active) {
        .evidence-tabs,
        .evidence-tablist,
        article {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
        }
        .evidence-tablist button[aria-selected='true'],
        article > span {
          color: HighlightText;
          background: Highlight;
        }
      }
    `,
  ],
})
export class EvidenceAnswerTabs {
  readonly evidence = input.required<EvidenceResponse>();
  protected readonly activeView = signal<EvidenceView>('carl');

  protected moveView(event: KeyboardEvent): void {
    const next: EvidenceView | null =
      event.key === 'ArrowRight' || event.key === 'End'
        ? 'star'
        : event.key === 'ArrowLeft' || event.key === 'Home'
          ? 'carl'
          : null;
    if (!next) return;
    event.preventDefault();
    this.activeView.set(next);
    const tablist = (event.currentTarget as HTMLElement | null)?.parentElement;
    queueMicrotask(() =>
      (tablist?.querySelector(`[data-evidence-view="${next}"]`) as HTMLElement | null)?.focus(),
    );
  }
}
