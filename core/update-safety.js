// Keep a byte-for-byte account save before an update can migrate or rewrite it.
// This database is separate from the photo gallery; updates never recreate it.
const VFIT_UPDATE_DB = 'vfit-update-safety';
const VFIT_UPDATE_STORE = 'accountSaves';
const accountDataGuards = new Map();
const accountRecoveryNotices = new Map();
let updateSafetyDatabase = null;
let cloudReconciledUid = null;

function savedVersionParts(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(String(version || ''));
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Number.MAX_SAFE_INTEGER : Number(match[4])] : null;
}

function snapshotNeedsNewerApp(snapshot) {
    if (!isPlainRecord(snapshot)) return false;
    if (Number(snapshot.meta?.schemaVersion || snapshot.schemaVersion || 0) > VFIT_STATE_SCHEMA_VERSION) return true;
    const saved = savedVersionParts(snapshot.meta?.appVersion), current = savedVersionParts(VFIT_APP_VERSION);
    if (!saved || !current) return false;
    for (let index = 0; index < current.length; index++) {
        if (saved[index] !== current[index]) return saved[index] > current[index];
    }
    return false;
}

function accountDataWriteBlocked(uid) {
    return accountDataGuards.has(String(uid || currentUser?.uid || 'guest'));
}

function protectAccountData(uid, message) {
    accountDataGuards.set(String(uid || 'guest'), String(message || 'Your saved data needs recovery before this update can continue.'));
}

function parseAccountSave(raw) {
    if (!raw) return null;
    try { const parsed = JSON.parse(raw); return isPlainRecord(parsed) ? parsed : null; }
    catch (error) { return null; }
}

function accountOriginalSaves(uid) {
    const accountId = String(uid || 'guest');
    const primaryRaw = localStorage.getItem(stateStorageKey(accountId));
    const recoveryRaw = localStorage.getItem(recoveryStorageKey(accountId));
    const legacyOwner = localStorage.getItem(LEGACY_MIGRATION_KEY);
    const legacyRaw = !parseAccountSave(primaryRaw) && !parseAccountSave(recoveryRaw) && accountId !== 'guest' && (!legacyOwner || legacyOwner === accountId)
        ? localStorage.getItem(LEGACY_STATE_KEY) : null;
    return { primaryRaw, recoveryRaw, legacyRaw };
}

function openUpdateSafetyDatabase() {
    if (updateSafetyDatabase) return updateSafetyDatabase;
    updateSafetyDatabase = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('Recovery storage is unavailable on this device.')); return; }
        const request = indexedDB.open(VFIT_UPDATE_DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(VFIT_UPDATE_STORE)) {
                const store = db.createObjectStore(VFIT_UPDATE_STORE, { keyPath: 'id' });
                store.createIndex('owner', 'owner', { unique: false });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => { db.close(); updateSafetyDatabase = null; };
            resolve(db);
        };
        request.onerror = () => reject(request.error || new Error('Recovery storage could not open.'));
        request.onblocked = () => reject(new Error('Close other VFIT tabs and try again.'));
    }).catch(error => { updateSafetyDatabase = null; throw error; });
    return updateSafetyDatabase;
}

