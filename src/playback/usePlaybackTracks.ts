import { useEventListener } from "expo";
import type { AudioTrack, SubtitleTrack, VideoPlayer } from "expo-video";
import { useState } from "react";

export interface UsePlaybackTracksResult {
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  currentAudioTrack: AudioTrack | null;
  currentSubtitleTrack: SubtitleTrack | null;
  selectAudioTrack: (track: AudioTrack) => void;
  selectSubtitleTrack: (track: SubtitleTrack | null) => void;
}

interface TracksState {
  sourceKey: string;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  currentAudioTrack: AudioTrack | null;
  currentSubtitleTrack: SubtitleTrack | null;
  /**
   * Whether the track for this source has already been decided — by the
   * preferred-language pass (inert since 2026-11-18, see the hook's doc
   * comment) or by the viewer picking one in the selector. Either way the
   * next track list to arrive must not overrule it.
   */
  autoAudioApplied: boolean;
  autoSubtitleApplied: boolean;
}

function emptyState(sourceKey: string): TracksState {
  return {
    sourceKey,
    audioTracks: [],
    subtitleTracks: [],
    currentAudioTrack: null,
    currentSubtitleTrack: null,
    autoAudioApplied: false,
    autoSubtitleApplied: false,
  };
}

/**
 * The language tag reduced to its primary subtag: `pt-BR` and `pt_br`
 * both become `pt`. BCP 47 puts the language first and everything that
 * narrows it after, so this is the part a short preference is about.
 */
function primarySubtag(value: string): string {
  return value.trim().toLowerCase().split(/[-_]/)[0];
}

/**
 * Whether a track is the language the viewer asked for — in two passes,
 * because one was wrong.
 *
 * It used to be a single substring test across language, label and name.
 * Substrings are fine for a word and catastrophic for a code: "ar" is
 * inside "Arabic" and also inside "Mandarin", "Hungarian", "Bulgarian"
 * and "Catalan"; "fa" is inside "Farsi" and inside "Dari Afghan"; "he" is
 * inside "Hebrew" and inside "Chechen". `find` takes the first hit, so a
 * viewer who set "ar" got whichever of those the provider happened to
 * list first — and with the common ordering, that is not Arabic.
 *
 * So the exact pass runs first and over the whole track list, and only if
 * nothing matches does the loose pass run, and only for a needle long
 * enough that a substring means something. Three characters, because
 * ISO 639-2 codes are three long and a real word is longer.
 */
export function findPreferredTrack<T extends AudioTrack | SubtitleTrack>(
  tracks: T[],
  preferred: string
): T | undefined {
  const needle = preferred.trim().toLowerCase();
  if (!needle) return undefined;

  const wanted = primarySubtag(needle);
  const exact = tracks.find((track) => track.language && primarySubtag(track.language) === wanted);
  if (exact) return exact;

  if (needle.length <= 3) return undefined;
  return tracks.find((track) =>
    [track.language, track.label, track.name].some((v) => v?.toLowerCase().includes(needle))
  );
}

