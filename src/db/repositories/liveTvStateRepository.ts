import { dataScope } from "@/db/dataScope";
import { getDatabase } from "@/db/client";

export interface LiveTvState {
  lastCategoryId: string | null;
  lastChannelId: string | null;
}

/**
 * Durable "remember last live category/channel" (master prompt §19) — one row
 * per provider since migration 24. `lastCategoryId` is read by
 * live-categories.tsx when the screen opens; `lastChannelId` is still only
 * written, kept for the resume feature it was added for.
 *
 * It used to be the single `id = 1` row migration 2 created, which meant the
 * category the viewer last opened on provider A was handed to provider B the
 * moment B was connected: the screen applies the stored id without checking
 * that it exists in the new lineup, so Live TV opened on an id matching none
 * of B's channels — an empty grid with no chip lit (2026-11-17). A miss now
 * returns nulls, and that screen's own fallback opens on the first real
 * category instead, which is what it was written to do.
 */
export async function getLiveTvState(): Promise<LiveTvState> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ last_category_id: string | null; last_channel_id: string | null }>(
    "SELECT last_category_id, last_channel_id FROM live_tv_state WHERE provider_id = $providerId;",
    { $providerId: dataScope() }
  );
  return {
    lastCategoryId: row?.last_category_id ?? null,
    lastChannelId: row?.last_channel_id ?? null,
  };
}

/**
 * An upsert, not the UPDATE this was.
 *
 * There is no row for a provider until the first time something is
 * remembered on it, so an UPDATE would match nothing and lose the write —
 * and the caller cannot tell, because a failed remember is deliberately
 * silent (`.catch(() => {})` at live-categories.tsx:462).
 *
 * `DO UPDATE` names one column on purpose. The two writers run
 * independently — a category is picked in the list, a channel is tuned in the
 * player — and an upsert that wrote both would blank the remembered channel
 * every time a category was tapped.
 */
export async function setLastCategoryId(categoryId: string | null): Promise<void> {
  const providerId = dataScope();
  /* Nothing is connected, so there is no provider for this row to belong to. */
  if (!providerId) return;
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO live_tv_state (provider_id, last_category_id)
       VALUES ($providerId, $categoryId)
     ON CONFLICT (provider_id) DO UPDATE SET last_category_id = excluded.last_category_id;`,
    { $providerId: providerId, $categoryId: categoryId }
  );
}

export async function setLastChannelId(channelId: string | null): Promise<void> {
  const providerId = dataScope();
  /* Nothing is connected, so there is no provider for this row to belong to. */
  if (!providerId) return;
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO live_tv_state (provider_id, last_channel_id)
       VALUES ($providerId, $channelId)
     ON CONFLICT (provider_id) DO UPDATE SET last_channel_id = excluded.last_channel_id;`,
    { $providerId: providerId, $channelId: channelId }
  );
}
