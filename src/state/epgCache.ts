import { useEffect, useState, useSyncExternalStore } from "react";

import type { EpgProgram } from "@/domain/epg/types";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { lastFetchedAt, readProgrammes, writeProgrammes } from "@/db/repositories/epgRepository";
import { getShortEpg } from "@/providers/xtream/epgAdapter";
import { providerHasEpg } from "@/state/activeSessionStore";

/** How long an in-memory answer is reused before consulting the device copy. */
const CACHE_TTL_MS = 5 * 60 * 1000;
/**
 * How long the device copy stands before the provider is asked again. Long
 * on purpose: a guide is a nicety, and this app must not spend a panel's
 * small request budget refreshing one.
 */
const STORED_TTL_MS = 6 * 60 * 60 * 1000;
/** How often "now" ticks for every now/next computation and progress bar. */
const CLOCK_TICK_MS = 60 * 1000;
/**
 * How long a channel row must stay on screen before its EPG is worth
 * fetching. Generous on purpose: this panel's request budget is small
 * enough that nine sequential calls tripped it, so EPG — which is a nicety,
 * not something playback depends on — must never compete with the calls
 * that actually matter.
 */
const SETTLE_MS = 900;

interface CacheEntry {
  programs: EpgProgram[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<EpgProgram[]>>();

/**
 * Which provider generation the two maps above belong to.
 *
 * Bumped by `clearEpgCache`. A `get_short_epg` already in the air when the
 * provider changes still settles afterwards, and its `cache.set` would put
 * the old account's programmes straight back into a map that had just been
 * emptied — the request takes as long as the panel takes, and a provider
 * switch is an authenticate plus a catalogue read, so the two overlap easily.
 * Every write below is therefore made only if the generation it started in is
 * still current. A late answer is dropped instead, which leaves the row
 * showing no guide: the fallback this file already chose for a failed fetch
 * (see the `catch` in `fetchAndCache`), and the only safe direction when the
 * alternative is one account's titles over another's stream.
 */
let generation = 0;

/**
 * Forget every guide answer held in memory. Counterpart to `clearEpg()` in
 * src/db/repositories/epgRepository.ts, which empties the two SQLite tables.
 *
 * 2026-11-18: clearing only the tables left the leak they were cleared for
 * wide open for CACHE_TTL_MS. Both maps are keyed by channel id *alone*, and a
 * channel id is a small integer the panel chose — every Xtream panel numbers
 * from 1, which is the whole premise of the scoping work in migration 24. So
 * after a switch, provider B's channel "412" found provider A's entry still
 * fresh, `useEpgNowNext` returned without fetching, and the player header
 * printed A's programme title and progress bar over B's stream. Phone and
 * television alike.
 *
 * Synchronous on purpose, and that matters: `clearEpg()` is a fire-and-forget
 * promise, so for a tick or two after a switch the tables are still the old
 * provider's. Emptying the maps in the same turn as the switch means nothing
 * can read a stale answer in that gap either.
 */
export function clearEpgCache(): void {
  cache.clear();
  inFlight.clear();
  generation += 1;
}

// A single shared, externally-ticking clock — reading `Date.now()` directly
// during render is disallowed (components must be pure), so every consumer
// subscribes to this instead of running its own setInterval.
let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockInterval: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockInterval) {
    clockInterval = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((l) => l());
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  };
}

function getClockSnapshot(): number {
  return clockNow;
}

/** Shared clock tick (updates every CLOCK_TICK_MS) — for progress bars etc. that need "now" without calling Date.now() during render. */
export function useNowTick(): number {
  return useSyncExternalStore(subscribeClock, getClockSnapshot, getClockSnapshot);
}

