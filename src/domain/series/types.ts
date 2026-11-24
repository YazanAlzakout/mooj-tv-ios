/**
 * Only ever populated from real provider data (master prompt §21/§22:
 * "Do not fabricate ratings/metadata") — `null` means the provider
 * genuinely didn't supply that field.
 */
export interface SeriesSummary {
  providerItemId: string;
  name: string;
  posterUrl: string | null;
  rating: number | null;
  /** Just the year portion of the provider's release date, when present. */
  year: string | null;
  genre: string | null;
  categoryId: string | null;
}

export interface SeriesEpisode {
  providerItemId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  thumbnailUrl: string | null;
  plot: string | null;
  durationLabel: string | null;
  containerExtension: string;
}

export interface SeriesSeason {
  seasonNumber: number;
  name: string;
  overview: string | null;
  coverUrl: string | null;
  episodes: SeriesEpisode[];
}

export interface SeriesDetails extends SeriesSummary {
  plot: string | null;
  cast: string | null;
  director: string | null;
  backdropUrl: string | null;
  seasons: SeriesSeason[];
}
