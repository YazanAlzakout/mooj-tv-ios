import { useSyncExternalStore } from "react";

/**
 * Live in-memory progress, separate from the throttled SQLite writes the
 * manager makes (see downloadManager.ts) — the DB is for crash recovery,
 * this is what the UI reads for a smooth per-tick progress bar.
 */
type ProgressMap = Record<string, { bytesDownloaded: number; bytesTotal: number | null }>;

let snapshot: ProgressMap = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeDownloadProgress(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getDownloadProgressSnapshot(): ProgressMap {
  return snapshot;
}

export function setDownloadProgress(id: string, bytesDownloaded: number, bytesTotal: number | null): void {
  snapshot = { ...snapshot, [id]: { bytesDownloaded, bytesTotal } };
  emit();
}

export function clearDownloadProgress(id: string): void {
  if (!(id in snapshot)) return;
  const next = { ...snapshot };
  delete next[id];
  snapshot = next;
  emit();
}

export function useDownloadProgress(id: string): { bytesDownloaded: number; bytesTotal: number | null } | undefined {
  return useSyncExternalStore(subscribeDownloadProgress, () => getDownloadProgressSnapshot()[id]);
}
