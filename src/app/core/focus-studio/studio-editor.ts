import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab, isolateHistory } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags, highlightTree, tagHighlighter } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import { PatternLanguage } from '../../content/content.models';

const languages = { python: python(), java: java(), go: go() };
export const editorPalettes = {
  java: {
    name: 'Material',
    bg: '#263238',
    fg: '#b2ccd6',
    keyword: '#c792ea',
    string: '#c3e88d',
    number: '#f78c6c',
    comment: '#8ba3af',
    type: '#ffcb6b',
  },
  python: {
    name: 'One Dark',
    bg: '#282c34',
    fg: '#abb2bf',
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    comment: '#9198a5',
    type: '#e5c07b',
  },
  go: {
    name: 'Gerry',
    bg: '#14161a',
    fg: '#c7ccd1',
    keyword: '#ff6ac1',
    string: '#7fd88f',
    number: '#ffb86c',
    comment: '#969dc0',
    type: '#7aa2f7',
  },
};
const syntaxTags = [
  [tags.keyword, 'keyword'],
  [tags.string, 'string'],
  [tags.number, 'number'],
  [tags.comment, 'comment'],
  [tags.typeName, 'type'],
  [tags.bool, 'keyword'],
] as const;
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function highlightStudioSource(source: string, language: PatternLanguage): string[] {
  let result = '',
    offset = 0;
  highlightTree(
    languages[language].language.parser.parse(source),
    tagHighlighter(syntaxTags.map(([tag, name]) => ({ tag, class: `syntax-${name}` }))),
    (from, to, classes) => {
      result +=
        escapeHtml(source.slice(offset, from)) +
        source
          .slice(from, to)
          .split('\n')
          .map((text) => `<span class="${classes}">${escapeHtml(text)}</span>`)
          .join('\n');
      offset = to;
    },
  );
  return (result + escapeHtml(source.slice(offset))).split('\n');
}

@Component({
  selector: 'app-studio-editor',
  template: `<div #editorHost class="editor-host"></div>
    <div class="editor-status">
      <span>{{ cursor() }}</span
      ><span role="status">{{ status() }}</span>
    </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .editor-host {
        height: var(--studio-code-height, 520px);
        min-height: 240px;
        overflow: hidden;
      }
      .editor-status {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        padding: 10px 14px;
        font:
          12px/1.5 ui-monospace,
          monospace;
        color: var(--muted);
        border-top: 1px solid var(--line);
      }
    `,
  ],
})
export class StudioEditor {
  readonly code = input.required<string>();
  readonly language = input.required<PatternLanguage>();
  readonly draftKey = input.required<string>();
  readonly codeChange = output<string>();
  private readonly host = viewChild<ElementRef<HTMLElement>>('editorHost');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly cursor = signal('Line 1, column 1');
  readonly status = signal('Draft stays on this page.');
  private view?: EditorView;
  private key = '';
  private syncing = false;
  private worker?: Worker;
  private states = new Map<string, { state: EditorState; scrollTop: number; scrollLeft: number }>();

  constructor() {
    effect(() => {
      const host = this.host()?.nativeElement,
        code = this.code(),
        language = this.language(),
        key = this.draftKey();
      if (!host) return;
      if (!this.view) {
        this.key = key;
        this.view = new EditorView({ parent: host, state: this.createState(code, language) });
      } else if (this.key !== key) {
        this.states.set(this.key, {
          state: this.view.state,
          scrollTop: this.view.scrollDOM.scrollTop,
          scrollLeft: this.view.scrollDOM.scrollLeft,
        });
        const saved = this.states.get(key);
        this.key = key;
        this.view.setState(
          saved?.state.doc.toString() === code ? saved.state : this.createState(code, language),
        );
        this.view.scrollDOM.scrollTop = saved?.scrollTop ?? 0;
        this.view.scrollDOM.scrollLeft = saved?.scrollLeft ?? 0;
      } else if (this.view.state.doc.toString() !== code) {
        this.syncing = true;
        this.view.dispatch({
          changes: { from: 0, to: this.view.state.doc.length, insert: code },
          annotations: isolateHistory.of('full'),
        });
        this.syncing = false;
      }
    });
    this.destroyRef.onDestroy(() => {
      this.view?.destroy();
      this.worker?.terminate();
    });
  }

  private createState(code: string, language: PatternLanguage): EditorState {
    const palette = editorPalettes[language];
    return EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        keymap.of([
          indentWithTab,
          {
            key: 'Alt-Shift-f',
            run: () => {
              void this.format();
              return true;
            },
          },
        ]),
        languages[language],
        EditorState.tabSize.of(language === 'go' ? 4 : 2),
        EditorView.contentAttributes.of({
          'aria-label': 'Your practice code',
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'off',
        }),
        EditorView.theme(
          {
            '&': { height: '100%', backgroundColor: palette.bg, color: palette.fg },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, monospace',
              fontSize: '13px',
              lineHeight: '24px',
              overflow: 'auto',
            },
            '.cm-content': { padding: '16px 0', caretColor: palette.fg },
            '.cm-line': { padding: '0 16px' },
            '.cm-gutters': {
              backgroundColor: palette.bg,
              color: palette.fg,
              borderRight: '1px solid #43515a',
            },
            '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: '#ffffff0d' },
            '&.cm-focused .cm-selectionBackground,.cm-selectionBackground': {
              backgroundColor: '#48678280',
            },
            '.cm-cursor': { borderLeftColor: palette.fg },
          },
          { dark: true },
        ),
        syntaxHighlighting(
          HighlightStyle.define(syntaxTags.map(([tag, key]) => ({ tag, color: palette[key] }))),
        ),
        EditorView.updateListener.of((update) => {
          if (this.syncing) return;
          if (update.docChanged) this.codeChange.emit(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) {
            const position = update.state.selection.main.head,
              line = update.state.doc.lineAt(position);
            this.cursor.set(`Line ${line.number}, column ${position - line.from + 1}`);
          }
        }),
      ],
    });
  }

  async format(): Promise<void> {
    const view = this.view;
    if (!view || this.worker) return;
    const originalState = view.state,
      originalKey = this.key,
      code = originalState.doc.toString();
    if (code.length > 100000) {
      this.status.set('Formatting supports up to 100,000 characters. Draft kept unchanged.');
      return;
    }
    if (typeof Worker === 'undefined') {
      this.status.set('Local formatting is unavailable in this browser.');
      return;
    }
    this.status.set('Formatting locally…');
    const worker = (this.worker = new Worker(new URL('./formatter.worker', import.meta.url), {
      type: 'module',
    }));
    try {
      const formatted = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Formatting timed out.')), 12000);
        worker.onmessage = (event) => {
          clearTimeout(timer);
          event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.code);
        };
        worker.onerror = () => {
          clearTimeout(timer);
          reject(new Error('The formatter could not load.'));
        };
        worker.postMessage({ code, language: this.language() });
      });
      if (this.destroyRef.destroyed) return;
      if (this.key !== originalKey || view.state !== originalState) {
        this.status.set('Draft changed while formatting. No changes applied.');
        return;
      }
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
        annotations: isolateHistory.of('full'),
      });
      this.status.set('Code formatted. Undo is available.');
      view.focus();
    } catch (error) {
      if (!this.destroyRef.destroyed)
        this.status.set(
          `Not formatted: ${error instanceof Error ? error.message : 'Formatter failed.'} Draft kept unchanged.`,
        );
    } finally {
      worker.terminate();
      this.worker = undefined;
    }
  }
}
