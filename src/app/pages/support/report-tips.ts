import { Component } from '@angular/core';

/**
 * DLV-971 (owner, 2026-11-06): the four things a useful report carries, as a compact strip. The Support page shows it
 * inside the request card for a learner and inside the private review card for staff, so the words live once.
 */
@Component({
  selector: 'app-report-tips',
  template: `
    <div class="report-tips" role="group" aria-label="A helpful report">
      <p class="tips-label">A helpful report</p>
      <ol>
        <li>
          <span class="tip-icon" aria-hidden="true">👣</span>
          <span><strong>Steps</strong> you took, in order.</span>
        </li>
        <li>
          <span class="tip-icon" aria-hidden="true">🎯</span>
          <span><strong>What you expected</strong> and what happened instead.</span>
        </li>
        <li>
          <span class="tip-icon" aria-hidden="true">🔗</span>
          <span><strong>The page address</strong>, such as /learn/core-java.</span>
        </li>
        <li>
          <span class="tip-icon" aria-hidden="true">🖼️</span>
          <span><strong>A screenshot</strong> when the screen looks wrong.</span>
        </li>
      </ol>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .report-tips {
      padding: 14px 16px 16px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: linear-gradient(
        160deg,
        color-mix(in srgb, var(--path-learn) 9%, var(--surface)),
        var(--surface)
      );
    }
    .tips-label {
      margin: 0 0 10px;
      color: var(--accent-strong);
      font-size: 11.5px;
      font-weight: 750;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    ol {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      min-width: 0;
      color: var(--text-body);
      font-size: 13.5px;
      line-height: 1.45;
    }
    .tip-icon {
      display: grid;
      flex: 0 0 30px;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: var(--surface);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    strong {
      color: var(--text-strong);
    }
    @media (max-width: 900px) {
      ol {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 560px) {
      ol {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class ReportTips {}
