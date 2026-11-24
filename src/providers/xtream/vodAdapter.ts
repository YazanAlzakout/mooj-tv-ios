import { fetchJson } from "@/core/network/fetchJson";
import type { MovieDetails, MovieSummary } from "@/domain/vod/types";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { playerApiUrl } from "./playerApiUrl";

/**
 * Raw shapes verified 2026-09-01 against the real test provider
 * (category 31 "ARABIC VOD" and several `get_vod_info`
 * samples) — NOT assumed from generic Xtream documentation. That check
 * also confirmed this provider never populates `genre` or a release
 * date/year on any sampled movie, which is why MovieDetails has no such
 * fields — see docs/DECISIONS.md.
 */
interface RawVodCategory {
  category_id: string;
  category_name: string;
}

interface RawVodStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  rating?: string | number;
  category_id?: string;
  container_extension: string;
}

interface RawVodInfoDetail {
  cover_big?: string;
  movie_image?: string;
  plot?: string;
  cast?: string;
  director?: string;
  rating?: string | number;
  duration?: string;
}

interface RawVodInfoResponse {
  info?: RawVodInfoDetail;
  movie_data?: {
    stream_id: number;
    name: string;
    container_extension: string;
    category_id?: string;
  };
}

function parseRating(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function movieStreamUrl(
  config: XtreamProviderConfig,
  streamId: string,
  containerExtension: string
): string {
  return `${config.baseUrl}/movie/${config.username}/${config.password}/${streamId}.${containerExtension}`;
}

export async function getVodCategories(
  config: XtreamProviderConfig
): Promise<{ id: string; name: string }[]> {
  const categories = await fetchJson<RawVodCategory[]>(playerApiUrl(config, { action: "get_vod_categories" }));
  return categories.map((c) => ({ id: c.category_id, name: c.category_name }));
}

/** Fetches the full VOD catalog in one request (~20k entries on our test provider, ~6MB, ~2s). */
export async function getAllVodStreams(config: XtreamProviderConfig): Promise<MovieSummary[]> {
  const streams = await fetchJson<RawVodStream[]>(playerApiUrl(config, { action: "get_vod_streams" }));
  return streams.map((stream) => ({
    providerItemId: String(stream.stream_id),
    name: stream.name,
    posterUrl: stream.stream_icon || null,
    rating: parseRating(stream.rating),
    categoryId: stream.category_id ?? null,
    containerExtension: stream.container_extension,
  }));
}

export async function getVodDetails(config: XtreamProviderConfig, movieId: string): Promise<MovieDetails> {
  const response = await fetchJson<RawVodInfoResponse>(
    playerApiUrl(config, { action: "get_vod_info", vod_id: movieId })
  );
  const info = response.info ?? {};
  const movieData = response.movie_data;

  const containerExtension = movieData?.container_extension ?? "mp4";
  const name = movieData?.name ?? "";

  return {
    providerItemId: movieId,
    name,
    posterUrl: info.cover_big || info.movie_image || null,
    rating: parseRating(info.rating),
    categoryId: movieData?.category_id ?? null,
    containerExtension,
    plot: nonEmpty(info.plot),
    cast: nonEmpty(info.cast),
    director: nonEmpty(info.director),
    durationLabel: nonEmpty(info.duration),
    streamUrl: movieStreamUrl(config, movieId, containerExtension),
  };
}
