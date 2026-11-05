// Personal workout templates use the normal workout logger and account snapshot.
const WORKOUT_PLAN_FOCUSES = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body'];
let workoutPlanDraft = null;
let workoutPlanSession = null;

function workoutPlanNumber(value, max) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= max ? String(number) : '';
}

function cleanSavedWorkout(plan) {
    if (!plan || !Array.isArray(plan.exercises)) return null;
    return {
        id: String(plan.id || '').slice(0, 120), name: String(plan.name || '').slice(0, 100),
        env: plan.env === 'home' ? 'home' : 'gym',
        focus: WORKOUT_PLAN_FOCUSES.includes(plan.focus) || plan.focus === 'Core' ? plan.focus : 'Full Body',
        includeCore: Boolean(plan.includeCore), createdAt: String(plan.createdAt || ''), updatedAt: String(plan.updatedAt || ''),
        exercises: plan.exercises.filter(ex => ex && typeof ex.name === 'string' && ex.name.trim()).map(ex => ({
            name: ex.name.trim().slice(0, 100), type: ['compound', 'isolation', 'core'].includes(ex.type) ? ex.type : 'isolation',
            group: String(ex.group || '').slice(0, 40),
            sets: (Array.isArray(ex.sets) && ex.sets.length ? ex.sets : [{}]).slice(0, 100).map(set => ({
                reps: workoutPlanNumber(set && set.reps, 10000), weight: workoutPlanNumber(set && set.weight, 10000),
                rir: workoutPlanNumber(set && set.rir, 10)
            }))
        }))
    };
}

function exerciseNamesForCategory(env, type, group, includeCore) {
    const db = getEnvDB(env);
    if (type === 'core') return includeCore && db.Core ? [...new Set([...db.Core.compound, ...db.Core.isolation])].sort() : [];
    if (type === 'isolation' && group === 'Core' && !includeCore) return [];
    const bucket = db[group];
    return bucket ? [...new Set(bucket[type === 'compound' ? 'compound' : 'isolation'] || [])].sort() : [];
}

function createWorkoutExerciseFilters(id) {
    const includeCore = Boolean(currentWorkoutContext && (currentWorkoutContext.includeCore || currentWorkoutContext.focus === 'Core'));
    const wrap = document.createElement('div');
    wrap.className = 'grid grid-cols-2 gap-2 mt-3';
    wrap.innerHTML = `<label class="text-xs font-bold text-slate-500">Exercise type
        <select id="exercise-type-${id}" onchange="updateWorkoutExerciseFilter('${id}')" class="mt-1 w-full p-2 bg-slate-50 rounded-xl text-sm font-bold">
            <option value="all">Current workout</option><option value="compound">Compound</option><option value="isolation">Isolation</option>${includeCore ? '<option value="core">Core / Abs</option>' : ''}
        </select></label>
        <label class="text-xs font-bold text-slate-500">Focus / muscle
        <select id="exercise-group-${id}" disabled onchange="showExerciseDropdown('${id}')" class="mt-1 w-full p-2 bg-slate-50 rounded-xl text-sm font-bold"><option value="">Current focus</option></select></label>`;
    return wrap;
}