/**
 * Master prompt §24.4/§24.5: expose native audio/subtitle tracks when
 * available, with human-readable labels. `availableAudioTracks` /
 * `availableSubtitleTracks` are read-only properties that only become
 * populated asynchronously once the source has loaded, so this listens for
 * the corresponding `*Change` events rather than reading the properties
 * once — reading them at mount would almost always see an empty array.
 *
 * `sourceKey` is §24.4's "do not accidentally apply an old track index to
 * an unrelated channel" guard. The movie and episode players are one-shot
 * (one source per screen instance) and can leave it at its default, but
 * the live player reuses a single `VideoPlayer` across every channel
 * switch: passing the channel id there discards the previous channel's
 * track list and clears `TracksState`'s "already decided" flags, so the
 * chrome never offers a track that belongs to a stream that is no longer
 * playing.
 *
 * `preferredAudioLang`/`preferredSubtitleLang` are applied at most once per
 * source, the first time each track list populates — after that the user's
 * own manual selection is never overridden by this hook again until the
 * source changes.
 *
 * Both of those arms are inert as of 2026-11-18, and this is the honest
 * reading of them. They were fed by two free-text rows in Settings →
 * Playback; the owner asked for those rows to go on 2026-11-17 ("لغة الصوت
 * المفضل الغيها / لغة الترجمة الغيها") and they went, and so did the two
 * repository setters that wrote the columns. The players still pass what
 * `getAppState()` returns, but nothing in the app can write a value there
 * any more, and nothing has been released from this tree — so the columns
 * are null on every install bar a test device that set one before the rows
 * went, and in practice neither `if` below is entered. What the viewer picks
 * by hand in the track selector is unaffected; that was never this path.
 *
 * Left standing rather than deleted because the deletion cannot be finished
 * from here: the three player screens pass these two positionally, ahead of
 * `sourceKey`, and the player screens are excluded from this pass (the owner
 * tested the player himself). Dropping the parameters without editing those
 * three call sites would silently slide the channel id into
 * `preferredAudioLang`. See appStateRepository.ts's `preferredAudioLang`
 * comment, and docs/DECISIONS.md, "Preferred audio/subtitle language
 * settings removed (2026-11-18)".
 */
export function usePlaybackTracks(
  player: VideoPlayer,
  preferredAudioLang?: string | null,
  preferredSubtitleLang?: string | null,
  sourceKey: string = "single-source"
): UsePlaybackTracksResult {
  const [state, setState] = useState<TracksState>(() => emptyState(sourceKey));

  /**
   * Reset when the player is pointed at a different source — done during
   * render, React's documented "adjust state when a prop changes" pattern,
   * rather than in a `useEffect` (which this project's
   * `react-hooks/set-state-in-effect` rule flags).
   */
  if (state.sourceKey !== sourceKey) {
    setState(emptyState(sourceKey));
  }

  /* eslint-disable react-hooks/immutability -- native player property setters, see doc comment above. */
  useEventListener(player, "availableAudioTracksChange", ({ availableAudioTracks }) => {
    let autoApplied = state.autoAudioApplied;
    if (!autoApplied && preferredAudioLang) {
      const match = findPreferredTrack(availableAudioTracks, preferredAudioLang);
      if (match) {
        autoApplied = true;
        player.audioTrack = match;
      }
    }
    setState((prev) => ({ ...prev, audioTracks: availableAudioTracks, autoAudioApplied: autoApplied }));
  });
  useEventListener(player, "availableSubtitleTracksChange", ({ availableSubtitleTracks }) => {
    let autoApplied = state.autoSubtitleApplied;
    if (!autoApplied && preferredSubtitleLang) {
      const match = findPreferredTrack(availableSubtitleTracks, preferredSubtitleLang);
      if (match) {
        autoApplied = true;
        player.subtitleTrack = match;
      }
    }
    setState((prev) => ({ ...prev, subtitleTracks: availableSubtitleTracks, autoSubtitleApplied: autoApplied }));
  });
  /* eslint-enable react-hooks/immutability */
  useEventListener(player, "audioTrackChange", ({ audioTrack }) => {
    setState((prev) => ({ ...prev, currentAudioTrack: audioTrack }));
  });
  useEventListener(player, "subtitleTrackChange", ({ subtitleTrack }) => {
    setState((prev) => ({ ...prev, currentSubtitleTrack: subtitleTrack }));
  });

  function selectAudioTrack(track: AudioTrack) {
    setState((prev) => ({ ...prev, autoAudioApplied: true }));
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
    player.audioTrack = track;
  }

  function selectSubtitleTrack(track: SubtitleTrack | null) {
    setState((prev) => ({ ...prev, autoSubtitleApplied: true }));
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
    player.subtitleTrack = track;
  }

  return {
    audioTracks: state.audioTracks,
    subtitleTracks: state.subtitleTracks,
    currentAudioTrack: state.currentAudioTrack,
    currentSubtitleTrack: state.currentSubtitleTrack,
    selectAudioTrack,
    selectSubtitleTrack,
  };
}
