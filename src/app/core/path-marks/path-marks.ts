import { Component } from '@angular/core';

/**
 * The three Look Ahead paths as one short line each (DLV-969 sign-in brand panel). Same icons and words as the
 * landing "Your next chapter" card; the landing keeps its own markup, so this is the shared copy for other pages.
 */
@Component({
  selector: 'app-path-marks',
  templateUrl: './path-marks.html',
  styleUrl: './path-marks.css',
})
export class PathMarks {
  protected readonly paths = [
    { id: 'learn', label: 'Learn', line: 'Understand the fundamentals' },
    { id: 'grow', label: 'Grow', line: 'Handle production reality' },
    { id: 'blaze', label: 'Blaze', line: 'Lead the larger decision' },
  ] as const;
}
