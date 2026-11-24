import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, deferred } from './helpers/load-module.mjs';

for (const [file, adapter, fetchName, loadName, getName, setName, clearName] of [
  ['vodStore', 'vodAdapter', 'getAllVodStreams', 'loadVodMovies', 'getVodMovies', 'setVodMovies', 'clearVodMovies'],
  ['seriesStore', 'seriesAdapter', 'getAllSeries', 'loadSeriesList', 'getSeriesList', 'setSeriesList', 'clearSeriesList'],
]) {
  test(`${file}: account switch rejects a late old response without changing the new catalog`, async () => {
    const pending = deferred();
    const store = loadModule(`src/state/${file}.ts`, {
      '@/core/demo/demoMode': { DEMO_CONTENT: false },
      [`@/providers/xtream/${adapter}`]: { [fetchName]: () => pending.promise },
    });
    const old = store[loadName]({});
    store[clearName]();
    const current = [{ providerItemId: 'new' }];
    store[setName](current);
    pending.resolve([{ providerItemId: 'old' }]);
    await assert.rejects(old, /superseded/);
    assert.equal(store[getName](), current);
  });
  test(`${file}: latest refresh wins even when the earlier response arrives last`, async () => {
    const first = deferred(), second = deferred();
    let calls = 0;
    const store = loadModule(`src/state/${file}.ts`, {
      '@/core/demo/demoMode': { DEMO_CONTENT: false },
      [`@/providers/xtream/${adapter}`]: { [fetchName]: () => (++calls === 1 ? first : second).promise },
    });
    const old = store[loadName]({}, { forceRefresh: true });
    const fresh = store[loadName]({}, { forceRefresh: true });
    second.resolve(['fresh']);
    await fresh;
    first.resolve(['old']);
    await assert.rejects(old, /superseded/);
    assert.deepEqual(store[getName](), ['fresh']);
  });
}

function catalog({ failMovies = false, failWrites = false, warm = async () => {} } = {}) {
  const writes = [];
  const module = loadModule('src/state/catalogCache.ts', {
    '@/core/media/imageCache': { warmImageCache: warm },
    '@/db/repositories/catalogCacheRepository': {
      readCatalog: async (_id, kind) => kind === 'movies' ? { data: [{ name: 'saved movie' }], fetchedAt: 123 } : null,
      writeCatalog: async (...args) => { if (failWrites) throw new Error('disk full'); writes.push(args); },
    },
    '@/providers/xtream/xtreamAdapter': { getLiveCategories: async () => [], getAllLiveChannels: async () => [], buildLiveStreamCandidates: () => ['safe-test-url'] },
    '@/providers/xtream/vodAdapter': { getVodCategories: async () => [], getAllVodStreams: async () => { if (failMovies) throw new Error('offline'); return [{ name: 'fresh movie' }]; } },
    '@/providers/xtream/seriesAdapter': { getSeriesCategories: async () => [], getAllSeries: async () => [] },
  });
  return { ...module, writes };
}

test('failed refresh retains saved movies and their old freshness timestamp', async () => {
  const c = catalog({ failMovies: true });
  const result = await c.preloadCatalog('test', {}, 'ts', () => {});
  assert.deepEqual(result.movies, [{ name: 'saved movie' }]);
  assert.equal(result.fetchedAt, 123);
  assert.equal(c.writes.some(([, kind]) => kind === 'movies'), false);
});
test('disk failure does not discard a successful provider response', async () => {
  const c = catalog({ failWrites: true });
  const result = await c.preloadCatalog('test', {}, 'ts', () => {});
  assert.deepEqual(result.movies, [{ name: 'fresh movie' }]);
});
test('unresolved image downloads do not hold the catalog loading screen', { timeout: 1000 }, async () => {
  const images = deferred();
  let started = false;
  const c = catalog({ warm: () => { started = true; return images.promise; } });
  const result = await c.preloadCatalog('test', {}, 'ts', () => {});
  assert.equal(started, true);
  assert.equal(result.movies.length, 1);
  images.resolve();
});

for (const disconnect of [false, true]) {
  test(`manual live refresh cannot ${disconnect ? 'undo disconnect' : 'restore the previous account'}`, async () => {
    const pending = deferred();
    let current = { provider: { id: 'old' }, config: {}, channels: [] };
    const restore = loadModule('src/state/sessionRestore.ts', {
      'expo-network': {}, '@/core/storage/secureCredentials': {}, '@/domain/provider/types': {},
      '@/db/repositories/catalogCacheRepository': { writeCatalog: async () => {} },
      '@/db/repositories/providerRepository': {},
      '@/providers/xtream/xtreamAdapter': { getAllLiveChannels: () => pending.promise, resolveContainerExtension: () => 'ts' },
      '@/state/activeSessionStore': { getActiveSession: () => current, setActiveSession: value => { current = value; } },
      '@/state/catalogCache': {}, '@/state/seriesStore': {}, '@/state/vodStore': {},
    });
    const job = restore.refreshActiveSessionChannels();
    const expected = disconnect ? null : { provider: { id: 'new' }, channels: [] };
    current = expected;
    pending.resolve([{ providerItemId: 'old-channel' }]);
    await job;
    assert.equal(current, expected);
  });
}
