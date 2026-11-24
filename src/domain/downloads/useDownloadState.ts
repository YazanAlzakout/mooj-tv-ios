import { useCallback, useEffect, useRef, useState } from "react";

import { generateId } from "@/core/utils/id";
import type { DownloadTask } from "@/db/repositories/downloadRepository";

import {
  canDownload,
  cancelDownload,
  deleteDownload,
  isAlreadyDownloaded,
  pauseDownload,
  resumeDownload,
  startDownload,
  type NewDownloadInput,
} from "./downloadManager";
import { useDownloadProgress } from "./downloadProgressStore";

export interface UseDownloadStateResult {
  eligible: boolean;
  record: DownloadTask | null;
  /** Live bytes while `record.status === "downloading"`; undefined once there is nothing in flight. */
  progress: { bytesDownloaded: number; bytesTotal: number | null } | undefined;
  trigger: () => void;
  /** Suspend an in-flight transfer, keeping what has already been written. */
  pause: () => void;
  /** Continue a paused transfer from where it stopped. */
  resume: () => void;
  /** Abandon an in-flight transfer and discard the partial file. */
  cancel: () => void;
  /** Remove a finished download's file from the device. */
  remove: () => void;
}

/**
 * Depends on primitive `contentType`/`providerItemId` fields, not the whole
 * `item` object reference — same reasoning as useLibraryToggle: callers
 * often pass a freshly-constructed object every render.
 */
export function useDownloadState(item: Omit<NewDownloadInput, "id"> | null): UseDownloadStateResult {
  const [record, setRecord] = useState<DownloadTask | null>(null);

  const refresh = useCallback(() => {
    if (!item) return;
    isAlreadyDownloaded(item.contentType, item.providerItemId).then(setRecord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.contentType, item?.providerItemId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const progress = useDownloadProgress(record?.id ?? "");

  /**
   * `startDownload` clears the live progress entry the instant a transfer
   * finishes (success or failure), right before writing the final DB
   * status — so a progress entry going from present to absent is the
   * signal that this record's status just changed. Without re-fetching
   * here, a movie/episode detail screen left open across a whole download
   * would keep showing "downloading…" forever, since `refresh()` only
   * otherwise runs on mount and right after the user taps download.
   */
  const hadProgressRef = useRef(false);
  useEffect(() => {
    if (progress) {
      hadProgressRef.current = true;
    } else if (hadProgressRef.current) {
      hadProgressRef.current = false;
      refresh();
    }
  }, [progress, refresh]);

  const eligible = item !== null && canDownload(item.containerExtension);

  function trigger() {
    if (!item || !eligible || record) return;
    startDownload({ ...item, id: generateId() }).then(refresh);
  }

  /**
   * Every one of these re-reads the record afterwards rather than patching
   * local state optimistically: the manager is the owner of a download's
   * real status (it also writes failures, completions and resume state),
   * and a screen guessing at it is how the "stuck on downloading…" class of
   * bug starts.
   */
  function pause() {
    if (!record) return;
    pauseDownload(record.id).then(refresh);
  }

  function resume() {
    if (!record) return;
    resumeDownload(record).then(refresh);
  }

  function cancel() {
    if (!record) return;
    cancelDownload(record.id).then(refresh);
  }

  function remove() {
    if (!record) return;
    deleteDownload(record.id).then(refresh);
  }

  return { eligible, record, progress, trigger, pause, resume, cancel, remove };
}
