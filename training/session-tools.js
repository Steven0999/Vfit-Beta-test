// Session targets, completion, rest, rotation and calendar-week volume.
let sessionRestTimer = null;
let sessionRestInterval = null;

function isWorkingSet(set) {
    return Boolean(set && set.setType !== 'warmup' && set.completed !== false);
}

function exercisePreferenceKey(name, env) {
    return (env === 'home' ? 'home' : 'gym') + '|' + String(name || '').trim();
}

function cleanSessionSettings(raw) {
    const value = raw || {};
    const num = (key, fallback, low, high) => value[key] !== '' && value[key] !== null && value[key] !== undefined
        && Number.isFinite(Number(value[key])) ? Math.max(low, Math.min(high, Number(value[key]))) : fallback;
    const repMin = Math.round(num('repMin', 8, 1, 1000));
    return { repMin, repMax: Math.max(repMin, Math.round(num('repMax', 12, 1, 1000))),
        targetRir: num('targetRir', 2, 0, 10), increment: num('increment', 2.5, 0.1, 100),
        restSeconds: Math.round(num('restSeconds', 90, 0, 900)),
        priority: value.priority === 'optional' ? 'optional' : 'essential',
        estimatedMinutes: num('estimatedMinutes', 8, 1, 180), notes: String(value.notes || '').slice(0, 1000) };
}

function settingsForExercise(name, provided) {
    const env = currentWorkoutContext && currentWorkoutContext.env || state.workoutEnv || 'gym';
    const saved = (state.exercisePreferences || {})[exercisePreferenceKey(name, env)] || {};
    const settings = cleanSessionSettings({ ...saved, ...(provided || {}) });
    settings.notes = String(saved.notes ?? provided?.notes ?? '').slice(0, 1000);
    return settings;
}

function cardSessionSettings(id) {
    const card = document.getElementById('card-' + id);
    try { return cleanSessionSettings(JSON.parse(card?.dataset.sessionSettings || '{}')); }
    catch (error) { return cleanSessionSettings({}); }
}

function mountSessionExerciseTools(id, name, provided) {
    const card = document.getElementById('card-' + id);
    if (!card) return;
    const settings = settingsForExercise(name, provided);
    card.dataset.sessionSettings = JSON.stringify(settings);
    card.dataset.settingsExerciseName = name;
    let wrap = document.getElementById('session-tools-' + id);
    if (!wrap || wrap.parentElement !== card) {
        wrap = document.createElement('div'); wrap.id = 'session-tools-' + id;
        wrap.className = 'rounded-2xl bg-orange-50 border border-orange-100 p-3 mb-3';
        card.appendChild(wrap);
    }
    wrap.innerHTML = `<details><summary class="font-bold text-sm text-orange-800 cursor-pointer">Targets, rest & setup notes</summary>
        <div class="grid grid-cols-2 gap-2 mt-3">${[['repMin','Minimum reps',1,1000],['repMax','Maximum reps',1,1000],['targetRir','Target RIR',0,10],['increment','Weight step (kg)',0.1,100],['restSeconds','Rest (seconds, 0 = off)',0,900]].map(([key,label,min,max]) => `<label class="text-xs font-bold text-slate-500">${label}<input id="session-${key}-${id}" type="number" min="${min}" max="${max}" step="${key === 'increment' ? 'any' : '1'}" value="${settings[key]}" onchange="saveSessionExerciseSettings('${id}')" class="block mt-1 w-full p-2 rounded-xl bg-white border border-orange-100"></label>`).join('')}</div>
        <label class="block text-xs font-bold text-slate-500 mt-3">Personal setup note<textarea id="session-notes-${id}" maxlength="1000" rows="2" placeholder="Seat position, grip or a technique reminder" onchange="saveSessionExerciseSettings('${id}')" class="block mt-1 w-full p-3 rounded-xl bg-white border border-orange-100">${escapeHtml(settings.notes)}</textarea></label></details>
        <p id="session-pinned-note-${id}" class="mt-2 text-xs text-slate-600 whitespace-pre-wrap">${escapeHtml(settings.notes)}</p><div id="session-progression-${id}" class="mt-2"></div>`;
    renderSessionProgression(id, name);
}

