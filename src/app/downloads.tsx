import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { Focusable } from "@/components/Focusable";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { artworkIsKnownBad } from "@/core/media/deadImageHosts";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { formatBytes } from "@/core/utils/formatBytes";
import { useI18n } from "@/core/i18n/I18nContext";
import { getAllDownloadTasks, type DownloadStatus, type DownloadTask } from "@/db/repositories/downloadRepository";
import {
  cancelDownload,
  deleteDownload,
  pauseDownload,
  resumeDownload,
} from "@/domain/downloads/downloadManager";
import { useDownloadProgress } from "@/domain/downloads/downloadProgressStore";

export default function DownloadsScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<DownloadTask[] | null>(null);

  /**
   * What is happening first, then what is waiting, then what is done.
   *
   * The repository hands these back newest-first, which on this screen put
   * a row marked "Queued" above the one that was actually transferring —
   * seen on a device on 2026-11-08, and it reads as though the app has the
   * order wrong. Within a status band the newest-first order is kept, so a
   * download started a minute ago is still above one from last week.
   */
  const ordered = useMemo(() => {
    const rank: Record<DownloadStatus, number> = {
      downloading: 0,
      paused: 1,
      queued: 2,
      failed: 3,
      completed: 4,
      canceled: 5,
    };
    return tasks === null ? null : [...tasks].sort((a, b) => rank[a.status] - rank[b.status]);
  }, [tasks]);
  const [pendingDelete, setPendingDelete] = useState<DownloadTask | null>(null);

  const load = useCallback(() => {
    getAllDownloadTasks().then(setTasks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 2000);
      return () => clearInterval(interval);
    }, [load])
  );

  function openCompleted(task: DownloadTask) {
    if (!task.localUri) return;
    if (task.contentType === "movie") {
      router.push({ pathname: "/movies/player/[movieId]", params: { movieId: task.providerItemId, localUri: task.localUri } });
    } else {
      router.push({
        pathname: "/series/player/[episodeId]",
        params: {
          episodeId: task.providerItemId,
          containerExtension: task.containerExtension,
          title: task.title,
          imageUrl: task.imageUrl ?? "",
          seriesId: task.seriesId ?? "",
          seasonNumber: task.seasonNumber !== null ? String(task.seasonNumber) : "",
          episodeNumber: task.episodeNumber !== null ? String(task.episodeNumber) : "",
          localUri: task.localUri,
        },
      });
    }
  }

  async function handlePause(id: string) {
    await pauseDownload(id);
    load();
  }

  async function handleResume(task: DownloadTask) {
    await resumeDownload(task);
    load();
  }

  async function handleCancel(id: string) {
    await cancelDownload(id);
    load();
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title={t("downloads", "title")} subtitle={tasks ? `${tasks.length}` : undefined} />

        {tasks !== null && tasks.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyGlyph}>⬇</Text>
            <Text style={styles.emptyText}>{t("downloads", "empty")}</Text>
          </View>
        )}

        {ordered && ordered.length > 0 && (
          <FlatList
        {...NO_CLIP}
            data={ordered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <DownloadRow
                task={item}
                onOpen={() => openCompleted(item)}
                onPause={() => handlePause(item.id)}
                onResume={() => handleResume(item)}
                onCancel={() => handleCancel(item.id)}
                onDelete={() => setPendingDelete(item)}
              />
            )}
          />
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t("downloads", "deleteConfirmTitle")}
        message={t("downloads", "deleteConfirmBody", { title: pendingDelete?.title ?? "" })}
        confirmLabel={t("downloads", "delete")}
        danger
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            await deleteDownload(target.id);
            load();
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenBackground>
  );
}

function statusLabel(t: ReturnType<typeof useI18n>["t"], status: DownloadStatus): string {
  switch (status) {
    case "queued":
      return t("downloads", "queued");
    case "downloading":
      return t("downloads", "downloading");
    case "paused":
      return t("downloads", "paused");
    case "completed":
      return t("downloads", "completed");
    case "failed":
      return t("downloads", "failed");
    case "canceled":
      return t("downloads", "canceled");
  }
}

