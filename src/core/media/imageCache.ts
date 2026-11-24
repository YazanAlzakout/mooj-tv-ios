import { Directory, File, Paths } from "expo-file-system";

/**
 * Permanent on-disk cache for channel logos and movie/series posters.
 *
 * Artwork is the single biggest repeated cost in this app: a provider
 * lineup has thousands of logos, and re-fetching them on every scroll of
 * every session is both slow on mobile data and pointless — a channel logo
 * essentially never changes. A file downloaded here is reused for the life
 * of the install.
 *
 * Stored under `document`, not `cache`: the system may evict the cache
 * directory whenever storage runs low, which would silently undo the whole
 * point of the warm-up the user waits through on first launch.
 */
const DIRECTORY_NAME = "image-cache";

/**
 * Resolved URLs from this session. A module-level map so a component can
 * read an already-known local path during render without touching the file
 * system, which keeps the first paint free of a placeholder flash.
 */
const resolved = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Filenames already on disk, read once (see `primeCacheIndex`).
 *
 * This exists because the scroll path used to ask the filesystem about
 * every single poster: `directory()` re-created a `Directory` and checked
 * `exists` on every call, then the file's own `exists` was checked too —
 * all synchronous JSI calls, on the same thread that draws the screen,
 * dozens of times a second while a grid recycles cells. One directory
 * listing at startup replaces all of it with a Set lookup.
 */
const onDisk = new Set<string>();
let indexPrimed = false;

let cachedDirectory: Directory | null = null;
/** The directory's URI as a plain string, so a local path can be built during render. */
let cachedDirectoryUri = "";

function directory(): Directory {
  if (cachedDirectory) return cachedDirectory;
  const dir = new Directory(Paths.document, DIRECTORY_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  cachedDirectory = dir;
  cachedDirectoryUri = dir.uri.endsWith("/") ? dir.uri : `${dir.uri}/`;
  return dir;
}

/**
 * Reads the cache directory once so later lookups never touch the disk.
 * Safe to call repeatedly; only the first call does any work. Failure is
 * not fatal — an empty index just means the first sighting of each image
 * checks the file itself, exactly as it did before.
 */
export function primeCacheIndex(): void {
  if (indexPrimed) return;
  indexPrimed = true;
  try {
    for (const entry of directory().list()) {
      if (entry instanceof File) onDisk.add(entry.name);
    }
  } catch {
    // Nothing to prime from — treated as a cold cache.
  }
}

/**
 * FNV-1a over the URL. Not for security — just a short, stable, filesystem-safe
 * name, since provider artwork URLs contain characters (query strings, colons,
 * non-ASCII) that cannot go in a filename.
 */
function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

function extensionOf(url: string): string {
  const withoutQuery = url.split("?")[0];
  const match = /\.(png|jpe?g|webp|gif|bmp)$/i.exec(withoutQuery);
  return match ? match[0].toLowerCase() : ".img";
}

function fileNameFor(url: string): string {
  return `${hash(url)}${extensionOf(url)}`;
}

function fileFor(url: string): File {
  return new File(directory(), fileNameFor(url));
}

/**
 * The local path for `url` if it is already on disk, else `null`.
 *
 * Pure with respect to React — a map lookup, a Set lookup and string
 * concatenation, never the filesystem — so it is safe to call while
 * rendering. Answering from the primed index rather than only from this
 * session's resolved map is what stops a poster the device *already has*
 * from being requested over the network on its first appearance and then
 * swapped for the local copy a render later.
 */
export function knownLocalUri(url: string): string | null {
  const already = resolved.get(url);
  if (already) return already;

  if (!indexPrimed) return null;
  const name = fileNameFor(url);
  if (!onDisk.has(name)) return null;
  return `${cachedDirectoryUri}${name}`;
}

/**
 * Returns a local file URI for `url`, downloading it once if needed.
 * Resolves to `null` when the image cannot be fetched — callers fall back
 * to the remote URL or a placeholder rather than showing an error.
 */
export function cacheImage(url: string): Promise<string | null> {
  const already = resolved.get(url);
  if (already) return Promise.resolve(already);

  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const file = fileFor(url);
      // The index answers this without a filesystem round-trip once primed;
      // `file.exists` is only consulted when it has not been.
      if (indexPrimed ? onDisk.has(file.name) : file.exists) {
        resolved.set(url, file.uri);
        return file.uri;
      }
      const downloaded = await File.downloadFileAsync(url, file);
      onDisk.add(file.name);
      resolved.set(url, downloaded.uri);
      return downloaded.uri;
    } catch {
      // Broken artwork URLs are extremely common in provider catalogs and
      // are not worth surfacing — the caller shows its own fallback.
      return null;
    } finally {
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, promise);
  return promise;
}

/**
 * Downloads many images with bounded concurrency. Deliberately modest:
 * artwork usually comes from the provider's own host, and this app must
 * never flood a provider (see core/network/requestQueue.ts). `onProgress`
 * fires after each item so a warm-up screen can show real progress, and
 * `shouldStop` lets a caller abandon a background pass when the session
 * ends.
 */
export async function warmImageCache(
  urls: readonly string[],
  options: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    shouldStop?: () => boolean;
  } = {}
): Promise<void> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const total = unique.length;
  if (total === 0) {
    options.onProgress?.(0, 0);
    return;
  }

  const concurrency = Math.max(1, options.concurrency ?? 4);
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (cursor < total) {
      if (options.shouldStop?.()) return;
      const url = unique[cursor];
      cursor += 1;
      await cacheImage(url);
      done += 1;
      options.onProgress?.(done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
}

/** Bytes currently held by the artwork cache, for the storage screen. */
export function imageCacheSize(): number {
  try {
    return directory().size ?? 0;
  } catch {
    return 0;
  }
}

export function clearImageCache(): void {
  try {
    const dir = directory();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing actionable — the cache rebuilds itself on next use.
  }
  resolved.clear();
  inFlight.clear();
  onDisk.clear();
  cachedDirectory = null;
  /*
    **Still primed, because the index is now accurate — it is empty.**

    Clearing this flag read as "re-read the directory next time" and meant
    the opposite: `primeCacheIndex` is called once per process, from the
    root on mount, so nothing ever set it back. For the rest of the session
    `knownLocalUri` returned null for every URL and the render path could
    never hand a local file to the image loader again — the first-launch
    warm-up the viewer waited through was not just deleted but unreachable,
    with no path back short of restarting the app.

    The three maps above have just been emptied in the same breath, so what
    this flag promises — that the in-memory index matches the directory —
    is true, not false.
  */
  indexPrimed = true;
}
