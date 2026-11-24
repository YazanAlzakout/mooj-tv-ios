import { getDatabase } from "@/db/client";

/**
 * One row per provider per catalog section. The payload is JSON of the
 * already-mapped domain objects, so a cached start costs one `JSON.parse`
 * instead of a multi-megabyte network fetch.
 *
 * Live channels are stored **without** their stream URLs — those embed the
 * username and password, and credentials live only in SecureStore
 * (master prompt §8/§30). The URLs are rebuilt from the active config on
 * read; see `catalogCache.ts`.
 */
export type CatalogKind =
  | "live"
  | "live_categories"
  | "movies"
  | "movie_categories"
  | "series"
  | "series_categories";

export interface CachedCatalog<T> {
  data: T;
  fetchedAt: number;
}

export async function readCatalog<T>(providerId: string, kind: CatalogKind): Promise<CachedCatalog<T> | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string; fetched_at: number }>(
    "SELECT payload, fetched_at FROM catalog_cache WHERE provider_id = ? AND kind = ?;",
    [providerId, kind]
  );
  if (!row) return null;
  try {
    return { data: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at };
  } catch {
    // A truncated or corrupted row is worth nothing and must not crash startup.
    await db.runAsync("DELETE FROM catalog_cache WHERE provider_id = ? AND kind = ?;", [providerId, kind]);
    return null;
  }
}

export async function writeCatalog<T>(providerId: string, kind: CatalogKind, data: T): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO catalog_cache (provider_id, kind, payload, fetched_at) VALUES (?, ?, ?, ?);",
    [providerId, kind, JSON.stringify(data), Date.now()]
  );
}

/** Wipes every cached section for one provider — used when its credentials or URL change. */
export async function clearCatalogCache(providerId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM catalog_cache WHERE provider_id = ?;", [providerId]);
}
