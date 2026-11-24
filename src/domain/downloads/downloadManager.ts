import { Directory, DownloadTask, File, Paths, type DownloadPauseState } from "expo-file-system";
import { AppState } from "react-native";

import {
  deleteDownloadTask,
  getAllDownloadTasks,
  getDownloadByContent,
  insertDownloadTask,
  recoverInterruptedDownloads,
  updateDownloadProgress,
  updateDownloadStatus,
  type DownloadContentType,
  type DownloadTask as DownloadTaskRecord,
} from "@/db/repositories/downloadRepository";

import { clearDownloadProgress, setDownloadProgress } from "./downloadProgressStore";
import { resolveDownloadSourceUrl } from "./resolveSourceUrl";
import { isDownloadEligible } from "./eligibility";

export interface NewDownloadInput {
  id: string;
  contentType: DownloadContentType;
  providerItemId: string;
  providerId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  containerExtension: string;
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

const PROGRESS_WRITE_THROTTLE_MS = 1000;

/** Live native tasks, keyed by download id. Empty after an app restart — resumeState (if any) rebuilds them lazily. */
const activeTasks = new Map<string, DownloadTask>();
const lastProgressWriteAt = new Map<string, number>();

/**
 * How many transfers may run at once. One.
 *
 * This is a provider rule wearing a performance hat. The line carries
 * three connections for the whole household, a download holds one for as
 * long as it runs, and nothing here used to count them: tapping Download
 * on four episodes opened four transfers, and the fourth was over the
 * limit before the viewer had put the phone down. What the provider does
 * about that is refuse the next request, which the app then shows as a
 * playback failure somewhere else entirely.
 *
 * One rather than two, because the other two connections belong to
 * watching. A download is also no faster for being parallel — the same
 * pipe is divided — and four half-finished files are worth less than one
 * finished one.
 */
const MAX_ACTIVE_DOWNLOADS = 1;

/**
 * Transfers begun but not yet registered in `activeTasks`.
 *
 * `beginTransfer` awaits a credential lookup and a status write before it
 * has a task to register, and two Download taps on different titles can
 * both get through that window and both see a free slot. This counter is
 * incremented synchronously, before the first await, so the second one
 * sees the slot taken — the same trick `startInFlight` plays above, for
 * the same reason.
 */
let starting = 0;

/** Set while the app is backgrounded, so a finishing transfer does not start the next one. */
let transfersSuspended = false;

function hasFreeSlot(): boolean {
  return activeTasks.size + starting < MAX_ACTIVE_DOWNLOADS;
}

/**
 * Closes a real race: `getDownloadByContent()` below is an async DB read,
 * so two rapid taps on the same Download button (before the first read
 * resolves) could both see "not downloading yet" and both call
 * `insertDownloadTask` + start a native transfer — two rows, two tasks,
 * both writing the same destination file concurrently. This set is
 * checked synchronously before any await, so the second call always loses.
 */
const startInFlight = new Set<string>();

function contentKey(contentType: DownloadContentType, providerItemId: string): string {
  return `${contentType}:${providerItemId}`;
}

function downloadsDirectory(): Directory {
  const dir = new Directory(Paths.document, "downloads");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

/**
 * Where one download's bytes land.
 *
 * The provider id is in the name, and it has to be. The name used to be
 * `${contentType}_${providerItemId}`, which is not unique: every Xtream panel
 * numbers its catalogue from 1, so provider A's film 1182 and provider B's film
 * 1182 — two entirely different films — both resolved to `movie_1182.mp4`.
 *
 * That collision was unreachable until 2026-11-18, which is why it sat here
 * unnoticed. `getDownloadByContent` was unscoped, so asking "is B's 1182
 * downloaded?" returned A's completed row and B's Download button returned
 * early without ever starting a transfer. Scoping that query fixed the worse
 * half of the bug — B's film no longer plays A's file — and in doing so made
 * this half reachable for the first time: B can now genuinely download its own
 * 1182, straight over A's finished file, leaving A's completed row pointing at
 * B's film.
 *
 * Rows written before this change keep working. A completed download is played
 * from the `local_uri` stored on its row, and deletion reads that same column
 * (see `deleteAndCleanupFile`); nothing recomputes the path for a file that
 * already exists. The one casualty is a transfer that was paused or interrupted
 * when the app was updated and then has to restart from scratch: it restarts
 * into the new name and abandons its old partial file on disk. That is bounded
 * — partials only, only across this one upgrade — and the alternative is
 * keeping a naming scheme that can destroy a finished download.
 */
function destinationFile(
  item: Pick<NewDownloadInput, "contentType" | "providerItemId" | "providerId" | "containerExtension">
): File {
  const name = `${item.contentType}_${sanitizeSegment(item.providerId)}_${sanitizeSegment(item.providerItemId)}.${sanitizeSegment(item.containerExtension)}`;
  return new File(downloadsDirectory(), name);
}

function onProgress(id: string) {
  return (data: { bytesWritten: number; totalBytes: number }) => {
    const totalBytes = data.totalBytes >= 0 ? data.totalBytes : null;
    setDownloadProgress(id, data.bytesWritten, totalBytes);

    const now = Date.now();
    const last = lastProgressWriteAt.get(id) ?? 0;
    if (now - last >= PROGRESS_WRITE_THROTTLE_MS) {
      lastProgressWriteAt.set(id, now);
      updateDownloadProgress(id, data.bytesWritten, totalBytes).catch(() => {});
    }
  };
}

/**
 * Drives one transfer to its end.
 *
 * `starter` is not a convenience. `downloadAsync()` "can only be called
 * once, while the task is `idle`" and `DownloadTask.fromSavable()`
 * "returns a download task in the `paused` state" — both quoted from
 * expo-file-system's own NetworkTasks.d.ts. A restored task therefore
 * answers `resumeAsync()` and nothing else, and calling the wrong one
 * meant resuming a paused download failed every single time. Found by
 * review on 2026-11-08; it had never worked.
 */
async function runDownload(id: string, task: DownloadTask, starter: "start" | "resume"): Promise<void> {
  activeTasks.set(id, task);
  try {
    const file = starter === "resume" ? await task.resumeAsync() : await task.downloadAsync();
    if (file === null) {
      // Paused mid-transfer — pauseDownload() already persisted status/resumeState.
      return;
    }
    activeTasks.delete(id);
    clearDownloadProgress(id);
    await updateDownloadStatus(id, "completed", { localUri: file.uri });
  } catch (error) {
    activeTasks.delete(id);
    if (error instanceof Error && error.name === "AbortError") return; // cancelDownload() handles its own state.
    await updateDownloadStatus(id, "failed", {
      errorMessage: error instanceof Error ? error.message : "Download failed.",
    });
  } finally {
    /*
     * However this ended — finished, failed, cancelled or paused — the
     * slot is free now, so whatever is waiting gets it. In the `finally`
     * rather than on each path, because missing one of them is how a queue
     * quietly stops being a queue.
     */
    void pumpQueue();
  }
}

/** Guards re-entry: `beginTransfer` awaits, and a second pump inside that window reads the same row twice. */
let pumping = false;

/** Starts the next queued transfer, if there is a slot and something waiting for it. */
async function pumpQueue(): Promise<void> {
  if (pumping || transfersSuspended || !hasFreeSlot()) return;
  pumping = true;
  try {
    while (!transfersSuspended && hasFreeSlot()) {
      const records = await getAllDownloadTasks();
      /* Oldest first: the list arrives newest-first, and a queue is not a stack. */
      const next = records.filter((r) => r.status === "queued").pop();
      if (!next) return;
      await beginTransfer(next);
    }
  } finally {
    pumping = false;
  }
}

/**
 * Opens the transfer for one row, resuming it where there is resume data
 * and restarting it where there is not.
 *
 * `startDownload`, `resumeDownload` and the queue all end here — one
 * place that knows how to turn a row into a running task.
 */
async function beginTransfer(record: DownloadTaskRecord): Promise<void> {
  if (activeTasks.has(record.id)) return;
  starting += 1;
  try {
    const sourceUrl = await resolveDownloadSourceUrl(record);
    if (!sourceUrl) {
      await updateDownloadStatus(record.id, "failed", { errorMessage: "Provider credentials are unavailable." });
      return;
    }

    if (record.resumeState) {
      try {
        const saved = JSON.parse(record.resumeState) as Omit<DownloadPauseState, "url">;
        const state: DownloadPauseState = { ...saved, url: sourceUrl };
        const task = DownloadTask.fromSavable(state, { onProgress: onProgress(record.id) });
        await updateDownloadStatus(record.id, "downloading", { resumeState: null });
        runDownload(record.id, task, "resume");
        return;
      } catch {
        // Fall through to a fresh restart below — saved resume data was unusable.
      }
    }

    // No usable resume state (e.g. the app was killed rather than gracefully
    // paused/backgrounded) — the only honest option is to restart the transfer.
    await updateDownloadStatus(record.id, "downloading", { resumeState: null });
    const file = destinationFile(record);
    const task = File.createDownloadTask(sourceUrl, file, { onProgress: onProgress(record.id) });
    runDownload(record.id, task, "start");
  } finally {
    /*
     * Safe here because `runDownload` registers the task in `activeTasks`
     * before its first await, so the slot is never briefly uncounted.
     */
    starting -= 1;
  }
}

export async function isAlreadyDownloaded(
  contentType: DownloadContentType,
  providerItemId: string
): Promise<DownloadTaskRecord | null> {
  return getDownloadByContent(contentType, providerItemId);
}

export function canDownload(containerExtension: string): boolean {
  return isDownloadEligible(containerExtension);
}

export async function startDownload(item: NewDownloadInput): Promise<void> {
  const key = contentKey(item.contentType, item.providerItemId);
  if (startInFlight.has(key)) return;
  startInFlight.add(key);

  try {
    const existing = await getDownloadByContent(item.contentType, item.providerItemId);
    if (existing) return; // already downloading/downloaded — nothing to do.

    /*
     * Read before the insert, which is the only place it can be read
     * honestly: every await after this point is a window another tap can
     * get through, and the whole point of the cap is that it is decided
     * once per request rather than discovered later.
     */
    const slot = hasFreeSlot();

    await insertDownloadTask({
      id: item.id,
      contentType: item.contentType,
      providerItemId: item.providerItemId,
      providerId: item.providerId,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl,
      containerExtension: item.containerExtension,
      status: slot ? "downloading" : "queued",
      bytesTotal: null,
      seriesId: item.seriesId,
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
    });

    /*
     * Queued, and that is the whole of it — the downloads screen already
     * has a label for this status and `pumpQueue` will come back for the
     * row when the transfer ahead of it ends.
     */
    if (!slot) return;

    const sourceUrl = await resolveDownloadSourceUrl(item);
    if (!sourceUrl) {
      await updateDownloadStatus(item.id, "failed", { errorMessage: "Provider credentials are unavailable." });
      return;
    }

    const file = destinationFile(item);
    const task = File.createDownloadTask(sourceUrl, file, { onProgress: onProgress(item.id) });
    runDownload(item.id, task, "start");
  } finally {
    startInFlight.delete(key);
  }
}

export async function pauseDownload(id: string): Promise<void> {
  const task = activeTasks.get(id);
  if (!task) return;

  /*
   * Out of `activeTasks` first, and that order is the whole fix.
   *
   * `pauseAsync()` resolves the pending `downloadAsync()` with null, which
   * runs `runDownload`'s `finally` and pumps the queue — and that happened
   * while this function was still awaiting, so the slot still looked taken
   * and the pump returned empty-handed. Nothing asked again, so the next
   * download sat at "Queued" until something else finished. Watched happen
   * on a device on 2026-11-08: paused one transfer, the one behind it never
   * started.
   *
   * Removing the task before awaiting makes the slot free at the moment the
   * pump looks. The task object is still held locally, so the pause itself
   * is unaffected.
   */
  activeTasks.delete(id);
  await task.pauseAsync();
  /*
   * `savable()` includes the request URL, which for this provider carries
   * the username and password in its path — so the URL is blanked before
   * the state is written and rebuilt on resume. Everything else in the
   * state (the destination, the headers, the byte range) is what actually
   * makes resuming possible.
   */
  const { url: _discardedCredentialUrl, ...state } = task.savable();
  await updateDownloadStatus(id, "paused", { resumeState: JSON.stringify(state) });

  /*
   * And pump explicitly, because the `finally` that would have done it has
   * already run by now — see above. `pumpQueue` is idempotent and bails
   * when there is no slot or nothing waiting, so calling it twice costs a
   * comparison.
   */
  void pumpQueue();
}

export async function resumeDownload(record: DownloadTaskRecord): Promise<void> {
  if (activeTasks.has(record.id)) return;

  /*
   * Resume takes its turn like anything else. Tapping Resume on three
   * paused rows must not open three transfers on a line that carries
   * three connections in total — the resume data keeps, and the row says
   * so on screen.
   */
  if (!hasFreeSlot()) {
    await updateDownloadStatus(record.id, "queued", {});
    return;
  }

  await beginTransfer(record);
}

export async function cancelDownload(id: string): Promise<void> {
  const task = activeTasks.get(id);
  if (task) {
    task.cancel();
    activeTasks.delete(id);
  }
  clearDownloadProgress(id);
  await deleteAndCleanupFile(id);
  /*
   * Explicitly, for the reason given in `pauseDownload`: the `finally`
   * inside `runDownload` fires on the rejection, which can land before the
   * row above is actually gone — and a pump that reads the queue too early
   * finds the cancelled row still in it. Cancelling a transfer must start
   * whatever was waiting behind it; it did not, on the device, on
   * 2026-11-08.
   */
  void pumpQueue();
}

export async function deleteDownload(id: string): Promise<void> {
  const task = activeTasks.get(id);
  if (task) {
    task.cancel();
    activeTasks.delete(id);
  }
  clearDownloadProgress(id);
  await deleteAndCleanupFile(id);
  void pumpQueue();
}

async function deleteAndCleanupFile(id: string): Promise<void> {
  const records = await getAllDownloadTasks();
  const record = records.find((r) => r.id === id);
  if (record?.localUri) {
    try {
      const file = new File(record.localUri);
      if (file.exists) file.delete();
    } catch {
      // Best-effort cleanup — the DB row is still removed below either way.
    }
  }
  await deleteDownloadTask(id);
}

/**
 * Called once at app startup. Any row left in "downloading" was interrupted
 * by a process kill (a graceful pause already moved it to "paused" with
 * resumeState) — surface it as paused so the user can decide to resume
 * (restarting the transfer, since no resume data survives a hard kill).
 */
export async function recoverDownloadsOnBoot(): Promise<void> {
  await recoverInterruptedDownloads();
}

let backgroundListenerRegistered = false;

/**
 * Pauses every active transfer when the app backgrounds, so resumeState is
 * captured instead of lost to a later OS kill.
 *
 * It also stops the queue and empties it into "paused". Without that, the
 * pause below frees a slot, `runDownload`'s `finally` pumps the queue, and
 * backgrounding the app would *start* a download instead of stopping one.
 * Anything waiting becomes a paused row the viewer can resume, which is
 * the same thing an interrupted transfer becomes — one state to come back
 * to rather than two.
 */
export function registerDownloadBackgroundHandling(): void {
  if (backgroundListenerRegistered) return;
  backgroundListenerRegistered = true;
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      transfersSuspended = false;
      return;
    }
    if (state !== "background" && state !== "inactive") return;
    transfersSuspended = true;
    for (const id of Array.from(activeTasks.keys())) {
      pauseDownload(id).catch(() => {});
    }
    parkQueuedDownloads().catch(() => {});
  });
}

/** Moves everything still waiting to "paused", so nothing is left queued behind a transfer that is not running. */
async function parkQueuedDownloads(): Promise<void> {
  const records = await getAllDownloadTasks();
  for (const record of records) {
    if (record.status !== "queued") continue;
    await updateDownloadStatus(record.id, "paused", {});
  }
}
