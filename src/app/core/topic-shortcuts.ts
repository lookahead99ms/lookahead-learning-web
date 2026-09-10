import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';

export const TOPIC_SHORTCUTS = [
  { label: 'DSA Practice', route: '/learn/hands-on-dsa' },
  { label: 'System Design', route: '/look-ahead/system-design' },
  {
    label: 'AI Engineering',
    route: '/grow/ai-assisted-development',
  },
  { label: 'Java Foundations', route: '/learn/core-java' },
  { label: 'Behavioral Interviews', route: '/look-ahead/behavioral-carl' },
] as const;

@Component({
  selector: 'app-topic-shortcuts',
  imports: [RouterLink],
  template: `<nav aria-label="Direct topic shortcuts">
    @for (topic of topics; track topic.route) {
      <a [routerLink]="topic.route" (click)="selected.emit()">{{ topic.label }} </a>
    }
  </nav>`,
  styles: [
    `
      nav {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        padding: 12px 0;
      }
      a {
        color: var(--text-strong);
        text-decoration: none;
        background: var(--surface-subtle);
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 10px 12px;
        text-align: center;
        align-items: center;
        line-height: 1.3;
        min-height: 44px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        font-size: 14px;
      }
      a:hover {
        background: var(--surface-accent);
        border-color: var(--accent-strong);
      }
      @media (max-width: 700px) {
        nav {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      a:focus-visible {
        outline: 2px solid var(--accent-strong);
        outline-offset: 3px;
      }
    `,
  ],
})
export class TopicShortcuts {
  protected readonly topics = TOPIC_SHORTCUTS;
  readonly selected = output<void>();
}
