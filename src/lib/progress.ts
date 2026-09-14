import { get, set } from 'idb-keyval';

interface ItemStat {
  attempts: number;
  correct: number;
  lastResult: boolean | null;
}

const KEY = 'greek-practice:vocab-stats';

async function loadAll(): Promise<Record<string, ItemStat>> {
  return (await get(KEY)) ?? {};
}

export async function recordResult(itemId: string, correct: boolean): Promise<void> {
  const all = await loadAll();
  const cur = all[itemId] ?? { attempts: 0, correct: 0, lastResult: null };
  cur.attempts += 1;
  if (correct) cur.correct += 1;
  cur.lastResult = correct;
  all[itemId] = cur;
  await set(KEY, all);
}

export async function getStats(itemId: string): Promise<ItemStat | null> {
  const all = await loadAll();
  return all[itemId] ?? null;
}
