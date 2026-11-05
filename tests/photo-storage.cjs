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
  TextEncoder, TextDecoder, Uint8Array, crypto:require('node:crypto').webcrypto,
  btoa:value=>Buffer.from(value,'binary').toString('base64'),
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
  location:{reload(){}},
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
let __lastToast = ''; function showToast(message) { __lastToast = message; }
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

const source = fs.readFileSync(new URL('../metrics/photo-storage.js', `file://${__filename}`), 'utf8') + '\n' + fs.readFileSync(new URL('../core/backup-tools.js', `file://${__filename}`), 'utf8');
const expose = `
globalThis.__photoTest = {
  sealVfitBackup, inspectVfitBackup, checkVfitBackup, importVfitBackup, exportVfitBackup, saveNativeBackupFile, cancelNativeBackupExport,
  lastToast:()=>__lastToast,
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

  // Full verified export -> inspect -> additive restore onto a different account.
  const fullState={meta:{},currentPhotos:{},dailyMeals:[{id:'food',date:'2026-11-01',name:'Oats',calories:228}],nutritionHistory:[],
    metricsHistory:[{date:'2026-11-01',weight:80,photos:{front:await photos.putProgressPhoto('2026-11-01','front',tinyImage)}}],
    workoutHistory:[{id:'workout',date:'2026-11-01',savedWorkoutId:'plan',exercises:[{name:'Bench Press',sets:[{completed:true,setType:'working',reps:12,weight:50}]}]}],
    savedWorkouts:[{id:'plan',name:'Shift plan',exercises:[{name:'Bench Press',sets:[{setType:'warmup'},{setType:'working'}],settings:{repMax:12,restSeconds:90}}]}],
    workoutRotation:{planIds:['plan'],updatedAt:'2026-11-01T10:00:00Z'},exercisePreferences:{'gym|Bench Press':{notes:'Seat 4'}},weeklyTrainingPlans:{'2026-11-02':{counts:{plan:2}}},
    metricAnnotations:[{id:'note',date:'2026-11-01',text:'Night shift',metric:'all'}],metricTargets:{weight:{value:75}},metricChartPreferences:{showTrend:true},
    nutritionDayTemplates:[{id:'night',name:'Night shift',entries:[{food:{name:'Oats',amount:60,amountType:'grams'},offsetMinutes:60}]}]};
  photos.setState(fullState);
  const records=(await photos.listProgressPhotos()).filter(item=>item.date==='2026-11-01');
  const sealed=await photos.sealVfitBackup({app:'VFIT',appVersion:'beta.53',state:fullState,progressPhotos:records.map(({date,angle,data})=>({date,angle,data}))});
  const checked=await photos.inspectVfitBackup(JSON.parse(JSON.stringify(sealed)));
  assert.equal(checked.verified,true);assert.equal(checked.counts.photos,1);assert.equal(checked.counts.plans,1);
  const corrupt=JSON.parse(JSON.stringify(sealed));corrupt.state.workoutHistory[0].exercises[0].sets[0].weight=500;
  await assert.rejects(photos.inspectVfitBackup(corrupt),/checksum failed/);
  const missing=JSON.parse(JSON.stringify(sealed));missing.progressPhotos=[];
  await assert.rejects(photos.inspectVfitBackup(await photos.sealVfitBackup(missing)),/photo is missing/);
  await assert.rejects(photos.inspectVfitBackup({app:'VFIT',state:{workoutHistory:'bad'}}),/No VFIT/);
  assert.equal((await photos.inspectVfitBackup(fullState)).verified,false,'legacy backups remain readable');
  photos.setUser({uid:'restore-user',email:'tester@example.com'});photos.setState({meta:{},dailyMeals:[],workoutHistory:[],metricsHistory:[],currentPhotos:{}});
  const beforeCheck=photos.getSaveCount();
  await photos.checkVfitBackup({target:{files:[{size:1000,text:async()=>JSON.stringify(sealed)}],value:'test'}});
  assert.equal(photos.getSaveCount(),beforeCheck,'Check Backup is a dry run');assert.equal((await photos.listProgressPhotos()).length,0);
  await photos.importVfitBackup({target:{files:[{size:1000,text:async()=>JSON.stringify(corrupt)}],value:'test'}});
  assert.equal(photos.getSaveCount(),beforeCheck,'corrupt backup performs no state writes');assert.equal((await photos.listProgressPhotos()).length,0,'corrupt backup performs no photo writes');
  await photos.importVfitBackup({target:{files:[{size:1000,text:async()=>JSON.stringify(sealed)}],value:'test'}});
  const restoredState=photos.getState();
  assert.equal(restoredState.savedWorkouts[0].exercises[0].settings.restSeconds,90);
  assert.equal(restoredState.workoutHistory[0].exercises[0].sets[0].completed,true);
  assert.equal(restoredState.workoutRotation.planIds[0],'plan');assert.equal(restoredState.exercisePreferences['gym|Bench Press'].notes,'Seat 4');
  assert.equal(restoredState.weeklyTrainingPlans['2026-11-02'].counts.plan,2);assert.equal(restoredState.metricAnnotations[0].text,'Night shift');assert.equal(restoredState.metricTargets.weight.value,75);
  assert.equal(restoredState.nutritionDayTemplates[0].entries[0].offsetMinutes,60);assert.equal(restoredState.dailyMeals[0].calories,228);
  const restoredReference=restoredState.metricsHistory[0].photos.front;
  assert.ok(restoredReference.includes('restore-user'),'photos are rekeyed for the restoring account');assert.equal(await photos.getProgressPhoto(restoredReference),tinyImage);
  // An account change during file reading must never restore into the new account.
  const beforeSwitch=photos.getSaveCount();
  await photos.importVfitBackup({target:{files:[{size:1000,text:async()=>{photos.setUser({uid:'changed-account'});return JSON.stringify(sealed);}}],value:'test'}});
  assert.equal(photos.getSaveCount(),beforeSwitch);assert.equal((await photos.listProgressPhotos()).length,0);

  // The Android bridge streams sequential chunks and requires a matching readback hash.
  photos.setUser({uid:'restore-user'});
  const commands=[];let nativePayload='';
  sandbox.vfitBackupExport={postMessage(raw){
    const message=JSON.parse(raw);commands.push(message.command);
    let result={requestId:message.requestId,ownerUid:message.ownerUid};
    if(message.command==='start'){nativePayload='';result.status='ready';}
    else if(message.command==='chunk'){nativePayload+=Buffer.from(message.data,'base64').toString('binary');result={...result,status:'chunk',sequence:message.sequence};}
    else if(message.command==='finish'){result={...result,status:'complete',size:Buffer.from(nativePayload,'binary').length,sha256:require('node:crypto').createHash('sha256').update(Buffer.from(nativePayload,'binary')).digest('hex')};}
    else return;
    queueMicrotask(()=>sandbox.vfitBackupExport.onmessage({data:JSON.stringify(result)}));
  }};
  assert.equal(await photos.saveNativeBackupFile('x'.repeat(120000),'vfit-backup-test.json','restore-user'),true);
  assert.equal(commands.filter(command=>command==='chunk').length,3);
  assert.equal(Buffer.from(nativePayload,'binary').toString(),'x'.repeat(120000));
  const goodPost=sandbox.vfitBackupExport.postMessage;
  sandbox.vfitBackupExport.postMessage=function(raw){const message=JSON.parse(raw);if(message.command==='finish'){queueMicrotask(()=>this.onmessage({data:JSON.stringify({requestId:message.requestId,ownerUid:message.ownerUid,status:'complete',sha256:'wrong',size:1})}));}else goodPost.call(this,raw);};
  await assert.rejects(photos.saveNativeBackupFile('test','vfit-backup-test.json','restore-user'),/could not be verified/);
  console.log('VFIT photo storage and verified backup round-trip tests passed (120-photo gallery, native chunk transfer)');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
