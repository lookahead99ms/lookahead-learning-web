import { Directive, Injectable, OnDestroy, effect, inject, input, signal } from '@angular/core';

export interface SidebarRecall {
  id: string;
  prompt: string;
  answer: string;
}

export interface PageSidebarContextValue {
  excluded: boolean;
  recall?: readonly SidebarRecall[];
}

/** Transient view data only: no history, account mutation, storage, or content requests. */
@Injectable({ providedIn: 'root' })
export class PageSidebarContext {
  readonly value = signal<PageSidebarContextValue | null>(null);
  private owner: object | null = null;

  set(owner: object, value: PageSidebarContextValue): void {
    this.owner = owner;
    this.value.set(value);
  }

  clear(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.value.set(null);
  }
}

@Directive({ selector: '[pageSidebarContext]' })
export class PageSidebarContextDirective implements OnDestroy {
  readonly pageSidebarContext = input.required<PageSidebarContextValue>();
  private readonly context = inject(PageSidebarContext);

  constructor() {
    effect(() => this.context.set(this, this.pageSidebarContext()));
  }

  ngOnDestroy(): void {
    this.context.clear(this);
  }
}