function saveSessionExerciseSettings(id) {
    const name = document.getElementById('ex-name-' + id)?.value.trim();
    if (!name) { showToast('Choose an exercise before saving its settings'); return; }
    const raw = cardSessionSettings(id);
    for (const key of ['repMin','repMax','targetRir','increment','restSeconds']) {
        const input = document.getElementById('session-' + key + '-' + id);
        if (input && input.value !== '') raw[key] = input.value;
    }
    const notes = document.getElementById('session-notes-' + id);
    if (notes) raw.notes = notes.value;
    if (Number(raw.repMin) > Number(raw.repMax)) { showToast('Maximum reps must be at least the minimum'); return; }
    const settings = cleanSessionSettings(raw);
    const env = currentWorkoutContext && currentWorkoutContext.env || state.workoutEnv;
    const key = exercisePreferenceKey(name, env);
    state.exercisePreferences[key] = { ...settings, updatedAt: new Date().toISOString() };
    document.getElementById('card-' + id).dataset.sessionSettings = JSON.stringify(settings);
    const pinned = document.getElementById('session-pinned-note-' + id); if(pinned)pinned.textContent = settings.notes;
    for(const key of ['repMin','repMax','targetRir','increment','restSeconds']) { const input=document.getElementById('session-'+key+'-'+id); if(input)input.value=String(settings[key]); }
    persistActiveWorkout();
    renderSessionProgression(id, name);
}

function sessionProgressionSuggestion(name, settings, expectedSets, source) {
    const snapshot = source || state, target = cleanSessionSettings(settings);
    const history = (snapshot.workoutHistory || []).slice().sort((a,b) => String(b.completedAt || b.date || '').localeCompare(String(a.completedAt || a.date || '')));
    const last = history.map(workout => (workout.exercises || []).find(ex => ex.name === name)).find(ex => ex && (ex.sets || []).some(isWorkingSet));
    if (!last) return null;
    const sets = last.sets.filter(isWorkingSet).filter(set => Number(set.reps) > 0 && Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0);
    if (!sets.length) return null;
    const current = Number(sets[sets.length - 1].weight);
    const date = window.selectedWorkoutDate || localDateKey();
    const smart = smartProgressionForExercise(name,snapshot);
    const recovery = ['deload','reduce'].includes(smart?.action) || isDeloadPlanActive(snapshot,date) || Number(snapshot.readinessLogs?.[date]?.score ?? 100) < 55 || Boolean(snapshot.dailyReadiness?.[date]?.recovery); 
    const ready = !recovery && sets.length >= Math.max(1, Number(expectedSets) || sets.length)
        && sets.every(set => Number(set.reps) >= target.repMax && set.rir !== '' && set.rir !== null && set.rir !== undefined && Number(set.rir) >= target.targetRir);
    const next = ready ? Math.max(0, current + (isAssistanceExercise(name) ? -target.increment : target.increment)) : current;
    return { ready, current, suggested: Math.round(next * 1000) / 1000,
        reason: recovery ? 'Your recovery adjustment takes priority today.' : ready
            ? `All working sets reached ${target.repMax} reps at the chosen RIR. Review a ${target.increment}kg step.`
            : `Build each working set towards ${target.repMax} reps at ${target.targetRir} RIR before increasing difficulty.` };
}

