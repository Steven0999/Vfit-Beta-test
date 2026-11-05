// Backup integrity checks run before any restore writes. They detect corruption,
// not authorship; only restore files you recognise.
let nativeBackupTransfer = null;
let backupOperationUid = null;

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
        if(file.size>250*1024*1024)throw new Error('Backup is larger than 250 MB');
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

async function saveNativeBackupFile(text,fileName,uid) {
    if(!window.vfitBackupExport?.postMessage)return false;
    if(nativeBackupTransfer)throw new Error('A backup export is already open');
    const bytes=new TextEncoder().encode(text);
    if(bytes.length>250*1024*1024)throw new Error('Backup is larger than 250 MB');
    const sha256=await backupSha256(bytes);requireBackupAccount(uid);
    const active={id:'backup-'+Date.now()+'-'+Math.random().toString(36).slice(2),uid,reject:null,resolve:null};nativeBackupTransfer=active;
    window.vfitBackupExport.onmessage=event=>{
        let message;try{message=JSON.parse(event.data);}catch(error){return;}
        if(nativeBackupTransfer!==active||message.requestId!==active.id||message.ownerUid!==uid)return;
        if(message.status==='error'||message.status==='cancelled')active.reject?.(new Error(message.message||'Backup export cancelled'));
        else active.resolve?.(message);
    };
    const send=(command,values={},timeout=60000)=>new Promise((resolve,reject)=>{
        requireBackupAccount(uid);
        const timer=setTimeout(()=>{active.reject=null;active.resolve=null;reject(new Error('Backup export timed out. Please try again.'));},timeout);
        const finish=callback=>value=>{clearTimeout(timer);active.reject=null;active.resolve=null;callback(value);};
        active.reject=finish(reject);active.resolve=finish(resolve);
        try{window.vfitBackupExport.postMessage(JSON.stringify({command,requestId:active.id,ownerUid:uid,...values}));}catch(error){active.reject(error);}
    });
    try{
        const ready=await send('start',{fileName,size:bytes.length,sha256},600000);if(ready.status!=='ready')throw new Error('Could not open the backup destination');
        let sequence=0;
        for(let offset=0;offset<bytes.length;offset+=49152){
            requireBackupAccount(uid);
            const data=btoa(String.fromCharCode(...bytes.subarray(offset,offset+49152)));
            const ack=await send('chunk',{sequence,data});if(ack.status!=='chunk'||ack.sequence!==sequence)throw new Error('Backup transfer was interrupted');sequence++;
        }
        const result=await send('finish',{sequence},120000);requireBackupAccount(uid);
        if(result.status!=='complete'||result.sha256!==sha256||result.size!==bytes.length)throw new Error('The saved backup could not be verified');
        return true;
    }finally{
        if(nativeBackupTransfer===active){try{window.vfitBackupExport.postMessage(JSON.stringify({command:'abort',requestId:active.id,ownerUid:uid}));}catch(error){}nativeBackupTransfer=null;}
    }
}
