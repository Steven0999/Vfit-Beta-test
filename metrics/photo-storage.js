    // ========================================================================
    // DURABLE PROGRESS PHOTO STORAGE
    // ========================================================================
    // Photos are deliberately kept off the health-data cloud. IndexedDB gives
    // an installed Android PWA substantially more room than localStorage while
    // the small vfit-photo:* references keep the main state reliable.
    const VFIT_PHOTO_DB_NAME = 'vfit-progress-photos';
    const VFIT_PHOTO_DB_VERSION = 1;
    const VFIT_PHOTO_STORE = 'photos';
    const VFIT_PHOTO_REF_PREFIX = 'vfit-photo:';
    let progressPhotoDbPromise = null;
    const progressPhotoMigrations = new Map();

    function progressPhotoOwner() {
        return currentUser && currentUser.uid ? currentUser.uid : 'guest';
    }

    function progressPhotoRecordId(dateKey, angle, owner) {
        return `${encodeURIComponent(owner || progressPhotoOwner())}|${dateKey}|${angle}`;
    }

    function progressPhotoReference(dateKey, angle, owner) {
        return VFIT_PHOTO_REF_PREFIX + progressPhotoRecordId(dateKey, angle, owner);
    }

    function progressPhotoIdFromReference(reference) {
        const value = String(reference || '');
        return value.startsWith(VFIT_PHOTO_REF_PREFIX) ? value.slice(VFIT_PHOTO_REF_PREFIX.length) : '';
    }

    function inlinePhotoBytes(value) {
        const data = String(value || '');
        const comma = data.indexOf(',');
        return comma >= 0 ? Math.ceil((data.length - comma - 1) * 0.75) : data.length;
    }

    function openProgressPhotoDatabase() {
        if (progressPhotoDbPromise) return progressPhotoDbPromise;
        progressPhotoDbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('Expanded photo storage is unavailable in this browser'));
                return;
            }
            const request = window.indexedDB.open(VFIT_PHOTO_DB_NAME, VFIT_PHOTO_DB_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(VFIT_PHOTO_STORE)) {
                    const store = database.createObjectStore(VFIT_PHOTO_STORE, { keyPath: 'id' });
                    store.createIndex('owner', 'owner', { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                progressPhotoDbPromise = null;
                reject(request.error || new Error('Could not open expanded photo storage'));
            };
            request.onblocked = () => {
                progressPhotoDbPromise = null;
                reject(new Error('Close other VFIT tabs, then try saving the photos again'));
            };
        });
        return progressPhotoDbPromise;
    }

    async function putProgressPhoto(dateKey, angle, data, owner) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) throw new Error('Photo date is invalid');
        if (!['front', 'side', 'back'].includes(angle)) throw new Error('Photo angle is invalid');
        if (typeof data !== 'string' || !data.startsWith('data:image/')) throw new Error('Photo data is invalid');
        const accountId = owner || progressPhotoOwner();
        const database = await openProgressPhotoDatabase();
        const record = {
            id: progressPhotoRecordId(dateKey, angle, accountId),
            owner: accountId,
            date: dateKey,
            angle,
            data,
            bytes: inlinePhotoBytes(data),
            updatedAt: new Date().toISOString()
        };
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(VFIT_PHOTO_STORE, 'readwrite');
            transaction.objectStore(VFIT_PHOTO_STORE).put(record);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Photo could not be stored'));
            transaction.onabort = () => reject(transaction.error || new Error('Photo storage was interrupted'));
        });
        return progressPhotoReference(dateKey, angle, accountId);
    }

    async function getProgressPhoto(reference) {
        if (typeof reference === 'string' && reference.startsWith('data:image/')) return reference;
        const id = progressPhotoIdFromReference(reference);
        if (!id) return '';
        const database = await openProgressPhotoDatabase();
        return new Promise((resolve, reject) => {
            const request = database.transaction(VFIT_PHOTO_STORE, 'readonly')
                .objectStore(VFIT_PHOTO_STORE).get(id);
            request.onsuccess = () => resolve(request.result && request.result.data || '');
            request.onerror = () => reject(request.error || new Error('Photo could not be loaded'));
        });
    }

    async function deleteProgressPhoto(reference) {
        const id = progressPhotoIdFromReference(reference);
        if (!id) return false;
        const database = await openProgressPhotoDatabase();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(VFIT_PHOTO_STORE, 'readwrite');
            transaction.objectStore(VFIT_PHOTO_STORE).delete(id);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Photo could not be removed'));
        });
        return true;
    }

    async function listProgressPhotos(owner) {
        const accountId = owner || progressPhotoOwner();
        const database = await openProgressPhotoDatabase();
        return new Promise((resolve, reject) => {
            const store = database.transaction(VFIT_PHOTO_STORE, 'readonly').objectStore(VFIT_PHOTO_STORE);
            const request = store.index('owner').getAll(accountId);
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error || new Error('Photo gallery could not be read'));
        });
    }

    async function deleteProgressPhotosForOwner(owner) {
        const records = await listProgressPhotos(owner);
        if (!records.length) return 0;
        const database = await openProgressPhotoDatabase();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(VFIT_PHOTO_STORE, 'readwrite');
            const store = transaction.objectStore(VFIT_PHOTO_STORE);
            records.forEach(record => store.delete(record.id));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Local photos could not be removed'));
        });
        return records.length;
    }

    async function migrateProgressPhotosToIndexedDb() {
        const owner = progressPhotoOwner();
        if (progressPhotoMigrations.has(owner)) return progressPhotoMigrations.get(owner);
        const migration = (async () => {
            let migrated = 0;
            let changed = false;
            for (const metric of state.metricsHistory || []) {
                if (!metric || !metric.date || !isPlainRecord(metric.photos)) continue;
                for (const angle of ['front', 'side', 'back']) {
                    const value = metric.photos[angle];
                    if (typeof value !== 'string' || !value.startsWith('data:image/')) continue;
                    try {
                        metric.photos[angle] = await putProgressPhoto(metric.date, angle, value, owner);
                        migrated += 1;
                        changed = true;
                    } catch (error) {
                        console.warn('A legacy progress photo could not be migrated:', error);
                        // Keep the original inline photo. Never delete it on a failed migration.
                    }
                }
            }
            if (changed) saveState({ skipCloud: true, forceBackup: true });
            return migrated;
        })();
        progressPhotoMigrations.set(owner, migration);
        try {
            return await migration;
        } catch (error) {
            progressPhotoMigrations.delete(owner);
            throw error;
        }
    }

    async function reconcileProgressPhotoReferences() {
        const records = await listProgressPhotos();
        let changed = false;
        records.forEach(record => {
            if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')) || !['front', 'side', 'back'].includes(record.angle)) return;
            let metric = (state.metricsHistory || []).find(item => item && item.date === record.date);
            if (!metric) {
                metric = { date: record.date };
                if (!Array.isArray(state.metricsHistory)) state.metricsHistory = [];
                state.metricsHistory.push(metric);
                changed = true;
            }
            if (!isPlainRecord(metric.photos)) metric.photos = {};
            if (!isValidPhotoData(metric.photos[record.angle])) {
                metric.photos[record.angle] = VFIT_PHOTO_REF_PREFIX + record.id;
                changed = true;
            }
        });
        if (changed) {
            state.metricsHistory.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
            saveState({ skipCloud: true, forceBackup: true });
        }
        return changed;
    }

    function formatPhotoStorageBytes(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024 * 1024) return Math.max(0, value / 1024).toFixed(1) + ' KB';
        if (value < 1024 * 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB';
        return (value / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    async function renderPhotoStorageStatus() {
        const status = document.getElementById('photo-storage-status');
        const bar = document.getElementById('photo-storage-bar');
        const note = document.getElementById('photo-storage-note');
        if (!status) return;
        try {
            const [records, estimate, persisted] = await Promise.all([
                listProgressPhotos(),
                navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({}),
                navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)
            ]);
            const photoBytes = records.reduce((sum, record) => sum + (Number(record.bytes) || inlinePhotoBytes(record.data)), 0);
            const usage = Number(estimate && estimate.usage) || photoBytes;
            const quota = Number(estimate && estimate.quota) || 0;
            const percent = quota ? Math.min(100, Math.max(0, usage / quota * 100)) : 0;
            status.textContent = `${records.length} saved photo${records.length === 1 ? '' : 's'} · ${formatPhotoStorageBytes(photoBytes)} used by your gallery`;
            if (bar) bar.style.width = percent.toFixed(1) + '%';
            if (note) note.textContent = quota
                ? `${formatPhotoStorageBytes(usage)} of ${formatPhotoStorageBytes(quota)} total site storage used${persisted ? ' · protected persistent storage' : ''}`
                : 'No fixed VFIT photo limit; capacity follows the free storage on this device.';
        } catch (error) {
            status.textContent = 'Expanded photo storage will initialise when you save your next photo.';
            if (note) note.textContent = 'Existing photos are never removed automatically.';
        }
    }

    async function initialiseProgressPhotoStorage() {
        try {
            await migrateProgressPhotosToIndexedDb();
            await reconcileProgressPhotoReferences();
            requestPersistentDeviceStorage();
            await renderPhotoStorageStatus();
        } catch (error) {
            console.warn('Expanded progress-photo storage is not ready:', error);
        }
    }

    const openProgressPhotosModalWithInlineStorage = openProgressPhotosModal;
    openProgressPhotosModal = async function openProgressPhotosModalWithExpandedStorage() {
        const date = state.metricsDate || localDateKey();
        document.getElementById('record-photos-date').textContent = formatMetricsDateLabel(date);
        state.currentPhotos = { front: null, side: null, back: null };
        const existing = getCurrentMetricEntry();
        document.getElementById('progress-photos-modal').style.display = 'flex';
        await initialiseProgressPhotoStorage();
        await Promise.all(['front', 'side', 'back'].map(async angle => {
            const preview = document.getElementById(`photo-${angle}-preview`);
            if (!preview) return;
            const reference = existing && existing.photos && existing.photos[angle];
            let source = '';
            try { source = reference ? await getProgressPhoto(reference) : ''; }
            catch (error) { console.warn('Progress photo could not be displayed:', error); }
            preview.src = source;
            preview.classList.toggle('hidden', !source);
        }));
        refreshIcons();
    };

    const saveRecordedPhotosWithInlineStorage = saveRecordedPhotos;
    saveRecordedPhotos = async function saveRecordedPhotosWithExpandedStorage() {
        const date = state.metricsDate || localDateKey();
        const existing = getCurrentMetricEntry();
        const photos = {};
        const referencesToDelete = [];
        let anyChange = false;
        for (const angle of ['front', 'side', 'back']) {
            const value = state.currentPhotos[angle];
            if (value === 'REMOVE') {
                anyChange = true;
                photos[angle] = 'REMOVE';
                const oldReference = existing && existing.photos && existing.photos[angle];
                if (oldReference) referencesToDelete.push(oldReference);
            } else if (typeof value === 'string' && value.startsWith('data:image/')) {
                anyChange = true;
                try {
                    photos[angle] = await putProgressPhoto(date, angle, value);
                } catch (error) {
                    console.error('Expanded photo save failed:', error);
                    showToast(error.message || 'Photo storage is unavailable — your selected photos are still on screen', 6500);
                    return;
                }
            }
        }
        if (!anyChange) {
            showToast('No new photos to save');
            return;
        }
        if (!mergeMetricEntry(date, {}, photos)) {
            showToast('Photo references could not be saved — your selected photos are still on screen', 6500);
            return;
        }
        await Promise.all(referencesToDelete.map(reference => deleteProgressPhoto(reference).catch(error => {
            console.warn('Old progress photo could not be removed:', error);
        })));
        state.currentPhotos = { front: null, side: null, back: null };
        if (typeof markReminderDone === 'function') markReminderDone('photo');
        document.getElementById('progress-photos-modal').style.display = 'none';
        renderMetricsStatusLinesWithInlineStorage();
        renderMetricsHistory();
        requestPersistentDeviceStorage();
        await renderPhotoStorageStatus();
        const saved = getCurrentMetricEntry();
        const count = saved && saved.photos ? Object.keys(saved.photos).length : 0;
        showToast(`Photos saved on this device ✓ (${count} for this date)`);
    };

    const loadComparisonPhotosWithInlineStorage = loadComparisonPhotos;
    loadComparisonPhotos = async function loadComparisonPhotosWithExpandedStorage() {
        const date1 = document.getElementById('compare-date-1').value;
        const date2 = document.getElementById('compare-date-2').value;
        const noMessage = document.getElementById('no-comparison-message');
        const view = document.getElementById('comparison-view');
        if (!date1 || !date2) {
            noMessage.innerHTML = '<i data-lucide="images" class="w-16 h-16 mx-auto mb-4 opacity-50"></i><p class="font-bold">Select two dates to compare</p>';
            noMessage.classList.remove('hidden');
            view.classList.add('hidden');
            document.getElementById('save-comparison-btn')?.classList.add('hidden');
            refreshIcons();
            return;
        }
        const metric1 = (state.metricsHistory || []).find(metric => metric.date === date1);
        const metric2 = (state.metricsHistory || []).find(metric => metric.date === date2);
        const reference1 = metric1 && metric1.photos && metric1.photos[comparePhotoType];
        const reference2 = metric2 && metric2.photos && metric2.photos[comparePhotoType];
        let photo1 = '';
        let photo2 = '';
        try {
            [photo1, photo2] = await Promise.all([
                reference1 ? getProgressPhoto(reference1) : Promise.resolve(''),
                reference2 ? getProgressPhoto(reference2) : Promise.resolve('')
            ]);
        } catch (error) {
            console.warn('Comparison photos could not be loaded:', error);
        }
        if (!photo1 || !photo2) {
            const have1 = metric1 && metric1.photos ? Object.keys(metric1.photos) : [];
            const have2 = metric2 && metric2.photos ? Object.keys(metric2.photos) : [];
            const shared = ['front', 'side', 'back'].filter(angle => have1.includes(angle) && have2.includes(angle));
            const help = shared.length
                ? `Both dates have: <b>${shared.map(escapeHtml).join(', ')}</b>. Choose one of those angles.`
                : `${escapeHtml(date1)} has: <b>${have1.length ? have1.map(escapeHtml).join(', ') : 'no photos'}</b><br>${escapeHtml(date2)} has: <b>${have2.length ? have2.map(escapeHtml).join(', ') : 'no photos'}</b>`;
            noMessage.innerHTML = `<i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-3 text-amber-500"></i><p class="font-bold mb-2">No ${escapeHtml(comparePhotoType)} photo on one or both dates</p><p class="text-xs leading-relaxed">${help}</p>`;
            noMessage.classList.remove('hidden');
            view.classList.add('hidden');
            document.getElementById('save-comparison-btn')?.classList.add('hidden');
            refreshIcons();
            return;
        }
        noMessage.classList.add('hidden');
        view.classList.remove('hidden');
        document.getElementById('save-comparison-btn')?.classList.remove('hidden');
        document.getElementById('compare-img-1').src = photo1;
        document.getElementById('compare-img-2').src = photo2;
        document.getElementById('compare-label-1').textContent = new Date(date1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        document.getElementById('compare-label-2').textContent = new Date(date2).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        refreshIcons();
    };

    const exportVfitBackupWithoutExpandedPhotos = exportVfitBackup;
    exportVfitBackup = async function exportVfitBackupWithExpandedPhotos() {
        try {
            await migrateProgressPhotosToIndexedDb();
            const records = await listProgressPhotos();
            const payload = {
                app: 'VFIT',
                appVersion: VFIT_APP_VERSION,
                schemaVersion: VFIT_STATE_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                accountEmail: currentUser ? (currentUser.email || '') : '',
                state,
                progressPhotos: records.map(record => ({
                    date: record.date,
                    angle: record.angle,
                    data: record.data,
                    updatedAt: record.updatedAt
                }))
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `vfit-backup-${localDateKey()}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast(`Backup downloaded with ${records.length} progress photo${records.length === 1 ? '' : 's'} — keep it private`, 6000);
        } catch (error) {
            console.error('Expanded backup export failed:', error);
            showToast('Could not create the photo-inclusive backup', 6000);
        }
    };

    const importVfitBackupWithoutExpandedPhotos = importVfitBackup;
    importVfitBackup = async function importVfitBackupWithExpandedPhotos(event) {
        const input = event && event.target;
        const file = input && input.files && input.files[0];
        if (!file) return;
        try {
            if (file.size > 250 * 1024 * 1024) throw new Error('Backup is larger than 250 MB');
            const parsed = JSON.parse(await file.text());
            const imported = isPlainRecord(parsed && parsed.state) ? parsed.state : parsed;
            if (!isPlainRecord(imported)) throw new Error('This is not a VFIT state backup');
            const sourceEmail = parsed && parsed.accountEmail ? String(parsed.accountEmail) : '';
            const accountWarning = sourceEmail && currentUser && sourceEmail.toLowerCase() !== (currentUser.email || '').toLowerCase()
                ? `\n\nThis backup was exported for ${sourceEmail}.`
                : '';
            if (!confirm('Restore this VFIT backup? Existing workouts and progress photos are kept.' + accountWarning)) return;
            const preferredImport = normalizeState(imported);
            // IndexedDB references belong to the device/account that created
            // them. Rebuild those links from the photo payload below instead of
            // importing stale identifiers from another installation.
            for (const metric of preferredImport.metricsHistory || []) {
                if (!isPlainRecord(metric && metric.photos)) continue;
                for (const angle of ['front', 'side', 'back']) {
                    if (String(metric.photos[angle] || '').startsWith(VFIT_PHOTO_REF_PREFIX)) delete metric.photos[angle];
                }
                if (!Object.keys(metric.photos).length) delete metric.photos;
            }
            const photoRecords = Array.isArray(parsed && parsed.progressPhotos) ? parsed.progressPhotos : [];
            for (const record of photoRecords) {
                if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')) || !['front', 'side', 'back'].includes(record.angle)) continue;
                if (typeof record.data !== 'string' || !record.data.startsWith('data:image/')) continue;
                const currentMetric = (state.metricsHistory || []).find(item => item && item.date === record.date);
                const currentReference = currentMetric && currentMetric.photos && currentMetric.photos[record.angle];
                let currentPhotoExists = typeof currentReference === 'string' && currentReference.startsWith('data:image/');
                if (!currentPhotoExists && currentReference) {
                    try { currentPhotoExists = Boolean(await getProgressPhoto(currentReference)); }
                    catch (error) { currentPhotoExists = false; }
                }
                // A restore is additive: never overwrite a photo already saved for
                // the same date and angle on this device.
                if (currentPhotoExists) continue;
                const reference = await putProgressPhoto(record.date, record.angle, record.data);
                let metric = (preferredImport.metricsHistory || []).find(item => item.date === record.date);
                if (!metric) {
                    metric = { date: record.date };
                    preferredImport.metricsHistory.push(metric);
                }
                if (!isPlainRecord(metric.photos)) metric.photos = {};
                metric.photos[record.angle] = reference;
            }
            preferredImport.meta.updatedAt = new Date(Date.now() + 1000).toISOString();
            state = mergeStateSnapshots(state, preferredImport);
            if (!saveState({ forceBackup: true })) throw new Error('The restored data could not be saved on this device');
            progressPhotoMigrations.delete(progressPhotoOwner());
            await migrateProgressPhotosToIndexedDb();
            await flushCloudSync({ silent: true });
            showToast('Backup and progress photos restored ✓');
            setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            console.error('Expanded backup restore failed:', error);
            showToast(error.message || 'Could not restore that backup', 6500);
        } finally {
            if (input) input.value = '';
        }
    };

    const renderMetricsStatusLinesWithInlineStorage = renderMetricsStatusLines;
    renderMetricsStatusLines = function renderMetricsStatusLinesWithExpandedStorage() {
        const result = renderMetricsStatusLinesWithInlineStorage.apply(this, arguments);
        initialiseProgressPhotoStorage();
        return result;
    };

    document.addEventListener('DOMContentLoaded', initialiseProgressPhotoStorage);