function renderSessionProgression(id, name) {
    const box = document.getElementById('session-progression-' + id);
    if (!box) return;
    const rows = document.getElementById('sets-' + id)?.querySelectorAll('.set-row') || [];
    const count = Array.from(rows).filter(row => row.dataset.setType !== 'warmup').length;
    const settings = cardSessionSettings(id);
    const suggestion = sessionProgressionSuggestion(name, settings, count);
    box.innerHTML = `<p class="text-xs font-bold text-orange-700">Target: ${settings.repMin}–${settings.repMax} reps · ${settings.targetRir} RIR</p>`
        + (suggestion ? `<p class="text-xs text-slate-500 mt-1">${escapeHtml(suggestion.reason)}</p>${suggestion.ready && !isHomeBodyweightExercise(name) ? `<button onclick="applySessionProgression('${id}')" class="mt-2 rounded-xl bg-orange-600 text-white p-2 text-xs font-bold">Use ${suggestion.suggested}kg${isAssistanceExercise(name) ? ' assistance' : ''}</button>` : ''}` : '');
}

function applySessionProgression(id) {
    const name = document.getElementById('ex-name-' + id)?.value.trim();
    const rows = document.getElementById('sets-' + id)?.querySelectorAll('.set-row') || [];
    const suggestion = sessionProgressionSuggestion(name, cardSessionSettings(id), Array.from(rows).filter(row => row.dataset.setType !== 'warmup').length);
    if (!suggestion?.ready || isHomeBodyweightExercise(name)) return;
    rows.forEach(row => { if (row.dataset.setType !== 'warmup' && row.dataset.completed !== 'true') row.querySelector('.set-weight').value = String(suggestion.suggested); });
    persistActiveWorkout();
}

function mountSetCompletionTools(row, exerciseId, name, options) {
    const config = options || {};
    row.id = 'set-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const allowed = trainingExperienceTier() === 'advanced' ? ['working','warmup','drop','failure'] : ['working','warmup'];
    // Existing advanced set labels remain visible when restoring an older session.
    if (['drop','failure'].includes(config.initialSetType) && !allowed.includes(config.initialSetType)) allowed.push(config.initialSetType);
    row.dataset.setType = allowed.includes(config.initialSetType) ? config.initialSetType : 'working';
    row.dataset.completed = String(config.completed === true);
    const bar = document.createElement('div'); bar.className = 'set-completion-bar flex items-center justify-between gap-2 w-full';
    const type = document.createElement('select'); type.className = 'set-type rounded-lg bg-slate-50 p-2 text-xs font-bold';
    type.setAttribute('aria-label', 'Set type');
    type.innerHTML = allowed.map(value => `<option value="${value}">${({working:'Working set',warmup:'Warm-up',drop:'Drop set',failure:'To failure'})[value]}</option>`).join('');
    type.value = row.dataset.setType;
    type.addEventListener('change', () => { row.dataset.setType = type.value; clearSetCompletion(row); persistActiveWorkout(); renderSessionProgression(exerciseId, document.getElementById('ex-name-' + exerciseId)?.value.trim()); });
    const label = document.createElement('label'); label.className = 'flex items-center gap-2 text-xs font-bold text-emerald-700';
    const tick = document.createElement('input'); tick.type = 'checkbox'; tick.className = 'set-complete w-5 h-5 accent-emerald-600';
    tick.checked = config.completed === true; tick.setAttribute('aria-label', 'Mark set completed');
    tick.addEventListener('change', () => toggleCompletedSet(row.id, exerciseId, tick.checked));
    label.appendChild(tick); const text = document.createElement('span'); text.textContent = 'Completed'; label.appendChild(text);
    bar.appendChild(type); bar.appendChild(label); row.appendChild(bar);
    ['.set-reps','.set-weight','.set-rir'].forEach(selector => row.querySelector(selector)?.addEventListener('input', () => {
        if (row.dataset.completed === 'true') clearSetCompletion(row);
        persistActiveWorkout();
    }));
    renderSessionProgression(exerciseId, name);
}

function clearSetCompletion(row) {
    row.dataset.completed = 'false'; const tick = row.querySelector('.set-complete'); if (tick) tick.checked = false;
}

