'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fakeIndexedDb() {
  const records = new Map();
  const store = {
    createIndex() {},
    put(record) { records.set(record.id, structuredClone(record)); },
    delete(id) { records.delete(id); },
    get(id) {
      const request = {};
      queueMicrotask(() => {
        request.result = records.has(id) ? structuredClone(records.get(id)) : undefined;
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
    index(name) {
      assert.equal(name, 'owner');
      return {
        getAll(owner) {
          const request = {};
          queueMicrotask(() => {
            request.result = [...records.values()].filter(record => record.owner === owner).map(record => structuredClone(record));
            if (request.onsuccess) request.onsuccess();
          });
          return request;
        }
      };
    }
  };
  const database = {
    objectStoreNames: { contains: () => database.created === true },
    createObjectStore() { database.created = true; return store; },
    transaction() {
      const transaction = { objectStore: () => store };
      queueMicrotask(() => { if (transaction.oncomplete) transaction.oncomplete(); });
      return transaction;
    }
  };
  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if (!database.created && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}

const indexedDB = fakeIndexedDb();
const sandbox = {
  console,
  indexedDB,
  navigator: {
    storage: {
      estimate: async () => ({ usage: 1024, quota: 1024 * 1024 * 1024 }),
      persisted: async () => true
    }
  },
  document: {
    getElementById() { return null; },
    addEventListener() {},
    createElement() { return { click() {}, remove() {} }; },
    body: { appendChild() {} }
  },
  URL: Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL() {} }),
  Blob,
  Map,
  Set,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  RegExp,
  setTimeout,
  clearTimeout,
  confirm: () => true
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const prelude = `
let currentUser = { uid: 'capacity-user', email: 'tester@example.com' };
let state = { metricsDate: '2026-01-01', currentPhotos: {}, metricsHistory: [], meta: {} };
const VFIT_APP_VERSION = 'test';
const VFIT_STATE_SCHEMA_VERSION = 8;
function localDateKey() { return '2026-01-01'; }
function isPlainRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isValidPhotoData(value) { return typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('vfit-photo:')); }
function saveState() { __saveCount += 1; return true; }
function getCurrentMetricEntry() { return state.metricsHistory.find(item => item.date === state.metricsDate); }
function formatMetricsDateLabel(value) { return value; }
function refreshIcons() {}
function showToast() {}
function requestPersistentDeviceStorage() {}
function markReminderDone() {}
function renderMetricsHistory() {}
function mergeMetricEntry() { return true; }
function openProgressPhotosModal() {}
function saveRecordedPhotos() {}
function loadComparisonPhotos() {}
function exportVfitBackup() {}
function importVfitBackup() {}
function renderMetricsStatusLines() {}
function normalizeState(value) { return value; }
function mergeStateSnapshots(local, imported) { return Object.assign({}, local, imported); }
async function flushCloudSync() {}
let comparePhotoType = 'front';
let __saveCount = 0;
`;

const source = fs.readFileSync(new URL('../metrics/photo-storage.js', `file://${__filename}`), 'utf8');
const expose = `
globalThis.__photoTest = {
  putProgressPhoto,
  getProgressPhoto,
  listProgressPhotos,
  deleteProgressPhoto,
  deleteProgressPhotosForOwner,
  migrateProgressPhotosToIndexedDb,
  reconcileProgressPhotoReferences,
  progressPhotoReference,
  progressPhotoIdFromReference,
  setUser(value) { currentUser = value; },
  setState(value) { state = value; },
  getState() { return state; },
  getSaveCount() { return __saveCount; }
};
`;

vm.createContext(sandbox);
vm.runInContext(prelude + source + expose, sandbox, { filename: 'metrics/photo-storage.js' });
const photos = sandbox.__photoTest;

(async () => {
  // More than the former localStorage-sized gallery can be represented without
  // putting image payloads in the main VFIT state.
  const tinyImage = 'data:image/jpeg;base64,' + 'A'.repeat(2048);
  for (let day = 0; day < 40; day += 1) {
    const date = new Date('2026-01-01T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + day);
    const dateKey = date.toISOString().slice(0, 10);
    for (const angle of ['front', 'side', 'back']) {
      const reference = await photos.putProgressPhoto(dateKey, angle, tinyImage);
      assert.ok(reference.startsWith('vfit-photo:'));
      assert.ok(!reference.includes('data:image'));
      assert.equal(await photos.getProgressPhoto(reference), tinyImage);
    }
  }
  assert.equal((await photos.listProgressPhotos()).length, 120);

  // Accounts are isolated and legacy inline images migrate only after a
  // successful IndexedDB write, with compact references left in state.
  photos.setUser({ uid: 'migration-user' });
  photos.setState({
    metricsDate: '2026-08-20',
    currentPhotos: {},
    metricsHistory: [{ date: '2026-08-20', photos: { front: tinyImage, side: tinyImage } }],
    meta: {}
  });
  assert.equal(await photos.migrateProgressPhotosToIndexedDb(), 2);
  const migrated = photos.getState().metricsHistory[0].photos;
  assert.ok(migrated.front.startsWith('vfit-photo:'));
  assert.ok(migrated.side.startsWith('vfit-photo:'));
  assert.equal(await photos.getProgressPhoto(migrated.front), tinyImage);
  assert.equal((await photos.listProgressPhotos()).length, 2);
  assert.equal(photos.getSaveCount(), 1);

  await photos.deleteProgressPhoto(migrated.front);
  assert.equal(await photos.getProgressPhoto(migrated.front), '');
  assert.equal(await photos.deleteProgressPhotosForOwner('migration-user'), 1);
  assert.equal((await photos.listProgressPhotos('migration-user')).length, 0);
  assert.equal((await photos.listProgressPhotos('capacity-user')).length, 120);

  // If the small app-state record loses its links, the durable gallery can
  // rebuild the date/angle entries instead of making saved photos disappear.
  photos.setUser({ uid: 'capacity-user' });
  photos.setState({ metricsDate: '2026-01-01', currentPhotos: {}, metricsHistory: [], meta: {} });
  assert.equal(await photos.reconcileProgressPhotoReferences(), true);
  assert.equal(photos.getState().metricsHistory.length, 40);
  assert.equal(Object.keys(photos.getState().metricsHistory[0].photos).length, 3);

  console.log('VFIT expanded photo-storage tests passed (120-photo gallery)');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
