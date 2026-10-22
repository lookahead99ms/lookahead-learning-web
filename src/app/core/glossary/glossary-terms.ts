import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ContentService } from '../../content/content.service';
import type { GlossaryTerm } from '../../content/content.models';
import {
  GLOSSARY_TERM_ATTRIBUTE,
  GLOSSARY_TERM_CLASS,
  buildGlossaryMatcher,
  markGlossaryTerms,
} from './glossary-matcher';

const TIP_ID = 'glossary-tip';
const TIP_DELAY_MS = 120;
const TIP_GAP_PX = 8;
const VIEWPORT_GUTTER_PX = 8;

/**
 * Glossary terms (2026-10-22). Marks the first mention of each glossary term in every section of
 * the host's content. Hovering or focusing a mark shows the definition in a tooltip; activating it
 * opens a dialog that lists the lessons about the term and navigates to the chosen one. A lesson
 * never marks the terms it teaches itself, and a path without a glossary leaves the text untouched.
 *
 * Usage: <app-foundation-lesson-shell [appGlossaryTerms]="pathId()" [glossaryLesson]="item.id" … />
 */
@Directive({ selector: '[appGlossaryTerms]' })
export class GlossaryTerms {
  /** Catalog path whose glossary applies, e.g. "blaze". */
  readonly glossaryPath = input.required<string>({ alias: 'appGlossaryTerms' });
  /** The lesson on the page; its own terms are left unmarked. */
  readonly glossaryLesson = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly terms = signal<GlossaryTerm[]>([]);
  private readonly matcher = computed(() => buildGlossaryMatcher(this.terms(), this.glossaryLesson()));
  private observer: MutationObserver | null = null;
  private scheduled = false;
  private tip: HTMLElement | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;
  private tipFor: HTMLElement | null = null;
  private dialog: HTMLDialogElement | null = null;
  private dialogFor: HTMLElement | null = null;

  constructor() {
    effect((onCleanup) => {
      const subscription = this.content
        .getGlossary(this.glossaryPath())
        .subscribe((terms) => this.terms.set(terms));
      onCleanup(() => subscription.unsubscribe());
    });
    afterRenderEffect(() => {
      this.matcher();
      this.schedule();
    });
    const view = this.document.defaultView;
    if (typeof MutationObserver === 'function') {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(this.host, { childList: true, subtree: true, characterData: true });
    }
    this.host.addEventListener('mouseover', this.onPointerOver);
    this.host.addEventListener('mouseout', this.onPointerOut);
    this.host.addEventListener('focusin', this.onFocusIn);
    this.host.addEventListener('focusout', this.onFocusOut);
    this.host.addEventListener('click', this.onClick);
    this.host.addEventListener('keydown', this.onKeydown);
    view?.addEventListener('scroll', this.hideTip, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => {
      this.observer?.disconnect();
      this.host.removeEventListener('mouseover', this.onPointerOver);
      this.host.removeEventListener('mouseout', this.onPointerOut);
      this.host.removeEventListener('focusin', this.onFocusIn);
      this.host.removeEventListener('focusout', this.onFocusOut);
      this.host.removeEventListener('click', this.onClick);
      this.host.removeEventListener('keydown', this.onKeydown);
      view?.removeEventListener('scroll', this.hideTip, { capture: true });
      this.hideTip();
      this.tip?.remove();
      this.dialog?.remove();
    });
  }

