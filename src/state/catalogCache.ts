import { warmImageCache } from "@/core/media/imageCache";
import {
  readCatalog,
  writeCatalog,
  type CatalogKind,
} from "@/db/repositories/catalogCacheRepository";
import type { LiveChannel, XtreamProviderConfig } from "@/domain/provider/types";
import type { SeriesSummary } from "@/domain/series/types";
import type { MovieSummary } from "@/domain/vod/types";
import { buildLiveStreamCandidates, getAllLiveChannels, getLiveCategories } from "@/providers/xtream/xtreamAdapter";
import { getAllVodStreams, getVodCategories } from "@/providers/xtream/vodAdapter";
import { getAllSeries, getSeriesCategories } from "@/providers/xtream/seriesAdapter";

export interface CategoryRow {
  id: string;
  name: string;
}

/**
 * A live channel as persisted: identical to `LiveChannel` minus the two
 * fields that embed the username and password. Credentials belong in
 * SecureStore only (master prompt §8/§30), so the URLs are rebuilt from
 * the active config every time the cache is read.
 */
type StoredChannel = Omit<LiveChannel, "streamUrl" | "streamUrlCandidates">;

function toStored(channel: LiveChannel): StoredChannel {
  const { streamUrl: _streamUrl, streamUrlCandidates: _candidates, ...rest } = channel;
  return rest;
}

function fromStored(stored: StoredChannel, config: XtreamProviderConfig): LiveChannel {
  const candidates = buildLiveStreamCandidates(config, stored.providerItemId, stored.containerExtension);
  return { ...stored, streamUrl: candidates[0], streamUrlCandidates: candidates };
}

export interface CachedCatalogSnapshot {
  channels: LiveChannel[];
  liveCategories: CategoryRow[];
  movies: MovieSummary[];
  movieCategories: CategoryRow[];
  series: SeriesSummary[];
  seriesCategories: CategoryRow[];
  /** When the oldest section in this snapshot was fetched. */
  fetchedAt: number;
}

/**
 * Everything previously downloaded for this provider, or `null` when nothing
 * has been stored for it yet.
 *
 * The test is whether the live section was ever WRITTEN, not whether it has
 * anything in it. Those are two different facts, and conflating them cost a
 * whole class of account its cache.
 *
 * `section()` in `preloadCatalog` writes a row whenever its fetch SUCCEEDS,
 * empty answers included — so a stored empty live section means "this
 * subscription genuinely carries no channels", which is a complete and correct
 * answer, while a missing row means "we never got that far". The old test,
 * `live.data.length === 0`, read the first as the second: an account with
 * films and series but no live channels could never hold a usable cache, no
 * matter how many times it downloaded one.
 *
 * Everything downstream hangs on this one return — see `restoreSession`:
 * launching with no network threw instead of opening from storage; a transient
 * failure at login was rethrown instead of falling back to the cache; and
 * `cachedBeforeAuth ?? preloadCatalog(...)` re-downloaded the entire catalogue,
 * seven steps behind the PreparingLibrary screen, on every single launch.
 *
 * Found 2026-11-18 on the account prepared for Google's review, which is
 * exactly this shape: zero live channels, one film, one series.
 *
 * The sections below live stay optional. A provider that returns films but no
 * series, or whose series call failed once, keeps a usable cache with that
 * section empty — it is the viewer's own catalogue either way, and an empty
 * rail beats re-downloading everything to discover that it is empty.
 */
export async function readCachedCatalog(
  providerId: string,
  config: XtreamProviderConfig
): Promise<CachedCatalogSnapshot | null> {
  const [live, liveCats, movies, movieCats, series, seriesCats] = await Promise.all([
    readCatalog<StoredChannel[]>(providerId, "live"),
    readCatalog<CategoryRow[]>(providerId, "live_categories"),
    readCatalog<MovieSummary[]>(providerId, "movies"),
    readCatalog<CategoryRow[]>(providerId, "movie_categories"),
    readCatalog<SeriesSummary[]>(providerId, "series"),
    readCatalog<CategoryRow[]>(providerId, "series_categories"),
  ]);

  if (!live) return null;

  return {
    channels: live.data.map((stored) => fromStored(stored, config)),
    liveCategories: liveCats?.data ?? [],
    movies: movies?.data ?? [],
    movieCategories: movieCats?.data ?? [],
    series: series?.data ?? [],
    seriesCategories: seriesCats?.data ?? [],
    fetchedAt: [live, liveCats, movies, movieCats, series, seriesCats].some(entry => entry === null) ? 0 : Math.min(
      ...[live, liveCats, movies, movieCats, series, seriesCats]
        .filter((entry) => entry !== null)
        .map((entry) => entry.fetchedAt)
    ),
  };
}

export type PreloadStep =
  | "liveCategories"
  | "liveChannels"
  | "movieCategories"
  | "movies"
  | "seriesCategories"
  | "series"
  | "artwork";

export interface PreloadProgress {
  step: PreloadStep;
  /** Steps finished out of the total, for the overall bar. */
  stepIndex: number;
  stepCount: number;
  /** Only meaningful during "artwork". */
  imagesDone: number;
  imagesTotal: number;
}