function updateWorkoutExerciseFilter(id) {
    const type = document.getElementById('exercise-type-' + id).value;
    const group = document.getElementById('exercise-group-' + id);
    const ctx = currentWorkoutContext || {};
    const groups = type === 'compound' ? WORKOUT_PLAN_FOCUSES : type === 'core' ? ['Core']
        : type === 'isolation' ? SPECIFIC_MUSCLES.filter(m => m !== 'Core' || ctx.includeCore || ctx.focus === 'Core') : [''];
    group.innerHTML = groups.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name === 'Core' ? 'Core / Abs' : name || 'Current focus')}</option>`).join('');
    group.disabled = type === 'all';
    if (groups.includes(ctx.focus)) group.value = ctx.focus;
    showExerciseDropdown(id);
}

function workoutExercisePickerNames(id) {
    const type = document.getElementById('exercise-type-' + id)?.value;
    if (!type || type === 'all') return showAllExercisesInPicker ? getAvailableExercises(state.workoutEnv || 'gym') : getExercisesForCurrentFocus();
    const ctx = currentWorkoutContext || {};
    return exerciseNamesForCategory(ctx.env || state.workoutEnv || 'gym', type,
        document.getElementById('exercise-group-' + id).value, Boolean(ctx.includeCore || ctx.focus === 'Core'));
}

function resetWorkoutPlanUI() {
    workoutPlanDraft = null;
    workoutPlanSession = null;
    ['my-workout-plan-modal', 'workout-plan-editor-modal'].forEach(id => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    });
}

function openMyWorkoutPlan() {
    renderSavedWorkouts();
    document.getElementById('my-workout-plan-modal').style.display = 'flex';
}

function closeMyWorkoutPlan() {
    document.getElementById('my-workout-plan-modal').style.display = 'none';
}

function renderSavedWorkouts() {
    const plans = (state.savedWorkouts || []).map(cleanSavedWorkout).filter(Boolean);
    const list = document.getElementById('saved-workouts-list');
    document.getElementById('saved-workouts-count').textContent = `${plans.length} saved workout${plans.length === 1 ? '' : 's'}`;
    list.innerHTML = plans.length ? plans.map(plan => {
        const id = safeJsonForInline(plan.id);
        const count = plan.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
        return `<article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 class="font-black text-lg break-words">${escapeHtml(plan.name)}</h4>
            <p class="text-xs text-slate-500 mt-1">${plan.env === 'home' ? 'Home' : 'Gym'} · ${escapeHtml(plan.focus)}${plan.includeCore ? ' + Core / Abs' : ''} · ${plan.exercises.length} exercises · ${count} sets</p>
            <p class="text-xs text-slate-400 mt-2">Latest reps, weight and RIR load when you start.</p>
            <div class="flex gap-2 mt-4"><button onclick='startSavedWorkout(${id})' class="flex-1 rounded-xl bg-orange-600 text-white p-3 font-bold">Start workout</button>
            <button onclick='editSavedWorkout(${id})' class="rounded-xl bg-white border border-slate-200 px-4 py-3 font-bold">Edit</button>
            <button onclick='deleteSavedWorkout(${id})' class="rounded-xl bg-red-50 text-red-600 px-4 py-3 font-bold">Delete</button></div></article>`;
    }).join('') : '<p class="text-sm text-center text-slate-400 py-6">Create your first workout and keep it here for next time.</p>';
}

function workoutPlanSessionMatches() {
    if (!workoutPlanSession || workoutPlanSession.uid !== (currentUser && currentUser.uid || '')) {
        resetWorkoutPlanUI();
        showToast('Reopen your workout plan for this account');
        return false;
    }
    return true;
}

function editSavedWorkout(id) {
    const existing = id ? (state.savedWorkouts || []).find(plan => plan.id === id) : null;
    if (id && !existing) { showToast('This saved workout is no longer available'); return; }
    workoutPlanDraft = existing ? cleanSavedWorkout(existing) : {
        id: '', name: '', env: state.workoutEnv || 'gym', focus: 'Full Body', includeCore: false, exercises: []
    };
    workoutPlanSession = { uid: currentUser && currentUser.uid || '', dirty: false };
    closeMyWorkoutPlan();
    document.getElementById('workout-plan-editor-title').textContent = existing ? 'Edit workout' : 'Create workout';
    document.getElementById('workout-plan-name').value = workoutPlanDraft.name;
    document.getElementById('workout-plan-env').value = workoutPlanDraft.env;
    document.getElementById('workout-plan-focus').value = workoutPlanDraft.focus;
    document.getElementById('workout-plan-core').checked = workoutPlanDraft.includeCore;
    document.getElementById('workout-plan-exercise-type').value = 'compound';
    document.getElementById('workout-plan-search').value = '';
    renderWorkoutPlanExercisePicker();
    renderWorkoutPlanExercises();
    document.getElementById('workout-plan-editor-modal').style.display = 'flex';
}

function closeWorkoutPlanEditor() {
    if (workoutPlanSession && workoutPlanSession.dirty && !confirm('Discard the unsaved changes to this workout plan?')) return;
    resetWorkoutPlanUI();
    openMyWorkoutPlan();
}

function changeWorkoutPlanSetup() {
    if (!workoutPlanSessionMatches()) return;
    workoutPlanDraft.name = document.getElementById('workout-plan-name').value.slice(0, 100);
    workoutPlanDraft.env = document.getElementById('workout-plan-env').value === 'home' ? 'home' : 'gym';
    workoutPlanDraft.focus = document.getElementById('workout-plan-focus').value;
    const core = document.getElementById('workout-plan-core');
    if (!core.checked && workoutPlanDraft.exercises.some(ex => ex.type === 'core' || ex.group === 'Core')) {
        core.checked = true;
        showToast('Remove the core exercises before switching Add Core off');
    }
    workoutPlanDraft.includeCore = core.checked || workoutPlanDraft.focus === 'Core';
    core.checked = workoutPlanDraft.includeCore;
    workoutPlanSession.dirty = true;
    renderWorkoutPlanExercisePicker(true);
}

function renderWorkoutPlanExercisePicker(keepGroup) {
    if (!workoutPlanDraft) return;
    const typeSelect = document.getElementById('workout-plan-exercise-type');
    const previousType = typeSelect.value || 'compound';
    typeSelect.innerHTML = '<option value="compound">Compound</option><option value="isolation">Isolation</option>'
        + (workoutPlanDraft.includeCore ? '<option value="core">Core / Abs</option>' : '');
    const type = previousType === 'core' && !workoutPlanDraft.includeCore ? 'compound' : previousType;
    typeSelect.value = type;
    const group = document.getElementById('workout-plan-exercise-group');
    const previousGroup = group.value;
    const groups = type === 'compound' ? WORKOUT_PLAN_FOCUSES : type === 'core' ? ['Core']
        : SPECIFIC_MUSCLES.filter(m => m !== 'Core' || workoutPlanDraft.includeCore);
    group.innerHTML = groups.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name === 'Core' ? 'Core / Abs' : name)}</option>`).join('');
    group.value = keepGroup && groups.includes(previousGroup) ? previousGroup
        : groups.includes(workoutPlanDraft.focus) ? workoutPlanDraft.focus : groups[0];
    const query = document.getElementById('workout-plan-search').value.trim().toLowerCase();
    const names = exerciseNamesForCategory(workoutPlanDraft.env, type, group.value, workoutPlanDraft.includeCore)
        .filter(name => name.toLowerCase().includes(query));
    document.getElementById('workout-plan-exercise-select').innerHTML = names.length
        ? names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')
        : '<option value="">No matching exercises</option>';
    document.getElementById('workout-plan-add-exercise').disabled = !names.length;
}

