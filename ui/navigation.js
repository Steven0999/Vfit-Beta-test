    // ==========================================================================
    // LOGS TAB
    // ==========================================================================

    function setLogsTab(tab) {
        const trainingView = document.getElementById('logs-training-view');
        const nutritionView = document.getElementById('logs-nutrition-view');
        const trainingTab = document.getElementById('logs-tab-training');
        const nutritionTab = document.getElementById('logs-tab-nutrition');

        if (tab === 'training') {
            trainingView.classList.remove('hidden');
            nutritionView.classList.add('hidden');
            trainingTab.className = 'flex-1 py-4 text-xs font-black uppercase rounded-xl bg-white text-indigo-600 shadow-sm';
            nutritionTab.className = 'flex-1 py-4 text-xs font-black uppercase rounded-xl text-slate-400';
            renderTrainingLogs();
        } else {
            trainingView.classList.add('hidden');
            nutritionView.classList.remove('hidden');
            trainingTab.className = 'flex-1 py-4 text-xs font-black uppercase rounded-xl text-slate-400';
            nutritionTab.className = 'flex-1 py-4 text-xs font-black uppercase rounded-xl bg-white text-indigo-600 shadow-sm';
            renderHydrationLogs();
        }
        refreshIcons();
    }

    function renderLogs() {
        renderTrainingLogs();
    }

    function filterWorkouts() {
        renderTrainingLogs();
    }

    function renderTrainingLogs() {
        const container = document.getElementById('training-logs-list');
        if (!container) return;

        const showWeights = document.getElementById('filter-weights').checked;
        const showCardio = document.getElementById('filter-cardio').checked;
        const showCore = document.getElementById('filter-core').checked;
        const showWalking = document.getElementById('filter-walking').checked;

        let workouts = (state.workoutHistory || []).slice();

        // Add cardio logs as workout entries
        (state.cardioLogs || []).forEach(c => {
            const cardioType = String(c.type || 'cardio');
            workouts.push({
                id: c.id,
                date: c.date,
                focus: cardioType.charAt(0).toUpperCase() + cardioType.slice(1),
                duration: c.duration + ' min',
                category: cardioType === 'walking' ? 'walking' : 'cardio',
                exercises: [],
                distance: c.distance,
                cardioCalories: c.calories,
                notes: c.notes
            });
        });

        // Apply filters
        workouts = workouts.filter(w => {
            const cat = w.category || 'weights';
            if (cat === 'weights' && !showWeights) return false;
            if (cat === 'cardio' && !showCardio) return false;
            if (cat === 'core' && !showCore) return false;
            if (cat === 'walking' && !showWalking) return false;
            return true;
        });

        workouts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (workouts.length === 0) {
            container.innerHTML = `
                <div class="glass-card p-8 rounded-2xl text-center">
                    <i data-lucide="dumbbell" class="w-12 h-12 text-slate-300 mx-auto mb-3"></i>
                    <p class="text-slate-400 font-bold">No workouts yet</p>
                    <p class="text-xs text-slate-400 mt-1">Start training to see logs here</p>
                </div>`;
            refreshIcons();
            return;
        }

        container.innerHTML = workouts.map(w => {
            const dateStr = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            const cat = w.category || 'weights';
            const catEmoji = cat === 'cardio' ? '🏃' : cat === 'core' ? '🎯' : cat === 'walking' ? '🚶' : '💪';

            const exerciseCount = (w.exercises || []).length;
            let summary = '';
            if (exerciseCount > 0) {
                summary = `${exerciseCount} exercise${exerciseCount > 1 ? 's' : ''}`;
            } else if (w.distance) {
                summary = `${w.distance} km`;
            }

            return `
                <div onclick="viewWorkoutDetails('${escapeJsString(w.id)}')" class="glass-card p-4 rounded-2xl mb-3 cursor-pointer hover:shadow-md transition-all">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">${catEmoji}</span>
                            <div>
                                <p class="font-bold text-sm">${escapeHtml(w.focus)}</p>
                                <p class="text-xs text-slate-400">${escapeHtml(dateStr)}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-bold text-indigo-600">${escapeHtml(w.duration || '')}</p>
                            <p class="text-xs text-slate-400">${escapeHtml(summary)}</p>
                        </div>
                    </div>
                </div>`;
        }).join('');

        refreshIcons();
    }

    function viewWorkoutDetails(workoutId) {
        const workout = (state.workoutHistory || []).find(w => String(w.id) === String(workoutId))
            || (state.cardioLogs || []).find(c => String(c.id) === String(workoutId));
        if (!workout) return;

        let details = `Date: ${new Date(workout.date).toLocaleDateString()}\n`;
        details += `Focus: ${workout.focus || workout.type}\n`;
        details += `Duration: ${workout.duration || ''}\n\n`;

        if (workout.exercises && workout.exercises.length > 0) {
            details += 'Exercises:\n';
            workout.exercises.forEach(ex => {
                details += `\n${ex.name}:\n`;
                (ex.sets || []).forEach((s, i) => {
                    details += `  Set ${i + 1}: ${s.reps} reps × ${s.weight}kg\n`;
                });
            });
        }

        if (workout.distance) details += `\nDistance: ${workout.distance} km`;
        if (workout.notes) details += `\nNotes: ${workout.notes}`;

        alert(details);
    }

    function renderHydrationLogs() {
        const container = document.getElementById('hydration-logs-list');
        if (!container) return;

        const logs = state.hydrationGoalCompletions || {};
        const dates = Object.keys(logs).filter(d => logs[d]).sort().reverse().slice(0, 30);

        if (dates.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">No hydration goals reached yet</p>';
            return;
        }

        container.innerHTML = dates.map(d => {
            const date = new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            return `
                <div class="bg-cyan-50 p-3 rounded-xl flex items-center justify-between">
                    <p class="font-bold text-sm">${date}</p>
                    <span class="text-cyan-600 font-bold text-sm">💧 Goal Reached</span>
                </div>`;
        }).join('');
    }

    // ==========================================================================
    // METRICS TAB
    // ==========================================================================

    function changeMetricsDate(days) {
        const current = document.getElementById('metrics-date-picker').value || localDateKey();
        selectMetricsDate(offsetLocalDateKey(current, days));
    }

    function selectMetricsDate(dateStr) {
        state.metricsDate = dateStr;
        document.getElementById('metrics-date-picker').value = dateStr;
        const today = localDateKey();
        const warning = document.getElementById('metrics-date-warning');
        if (warning) warning.classList.toggle('hidden', dateStr === today);

        // Reset photo buffer when changing dates so we don't accidentally apply
        // photos picked for a different day.
        state.currentPhotos = { front: null, side: null, back: null };

        saveState();
        renderMetricsStatusLines();
        renderMetricsHistory();
    }

    function triggerPhotoUpload(type) {
        currentPhotoType = type;
        const input = document.getElementById('photo-upload-input');
        // Reset value so picking the same file twice still fires `change`.
        input.value = '';
        input.onchange = handlePhotoUpload;
        input.click();
    }

    /** Resize and progressively compress a photo to a device-gallery-friendly size. */
    function compressImage(file, maxDim, targetBytes) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.onload = (e) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Image decode failed'));
                img.onload = () => {
                    const longest = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
                    const initialScale = Math.min(1, maxDim / Math.max(1, longest));
                    let width = Math.max(1, Math.round((img.naturalWidth || img.width) * initialScale));
                    let height = Math.max(1, Math.round((img.naturalHeight || img.height) * initialScale));
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { reject(new Error('Canvas is unavailable')); return; }
                    const qualities = [0.82, 0.72, 0.62, 0.52, 0.44];
                    let best = '';
                    for (let attempt = 0; attempt < qualities.length; attempt += 1) {
                        if (attempt === 3) {
                            width = Math.max(1, Math.round(width * 0.82));
                            height = Math.max(1, Math.round(height * 0.82));
                        }
                        canvas.width = width;
                        canvas.height = height;
                        ctx.fillStyle = '#111827';
                        ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        best = canvas.toDataURL('image/jpeg', qualities[attempt]);
                        const bytes = Math.ceil((best.length - best.indexOf(',') - 1) * 0.75);
                        if (bytes <= targetBytes) { resolve(best); return; }
                    }
                    if (best) resolve(best);
                    else reject(new Error('Image encoding failed'));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file || !currentPhotoType) return;

        const preview = document.getElementById(`photo-${currentPhotoType}-preview`);

        try {
            if (!/^image\//i.test(file.type || '')) throw new Error('Choose an image file');
            if (file.size > 30 * 1024 * 1024) throw new Error('Photo is larger than 30 MB');
            const compressed = await compressImage(file, 1280, 360000);
            if (preview) {
                preview.src = compressed;
                preview.classList.remove('hidden');
            }
            state.currentPhotos[currentPhotoType] = compressed;
            showToast('Photo added — tap Save Photos to confirm');
        } catch (err) {
            console.error('Photo compression failed:', err);
            showToast(err.message || 'Could not process that image — try another', 5000);
        }
    }

    function removePhoto(type) {
        state.currentPhotos[type] = 'REMOVE'; // sentinel value handled by saveRecordedPhotos
        const preview = document.getElementById(`photo-${type}-preview`);
        if (preview) {
            preview.classList.add('hidden');
            preview.src = '';
        }
        showToast(`${type} photo cleared — tap Save Photos to confirm`);
    }

    // ==========================================================================
    // METRIC RECORD MODALS (weight / measurements / photos)
    // ==========================================================================

    /**
     * Merge a partial metric entry into state.metricsHistory for a given date.
     * Empty/null fields are preserved from any existing entry on that date.
     * The `photos` parameter, when provided, is a plain object whose values are
     * either base64 strings (to set) or the string 'REMOVE' (to delete).
     */
    function mergeMetricEntry(date, fields, photos) {
        if (!state.metricsHistory) state.metricsHistory = [];
        const idx = state.metricsHistory.findIndex(m => m.date === date);
        const existing = idx >= 0 ? state.metricsHistory[idx] : { date };

        const merged = Object.assign({}, existing, fields);

        if (photos) {
            const mergedPhotos = Object.assign({}, existing.photos || {});
            Object.entries(photos).forEach(([k, v]) => {
                if (v === 'REMOVE') {
                    delete mergedPhotos[k];
                } else if (isValidPhotoData(v)) {
                    mergedPhotos[k] = v;
                }
                // Anything else (null, undefined, non-image strings) is silently ignored
                // — we don't want to overwrite a real photo with garbage, and we don't
                // want to save garbage where there was nothing.
            });
            if (Object.keys(mergedPhotos).length > 0) {
                merged.photos = mergedPhotos;
            } else {
                delete merged.photos;
            }
        }

        if (idx >= 0) state.metricsHistory[idx] = merged;
        else state.metricsHistory.unshift(merged);

        // Sort descending by date
        state.metricsHistory.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return saveState();
    }

    function getCurrentMetricEntry() {
        const date = state.metricsDate || localDateKey();
        return (state.metricsHistory || []).find(m => m.date === date) || null;
    }

    function formatMetricsDateLabel(dateStr) {
        const today = localDateKey();
        if (dateStr === today) return 'Today';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }

    // -- WEIGHT MODAL --

    /**
     * Convert any unit to canonical kg (for storage).
     */
    function toKg(value, unit, minor) {
        if (unit === 'kg') return parseFloat(value);
        if (unit === 'lbs') return parseFloat(value) * 0.45359237;
        if (unit === 'st') {
            const st = parseFloat(value) || 0;
            const lb = parseFloat(minor) || 0;
            return (st * 14 + lb) * 0.45359237;
        }
        return parseFloat(value);
    }

    /**
     * Convert canonical kg to a display unit.
     * Returns { primary, secondary } — secondary is non-null only for stone.
     */
    function fromKg(kg, unit) {
        if (kg === null || kg === undefined || isNaN(kg)) return { primary: '', secondary: '' };
        if (unit === 'kg') return { primary: kg.toFixed(1), secondary: '' };
        if (unit === 'lbs') return { primary: (kg / 0.45359237).toFixed(1), secondary: '' };
        if (unit === 'st') {
            const totalLb = kg / 0.45359237;
            const st = Math.floor(totalLb / 14);
            const lb = totalLb - st * 14;
            return { primary: String(st), secondary: lb.toFixed(1) };
        }
        return { primary: kg.toFixed(1), secondary: '' };
    }

    function openRecordWeightModal() {
        const date = state.metricsDate || localDateKey();
        document.getElementById('record-weight-date').textContent = formatMetricsDateLabel(date);

        // Apply the user's preferred unit
        const unit = state.weightUnit || 'kg';
        setWeightUnit(unit, /*skipSave=*/true);

        // Pre-fill existing weight for this date
        const existing = getCurrentMetricEntry();
        if (existing && existing.weight) {
            const { primary, secondary } = fromKg(existing.weight, unit);
            document.getElementById('weight-input-value').value = primary;
            document.getElementById('weight-input-stone-major').value = primary;
            document.getElementById('weight-input-stone-minor').value = secondary;
        } else {
            document.getElementById('weight-input-value').value = '';
            document.getElementById('weight-input-stone-major').value = '';
            document.getElementById('weight-input-stone-minor').value = '';
        }

        updateWeightConversionPreview();
        document.getElementById('record-weight-modal').style.display = 'flex';

        // Live-update conversion preview
        ['weight-input-value', 'weight-input-stone-major', 'weight-input-stone-minor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = updateWeightConversionPreview;
        });
    }

    function closeRecordWeightModal() {
        document.getElementById('record-weight-modal').style.display = 'none';
    }

    function setWeightUnit(unit, skipSave) {
        state.weightUnit = unit;
        if (!skipSave) saveState();

        // Update button styles
        ['kg', 'lbs', 'st'].forEach(u => {
            const btn = document.getElementById('weight-unit-' + u);
            if (!btn) return;
            if (u === unit) {
                btn.className = 'p-3 rounded-xl font-black text-sm bg-rose-500 text-white shadow-md';
            } else {
                btn.className = 'p-3 rounded-xl font-black text-sm bg-slate-100 text-slate-600 hover:bg-slate-200';
            }
        });

        // Toggle inputs
        const single = document.getElementById('weight-input-single');
        const stone = document.getElementById('weight-input-stone');
        if (unit === 'st') {
            single.classList.add('hidden');
            stone.classList.remove('hidden');
        } else {
            single.classList.remove('hidden');
            stone.classList.add('hidden');
            const label = document.getElementById('weight-unit-label');
            if (label) label.textContent = unit;
        }
        updateWeightConversionPreview();
    }

    function updateWeightConversionPreview() {
        const unit = state.weightUnit || 'kg';
        let kg = null;
        if (unit === 'st') {
            const major = document.getElementById('weight-input-stone-major').value;
            const minor = document.getElementById('weight-input-stone-minor').value;
            if (major || minor) kg = toKg(major || 0, 'st', minor || 0);
        } else {
            const v = document.getElementById('weight-input-value').value;
            if (v) kg = toKg(v, unit);
        }

        const preview = document.getElementById('weight-conversion-preview');
        if (!preview) return;
        if (kg && kg > 0) {
            const inKg = kg.toFixed(1);
            const inLbs = (kg / 0.45359237).toFixed(1);
            const stConv = fromKg(kg, 'st');
            const inSt = stConv.primary + 'st ' + stConv.secondary + 'lb';
            const parts = [];
            if (unit !== 'kg') parts.push(inKg + ' kg');
            if (unit !== 'lbs') parts.push(inLbs + ' lbs');
            if (unit !== 'st') parts.push(inSt);
            preview.textContent = '≈ ' + parts.join(' · ');
            preview.classList.remove('hidden');
        } else {
            preview.classList.add('hidden');
        }
    }

    function saveRecordedWeight() {
        const date = state.metricsDate || localDateKey();
        const unit = state.weightUnit || 'kg';

        let kg;
        if (unit === 'st') {
            const major = document.getElementById('weight-input-stone-major').value;
            const minor = document.getElementById('weight-input-stone-minor').value;
            if (!major && !minor) { showToast('Enter a weight'); return; }
            kg = toKg(major || 0, 'st', minor || 0);
        } else {
            const v = document.getElementById('weight-input-value').value;
            if (!v) { showToast('Enter a weight'); return; }
            kg = toKg(v, unit);
        }

        if (isNaN(kg) || kg <= 0 || kg > 500) {
            showToast('Please enter a valid weight');
            return;
        }

        mergeMetricEntry(date, { weight: Math.round(kg * 10) / 10 }, null);
        if (typeof markReminderDone === 'function') markReminderDone('weight');
        closeRecordWeightModal();
        renderMetricsStatusLines();
        renderMetricsHistory();
        renderMaintenanceDisplay();
        showToast('Weight saved ✓');
    }

    // -- MEASUREMENTS MODAL --

    function openRecordMeasurementsModal() {
        const date = state.metricsDate || localDateKey();
        document.getElementById('record-meas-date').textContent = formatMetricsDateLabel(date);

        const existing = getCurrentMetricEntry() || {};
        document.getElementById('meas-chest').value = existing.chest || '';
        document.getElementById('meas-shoulders').value = existing.shoulders || '';
        document.getElementById('meas-arms').value = existing.arms || '';
        document.getElementById('meas-waist').value = existing.waist || '';
        document.getElementById('meas-legs').value = existing.legs || '';
        document.getElementById('meas-glutes').value = existing.glutes || '';
        const neckEl = document.getElementById('meas-neck');
        if (neckEl) neckEl.value = existing.neck || '';

        document.getElementById('record-measurements-modal').style.display = 'flex';
    }

    function closeRecordMeasurementsModal() {
        document.getElementById('record-measurements-modal').style.display = 'none';
    }

    function saveRecordedMeasurements() {
        const date = state.metricsDate || localDateKey();

        const fields = {};
        const parts = ['chest', 'shoulders', 'arms', 'waist', 'legs', 'glutes', 'neck'];
        let anyEntered = false;
        parts.forEach(p => {
            const raw = document.getElementById('meas-' + p).value;
            if (raw !== '' && raw !== null) {
                const num = parseFloat(raw);
                if (!isNaN(num) && num > 0) {
                    fields[p] = num;
                    anyEntered = true;
                }
            }
        });

        if (!anyEntered) {
            showToast('Enter at least one measurement');
            return;
        }

        mergeMetricEntry(date, fields, null);
        if (typeof markReminderDone === 'function') markReminderDone('measurement');
        closeRecordMeasurementsModal();
        renderMetricsStatusLines();
        renderMetricsHistory();
        showToast('Measurements saved ✓');
    }

    // -- PHOTOS MODAL --

    function openProgressPhotosModal() {
        const date = state.metricsDate || localDateKey();
        document.getElementById('record-photos-date').textContent = formatMetricsDateLabel(date);

        // Reset buffer and load any existing photos for the date
        state.currentPhotos = { front: null, side: null, back: null };
        const existing = getCurrentMetricEntry();

        ['front', 'side', 'back'].forEach(t => {
            const preview = document.getElementById(`photo-${t}-preview`);
            if (!preview) return;
            if (existing && existing.photos && existing.photos[t]) {
                preview.src = existing.photos[t];
                preview.classList.remove('hidden');
            } else {
                preview.classList.add('hidden');
                preview.src = '';
            }
        });

        document.getElementById('progress-photos-modal').style.display = 'flex';
        refreshIcons();
    }

    function closeProgressPhotosModal() {
        document.getElementById('progress-photos-modal').style.display = 'none';
        // Discard buffered changes that weren't saved
        state.currentPhotos = { front: null, side: null, back: null };
    }

    function saveRecordedPhotos() {
        const date = state.metricsDate || localDateKey();

        const photos = {};
        let anyChange = false;
        ['front', 'side', 'back'].forEach(t => {
            const v = state.currentPhotos[t];
            // 'REMOVE' is a sentinel for "delete this angle".
            // A valid image string is the only other thing we want to pass through.
            // Anything else (null, undefined) means "no change for this angle".
            if (v === 'REMOVE' || isValidPhotoData(v)) {
                photos[t] = v;
                anyChange = true;
            }
        });

        if (!anyChange) {
            showToast('No new photos to save');
            return;
        }

        // mergeMetricEntry calls saveState internally. We need to know if it succeeded
        // before clearing the buffer — otherwise quota errors silently lose data.
        const ok = mergeMetricEntry(date, {}, photos);
        if (!ok) {
            // Save failed — keep the buffer so the user can try again or remove a photo first
            showToast('Photos not saved — see message above', 5000);
            return;
        }

        // Verify it actually persisted (defensive — in case mergeMetricEntry's
        // internal state was updated but localStorage write threw)
        const verifyEntry = (state.metricsHistory || []).find(m => m.date === date);
        const savedCount = verifyEntry && verifyEntry.photos ? Object.keys(verifyEntry.photos).length : 0;

        // Reset buffer only on confirmed success
        state.currentPhotos = { front: null, side: null, back: null };
        if (typeof markReminderDone === 'function') markReminderDone('photo');

        document.getElementById('progress-photos-modal').style.display = 'none';
        renderMetricsStatusLines();
        renderMetricsHistory();
        requestPersistentDeviceStorage();
        showToast('Photos saved ✓ (' + savedCount + ' on file for this date)');
    }

    // ==========================================================================
    // METRICS STATUS LINES & HISTORY LIST
    // ==========================================================================

    function renderMetricsStatusLines() {
        const entry = getCurrentMetricEntry();
        const unit = state.weightUnit || 'kg';

        // Weight status
        const wEl = document.getElementById('weight-status-line');
        if (wEl) {
            if (entry && entry.weight) {
                const display = fromKg(entry.weight, unit);
                const text = unit === 'st'
                    ? `${display.primary}st ${display.secondary}lb logged`
                    : `${display.primary} ${unit} logged`;
                wEl.textContent = text;
                wEl.className = 'text-xs text-emerald-600 font-bold';
            } else {
                wEl.textContent = 'No weight logged for this date';
                wEl.className = 'text-xs text-slate-400';
            }
        }

        // Measurements status
        const mEl = document.getElementById('measurements-status-line');
        if (mEl) {
            const parts = ['chest', 'shoulders', 'arms', 'waist', 'legs', 'glutes', 'neck'];
            const count = entry ? parts.filter(p => entry[p]).length : 0;
            if (count > 0) {
                mEl.textContent = `${count} measurement${count === 1 ? '' : 's'} logged`;
                mEl.className = 'text-xs text-emerald-600 font-bold';
            } else {
                mEl.textContent = 'No measurements for this date';
                mEl.className = 'text-xs text-slate-400';
            }
        }

        // Photos status
        const pEl = document.getElementById('photos-status-line');
        if (pEl) {
            const photoCount = entry && entry.photos ? Object.keys(entry.photos).length : 0;
            if (photoCount > 0) {
                pEl.textContent = `${photoCount} photo${photoCount === 1 ? '' : 's'} on file`;
                pEl.className = 'text-xs text-emerald-600 font-bold';
            } else {
                pEl.textContent = 'No photos for this date';
                pEl.className = 'text-xs text-slate-400';
            }
        }

        // Body fat % estimate (needs height + neck + waist)
        if (typeof renderBodyFatDisplay === 'function') renderBodyFatDisplay();
    }

    function renderMetricsHistory() {
        const container = document.getElementById('metrics-history-list');
        if (!container) return;
        const history = (state.metricsHistory || []).slice(0, 30);
        if (history.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-3">No entries yet</p>';
            return;
        }
        const unit = state.weightUnit || 'kg';
        container.innerHTML = history.map(e => {
            const d = new Date(e.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const tags = [];
            if (e.weight) {
                const w = fromKg(e.weight, unit);
                tags.push(unit === 'st'
                    ? `<span class="px-2 py-0.5 bg-rose-50 text-rose-700 rounded text-[10px] font-bold">${w.primary}st ${w.secondary}lb</span>`
                    : `<span class="px-2 py-0.5 bg-rose-50 text-rose-700 rounded text-[10px] font-bold">${w.primary}${unit}</span>`);
            }
            const measParts = ['chest', 'shoulders', 'arms', 'waist', 'legs', 'glutes', 'neck'].filter(p => e[p]);
            if (measParts.length > 0) {
                tags.push(`<span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold">${measParts.length} meas</span>`);
            }
            if (e.photos && Object.keys(e.photos).length > 0) {
                tags.push(`<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">📸 ${Object.keys(e.photos).length}</span>`);
            }
            return `
                <div onclick="selectMetricsDate('${escapeJsString(e.date)}')" class="bg-slate-50 hover:bg-slate-100 p-3 rounded-xl cursor-pointer flex items-center justify-between">
                    <p class="font-bold text-sm">${escapeHtml(d)}</p>
                    <div class="flex gap-1 flex-wrap justify-end">${tags.join('')}</div>
                </div>`;
        }).join('');
    }

    // ==========================================================================
    // METRICS CHART
    // ==========================================================================

    function openMetricsChart() {
        document.getElementById('metrics-chart-modal').style.display = 'flex';
        setTimeout(() => renderMetricChart(), 100);
    }

    function closeMetricsChart() {
        document.getElementById('metrics-chart-modal').style.display = 'none';
        if (metricsChart) { metricsChart.destroy(); metricsChart = null; }
    }

    function renderMetricChart() {
        const metric = document.getElementById('chart-metric-select').value;
        const canvas = document.getElementById('metrics-chart');
        if (!canvas) return;

        const history = (state.metricsHistory || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const filtered = history.filter(h => h[metric] !== undefined && h[metric] !== null);

        if (filtered.length === 0) {
            if (metricsChart) { metricsChart.destroy(); metricsChart = null; }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px Plus Jakarta Sans';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('No data for this metric yet', canvas.width / 2, canvas.height / 2);
            return;
        }

        const labels = filtered.map(h => new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
        const values = filtered.map(h => h[metric]);

        if (metricsChart) metricsChart.destroy();
        if (!chartLibraryReady(canvas)) return;

        metricsChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: metric.charAt(0).toUpperCase() + metric.slice(1),
                    data: values,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: false, grid: { color: '#e2e8f0' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ==========================================================================
    // PHOTO COMPARISON
    // ==========================================================================

    let comparePhotoType = 'front';

    function openPhotoComparison() {
        document.getElementById('photo-comparison-modal').style.display = 'flex';
        populateComparisonDates();
    }

    function closePhotoComparison() {
        document.getElementById('photo-comparison-modal').style.display = 'none';
        // Hide diagnostic on close
        const diag = document.getElementById('diagnostic-output');
        if (diag) diag.classList.add('hidden');
    }

    /**
     * Diagnostic — show exactly what photo data is in state.metricsHistory
     * and what localStorage actually contains. Helps identify whether photos
     * are being saved at all, or saved but read incorrectly.
     */
    function diagnosePhotoData() {
        const out = document.getElementById('diagnostic-output');
        if (!out) return;

        const lines = [];
        lines.push('=== METRICS HISTORY (in-memory) ===');
        const hist = state.metricsHistory || [];
        lines.push('Total entries: ' + hist.length);

        const withPhotos = hist.filter(m => m.photos && Object.keys(m.photos).length > 0);
        lines.push('Entries with photos: ' + withPhotos.length);
        lines.push('');

        if (withPhotos.length === 0) {
            lines.push('⚠️ No entries have any photos attached.');
            lines.push('');
            lines.push('Showing all metric entries (first 5):');
            hist.slice(0, 5).forEach(m => {
                const keys = Object.keys(m);
                lines.push('  ' + m.date + ' → keys: ' + keys.join(', '));
                if (m.photos) {
                    lines.push('    photos object: ' + JSON.stringify(Object.keys(m.photos)));
                }
            });
        } else {
            withPhotos.forEach(m => {
                lines.push('Date: ' + m.date);
                Object.entries(m.photos).forEach(([angle, data]) => {
                    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
                    const preview = dataStr.length > 60 ? dataStr.substring(0, 60) + '...' : dataStr;
                    lines.push('  ' + angle + ' (' + dataStr.length + ' chars): ' + preview);
                });
            });
        }

        lines.push('');
        lines.push('=== LOCAL STORAGE ===');
        try {
            const raw = localStorage.getItem(stateStorageKey());
            if (raw) {
                lines.push('Total size: ' + (raw.length / 1024).toFixed(1) + ' KB');
                const parsed = JSON.parse(raw);
                const lsHist = parsed.metricsHistory || [];
                const lsWithPhotos = lsHist.filter(m => m.photos && Object.keys(m.photos).length > 0);
                lines.push('Entries in storage: ' + lsHist.length);
                lines.push('With photos in storage: ' + lsWithPhotos.length);
                if (lsWithPhotos.length !== withPhotos.length) {
                    lines.push('');
                    lines.push('⚠️ Mismatch between memory and storage!');
                    lines.push('Memory has ' + withPhotos.length + ' photo entries,');
                    lines.push('Storage has ' + lsWithPhotos.length + ' photo entries.');
                    lines.push('This means saveState() failed at some point.');
                }
            } else {
                lines.push('⚠️ No state in localStorage');
            }
        } catch (e) {
            lines.push('Storage read error: ' + e.message);
        }

        lines.push('');
        lines.push('=== CURRENT PHOTO BUFFER ===');
        lines.push(JSON.stringify(Object.entries(state.currentPhotos || {}).map(([k, v]) => ({
            angle: k,
            value: v === null ? 'null' : (v === 'REMOVE' ? 'REMOVE' : 'photo (' + (v ? v.length : 0) + ' chars)')
        })), null, 2));

        out.textContent = lines.join('\n');
        out.classList.remove('hidden');
    }

    /**
     * Build dropdowns of every date that has at least one photo. Each option label
     * includes which angles are available on that date (e.g. "12 May — front, side").
     * Then auto-pick the two most-recent dates and an angle that exists on both,
     * so the user sees something useful immediately.
     */
    function populateComparisonDates() {
        const datesWithPhotos = (state.metricsHistory || []).filter(m => m.photos && Object.keys(m.photos).length > 0);

        const sel1 = document.getElementById('compare-date-1');
        const sel2 = document.getElementById('compare-date-2');

        if (datesWithPhotos.length === 0) {
            sel1.innerHTML = '<option value="">No photos yet</option>';
            sel2.innerHTML = '<option value="">No photos yet</option>';
            const noMsg = document.getElementById('no-comparison-message');
            noMsg.innerHTML = `
                <i data-lucide="camera-off" class="w-16 h-16 mx-auto mb-4 opacity-50"></i>
                <p class="font-bold mb-1">No progress photos yet</p>
                <p class="text-xs">Add some from the Metrics tab → Progress Photos</p>`;
            noMsg.classList.remove('hidden');
            document.getElementById('comparison-view').classList.add('hidden');
            refreshIcons();
            return;
        }

        // Sort newest-first for the dropdowns
        const sortedDates = datesWithPhotos.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const optionsHtml = '<option value="">Select date...</option>' + sortedDates.map(m => {
            const d = new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const angles = Object.keys(m.photos).join(', ');
            return `<option value="${m.date}">${d} — ${angles}</option>`;
        }).join('');

        sel1.innerHTML = optionsHtml;
        sel2.innerHTML = optionsHtml;

        // Auto-pick the two most recent dates that share at least one angle
        if (sortedDates.length >= 2) {
            // sortedDates[0] is newest, sortedDates[sortedDates.length - 1] is oldest
            const newest = sortedDates[0];
            const oldest = sortedDates[sortedDates.length - 1];
            sel2.value = newest.date; // "After" = newest
            sel1.value = oldest.date; // "Before" = oldest

            // Pick a shared angle — prefer front, then side, then back, then any
            const shared = ['front', 'side', 'back'].find(a => newest.photos[a] && oldest.photos[a]);
            if (shared) {
                setComparePhotoType(shared);
            } else {
                // No shared angle — pick whatever the newest has and let loadComparisonPhotos
                // show the helpful "no matching angle" message.
                const fallback = Object.keys(newest.photos)[0] || 'front';
                setComparePhotoType(fallback);
            }
        } else {
            // Only one date has photos — preselect it on both sides so the user can at least
            // see what they've got. Comparing to itself is harmless.
            sel1.value = sortedDates[0].date;
            sel2.value = sortedDates[0].date;
            const fallback = Object.keys(sortedDates[0].photos)[0] || 'front';
            setComparePhotoType(fallback);
        }
    }

    function setComparePhotoType(type) {
        comparePhotoType = type;
        ['front', 'side', 'back'].forEach(t => {
            const btn = document.getElementById(`compare-type-${t}`);
            if (!btn) return;
            if (t === type) {
                btn.className = 'p-4 rounded-2xl font-bold text-sm bg-indigo-600 text-white';
            } else {
                btn.className = 'p-4 rounded-2xl font-bold text-sm bg-slate-100 text-slate-600';
            }
        });
        loadComparisonPhotos();
    }

    function loadComparisonPhotos() {
        const date1 = document.getElementById('compare-date-1').value;
        const date2 = document.getElementById('compare-date-2').value;
        const noMsg = document.getElementById('no-comparison-message');
        const view = document.getElementById('comparison-view');

        if (!date1 || !date2) {
            noMsg.innerHTML = `
                <i data-lucide="images" class="w-16 h-16 mx-auto mb-4 opacity-50"></i>
                <p class="font-bold">Select two dates to compare</p>`;
            noMsg.classList.remove('hidden');
            view.classList.add('hidden');
            const sBtnA = document.getElementById('save-comparison-btn');
            if (sBtnA) sBtnA.classList.add('hidden');
            refreshIcons();
            return;
        }

        const m1 = (state.metricsHistory || []).find(m => m.date === date1);
        const m2 = (state.metricsHistory || []).find(m => m.date === date2);

        const photo1 = m1 && m1.photos && m1.photos[comparePhotoType];
        const photo2 = m2 && m2.photos && m2.photos[comparePhotoType];

        if (!photo1 || !photo2) {
            // Tell the user exactly which angle is missing on which date,
            // and what angles ARE available so they can switch.
            const have1 = m1 && m1.photos ? Object.keys(m1.photos) : [];
            const have2 = m2 && m2.photos ? Object.keys(m2.photos) : [];
            const shared = ['front', 'side', 'back'].filter(a => have1.includes(a) && have2.includes(a));

            let helpText = '';
            if (shared.length > 0) {
                helpText = `Both dates have: <b>${shared.join(', ')}</b>. Tap one of those angle buttons.`;
            } else {
                const d1Label = new Date(date1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                const d2Label = new Date(date2).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                helpText = `
                    ${d1Label} has: <b>${have1.length ? have1.join(', ') : 'no photos'}</b><br>
                    ${d2Label} has: <b>${have2.length ? have2.join(', ') : 'no photos'}</b><br>
                    No matching angle — try recording the same angle on both dates.`;
            }

            noMsg.innerHTML = `
                <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-3 text-amber-500"></i>
                <p class="font-bold mb-2">No <span class="capitalize">${comparePhotoType}</span> photo on one or both dates</p>
                <p class="text-xs leading-relaxed">${helpText}</p>`;
            noMsg.classList.remove('hidden');
            view.classList.add('hidden');
            const sBtnB = document.getElementById('save-comparison-btn');
            if (sBtnB) sBtnB.classList.add('hidden');
            refreshIcons();
            return;
        }

        noMsg.classList.add('hidden');
        view.classList.remove('hidden');
        // A valid pair is showing — allow saving the comparison image
        const sBtn = document.getElementById('save-comparison-btn');
        if (sBtn) { sBtn.classList.remove('hidden'); refreshIcons(); }

        document.getElementById('compare-img-1').src = photo1;
        document.getElementById('compare-img-2').src = photo2;
        document.getElementById('compare-label-1').textContent = new Date(date1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        document.getElementById('compare-label-2').textContent = new Date(date2).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // ==========================================================================
    // SAVE COMPARISON — build a shareable side-by-side image
    // ==========================================================================
    // Draws both photos onto a canvas with a black background, an orange dividing
    // line, date labels, and a "VFIT App" watermark in the bottom-right corner.
    // Produces a real image file (not a screenshot) that can be saved or shared.

    let comparisonBlob = null; // the generated image, kept for save/share

    function loadImg(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Could not load photo'));
            img.src = src;
        });
    }

    async function buildComparisonImage() {
        const src1 = document.getElementById('compare-img-1').src;
        const src2 = document.getElementById('compare-img-2').src;
        const label1 = document.getElementById('compare-label-1').textContent;
        const label2 = document.getElementById('compare-label-2').textContent;
        if (!src1 || !src2) { showToast('Load two photos first'); return; }

        showToast('Building your comparison...');

        try {
            const [img1, img2] = await Promise.all([loadImg(src1), loadImg(src2)]);

            // Each half is a 3:4 portrait panel. Size from the larger source so we
            // don't upscale and lose quality.
            const panelW = Math.max(img1.width, img2.width, 800);
            const panelH = Math.round(panelW * 4 / 3);
            const divider = Math.max(6, Math.round(panelW * 0.012)); // orange divider width
            const pad = Math.round(panelW * 0.04);                   // black border around everything
            const footer = Math.round(panelW * 0.13);                // space for the watermark

            const canvas = document.createElement('canvas');
            canvas.width = pad * 2 + panelW * 2 + divider;
            canvas.height = pad * 2 + panelH + footer;
            const ctx = canvas.getContext('2d');

            // --- Slight black background ---
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- Draw each photo, cover-cropped into its panel ---
            function drawCover(img, dx, dy, dw, dh) {
                const scale = Math.max(dw / img.width, dh / img.height);
                const sw = dw / scale;
                const sh = dh / scale;
                const sx = (img.width - sw) / 2;
                const sy = (img.height - sh) / 2;
                ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
            }
            const y = pad;
            drawCover(img1, pad, y, panelW, panelH);
            drawCover(img2, pad + panelW + divider, y, panelW, panelH);

            // --- Orange dividing line down the middle ---
            ctx.fillStyle = '#f97316';
            ctx.fillRect(pad + panelW, y, divider, panelH);

            // --- Orange outline around the whole photo strip ---
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = Math.max(3, Math.round(panelW * 0.006));
            ctx.strokeRect(pad, y, panelW * 2 + divider, panelH);

            // --- Date labels (black pill, orange text) ---
            const fontSize = Math.round(panelW * 0.055);
            ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
            ctx.textBaseline = 'middle';

            function drawLabel(text, cx, cy) {
                const tw = ctx.measureText(text).width;
                const bx = Math.round(fontSize * 0.6);
                const by = Math.round(fontSize * 0.45);
                const bw = tw + bx * 2;
                const bh = fontSize + by * 2;
                const lx = cx;
                const ly = cy;
                ctx.fillStyle = 'rgba(0,0,0,0.82)';
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(lx, ly, bw, bh, Math.round(fontSize * 0.35));
                    ctx.fill();
                } else {
                    ctx.fillRect(lx, ly, bw, bh);
                }
                ctx.strokeStyle = '#f97316';
                ctx.lineWidth = 2;
                if (ctx.roundRect) ctx.stroke();
                ctx.fillStyle = '#fb923c';
                ctx.fillText(text, lx + bx, ly + bh / 2);
            }
            const lblY = y + Math.round(panelW * 0.04);
            drawLabel(label1, pad + Math.round(panelW * 0.04), lblY);
            drawLabel(label2, pad + panelW + divider + Math.round(panelW * 0.04), lblY);

            // --- WATERMARK: "VFIT App" bottom-right corner ---
            const wmSize = Math.round(panelW * 0.07);
            ctx.font = `900 ${wmSize}px system-ui, -apple-system, sans-serif`;
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'right';
            const wmX = canvas.width - pad;
            const wmY = canvas.height - Math.round(footer * 0.32);
            // subtle shadow so it reads on any photo
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#f97316';
            ctx.fillText('VFIT App', wmX, wmY);
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';

            // --- Render to a blob and show full-screen ---
            canvas.toBlob((blob) => {
                if (!blob) { showToast('Could not build the image'); return; }
                comparisonBlob = blob;
                const url = URL.createObjectURL(blob);
                const resultImg = document.getElementById('comparison-result-img');
                if (resultImg) resultImg.src = url;
                document.getElementById('comparison-result-modal').style.display = 'flex';
                refreshIcons();
            }, 'image/jpeg', 0.92);

        } catch (err) {
            console.error('Comparison image error:', err);
            showToast('Could not build the comparison image');
        }
    }

    // ==========================================================================
    // COMPARE PROGRESS — body metrics, weight, and weight lifted
    // ==========================================================================
    // Same idea as the photo comparison: pick two dates, see the before/after,
    // then build a shareable image with the orange divider and VFIT watermark.

    let compareMode = 'body';        // 'body' | 'lifts'
    let progressRows = [];           // the rows currently being compared (for the image)
    let progressHeadline = null;     // the standout stat, drawn large on the image

    const BODY_FIELDS = [
        { key: 'weight',    label: 'Weight',    unit: 'kg', lowerIsBetter: true },
        { key: 'chest',     label: 'Chest',     unit: 'cm', lowerIsBetter: false },
        { key: 'shoulders', label: 'Shoulders', unit: 'cm', lowerIsBetter: false },
        { key: 'arms',      label: 'Arms',      unit: 'cm', lowerIsBetter: false },
        { key: 'waist',     label: 'Waist',     unit: 'cm', lowerIsBetter: true },
        { key: 'legs',      label: 'Legs',      unit: 'cm', lowerIsBetter: false },
        { key: 'glutes',    label: 'Glutes',    unit: 'cm', lowerIsBetter: false }
    ];

    function openCompareProgress() {
        compareMode = 'body';
        setCompareMode('body');
        document.getElementById('compare-progress-modal').style.display = 'flex';
        refreshIcons();
    }

    function closeCompareProgress() {
        document.getElementById('compare-progress-modal').style.display = 'none';
    }

    let trendRange = '90';   // '90' | '180' | 'all'
    let trendSeries = [];    // [{date, value}] for the chosen metric/lift
    let trendMeta = null;    // { label, unit, good }

    function setCompareMode(mode) {
        compareMode = mode;
        const on = 'flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase bg-white text-indigo-600 shadow-sm';
        const off = 'flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase text-slate-400';
        const b = document.getElementById('cmp-mode-body');
        const l = document.getElementById('cmp-mode-lifts');
        const t = document.getElementById('cmp-mode-trend');
        if (b) b.className = (mode === 'body') ? on : off;
        if (l) l.className = (mode === 'lifts') ? on : off;
        if (t) t.className = (mode === 'trend') ? on : off;

        // Trend mode swaps the two date pickers for a single "what to track" picker
        const dateCtrls = document.getElementById('cmp-date-controls');
        const trendCtrls = document.getElementById('cmp-trend-controls');
        const canvas = document.getElementById('cmp-trend-canvas');
        if (mode === 'trend') {
            if (dateCtrls) dateCtrls.classList.add('hidden');
            if (trendCtrls) trendCtrls.classList.remove('hidden');
            populateTrendPicker();
        } else {
            if (dateCtrls) dateCtrls.classList.remove('hidden');
            if (trendCtrls) trendCtrls.classList.add('hidden');
            if (canvas) canvas.classList.add('hidden');
            populateCompareDates();
        }
        loadProgressComparison();
    }

    function setTrendRange(range) {
        trendRange = range;
        const on = 'flex-1 py-2 rounded-lg text-[10px] font-black uppercase bg-white text-indigo-600 shadow-sm';
        const off = 'flex-1 py-2 rounded-lg text-[10px] font-black uppercase text-slate-400';
        ['90', '180', 'all'].forEach(r => {
            const el = document.getElementById('cmp-range-' + r);
            if (el) el.className = (r === range) ? on : off;
        });
        loadProgressComparison();
    }

    /** Populate the trend picker with every measurement and every logged lift. */
    function populateTrendPicker() {
        const sel = document.getElementById('cmp-trend-pick');
        if (!sel) return;
        const prev = sel.value;

        // Measurements that actually have data
        const bodyOpts = BODY_FIELDS.filter(f =>
            (state.metricsHistory || []).some(m => m[f.key] !== undefined && m[f.key] !== null && m[f.key] !== '')
        ).map(f => `<option value="body:${f.key}">${f.label}</option>`).join('');

        // Every exercise ever logged with a weight
        const lifts = new Set();
        (state.workoutHistory || []).forEach(w => {
            (w.exercises || []).forEach(ex => {
                const hasWeight = (ex.sets || []).some(s => !isNaN(parseFloat(s.weight)));
                if (ex.name && hasWeight) lifts.add(ex.name);
            });
        });
        const liftOpts = Array.from(lifts).sort()
            .map(n => `<option value="lift:${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

        sel.innerHTML = '<option value="">Choose what to track...</option>'
            + (bodyOpts ? `<optgroup label="Body">${bodyOpts}</optgroup>` : '')
            + (liftOpts ? `<optgroup label="Lifts">${liftOpts}</optgroup>` : '');

        if (prev) sel.value = prev;
        // Default to Weight if nothing chosen yet
        if (!sel.value && bodyOpts) sel.value = 'body:weight';
    }

    /** Build the time series for whatever is selected in the trend picker. */
    function buildTrendSeries() {
        const sel = document.getElementById('cmp-trend-pick');
        const pick = sel ? sel.value : '';
        trendSeries = [];
        trendMeta = null;
        if (!pick) return;

        // Cut-off for the selected range
        let cutoff = null;
        if (trendRange !== 'all') {
            const days = parseInt(trendRange, 10);
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - days);
            cutoff = localDateKey(d);
        }

        if (pick.startsWith('body:')) {
            const key = pick.slice(5);
            const field = BODY_FIELDS.find(f => f.key === key);
            if (!field) return;
            trendMeta = { label: field.label, unit: field.unit, lowerIsBetter: field.lowerIsBetter };
            (state.metricsHistory || []).forEach(m => {
                if (!m.date) return;
                if (cutoff && m.date < cutoff) return;
                const v = parseFloat(m[key]);
                if (isNaN(v)) return;
                trendSeries.push({ date: m.date, value: v });
            });
        } else if (pick.startsWith('lift:')) {
            const name = pick.slice(5);
            const assisted = isAssistanceExercise(name);
            trendMeta = { label: name, unit: 'kg', lowerIsBetter: assisted };
            (state.workoutHistory || []).forEach(w => {
                if (!w.date) return;
                if (cutoff && w.date < cutoff) return;
                let best = assisted ? null : 0;
                (w.exercises || []).forEach(ex => {
                    if (ex.name !== name) return;
                    (ex.sets || []).forEach(s => {
                        const kg = parseFloat(s.weight);
                        if (isNaN(kg)) return;
                        if (assisted) { if (best === null || kg < best) best = kg; }
                        else { if (kg > best) best = kg; }
                    });
                });
                if (best !== null && best >= 0 && (assisted || best > 0)) trendSeries.push({ date: w.date, value: best });
            });
        }
        trendSeries.sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Draw the trend line onto a canvas. Used for both the on-screen preview and
     * the shareable image (same renderer, different size), so what you see is what
     * you share.
     */
    function drawTrendChart(canvas, opts) {
        opts = opts || {};
        const forShare = !!opts.forShare;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        const padL = forShare ? 110 : 46;
        const padR = forShare ? 60 : 16;
        const padT = forShare ? (opts.topOffset || 60) : 18;
        const padB = forShare ? 90 : 34;

        // Background
        ctx.fillStyle = forShare ? '#0a0a0a' : '#000000';
        ctx.fillRect(0, 0, W, H);

        if (trendSeries.length < 2) {
            ctx.fillStyle = '#9a6a3a';
            ctx.font = `bold ${forShare ? 32 : 14}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('Not enough data to chart', W / 2, H / 2);
            ctx.textAlign = 'left';
            return;
        }

        const values = trendSeries.map(p => p.value);
        let min = Math.min(...values), max = Math.max(...values);
        if (min === max) { min -= 1; max += 1; }           // flat line — give it room
        const span = max - min;
        min -= span * 0.12;
        max += span * 0.12;

        const plotW = W - padL - padR;
        const plotH = H - padT - padB;
        const xAt = i => padL + (i / (trendSeries.length - 1)) * plotW;
        const yAt = v => padT + plotH - ((v - min) / (max - min)) * plotH;

        // Grid lines + Y labels
        ctx.strokeStyle = 'rgba(249,115,22,0.18)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#9a6a3a';
        ctx.font = `${forShare ? 24 : 10}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        for (let g = 0; g <= 4; g++) {
            const v = min + (max - min) * (g / 4);
            const y = yAt(v);
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(W - padR, y);
            ctx.stroke();
            ctx.fillText(v.toFixed(1), padL - (forShare ? 16 : 6), y + (forShare ? 8 : 3));
        }
        ctx.textAlign = 'left';

        // Area fill under the line
        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, 'rgba(249,115,22,0.35)');
        grad.addColorStop(1, 'rgba(249,115,22,0.02)');
        ctx.beginPath();
        ctx.moveTo(xAt(0), padT + plotH);
        trendSeries.forEach((p, i) => ctx.lineTo(xAt(i), yAt(p.value)));
        ctx.lineTo(xAt(trendSeries.length - 1), padT + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // The orange line
        ctx.beginPath();
        trendSeries.forEach((p, i) => {
            const x = xAt(i), y = yAt(p.value);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = forShare ? 7 : 3;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Points
        trendSeries.forEach((p, i) => {
            const x = xAt(i), y = yAt(p.value);
            ctx.beginPath();
            ctx.arc(x, y, forShare ? 9 : 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fb923c';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = forShare ? 3 : 1.5;
            ctx.stroke();
        });

        // First/last date labels
        ctx.fillStyle = '#9a6a3a';
        ctx.font = `${forShare ? 24 : 10}px system-ui, sans-serif`;
        const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        ctx.textAlign = 'left';
        ctx.fillText(fmt(trendSeries[0].date), padL, H - padB + (forShare ? 40 : 18));
        ctx.textAlign = 'right';
        ctx.fillText(fmt(trendSeries[trendSeries.length - 1].date), W - padR, H - padB + (forShare ? 40 : 18));
        ctx.textAlign = 'left';
    }

    /** Dates that have data for the current mode. */
    function getComparableDates() {
        if (compareMode === 'body') {
            return (state.metricsHistory || [])
                .filter(m => BODY_FIELDS.some(f => m[f.key] !== undefined && m[f.key] !== null && m[f.key] !== ''))
                .map(m => m.date)
                .filter(Boolean);
        }
        // lifts: dates where a workout was logged
        const set = new Set();
        (state.workoutHistory || []).forEach(w => { if (w.date) set.add(w.date); });
        return Array.from(set);
    }

    function populateCompareDates() {
        const dates = getComparableDates().slice().sort((a, b) => (b || '').localeCompare(a || ''));
        const s1 = document.getElementById('cmp-date-1');
        const s2 = document.getElementById('cmp-date-2');
        if (!s1 || !s2) return;

        const opts = dates.map(d => {
            const label = new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            return `<option value="${d}">${label}</option>`;
        }).join('');
        s1.innerHTML = '<option value="">Select date...</option>' + opts;
        s2.innerHTML = '<option value="">Select date...</option>' + opts;

        // Auto-pick the oldest and newest so there's something to see straight away
        if (dates.length >= 2) {
            s1.value = dates[dates.length - 1]; // oldest
            s2.value = dates[0];                // newest
        }
    }

    /** Best set for an exercise on or before a date. For assisted exercises the
     *  best is the LOWEST weight (least assistance); otherwise the heaviest. */
    function bestLiftUpTo(exerciseName, date) {
        const assisted = isAssistanceExercise(exerciseName);
        let best = assisted ? null : 0;
        (state.workoutHistory || []).forEach(w => {
            if (!w.date || w.date > date) return;
            (w.exercises || []).forEach(ex => {
                if (ex.name !== exerciseName) return;
                (ex.sets || []).forEach(s => {
                    const kg = parseFloat(s.weight);
                    if (isNaN(kg)) return;
                    if (assisted) { if (best === null || kg < best) best = kg; }
                    else { if (kg > best) best = kg; }
                });
            });
        });
        return best === null ? 0 : best;
    }

    // Resolve the bodyweight used for a lift: prefer an entry on that date,
    // otherwise use the most recent logged weight at or before it.
    function getBodyweightForDate(dateKey) {
        const rows = (state.metricsHistory || []).filter(m => parseFloat(m.weight) > 0 && m.date);
        if (!rows.length) return null;
        const exact = rows.find(m => m.date === dateKey);
        const prior = rows.filter(m => m.date <= dateKey).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        const fallback = prior || rows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        return fallback ? { weight: parseFloat(fallback.weight), date: fallback.date } : null;
    }

    function bestLiftRecordUpTo(exerciseName, date, useRelative) {
        const assisted = isAssistanceExercise(exerciseName);
        let best = null;
        (state.workoutHistory || []).forEach(w => {
            if (!w.date || w.date > date) return;
            const bw = useRelative ? getBodyweightForDate(w.date) : null;
            (w.exercises || []).forEach(ex => {
                if (ex.name !== exerciseName) return;
                (ex.sets || []).forEach(s => {
                    const kg = parseFloat(s.weight);
                    if (!Number.isFinite(kg)) return;
                    const value = useRelative && bw && bw.weight > 0 ? kg / bw.weight : kg;
                    if (!best || (assisted ? value < best.value : value > best.value)) best = { value, raw: kg, date: w.date, bodyweight: bw && bw.weight };
                });
            });
        });
        return best;
    }

    function loadProgressComparison() {
        const box = document.getElementById('cmp-results');
        const saveBtn = document.getElementById('cmp-save-btn');
        const canvas = document.getElementById('cmp-trend-canvas');
        if (!box) return;

        // ---- TREND MODE: chart one thing over time ----
        if (compareMode === 'trend') {
            buildTrendSeries();
            if (!trendMeta || trendSeries.length < 2) {
                if (canvas) canvas.classList.add('hidden');
                box.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">${trendMeta ? 'Need at least 2 entries in this range to show a trend.' : 'Choose what to track.'}</p>`;
                if (saveBtn) saveBtn.classList.add('hidden');
                return;
            }

            // Draw the on-screen preview (same renderer as the shared image)
            if (canvas) {
                canvas.classList.remove('hidden');
                const cssW = canvas.clientWidth || 600;
                canvas.width = cssW * 2;      // retina-sharp
                canvas.height = 280 * 2;
                canvas.style.height = '280px';
                drawTrendChart(canvas, { forShare: false });
            }

            const first = trendSeries[0].value;
            const last = trendSeries[trendSeries.length - 1].value;
            const delta = Math.round((last - first) * 10) / 10;
            const good = trendMeta.lowerIsBetter ? (last < first) : (last > first);
            const sign = delta > 0 ? '+' : '';
            const colour = delta === 0 ? 'text-slate-400' : (good ? 'text-emerald-600' : 'text-rose-500');

            box.innerHTML = `
                <div class="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <p class="text-[10px] font-black uppercase text-slate-400">${escapeHtml(trendMeta.label)}</p>
                        <p class="text-sm text-slate-500">${first}${trendMeta.unit} → <b>${last}${trendMeta.unit}</b> over ${trendSeries.length} entries</p>
                    </div>
                    <p class="text-2xl font-black ${colour}">${sign}${delta}${trendMeta.unit}</p>
                </div>`;
            if (saveBtn) saveBtn.classList.remove('hidden');
            refreshIcons();
            return;
        }

        if (canvas) canvas.classList.add('hidden');

        const d1 = document.getElementById('cmp-date-1').value;
        const d2 = document.getElementById('cmp-date-2').value;

        progressRows = [];
        progressHeadline = null;

        if (!d1 || !d2) {
            box.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Pick two dates to compare.</p>';
            if (saveBtn) saveBtn.classList.add('hidden');
            return;
        }
        if (d1 === d2) {
            box.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Pick two different dates.</p>';
            if (saveBtn) saveBtn.classList.add('hidden');
            return;
        }

        // Order so "from" is always the earlier date
        const from = d1 < d2 ? d1 : d2;
        const to   = d1 < d2 ? d2 : d1;

        if (compareMode === 'body') {
            const m1 = (state.metricsHistory || []).find(m => m.date === from) || {};
            const m2 = (state.metricsHistory || []).find(m => m.date === to) || {};
            BODY_FIELDS.forEach(f => {
                const a = parseFloat(m1[f.key]);
                const b = parseFloat(m2[f.key]);
                if (isNaN(a) || isNaN(b)) return; // need both to compare
                progressRows.push({
                    label: f.label, unit: f.unit,
                    before: a, after: b,
                    delta: Math.round((b - a) * 10) / 10,
                    good: f.lowerIsBetter ? (b < a) : (b > a)
                });
            });
        } else {
            const useRelative = !!document.getElementById('cmp-relative-toggle')?.checked;
            // Lifts: compare best weight for every exercise trained in the period
            const names = new Set();
            (state.workoutHistory || []).forEach(w => {
                if (!w.date || w.date > to) return;
                (w.exercises || []).forEach(ex => { if (ex.name) names.add(ex.name); });
            });
            names.forEach(name => {
                const ar = useRelative ? bestLiftRecordUpTo(name, from, true) : null;
                const br = useRelative ? bestLiftRecordUpTo(name, to, true) : null;
                const a = useRelative ? (ar ? ar.value : 0) : bestLiftUpTo(name, from);
                const b = useRelative ? (br ? br.value : 0) : bestLiftUpTo(name, to);
                if (b <= 0 || a === b) return;
                progressRows.push({
                    label: name, unit: useRelative ? '×BW' : 'kg',
                    before: a, after: b,
                    delta: Math.round((b - a) * 10) / 10,
                    good: isAssistanceExercise(name) ? (b < a) : (b > a),
                    detail: useRelative ? `Lift ${br.raw}kg ÷ ${br.bodyweight || '?'}kg BW` : ''
                });
            });
            // Biggest gains first
            progressRows.sort((x, y) => y.delta - x.delta);
        }

        if (progressRows.length === 0) {
            box.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">No ${compareMode === 'body' ? 'measurements' : 'lifts'} recorded on both dates.</p>`;
            if (saveBtn) saveBtn.classList.add('hidden');
            return;
        }

        // Headline = the biggest positive change
        const gains = progressRows.filter(r => r.good);
        if (gains.length > 0) {
            const top = gains.reduce((best, r) => Math.abs(r.delta) > Math.abs(best.delta) ? r : best, gains[0]);
            progressHeadline = top;
        }

        window.cmpFrom = from;
        window.cmpTo = to;

        box.innerHTML = progressRows.map(r => {
            const sign = r.delta > 0 ? '+' : '';
            const colour = r.good ? 'text-emerald-600' : 'text-rose-500';
            return `
                <div class="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                    <span class="font-bold text-sm flex-1 min-w-0 truncate">${escapeHtml(r.label)}</span>
                    <div class="flex items-center gap-2 flex-shrink-0 text-sm">
                        <span class="text-slate-400">${r.before}${r.unit}</span>
                        <i data-lucide="arrow-right" class="w-3.5 h-3.5 text-slate-300"></i>
                        <span class="font-black">${r.after}${r.unit}</span>
                        <span class="${colour} font-black w-16 text-right">${sign}${r.delta}${r.unit}</span>
                    </div>
                    ${r.detail ? `<div class="text-[10px] text-slate-400 mt-1 text-right">${escapeHtml(r.detail)}</div>` : ''}
                </div>`;
        }).join('');

        if (saveBtn) saveBtn.classList.remove('hidden');
        refreshIcons();
    }

    /**
     * Build the shareable progress image — same styling as the photo comparison:
     * black background, orange divider between Before and After, VFIT watermark.
     */
    function buildProgressImage() {
        if (compareMode === 'trend') { buildTrendImage(); return; }
        if (progressRows.length === 0) { showToast('Nothing to compare'); return; }
        showToast('Building your comparison...');

        const from = window.cmpFrom, to = window.cmpTo;
        const fromLbl = new Date(from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const toLbl = new Date(to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        // Cap rows so the card stays readable
        const rows = progressRows.slice(0, 10);

        const W = 1400;
        const pad = 60;
        const titleH = 130;
        const headlineH = progressHeadline ? 190 : 0;
        const rowH = 78;
        const footerH = 110;
        const H = pad * 2 + titleH + headlineH + rows.length * rowH + footerH;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // --- Slight black background ---
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);

        // --- Orange outline ---
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 5;
        ctx.strokeRect(pad / 2, pad / 2, W - pad, H - pad);

        ctx.textBaseline = 'middle';

        // --- Title ---
        ctx.fillStyle = '#fb923c';
        ctx.font = '900 54px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(compareMode === 'body' ? 'MY PROGRESS' : 'MY LIFTS', W / 2, pad + 40);
        ctx.fillStyle = '#f97316';
        ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${fromLbl}  →  ${toLbl}`, W / 2, pad + 92);

        let y = pad + titleH;

        // --- Headline stat (the biggest win) ---
        if (progressHeadline) {
            const h = progressHeadline;
            const sign = h.delta > 0 ? '+' : '';
            ctx.fillStyle = '#f97316';
            ctx.font = '900 96px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${sign}${h.delta}${h.unit}`, W / 2, y + 55);
            ctx.fillStyle = '#fdba74';
            ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
            ctx.fillText(h.label.toUpperCase(), W / 2, y + 125);
            y += headlineH;
        }

        // --- Rows: label | before | orange divider | after | delta ---
        const colL = pad + 40;
        const colBefore = W * 0.52;
        const colAfter = W * 0.70;
        const colDelta = W - pad - 40;
        const dividerX = W * 0.61;

        // One continuous orange divider down the middle of the rows
        ctx.fillStyle = '#f97316';
        ctx.fillRect(dividerX - 3, y, 6, rows.length * rowH);

        rows.forEach((r, i) => {
            const cy = y + i * rowH + rowH / 2;

            // subtle row striping so it's readable
            if (i % 2 === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.035)';
                ctx.fillRect(pad, y + i * rowH, W - pad * 2, rowH);
            }

            ctx.textAlign = 'left';
            ctx.fillStyle = '#fdba74';
            ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
            const name = r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label;
            ctx.fillText(name, colL, cy);

            ctx.textAlign = 'right';
            ctx.fillStyle = '#9a6a3a';
            ctx.font = '32px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${r.before}${r.unit}`, colBefore, cy);

            ctx.textAlign = 'left';
            ctx.fillStyle = '#fb923c';
            ctx.font = '900 36px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${r.after}${r.unit}`, colAfter, cy);

            ctx.textAlign = 'right';
            const sign = r.delta > 0 ? '+' : '';
            ctx.fillStyle = r.good ? '#22c55e' : '#ef4444';
            ctx.font = '900 34px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${sign}${r.delta}${r.unit}`, colDelta, cy);
        });

        // --- WATERMARK: bottom-right ---
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '900 44px system-ui, -apple-system, sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#f97316';
        ctx.fillText('VFIT App', W - pad, H - 45);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';

        canvas.toBlob((blob) => {
            if (!blob) { showToast('Could not build the image'); return; }
            comparisonBlob = blob; // reuse the same save/share pipeline as photos
            const url = URL.createObjectURL(blob);
            const resultImg = document.getElementById('comparison-result-img');
            if (resultImg) resultImg.src = url;
            document.getElementById('comparison-result-modal').style.display = 'flex';
            refreshIcons();
        }, 'image/jpeg', 0.92);
    }

    /**
     * Shareable TREND card: headline change, the chart over time, and the VFIT
     * watermark. Uses the same drawTrendChart renderer as the on-screen preview.
     */
    function buildTrendImage() {
        if (!trendMeta || trendSeries.length < 2) { showToast('Not enough data to chart'); return; }
        showToast('Building your trend...');

        const W = 1400;
        const H = 1150;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Background + orange frame
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 5;
        ctx.strokeRect(30, 30, W - 60, H - 60);

        const first = trendSeries[0].value;
        const last = trendSeries[trendSeries.length - 1].value;
        const delta = Math.round((last - first) * 10) / 10;
        const good = trendMeta.lowerIsBetter ? (last < first) : (last > first);
        const sign = delta > 0 ? '+' : '';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.fillStyle = '#fb923c';
        ctx.font = '900 52px system-ui, -apple-system, sans-serif';
        ctx.fillText(trendMeta.label.toUpperCase(), W / 2, 110);

        // Range subtitle
        const rangeLabel = trendRange === 'all' ? 'All time'
            : (trendRange === '90' ? 'Last 3 months' : 'Last 6 months');
        ctx.fillStyle = '#9a6a3a';
        ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
        ctx.fillText(rangeLabel + ` · ${trendSeries.length} entries`, W / 2, 160);

        // Headline change
        ctx.fillStyle = delta === 0 ? '#9a6a3a' : (good ? '#22c55e' : '#ef4444');
        ctx.font = '900 110px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${sign}${delta}${trendMeta.unit}`, W / 2, 250);

        // Before → After
        ctx.fillStyle = '#fdba74';
        ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${first}${trendMeta.unit}  →  ${last}${trendMeta.unit}`, W / 2, 325);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        // --- The chart itself, drawn into an offscreen canvas then composited ---
        const chartH = 640;
        const chart = document.createElement('canvas');
        chart.width = W - 120;
        chart.height = chartH;
        drawTrendChart(chart, { forShare: true, topOffset: 40 });
        ctx.drawImage(chart, 60, 370);

        // Orange outline around the chart area
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3;
        ctx.strokeRect(60, 370, W - 120, chartH);

        // --- WATERMARK bottom-right ---
        ctx.textAlign = 'right';
        ctx.font = '900 44px system-ui, -apple-system, sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#f97316';
        ctx.fillText('VFIT App', W - 60, H - 55);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';

        canvas.toBlob((blob) => {
            if (!blob) { showToast('Could not build the image'); return; }
            comparisonBlob = blob; // reuse the shared save/share pipeline
            const url = URL.createObjectURL(blob);
            const resultImg = document.getElementById('comparison-result-img');
            if (resultImg) resultImg.src = url;
            document.getElementById('comparison-result-modal').style.display = 'flex';
            refreshIcons();
        }, 'image/jpeg', 0.92);
    }

    function closeComparisonResult() {
        const modal = document.getElementById('comparison-result-modal');
        if (modal) modal.style.display = 'none';
        const img = document.getElementById('comparison-result-img');
        if (img && img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    }

    function comparisonFileName() {
        const d = localDateKey();
        return `VFIT-progress-${d}.jpg`;
    }

    function downloadComparisonImage() {
        if (!comparisonBlob) { showToast('Nothing to save yet'); return; }
        const url = URL.createObjectURL(comparisonBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = comparisonFileName();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Comparison saved 📸');
    }

    async function shareComparisonImage() {
        if (!comparisonBlob) { showToast('Nothing to share yet'); return; }
        const file = new File([comparisonBlob], comparisonFileName(), { type: 'image/jpeg' });

        // Use the native share sheet where it's available (phones), so it can go
        // straight to WhatsApp/Instagram/Messages.
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'My VFIT Progress',
                    text: 'My progress — tracked with VFIT App'
                });
            } catch (err) {
                if (err && err.name !== 'AbortError') {
                    console.warn('Share failed:', err);
                    showToast('Sharing not available — saving instead');
                    downloadComparisonImage();
                }
            }
        } else {
            // Desktop / unsupported browsers: fall back to a download
            showToast('Sharing not supported here — saving instead');
            downloadComparisonImage();
        }
    }

    // ==========================================================================
    // EXERCISE PROGRESS MODAL
    // ==========================================================================

    let exerciseProgressChart = null;

    function openExerciseProgressModal() {
        document.getElementById('exercise-progress-modal').style.display = 'flex';

        // Populate exercise dropdown with exercises that have been logged
        const exerciseSet = new Set();
        (state.workoutHistory || []).forEach(w => {
            (w.exercises || []).forEach(ex => exerciseSet.add(ex.name));
        });

        const sortedExercises = [...exerciseSet].sort();
        const select = document.getElementById('exercise-select');
        select.innerHTML = '<option value="">Choose an exercise...</option>' +
            sortedExercises.map(ex => `<option value="${ex}">${ex}</option>`).join('');

        // Reset to empty state
        document.getElementById('exercise-progress-stats').classList.add('hidden');
        document.getElementById('exercise-progress-chart-container').classList.add('hidden');
        document.getElementById('exercise-progress-empty').classList.remove('hidden');

        refreshIcons();
    }

    function closeExerciseProgressModal() {
        document.getElementById('exercise-progress-modal').style.display = 'none';
        if (exerciseProgressChart) { exerciseProgressChart.destroy(); exerciseProgressChart = null; }
    }

    function renderExerciseProgressChart() {
        const exerciseName = document.getElementById('exercise-select').value;
        if (!exerciseName) {
            document.getElementById('exercise-progress-stats').classList.add('hidden');
            document.getElementById('exercise-progress-chart-container').classList.add('hidden');
            document.getElementById('exercise-progress-empty').classList.remove('hidden');
            return;
        }

        // Gather data points for this exercise (date + max weight that day)
        const dataPoints = [];
        (state.workoutHistory || []).forEach(w => {
            (w.exercises || []).forEach(ex => {
                if (ex.name === exerciseName) {
                    let maxWeight = 0;
                    let totalReps = 0;
                    (ex.sets || []).forEach(s => {
                        const weight = parseFloat(s.weight) || 0;
                        const reps = parseInt(s.reps) || 0;
                        if (weight > maxWeight) maxWeight = weight;
                        totalReps += reps;
                    });
                    if (maxWeight > 0) {
                        dataPoints.push({ date: w.date, weight: maxWeight, reps: totalReps });
                    }
                }
            });
        });

        if (dataPoints.length === 0) {
            document.getElementById('exercise-progress-empty').classList.remove('hidden');
            document.getElementById('exercise-progress-stats').classList.add('hidden');
            document.getElementById('exercise-progress-chart-container').classList.add('hidden');
            return;
        }

        dataPoints.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const useRelative = !!document.getElementById('exercise-progress-relative-toggle')?.checked;
        if (useRelative) {
            dataPoints.forEach(d => {
                const bw = getBodyweightForDate(d.date);
                d.bodyweight = bw && bw.weight;
                if (d.bodyweight > 0) d.displayWeight = d.weight / d.bodyweight;
            });
        }
        const plotted = dataPoints.filter(d => !useRelative || d.displayWeight > 0);

        // Show stats and chart sections
        document.getElementById('exercise-progress-empty').classList.add('hidden');
        document.getElementById('exercise-progress-stats').classList.remove('hidden');
        document.getElementById('exercise-progress-chart-container').classList.remove('hidden');

        const currentMax = Math.max(...plotted.map(d => useRelative ? d.displayWeight : d.weight));
        const startingWeight = useRelative ? plotted[0].displayWeight : plotted[0].weight;
        const totalGain = currentMax - startingWeight;
        const workoutCount = dataPoints.length;

        const unit = useRelative ? '×BW' : 'kg';
        document.getElementById('exercise-current-max').textContent = currentMax.toFixed(2) + unit;
        document.getElementById('exercise-starting-weight').textContent = startingWeight.toFixed(2) + unit;
        document.getElementById('exercise-total-gain').textContent = (totalGain >= 0 ? '+' : '') + totalGain.toFixed(2) + unit;
        document.getElementById('exercise-workout-count').textContent = workoutCount;

        // Render chart
        const canvas = document.getElementById('exercise-progress-chart');
        if (exerciseProgressChart) exerciseProgressChart.destroy();
        if (!chartLibraryReady(canvas)) return;

        exerciseProgressChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: plotted.map(d => new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
                datasets: [{
                    label: useRelative ? 'Max weight per kg bodyweight' : 'Max Weight (kg)',
                    data: plotted.map(d => useRelative ? d.displayWeight : d.weight),
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: false, grid: { color: '#e2e8f0' } },
                    x: { grid: { display: false } }
                }
            }
        });

        // Insights
        const insights = document.getElementById('exercise-insights');
        const insightsList = [];
        if (totalGain > 0) {
            insightsList.push(`<p class="flex items-start gap-2"><i data-lucide="trending-up" class="w-3 h-3 text-emerald-500 mt-1"></i><span>You've gained <b>${totalGain.toFixed(1)}kg</b> on this exercise since you started!</span></p>`);
        } else if (totalGain < 0) {
            insightsList.push(`<p class="flex items-start gap-2"><i data-lucide="trending-down" class="w-3 h-3 text-amber-500 mt-1"></i><span>Current max is <b>${Math.abs(totalGain).toFixed(1)}kg</b> below your starting weight. Consider a deload week.</span></p>`);
        }
        if (workoutCount >= 5) {
            insightsList.push(`<p class="flex items-start gap-2"><i data-lucide="award" class="w-3 h-3 text-purple-500 mt-1"></i><span>Solid consistency — <b>${workoutCount} sessions</b> logged with this lift.</span></p>`);
        }
        insights.innerHTML = insightsList.join('') || '<p class="text-slate-400 italic">Keep logging to see progress insights.</p>';

        refreshIcons();
    }

    // ==========================================================================
    // CALORIE TRACKING CHART (with weeks scope fix)
    // ==========================================================================

    let calorieChart = null;
    let calorieChartView = 'daily';

    function openCalorieChartModal() {
        document.getElementById('calorie-chart-modal').style.display = 'flex';
        const goalInput = document.getElementById('maintenance-calories-input');
        if (goalInput) goalInput.value = state.goals.calories || 2500;
        setCalorieChartView('daily');
    }

    function closeCalorieChartModal() {
        document.getElementById('calorie-chart-modal').style.display = 'none';
        if (calorieChart) { calorieChart.destroy(); calorieChart = null; }
    }

    function setCalorieChartView(view) {
        calorieChartView = view;
        const dailyBtn = document.getElementById('calorie-view-daily');
        const weeklyBtn = document.getElementById('calorie-view-weekly');
        const statsDaily = document.getElementById('calorie-stats-daily');
        const statsWeekly = document.getElementById('calorie-stats-weekly');

        if (view === 'daily') {
            dailyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl bg-white text-emerald-600 shadow-sm';
            weeklyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl text-slate-400';
            statsDaily.classList.remove('hidden');
            statsWeekly.classList.add('hidden');
        } else {
            dailyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl text-slate-400';
            weeklyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl bg-white text-emerald-600 shadow-sm';
            statsDaily.classList.add('hidden');
            statsWeekly.classList.remove('hidden');
        }
        renderCalorieTrackingChart();
    }

    function updateMaintenanceCalories(value) {
        const v = parseInt(value) || 2500;
        state.goals.calories = v;
        saveState();
        renderCalorieTrackingChart();
        renderDashboard();
    }

    /**
     * Render the calorie tracking chart in either daily or weekly view.
     * FIXED: `weeks` is now declared at the top so it's in scope for the daily branch too.
     */
    function renderCalorieTrackingChart() {
        const canvas = document.getElementById('calorie-tracking-chart');
        if (!canvas) return;

        const target = state.goals.calories || 2500;
        const history = (state.nutritionHistory || []).slice();

        let labels = [];
        let values = [];
        // FIXED: declare weeks at the top of function so it's in scope everywhere
        let weeks = [];

        if (calorieChartView === 'daily') {
            // Take the most recent 14 days that have entries
            const sorted = history.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            const last14 = sorted.slice(-14);

            labels = last14.map(h => new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
            values = last14.map(h => Math.round(h.calories || 0));

            // Daily stats
            if (values.length > 0) {
                const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
                document.getElementById('calorie-avg').textContent = avg.toLocaleString();
                document.getElementById('calorie-highest').textContent = Math.max(...values).toLocaleString();
                document.getElementById('calorie-lowest').textContent = Math.min(...values).toLocaleString();
                document.getElementById('calorie-days').textContent = values.length;
            } else {
                document.getElementById('calorie-avg').textContent = '0';
                document.getElementById('calorie-highest').textContent = '0';
                document.getElementById('calorie-lowest').textContent = '0';
                document.getElementById('calorie-days').textContent = '0';
            }
        } else {
            // Weekly: group by ISO week
            const byWeek = {};
            history.forEach(h => {
                const d = new Date(h.date);
                // Get ISO week start (Monday)
                const day = d.getDay() || 7;
                const monday = new Date(d);
                monday.setDate(d.getDate() - day + 1);
                const weekKey = localDateKey(monday);
                if (!byWeek[weekKey]) byWeek[weekKey] = { total: 0, days: 0, start: monday };
                byWeek[weekKey].total += h.calories || 0;
                byWeek[weekKey].days += 1;
            });

            weeks = Object.entries(byWeek)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-8);

            labels = weeks.map(([k, v]) => 'Week of ' + v.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
            values = weeks.map(([k, v]) => Math.round(v.total));

            // Weekly stats
            if (values.length > 0) {
                const currentWeek = weeks[weeks.length - 1];
                const total = currentWeek[1].total;
                const days = currentWeek[1].days;
                document.getElementById('calorie-week-total').textContent = Math.round(total).toLocaleString();
                document.getElementById('calorie-week-avg').textContent = Math.round(total / Math.max(days, 1)).toLocaleString();
                document.getElementById('calorie-week-highest').textContent = Math.max(...values).toLocaleString();
                document.getElementById('calorie-weeks-tracked').textContent = values.length;
            } else {
                document.getElementById('calorie-week-total').textContent = '0';
                document.getElementById('calorie-week-avg').textContent = '0';
                document.getElementById('calorie-week-highest').textContent = '0';
                document.getElementById('calorie-weeks-tracked').textContent = '0';
            }
        }

        // Calculate maintenance target for chart (multiply by 7 for weekly)
        const targetLine = calorieChartView === 'daily' ? target : target * 7;

        if (calorieChart) calorieChart.destroy();
        if (!chartLibraryReady(canvas)) return;

        calorieChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Calories',
                        data: values,
                        backgroundColor: values.map(v => v > targetLine ? 'rgba(244, 63, 94, 0.7)' : 'rgba(16, 185, 129, 0.7)'),
                        borderColor: values.map(v => v > targetLine ? '#f43f5e' : '#10b981'),
                        borderWidth: 2,
                        borderRadius: 8
                    },
                    {
                        label: 'Target',
                        data: values.map(() => targetLine),
                        type: 'line',
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        fill: false,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#e2e8f0' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ==========================================================================
    // PROTEIN CHART
    // ==========================================================================

    let proteinChart = null;
    let proteinChartView = 'daily';

    function openProteinChartModal() {
        document.getElementById('calorie-chart-modal').style.display = 'none';
        document.getElementById('protein-chart-modal').style.display = 'flex';
        const goalInput = document.getElementById('protein-goal-input');
        if (goalInput) goalInput.value = state.proteinGoal || 150;
        setProteinChartView('daily');
    }

    function closeProteinChartModal() {
        document.getElementById('protein-chart-modal').style.display = 'none';
        if (proteinChart) { proteinChart.destroy(); proteinChart = null; }
    }

    function setProteinChartView(view) {
        proteinChartView = view;
        const dailyBtn = document.getElementById('protein-view-daily');
        const weeklyBtn = document.getElementById('protein-view-weekly');
        const statsDaily = document.getElementById('protein-stats-daily');
        const statsWeekly = document.getElementById('protein-stats-weekly');

        if (view === 'daily') {
            dailyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl bg-white text-rose-600 shadow-sm';
            weeklyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl text-slate-400';
            statsDaily.classList.remove('hidden');
            statsWeekly.classList.add('hidden');
        } else {
            dailyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl text-slate-400';
            weeklyBtn.className = 'flex-1 py-3 text-xs font-black uppercase rounded-xl bg-white text-rose-600 shadow-sm';
            statsDaily.classList.add('hidden');
            statsWeekly.classList.remove('hidden');
        }
        renderProteinTrackingChart();
    }

    function updateProteinGoal(value) {
        const v = parseInt(value) || 150;
        state.proteinGoal = v;
        saveState();
        renderProteinTrackingChart();
    }

    function renderProteinTrackingChart() {
        const canvas = document.getElementById('protein-tracking-chart');
        if (!canvas) return;

        const target = state.proteinGoal || 150;
        const history = (state.nutritionHistory || []).slice();

        let labels = [];
        let values = [];
        let weeks = [];

        if (proteinChartView === 'daily') {
            const sorted = history.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            const last14 = sorted.slice(-14);

            labels = last14.map(h => new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
            values = last14.map(h => Math.round(h.protein || 0));

            if (values.length > 0) {
                const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
                document.getElementById('protein-avg').textContent = avg + 'g';
                document.getElementById('protein-highest').textContent = Math.max(...values) + 'g';
                document.getElementById('protein-lowest').textContent = Math.min(...values) + 'g';
                document.getElementById('protein-days').textContent = values.length;
            } else {
                document.getElementById('protein-avg').textContent = '0g';
                document.getElementById('protein-highest').textContent = '0g';
                document.getElementById('protein-lowest').textContent = '0g';
                document.getElementById('protein-days').textContent = '0';
            }
        } else {
            const byWeek = {};
            history.forEach(h => {
                const d = new Date(h.date);
                const day = d.getDay() || 7;
                const monday = new Date(d);
                monday.setDate(d.getDate() - day + 1);
                const weekKey = localDateKey(monday);
                if (!byWeek[weekKey]) byWeek[weekKey] = { total: 0, days: 0, start: monday };
                byWeek[weekKey].total += h.protein || 0;
                byWeek[weekKey].days += 1;
            });

            weeks = Object.entries(byWeek)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-8);

            labels = weeks.map(([k, v]) => 'Week of ' + v.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
            values = weeks.map(([k, v]) => Math.round(v.total));

            if (values.length > 0) {
                const currentWeek = weeks[weeks.length - 1];
                const total = currentWeek[1].total;
                const days = currentWeek[1].days;
                document.getElementById('protein-week-total').textContent = Math.round(total) + 'g';
                document.getElementById('protein-week-avg').textContent = Math.round(total / Math.max(days, 1)) + 'g';
                document.getElementById('protein-week-highest').textContent = Math.max(...values) + 'g';
                document.getElementById('protein-weeks-tracked').textContent = values.length;
            } else {
                document.getElementById('protein-week-total').textContent = '0g';
                document.getElementById('protein-week-avg').textContent = '0g';
                document.getElementById('protein-week-highest').textContent = '0g';
                document.getElementById('protein-weeks-tracked').textContent = '0';
            }
        }

        const targetLine = proteinChartView === 'daily' ? target : target * 7;

        if (proteinChart) proteinChart.destroy();
        if (!chartLibraryReady(canvas)) return;

        proteinChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Protein',
                        data: values,
                        backgroundColor: values.map(v => v >= targetLine ? 'rgba(244, 63, 94, 0.7)' : 'rgba(244, 63, 94, 0.3)'),
                        borderColor: '#f43f5e',
                        borderWidth: 2,
                        borderRadius: 8
                    },
                    {
                        label: 'Target',
                        data: values.map(() => targetLine),
                        type: 'line',
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        fill: false,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#e2e8f0' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ==========================================================================
    // SETTINGS
    // ==========================================================================

    function updateCalorieGoal(value) {
        state.goals.calories = parseInt(value) || 2500;
        saveState();
        renderDashboard();
    }

    function saveSettings() {
        saveState();
        showToast('Settings saved! ✓');
    }

    /**
     * FIXED: Single canonical toggle function for the AI coach setting.
     */
    function toggleAICoach() {
        const checkbox = document.getElementById('ai-coach-enabled');
        state.aiCoachEnabled = checkbox.checked;
        saveState();

        const bubble = document.getElementById('ai-coach-bubble');
        if (bubble) {
            bubble.style.display = state.aiCoachEnabled ? 'block' : 'none';
        }
        renderAICoachCheckInSummary();
        if (!state.aiCoachEnabled) closeAICoachCheckIn();
        showToast(state.aiCoachEnabled ? 'AI Coach enabled' : 'AI Coach disabled');
    }

    function toggleEquipment(env, item) {
        if (!state.equipment[env]) state.equipment[env] = {};
        state.equipment[env][item] = !state.equipment[env][item];
        saveState();
        renderSettings();
    }

    function toggleHabits() {
        const checkbox = document.getElementById('habits-enabled');
        state.habitsEnabled = checkbox.checked;
        const section = document.getElementById('habits-section');
        if (section) section.classList.toggle('hidden', !state.habitsEnabled);
        const tracker = document.getElementById('habits-tracker');
        if (tracker) tracker.classList.toggle('hidden', !state.habitsEnabled);
        saveState();
        renderDashboard();
    }

    function addHabit() {
        const input = document.getElementById('new-habit-input');
        const name = input.value.trim();
        if (!name) { showToast('Enter habit name'); return; }
        if (!state.habits) state.habits = [];
        state.habits.push({ id: Date.now(), name: name });
        saveState();
        input.value = '';
        renderSettings();
        renderDashboard();
    }

    function removeHabit(id) {
        state.habits = (state.habits || []).filter(h => String(h.id) !== String(id));
        saveState();
        renderSettings();
        renderDashboard();
    }

    function toggleHabitCompletion(habitId) {
        const date = state.viewDate;
        if (!state.habitCompletions) state.habitCompletions = {};
        if (!state.habitCompletions[date]) state.habitCompletions[date] = {};
        state.habitCompletions[date][habitId] = !state.habitCompletions[date][habitId];
        saveState();
        renderDashboard();
    }

    function renderDashboardHabits() {
        const container = document.getElementById('dashboard-habits-list');
        if (!container) return;

        const habits = state.habits || [];
        if (habits.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic text-center">Add habits in Settings</p>';
            return;
        }

        const todayCompletions = (state.habitCompletions && state.habitCompletions[state.viewDate]) || {};

        container.innerHTML = habits.map(h => {
            const completed = todayCompletions[h.id];
            const id = escapeJsString(h.id);
            return `
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <span class="font-bold text-sm ${completed ? 'line-through text-slate-400' : ''}">${escapeHtml(h.name)}</span>
                    <button onclick="toggleHabitCompletion('${id}')" aria-label="${completed ? 'Mark incomplete' : 'Mark complete'}: ${escapeHtml(h.name || 'habit')}" class="w-10 h-10 rounded-xl flex items-center justify-center ${completed ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-200'}">
                        <i data-lucide="check" class="w-5 h-5 ${completed ? '' : 'text-transparent'}"></i>
                    </button>
                </div>`;
        }).join('');

        refreshIcons();
    }

    function toggleTracking(type) {
        if (type === 'hydration') {
            state.trackHydration = document.getElementById('track-hydration').checked;
            const tracker = document.getElementById('hydration-tracker');
            if (tracker) tracker.style.display = state.trackHydration ? '' : 'none';
        } else if (type === 'steps') {
            state.trackSteps = document.getElementById('track-steps').checked;
            const tracker = document.getElementById('steps-tracker');
            if (tracker) tracker.style.display = state.trackSteps ? '' : 'none';
        }
        saveState();
    }

    function renderSettings() {
        // Calorie goal
        const calInput = document.getElementById('calorie-goal-input');
        if (calInput) calInput.value = state.goals.calories || 2500;

        // About You button status (inputs live inside the modal, not here)
        renderAboutYouStatus();
        renderMaintenanceDisplay();
        renderDietGoal();
        updateExerciseDbStatus(); // "X of Y enabled · N custom" on the Exercise Database button

        // AI coach enabled
        const aiCheck = document.getElementById('ai-coach-enabled');
        if (aiCheck) aiCheck.checked = state.aiCoachEnabled !== false;

        // Habits
        const habitsCheck = document.getElementById('habits-enabled');
        if (habitsCheck) habitsCheck.checked = !!state.habitsEnabled;
        const habitsSection = document.getElementById('habits-section');
        if (habitsSection) habitsSection.classList.toggle('hidden', !state.habitsEnabled);
        const habitsList = document.getElementById('habits-list');
        if (habitsList) {
            const habits = state.habits || [];
            if (habits.length === 0) {
                habitsList.innerHTML = '<p class="text-xs text-slate-400 italic">No habits yet</p>';
            } else {
                habitsList.innerHTML = habits.map(h => `
                    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <span class="font-bold text-sm">${escapeHtml(h.name)}</span>
                        <button onclick="removeHabit('${escapeJsString(h.id)}')" class="w-8 h-8 bg-red-50 text-red-500 rounded-lg" aria-label="Remove ${escapeHtml(h.name || 'habit')}">×</button>
                    </div>`).join('');
            }
        }

        // Tracking toggles
        const trackHyd = document.getElementById('track-hydration');
        if (trackHyd) trackHyd.checked = state.trackHydration !== false;
        const trackSteps = document.getElementById('track-steps');
        if (trackSteps) trackSteps.checked = state.trackSteps !== false;

        // Equipment lists
        const gymList = document.getElementById('gym-equipment-list');
        if (gymList && state.equipment && state.equipment.gym) {
            gymList.innerHTML = Object.entries(state.equipment.gym).map(([item, enabled]) => `
                <label class="flex items-center gap-2 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                    <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleEquipment('gym', '${escapeJsString(item)}')" class="w-4 h-4 accent-indigo-600">
                    <span class="text-sm font-bold">${escapeHtml(item)}</span>
                </label>`).join('');
        }
        const homeList = document.getElementById('home-equipment-list');
        if (homeList && state.equipment && state.equipment.home) {
            homeList.innerHTML = Object.entries(state.equipment.home).map(([item, enabled]) => `
                <label class="flex items-center gap-2 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                    <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleEquipment('home', '${escapeJsString(item)}')" class="w-4 h-4 accent-indigo-600">
                    <span class="text-sm font-bold">${escapeHtml(item)}</span>
                </label>`).join('');
        }

        // Goals list — show focus emoji + details summary
        const goalsList = document.getElementById('goals-list');
        if (goalsList) {
            const goals = state.userGoals || [];
            if (goals.length === 0) {
                goalsList.innerHTML = '<p class="text-xs text-slate-400 italic">No goals set yet</p>';
            } else {
                goalsList.innerHTML = goals.map(g => {
                    const focusInfo = {
                        weight_loss: { emoji: '🔥', label: 'Fat Loss', color: 'text-rose-600' },
                        muscle_gain: { emoji: '💪', label: 'Muscle Gain', color: 'text-indigo-600' },
                        health:      { emoji: '🌱', label: 'Health',      color: 'text-emerald-600' }
                    }[g.focus] || { emoji: '🎯', label: g.type ? g.type : 'Goal', color: 'text-slate-600' };

                    let summary = '';
                    if (g.focus === 'weight_loss' && g.details) {
                        const parts = [];
                        if (g.details.kg) parts.push(`${g.details.kg}kg`);
                        if (g.details.weeks) parts.push(`${g.details.weeks}w`);
                        if (g.details.style) parts.push(g.details.style === 'toned' ? 'toned' : 'scale weight');
                        if (parts.length) summary = parts.join(' · ');
                    } else if (g.focus === 'muscle_gain' && g.details) {
                        const parts = [];
                        if (g.details.scope === 'general') parts.push('Full body · 12–16 sets/muscle/week');
                        else if (g.details.scope === 'specific' && Array.isArray(g.details.muscles)) parts.push(`${g.details.muscles.join(', ')} · 12–20 sets each/week`);
                        else if (g.details.priority) parts.push(g.details.priority);
                        if (g.details.physique) parts.push(g.details.physique);
                        if (g.details.experience) parts.push(g.details.experience);
                        if (parts.length) summary = parts.join(' · ');
                    } else if (g.focus === 'health' && g.details && g.details.area) {
                        summary = g.details.area;
                    }

                    return `
                        <div class="bg-slate-50 p-3 rounded-xl">
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-[10px] font-black ${focusInfo.color} uppercase">${focusInfo.emoji} ${escapeHtml(focusInfo.label)}</span>
                                <button onclick="removeGoal('${escapeJsString(g.id)}')" class="text-red-500 text-xs font-bold" aria-label="Remove goal">×</button>
                            </div>
                            <p class="font-bold text-sm">${escapeHtml(g.description)}</p>
                            ${summary ? `<p class="text-xs text-slate-500 mt-1">${escapeHtml(summary)}</p>` : ''}
                            ${g.deadline ? `<p class="text-xs text-slate-400 mt-1">Target: ${escapeHtml(new Date(g.deadline).toLocaleDateString())}</p>` : ''}
                        </div>`;
                }).join('');
            }
        }

        renderNotificationSettings();
        const targetWorkouts = document.getElementById('target-workouts-week');
        if (targetWorkouts) targetWorkouts.value = Math.max(1, Math.min(14, Number(state.coachingTargets.workoutsPerWeek) || 3));
    }

    function removeGoal(id) {
        state.userGoals = (state.userGoals || []).filter(g => String(g.id) !== String(id));
        saveState();
        renderSettings();
        renderGoalVolumeSummary();
        renderDashboard();
    }