function toggleCompletedSet(rowId, exerciseId, checked) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const name = document.getElementById('ex-name-' + exerciseId)?.value.trim();
    const reps = row.querySelector('.set-reps')?.value, weight = row.querySelector('.set-weight')?.value;
    const rir = row.querySelector('.set-rir')?.value;
    if (checked && (!name || !Number.isFinite(Number(reps)) || Number(reps) <= 0 || weight === '' || !Number.isFinite(Number(weight)) || Number(weight) < 0
        || (rir !== '' && (!Number.isFinite(Number(rir)) || Number(rir) < 0 || Number(rir) > 10)))) {
        clearSetCompletion(row); showToast('Enter valid reps, weight and optional RIR before completing this set'); return;
    }
    row.dataset.completed = String(Boolean(checked));
    const tick = row.querySelector('.set-complete'); if (tick) tick.checked = Boolean(checked);
    if (checked) startSessionRestTimer(name, cardSessionSettings(exerciseId).restSeconds);
    persistActiveWorkout();
}

function startSessionRestTimer(name, seconds) {
    stopSessionRestTimer();
    const duration = Math.max(0, Math.min(900, Number(seconds) || 0));
    if (!duration) return;
    sessionRestTimer = { name, endAt: Date.now() + duration * 1000, ownerUid: currentUser && currentUser.uid || '' };
    updateSessionRestTimer(); sessionRestInterval = setInterval(updateSessionRestTimer, 1000);
}

