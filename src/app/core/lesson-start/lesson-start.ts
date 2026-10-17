import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonLanguageDownload, LessonRunLocally } from '../../content/content.models';
import { ReferenceLanguageService } from '../reference-language';
import { zipStore } from '../zip/zip-store';

const LANGUAGE_NAMES: Record<string, string> = { java: 'Java', python: 'Python', go: 'Go' };

/**
 * Before you start (user review, 2026-10-05): the lessons to know first, as links that show only the title, and a closed
 * "Run it yourself" section with requirements, version notes, the project download and how to open it in
 * IntelliJ IDEA or VS Code. The project arrives as a JSON bundle (the content API has no zip type) and is
 * packed into a .zip in the browser.
 */
@Component({
  selector: 'app-lesson-start',
  imports: [RouterLink],
  template: `
    @if (prerequisites().length) {
      <h3 class="start-heading">Know these first</h3>
      <ul class="start-prerequisites">
        @for (item of prerequisites(); track item.href) {
          <li>
            <a class="action-chip" [routerLink]="item.href">{{ item.title }}</a>
          </li>
        }
      </ul>
    }
    @if (runLocally(); as run) {
      <!-- Run it yourself (user review, 2026-10-05): what to install, version notes, the project download
           and how to open it in IntelliJ IDEA or VS Code. Closed by default. -->
      <details class="run-locally">
        <summary>Run it yourself</summary>
        <div class="run-locally-body">
          @if (languageDownloads().length) {
            <!-- DLV-935: one project per language; the choice is the page-wide reference language. -->
            <div class="project-languages" role="group" aria-label="Project language">
              @for (item of languageDownloads(); track item.language) {
                <button type="button" [attr.aria-pressed]="item.language === activeDownload()?.language"
                  (click)="languages.select(item.language)">{{ languageName(item.language) }}</button>
              }
            </div>
          }
          @if (activeDownload(); as active) {
            <h4>What you need</h4>
            <ul>
              @for (item of active.requirements; track item) {
                <li class="rich" [innerHTML]="item"></li>
              }
            </ul>
            <button type="button" class="project-download" [disabled]="downloadState() === 'working'" (click)="downloadProject(active.href)">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13.5h10" /></svg>
              {{ downloadState() === 'working' ? 'Preparing the zip…' : active.label }}
            </button>
            @if (downloadState() === 'failed') {
              <p class="project-download-error" role="alert">The download did not start. Check that you are signed in, then try again.</p>
            }
            <h4>Open, run and test it</h4>
            <ol>
              @for (item of active.steps; track item) {
                <li class="rich" [innerHTML]="item"></li>
              }
            </ol>
          } @else {
          <h4>What you need</h4>
          <ul>
            @for (item of run.requirements; track item) {
              <li class="rich" [innerHTML]="item"></li>
            }
          </ul>
          @if (run.versionNotes?.length) {
            <h4>On other versions</h4>
            <ul>
              @for (item of run.versionNotes; track item) {
                <li class="rich" [innerHTML]="item"></li>
              }
            </ul>
          }
          @if (run.download; as download) {
            <button type="button" class="project-download" [disabled]="downloadState() === 'working'" (click)="downloadProject(download.href)">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13.5h10" /></svg>
              {{ downloadState() === 'working' ? 'Preparing the zip…' : (download.label ?? 'Download the project (.zip)') }}
            </button>
            @if (downloadState() === 'failed') {
              <p class="project-download-error" role="alert">The download did not start. Check that you are signed in, then try again.</p>
            }
          }
          <h4>Open and run it</h4>
          <ol>
            @for (item of run.steps; track item) {
              <li class="rich" [innerHTML]="item"></li>
            }
          </ol>
          }
        </div>
      </details>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .start-heading {
        margin: 1rem 0 0.4rem;
        font-size: 0.95rem;
      }
      /* DLV-937: each lesson to know first is a chip, not a bare underlined title. */
      .start-prerequisites {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .run-locally {
        margin-top: 1rem;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .run-locally > summary {
        padding: 10px 14px;
        font-weight: 700;
        cursor: pointer;
      }
      .run-locally-body {
        padding: 0 16px 14px;
      }
      .run-locally-body h4 {
        margin: 0.8rem 0 0.3rem;
        font-size: 0.85rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-subtle);
      }
      .run-locally-body :is(ul, ol) {
        max-width: var(--reading-measure, 72ch);
        margin: 0;
        padding-left: 1.2rem;
        line-height: 1.6;
      }
      .project-download {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0.9rem 0 0.2rem;
        padding: 8px 14px;
        border: 0;
        border-radius: 9px;
        background: var(--accent-strong);
        color: var(--accent-on-primary);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .project-download svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .project-download:disabled {
        opacity: 0.7;
        cursor: progress;
      }
      .project-languages {
        display: inline-flex;
        gap: 4px;
        margin: 0.4rem 0 0.2rem;
        padding: 3px;
        border: 1px solid var(--line);
        border-radius: 999px;
      }
      .project-languages button {
        min-height: 32px;
        padding: 4px 14px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--text-subtle);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .project-languages button[aria-pressed='true'] {
        background: var(--accent-strong);
        color: var(--accent-on-primary);
      }
      .project-languages button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .project-download-error {
        color: var(--code-danger, #b3261e);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class LessonStart {
  readonly prerequisites = input<readonly { title: string; href: string; where?: string }[]>([]);
  readonly runLocally = input<LessonRunLocally | null>(null);

  protected readonly downloadState = signal<'idle' | 'working' | 'failed'>('idle');
  protected readonly languages = inject(ReferenceLanguageService);
  protected readonly languageDownloads = computed<readonly LessonLanguageDownload[]>(() => this.runLocally()?.downloads ?? []);
  /** The download for the page-wide reference language, or the first one when the lesson lacks it. */
  protected readonly activeDownload = computed(() => {
    const downloads = this.languageDownloads();
    return downloads.find((item) => item.language === this.languages.selected()) ?? downloads[0] ?? null;
  });

  protected languageName(language: string): string {
    return LANGUAGE_NAMES[language] ?? language;
  }

  /**
   * Downloads the lesson's project: the content API serves it as a JSON bundle of text files (it has no
   * zip type), and the browser packs it into <lessonId>.zip.
   */
  protected async downloadProject(href: string): Promise<void> {
    this.downloadState.set('working');
    try {
      const response = await fetch(href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const project = (await response.json()) as { zipName: string; root: string; files: { path: string; content: string }[] };
      const bytes = zipStore(project.files, project.root);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: project.zipName });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.downloadState.set('idle');
    } catch {
      this.downloadState.set('failed');
    }
  }
}