function addWorkoutPlanExercise() {
    if (!workoutPlanSessionMatches()) return;
    const name = document.getElementById('workout-plan-exercise-select').value;
    if (!name) return;
    const type = document.getElementById('workout-plan-exercise-type').value;
    const last = getLastPerformance(name);
    const sets = Array.from({ length: 3 }, (_, index) => {
        const saved = last && (last.sets[index] || last.sets[last.sets.length - 1]);
        return { reps: workoutPlanNumber(saved && saved.reps, 10000) || (type === 'compound' ? '8' : '12'),
            weight: workoutPlanNumber(saved && (saved.weight ?? saved.kg), 10000), rir: workoutPlanNumber(saved && saved.rir, 10) || '2' };
    });
    workoutPlanDraft.exercises.push({ name, type, group: document.getElementById('workout-plan-exercise-group').value, sets });
    workoutPlanSession.dirty = true;
    renderWorkoutPlanExercises();
}

function openWorkoutPlanCustomExercise() {
    if (!workoutPlanSessionMatches()) return;
    openAddExerciseForm();
    setNewExEnv(workoutPlanDraft.env);
    if (document.getElementById('workout-plan-exercise-type').value === 'core') setNewExType('core');
}

function setWorkoutPlanSetCount(index, value) {
    if (!workoutPlanSessionMatches()) return;
    const count = Number(value);
    const ex = workoutPlanDraft.exercises[index];
    if (!ex || !Number.isInteger(count) || count < 1 || count > 100) { showToast('Choose between 1 and 100 sets'); renderWorkoutPlanExercises(); return; }
    while (ex.sets.length < count) ex.sets.push({ ...ex.sets[ex.sets.length - 1] });
    ex.sets.length = count;
    workoutPlanSession.dirty = true;
    renderWorkoutPlanExercises();
}