async function saveOriginalAccountCopy(uid, originals) {
    const owner = String(uid || 'guest');
    const checksum = await backupSha256(new TextEncoder().encode(JSON.stringify(originals)));
    const record = { id: owner + '|before|' + VFIT_APP_VERSION + '|' + checksum, owner, appVersion: VFIT_APP_VERSION,
        createdAt: new Date().toISOString(), originals, checksum };
    const db = await openUpdateSafetyDatabase();
    await new Promise((resolve, reject) => {
        let transaction;
        try { transaction = db.transaction(VFIT_UPDATE_STORE, 'readwrite', { durability: 'strict' }); }
        catch (error) { transaction = db.transaction(VFIT_UPDATE_STORE, 'readwrite'); }
        const store = transaction.objectStore(VFIT_UPDATE_STORE);
        const existing = store.get(record.id);
        existing.onsuccess = () => { if (!existing.result) store.add(record); };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('The recovery copy could not be saved.'));
        transaction.onabort = () => reject(transaction.error || new Error('The recovery copy was interrupted.'));
    });
    const saved = await new Promise((resolve,reject)=>{
        const request=db.transaction(VFIT_UPDATE_STORE,'readonly').objectStore(VFIT_UPDATE_STORE).get(record.id);
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    if (!saved || saved.checksum !== checksum || JSON.stringify(saved.originals) !== JSON.stringify(originals))
        throw new Error('The original recovery copy could not be verified. Your existing save has not been overwritten.');
}

async function originalAccountCopies(uid) {
    const owner = String(uid || 'guest'), db = await openUpdateSafetyDatabase();
    const records = await new Promise((resolve, reject) => {
        const request = db.transaction(VFIT_UPDATE_STORE, 'readonly').objectStore(VFIT_UPDATE_STORE).index('owner').getAll(owner);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('Recovery copies could not be read.'));
    });
    const valid = [];
    for (const record of records) {
        if (record.owner !== owner || !isPlainRecord(record.originals)) continue;
        const checksum = await backupSha256(new TextEncoder().encode(JSON.stringify(record.originals)));
        if (checksum === record.checksum) valid.push(record);
    }
    return valid.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function prepareAccountDataForUpdate(uid) {
    const owner = String(uid || 'guest');
    protectAccountData(owner, 'Protecting your saved information before updating.');
    try {
        const originals = accountOriginalSaves(owner);
        const candidates = [originals.primaryRaw, originals.recoveryRaw, originals.legacyRaw];
        const parsed = candidates.map(parseAccountSave);
        const newest = parsed.find(Boolean);
        const existing = candidates.some(raw => raw !== null && raw !== '');
        if (!existing || (parseAccountSave(originals.primaryRaw)?.meta?.appVersion === VFIT_APP_VERSION && !parsed.some(snapshotNeedsNewerApp))) {
            accountDataGuards.delete(owner); return true;
        }
        // Commit the untouched originals before any normalisation or fallback save.
        await saveOriginalAccountCopy(owner, originals);
        if (currentUser?.uid !== owner && !(owner === 'guest' && !currentUser)) return false;
        if (parsed.some(snapshotNeedsNewerApp)) throw new Error('Your saved data was written by a newer VFIT version. Open the latest version to continue.');
        if (!newest) {
            const copies = await originalAccountCopies(owner);
            const previous = copies.flatMap(copy => Object.values(copy.originals)).map(raw => ({raw, value:parseAccountSave(raw)}))
                .find(item => item.value && !snapshotNeedsNewerApp(item.value));
            if (!previous) throw new Error('The existing save could not be read. It has been kept unchanged for recovery.');
            if (currentUser?.uid !== owner && !(owner === 'guest' && !currentUser)) return false;
            localStorage.setItem(stateStorageKey(owner), previous.raw);
            accountRecoveryNotices.set(owner, 'Recovered an earlier saved copy. The original unreadable records have also been kept for recovery.');
        }
        accountDataGuards.delete(owner);
        return true;
    } catch (error) {
        protectAccountData(owner, error.message || 'A recovery copy could not be created. Your existing save has not been overwritten.');
        return false;
    }
}

function showAccountDataProtection(uid) {
    const screen = document.getElementById('data-protection-screen');
    if (!screen) return;
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('data-protection-message').textContent = accountDataGuards.get(String(uid)) || 'Your saved information needs attention before this update can continue.';
    screen.classList.remove('hidden');
}

// A recovery screen may still offer an additive backup restore. Never let
// data left in memory by a different account become part of that restore.
function loadProtectedAccountState(uid) {
    state = normalizeState(DEFAULT_STATE);
    try {
        const originals = accountOriginalSaves(uid);
        const candidates = [originals.primaryRaw, originals.recoveryRaw, originals.legacyRaw].map(parseAccountSave);
        if (candidates.some(snapshotNeedsNewerApp)) return;
        const readable = candidates.find(Boolean);
        if (readable) state = normalizeState(readable);
    } catch (error) {
        // Keep the device records untouched when storage itself cannot be read.
    }
}

function hideAccountDataProtection() {
    document.getElementById('data-protection-screen')?.classList.add('hidden');
}

async function exportOriginalRecoveryData() {
    const uid = currentUser?.uid || 'guest';
    try {
        const originals = accountOriginalSaves(uid);
        let recoveryCopies = [];
        try { recoveryCopies = await originalAccountCopies(uid); } catch (error) {}
        let photos = [], photosReadable = true;
        try { photos = (await listProgressPhotos(uid)).map(({date,angle,data,updatedAt})=>({date,angle,data,updatedAt})); }
        catch (error) { photosReadable = false; }
        if ((currentUser?.uid || 'guest') !== uid) return;
        const text = JSON.stringify({app:'VFIT recovery',exportedAt:new Date().toISOString(),originals,recoveryCopies,progressPhotos:photos,photosReadable});
        const fileName = 'vfit-backup-recovery-' + localDateKey() + '.json';
        if (await saveNativeBackupFile(text,fileName,uid === 'guest' ? '' : uid)) { showToast(photosReadable ? 'Original recovery data saved and verified' : 'Recovery records saved; the photo gallery could not be read',7000); return; }
        const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
        const link = document.createElement('a');link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        showToast(photosReadable ? 'Recovery download started — keep this file private' : 'Recovery download started; photos could not be read',7000);
    } catch (error) { showToast(error.message || 'Recovery data could not be exported',7000); }
}

function retryProtectedUpdate() { window.location.reload(); }

// Called only by the existing explicitly confirmed account-deletion flow.
async function deleteUpdateSafetyCopies(uid) {
    const owner=String(uid||'guest'),db=await openUpdateSafetyDatabase();
    const records=await new Promise((resolve,reject)=>{
        const request=db.transaction(VFIT_UPDATE_STORE,'readonly').objectStore(VFIT_UPDATE_STORE).index('owner').getAll(owner);
        request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
        const transaction=db.transaction(VFIT_UPDATE_STORE,'readwrite'),store=transaction.objectStore(VFIT_UPDATE_STORE);
        records.filter(record=>record.owner===owner).forEach(record=>store.delete(record.id));
        transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });
}

function showAccountRecoveryNotice(uid) {
    const note=accountRecoveryNotices.get(uid);
    if(note){accountRecoveryNotices.delete(uid);showToast(note,8000);}
}

function assertAccountRestoreCompatible(uid) {
    const originals = accountOriginalSaves(uid);
    if ([originals.primaryRaw, originals.recoveryRaw, originals.legacyRaw].map(parseAccountSave).some(snapshotNeedsNewerApp))
        throw new Error('This device has data from a newer VFIT version. Update VFIT before restoring a backup.');
}
