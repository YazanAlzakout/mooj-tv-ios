import { DEMO_ART_PREFIX, DEMO_CONTENT, demoMovieName } from "@/core/demo/demoMode";
import type { MovieSummary } from "@/domain/vod/types";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { getAllVodStreams } from "@/providers/xtream/vodAdapter";

/**
 * The full VOD catalog (~20k entries on our test provider), fetched lazily
 * the first time the user opens Movies rather than eagerly at login —
 * unlike live channels, prefetching this on every session restore would
 * roughly double startup payload for a section the user may never open.
 * Cleared automatically by activeSessionStore whenever the active session
 * changes or is cleared — there is no cross-session persistence for this,
 * deliberately.
 */
// Invalidates delayed requests when the account or catalog changes.
let revision = 0;
let movies: MovieSummary[] | null = null;

export function getVodMovies(): MovieSummary[] | null {
  /*
   * Store-listing capture only. `DEMO_CONTENT` is false on main, so this
   * branch is dead in every build that ships; see core/demo/demoMode.ts for
   * why it exists. It replaces every title and its poster so the app can be photographed
   * running on a catalogue that belongs to nobody.
   */
  if (DEMO_CONTENT && movies) {
    return movies.map((m, i) => ({
      ...m,
      name: demoMovieName(m.providerItemId, i),
      posterUrl: DEMO_ART_PREFIX + m.providerItemId,
      rating: i % 3 === 0 ? 8 + (i % 20) / 10 : null,
    }));
  }
  return movies;
}

/** Seeds the store from the on-device catalog, so Movies opens with no network call. */
export function setVodMovies(next: MovieSummary[]): void {
  revision++;
  movies = next;
}

export async function loadVodMovies(
  config: XtreamProviderConfig,
  options: { forceRefresh?: boolean } = {}
): Promise<MovieSummary[]> {
  // Session restore seeds this from the device cache, so this only runs for
  // a provider whose stored catalog had no VOD section (or after a clear).
  /*
   * `forceRefresh` is what pull-to-refresh passes. Without honouring it
   * this returned the cached list unconditionally, so the gesture spun
   * and resolved to the identical array without ever touching the
   * network — the refresh did nothing, every time.
   */
  if (movies && !options.forceRefresh) return movies;
  const requestRevision = ++revision;
  const fetched = await getAllVodStreams(config);
  if (requestRevision !== revision) throw new Error("Catalog request superseded");
  movies = fetched;
  return fetched;
}

export function clearVodMovies(): void {
  revision++;
  movies = null;
}
