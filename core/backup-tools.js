// Backup integrity checks run before any restore writes. They detect corruption,
// not authorship; only restore files you recognise.
let nativeBackupTransfer = null;
let backupOperationUid = null;
const MAX_VFIT_BACKUP_BYTES = 250 * 1024 * 1024;

function backupCanonicalJSON(value) {
    if (Array.isArray(value)) return '[' + value.map(backupCanonicalJSON).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+backupCanonicalJSON(value[key])).join(',') + '}';
    return JSON.stringify(value);
}

async function backupSha256(bytes) {
    if (!globalThis.crypto?.subtle) throw new Error('Backup verification is unavailable here. Open VFIT in its installed app or a secure browser.');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function sealVfitBackup(payload) {
    const snapshot=JSON.parse(JSON.stringify(payload));delete snapshot.integrity;
    const sha256=await backupSha256(new TextEncoder().encode(backupCanonicalJSON(snapshot)));
    return {...snapshot,integrity:{algorithm:'SHA-256',sha256}};
}

function requireBackupAccount(uid) {
    if (uid!==(currentUser&&currentUser.uid||'')) throw new Error('Account changed. Reopen the backup for this account.');
}

async function inspectVfitBackup(parsed) {
    if(!isPlainRecord(parsed))throw new Error('This is not a VFIT backup');
    const wrapped=isPlainRecord(parsed.state), imported=wrapped?parsed.state:parsed;
    if(wrapped&&parsed.app&&parsed.app!=='VFIT')throw new Error('This backup belongs to another app');
    const fields=['dailyMeals','workoutHistory','nutritionHistory','metricsHistory','savedWorkouts'];
    if(typeof snapshotNeedsNewerApp==='function'&&(snapshotNeedsNewerApp(imported)||(wrapped&&snapshotNeedsNewerApp({meta:{schemaVersion:parsed.schemaVersion,appVersion:parsed.appVersion}}))))throw new Error('This backup needs a newer VFIT version. Nothing was restored.');
    if(!fields.some(key=>Array.isArray(imported[key])))throw new Error('No VFIT diary, workout or metrics data found');
    for(const key of [...fields,'nutritionDayTemplates','metricAnnotations','customExercises']){
        if(imported[key]!==undefined&&!Array.isArray(imported[key]))throw new Error('Invalid backup data: '+key);
    }
    let verified=false;
    if(parsed.integrity!==undefined){
        if(!isPlainRecord(parsed.integrity)||parsed.integrity.algorithm!=='SHA-256'||!/^[a-f0-9]{64}$/.test(String(parsed.integrity.sha256)))throw new Error('Invalid backup checksum');
        const content={...parsed};delete content.integrity;
        const actual=await backupSha256(new TextEncoder().encode(backupCanonicalJSON(content)));
        if(actual!==parsed.integrity.sha256)throw new Error('Backup checksum failed. The file has changed or is incomplete. Nothing was restored.');
        verified=true;
    }
    if(parsed.progressPhotos!==undefined&&!Array.isArray(parsed.progressPhotos))throw new Error('Invalid progress photo data');
    const photos=parsed.progressPhotos||[],keys=new Set();
    for(const photo of photos){
        const date=String(photo?.date||''),parsedDate=new Date(date+'T12:00:00Z');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date||!['front','side','back'].includes(photo.angle)||typeof photo.data!=='string'||!/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/\r\n]+=*$/.test(photo.data))throw new Error('A progress photo is invalid or incomplete');
        const key=date+'|'+photo.angle;if(keys.has(key))throw new Error('Duplicate progress photos in backup');keys.add(key);
    }
    if(verified){
        for(const metric of imported.metricsHistory||[])for(const [angle,value] of Object.entries(metric?.photos||{})){
            if(String(value).startsWith('vfit-photo:')&&!keys.has(metric.date+'|'+angle))throw new Error('A referenced progress photo is missing from the backup');
        }
    }
    return {imported,photos,verified,counts:{workouts:(imported.workoutHistory||[]).length,plans:(imported.savedWorkouts||[]).length,diaryFoods:(imported.dailyMeals||[]).length,diaryDays:(imported.nutritionHistory||[]).length,metrics:(imported.metricsHistory||[]).length,photos:photos.length,templates:(imported.nutritionDayTemplates||[]).length}};
}

function backupCheckSummary(check) {
    const c=check.counts;
    return `${check.verified?'Checksum verified':'Legacy file: no checksum'} · ${c.workouts} workouts · ${c.plans} saved plans · ${c.diaryFoods} active diary foods + ${c.diaryDays} archived days · ${c.metrics} metric entries · ${c.photos} progress photos · ${c.templates} day templates`;
}