function isFresh(entry: CacheEntry, now: number): boolean {
  return now - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Device first, provider only if necessary.
 *
 * The stored copy is authoritative for STORED_TTL_MS — including a stored
 * *empty* result, which is why `lastFetchedAt` is consulted separately: a
 * channel the provider has nothing for must not be re-asked on every
 * visit, and "no rows" alone cannot tell "never asked" from "asked, has
 * nothing".
 */
function fetchAndCache(config: XtreamProviderConfig, channelId: string): Promise<EpgProgram[]> {
  const existing = inFlight.get(channelId);
  if (existing) return existing;

  /*
   * Which provider this answer is about. Compared against `generation` at
   * every write below, because all of them happen after an await and the
   * provider can have changed in between. See the note on `generation`.
   */
  const startedIn = generation;

  const promise = (async () => {
    const now = Date.now();
    try {
      const askedAt = await lastFetchedAt(channelId);
      if (askedAt !== null && now - askedAt < STORED_TTL_MS) {
        const stored = await readProgrammes(channelId, now - 60 * 60 * 1000);
        if (startedIn === generation) cache.set(channelId, { programs: stored, fetchedAt: now });
        return stored;
      }
    } catch {
      // A storage problem must not stop the network path below.
    }

    try {
      const programs = await getShortEpg(config, channelId);
      /*
       * The table write is inside the guard as well, and it is the more
       * important of the two: a row written after the switch belongs to
       * nobody and would be read back as the new provider's guide for the
       * whole six hours of STORED_TTL_MS, long after the map was emptied.
       */
      if (startedIn === generation) {
        cache.set(channelId, { programs, fetchedAt: Date.now() });
        await writeProgrammes(channelId, programs).catch(() => {});
      }
      return programs;
    } catch {
      // Never surface EPG failures to the user — "no data" (master prompt
      // §20) is the correct fallback, not an error banner on the channel list.
      if (startedIn === generation) cache.set(channelId, { programs: [], fetchedAt: Date.now() });
      return [] as EpgProgram[];
    }
  })().finally(() => {
    /*
     * Ours only. After a `clearEpgCache` the map was emptied wholesale, so
     * there is nothing of this request's left to remove — and anything now
     * under this key is a request the *new* provider started, which deleting
     * would cost the next asker a duplicate `get_short_epg` on a line that
     * blocks for asking too often.
     */
    if (startedIn === generation) inFlight.delete(channelId);
  });

  inFlight.set(channelId, promise);
  return promise;
}

export interface EpgNowNext {
  now: EpgProgram | null;
  next: EpgProgram | null;
  loading: boolean;
}

const EMPTY: EpgNowNext = { now: null, next: null, loading: false };

/**
 * Now/next EPG for one channel. Cached and de-duplicated across every
 * component asking for the same channel id, so a channel row and the
 * player screen never trigger two in-flight requests for the same channel.
 * Relies on the caller only mounting this for channels that are actually
 * on/near screen (e.g. FlatList's own virtualization) — never call this
 * for an entire unbounded channel list at once.
 */
export function useEpgNowNext(
  config: XtreamProviderConfig | null,
  channelId: string | null
): EpgNowNext {
  const [, forceRender] = useState(0);
  const now = useNowTick();

  useEffect(() => {
    // A provider that carries no guide at all is never asked — see
    // `providerHasEpg`. On such a provider this hook makes zero requests
    // for the whole session instead of one per channel opened.
    if (!config || !channelId || !providerHasEpg()) return;
    const existing = cache.get(channelId);
    if (existing && isFresh(existing, Date.now())) return;

    let cancelled = false;
    /*
      Deliberately delayed, not immediate. A FlatList mounts and unmounts
      rows continuously while scrolling, so firing on mount meant a channel
      the user never even saw still cost one `get_short_epg` request — and
      a fast scroll through a large lineup produced hundreds of them in a
      few seconds, which the provider's Cloudflare front end answered by
      refusing every subsequent request from that address (see
      core/network/requestQueue.ts). Waiting SETTLE_MS means only rows the
      user actually stops on ever ask for EPG; rows scrolled past are
      cancelled before they cost anything.
    */
    const timer = setTimeout(() => {
      fetchAndCache(config, channelId).then(() => {
        if (!cancelled) forceRender((n) => n + 1);
      });
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config, channelId]);

  if (!channelId || !providerHasEpg()) return EMPTY;

  const entry = cache.get(channelId);
  if (!entry) return { now: null, next: null, loading: true };

  const nowProgram = entry.programs.find((p) => p.startTimestamp <= now && now < p.stopTimestamp) ?? null;
  const nextProgram =
    entry.programs.find((p) => p.startTimestamp > (nowProgram?.stopTimestamp ?? now)) ?? null;

  return { now: nowProgram, next: nextProgram, loading: false };
}
