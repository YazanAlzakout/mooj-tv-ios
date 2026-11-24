import { dataScope } from "@/db/dataScope";
import { getDatabase } from "@/db/client";

export type DownloadContentType = "movie" | "episode";
export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";

export interface DownloadTask {
  id: string;
  contentType: DownloadContentType;
  providerItemId: string;
  providerId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  containerExtension: string;
  localUri: string | null;
  status: DownloadStatus;
  bytesDownloaded: number;
  bytesTotal: number | null;
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  createdAt: number;
  updatedAt: number;
  errorMessage: string | null;
  /** Serialized `DownloadPauseState` from expo-file-system, captured on an intentional pause. */
  resumeState: string | null;
}

interface DownloadTaskRow {
  id: string;
  content_type: DownloadContentType;
  provider_item_id: string;
  provider_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  container_extension: string;
  local_uri: string | null;
  status: DownloadStatus;
  bytes_downloaded: number;
  bytes_total: number | null;
  series_id: string | null;
  season_number: number | null;
  episode_number: number | null;
  created_at: number;
  updated_at: number;
  error_message: string | null;
  resume_state: string | null;
}

function fromRow(row: DownloadTaskRow): DownloadTask {
  return {
    id: row.id,
    contentType: row.content_type,
    providerItemId: row.provider_item_id,
    providerId: row.provider_id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    containerExtension: row.container_extension,
    localUri: row.local_uri,
    status: row.status,
    bytesDownloaded: row.bytes_downloaded,
    bytesTotal: row.bytes_total,
    seriesId: row.series_id,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
    resumeState: row.resume_state,
  };
}

export async function insertDownloadTask(
  task: Omit<DownloadTask, "createdAt" | "updatedAt" | "bytesDownloaded" | "localUri" | "errorMessage" | "resumeState">
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO download_tasks
      (id, content_type, provider_item_id, provider_id, title, subtitle, image_url, container_extension,
       source_url, local_uri, status, bytes_downloaded, bytes_total, series_id, season_number, episode_number,
       created_at, updated_at, error_message, resume_state)
     VALUES
      ($id, $contentType, $providerItemId, $providerId, $title, $subtitle, $imageUrl, $containerExtension,
       '', NULL, $status, 0, $bytesTotal, $seriesId, $seasonNumber, $episodeNumber,
       $createdAt, $updatedAt, NULL, NULL);`,
    {
      $id: task.id,
      $contentType: task.contentType,
      $providerItemId: task.providerItemId,
      $providerId: task.providerId,
      $title: task.title,
      $subtitle: task.subtitle,
      $imageUrl: task.imageUrl,
      $containerExtension: task.containerExtension,
      $status: task.status,
      $bytesTotal: task.bytesTotal,
      $seriesId: task.seriesId,
      $seasonNumber: task.seasonNumber,
      $episodeNumber: task.episodeNumber,
      $createdAt: now,
      $updatedAt: now,
    }
  );
}

export async function updateDownloadProgress(
  id: string,
  bytesDownloaded: number,
  bytesTotal: number | null
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE download_tasks SET bytes_downloaded = $bytesDownloaded, bytes_total = $bytesTotal, updated_at = $now WHERE id = $id;",
    { $id: id, $bytesDownloaded: bytesDownloaded, $bytesTotal: bytesTotal, $now: Date.now() }
  );
}

export async function updateDownloadStatus(
  id: string,
  status: DownloadStatus,
  options: { localUri?: string | null; errorMessage?: string | null; resumeState?: string | null } = {}
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE download_tasks SET status = $status, updated_at = $now
     ${options.localUri !== undefined ? ", local_uri = $localUri" : ""}
     ${options.errorMessage !== undefined ? ", error_message = $errorMessage" : ""}
     ${options.resumeState !== undefined ? ", resume_state = $resumeState" : ""}
     WHERE id = $id;`,
    {
      $id: id,
      $status: status,
      $now: Date.now(),
      ...(options.localUri !== undefined ? { $localUri: options.localUri } : {}),
      ...(options.errorMessage !== undefined ? { $errorMessage: options.errorMessage } : {}),
      ...(options.resumeState !== undefined ? { $resumeState: options.resumeState } : {}),
    }
  );
}

export async function deleteDownloadTask(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM download_tasks WHERE id = $id;", { $id: id });
}

export async function getDownloadTask(id: string): Promise<DownloadTask | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DownloadTaskRow>("SELECT * FROM download_tasks WHERE id = $id;", { $id: id });
  return row ? fromRow(row) : null;
}

