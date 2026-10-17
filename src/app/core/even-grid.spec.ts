import { evenGridColumnVars, evenGridColumns } from './even-grid';

describe('even grid columns', () => {
  it('avoids a lonely last card for each row capacity', () => {
    expect(evenGridColumns(1)).toBe(1);
    expect(evenGridColumns(2)).toBe(2);
    expect(evenGridColumns(4)).toBe(2);
    expect(evenGridColumns(4, 4)).toBe(4);
    expect(evenGridColumns(5, 4)).toBe(3);
    expect(evenGridColumns(7)).toBe(3);
  });

  it('lists the even count for every capacity from 2 to 5 as CSS custom properties (DLV-803)', () => {
    expect(evenGridColumnVars(4)).toBe(
      '--even-cols-2: 2; --even-cols-3: 2; --even-cols-4: 4; --even-cols-5: 4',
    );
    expect(evenGridColumnVars(9)).toBe(
      '--even-cols-2: 2; --even-cols-3: 3; --even-cols-4: 3; --even-cols-5: 5',
    );
    expect(evenGridColumnVars(1, 3)).toBe('--even-cols-2: 1; --even-cols-3: 1');
  });
});
