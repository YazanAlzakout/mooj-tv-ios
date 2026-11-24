import { DEMO_ART_PREFIX, DEMO_CONTENT, demoChannelName } from "@/core/demo/demoMode";
import type { LiveChannel, Provider, XtreamProviderConfig } from "@/domain/provider/types";
import type { XtreamAccountInfo } from "@/providers/xtream/xtreamAdapter";
import { resetSearchIndex } from "@/state/searchIndexStore";
import { clearSeriesList } from "@/state/seriesStore";
import { clearVodMovies } from "@/state/vodStore";
import { clearActiveProvider } from "@/db/repositories/providerRepository";
import { clearEpg } from "@/db/repositories/epgRepository";
/*
 * This is a cycle — epgCache.ts imports `providerHasEpg` from this file — and
 * it is deliberate rather than overlooked. Nothing is called at module scope
 * on either side: both imports are plain function references read at call
 * time, long after Metro has finished evaluating both modules. Breaking it
 * would mean a third module holding the two maps, which is a file for one
 * `Map.clear()`. The alternative — clearing the tables and not the maps — is
 * the bug this import fixes.
 */
import { clearEpgCache } from "@/state/epgCache";
import { setDataScope } from "@/db/dataScope";

/**
 * The currently-active provider's resolved config + last-fetched channel
 * list, in memory only. The durable state is the `providers` SQLite table
 * (src/db) plus SecureStore credentials — this is just a runtime cache so
 * screens don't each re-authenticate and re-fetch independently.
 */
interface ActiveSession {
  provider: Provider;
  config: XtreamProviderConfig;
  channels: LiveChannel[];
  /** From the login response — master prompt §17/§28 account/subscription display. */
  accountInfo: XtreamAccountInfo | null;
}

let session: ActiveSession | null = null;

export function setActiveSession(next: ActiveSession): void {
  /* The per-provider tables follow the session. See src/db/dataScope.ts. */
  setDataScope(next.provider.id);
  /**
   * Only an actual provider switch invalidates the previously-cached
   * VOD/series catalogs and the search index built from them — never let
   * one provider's content leak into another's session.
   *
   * This used to run unconditionally on every call, which made this
   * function unsafe to use for "same provider, updated field" writes.
   * `refreshActiveSessionChannels` (manual pull-to-refresh on the live
   * channel list) and the background catalog refresh both do exactly
   * that — rebuild the same session with a fresher `channels` array — and
   * neither repopulates Movies/Series afterward, since neither touched
   * them. The result (confirmed 2026-09-03): pulling to refresh Live TV
   * silently emptied the Home screen's Movies/Series counts until the
   * user happened to reopen those sections. Comparing provider ids here
   * is what makes the wipe fire only on a genuine switch.
   */
  const isProviderChange = session !== null && session.provider.id !== next.provider.id;
  const isProviderSwitch = session === null || isProviderChange;
  if (isProviderSwitch) {
    clearVodMovies();
    clearSeriesList();
    resetSearchIndex();
  }
  /*
   * The guide is the one piece of per-provider data that carries no provider
   * id, so a change of provider empties it instead of scoping it.
   *
   * `epg_programmes` and `epg_fetch_log` are keyed by channel id alone, and a
   * channel id is another small integer the panel chose — provider B has a
   * channel "412" as well, and it is a different channel. Without this, B's
   * rows showed A's programme titles until the six-hour STORED_TTL_MS in
   * src/state/epgCache.ts ran out. Found 2026-11-17, beside the
   * hidden-categories bug migration 24 fixes; `clearEpg()` has been exported
   * since the table was written and had no caller anywhere in src/.
   *
   * Emptied rather than given a column, which is what 24 does for the other
   * two tables: a guide is a cache with a six-hour life, and re-earning it
   * costs one lazy request per channel the viewer actually opens — cheaper
   * than a column on two tables and a rewrite of every query that reads them.
   *
   * The test is deliberately stricter than `isProviderSwitch` above, which is
   * also true at every cold start, when `session` is null only because the
   * process just began. Wiping the stored guide on every launch would spend
   * this panel's small request budget re-fetching what was already on the
   * device, on a line that bans for asking too often. So this fires only when
   * one provider replaces another inside a running app.
   *
   * 2026-11-18, the second half of the same bug: the tables were emptied and
   * the in-memory map in src/state/epgCache.ts was not, so for the five
   * minutes of its CACHE_TTL_MS the switch changed nothing a viewer could
   * see — `useEpgNowNext` found B's channel "412" already answered and never
   * reached the tables at all. `clearEpgCache()` empties the map and the
   * in-flight requests, synchronously, which also covers the tick or two in
   * which `clearEpg()`'s fire-and-forget promise has not landed yet. The two
   * belong together everywhere: neither is sufficient alone.
   *
   * Together with the one-time clear in migration 24, the clear in
   * `clearActiveSession` below, and the one in add-provider.tsx's edit branch
   * (same provider id, new panel — which is a change of provider that this
   * function's id comparison cannot see), that covers every way the active
   * provider can change.
   */
  if (isProviderChange) {
    clearEpg().catch(() => {});
    clearEpgCache();
  }
  session = next;
}