/**
 * "Is THIS item, on the provider connected right now, downloaded?"
 *
 * Scoped by provider, and that is the 2026-11-18 fix. `download_tasks` has
 * carried `provider_id` since migration 9, but this lookup matched on
 * `(content_type, provider_item_id)` alone — and a provider item id is a small
 * integer that every Xtream panel numbers from its own 1, so provider A's
 * completed movie 1182 answered provider B's question about B's own 1182,
 * which is a different film. B's detail screen drew the item as downloaded and
 * handed A's `local_uri` to the player: the viewer taps Play on B's film and
 * watches A's. Tapping Download instead was dead too — `startDownload` found
 * this row in `existing` and returned without a word. Episodes went the same
 * way through the same lookup.
 *
 * The same mistake migration 23 fixed for `watch_progress` and `library_items`
 * on 2026-11-17 — except that here no migration was needed and none is: this
 * table has had the column all along and simply never asked about it.
 *
 * A null scope matches no row, exactly as in watchProgressRepository: nothing
 * is connected, so there is no provider for this item to belong to, and an
 * empty answer is the safe direction. Migration 20's index still serves this
 * query — SQLite seeks on `(content_type, provider_item_id)` and tests
 * `provider_id` off the row it already fetched, so the extra clause costs
 * nothing (verified with EXPLAIN QUERY PLAN against sqlite3 3.50.6).
 */
export async function getDownloadByContent(
  contentType: DownloadContentType,
  providerItemId: string
): Promise<DownloadTask | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DownloadTaskRow>(
    "SELECT * FROM download_tasks WHERE provider_id = $providerId AND content_type = $contentType AND provider_item_id = $providerItemId;",
    { $providerId: dataScope(), $contentType: contentType, $providerItemId: providerItemId }
  );
  return row ? fromRow(row) : null;
}

/**
 * Every download row on the device, whichever provider it came from — and
 * deliberately NOT scoped, unlike `getDownloadByContent` above.
 *
 * A download is a file sitting in the device's own storage. Its megabytes are
 * spent whoever is connected, and the player takes it as a `localUri` and
 * never builds a stream URL for it, so it needs no line of its own to play
 * (the one thing it does still need is a session to navigate through — the
 * scope boundary written down in docs/DECISIONS.md §27). The honest answer to
 * "what have I downloaded" is therefore all of it. Scoping this would have
 * hidden provider A's finished films from the downloads screen the moment B
 * was connected, with the space still gone and nothing left in the app that
 * could delete them.
 *
 * The machinery depends on it too, and this is the stronger half of the
 * argument. downloadManager's `deleteAndCleanupFile` finds a row BY ID through
 * this function to delete its file before dropping the row: scoped, it would
 * find nothing for another provider's download, delete the row, and leave the
 * file on disk forever. `pumpQueue` would strand A's queued rows the moment B
 * connected, `parkQueuedDownloads` would leave them queued behind a transfer
 * that is not running, and a row carrying a `provider_id` that no longer
 * exists in `providers` — a provider the viewer deleted — would become
 * unreachable by every path at once.
 *
 * What makes the split safe is that nothing identifies content through this
 * function. It is read by id (the manager) or listed as rows (the downloads
 * screen, the Home shelf, the count on More), and "is B's 1182 downloaded" is
 * asked only of `getDownloadByContent`, which is scoped.
 */
export async function getAllDownloadTasks(): Promise<DownloadTask[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DownloadTaskRow>("SELECT * FROM download_tasks ORDER BY created_at DESC;");
  return rows.map(fromRow);
}

/** Any task still marked "downloading" when the app starts was interrupted mid-transfer (process kill, crash). */
export async function recoverInterruptedDownloads(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE download_tasks SET status = 'paused', updated_at = $now WHERE status = 'downloading';",
    { $now: Date.now() }
  );
}

/**
 * What the finished downloads cost in storage, for the Settings row.
 *
 * Unscoped for the reason `getAllDownloadTasks` gives at length: these are
 * bytes on this device, and they do not stop being spent because a different
 * provider happens to be connected. A figure a viewer reads before deciding
 * to free space has to be the whole of it.
 */
export async function getDownloadsSummary(): Promise<{ count: number; totalBytes: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number; total_bytes: number | null }>(
    "SELECT COUNT(*) as count, SUM(bytes_downloaded) as total_bytes FROM download_tasks WHERE status = 'completed';"
  );
  return { count: row?.count ?? 0, totalBytes: row?.total_bytes ?? 0 };
}
