import { HandsOnSort } from '../../content/hands-on-dsa';

/**
 * The sortable columns of both catalog tables: the flat "All problems" table and one pattern's
 * table in "By pattern". One sort (the `sort` URL parameter) drives both, so a chosen order
 * carries across the views and across patterns. Status is not sortable.
 */
export const SORT_COLUMNS = [
  {
    id: 'learning',
    label: 'Learning order',
    ascending: 'study-order',
    descending: 'study-order-descending',
  },
  { id: 'title', label: 'Problem', ascending: 'title-ascending', descending: 'title-descending' },
  {
    id: 'difficulty',
    label: 'Difficulty',
    ascending: 'difficulty-ascending',
    descending: 'difficulty-descending',
  },
  {
    id: 'interview',
    label: 'Interview priority',
    ascending: 'interview-rank',
    descending: 'interview-rank-descending',
  },
] as const satisfies readonly {
  id: string;
  label: string;
  ascending: HandsOnSort;
  descending: HandsOnSort;
}[];

export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortColumnId = SortColumn['id'];
export type SortDirection = 'ascending' | 'descending' | 'none';

export function columnSortDirection(sort: HandsOnSort, id: SortColumnId): SortDirection {
  const column = SORT_COLUMNS.find((item) => item.id === id)!;
  return sort === column.ascending ? 'ascending' : sort === column.descending ? 'descending' : 'none';
}

/** The arrow beside a header: the current direction, or ↕ when the column is not the sort. */
export function columnSortArrow(sort: HandsOnSort, id: SortColumnId): string {
  const direction = columnSortDirection(sort, id);
  return direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕';
}

/** Says what a click does. Sorting by difficulty is off while the list shows one difficulty. */
export function columnSortLabel(
  sort: HandsOnSort,
  column: SortColumn,
  difficultyFiltered: boolean,
): string {
  if (column.id === 'difficulty' && difficultyFiltered)
    return 'Difficulty: sorting unavailable while filtered to one difficulty';
  const direction = columnSortDirection(sort, column.id) === 'ascending' ? 'descending' : 'ascending';
  return `Sort by ${column.label.toLowerCase()}, ${direction}`;
}

/** A click sorts ascending first, then flips the direction. */
export function nextColumnSort(sort: HandsOnSort, id: SortColumnId): HandsOnSort {
  const column = SORT_COLUMNS.find((item) => item.id === id)!;
  return columnSortDirection(sort, id) === 'ascending' ? column.descending : column.ascending;
}

/** How the list is sorted, for the result line above both views. */
export const SORT_DESCRIPTIONS: Record<HandsOnSort, string> = {
  'study-order': 'sorted by learning order, first to last',
  'study-order-descending': 'sorted by learning order, last to first',
  'interview-rank': 'sorted by interview priority, highest priority first',
  'interview-rank-descending': 'sorted by interview priority, lowest priority first',
  'title-ascending': 'sorted by problem name, A to Z',
  'title-descending': 'sorted by problem name, Z to A',
  'difficulty-ascending': 'sorted by difficulty, Beginner first',
  'difficulty-descending': 'sorted by difficulty, Advanced first',
  // Old URLs only: `sort=pattern-order` now opens By pattern in learning order.
  'pattern-order': 'sorted by learning order, first to last',
};
