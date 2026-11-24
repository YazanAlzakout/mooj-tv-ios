import { artworkIsKnownBad } from "@/core/media/deadImageHosts";
import { getSeriesList } from "@/state/seriesStore";
import { getVodMovies } from "@/state/vodStore";

/**
 * What the home screen puts in a row.
 *
 * `posterUrl` is a plain string, not `string | null`, and that is the whole
 * contract: **nothing reaches a row without artwork.** The home screen is
 * the one place where every item is chosen rather than listed, so a card
 * that cannot show a picture has no business being one of the twelve the
 * viewer is offered. A browse grid is different — it has to show the whole
 * catalogue, blanks included, because the viewer went looking for it.
 */
export interface HomeItem {
  key: string;
  contentType: "movie" | "series";
  providerItemId: string;
  name: string;
  posterUrl: string;
  rating: number | null;
  year: string | null;
}

/**
 * Whether a URL is worth putting a card around.
 *
 * Two different kinds of missing. The provider may simply not have sent
 * one — most of the catalogue, on most providers. Or it sent one that has
 * already failed on this device, which `artworkIsKnownBad` remembers:
 * either the file 404s or its whole host is unreachable. Both produce the
 * same empty tile, so both are filtered here rather than discovered one
 * card at a time while the viewer watches.
 */
export function hasUsableArt(url: string | null | undefined): url is string {
  return typeof url === "string" && url.length > 0 && !artworkIsKnownBad(url);
}

/**
 * The year a title belongs to, as four characters.
 *
 * Series carry a release date and the adapter already reduces it to a year.
 * Films carry nothing: `get_vod_streams` returns a name, an icon, a rating
 * and a container extension, and that is all. But the providers this app
 * talks to put the year in the name — "الجواهرجى (2026)", "Training Day
 * 2001" — so that is where it has to come from.
 *
 * The **last** match wins, not the first. A title can contain a number that
 * looks like a year without being one ("2012" as a film title, a channel
 * numbered 1984), and where both appear the year is conventionally written
 * at the end.
 */
const YEAR_PATTERN = /(?:^|[^\d])((?:19|20)\d{2})(?!\d)/g;

export function yearOf(name: string, known: string | null): string | null {
  if (known) return known;
  let found: string | null = null;
  YEAR_PATTERN.lastIndex = 0;
  for (let m = YEAR_PATTERN.exec(name); m !== null; m = YEAR_PATTERN.exec(name)) {
    found = m[1];
  }
  return found;
}

/** The year the viewer is actually living in, which is what "new" has to mean. */
export function currentYear(): string {
  return String(new Date().getFullYear());
}

/**
 * Everything the home screen needs, from one pass over the catalogue.
 *
 * ## Why one pass, and why it is cached
 *
 * The catalogue on the real test account is about 26,000 titles. Walking it
 * is cheap — a regex over 26,000 short strings costs single-digit
 * milliseconds — but walking it *per row* would not be, and the home screen
 * is rebuilt every time the viewer returns to it. So each list is scanned
 * once, every row is filled from that scan, and the result is kept until
 * the catalogue itself changes.
 *
 * The cache key is the two array identities. The stores hand out the same
 * array until a refresh replaces it, so this is exact without hashing
 * anything: a refetch produces new arrays and the next call rebuilds.
 */
interface Scan {
  newThisYear: HomeItem[];
  withArt: HomeItem[];
  topRated: HomeItem[];
  movies: HomeItem[];
  series: HomeItem[];
}

let cacheKey: readonly [unknown, unknown] | null = null;
let cached: Scan | null = null;

/** Enough to fill the longest row several times over, and far short of the catalogue. */
const SCAN_LIMIT = 300;