function setWorkoutPlanSetValue(exerciseIndex, setIndex, field, value) {
    if (!workoutPlanSessionMatches() || !['reps', 'weight', 'rir'].includes(field)) return;
    const set = workoutPlanDraft.exercises[exerciseIndex]?.sets[setIndex];
    if (set) { set[field] = value; workoutPlanSession.dirty = true; }
}

function moveWorkoutPlanExercise(index, offset) {
    if (!workoutPlanSessionMatches()) return;
    const next = index + offset, list = workoutPlanDraft.exercises;
    if (next < 0 || next >= list.length) return;
    [list[index], list[next]] = [list[next], list[index]];
    workoutPlanSession.dirty = true;
    renderWorkoutPlanExercises();
}

function removeWorkoutPlanExercise(index) {
    if (!workoutPlanSessionMatches()) return;
    workoutPlanDraft.exercises.splice(index, 1);
    workoutPlanSession.dirty = true;
    renderWorkoutPlanExercises();
}

function renderWorkoutPlanExercises() {
    const list = document.getElementById('workout-plan-exercises');
    if (!workoutPlanDraft) return;
    list.innerHTML = workoutPlanDraft.exercises.map((ex, index) => {
        const last = getLastPerformance(ex.name);
        const history = last ? `Last logged ${last.date}: ` + last.sets.map(set => `${set.reps || '—'} reps × ${set.weight ?? set.kg ?? '—'} kg${set.rir !== undefined ? ' · RIR ' + set.rir : ''}`).join('; ')
            : 'No previous lifts yet. Set your starting targets below.';
        return `<article class="border-2 ${ex.type === 'core' || ex.group === 'Core' ? 'border-orange-200' : 'border-slate-200'} rounded-2xl p-4 bg-white">
            <p class="text-xs font-bold text-orange-600 mb-1">${ex.type === 'core' || ex.group === 'Core' ? 'Core / Abs' : escapeHtml(ex.group)}</p>
            <h4 class="font-black break-words">${escapeHtml(ex.name)}</h4><p class="text-xs text-slate-500 my-2">${escapeHtml(history)}</p>
            <div class="flex flex-wrap gap-2 items-center mb-3"><label class="text-sm font-bold">Sets <input type="number" min="1" max="100" step="1" value="${ex.sets.length}" aria-label="Number of sets for ${escapeHtml(ex.name)}" onchange="setWorkoutPlanSetCount(${index},this.value)" class="ml-2 w-20 rounded-xl bg-slate-50 border border-slate-200 p-2"></label>
                <button onclick="moveWorkoutPlanExercise(${index},-1)" ${index === 0 ? 'disabled' : ''} class="p-2 rounded-xl bg-slate-50" aria-label="Move ${escapeHtml(ex.name)} up">↑</button>
                <button onclick="moveWorkoutPlanExercise(${index},1)" ${index === workoutPlanDraft.exercises.length - 1 ? 'disabled' : ''} class="p-2 rounded-xl bg-slate-50" aria-label="Move ${escapeHtml(ex.name)} down">↓</button>
                <button onclick="removeWorkoutPlanExercise(${index})" class="ml-auto text-red-600 text-xs font-bold p-2">Remove exercise</button></div>
            <div class="plan-set-grid text-[10px] uppercase font-bold text-slate-500 mb-2"><span>Set</span><span>Reps</span><span>Weight kg</span><span>RIR</span></div>
            ${ex.sets.map((set, setIndex) => `<div class="plan-set-grid mb-2"><span class="text-xs font-bold">${setIndex + 1}</span>${['reps', 'weight', 'rir'].map(field => `<input type="number" min="0" max="${field === 'rir' ? 10 : 10000}" step="${field === 'weight' ? 'any' : '1'}" inputmode="decimal" value="${escapeHtml(set[field])}" aria-label="${field} for ${escapeHtml(ex.name)} set ${setIndex + 1}" oninput="setWorkoutPlanSetValue(${index},${setIndex},'${field}',this.value)" class="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2 font-bold text-center">`).join('')}</div>`).join('')}</article>`;
    }).join('') || '<p class="text-sm text-slate-400 text-center py-4">Add exercises to build your workout.</p>';
}