function updateSessionRestTimer() {
    const box = document.getElementById('session-rest-timer'); if (!box) return;
    if (!sessionRestTimer || sessionRestTimer.ownerUid !== (currentUser && currentUser.uid || '')) { box.classList.add('hidden'); return; }
    const left = Math.max(0, Math.ceil((sessionRestTimer.endAt - Date.now()) / 1000));
    box.classList.remove('hidden');
    document.getElementById('session-rest-label').textContent = sessionRestTimer.name + ' · ' + (left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2,'0')} rest` : 'Rest complete — continue when ready');
    if (!left) { clearInterval(sessionRestInterval); sessionRestInterval = null; }
}

function stopSessionRestTimer() {
    clearInterval(sessionRestInterval); sessionRestInterval = null; sessionRestTimer = null;
    document.getElementById('session-rest-timer')?.classList.add('hidden');
}

function restoreSessionRestTimer(saved) {
    stopSessionRestTimer();
    if (!saved || saved.ownerUid !== (currentUser && currentUser.uid || '') || !Number.isFinite(Number(saved.endAt))) return;
    sessionRestTimer = { name: String(saved.name || ''), endAt: Number(saved.endAt), ownerUid: saved.ownerUid };
    updateSessionRestTimer(); sessionRestInterval = setInterval(updateSessionRestTimer, 1000);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) updateSessionRestTimer(); });

function timeLimitedWorkoutExercises(plan, minutes) {
    const exercises = (plan.exercises || []).map(ex => ({ ...ex, settings: cleanSessionSettings(ex.settings || ex) }));
    const budget = [20,40,60].includes(Number(minutes)) ? Number(minutes) : 0;
    if (!budget) return { exercises, skipped: [], estimatedMinutes: exercises.reduce((sum,ex) => sum + ex.settings.estimatedMinutes,0), budget: 0 };
    const selected = new Set(exercises.filter(ex => ex.settings.priority === 'essential'));
    let total = [...selected].reduce((sum,ex) => sum + ex.settings.estimatedMinutes,0);
    exercises.filter(ex => ex.settings.priority === 'optional').forEach(ex => { if (total + ex.settings.estimatedMinutes <= budget) { selected.add(ex); total += ex.settings.estimatedMinutes; } });
    return { exercises: exercises.filter(ex => selected.has(ex)), skipped: exercises.filter(ex => !selected.has(ex)).map(ex => ex.name), estimatedMinutes: total, budget };
}

function nextRotationWorkout(source) {
    const snapshot = source || state;
    const ids = (snapshot.workoutRotation?.planIds || []).filter(id => (snapshot.savedWorkouts || []).some(plan => plan.id === id));
    if (!ids.length) return null;
    const last = (snapshot.workoutHistory || []).filter(workout => ids.includes(workout.savedWorkoutId)
        && (workout.exercises || []).some(ex => (ex.sets || []).some(isWorkingSet)))
        .sort((a,b) => String(b.completedAt || b.date || '').localeCompare(String(a.completedAt || a.date || '')))[0];
    const id = ids[last ? (ids.indexOf(last.savedWorkoutId) + 1) % ids.length : 0];
    return (snapshot.savedWorkouts || []).find(plan => plan.id === id) || null;
}

function toggleRotationWorkout(id) {
    if (!(state.savedWorkouts || []).some(plan => plan.id === id)) return;
    const ids = state.workoutRotation.planIds || [];
    state.workoutRotation = { planIds: ids.includes(id) ? ids.filter(item => item !== id) : [...ids,id], updatedAt: new Date().toISOString() };
    saveState(); renderSavedWorkouts(); renderWorkoutRotation();
}

function moveRotationWorkout(index, offset) {
    const ids = [...state.workoutRotation.planIds], next = index + offset;
    if (next < 0 || next >= ids.length) return;
    [ids[index],ids[next]] = [ids[next],ids[index]];
    state.workoutRotation = { planIds: ids, updatedAt: new Date().toISOString() }; saveState(); renderWorkoutRotation();
}

function startNextRotationWorkout() {
    const plan = nextRotationWorkout(); if (plan) startSavedWorkout(plan.id, document.getElementById('saved-workout-time')?.value);
}

function renderWorkoutRotation() {
    const box = document.getElementById('workout-rotation'); if (!box) return;
    const ids = (state.workoutRotation?.planIds || []).filter(id => state.savedWorkouts.some(plan => plan.id === id));
    const next = nextRotationWorkout();
    const shift = typeof getShiftForDate === 'function' ? getShiftForDate(window.selectedWorkoutDate || localDateKey()) : null;
    box.innerHTML = `<h4 class="font-black">Your workout rotation</h4><p class="text-xs text-slate-500 mt-1">${shift?.type ? escapeHtml(shift.type) + ' shift/day · ' : ''}Only completed workouts advance the sequence. Rest or missed days keep your place.</p>`
        + (next ? `<p class="font-bold text-orange-600 mt-3">Next: ${escapeHtml(next.name)}</p><button onclick="startNextRotationWorkout()" class="rounded-xl bg-orange-600 text-white p-3 font-bold mt-2">Start next workout</button>` : '<p class="text-xs text-slate-400 mt-3">Add saved workouts to your rotation below.</p>')
        + ids.map((id,index) => `<div class="flex items-center gap-2 mt-2 text-sm"><span class="flex-1">${index+1}. ${escapeHtml(state.savedWorkouts.find(plan=>plan.id===id).name)}</span><button onclick="moveRotationWorkout(${index},-1)" ${index===0?'disabled':''} class="p-2" aria-label="Move rotation workout up">↑</button><button onclick="moveRotationWorkout(${index},1)" ${index===ids.length-1?'disabled':''} class="p-2" aria-label="Move rotation workout down">↓</button></div>`).join('');
}

function trainingWeekStart(date) {
    const day = new Date((isDateKey(date) ? date : localDateKey()) + 'T12:00:00');
    return offsetLocalDateKey(localDateKey(day), -((day.getDay()+6)%7));
}

function weeklyPlannedCompletedVolume(source, date) {
    const snapshot = source || state, start = trainingWeekStart(date || localDateKey()), end = offsetLocalDateKey(start,6);
    const result = { start, end, planned: {}, completed: {}, secondaryPlanned: {}, secondaryCompleted: {} };
    const add = (name, sets, times, primary, secondary, env) => {
        const count = (sets || []).filter(isWorkingSet).length * times;
        const contributions = getExerciseVolumeContribution(name,snapshot,env);
        Object.entries(contributions).forEach(([muscle,value]) => {
            const target = value >= 1 ? primary : secondary;
            target[muscle] = (target[muscle] || 0) + count * value;
        });
    };
    const counts = snapshot.weeklyTrainingPlans?.[start]?.counts || {};
    (snapshot.savedWorkouts || []).forEach(plan => (plan.exercises || []).forEach(ex => add(ex.name, ex.sets, Number(counts[plan.id]) || 0, result.planned, result.secondaryPlanned, plan.env)));
    (snapshot.workoutHistory || []).filter(w => w.date >= start && w.date <= end).forEach(w => (w.exercises || []).forEach(ex => add(ex.name,ex.sets,1,result.completed,result.secondaryCompleted,w.env)));
    return result;
}

function setWeeklyPlanCount(id, value) {
    const count = Number(value); if (!Number.isInteger(count) || count < 0 || count > 14) { showToast('Choose 0–14 sessions'); return; }
    const week = trainingWeekStart(window.selectedWorkoutDate || localDateKey());
    state.weeklyTrainingPlans[week] = { counts: { ...(state.weeklyTrainingPlans[week]?.counts || {}), [id]: count }, updatedAt: new Date().toISOString() };
    saveState(); renderPlannedCompletedVolume();
}

function renderPlannedCompletedVolume() {
    const box = document.getElementById('planned-completed-volume'); if (!box) return;
    const data = weeklyPlannedCompletedVolume(state, window.selectedWorkoutDate || localDateKey());
    const counts = state.weeklyTrainingPlans?.[data.start]?.counts || {};
    const muscles = SPECIFIC_MUSCLES.filter(m => data.planned[m] || data.completed[m]);
    box.innerHTML = `<h3 class="font-black">Weekly plan vs completed</h3><p class="text-xs text-slate-400 mt-1">${data.start} – ${data.end} · primary working sets; warm-ups excluded.</p>
        <details class="my-3"><summary class="text-xs font-bold text-orange-600 cursor-pointer">Plan this week</summary>${state.savedWorkouts.map(plan => `<label class="flex items-center justify-between gap-2 text-sm mt-2">${escapeHtml(plan.name)}<input type="number" min="0" max="14" step="1" value="${Number(counts[plan.id])||0}" aria-label="Weekly sessions for ${escapeHtml(plan.name)}" onchange='setWeeklyPlanCount(${safeJsonForInline(plan.id)},this.value)' class="w-20 rounded-xl p-2 bg-slate-50 border border-slate-200"></label>`).join('') || '<p class="text-xs text-slate-400 mt-2">Create saved workouts to set weekly targets.</p>'}</details>
        ${muscles.length ? `<table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="text-left py-2">Muscle</th><th>Planned</th><th>Done</th><th>Left</th></tr></thead><tbody>${muscles.map(m => `<tr><th class="text-left py-2">${escapeHtml(m)}</th><td class="text-center">${data.planned[m]||0}</td><td class="text-center">${data.completed[m]||0}</td><td class="text-center">${Math.max(0,(data.planned[m]||0)-(data.completed[m]||0))}</td></tr>`).join('')}</tbody></table>` : '<p class="text-xs text-slate-400">Set a weekly plan or complete a workout to see the comparison.</p>'}
        ${trainingExperienceTier()==='advanced' ? `<details class="mt-3"><summary class="text-xs font-bold text-orange-600 cursor-pointer">Estimated secondary involvement</summary><p class="text-[10px] text-slate-400 my-2">Shown separately using the existing assisting-muscle contribution estimate.</p>${SPECIFIC_MUSCLES.filter(m=>data.secondaryPlanned[m]||data.secondaryCompleted[m]).map(m=>`<p class="text-xs">${escapeHtml(m)}: planned ${data.secondaryPlanned[m]||0} · completed ${data.secondaryCompleted[m]||0}</p>`).join('')||'<p class="text-xs text-slate-400">No secondary involvement recorded.</p>'}</details>` : ''}`;
}

function renderTrainingTools() {
    renderWorkoutRotation(); renderPlannedCompletedVolume();
}