async function checkVfitBackup(event) {
    const input=event?.target,file=input?.files?.[0],uid=currentUser&&currentUser.uid||'';if(!file)return;
    try{
        if(file.size>MAX_VFIT_BACKUP_BYTES)throw new Error('Backup is larger than 250 MB');
        const check=await inspectVfitBackup(JSON.parse(await file.text()));requireBackupAccount(uid);
        const summary=backupCheckSummary(check);
        const status=document.getElementById('backup-verification-status');if(status)status.textContent=summary+'. Check only: no data was changed.';
        showToast(check.verified?'Backup checked successfully — no data changed':'Legacy backup is readable; no checksum is available',6500);
    }catch(error){showToast(error.message||'Could not check backup',7000);const status=document.getElementById('backup-verification-status');if(status)status.textContent=error.message;}
    finally{if(input)input.value='';}
}

function cancelNativeBackupExport() {
    const active=nativeBackupTransfer;
    if(!active)return;
    try{window.vfitBackupExport?.postMessage(JSON.stringify({command:'abort',requestId:active.id,ownerUid:active.uid}));}catch(error){}
    active.reject?.(new Error('Backup export cancelled'));nativeBackupTransfer=null;
}

async function withNativeBackupChannel(uid, work) {
    if (nativeBackupTransfer) throw new Error('A backup operation is already open');
    requireBackupAccount(uid);
    const bridge = window.vfitBackupExport;
    const active = { id: 'backup-' + Date.now() + '-' + Math.random().toString(36).slice(2), uid };
    nativeBackupTransfer = active;
    bridge.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        if (nativeBackupTransfer !== active || message.requestId !== active.id || message.ownerUid !== uid) return;
        if (message.status === 'error' || message.status === 'cancelled') {
            active.reject?.(new Error(message.message || 'Backup operation cancelled'));
        } else {
            active.resolve?.(message);
        }
    };
    const send = (command, values = {}, timeout = 60000) => new Promise((resolve, reject) => {
        if (nativeBackupTransfer !== active) throw new Error('Backup operation cancelled');
        requireBackupAccount(uid);
        const finish = callback => value => {
            clearTimeout(timer);
            active.reject = null;
            active.resolve = null;
            callback(value);
        };
        const timer = setTimeout(() => active.reject?.(new Error('Backup operation timed out')), timeout);
        active.reject = finish(reject);
        active.resolve = finish(resolve);
        try { bridge.postMessage(JSON.stringify({ command, requestId: active.id, ownerUid: uid, ...values })); }
        catch (error) { active.reject(error); }
    });
    try {
        const result = await work(send);
        requireBackupAccount(uid);
        return result;
    } finally {
        if (nativeBackupTransfer === active) {
            try { bridge.postMessage(JSON.stringify({ command: 'abort', requestId: active.id, ownerUid: uid })); }
            catch (error) { /* The page or picker has already closed. */ }
            nativeBackupTransfer = null;
        }
    }
}

async function saveNativeBackupFile(text, fileName, uid, options = {}) {
    if (!window.vfitBackupExport?.postMessage) return false;
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_VFIT_BACKUP_BYTES) throw new Error('Backup is larger than 250 MB');
    const sha256 = await backupSha256(bytes);
    return withNativeBackupChannel(uid, async send => {
        const ready = await send('start', { fileName, size: bytes.length, sha256, ...options }, 600000);
        if (ready.status !== 'ready') throw new Error('Could not open the backup destination');
        let sequence = 0;
        for (let offset = 0; offset < bytes.length; offset += 49152) {
            const data = btoa(String.fromCharCode(...bytes.subarray(offset, offset + 49152)));
            const ack = await send('chunk', { sequence, data });
            if (ack.status !== 'chunk' || ack.sequence !== sequence) throw new Error('Backup transfer was interrupted');
            sequence++;
        }
        const result = await send('finish', { sequence }, 120000);
        if (result.status !== 'complete' || result.sha256 !== sha256 || result.size !== bytes.length) {
            throw new Error('The saved backup could not be verified');
        }
        return options.automatic ? result : true;
    });
}

async function buildVfitBackup(uid) {
    requireBackupAccount(uid);
    const snapshot = JSON.parse(JSON.stringify(state));
    const records = await listProgressPhotos(uid || 'guest');
    requireBackupAccount(uid);
    const sealed = await sealVfitBackup({
        app: 'VFIT',
        appVersion: VFIT_APP_VERSION,
        schemaVersion: VFIT_STATE_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        accountEmail: currentUser?.email || '',
        state: snapshot,
        progressPhotos: records.map(({ date, angle, data, updatedAt }) => ({ date, angle, data, updatedAt }))
    });
    const check = await inspectVfitBackup(sealed);
    requireBackupAccount(uid);
    const text = JSON.stringify(sealed);
    if (new Blob([text]).size > MAX_VFIT_BACKUP_BYTES) throw new Error('Backup is larger than 250 MB');
    return { text, photoCount: check.counts.photos };
}

