import {
  Component,
  ChangeDetectorRef,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink, NavigationStart } from '@angular/router';
import { Subscription } from 'rxjs';
import { LEARN_COURSE_GROUPS } from '../../content/learn-course-groups';
import { GROW_COURSE_GROUPS } from '../../content/grow-course-groups';
import { LOOK_AHEAD_COURSE_GROUPS } from '../../content/look-ahead-course-groups';
import { NavigationCourse, NavigationService } from './navigation.service';

@Component({
  selector: 'app-header-navigation',
  imports: [RouterLink],
  templateUrl: './header-navigation.html',
  styleUrl: './header-navigation.css',
})
export class HeaderNavigation implements OnDestroy {
  private readonly data = inject(NavigationService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly router = inject(Router);
  readonly opened = output<void>();
  protected readonly paths = [
    { id: 'learn', label: 'Learn', groups: LEARN_COURSE_GROUPS },
    { id: 'grow', label: 'Grow', groups: GROW_COURSE_GROUPS },
    { id: 'look-ahead', label: 'Look Ahead', groups: LOOK_AHEAD_COURSE_GROUPS },
  ];
  protected readonly activePath = signal('');
  protected readonly courses = signal<NavigationCourse[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private pointerType = '';
  private request?: Subscription;
  private readonly routeSubscription = this.router.events.subscribe((event) => {
    if (event instanceof NavigationStart) this.close();
  });
  protected readonly groups = computed(() => {
    const groups = this.paths.find((path) => path.id === this.activePath())?.groups ?? [];
    const courses = this.courses();
    const assigned = new Set(groups.flatMap((group) => group.courseIds));
    return [
      ...groups.map((group) => ({
        ...group,
        courses: group.courseIds.flatMap((id) => courses.filter((course) => course.id === id)),
      })),
      {
        id: '',
        title: 'More to explore',
        courses: courses.filter((course) => !assigned.has(course.id)),
      },
    ].filter((group) => group.courses.length);
  });

  protected openPath(path: string): void {
    if (this.activePath() === path) return;
    this.close();
    this.opened.emit();
    this.activePath.set(path);
    this.loading.set(true);
    this.request = this.data.courses(path).subscribe({
      next: (value) => {
        this.courses.set(value.courses);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
  protected rememberPointer(event: PointerEvent): void {
    this.pointerType = event.pointerType;
  }

  protected hoverPath(event: PointerEvent, path: string): void {
    this.keepOpen();
    if (event.pointerType !== 'mouse') return;
    this.cancelOpening();
    this.openTimer = setTimeout(() => this.openPath(path), 180);
  }
  protected cancelOpening(): void {
    clearTimeout(this.openTimer);
    this.openTimer = undefined;
  }
  protected keepOpen(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
  }
  protected leaveSurface(event: PointerEvent): void {
    this.cancelOpening();
    if (event.pointerType !== 'mouse') return;
    this.keepOpen();
    this.closeTimer = setTimeout(() => {
      const panel = this.element.nativeElement.querySelector('.navigation-panel');
      if (!panel?.contains(this.element.nativeElement.ownerDocument.activeElement)) this.close();
    }, 280);
  }
  protected activateLink(event: MouseEvent, path: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const touch = event.detail > 0 && ['touch', 'pen'].includes(this.pointerType);
    this.pointerType = '';
    if (touch && this.activePath() !== path) {
      event.preventDefault();
      this.openPath(path);
      return;
    }
    event.preventDefault();
    void this.router.navigate(['/', path]);
  }
  protected openWithKeyboard(event: KeyboardEvent, path: string): void {
    this.pointerType = '';
    if (event.key !== 'ArrowDown' && event.key !== ' ') return;
    event.preventDefault();
    this.openPath(path);
    // Render before moving focus; loading must not steal focus later.
    this.changeDetector.detectChanges();
    this.element.nativeElement.querySelector<HTMLAnchorElement>('.panel-heading a')?.focus();
  }
  protected currentPath(path: string): boolean {
    return (
      this.router.url.split('?')[0].startsWith('/' + path + '/') ||
      this.router.url.split('?')[0] === '/' + path
    );
  }
  protected currentCourse(path: string, course: string): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/' + path + '/' + course || url.startsWith('/' + path + '/' + course + '/');
  }
  close(restoreFocus = false): void {
    this.cancelOpening();
    this.keepOpen();
    const path = this.activePath();
    this.request?.unsubscribe();
    this.activePath.set('');
    this.courses.set([]);
    this.error.set(false);
    if (restoreFocus && path)
      this.element.nativeElement.querySelector<HTMLAnchorElement>(`#browse-${path}`)?.focus();
  }
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.cancelOpening();
    if (event.key === 'Escape' && this.activePath()) {
      event.preventDefault();
      this.close(true);
    }
  }
  @HostListener('document:click', ['$event'])
  protected outside(event: MouseEvent): void {
    if (this.activePath() && !event.composedPath().includes(this.element.nativeElement))
      this.close();
  }
  @HostListener('document:focusin', ['$event'])
  protected focusOutside(event: FocusEvent): void {
    if (this.activePath() && !event.composedPath().includes(this.element.nativeElement))
      this.close();
  }
  ngOnDestroy(): void {
    this.close();
    this.routeSubscription.unsubscribe();
  }
}
