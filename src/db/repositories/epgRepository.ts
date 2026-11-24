import { getDatabase } from "@/db/client";
import type { EpgProgram } from "@/domain/epg/types";

/**
 * Guide data kept on the device.
 *
 * `get_short_epg` is one request per channel, and this app runs against a
 * panel that blocks a line for asking too often — so an answer, including
 * "this channel has nothing", must be remembered rather than asked for
 * again every time a row scrolls past. `epg_fetch_log` records the ask
 * itself, so an empty result is just as durable as a full one.
 */
export async function readProgrammes(channelId: string, fromMs: number): Promise<EpgProgram[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    start_ms: number;
    stop_ms: number;
    title: string;
    description: string;
  }>(
    "SELECT id, start_ms, stop_ms, title, description FROM epg_programmes WHERE channel_id = ? AND stop_ms >= ? ORDER BY start_ms ASC LIMIT 12;",
    [channelId, fromMs]
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    startTimestamp: row.start_ms,
    stopTimestamp: row.stop_ms,
  }));
}

export async function writeProgrammes(channelId: string, programmes: EpgProgram[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM epg_programmes WHERE channel_id = ?;", [channelId]);
    for (const programme of programmes) {
      await db.runAsync(
        "INSERT OR REPLACE INTO epg_programmes (channel_id, id, start_ms, stop_ms, title, description) VALUES (?, ?, ?, ?, ?, ?);",
        [
          channelId,
          programme.id,
          programme.startTimestamp,
          programme.stopTimestamp,
          programme.title,
          programme.description,
        ]
      );
    }
    await db.runAsync("INSERT OR REPLACE INTO epg_fetch_log (channel_id, fetched_at) VALUES (?, ?);", [
      channelId,
      Date.now(),
    ]);
  });
}

/** When this channel's guide was last requested, or null if it never was. */
export async function lastFetchedAt(channelId: string): Promise<number | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ fetched_at: number }>(
    "SELECT fetched_at FROM epg_fetch_log WHERE channel_id = ?;",
    [channelId]
  );
  return row?.fetched_at ?? null;
}

export async function clearEpg(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync("DELETE FROM epg_programmes; DELETE FROM epg_fetch_log;");
}
