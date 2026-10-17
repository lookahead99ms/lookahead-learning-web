import { DefaultUrlSerializer } from '@angular/router';
import retiredContent from './retired-content-ids.json';
import { retiredContentTarget } from './retired-content-routes';

/**
 * DLV-965: six duplicate Hands-On DSA problems were merged into the problem that keeps teaching
 * the same task. The old question routes redirect through the same table as every other retired
 * lesson; the retired problem ids are listed separately for saved practice progress.
 */
describe('merged DSA problems (DLV-965)', () => {
  const serializer = new DefaultUrlSerializer();
  const target = (url: string) => {
    const tree = retiredContentTarget(serializer.parse(url));
    return tree ? serializer.serialize(tree) : null;
  };
  const merged = retiredContent.courses.filter((entry) => entry.reason.startsWith('DLV-965'));

  it('lists the merges in one Learn algorithmic-patterns entry with no module or unit changes', () => {
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ path: 'learn', courseId: 'algorithmic-patterns' });
    expect(merged[0].modules).toEqual({});
    expect(merged[0].units).toEqual({});
    expect(Object.keys(merged[0].lessons)).toHaveLength(7);
  });

  it.each([
    ['algorithmic-graph-traversal-topo-shortest-paths-floyd-warshall', 'dsa-catalog-all-pairs-shortest-path'],
    ['dsa-catalog-largest-sum-contiguous-subarray', 'algorithmic-dp-state-transition-optimization-kadane-maximum-subarray'],
    ['dsa-catalog-largest-sum-contiguous-subarray-approach-2', 'dsa-catalog-kadane-maximum-subarray-approach-2'],
    ['dsa-catalog-cycle-detection-in-directed-graph', 'dsa-catalog-directed-cycle-detection'],
    ['dsa-catalog-cycle-detection-directed-graph-approach-2', 'dsa-catalog-directed-cycle-detection-approach-2'],
    ['dsa-catalog-delete-middle-element-of-stack', 'dsa-catalog-delete-middle-of-stack'],
    ['dsa-catalog-same-tree-check-dfs-variant', 'dsa-catalog-same-tree-approach-2'],
  ])('sends the merged question %s to %s and keeps the query', (retired, kept) => {
    expect(target(`/learn/algorithmic-patterns/${retired}?mode=surprise`)).toBe(
      `/learn/algorithmic-patterns/${kept}?mode=surprise`,
    );
    expect(target(`/learn/algorithmic-patterns/${kept}`)).toBeNull();
  });

  it('lists each retired problem id once, mapped to a problem that is not itself retired', () => {
    const ids = retiredContent.problems.ids as Record<string, string>;
    expect(Object.keys(ids)).toHaveLength(8);
    for (const [retired, kept] of Object.entries(ids)) {
      expect(kept).not.toBe(retired);
      expect(ids).not.toHaveProperty(kept);
      expect(retired.startsWith('algorithmic-')).toBe(true);
    }
    // Sort an Array with Merge Sort kept its sorting-searching page (the record now opens Sort an
    // Array), so its old route needs no redirect: only the problem id is retired.
    expect(target('/learn/sorting-searching/sorting-searching-sort-array-merge')).toBeNull();
    expect(ids['algorithmic-sort-an-array-with-merge-sort']).toBe('algorithmic-sort-an-array');
  });
});
