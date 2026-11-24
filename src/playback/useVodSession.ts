import { useEventListener } from 'expo';
import { useVideoPlayer, type VideoSource, type VideoPlayerStatus } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { toPlaybackError } from '@/core/errors/PlaybackError';
import { vodReasonKey } from '@/core/errors/playbackReason';
import { SourceQueue } from './SourceQueue';
import { useBackgroundPlayback } from './useBackgroundPlayback';

/**
 * One player per mounted VOD screen, with async source loading on iOS.
 * 2026-11-25: the old screens constructed a new native player when metadata
 * resolved and independently replaced it from background/retry callbacks.
 * The queue is the sole source writer, including the episode handoff.
 */
export function useVodSession(source: VideoSource) {
  const player = useVideoPlayer(null);
  const [queue] = useState(() => new SourceQueue<VideoSource>((next) => player.replaceAsync(next)));
  const [status, setStatus] = useState<VideoPlayerStatus>('idle');
  const [errorReasonKey, setErrorReasonKey] = useState<string | null>(null);
  const backgroundEnabled = useBackgroundPlayback(player);
  const sourceKey = JSON.stringify(source);
  const sourceRef = useRef<VideoSource>(null);
  const retried = useRef(false);
  const mounted = useRef(false);
  const background = useRef(AppState.currentState === 'background');
  const savedPosition = useRef(0);
  const savedRate = useRef(1);
  const savedPlaying = useRef(true);

  function showError(error: unknown) {
    if (mounted.current) setErrorReasonKey(vodReasonKey(toPlaybackError(error).category));
  }

  useEventListener(player, 'statusChange', ({ status: next, error }) => {
    setStatus(next);
    if (next === 'readyToPlay') {
      setErrorReasonKey(null);
      return;
    }
    if (next !== 'error' || !error || background.current) return;
    // One automatic retry per selected source, never reset by a ready event.
    if (!retried.current && sourceRef.current) {
      retried.current = true;
      const position = player.currentTime;
      const rate = player.playbackRate;
      void queue.change(sourceRef.current, () => {
        if (Number.isFinite(position) && position > 0) player.currentTime = position;
        player.playbackRate = rate;
        player.play();
      }).catch(showError);
    } else {
      showError(error);
    }
  });

  useEffect(() => {
    mounted.current = true;
    queue.activate();
    return () => { mounted.current = false; queue.dispose(); };
  }, [queue]);

  useEffect(() => {
    const next: VideoSource = JSON.parse(sourceKey);
    sourceRef.current = next;
    retried.current = false;
    savedPosition.current = 0;
    savedRate.current = 1;
    savedPlaying.current = true;
    // Metadata can arrive while the app is backgrounded; do not reopen video there.
    if (background.current) return;
    void queue.change(next, () => {
      if (next !== null) player.play();
    }).catch(showError);
    // Source identity, not the freshly allocated object on each render.
  }, [sourceKey, player, queue]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background') {
        if (backgroundEnabled === true) return;
        background.current = true;
        savedPlaying.current = player.playing;
        savedPosition.current = player.currentTime;
        savedRate.current = player.playbackRate;
        // Promise queue yields to progress persistence listeners first.
        void queue.change(null).catch(showError);
      } else if (next === 'active' && background.current) {
        background.current = false;
        void queue.change(sourceRef.current, () => {
          if (Number.isFinite(savedPosition.current) && savedPosition.current > 0) {
            player.currentTime = savedPosition.current;
          }
          player.playbackRate = savedRate.current;
          if (sourceRef.current && savedPlaying.current) player.play();
        }).catch(showError);
      }
    });
    return () => subscription.remove();
    // showError only reads the mounted flag and a stable React setter.
  }, [backgroundEnabled, player, queue]);

  async function close(): Promise<boolean> {
    player.pause();
    try { return await queue.change(null); }
    catch (error) { showError(error); return false; }
  }

  return { player, status, errorReasonKey, close };
}