let automaticBackupSession = null;
let automaticBackupTimer = null;
const BACKUP_SETTLE_MS = 10000;
const BACKUP_MIN_INTERVAL_MS = 60000;

function backupRevision() {
    return `${VFIT_APP_VERSION}:${state.meta?.updatedAt || ''}`;
}

function renderAutomaticBackupStatus() {
    const panel = document.getElementById('automatic-backup-panel');
    if (!panel) return;
    const session = automaticBackupSession;
    panel.classList.toggle('hidden', !session?.ready);
    if (!session?.ready) return;
    const enabled = session.enabled && session.available;
    const status = document.getElementById('automatic-backup-status');
    const lastCopy = session.verifiedAt ? `Last verified copy ${new Date(session.verifiedAt).toLocaleString()}.` : '';
    status.textContent = session.busy ? 'Preparing backup…' : session.error ? `${session.error} ${lastCopy}`.trim()
        : session.enabled && !session.available ? 'Choose your backup folder again to restore access.'
        : enabled ? lastCopy || 'Folder selected. Waiting for the first verified copy.' : 'Choose a private folder to turn on automatic backups.';
    document.getElementById('automatic-backup-choose').disabled = session.busy;
    const backUp = document.getElementById('automatic-backup-now');
    backUp.disabled = session.busy;
    backUp.classList.toggle('hidden', !enabled);
    const disable = document.getElementById('automatic-backup-disable');
    disable.disabled = session.busy;
    disable.classList.toggle('hidden', !session.enabled);
}

function resetAutomaticBackups() {
    clearTimeout(automaticBackupTimer);
    automaticBackupTimer = null;
    automaticBackupSession = null;
    cancelNativeBackupExport();
    renderAutomaticBackupStatus();
}

function applyBackupFolderStatus(session, result) {
    if (result.status !== 'folder') throw new Error('Backup folder status is unavailable');
    session.ready = true;
    session.enabled = result.enabled === true;
    session.available = result.available === true;
    session.verifiedAt = Number(result.verifiedAt) || 0;
    session.revision = String(result.revision || '');
}

async function initialiseAutomaticBackups() {
    const uid = currentUser?.uid;
    if (!uid || !window.vfitBackupExport?.postMessage) return;
    const session = { uid, ready: false, busy: false, error: '' };
    automaticBackupSession = session;
    try {
        const result = await withNativeBackupChannel(uid, send => send('folderStatus', {}, 5000));
        if (automaticBackupSession !== session) return;
        applyBackupFolderStatus(session, result);
        scheduleAutomaticBackup(uid);
    } catch (error) {
        // Older Android bridges still support the normal Export Backup button.
        if (automaticBackupSession === session) automaticBackupSession = null;
    }
    renderAutomaticBackupStatus();
}

function scheduleAutomaticBackup(uid = currentUser?.uid) {
    const session = automaticBackupSession;
    if (!session?.available || session.uid !== uid || session.busy || document.visibilityState === 'hidden') return;
    if (session.revision === backupRevision() || automaticBackupTimer !== null) return;
    const delay = Math.max(BACKUP_SETTLE_MS, session.verifiedAt + BACKUP_MIN_INTERVAL_MS - Date.now());
    automaticBackupTimer = setTimeout(() => {
        automaticBackupTimer = null;
        runAutomaticBackup(false);
    }, delay);
}

async function runAutomaticBackup(force = true) {
    const session = automaticBackupSession;
    if (!session?.available || session.uid !== currentUser?.uid || session.busy || document.visibilityState === 'hidden') return;
    if (accountDataWriteBlocked(session.uid) || (!force && session.revision === backupRevision())) return;
    if (backupOperationUid !== null || nativeBackupTransfer) {
        if (!force) scheduleAutomaticBackup(session.uid);
        else showToast('Finish the current backup operation first');
        return;
    }
    clearTimeout(automaticBackupTimer);
    automaticBackupTimer = null;
    const revision = backupRevision();
    session.busy = true;
    session.error = '';
    backupOperationUid = session.uid;
    renderAutomaticBackupStatus();
    let verified = false;
    try {
        const backup = await buildVfitBackup(session.uid);
        if (automaticBackupSession !== session) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `vfit-backup-auto-${timestamp}-${Math.random().toString(36).slice(2, 8)}.json`;
        const result = await saveNativeBackupFile(backup.text, fileName, session.uid, { automatic: true, revision });
        if (automaticBackupSession !== session) return;
        if (!result) throw new Error('The backup folder is unavailable');
        session.verifiedAt = Number(result.verifiedAt) || Date.now();
        session.revision = revision;
        verified = true;
        if (force) showToast('Backup saved and verified', 6500);
    } catch (error) {
        if (automaticBackupSession === session) {
            session.error = error.message || 'Could not verify the automatic backup';
            if (force) showToast(session.error, 6500);
        }
    } finally {
        backupOperationUid = null;
        session.busy = false;
        renderAutomaticBackupStatus();
        if (verified && automaticBackupSession === session) scheduleAutomaticBackup(session.uid);
    }
}

