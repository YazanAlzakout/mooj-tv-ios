import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceQueue } from '../src/playback/SourceQueue.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };

test('background clear followed by foreground load never overlaps or plays stale source', async () => {
  const blocked = deferred(); const calls = []; const played = [];
  const q = new SourceQueue(async source => { calls.push(source); if (source === 'old') await blocked.promise; });
  const old = q.change('old', () => played.push('old'));
  await Promise.resolve();
  const clear = q.change(null);
  const next = q.change('new', () => played.push('new'));
  assert.deepEqual(calls, ['old']);
  blocked.resolve();
  assert.deepEqual(await Promise.all([old, clear, next]), [false, false, true]);
  assert.deepEqual(calls, ['old', 'new']);
  assert.deepEqual(played, ['new']);
});

test('unmount invalidates pending callbacks and queued native commands', async () => {
  const blocked = deferred(); let plays = 0; let loads = 0;
  const q = new SourceQueue(async () => { loads++; await blocked.promise; });
  const first = q.change('a', () => plays++); await Promise.resolve();
  const second = q.change('b', () => plays++); q.dispose(); blocked.resolve();
  await Promise.all([first, second]);
  assert.equal(plays, 0); assert.equal(loads, 1);
});

test('a failed load does not poison retry', async () => {
  const q = new SourceQueue(async source => { if (source === 'bad') throw new Error('failed'); });
  await assert.rejects(q.change('bad'));
  assert.equal(await q.change('good'), true);
});

test('disposed queue can be activated for React strict effect replay', async () => {
  const q = new SourceQueue(async () => {}); q.dispose();
  assert.equal(await q.change('ignored'), false); q.activate();
  assert.equal(await q.change('loaded'), true);
});

test('a rejected stale load cannot report an error over the newer source', async () => {
  const blocked = deferred();
  const q = new SourceQueue(async source => { if (source === 'old') { await blocked.promise; throw new Error('old failed'); } });
  const old = q.change('old'); await Promise.resolve();
  const next = q.change('new'); blocked.resolve();
  assert.equal(await old, false); assert.equal(await next, true);
});

test('only the latest episode handoff may navigate', async () => {
  const blocked = deferred(); let navigations = 0;
  const q = new SourceQueue(async () => { await blocked.promise; });
  const first = q.change(null).then(current => { if (current) navigations++; });
  await Promise.resolve();
  const second = q.change(null).then(current => { if (current) navigations++; });
  blocked.resolve(); await Promise.all([first, second]);
  assert.equal(navigations, 1);
});
