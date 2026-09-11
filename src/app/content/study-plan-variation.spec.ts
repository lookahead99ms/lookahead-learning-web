import { expect, it } from 'vitest';
import { variedTopics } from './study-plan-variation';
it('varies valid topic order reproducibly without changing inventory', () => {
  const topics = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const orders = Array.from({ length: 20 }, (_, i) =>
    variedTopics(topics, 'topic-tie-v1-' + i).map((t) => t.id),
  );
  expect(new Set(orders.map((x) => x.join())).size).toBeGreaterThan(1);
  for (const order of orders) expect([...order].sort()).toEqual(['a', 'b', 'c', 'd']);
  expect(variedTopics(topics, 'topic-tie-v1-7')).toEqual(variedTopics(topics, 'topic-tie-v1-7'));
  expect(variedTopics([{ id: 'only' }], 'a')).toEqual(variedTopics([{ id: 'only' }], 'b'));
  expect(topics.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
});
