import type { SQLiteDatabase } from "expo-sqlite";

import { getDatabase } from "@/db/client";
import type { LiveChannel, XtreamProviderConfig } from "@/domain/provider/types";
import { getSeriesList, loadSeriesList } from "@/state/seriesStore";
import { getVodMovies, loadVodMovies } from "@/state/vodStore";

export type SearchContentType = "live" | "movie" | "series";

export interface SearchResult {
  contentType: SearchContentType;
  providerItemId: string;
  name: string;
  subtitle: string | null;
  imageUrl: string | null;
  categoryId: string | null;
}

interface IndexRow {
  contentType: SearchContentType;
  providerItemId: string;
  name: string;
  subtitle: string | null;
  imageUrl: string | null;
  categoryId: string | null;
}

/** Rows per batched INSERT — one native round-trip per batch instead of one per row (~38k rows total). */
const BATCH_SIZE = 300;

let indexed = false;

/** Called by activeSessionStore whenever the session changes — the next ensureSearchIndexReady() rebuilds from scratch. */
export function resetSearchIndex(): void {
  indexed = false;
}

async function insertBatched(db: SQLiteDatabase, rows: IndexRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const params = chunk.flatMap((r) => [r.contentType, r.providerItemId, r.name, r.subtitle, r.imageUrl, r.categoryId]);
    await db.runAsync(
      `INSERT INTO search_index (content_type, provider_item_id, name, subtitle, image_url, category_id) VALUES ${placeholders};`,
      params
    );
  }
}

/**
 * Builds (once per session) a SQLite-backed search index from live
 * channels (already loaded at session restore) plus movies/series —
 * lazy-loading those here if the user hasn't visited those sections yet,
 * so search always covers everything master prompt §18 asks for ("live;
 * movies; series"), not just whatever happens to already be in memory.
 *
 * Rebuilding is a one-time per-session cost (shown behind a loading state
 * in the search screen); searching *from* the index afterwards is what
 * happens on every keystroke (see searchContent) — that split is the
 * actual point of §18's "use SQLite/indexed querying rather than filtering
 * 20,000 JS objects [on every keystroke]". Inserts are batched (300
 * rows/statement) rather than one `executeAsync` per row — verified this
 * matters at this project's real scale (~38k combined rows across our test
 * provider's live+movie+series catalogs).
 */
export async function ensureSearchIndexReady(
  config: XtreamProviderConfig,
  channels: LiveChannel[]
): Promise<void> {
  if (indexed) return;

  const movies = getVodMovies() ?? (await loadVodMovies(config));
  const series = getSeriesList() ?? (await loadSeriesList(config));

  const rows: IndexRow[] = [
    ...channels.map((c) => ({
      contentType: "live" as const,
      providerItemId: c.providerItemId,
      name: c.name,
      subtitle: null,
      imageUrl: c.logoUrl,
      categoryId: c.categoryId,
    })),
    ...movies.map((m) => ({
      contentType: "movie" as const,
      providerItemId: m.providerItemId,
      name: m.name,
      // MovieSummary has no year field — this provider never supplies one
      // for movies (see docs/DECISIONS.md), unlike series.
      subtitle: null,
      imageUrl: m.posterUrl,
      categoryId: m.categoryId,
    })),
    ...series.map((s) => ({
      contentType: "series" as const,
      providerItemId: s.providerItemId,
      name: s.name,
      subtitle: s.year,
      imageUrl: s.posterUrl,
      categoryId: s.categoryId,
    })),
  ];

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM search_index;");
    await insertBatched(db, rows);
  });

  indexed = true;
}

/**
 * How many rows one settled keystroke is allowed to bring back.
 *
 * Exported because the search screen has to say this number out loud: a
 * query that hits the cap is shown as "50+" rather than as a count, and the
 * 50 in the header and the 50 in the SQL have to be the same 50.
 */
export const SEARCH_RESULT_LIMIT = 50;

/**
 * One capped page of matches, and whether the cap cut anything off.
 *
 * The flag exists because of what the bare count did without it, found in
 * the pre-release audit on 2026-11-17: a viewer on the real test provider
 * types one common letter — "a", or "ال" on an Arabic lineup — and matches
 * thousands of titles. They were shown the fifty alphabetically first and a
 * bare "50" under the word Search, which reads as "there are fifty of
 * these". The title they were looking for was in the catalogue, was past
 * the fiftieth row, and nothing on screen said so — so Search looked broken
 * rather than limited.
 */
export interface SearchResultPage {
  /** At most `limit` rows, in name order. */
  results: SearchResult[];
  /** True when the index held more than `limit` matches and this page was cut. */
  truncated: boolean;
}

/**
 * The query that runs on every settled keystroke.
 *
 * **The cap stays.** It is what keeps the keystroke cheap, and that split —
 * build the index once per session, read a bounded slice of it per
 * keystroke — is the whole point of §18 (see ensureSearchIndexReady above).
 *
 * What changed is that we ask for one row *past* the cap. If row
 * `limit + 1` comes back, the page was cut; the extra row is dropped here
 * rather than shown, so the screen still receives exactly `limit` rows and
 * the list below is unchanged. It is the only honest way to tell "exactly
 * fifty" apart from "at least fifty", and it is close to free: migration 3
 * created `idx_search_index_name ON search_index(name COLLATE NOCASE)`, so
 * SQLite walks that index in name order and tests the LIKE as it goes
 * rather than sorting a result set, and it stops the moment the LIMIT is
 * filled. Asking for 51 means walking a little further along the index to
 * find one more match — and on the query this was written for, the common
 * letter that matches thousands, that is the very next row.
 */
export async function searchContent(
  query: string,
  limit = SEARCH_RESULT_LIMIT
): Promise<SearchResultPage> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], truncated: false };

  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    content_type: SearchContentType;
    provider_item_id: string;
    name: string;
    subtitle: string | null;
    image_url: string | null;
    category_id: string | null;
  }>(
    `SELECT content_type, provider_item_id, name, subtitle, image_url, category_id
     FROM search_index
     WHERE name LIKE '%' || ? || '%' COLLATE NOCASE
     ORDER BY name COLLATE NOCASE
     LIMIT ?;`,
    [trimmed, limit + 1]
  );

  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;

  return {
    results: page.map((row) => ({
      contentType: row.content_type,
      providerItemId: row.provider_item_id,
      name: row.name,
      subtitle: row.subtitle,
      imageUrl: row.image_url,
      categoryId: row.category_id,
    })),
    truncated,
  };
}
