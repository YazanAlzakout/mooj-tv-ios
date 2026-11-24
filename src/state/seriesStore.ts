import { DEMO_ART_PREFIX, DEMO_CONTENT, demoSeriesName } from "@/core/demo/demoMode";
import type { SeriesSummary } from "@/domain/series/types";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { getAllSeries } from "@/providers/xtream/seriesAdapter";

/**
 * The full series catalog (~6k entries on our test provider), fetched
 * lazily the first time the user opens Series — same reasoning as
 * vodStore.ts. Cleared automatically by activeSessionStore whenever the
 * active session changes or is cleared.
 */
let series: SeriesSummary[] | null = null;

export function getSeriesList(): SeriesSummary[] | null {
  /*
   * Store-listing capture only. `DEMO_CONTENT` is false on main, so this
   * branch is dead in every build that ships; see core/demo/demoMode.ts for
   * why it exists. It replaces every title and its poster so the app can be photographed
   * running on a catalogue that belongs to nobody.
   */
  if (DEMO_CONTENT && series) {
    return series.map((s, i) => ({
      ...s,
      name: demoSeriesName(s.providerItemId, i),
      posterUrl: DEMO_ART_PREFIX + s.providerItemId,
      rating: i % 4 === 0 ? 7 + (i % 30) / 10 : null,
      year: String(2024 + (i % 3)),
    }));
  }
  return series;
}

/** Seeds the store from the on-device catalog, so Series opens with no network call. */
export function setSeriesList(next: SeriesSummary[]): void {
  series = next;
}

export async function loadSeriesList(
  config: XtreamProviderConfig,
  options: { forceRefresh?: boolean } = {}
): Promise<SeriesSummary[]> {
  // Seeded from the device cache by session restore; this is the fallback
  // for a provider whose stored catalog had no series section.
  /*
   * `forceRefresh` is what pull-to-refresh passes. Without honouring it
   * this returned the cached list unconditionally, so the gesture spun
   * and resolved to the identical array without ever touching the
   * network — the refresh did nothing, every time.
   */
  if (series && !options.forceRefresh) return series;
  const fetched = await getAllSeries(config);
  series = fetched;
  return fetched;
}

export function clearSeriesList(): void {
  series = null;
}
