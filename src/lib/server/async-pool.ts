/**
 * Run async work over `items` with at most `limit` concurrent executions.
 * Preserves result order (same indices as `items`).
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const cap = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function runWorker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await worker(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: cap }, () => runWorker()));
  return results;
}
