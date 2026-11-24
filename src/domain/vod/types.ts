/**
 * Fields are only ever populated from real provider data (master prompt
 * §21: "Do not fabricate ratings/metadata") — `null` means the provider
 * genuinely didn't supply that field, not "unknown, show a placeholder".
 */
export interface MovieSummary {
  providerItemId: string;
  name: string;
  posterUrl: string | null;
  /** Out of 10, only when the provider reports a value greater than 0. */
  rating: number | null;
  categoryId: string | null;
  containerExtension: string;
}

export interface MovieDetails extends MovieSummary {
  plot: string | null;
  cast: string | null;
  director: string | null;
  /** Provider-formatted duration string (e.g. "01:52:40"), not re-derived. */
  durationLabel: string | null;
  streamUrl: string;
}
