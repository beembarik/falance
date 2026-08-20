const locks = new Map<string, Promise<void>>();

export async function withKeyLocks<T>(keys: string[], operation: () => Promise<T>): Promise<T> {
  const uniqueKeys = [...new Set(keys)].sort();
  return withSortedKeyLocks(uniqueKeys, operation);
}

async function withSortedKeyLocks<T>(keys: string[], operation: () => Promise<T>): Promise<T> {
  const [key, ...remaining] = keys;
  if (!key) return operation();

  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, current);

  await previous.catch(() => undefined);
  try {
    return await withSortedKeyLocks(remaining, operation);
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}