export function getActiveSession(): ActiveSession | null {
  /*
   * Store-listing capture only; dead in every shipping build. Every
   * channel gets an invented name, generated artwork and one of ten
   * invented categories, so the app can be photographed running on a
   * lineup that belongs to nobody. See core/demo/demoMode.ts.
   *
   * Applied here rather than at the fetch, because this is what every
   * screen reads: the grid, the player, the search index and the category
   * rail all come through this one accessor, so one branch covers them.
   */
  if (DEMO_CONTENT && session) {
    return {
      ...session,
      provider: { ...session.provider, name: "My Provider" },
      channels: session.channels.map((c, i) => ({
        ...c,
        name: demoChannelName(c.providerItemId, i),
        /*
         * `categoryId` is deliberately left alone. The category rail is
         * built from the ids actually present on the channels, so moving
         * them would empty every category but "All". The names are
         * replaced where the categories themselves are read — see
         * state/categoryQueries.ts.
         */
        logoUrl: DEMO_ART_PREFIX + c.providerItemId,
      })),
    };
  }
  return session;
}

/**
 * Whether this provider carries any guide data at all.
 *
 * Panels that supply none return `epg_channel_id: null` for every channel
 * and an empty `epg_listings` for every `get_short_epg` call — the test
 * provider does exactly that for all 11,356 of its channels. Asking anyway
 * would be one wasted request per channel opened, on a panel that blocks a
 * line for asking too often, in exchange for nothing to display.
 */
export function providerHasEpg(): boolean {
  if (!session) return false;
  return session.channels.some((channel) => channel.epgChannelId !== null);
}

export function clearActiveSession(): void {
  setDataScope(null);
  clearVodMovies();
  clearSeriesList();
  resetSearchIndex();
  /*
   * Disconnecting ends the stored guide's claim on a provider, for the reason
   * `setActiveSession` spells out above: its rows name a channel by an id the
   * panel chose, and the next account connected will have ids of its own that
   * collide. Reconnecting the same line pays for a re-fetch, which is the
   * right price for a deliberate, rare action — and it is what closes the
   * disconnect-then-connect-someone-else path, where `setActiveSession` sees a
   * null session and cannot tell a switch from a launch.
   *
   * 2026-11-18: a failed launch restore is that same path, and it was open.
   * src/app/index.tsx caught the rejection and went to /providers without
   * clearing anything, so `session` stayed null while `providers.is_active`
   * was still the old provider's — the commonest reason to switch lines is
   * the old one expiring, which is exactly a rejected login. Connecting
   * someone else from there found a null session, so `isProviderChange` was
   * false and nothing was cleared. That catch now calls this function, which
   * is the state the app is in anyway.
   *
   * The map goes with the tables, for the reason `setActiveSession` records
   * above: on its own, emptying the tables is invisible for five minutes.
   */
  clearEpg().catch(() => {});
  clearEpgCache();
  session = null;
}

/**
 * Everything disconnecting has to do, in the order it has to happen.
 *
 * It lives here rather than in a screen because it was in two screens and they
 * had drifted: Settings dismissed the stack and replaced with /providers, Home
 * only replaced — and neither cleared the active provider, so the launch path
 * reconnected. Home's round trip was instant and looked like a dead button.
 *
 * The caller still does the navigating. This function owns what "disconnected"
 * means to the rest of the app, and that is a state, not a screen.
 */
export async function disconnectProvider(): Promise<void> {
  await clearActiveProvider();
  clearActiveSession();
}