function saveWorkoutPlan() {
    if (!workoutPlanSessionMatches()) return;
    changeWorkoutPlanSetup();
    if (!workoutPlanDraft.name.trim()) { showToast('Give your workout a name'); return; }
    if (!workoutPlanDraft.exercises.length) { showToast('Add at least one exercise'); return; }
    for (const ex of workoutPlanDraft.exercises) for (const set of ex.sets) {
        if (['reps', 'weight', 'rir'].some(field => set[field] !== '' && workoutPlanNumber(set[field], field === 'rir' ? 10 : 10000) === '')) {
            showToast('Check the reps, weight and RIR values'); return;
        }
    }
    if ((state.deletedSavedWorkoutIds || []).includes(workoutPlanDraft.id)) { showToast('This plan was deleted. Create a new workout to save a copy.'); return; }
    const now = new Date().toISOString();
    const plan = cleanSavedWorkout({ ...workoutPlanDraft, name: workoutPlanDraft.name.trim(),
        id: workoutPlanDraft.id || 'plan-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        createdAt: workoutPlanDraft.createdAt || now, updatedAt: now });
    const previous = state.savedWorkouts || [];
    state.savedWorkouts = previous.some(item => item.id === plan.id) ? previous.map(item => item.id === plan.id ? plan : item) : [...previous, plan];
    if (!saveState()) { state.savedWorkouts = previous; showToast('Could not save this plan on the device'); return; }
    resetWorkoutPlanUI();
    openMyWorkoutPlan();
    showToast('Workout plan saved');
}

function deleteSavedWorkout(id) {
    const plan = (state.savedWorkouts || []).find(item => item.id === id);
    if (!plan || !confirm(`Delete the saved plan "${plan.name}"? Your completed workout history will be kept.`)) return;
    const previous = state.savedWorkouts, previousDeleted = state.deletedSavedWorkoutIds;
    state.savedWorkouts = previous.filter(item => item.id !== id);
    state.deletedSavedWorkoutIds = [...new Set([...(previousDeleted || []), id])];
    if (!saveState()) { state.savedWorkouts = previous; state.deletedSavedWorkoutIds = previousDeleted; showToast('Could not save the deletion'); return; }
    renderSavedWorkouts();
    showToast('Saved plan deleted');
}

function savedWorkoutSessionExercises(plan) {
    const clean = cleanSavedWorkout(plan);
    return clean ? clean.exercises.map(ex => {
        const last = getLastPerformance(ex.name);
        return { ...ex, sets: ex.sets.map((target, index) => {
            const recent = last && (last.sets[index] || last.sets[last.sets.length - 1]);
            const fromHistory = field => workoutPlanNumber(recent && (field === 'weight' ? recent.weight ?? recent.kg : recent[field]), field === 'rir' ? 10 : 10000);
            return { reps: fromHistory('reps') || target.reps,
                weight: fromHistory('weight') || target.weight, rir: fromHistory('rir') || target.rir };
        }) };
    }) : [];
}

function startSavedWorkout(id) {
    const selected = (state.savedWorkouts || []).find(item => item.id === id);
    const plan = cleanSavedWorkout(selected);
    if (!plan || !plan.exercises.length) { showToast('Edit this plan and add exercises first'); return; }
    const uid = currentUser && currentUser.uid || '';
    guardWorkoutLoss(() => {
        if (uid !== (currentUser && currentUser.uid || '') || !(state.savedWorkouts || []).some(item => item.id === id)) return;
        clearInterval(workoutTimer);
        exitWizardMode();
        resetWorkoutPlanUI();
        assigningToClient = null;
        window._activeAssignedWorkout = null;
        state.workoutEnv = plan.env;
        currentWorkoutContext = { env: plan.env, focus: plan.focus, muscles: null, includeCore: plan.includeCore, savedWorkoutId: plan.id };
        showAllExercisesInPicker = false;
        document.getElementById('workout-setup').classList.add('hidden');
        document.getElementById('coach-plan-card').classList.add('hidden');
        const active = document.getElementById('workout-active');
        active.classList.remove('hidden');
        active.setAttribute('data-saved-plan', 'true');
        document.getElementById('active-workout-title').innerText = `${plan.env === 'home' ? 'Home' : 'Gym'} · ${plan.name}`;
        document.getElementById('exercise-list').innerHTML = '';
        savedWorkoutSessionExercises(plan).forEach(ex => {
            const exerciseId = addExercise(ex.name, { skipInitialSet: true });
            ex.sets.forEach(set => addSetToExercise(exerciseId, getPersonalRecord(ex.name), ex.name,
                { initialReps: set.reps, initialWeight: set.weight, initialRir: set.rir }));
        });
        workoutStartTime = Date.now();
        workoutAccumulatedSeconds = 0;
        startWorkoutTimer();
        renderWorkoutEnvTabs();
        try { history.pushState({ workout: true }, ''); } catch (error) {}
        enterWizardMode();
        persistActiveWorkout();
        showToast('Saved workout ready with your latest lifting figures');
    });
}

function saveActiveWorkoutAsPlan() {
    const snapshot = snapshotActiveWorkout();
    if (!snapshot || !snapshot.exercises.some(ex => ex.name.trim())) { showToast('Add exercises before saving a plan'); return; }
    editSavedWorkout();
    workoutPlanDraft.name = snapshot.title.slice(0, 100);
    workoutPlanDraft.env = currentWorkoutContext && currentWorkoutContext.env || state.workoutEnv || 'gym';
    workoutPlanDraft.focus = currentWorkoutContext && WORKOUT_PLAN_FOCUSES.includes(currentWorkoutContext.focus) ? currentWorkoutContext.focus : 'Full Body';
    workoutPlanDraft.includeCore = Boolean(currentWorkoutContext && currentWorkoutContext.includeCore);
    workoutPlanDraft.exercises = snapshot.exercises.filter(ex => ex.name.trim()).map(ex => ({
        name: ex.name, type: (getEnvDB(workoutPlanDraft.env).Core?.isolation || []).includes(ex.name) ? 'core' : isCompoundExercise(ex.name) ? 'compound' : 'isolation',
        group: '', sets: ex.sets.length ? ex.sets.map(set => ({ ...set })) : [{ reps: '', weight: '', rir: '' }]
    }));
    if (workoutPlanDraft.exercises.some(ex => ex.type === 'core')) workoutPlanDraft.includeCore = true;
    document.getElementById('workout-plan-name').value = workoutPlanDraft.name;
    document.getElementById('workout-plan-env').value = workoutPlanDraft.env;
    document.getElementById('workout-plan-focus').value = workoutPlanDraft.focus;
    document.getElementById('workout-plan-core').checked = workoutPlanDraft.includeCore;
    workoutPlanSession.dirty = true;
    renderWorkoutPlanExercisePicker();
    renderWorkoutPlanExercises();
}
