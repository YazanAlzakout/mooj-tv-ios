import { fetchJson } from "@/core/network/fetchJson";
import type { SeriesDetails, SeriesEpisode, SeriesSeason, SeriesSummary } from "@/domain/series/types";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { playerApiUrl } from "./playerApiUrl";

/**
 * Raw shapes verified 2026-09-01 against the real test provider
 * (category 397 and several `get_series_info` samples).
 * Two real quirks found and handled defensively rather than assumed away:
 *
 * 1. `seasons[]` metadata can be an empty array even when `episodes` has
 *    real content for that season number (series_id 6403: `seasons: []`,
 *    `episodes: {"1": [...10 episodes...]}`). The season list is therefore
 *    always derived from the `episodes` object's own keys, using `seasons[]`
 *    only for the extra display metadata (name/overview/cover) when present.
 * 2. Season `cover`/`cover_big` sometimes is just the TMDB base path with no
 *    image id at all ("…/w600_and_h900_bestv2", no trailing filename) —
 *    would 404 as an image. Anything not matching a real image URL is
 *    treated as absent.
 */
interface RawSeriesCategory {
  category_id: string;
  category_name: string;
}

interface RawSeriesListItem {
  series_id: number;
  name: string;
  cover?: string;
  rating?: string | number;
  genre?: string;
  releaseDate?: string;
  category_id?: string;
}

interface RawSeriesInfoDetail {
  name?: string;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string | number;
  backdrop_path?: string[];
  category_id?: string;
}

interface RawSeason {
  season_number: number;
  name?: string;
  overview?: string;
  cover?: string;
  cover_big?: string;
}

interface RawEpisode {
  id: string | number;
  episode_num: number;
  title?: string;
  container_extension: string;
  info?: {
    movie_image?: string;
    plot?: string;
    duration?: string;
  };
}

interface RawSeriesInfoResponse {
  seasons?: RawSeason[];
  info?: RawSeriesInfoDetail;
  episodes?: Record<string, RawEpisode[]>;
}


function parseRating(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseYear(releaseDate: string | undefined): string | null {
  const match = releaseDate?.match(/^(\d{4})-/);
  return match ? match[1] : null;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Rejects season art URLs that are just a base path with no actual image filename. */
function validImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  return /\/[^/]+\.\w{2,5}(\?.*)?$/.test(url) ? url : null;
}

export function episodeStreamUrl(
  config: XtreamProviderConfig,
  episodeId: string,
  containerExtension: string
): string {
  return `${config.baseUrl}/series/${config.username}/${config.password}/${episodeId}.${containerExtension}`;
}

export async function getSeriesCategories(
  config: XtreamProviderConfig
): Promise<{ id: string; name: string }[]> {
  const categories = await fetchJson<RawSeriesCategory[]>(
    playerApiUrl(config, { action: "get_series_categories" })
  );
  return categories.map((c) => ({ id: c.category_id, name: c.category_name }));
}

/** Fetches the full series catalog in one request (~6k entries on our test provider, ~7MB, ~2s). */
export async function getAllSeries(config: XtreamProviderConfig): Promise<SeriesSummary[]> {
  const items = await fetchJson<RawSeriesListItem[]>(playerApiUrl(config, { action: "get_series" }));
  return items.map((item) => ({
    providerItemId: String(item.series_id),
    name: item.name,
    posterUrl: item.cover || null,
    rating: parseRating(item.rating),
    year: parseYear(item.releaseDate),
    genre: nonEmpty(item.genre),
    categoryId: item.category_id ?? null,
  }));
}

export async function getSeriesDetails(config: XtreamProviderConfig, seriesId: string): Promise<SeriesDetails> {
  const response = await fetchJson<RawSeriesInfoResponse>(
    playerApiUrl(config, { action: "get_series_info", series_id: seriesId })
  );
  const info = response.info ?? {};
  const episodesBySeasonKey = response.episodes ?? {};

  const seasonMetaByNumber = new Map<number, RawSeason>();
  for (const s of response.seasons ?? []) {
    if (Number.isFinite(s.season_number)) seasonMetaByNumber.set(s.season_number, s);
  }

  const seasonNumbers = new Set<number>(seasonMetaByNumber.keys());
  for (const key of Object.keys(episodesBySeasonKey)) {
    const n = Number(key);
    if (Number.isFinite(n)) seasonNumbers.add(n);
  }

  const seasons: SeriesSeason[] = Array.from(seasonNumbers)
    .sort((a, b) => a - b)
    .map((seasonNumber) => {
      const meta = seasonMetaByNumber.get(seasonNumber);
      const rawEpisodes = episodesBySeasonKey[String(seasonNumber)] ?? [];

      const episodes: SeriesEpisode[] = rawEpisodes
        .map((e) => ({
          providerItemId: String(e.id),
          seasonNumber,
          episodeNumber: e.episode_num,
          title: nonEmpty(e.title) ?? `Episode ${e.episode_num}`,
          thumbnailUrl: e.info?.movie_image || null,
          plot: nonEmpty(e.info?.plot),
          durationLabel: nonEmpty(e.info?.duration),
          containerExtension: e.container_extension,
        }))
        .sort((a, b) => a.episodeNumber - b.episodeNumber);

      return {
        seasonNumber,
        name: nonEmpty(meta?.name) ?? `Season ${seasonNumber}`,
        overview: nonEmpty(meta?.overview),
        coverUrl: validImageUrl(meta?.cover_big || meta?.cover),
        episodes,
      };
    });

  return {
    providerItemId: seriesId,
    name: info.name ?? "",
    posterUrl: info.cover || null,
    backdropUrl: info.backdrop_path?.[0] || null,
    rating: parseRating(info.rating),
    year: parseYear(info.releaseDate),
    genre: nonEmpty(info.genre),
    categoryId: info.category_id ?? null,
    plot: nonEmpty(info.plot),
    cast: nonEmpty(info.cast),
    director: nonEmpty(info.director),
    seasons,
  };
}