async function changeAutomaticBackupFolder(command) {
    const session = automaticBackupSession;
    if (!session?.ready || session.uid !== currentUser?.uid || session.busy) return;
    if (backupOperationUid !== null || nativeBackupTransfer) { showToast('Finish the current backup operation first'); return; }
    clearTimeout(automaticBackupTimer);
    automaticBackupTimer = null;
    session.busy = true;
    session.error = '';
    renderAutomaticBackupStatus();
    let configured = false;
    try {
        const result = await withNativeBackupChannel(session.uid, send => send(command, {}, 600000));
        if (automaticBackupSession !== session) return;
        applyBackupFolderStatus(session, result);
        configured = command === 'chooseFolder' && session.available;
    } catch (error) {
        if (automaticBackupSession === session) showToast(error.message, 6500);
    } finally {
        session.busy = false;
        renderAutomaticBackupStatus();
    }
    if (configured && automaticBackupSession === session) await runAutomaticBackup(true);
    else if (automaticBackupSession === session) scheduleAutomaticBackup(session.uid);
}

function mergeVfitBackupState(local, imported) {
    const merged = mergeStateSnapshots(local, imported);
    if ((Date.parse(imported.meta?.updatedAt) || 0) <= (Date.parse(local.meta?.updatedAt) || 0)) {
        merged.mealWakeTimes = Object.assign({}, imported.mealWakeTimes, local.mealWakeTimes);
    }
    const localPhotos = new Map((local.metricsHistory || []).map(entry => [entry.date, entry.photos]));
    const importedPhotos = new Map((imported.metricsHistory || []).map(entry => [entry.date, entry.photos]));
    for (const entry of merged.metricsHistory || []) {
        const incoming = importedPhotos.get(entry.date);
        if (incoming) entry.photos = Object.assign({}, incoming, entry.photos, localPhotos.get(entry.date));
    }
    return merged;
}

const saveStateBeforeAutomaticBackups = saveState;
saveState = function saveStateWithAutomaticBackup(options) {
    const saved = saveStateBeforeAutomaticBackups(options);
    if (saved && !options?.preserveUpdatedAt) scheduleAutomaticBackup(options?.uid || currentUser?.uid);
    return saved;
};

// Keep cloud sync a copy of the complete eligible history. If it does not fit,
// preserve the previous cloud copy and leave the full file backup available.
if (typeof buildCloudSnapshot === 'function') {
    buildCloudSnapshot = function buildCompleteCloudSnapshot() {
        const snapshot = stateWithoutLocalImages(normalizeState(state));
        if (new Blob([JSON.stringify(snapshot)]).size > 950000) {
            const error = new Error('This save is too large for cloud sync. Use a full backup for your history and photos.');
            error.code = 'vfit/snapshot-too-large';
            error.owner = currentUser?.uid;
            error.revision = backupRevision();
            throw error;
        }
        return snapshot;
    };

    const scheduleSync = scheduleCloudSnapshotSync;
    scheduleCloudSnapshotSync = function scheduleCloudSyncForCurrentSave(delay) {
        if (cloudSyncError?.code === 'vfit/snapshot-too-large' && cloudSyncError.owner === currentUser?.uid &&
            cloudSyncError.revision === backupRevision()) return;
        scheduleSync(delay);
    };

    const renderSyncStatus = updateDataSyncStatus;
    updateDataSyncStatus = function renderBackupAwareSyncStatus() {
        renderSyncStatus();
        if (cloudSyncError?.code === 'vfit/snapshot-too-large' && cloudSyncError.owner === currentUser?.uid &&
            state.privacySettings?.cloudHealthData !== false && navigator.onLine && !cloudSyncPromise) {
            const status = document.getElementById('data-sync-status');
            if (status) status.textContent = cloudSyncError.message;
        }
    };
}
