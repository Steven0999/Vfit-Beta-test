'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fakeIndexedDb = require('./fake-indexeddb.cjs');

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
function accountDataWriteBlocked() { return false; }
async function flushCloudSync() {}
let comparePhotoType = 'front';
let __saveCount = 0;
`;

const source = fs.readFileSync(new URL('../metrics/photo-storage.js', `file://${__filename}`), 'utf8') + '\n' + fs.readFileSync(new URL('../core/backup-tools.js', `file://${__filename}`), 'utf8');
const expose = `
globalThis.__photoTest = {
  sealVfitBackup, inspectVfitBackup, checkVfitBackup, importVfitBackup, exportVfitBackup, saveNativeBackupFile, cancelNativeBackupExport,
  initialiseAutomaticBackups, changeAutomaticBackupFolder, runAutomaticBackup, resetAutomaticBackups,
  backupReceipt: () => automaticBackupSession,
  lastToast:()=>__lastToast,
  saveRecordedPhotos,
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
  photos.setUser({ uid: 'orphaned-photo' });
  photos.setState({ meta: {}, dailyMeals: [], workoutHistory: [], metricsHistory: [], currentPhotos: {} });
  const savedImage = 'data:image/jpeg;base64,QkJC';
  const orphaned = await photos.putProgressPhoto('2026-11-01', 'front', savedImage);
  await photos.importVfitBackup({ target: { files: [{ size: 1000, text: async () => JSON.stringify(sealed) }] } });
  assert.equal(await photos.getProgressPhoto(orphaned), savedImage, 'restore preserves a gallery photo without an existing state reference');
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

  // Automatic export needs a chosen folder and uses the full verified backup format.
  photos.setState(restoredState);
  restoredState.nutritionHistory = Array.from({ length: 501 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 10, 1 - index)).toISOString().slice(0, 10), calories: 2200
  }));
  let automaticStarts = 0;
  let corruptReadback = false;
  let pendingPicker;
  let pausePicker = false;
  sandbox.vfitBackupExport.postMessage = function (raw) {
    const message = JSON.parse(raw);
    const reply = result => queueMicrotask(() => this.onmessage({ data: JSON.stringify({
      requestId: message.requestId, ownerUid: message.ownerUid, ...result
    }) }));
    if (message.command === 'folderStatus') {
      reply({ status: 'folder', enabled: false, available: false });
    } else if (message.command === 'chooseFolder') {
      const picked = () => reply({ status: 'folder', enabled: true, available: true });
      if (pausePicker) pendingPicker = picked;
      else picked();
    } else if (message.command === 'start' && message.automatic) {
      assert.equal(message.ownerUid, 'restore-user');
      assert.match(message.fileName, /^vfit-backup-auto-/);
      automaticStarts++;
      goodPost.call(this, raw);
    } else if (message.command === 'finish' && corruptReadback) {
      reply({ status: 'complete', size: 1, sha256: 'wrong' });
    } else {
      goodPost.call(this, raw);
    }
  };
  await photos.initialiseAutomaticBackups();
  await photos.runAutomaticBackup();
  assert.equal(automaticStarts, 0, 'automatic copies require an explicit folder selection');
  await photos.changeAutomaticBackupFolder('chooseFolder');
  assert.equal(automaticStarts, 1);
  const automaticCopy = await photos.inspectVfitBackup(JSON.parse(Buffer.from(nativePayload, 'binary').toString()));
  assert.equal(automaticCopy.counts.diaryDays, 501);
  assert.equal(automaticCopy.counts.photos, 1);
  assert.equal(automaticCopy.imported.savedWorkouts[0].name, 'Shift plan');
  const previousVerification = photos.backupReceipt().verifiedAt;
  assert.ok(previousVerification > 0);
  corruptReadback = true;
  await photos.runAutomaticBackup();
  assert.equal(photos.backupReceipt().verifiedAt, previousVerification, 'failed verification cannot advance the last good receipt');
  assert.match(photos.backupReceipt().error, /could not be verified/);
  pausePicker = true;
  const picking = photos.changeAutomaticBackupFolder('chooseFolder');
  photos.resetAutomaticBackups();
  photos.setUser({ uid: 'different-backup-account' });
  pendingPicker();
  await picking;
  assert.equal(automaticStarts, 2, 'a late folder result cannot start a backup after switching accounts');

  // Interrupted migrations keep their inline original and can retry in the same session.
  photos.setUser({uid:'photo-retry'});photos.setState({metricsDate:'2026-11-05',currentPhotos:{},metricsHistory:[{date:'2026-11-05',photos:{front:tinyImage}}],meta:{}});
  indexedDB.failNextWrite=true;
  assert.equal(await photos.migrateProgressPhotosToIndexedDb(),0);assert.equal(photos.getState().metricsHistory[0].photos.front,tinyImage);
  assert.equal(await photos.migrateProgressPhotosToIndexedDb(),1);assert.equal(await photos.getProgressPhoto(photos.getState().metricsHistory[0].photos.front),tinyImage);

  // An asynchronous save or gallery read cannot attach one account's photos to another.
  const secondAccount={metricsDate:'2026-11-05',currentPhotos:{front:'second-account-draft'},metricsHistory:[],meta:{}};
  photos.setUser({uid:'photo-save-a'});photos.setState({metricsDate:'2026-11-05',currentPhotos:{front:tinyImage},metricsHistory:[],meta:{}});
  indexedDB.beforeWrite=(name)=>{if(name==='vfit-progress-photos'){indexedDB.beforeWrite=null;photos.setUser({uid:'photo-save-b'});photos.setState(secondAccount);}};
  await photos.saveRecordedPhotos();
  assert.equal(photos.getState(),secondAccount);assert.equal(secondAccount.currentPhotos.front,'second-account-draft');assert.equal(secondAccount.metricsHistory.length,0);
  assert.equal((await photos.listProgressPhotos('photo-save-b')).length,0);
  assert.equal((await photos.listProgressPhotos('photo-save-a')).length,1,'interrupted save stays under the original account');
  photos.setUser({uid:'capacity-user'});photos.setState({metricsHistory:[],meta:{}});
  indexedDB.beforeRead=name=>{if(name==='vfit-progress-photos'){indexedDB.beforeRead=null;photos.setUser({uid:'photo-save-b'});photos.setState(secondAccount);}};
  assert.equal(await photos.reconcileProgressPhotoReferences(),false);assert.equal(secondAccount.metricsHistory.length,0);
  console.log('VFIT photo storage and verified backup round-trip tests passed (120-photo gallery, native chunk transfer)');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
