import { dataScope } from "@/db/dataScope";
import { getDatabase } from "@/db/client";

export type WatchContentType = "movie" | "episode";

export interface WatchProgressEntry {
  contentType: WatchContentType;
  providerItemId: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: number;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  /**
   * Stored redundantly here (also available from the movie/series catalog)
   * so a player screen can resume an item straight from Home's Continue
   * Watching without depending on that catalog having been fetched this
   * session — the common case for a returning user is landing on Home and
   * resuming immediately, before ever opening Movies/Series.
   */
  containerExtension: string;
  /** Only set for contentType "episode" — which series this episode belongs to. */
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

interface WatchProgressRow {
  content_type: WatchContentType;
  provider_item_id: string;
  position_seconds: number;
  duration_seconds: number;
  updated_at: number;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  container_extension: string;
  series_id: string | null;
  season_number: number | null;
  episode_number: number | null;
}

function fromRow(row: WatchProgressRow): WatchProgressEntry {
  return {
    contentType: row.content_type,
    providerItemId: row.provider_item_id,
    positionSeconds: row.position_seconds,
    durationSeconds: row.duration_seconds,
    updatedAt: row.updated_at,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    containerExtension: row.container_extension,
    seriesId: row.series_id,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
  };
}

export async function saveWatchProgress(entry: WatchProgressEntry): Promise<void> {
  const providerId = dataScope();
  /* Nothing is connected, so there is no provider for this row to belong to. */
  if (!providerId) return;
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO watch_progress
       (provider_id, content_type, provider_item_id, position_seconds, duration_seconds, updated_at, title, subtitle, image_url, container_extension, series_id, season_number, episode_number)
     VALUES ($providerId, $contentType, $providerItemId, $positionSeconds, $durationSeconds, $updatedAt, $title, $subtitle, $imageUrl, $containerExtension, $seriesId, $seasonNumber, $episodeNumber)
     ON CONFLICT (provider_id, content_type, provider_item_id) DO UPDATE SET
       position_seconds = excluded.position_seconds,
       duration_seconds = excluded.duration_seconds,
       updated_at = excluded.updated_at,
       title = excluded.title,
       subtitle = excluded.subtitle,
       image_url = excluded.image_url,
       container_extension = excluded.container_extension,
       series_id = excluded.series_id,
       season_number = excluded.season_number,
       episode_number = excluded.episode_number;`,
    {
      $providerId: providerId,
      $contentType: entry.contentType,
      $providerItemId: entry.providerItemId,
      $positionSeconds: entry.positionSeconds,
      $durationSeconds: entry.durationSeconds,
      $updatedAt: entry.updatedAt,
      $title: entry.title,
      $subtitle: entry.subtitle,
      $imageUrl: entry.imageUrl,
      $containerExtension: entry.containerExtension,
      $seriesId: entry.seriesId,
      $seasonNumber: entry.seasonNumber,
      $episodeNumber: entry.episodeNumber,
    }
  );
}

export async function getWatchProgress(
  contentType: WatchContentType,
  providerItemId: string
): Promise<WatchProgressEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<WatchProgressRow>(
    "SELECT * FROM watch_progress WHERE provider_id = $providerId AND content_type = $contentType AND provider_item_id = $providerItemId;",
    { $providerId: dataScope(), $contentType: contentType, $providerItemId: providerItemId }
  );
  return row ? fromRow(row) : null;
}

/** Most recent unfinished episode for a series — "Series Play" resume rule (master prompt §22). */
export async function getMostRecentIncompleteEpisodeForSeries(
  seriesId: string
): Promise<WatchProgressEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<WatchProgressRow>(
    `SELECT * FROM watch_progress
     WHERE provider_id = $providerId AND content_type = 'episode' AND series_id = $seriesId
       AND position_seconds < duration_seconds * 0.95
     ORDER BY updated_at DESC
     LIMIT 1;`,
    { $providerId: dataScope(), $seriesId: seriesId }
  );
  return row ? fromRow(row) : null;
}

export async function getRecentWatchProgress(limit = 10): Promise<WatchProgressEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WatchProgressRow>(
    "SELECT * FROM watch_progress WHERE provider_id = $providerId ORDER BY updated_at DESC LIMIT $limit;",
    { $providerId: dataScope(), $limit: limit }
  );
  return rows.map(fromRow);
}

export async function clearWatchProgress(contentType: WatchContentType, providerItemId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM watch_progress WHERE provider_id = $providerId AND content_type = $contentType AND provider_item_id = $providerItemId;", {
    $providerId: dataScope(),
    $contentType: contentType,
    $providerItemId: providerItemId,
  });
}

/** "Clear watch history" clears THIS provider's history, not every provider's. */
export async function clearAllWatchProgress(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM watch_progress WHERE provider_id = $providerId;", { $providerId: dataScope() });
}