const STEPS: PreloadStep[] = [
  "liveCategories",
  "liveChannels",
  "movieCategories",
  "movies",
  "seriesCategories",
  "series",
  "artwork",
];

/**
 * How much artwork is downloaded while the user waits. A full lineup has
 * thousands of logos; fetching them all would take minutes and hammer the
 * provider's host. This covers what a user actually sees in the first
 * screens of each section — the rest keeps filling in during normal use,
 * one image at a time, and is then permanent too.
 */
const ARTWORK_BUDGET_PER_SECTION = 60;

/**
 * Downloads every catalog section once and stores it, reporting progress
 * so the caller can show a real preparation screen.
 *
 * Sections are fetched **sequentially**, never in parallel: this provider's
 * panel refuses further requests once its rate budget is spent, and the
 * shared request queue (core/network/requestQueue.ts) serialises them
 * anyway. Failed sections retain their last successful cache. A genuine
 * successful empty response still means the subscription has no such content.
 */
export async function preloadCatalog(
  providerId: string,
  config: XtreamProviderConfig,
  containerExtension: "m3u8" | "ts",
  onProgress: (progress: PreloadProgress) => void,
  shouldStop: () => boolean = () => false
): Promise<CachedCatalogSnapshot> {
  let oldestFetch = Date.now();

  function report(step: PreloadStep, imagesDone = 0, imagesTotal = 0) {
    onProgress({
      step,
      stepIndex: STEPS.indexOf(step),
      stepCount: STEPS.length,
      imagesDone,
      imagesTotal,
    });
  }

  /**
   * `toPayload` exists so a section can persist a different shape from the
   * one it returns — live channels are handed back complete but stored
   * without their credential-bearing URLs.
   */
  async function section<T>(
    step: PreloadStep,
    kind: CatalogKind,
    fetcher: () => Promise<T>,
    empty: T,
    toPayload: (data: T) => unknown = (data) => data,
    fromPayload: (data: unknown) => T = (data) => data as T
  ): Promise<T> {
    report(step);
    if (shouldStop()) return empty;
    let data: T;
    try {
      data = await fetcher();
    } catch {
      // A failed refresh is not evidence that a subscription is empty.
      const previous = await readCatalog<unknown>(providerId, kind).catch(() => null);
      oldestFetch = Math.min(oldestFetch, previous?.fetchedAt ?? 0);
      return previous ? fromPayload(previous.data) : empty;
    }
    if (shouldStop()) return empty;
    // Storage failure must not discard a successful network response.
    await writeCatalog(providerId, kind, toPayload(data)).catch(() => {});
    return data;
  }

  const liveCategories = await section<CategoryRow[]>(
    "liveCategories",
    "live_categories",
    () => getLiveCategories(config),
    []
  );

  const channels = await section<LiveChannel[]>(
    "liveChannels",
    "live",
    () => getAllLiveChannels(config, containerExtension),
    [],
    (list) => list.map(toStored),
    (data) => (data as StoredChannel[]).map(stored => fromStored(stored, config))
  );

  const movieCategories = await section<CategoryRow[]>(
    "movieCategories",
    "movie_categories",
    () => getVodCategories(config),
    []
  );
  const movies = await section<MovieSummary[]>("movies", "movies", () => getAllVodStreams(config), []);

  const seriesCategories = await section<CategoryRow[]>(
    "seriesCategories",
    "series_categories",
    () => getSeriesCategories(config),
    []
  );
  const series = await section<SeriesSummary[]>("series", "series", () => getAllSeries(config), []);

  const artwork = [
    ...channels.slice(0, ARTWORK_BUDGET_PER_SECTION).map((c) => c.logoUrl),
    ...movies.slice(0, ARTWORK_BUDGET_PER_SECTION).map((m) => m.posterUrl),
    ...series.slice(0, ARTWORK_BUDGET_PER_SECTION).map((s) => s.posterUrl),
  ].filter((url): url is string => Boolean(url));

  report("artwork", 0, artwork.length);
  // Artwork is optional: a slow image host must not block opening the app.
  void warmImageCache(artwork, {
    concurrency: 6,
    shouldStop,
  }).catch(() => {});

  return {
    channels,
    liveCategories,
    movies,
    movieCategories,
    series,
    seriesCategories,
    fetchedAt: oldestFetch,
  };
}

/*
 * There is deliberately no background pass that keeps downloading the rest
 * of the artwork after the preparation screen closes.
 *
 * There used to be, and it was the main cause of the stuttering scroll in
 * Movies and Series. A lineup here is ~11k logos, ~20k posters and ~6k
 * series posters — around 37,000 images — and the pass enqueued all of
 * them, stopping only if the user switched provider, which for a
 * single-provider session never happened. So for the entire life of the
 * session it downloaded and wrote files at three at a time, competing with
 * the list for the network, the disk and the JS thread.
 *
 * Artwork is cached on demand instead (see `CachedImage`): a poster is
 * fetched the first time it comes on screen and then kept forever, so the
 * user pays only for what they actually look at.
 */