function DownloadRow({
  task,
  onOpen,
  onPause,
  onResume,
  onCancel,
  onDelete,
}: {
  task: DownloadTask;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  /*
    **The same test `CachedImage` uses, not a blank `false`.**

    The branch below swaps the letter tile OUT for the image, so whenever
    `CachedImage` declines to render — and it declines by returning null,
    before any image exists, for a URL that is already known bad — this row
    drew nothing at all where the artwork goes. With no image mounted
    `onError` can never fire either, so the row could not correct itself for
    the rest of the session.

    The tile is a flex child, not a layer behind the text, so a row that
    draws nothing pulls its title, its status line, its progress bar and the
    whole Pause / Cancel / Delete column 60dp towards the start edge — the
    widest shift of the four list screens, and the only one of them where
    what sits beside the text is what the viewer is aiming at. The poster is
    also the very one the detail screen they started the download from had
    already tried and failed to load.

    Same defect and same fix as the browse grid and the channel row beside
    the player (45d89d0, and ChannelListRow.tsx:61); found again on this
    screen in the pre-release audit, 2026-11-17.
  */
  const [imageFailed, setImageFailed] = useState(() => artworkIsKnownBad(task.imageUrl));
  const liveProgress = useDownloadProgress(task.id);

  const bytesDownloaded = liveProgress?.bytesDownloaded ?? task.bytesDownloaded;
  const bytesTotal = liveProgress?.bytesTotal ?? task.bytesTotal;
  const fraction = bytesTotal && bytesTotal > 0 ? Math.min(1, bytesDownloaded / bytesTotal) : 0;

  return (
    <Focusable
      onPress={onOpen}
      style={styles.row}
      disabled={task.status !== "completed"}
    >
      {task.imageUrl && !imageFailed ? (
        <CachedImage
          uri={task.imageUrl}
          style={styles.rowImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.rowImageFallback}>
          <Text style={styles.rowImageFallbackText}>{task.title.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={styles.rowMeta}>
          {statusLabel(t, task.status)}
          {task.status === "downloading" || task.status === "paused"
            ? ` · ${formatBytes(bytesDownloaded)}${bytesTotal ? ` / ${formatBytes(bytesTotal)}` : ""}`
            : task.status === "completed"
              ? ` · ${formatBytes(task.bytesDownloaded)}`
              : ""}
        </Text>
        {(task.status === "downloading" || task.status === "paused") && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {task.status === "downloading" && (
          <Focusable onPress={onPause} hitSlop={8} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{t("downloads", "pause")}</Text>
          </Focusable>
        )}
        {task.status === "paused" && (
          <Focusable onPress={onResume} hitSlop={8} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{t("downloads", "resume")}</Text>
          </Focusable>
        )}
        {task.status === "failed" && (
          <Focusable onPress={onResume} hitSlop={8} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{t("common", "retry")}</Text>
          </Focusable>
        )}
        {(task.status === "downloading" || task.status === "paused") && (
          <Focusable onPress={onCancel} hitSlop={8} style={styles.actionButton}>
            <Text style={styles.actionButtonTextDestructive}>{t("downloads", "cancel")}</Text>
          </Focusable>
        )}
        {(task.status === "completed" || task.status === "failed") && (
          <Focusable onPress={onDelete} hitSlop={8} style={styles.actionButton}>
            <Text style={styles.actionButtonTextDestructive}>{t("downloads", "delete")}</Text>
          </Focusable>
        )}
      </View>
    </Focusable>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: Spacing.sm },
  emptyGlyph: { color: C.fillMedium, fontSize: 40 },
  emptyText: { color: C.textMuted, fontSize: 13, fontFamily: FontFamily.regular },

  list: { padding: Spacing.lg, gap: Spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowImage: { width: 48, height: 48, borderRadius: Radii.sm },
  rowImageFallback: {
    width: 48,
    height: 48,
    borderRadius: Radii.sm,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  rowImageFallbackText: { color: C.textSecondary, fontSize: 16, fontFamily: FontFamily.bold },
  rowMain: { flex: 1, gap: 4 },
  rowName: { color: C.text, fontSize: 14, fontFamily: FontFamily.medium },
  rowMeta: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: C.fillMedium, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Brand.primary },

  actions: { gap: Spacing.xs, alignItems: "flex-end" },
  actionButton: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  actionButtonText: { color: Brand.primaryLight, fontSize: 12, fontFamily: FontFamily.semiBold },
  actionButtonTextDestructive: { color: C.error, fontSize: 12, fontFamily: FontFamily.semiBold },
  })
);