  /** Marks once per task, after Angular and the observer have reported every change. */
  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.apply();
    });
  }

  private apply(): void {
    const matcher = this.matcher();
    if (!matcher) return;
    markGlossaryTerms(this.host, matcher);
    // Our own edits must not schedule another pass.
    this.observer?.takeRecords();
  }

  private termAt(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>(`.${GLOSSARY_TERM_CLASS}`) : null;
  }

  private termFor(mark: HTMLElement): GlossaryTerm | undefined {
    const id = mark.getAttribute(GLOSSARY_TERM_ATTRIBUTE);
    return this.terms().find((term) => term.id === id);
  }

  private readonly onPointerOver = (event: MouseEvent): void => {
    const mark = this.termAt(event.target);
    if (!mark || mark === this.tipFor) return;
    this.clearTipTimer();
    this.tipTimer = setTimeout(() => this.showTip(mark), TIP_DELAY_MS);
  };

  private readonly onPointerOut = (event: MouseEvent): void => {
    const mark = this.termAt(event.target);
    if (!mark) return;
    if (event.relatedTarget instanceof Node && mark.contains(event.relatedTarget)) return;
    if (this.document.activeElement === mark) return;
    this.hideTip();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    const mark = this.termAt(event.target);
    if (mark) this.showTip(mark);
  };

  private readonly onFocusOut = (event: FocusEvent): void => {
    if (this.termAt(event.target)) this.hideTip();
  };

  private readonly onClick = (event: MouseEvent): void => {
    const mark = this.termAt(event.target);
    if (!mark) return;
    event.preventDefault();
    this.hideTip();
    this.openDialog(mark);
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.tipFor) this.hideTip();
  };

  private clearTipTimer(): void {
    if (this.tipTimer !== null) clearTimeout(this.tipTimer);
    this.tipTimer = null;
  }

  private ensureTip(): HTMLElement {
    if (this.tip) return this.tip;
    const tip = this.document.createElement('div');
    tip.id = TIP_ID;
    tip.className = 'glossary-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    tip.innerHTML =
      '<strong class="glossary-tip-term"></strong><span class="glossary-tip-text"></span><span class="glossary-tip-hint">Click to open the lessons</span>';
    this.document.body.append(tip);
    this.tip = tip;
    return tip;
  }

  private showTip(mark: HTMLElement): void {
    this.clearTipTimer();
    const term = this.termFor(mark);
    if (!term) return;
    const tip = this.ensureTip();
    tip.querySelector('.glossary-tip-term')!.textContent = term.term;
    tip.querySelector('.glossary-tip-text')!.textContent = term.definition;
    if (this.tipFor && this.tipFor !== mark) this.tipFor.removeAttribute('aria-describedby');
    this.tipFor = mark;
    mark.setAttribute('aria-describedby', TIP_ID);
    tip.hidden = false;
    this.placeTip(tip, mark);
  }

  private placeTip(tip: HTMLElement, mark: HTMLElement): void {
    const view = this.document.defaultView;
    if (!view) return;
    const anchor = mark.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const maxLeft = Math.max(VIEWPORT_GUTTER_PX, view.innerWidth - width - VIEWPORT_GUTTER_PX);
    const left = Math.min(Math.max(anchor.left, VIEWPORT_GUTTER_PX), maxLeft);
    let top = anchor.bottom + TIP_GAP_PX;
    if (top + height > view.innerHeight - VIEWPORT_GUTTER_PX) top = Math.max(VIEWPORT_GUTTER_PX, anchor.top - height - TIP_GAP_PX);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  private readonly hideTip = (): void => {
    this.clearTipTimer();
    if (this.tip) this.tip.hidden = true;
    this.tipFor?.removeAttribute('aria-describedby');
    this.tipFor = null;
  };

  private ensureDialog(): HTMLDialogElement {
    if (this.dialog) return this.dialog;
    const dialog = this.document.createElement('dialog');
    dialog.className = 'glossary-dialog';
    dialog.setAttribute('aria-labelledby', 'glossary-dialog-title');
    dialog.innerHTML = [
      '<div class="glossary-dialog-shell">',
      '<div class="glossary-dialog-head"><div><p class="glossary-eyebrow">Glossary</p><h2 id="glossary-dialog-title"></h2></div>',
      '<button type="button" class="glossary-close">Close</button></div>',
      '<div class="glossary-dialog-body"><p class="glossary-definition"></p>',
      '<p class="glossary-read">Read a lesson about this:</p><div class="glossary-links"></div></div>',
      '</div>',
    ].join('');
    dialog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === dialog || target.closest('.glossary-close')) {
        this.closeDialog();
        return;
      }
      const link = target.closest<HTMLAnchorElement>('a.glossary-link');
      if (!link) return;
      event.preventDefault();
      const href = link.getAttribute('href') ?? '';
      this.closeDialog();
      void this.router.navigateByUrl(href);
    });
    dialog.addEventListener('close', () => {
      const mark = this.dialogFor;
      this.dialogFor = null;
      if (mark?.isConnected) mark.focus();
    });
    this.document.body.append(dialog);
    this.dialog = dialog;
    return dialog;
  }

  private openDialog(mark: HTMLElement): void {
    const term = this.termFor(mark);
    if (!term) return;
    const dialog = this.ensureDialog();
    dialog.querySelector('#glossary-dialog-title')!.textContent = term.term;
    dialog.querySelector('.glossary-definition')!.textContent = term.definition;
    const links = dialog.querySelector('.glossary-links')!;
    links.replaceChildren(
      ...term.lessons.map((lesson) => {
        const link = this.document.createElement('a');
        link.className = 'glossary-link';
        link.href = `/${lesson.path ?? this.glossaryPath()}/${lesson.courseId}/${lesson.lessonId}`;
        link.textContent = lesson.title;
        return link;
      }),
    );
    this.dialogFor = mark;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (dialog.querySelector<HTMLElement>('a.glossary-link') ?? dialog.querySelector<HTMLElement>('.glossary-close'))?.focus();
  }

  private closeDialog(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    }
  }
}
