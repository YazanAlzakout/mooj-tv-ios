import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceQueue } from '../src/playback/SourceQueue.ts';
import { loadModule } from './helpers/load-module.mjs';

// Hook orchestration test: native AVPlayer is mocked, not its source queue.
function session(initialState = 'active') {
  const effects = [], sources = [];
  let appStateListener;
  let playCalls = 0;
  const player = {
    playing: false, currentTime: 0, playbackRate: 1,
    replaceAsync: async source => { sources.push(source); player.playing = false; },
    play: () => { playCalls++; player.playing = true; },
    pause: () => { player.playing = false; },
  };
  const hook = loadModule('src/playback/useVodSession.ts', {
    expo: { useEventListener: () => {} },
    'expo-video': { useVideoPlayer: () => player },
    react: {
      useState: value => [typeof value === 'function' ? value() : value, () => {}],
      useRef: current => ({ current }), useEffect: fn => effects.push(fn),
    },
    'react-native': { AppState: { currentState: initialState, addEventListener: (_name, listener) => { appStateListener = listener; return { remove() {} }; } } },
    '@/core/errors/PlaybackError': { toPlaybackError: () => ({ category: 'test' }) },
    '@/core/errors/playbackReason': { vodReasonKey: () => 'test' },
    './SourceQueue': { SourceQueue }, './useBackgroundPlayback': { useBackgroundPlayback: () => false },
  });
  hook.useVodSession('test-source');
  const cleanups = effects.map(fn => fn());
  return { player, sources, state: next => appStateListener(next), playCalls: () => playCalls, close: () => cleanups.forEach(fn => fn?.()) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('paused VOD stays paused after background and foreground, preserving time and speed', async () => {
  const s = session();
  await settle();
  s.player.pause(); s.player.currentTime = 87; s.player.playbackRate = 1.5;
  const before = s.playCalls();
  s.state('background'); await settle();
  s.state('active'); await settle();
  assert.equal(s.player.playing, false);
  assert.equal(s.playCalls(), before);
  assert.equal(s.player.currentTime, 87);
  assert.equal(s.player.playbackRate, 1.5);
  s.close();
});
test('playing VOD resumes after a background round trip', async () => {
  const s = session(); await settle();
  s.state('background'); await settle(); s.state('active'); await settle();
  assert.equal(s.player.playing, true);
  assert.deepEqual(s.sources, ['test-source', null, 'test-source']);
  s.close();
});
test('a source mounted in background does not open until foreground', async () => {
  const s = session('background'); await settle();
  assert.deepEqual(s.sources, []);
  s.state('active'); await settle();
  assert.deepEqual(s.sources, ['test-source']);
  s.close();
});