function scan(): Scan {
  const movies = getVodMovies() ?? [];
  const series = getSeriesList() ?? [];

  if (cached && cacheKey && cacheKey[0] === movies && cacheKey[1] === series) return cached;

  const year = currentYear();
  const newThisYear: HomeItem[] = [];
  const withArt: HomeItem[] = [];
  const movieItems: HomeItem[] = [];
  const seriesItems: HomeItem[] = [];
  /*
   * Rated separately and sorted at the end rather than kept in order as we
   * go: inserting into a sorted array is quadratic, and the catalogue is
   * large enough for that to be felt. Capped before sorting for the same
   * reason — the top of a list of 300 is the top of the catalogue, and
   * nobody scrolls a recommendation row past twelve.
   */
  const rated: HomeItem[] = [];

  for (const m of movies) {
    if (!hasUsableArt(m.posterUrl)) continue;
    const item: HomeItem = {
      key: `movie-${m.providerItemId}`,
      contentType: "movie",
      providerItemId: m.providerItemId,
      name: m.name,
      posterUrl: m.posterUrl,
      rating: m.rating,
      year: yearOf(m.name, null),
    };
    if (item.year === year && newThisYear.length < SCAN_LIMIT) newThisYear.push(item);
    if (withArt.length < SCAN_LIMIT) withArt.push(item);
    if (movieItems.length < SCAN_LIMIT) movieItems.push(item);
    if (item.rating !== null && rated.length < SCAN_LIMIT) rated.push(item);
  }

  for (const s of series) {
    if (!hasUsableArt(s.posterUrl)) continue;
    const item: HomeItem = {
      key: `series-${s.providerItemId}`,
      contentType: "series",
      providerItemId: s.providerItemId,
      name: s.name,
      posterUrl: s.posterUrl,
      rating: s.rating,
      year: yearOf(s.name, s.year),
    };
    if (item.year === year && newThisYear.length < SCAN_LIMIT) newThisYear.push(item);
    if (withArt.length < SCAN_LIMIT) withArt.push(item);
    if (seriesItems.length < SCAN_LIMIT) seriesItems.push(item);
    if (item.rating !== null && rated.length < SCAN_LIMIT) rated.push(item);
  }

  rated.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  cacheKey = [movies, series];
  cached = {
    newThisYear,
    withArt,
    topRated: rated,
    movies: movieItems,
    series: seriesItems,
  };
  return cached;
}

/**
 * The titles released this year, which is what the viewer means by new.
 *
 * Not "recently added to the provider": the API does not say when anything
 * was added, and inventing an answer from list order would be a guess
 * dressed as a fact. What it can say, from the name, is what year a title
 * is from — and a 2026 film on a catalogue that mostly is not is the thing
 * worth putting at the top of a screen.
 */
export function newThisYear(limit: number): HomeItem[] {
  return pickSpread(scan().newThisYear, limit);
}

/** A changing selection across the catalogue, for the rows with no other rule. */
export function featured(limit: number): HomeItem[] {
  return pickSpread(scan().withArt, limit);
}

/**
 * The best-reviewed titles, in order, and **not** spread.
 *
 * Every other row here varies on purpose, so the screen is not the same
 * screen twice. This one must not: a row headed "top rated" whose contents
 * change between visits is not a ranking, it is a shuffle wearing a
 * ranking's name.
 */
export function topRated(limit: number): HomeItem[] {
  return scan().topRated.slice(0, limit);
}

/** Films only, for a viewer who already knows which of the two they want. */
export function moviesOnly(limit: number): HomeItem[] {
  return pickSpread(scan().movies, limit);
}

/** Series only, for the same reason. */
export function seriesOnly(limit: number): HomeItem[] {
  return pickSpread(scan().series, limit);
}

/**
 * `limit` items drawn from across the whole pool rather than off the front.
 *
 * Taking the first N would show the same titles every launch, and they
 * would all be whatever the provider happens to list first — usually one
 * category. Striding through the pool at an offset that moves each time
 * gives a different, evenly spread selection on every visit, without
 * building and shuffling a copy of the catalogue to do it.
 */
function pickSpread(pool: HomeItem[], limit: number): HomeItem[] {
  if (pool.length <= limit) return pool;
  const stride = Math.floor(pool.length / limit);
  const offset = Math.floor(Math.random() * stride);
  const out: HomeItem[] = [];
  for (let i = 0; i < limit; i++) out.push(pool[offset + i * stride]);
  return out;
}
