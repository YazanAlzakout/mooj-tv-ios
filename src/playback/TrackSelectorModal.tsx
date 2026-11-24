import type { AudioTrack, SubtitleTrack } from "expo-video";
import { Modal, Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { Focusable } from "@/components/Focusable";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { useI18n } from "@/core/i18n/I18nContext";
import { Brand, Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { UsePlaybackTracksResult } from "@/playback/usePlaybackTracks";

/**
 * Shared audio/subtitle track picker (master prompt §24.4/§24.5).
 *
 * Every row here was a plain `Pressable` until 2026-09-18, which on a
 * television meant the sheet could be *navigated* but not *seen*: a
 * `Pressable` is D-pad focusable by default on react-native-tvos, so the
 * arrows did move between the rows — they just moved an invisible
 * highlight, because nothing drew a focus state. The viewer pressed OK on
 * whichever row Android happened to be on. `Focusable` is the same
 * Pressable with the app's focus ring, and it costs a phone nothing: a
 * touch screen never fires a focus event, so the ring never appears
 * there.
 *
 * Nothing landed focus inside the sheet either. Android gives a new
 * dialog's focus to the first focusable in it, which was the first audio
 * row when there were audio tracks and the subtitle "off" row when there
 * were none — workable by accident, not by design. The first audio row now
 * claims it explicitly on the TV build, because on a live channel the
 * audio language is what the viewer opened this for.
 *
 * This became worth fixing when the live player bound the remote's
 * left/right arrows to this sheet: those two keys had no other meaning on
 * a live channel, and the audio language was the one thing on the control
 * overlay that no remote key could reach after the transport row was
 * removed.
 */
export function TrackSelectorModal({
  visible,
  onClose,
  tracks,
}: {
  visible: boolean;
  onClose: () => void;
  tracks: UsePlaybackTracksResult;
}) {
  const { t } = useI18n();

  /*
    A track's own name, and only ours when it has none.

    The provider supplies these, so most of the time the right answer is to
    print exactly what it said — "العربية", "English", "Türkçe" — and
    translating those would be wrong. The fallback is the one string here
    that is the app speaking, so it is the one that gets translated.

    Every string in this file was English regardless of the chosen language
    until 2026-09-17, in a picker reachable from the film and episode
    players. What makes that worth a comment is that the translations
    already existed: `trackSelector.audio`, `.subtitles`, `.off` and
    `.close` were sitting in all six locale files, and only
    `.tracksButton` — the button that opens this sheet — was ever wired up.
    The sheet it opened then answered in English.
  */
  function trackLabel(track: AudioTrack | SubtitleTrack): string {
    return track.label || track.name || track.language || t("trackSelector", "unknown");
  }

  /*
    The focus ring is a television thing, so the component that draws it is
    chosen by build rather than used everywhere.

    `Focusable` would have been harmless on a phone — its ring is
    transparent until a focus event arrives and a touch screen never sends
    one — but it is still an extra native View inside every row of a sheet
    that the film and episode players open, and the phone's code is closed
    to changes nobody asked for ("نحن نعدل في التلفاز فقط", 2026-09-18).
    On a phone this is the same `Pressable` these rows have always been.
  */
  const Row = isTvBuild ? Focusable : Pressable;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} focusable={false} onPress={onClose}>
        <Pressable style={styles.sheet} focusable={false} onPress={(e) => e.stopPropagation()}>
          <ScrollView>
            <Text style={styles.sectionTitle}>{t("trackSelector", "audio")}</Text>
            {tracks.audioTracks.length === 0 && (
              <Text style={styles.emptyText}>{t("trackSelector", "noAudioTracks")}</Text>
            )}
            {tracks.audioTracks.map((track, index) => (
              <Row
                key={track.id ?? `${track.language}-${index}`}
                style={styles.optionRow}
                onPress={() => tracks.selectAudioTrack(track)}
                hasTVPreferredFocus={isTvBuild && index === 0}
              >
                <Text
                  style={[
                    styles.optionText,
                    tracks.currentAudioTrack?.id === track.id && styles.optionTextActive,
                  ]}
                >
                  {trackLabel(track)}
                </Text>
              </Row>
            ))}

            <Text style={styles.sectionTitle}>{t("trackSelector", "subtitles")}</Text>
            {/*
              No `hasTVPreferredFocus` here even when there are no audio
              tracks at all. Landing the remote on "subtitles off" would
              mean one stray OK press turns subtitles off — harmless, but
              it is still an action the viewer did not ask for, and the
              audio section above it is what they came for.
            */}
            <Row style={styles.optionRow} onPress={() => tracks.selectSubtitleTrack(null)}>
              <Text style={[styles.optionText, tracks.currentSubtitleTrack === null && styles.optionTextActive]}>
                {t("trackSelector", "off")}
              </Text>
            </Row>
            {tracks.subtitleTracks.length === 0 && (
              <Text style={styles.emptyText}>{t("trackSelector", "noSubtitleTracks")}</Text>
            )}
            {tracks.subtitleTracks.map((track, index) => (
              <Row
                key={track.id ?? `${track.language}-${index}`}
                style={styles.optionRow}
                onPress={() => tracks.selectSubtitleTrack(track)}
              >
                <Text
                  style={[
                    styles.optionText,
                    tracks.currentSubtitleTrack?.id === track.id && styles.optionTextActive,
                  ]}
                >
                  {trackLabel(track)}
                </Text>
              </Row>
            ))}
          </ScrollView>

          <Row style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{t("trackSelector", "close")}</Text>
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.lg,
    maxHeight: "70%",
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: FontFamily.bold,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  emptyText: { color: Colors.textMuted, fontSize: 12, fontFamily: FontFamily.regular, paddingVertical: Spacing.xs },
  optionRow: { paddingVertical: Spacing.sm },
  optionText: { color: Colors.textSecondary, fontSize: 14, fontFamily: FontFamily.medium },
  optionTextActive: { color: Brand.primaryLight, fontFamily: FontFamily.bold },
  closeButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
  },
  closeButtonText: { color: Colors.text, fontSize: 14, fontFamily: FontFamily.semiBold },
});
