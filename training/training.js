    // ==========================================================================
    // EXERCISE DATABASE
    // ==========================================================================

    const EXERCISE_DB = {
        gym: {
            'Full Body': {
                compound: [
                    // LOWER BODY — Squat pattern
                    'Barbell Squat', 'Squat', 'Weighted Machine Leg Press', 'Pin Machine Leg Press', 'Forward Lunges', 'Hack Squat', 'Front Squat', 'Bulgarian Split Squat', 'Reverse Lunges', 'Elevated Front Heel Reverse Lunges',
                    // LOWER BODY — Hinge pattern
                    'Deadlift', 'Romanian Deadlift', 'Good Morning', 'Stiff Leg Deadlift', 'Sumo Deadlift', 'Single Leg Romanian Deadlift', 'Barbell Hip Thrusts', 'Weight Machine Hip Thrusts',
                    // UPPER BODY — Push
                    'Bench Press', 'Overhead Press', 'Incline Bench Press', 'Upright Dips', 'Lean Forward Dips', 'Assisted Tricep Dips', 'Chest Press Machine', 'Shoulder Press Machine', 'Close Grip Bench Press', 'DB Bench Press', 'Incline DB Bench Press', 'Z Press',
                    // UPPER BODY — Pull
                    'Assisted Pull Ups', 'Assisted Chin Ups', 'Barbell Row', 'Lat Pulldown', 'T-Bar Row', 'Seated Row Weight Machine', 'Seated Row Cable Machine', 'Chin Ups', 'Dumbbell Row', 'Pendlay Row'
                ],
                isolation: [
                    // Biceps
                    'Dumbbell Bicep Curl', 'Barbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl', 'Concentration Curl', 'Incline Dumbbell Curl', 'EZ Bar Curl', 'Spider Curls', 'Drag Curls', 'Close Grip Upright Rows',
                    // Triceps
                    'Tricep Pushdown', 'Skull Crushers', 'Overhead Extension', 'Cable Tricep Extension', 'Rope Pushdown', 'Single Arm Tricep Extension',
                    // Shoulders
                    'Cable Lateral Raise', 'Cable Front Raise', 'Face Pulls', 'Cable Reverse Flies', 'Dumbbell Lateral Raise', 'Dumbbell Reverse Flies', 'Rear Delt Machine', 'Wide Upright Row',
                    // Chest
                    'Cable Flies', 'Pec Deck', 'Dumbbell Flies', 'Incline Dumbbell Flies', 'Upper Chest Flies', 'Low to High Cable Flyes',
                    // Back
                    'Cable Row', 'Straight Arm Pulldown', 'Reverse Flyes', 'Single Arm Lat Pulldown', 'Machine Pullover',
                    // Glutes
                    'Cable Kickback', 'Hip Abduction', 'Glute Bridge', 'Single Leg Hip Thrust', 'Glute Kickback Machine', 'Banded Clamshells',
                    // Quads
                    'Leg Extension', 'Sissy Squat', 'Step Ups', 'Single Leg Extension', 'Walking Lunges',
                    // Hamstrings
                    'Leg Curl', 'Nordic Curl', 'Seated Leg Curl', 'Lying Leg Curl', 'Cable Pull Through',
                    // Calves
                    'Standing Calf Raise', 'Seated Calf Raise', 'Donkey Calf Raise', 'Single Leg Calf Raise', 'Tibialis Raise'
                ]
            },
            'Upper': {
                compound: [
                    'Bench Press', 'Overhead Press', 'Incline Bench Press', 'Upright Dips', 'Lean Forward Dips', 'Assisted Tricep Dips', 'Chest Press Machine', 'Shoulder Press Machine', 'Close Grip Bench Press', 'DB Bench Press', 'Incline DB Bench Press', 'Z Press', 'Assisted Pull Ups', 'Assisted Chin Ups', 'Barbell Row', 'Lat Pulldown', 'T-Bar Row', 'Seated Row Weight Machine', 'Seated Row Cable Machine', 'Chin Ups', 'Dumbbell Row', 'Pendlay Row'
                ],
                isolation: [
                    'Dumbbell Bicep Curl', 'Barbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl', 'Concentration Curl', 'Incline Dumbbell Curl', 'EZ Bar Curl', 'Spider Curls', 'Drag Curls', 'Close Grip Upright Rows', 'Tricep Pushdown', 'Skull Crushers', 'Overhead Extension', 'Cable Tricep Extension', 'Rope Pushdown', 'Single Arm Tricep Extension', 'Cable Row', 'Face Pulls', 'Straight Arm Pulldown', 'Reverse Flyes', 'Single Arm Lat Pulldown', 'Machine Pullover', 'Cable Flies', 'Pec Deck', 'Dumbbell Flies', 'Incline Dumbbell Flies', 'Upper Chest Flies', 'Low to High Cable Flyes'
                ]
            },
            'Lower': {
                compound: [
                    'Barbell Squat', 'Squat', 'Weighted Machine Leg Press', 'Pin Machine Leg Press', 'Forward Lunges', 'Hack Squat', 'Front Squat', 'Bulgarian Split Squat', 'Reverse Lunges', 'Elevated Front Heel Reverse Lunges', 'Deadlift', 'Romanian Deadlift', 'Good Morning', 'Stiff Leg Deadlift', 'Sumo Deadlift', 'Single Leg Romanian Deadlift', 'Barbell Hip Thrusts', 'Weight Machine Hip Thrusts'
                ],
                isolation: [
                    'Leg Extension', 'Walking Lunges', 'Leg Curl', 'Nordic Curl', 'Seated Leg Curl', 'Lying Leg Curl', 'Cable Pull Through', 'Cable Kickback', 'Hip Abduction', 'Glute Bridge', 'Single Leg Hip Thrust', 'Glute Kickback Machine', 'Banded Side Steps', 'Standing Calf Raise', 'Seated Calf Raise', 'Donkey Calf Raise', 'Single Leg Calf Raise', 'Tibialis Raise'
                ]
            },
            'Push': {
                compound: ['Bench Press', 'Overhead Press', 'Incline Press', 'Dips', 'Assisted Tricep Dips', 'Chest Press Machine', 'Shoulder Press Machine', 'Decline Bench Press', 'Close Grip Bench Press'],
                isolation: ['Tricep Pushdown', 'Lateral Raise', 'Cable Flyes', 'Skull Crushers', 'Pec Deck', 'Overhead Tricep Extension', 'Front Raise', 'Dumbbell Flyes']
            },
            'Pull': {
                compound: ['Pull Ups', 'Assisted Pull Ups', 'Assisted Chin Ups', 'Barbell Row', 'Lat Pulldown', 'T-Bar Row', 'Seated Row Machine', 'Chin Ups', 'Dumbbell Row', 'Pendlay Row'],
                isolation: ['Bicep Curl', 'Face Pulls', 'Hammer Curl', 'Cable Row', 'Preacher Curl', 'Reverse Flyes', 'Straight Arm Pulldown', 'Cable Curl']
            },
            'Legs': {
                compound: [
                    'Barbell Squat', 'Squat', 'Weighted Machine Leg Press', 'Pin Machine Leg Press', 'Forward Lunges', 'Hack Squat', 'Front Squat', 'Bulgarian Split Squat', 'Reverse Lunges', 'Elevated Front Heel Reverse Lunges', 'Deadlift', 'Romanian Deadlift', 'Good Morning', 'Stiff Leg Deadlift', 'Sumo Deadlift', 'Single Leg Romanian Deadlift', 'Barbell Hip Thrusts', 'Weight Machine Hip Thrusts'
                ],
                isolation: ['Leg Extension', 'Walking Lunges', 'Leg Curl', 'Nordic Curl', 'Seated Leg Curl', 'Lying Leg Curl', 'Cable Pull Through', 'Cable Kickback', 'Hip Abduction', 'Glute Bridge', 'Single Leg Hip Thrust', 'Glute Kickback Machine', 'Banded Side Steps', 'Standing Calf Raise', 'Seated Calf Raise', 'Donkey Calf Raise', 'Single Leg Calf Raise', 'Tibialis Raise']
            },
            'Chest': {
                compound: ['Bench Press', 'Incline Press', 'Dumbbell Press', 'Chest Press Machine', 'Decline Bench Press', 'Incline Dumbbell Press', 'Dips', 'Assisted Tricep Dips'],
                isolation: ['Cable Flies', 'Pec Deck', 'Dumbbell Flies', 'Incline Dumbbell Flies', 'Upper Chest Flies', 'Low to High Cable Flyes']
            },
            'Back': {
                compound: ['Pull Ups', 'Assisted Pull Ups', 'Assisted Chin Ups', 'Barbell Row', 'Lat Pulldown', 'T-Bar Row', 'Seated Row Machine', 'Chin Ups', 'Dumbbell Row', 'Pendlay Row'],
                isolation: ['Cable Row', 'Face Pulls', 'Straight Arm Pulldown', 'Reverse Flyes', 'Single Arm Lat Pulldown', 'Machine Pullover']
            },
            'Shoulders': {
                compound: ['Overhead Press', 'Arnold Press', 'Shoulder Press Machine', 'Seated Dumbbell Press', 'Push Press'],
                isolation: ['Lateral Raise', 'Front Raise', 'Face Pulls', 'Reverse Flyes', 'Cable Lateral Raise', 'Rear Delt Machine', 'Upright Row']
            },
            'Biceps': {
                compound: ['Chin Ups', 'Assisted Chin Ups', 'Close Grip Pull Ups', 'Underhand Barbell Row', 'Machine Bicep Curl'],
                isolation: ['Barbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl', 'Concentration Curl', 'Incline Dumbbell Curl', 'EZ Bar Curl']
            },
            'Triceps': {
                compound: ['Close Grip Bench Press', 'Dips', 'Assisted Tricep Dips', 'JM Press', 'Diamond Push Ups', 'Machine Tricep Press'],
                isolation: ['Tricep Pushdown', 'Skull Crushers', 'Overhead Extension', 'Cable Tricep Extension', 'Rope Pushdown', 'Single Arm Tricep Extension']
            },
            'Quads': {
                compound: ['Squat', 'Leg Press', 'Lunges', 'Hack Squat', 'Front Squat', 'Bulgarian Split Squat'],
                isolation: ['Leg Extension', 'Sissy Squat', 'Step Ups', 'Single Leg Extension', 'Walking Lunges']
            },
            'Hamstrings': {
                compound: ['Romanian Deadlift', 'Good Morning', 'Stiff Leg Deadlift', 'Sumo Deadlift', 'Single Leg Romanian Deadlift'],
                isolation: ['Leg Curl', 'Nordic Curl', 'Seated Leg Curl', 'Lying Leg Curl', 'Cable Pull Through']
            },
            'Glutes': {
                compound: ['Hip Thrust', 'Bulgarian Split Squat', 'Sumo Deadlift', 'Romanian Deadlift', 'Walking Lunges'],
                isolation: ['Cable Kickback', 'Hip Abduction', 'Glute Bridge', 'Single Leg Hip Thrust', 'Glute Kickback Machine', 'Banded Side Steps']
            },
            'Calves': {
                compound: ['Smith Machine Calf Raise', 'Leg Press Calf Raise', 'Calf Press Machine', 'Weighted Box Jumps'],
                isolation: ['Standing Calf Raise', 'Seated Calf Raise', 'Donkey Calf Raise', 'Single Leg Calf Raise', 'Tibialis Raise']
            }
        },
        home: {
            'Full Body': {
                compound: ['Push Ups', 'Bodyweight Squat', 'Burpees', 'Resistance Band Deadlifts', 'Resistance Bands Squats', 'Resistance Bands Romanian Deadlifts', 'Resistance Band Back Rows'],
                isolation: ['Plank', 'Crunches', 'Leg Raises', 'Resistance Bands Bicep Curls', 'Resistance Bands Lateral Shoulder Raises']
            },
            'Upper': {
                compound: ['Push Ups', 'Pike Push Ups', 'Inverted Row'],
                isolation: ['Tricep Dips', 'Plank to Push Up', 'Superman']
            },
            'Lower': {
                compound: ['Bodyweight Squat', 'Lunges', 'Step Ups'],
                isolation: ['Glute Bridge', 'Calf Raise', 'Donkey Kicks']
            },
            'Push': {
                compound: ['Push Ups', 'Pike Push Ups'],
                isolation: ['Diamond Push Ups', 'Tricep Dips', 'Shoulder Taps']
            },
            'Pull': {
                compound: ['Inverted Row', 'Chin Ups'],
                isolation: ['Superman', 'Reverse Snow Angels', 'Bicep Holds']
            },
            'Legs': {
                compound: ['Squat', 'Lunges', 'Jump Squat'],
                isolation: ['Glute Bridge', 'Calf Raise', 'Leg Raises']
            },
            'Chest': {
                compound: ['Push Ups', 'Decline Push Ups'],
                isolation: ['Diamond Push Ups', 'Wide Push Ups', 'Resistance Band Chest Flyes']
            },
            'Back': {
                compound: ['Inverted Row', 'Chin Ups', 'Resistance Band Back Rows'],
                isolation: ['Superman', 'Reverse Snow Angels', 'Resistance Band Pull Aparts']
            },
            'Shoulders': {
                compound: ['Pike Push Ups', 'Handstand Push Ups'],
                isolation: ['Resistance Bands Lateral Shoulder Raises', 'Resistance Band Front Raises', 'Shoulder Taps']
            },
            'Biceps': {
                compound: ['Chin Ups'],
                isolation: ['Resistance Bands Bicep Curls', 'Bicep Holds', 'Resistance Band Hammer Curls']
            },
            'Triceps': {
                compound: ['Diamond Push Ups', 'Tricep Dips'],
                isolation: ['Resistance Bands Tricep Extension', 'Bench Dips', 'Close-Grip Push Ups']
            },
            'Quads': {
                compound: ['Bodyweight Squat', 'Jump Squat', 'Lunges', 'Resistance Bands Squats'],
                isolation: ['Wall Sit', 'Sissy Squat', 'Step Ups']
            },
            'Hamstrings': {
                compound: ['Resistance Bands Romanian Deadlifts', 'Single-Leg Romanian Deadlift'],
                isolation: ['Glute Bridge', 'Hamstring Walkouts', 'Nordic Curl']
            },
            'Glutes': {
                compound: ['Bulgarian Split Squat', 'Resistand Bands Reverse Lunges'],
                isolation: ['Glute Bridge', 'Donkey Kicks', 'Resistance Band Glute Kickbacks', 'Hip Thrust']
            },
            'Calves': {
                compound: [],
                isolation: ['Calf Raise', 'Single-Leg Calf Raise', 'Jump Rope']
            }
        }
    };

    // ALL_EXERCISES is auto-derived from EXERCISE_DB so any new exercise added to the DB
    // automatically appears in the dropdown picker without needing to update this list manually.
    const ALL_EXERCISES = (function () {
        const set = new Set();
        Object.values(EXERCISE_DB).forEach(env => {
            Object.values(env).forEach(group => {
                (group.compound || []).forEach(ex => set.add(ex));
                (group.isolation || []).forEach(ex => set.add(ex));
            });
        });
        return Array.from(set).sort();
    })();

    // ==========================================================================
    // CENTRAL EXERCISE-POOL ACCESSOR
    // ==========================================================================
    // Every place that picks exercises goes through this so that:
    //   • the user's OWN custom exercises are included, and
    //   • exercises they've marked unavailable at their gym are excluded.
    // Returns the same shape as EXERCISE_DB[env]: { Chest: {compound:[], isolation:[]}, ... }

    function isExerciseDisabled(name, env) {
        const d = (state.disabledExercises && state.disabledExercises[env]) || [];
        return d.indexOf(name) >= 0;
    }

    /**
     * Get the effective exercise DB for an environment: the built-in exercises
     * plus the user's custom ones, minus anything they've disabled.
     */
    function getEnvDB(env) {
        env = env || state.workoutEnv || 'gym';
        const base = EXERCISE_DB[env] || {};

        // Deep-ish copy so we never mutate the constant DB
        const out = {};
        Object.keys(base).forEach(key => {
            out[key] = {
                compound: (base[key].compound || []).slice(),
                isolation: (base[key].isolation || []).slice()
            };
        });

        // Merge in the user's custom exercises for this environment
        (state.customExercises || []).forEach(ce => {
            if (!ce || !ce.name) return;
            if ((ce.env || 'gym') !== env) return;
            const bucket = (ce.type === 'compound') ? 'compound' : 'isolation';

            // Add under each specific muscle it targets
            (ce.muscles || []).forEach(m => {
                if (!out[m]) out[m] = { compound: [], isolation: [] };
                if (out[m][bucket].indexOf(ce.name) < 0) out[m][bucket].push(ce.name);
            });
            // Add under its focus group (Push, Pull, Full Body, ...) if it has one
            if (ce.focus && ce.focus !== 'Specific Muscle') {
                if (!out[ce.focus]) out[ce.focus] = { compound: [], isolation: [] };
                if (out[ce.focus][bucket].indexOf(ce.name) < 0) out[ce.focus][bucket].push(ce.name);
            }
        });

        // Strip anything the user has turned off for this environment
        const disabled = (state.disabledExercises && state.disabledExercises[env]) || [];
        if (disabled.length > 0) {
            Object.keys(out).forEach(key => {
                out[key].compound = out[key].compound.filter(e => disabled.indexOf(e) < 0);
                out[key].isolation = out[key].isolation.filter(e => disabled.indexOf(e) < 0);
            });
        }
        return out;
    }

    /**
     * Every available exercise name in an environment (custom included, disabled removed).
     */
    function getAvailableExercises(env) {
        const db = getEnvDB(env);
        const set = new Set();
        Object.values(db).forEach(group => {
            (group.compound || []).forEach(e => set.add(e));
            (group.isolation || []).forEach(e => set.add(e));
        });
        return Array.from(set).sort();
    }

    // ==========================================================================
    // ADD CUSTOM EXERCISE FORM
    // ==========================================================================
    let newExEnv = 'gym';
    let newExType = 'compound';
    let newExMuscles = [];

    function openAddExerciseForm() {
        newExEnv = state.workoutEnv || 'gym';
        newExType = 'compound';
        newExMuscles = [];
        document.getElementById('new-ex-name').value = '';
        document.getElementById('new-ex-focus').value = 'Specific Muscle';
        const assistedCb = document.getElementById('new-ex-assisted');
        if (assistedCb) assistedCb.checked = false;
        setNewExEnv(newExEnv);
        setNewExType('compound');
        renderNewExMuscleChips();
        onNewExFocusChange();
        document.getElementById('add-exercise-modal').style.display = 'flex';
    }

    function closeAddExerciseForm() {
        document.getElementById('add-exercise-modal').style.display = 'none';
    }

    function setNewExEnv(env) {
        newExEnv = env;
        const g = document.getElementById('new-ex-env-gym');
        const h = document.getElementById('new-ex-env-home');
        const on = 'py-3 rounded-xl border-2 border-indigo-600 bg-indigo-600 text-white font-bold';
        const off = 'py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold';
        if (g) g.className = (env === 'gym') ? on : off;
        if (h) h.className = (env === 'home') ? on : off;
    }

    function setNewExType(type) {
        newExType = type;
        const c = document.getElementById('new-ex-type-compound');
        const i = document.getElementById('new-ex-type-isolation');
        const on = 'py-3 rounded-xl border-2 border-indigo-600 bg-indigo-600 text-white font-bold';
        const off = 'py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold';
        if (c) c.className = (type === 'compound') ? on : off;
        if (i) i.className = (type === 'isolation') ? on : off;
    }

    function onNewExFocusChange() {
        const focus = document.getElementById('new-ex-focus').value;
        const wrap = document.getElementById('new-ex-muscles-wrap');
        // Muscle chips only matter for Specific Muscle
        if (wrap) wrap.style.display = (focus === 'Specific Muscle') ? 'block' : 'none';
    }

    function renderNewExMuscleChips() {
        const box = document.getElementById('new-ex-muscle-chips');
        if (!box) return;
        box.innerHTML = SPECIFIC_MUSCLES.map(m => {
            const sel = newExMuscles.indexOf(m) >= 0;
            return `<button type="button" onclick="toggleNewExMuscle('${escapeJsString(m)}')"
                class="px-4 py-2 rounded-full text-xs font-bold border-2 ${sel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}">${escapeHtml(m)}</button>`;
        }).join('');
    }

    function toggleNewExMuscle(muscle) {
        const i = newExMuscles.indexOf(muscle);
        if (i >= 0) newExMuscles.splice(i, 1); else newExMuscles.push(muscle);
        renderNewExMuscleChips();
    }

    function saveCustomExercise() {
        const name = document.getElementById('new-ex-name').value.trim();
        const focus = document.getElementById('new-ex-focus').value;

        if (!name) { showToast('Enter an exercise name'); return; }
        if (focus === 'Specific Muscle' && newExMuscles.length === 0) {
            showToast('Pick at least one muscle it works'); return;
        }

        // Don't allow a duplicate name in the same environment
        const exists = (state.customExercises || []).some(c =>
            c.name.toLowerCase() === name.toLowerCase() && (c.env || 'gym') === newExEnv);
        if (exists) { showToast('You already have that exercise'); return; }

        if (!state.customExercises) state.customExercises = [];
        const isAssisted = !!(document.getElementById('new-ex-assisted') || {}).checked;
        state.customExercises.push({
            name: name,
            env: newExEnv,
            focus: focus,
            type: newExType,
            assisted: isAssisted, // when true, a LOWER weight is a better result
            // If a focus group was chosen, no specific muscles are required
            muscles: (focus === 'Specific Muscle') ? newExMuscles.slice() : []
        });
        saveState();
        syncExercisePrefs(); // push to the account so it follows the user across devices

        // Keep the reverse index in sync so swap/volume/ordering know about it
        if (newExMuscles.length > 0) {
            EXERCISE_TO_MUSCLES[name] = newExMuscles.slice();
        }

        closeAddExerciseForm();
        showToast(`Added "${name}" to your ${newExEnv} exercises ✓`);

        // If a workout is open, drop the new exercise straight into it
        const activeEl = document.getElementById('workout-active');
        if (activeEl && !activeEl.classList.contains('hidden')) {
            addExercise(name);
        }
        renderExerciseDatabase(); // refresh the settings list if it's open
    }

    // ==========================================================================
    // EXERCISE DATABASE (Settings) — pick what's available at your gym
    // ==========================================================================
    let dbEnv = 'gym';

    function openExerciseDatabase() {
        dbEnv = state.workoutEnv || 'gym';
        setDbEnv(dbEnv);
        const search = document.getElementById('db-search');
        if (search) search.value = '';
        document.getElementById('exercise-db-modal').style.display = 'flex';
        renderExerciseDatabase();
    }

    function closeExerciseDatabase() {
        document.getElementById('exercise-db-modal').style.display = 'none';
        updateExerciseDbStatus();
    }

    function setDbEnv(env) {
        dbEnv = env;
        const g = document.getElementById('db-env-gym');
        const h = document.getElementById('db-env-home');
        if (g) g.className = `flex-1 py-2 rounded-lg text-xs font-black uppercase ${env === 'gym' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`;
        if (h) h.className = `flex-1 py-2 rounded-lg text-xs font-black uppercase ${env === 'home' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`;
        renderExerciseDatabase();
    }

    /**
     * Every exercise that EXISTS for an environment (built-in + custom), ignoring
     * the disabled list — because the settings screen must show disabled ones too
     * so they can be turned back on.
     */
    function getAllExercisesForEnv(env) {
        const base = EXERCISE_DB[env] || {};
        const byMuscle = {};
        SPECIFIC_MUSCLES.forEach(m => {
            const b = base[m];
            if (!b) return;
            byMuscle[m] = new Set([...(b.compound || []), ...(b.isolation || [])]);
        });
        // Anything in a focus group but not a muscle group goes under "Other"
        const other = new Set();
        Object.keys(base).forEach(key => {
            if (SPECIFIC_MUSCLES.indexOf(key) >= 0) return;
            [...(base[key].compound || []), ...(base[key].isolation || [])].forEach(e => {
                const inMuscle = SPECIFIC_MUSCLES.some(m => byMuscle[m] && byMuscle[m].has(e));
                if (!inMuscle) other.add(e);
            });
        });

        // Merge the user's custom exercises in
        (state.customExercises || []).forEach(ce => {
            if ((ce.env || 'gym') !== env) return;
            if (ce.muscles && ce.muscles.length > 0) {
                ce.muscles.forEach(m => {
                    if (!byMuscle[m]) byMuscle[m] = new Set();
                    byMuscle[m].add(ce.name);
                });
            } else {
                other.add(ce.name);
            }
        });

        const out = {};
        SPECIFIC_MUSCLES.forEach(m => { if (byMuscle[m] && byMuscle[m].size) out[m] = Array.from(byMuscle[m]).sort(); });
        if (other.size) out['Other'] = Array.from(other).sort();
        return out;
    }

    function isCustomExercise(name, env) {
        return (state.customExercises || []).some(c =>
            c.name === name && (c.env || 'gym') === env);
    }

    function renderExerciseDatabase() {
        const list = document.getElementById('exercise-db-list');
        if (!list) return;
        const searchEl = document.getElementById('db-search');
        const q = (searchEl ? searchEl.value : '').trim().toLowerCase();

        const grouped = getAllExercisesForEnv(dbEnv);
        const disabled = (state.disabledExercises && state.disabledExercises[dbEnv]) || [];

        let total = 0, enabled = 0;
        const sections = [];

        Object.keys(grouped).forEach(muscle => {
            const matches = grouped[muscle].filter(e => !q || e.toLowerCase().includes(q));
            if (matches.length === 0) return;

            const rows = matches.map(ex => {
                total++;
                const isOff = disabled.indexOf(ex) >= 0;
                if (!isOff) enabled++;
                const custom = isCustomExercise(ex, dbEnv);
                const customObj = (state.customExercises || []).find(c => c.name === ex && (c.env || 'gym') === dbEnv);
                const isAssist = (customObj && customObj.assisted) || /assisted/i.test(ex);
                const safe = escapeJsString(ex);
                return `
                    <label class="flex items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                        <span class="text-sm font-medium flex-1 min-w-0 truncate">
                            ${escapeHtml(ex)}
                            ${custom ? '<span class="ml-1 text-[9px] font-black uppercase text-indigo-600">mine</span>' : ''}
                            ${isAssist ? '<span class="ml-1 text-[9px] font-black uppercase text-amber-600">assisted</span>' : ''}
                        </span>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            ${custom ? `<button onclick="event.preventDefault(); deleteCustomExercise('${safe}')" class="text-rose-500 text-[10px] font-bold">Delete</button>` : ''}
                            <input type="checkbox" ${isOff ? '' : 'checked'} onchange="toggleExerciseAvailable('${safe}', this.checked)" class="w-5 h-5 accent-indigo-600">
                        </div>
                    </label>`;
            }).join('');

            sections.push(`
                <div>
                    <h4 class="text-[11px] font-black uppercase text-slate-400 mb-2">${escapeHtml(muscle)}</h4>
                    <div class="space-y-1.5">${rows}</div>
                </div>`);
        });

        list.innerHTML = sections.length
            ? sections.join('')
            : '<p class="text-sm text-slate-400 text-center py-6">No exercises match that search.</p>';

        const countEl = document.getElementById('db-count');
        if (countEl) countEl.textContent = `${enabled} of ${total} exercises enabled for ${dbEnv === 'home' ? 'Home' : 'Gym'}`;
    }

    function toggleExerciseAvailable(name, isAvailable) {
        if (!state.disabledExercises) state.disabledExercises = { gym: [], home: [] };
        if (!state.disabledExercises[dbEnv]) state.disabledExercises[dbEnv] = [];
        const arr = state.disabledExercises[dbEnv];
        const i = arr.indexOf(name);
        if (isAvailable) {
            if (i >= 0) arr.splice(i, 1);   // enable → remove from disabled list
        } else {
            if (i < 0) arr.push(name);      // disable → add to disabled list
        }
        saveState();
        syncExercisePrefs(); // account-level, not device-level
        renderExerciseDatabase();
    }

    function dbSelectAll(enable) {
        if (!state.disabledExercises) state.disabledExercises = { gym: [], home: [] };
        const grouped = getAllExercisesForEnv(dbEnv);
        const all = [];
        Object.values(grouped).forEach(list => all.push(...list));
        state.disabledExercises[dbEnv] = enable ? [] : Array.from(new Set(all));
        saveState();
        syncExercisePrefs();
        renderExerciseDatabase();
        showToast(enable ? 'All exercises enabled' : 'All exercises disabled');
    }

    function deleteCustomExercise(name) {
        if (!confirm(`Delete "${name}" from your exercises?`)) return;
        state.customExercises = (state.customExercises || []).filter(c =>
            !(c.name === name && (c.env || 'gym') === dbEnv));
        saveState();
        syncExercisePrefs();
        renderExerciseDatabase();
        showToast(`Deleted "${name}"`);
    }

    function updateExerciseDbStatus() {
        const el = document.getElementById('exercise-db-status');
        if (!el) return;
        const env = state.workoutEnv || 'gym';
        const grouped = getAllExercisesForEnv(env);
        let total = 0;
        Object.values(grouped).forEach(l => { total += l.length; });
        const disabled = ((state.disabledExercises && state.disabledExercises[env]) || []).length;
        const custom = (state.customExercises || []).length;
        el.textContent = `${total - disabled} of ${total} enabled` + (custom ? ` · ${custom} custom` : '');
    }

    // ==========================================================================
    // REVERSE INDEX: which muscles each exercise targets.
    // Built once from the EXERCISE_DB so a swap can find alternatives that hit
    // the same muscle. Only the *specific muscle* keys count (Chest, Back, ...)
    // — not the focus groups like "Upper" or "Push", because those are
    // aggregations, not muscle groups.
    // ==========================================================================
    const SPECIFIC_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves'];

    // Order muscle groups from MOST demanding (trained first) to least. The big,
    // taxing muscles — quads, hamstrings, glutes, and back (lats/upper back) —
    // come first while you're freshest; the smaller muscles — biceps, triceps,
    // calves — come last. Chest and shoulders sit in the middle.
    const MUSCLE_PRIORITY_ORDER = ['Quads', 'Hamstrings', 'Glutes', 'Back', 'Chest', 'Shoulders', 'Biceps', 'Triceps', 'Calves'];

    /**
     * Reorder a list of exercises so that:
     *   1. Exercises are grouped by the muscle they primarily target, with the
     *      most demanding muscle groups first (per MUSCLE_PRIORITY_ORDER).
     *   2. Within each muscle group the more demanding COMPOUND lifts come before
     *      the isolation work.
     *   3. Each muscle group is finished before the next begins.
     * Cardio/core/unknown exercises fall to the end.
     */
    function orderWorkoutExercises(list, env) {
        const envDb = getEnvDB(env); // custom merged in, disabled filtered out
        const priorityIndex = {};
        MUSCLE_PRIORITY_ORDER.forEach((m, i) => { priorityIndex[m] = i; });
        const DEFAULT_PRIO = MUSCLE_PRIORITY_ORDER.length + 1;

        // Map each exercise to its primary muscle using the DB's own buckets.
        // Iterate muscles in priority order so an exercise appearing under more
        // than one muscle is assigned to the higher-priority one.
        const primaryMuscle = {};
        const compoundSet = new Set();
        MUSCLE_PRIORITY_ORDER.forEach(muscle => {
            const bucket = envDb[muscle];
            if (!bucket) return;
            (bucket.compound || []).forEach(ex => { if (!(ex in primaryMuscle)) primaryMuscle[ex] = muscle; compoundSet.add(ex); });
            (bucket.isolation || []).forEach(ex => { if (!(ex in primaryMuscle)) primaryMuscle[ex] = muscle; });
        });
        // Also mark compounds that live only in focus-group buckets (Full Body, etc.)
        Object.values(envDb).forEach(bucket => {
            (bucket.compound || []).forEach(ex => compoundSet.add(ex));
        });

        function muscleOf(ex) {
            if (primaryMuscle[ex]) return primaryMuscle[ex];
            // Fallback: use the reverse index, picking the highest-priority muscle.
            const muscles = EXERCISE_TO_MUSCLES[ex] || [];
            let best = null, bestP = Infinity;
            muscles.forEach(m => {
                const p = (priorityIndex[m] !== undefined) ? priorityIndex[m] : DEFAULT_PRIO;
                if (p < bestP) { bestP = p; best = m; }
            });
            return best;
        }

        // Decorate with original index so the sort stays stable for equal keys.
        return list.map((ex, i) => ({ ex, i })).sort((A, B) => {
            const ma = muscleOf(A.ex), mb = muscleOf(B.ex);
            const pa = (ma && priorityIndex[ma] !== undefined) ? priorityIndex[ma] : DEFAULT_PRIO;
            const pb = (mb && priorityIndex[mb] !== undefined) ? priorityIndex[mb] : DEFAULT_PRIO;
            if (pa !== pb) return pa - pb;                    // 1. demanding muscle group first
            const ca = compoundSet.has(A.ex) ? 0 : 1;
            const cb = compoundSet.has(B.ex) ? 0 : 1;
            if (ca !== cb) return ca - cb;                    // 2. compound before isolation
            return A.i - B.i;                                 // 3. otherwise keep original order
        }).map(o => o.ex);
    }

    // Supplementary muscle mappings for exercises whose names differ between the
    // focus-group lists and the per-muscle lists (so they still get volume credit).
    // Maps exercise name → the muscle(s) it primarily targets.
    const SUPPLEMENTARY_MUSCLE_MAP = {
        // Quads-dominant
        'Barbell Squat': ['Quads'], 'Weighted Machine Leg Press': ['Quads'], 'Pin Machine Leg Press': ['Quads'],
        'Forward Lunges': ['Quads', 'Glutes'], 'Reverse Lunges': ['Quads', 'Glutes'],
        'Elevated Front Heel Reverse Lunges': ['Quads', 'Glutes'],
        // Hinge / posterior chain
        'Deadlift': ['Hamstrings', 'Glutes', 'Back'], 'Barbell Hip Thrusts': ['Glutes'],
        'Weight Machine Hip Thrusts': ['Glutes'], 'Banded Clamshells': ['Glutes'],
        // Chest pressing variants
        'Incline Bench Press': ['Chest'], 'DB Bench Press': ['Chest'], 'Incline DB Bench Press': ['Chest'],
        'Upright Dips': ['Chest', 'Triceps'], 'Lean Forward Dips': ['Chest', 'Triceps'],
        'Assisted Tricep Dips': ['Triceps', 'Chest'],
        'Cable Flyes': ['Chest'], 'Dumbbell Flyes': ['Chest'],
        // Shoulders
        'Z Press': ['Shoulders'], 'Cable Front Raise': ['Shoulders'], 'Cable Reverse Flies': ['Shoulders'],
        'Dumbbell Lateral Raise': ['Shoulders'], 'Dumbbell Reverse Flies': ['Shoulders'],
        'Wide Upright Row': ['Shoulders'],
        // Back / pull
        'Assisted Pull Ups': ['Back'], 'Assisted Chin Ups': ['Back', 'Biceps'], 'Seated Row Weight Machine': ['Back'],
        'Seated Row Cable Machine': ['Back'],
        // Biceps
        'Dumbbell Bicep Curl': ['Biceps'], 'Bicep Curl': ['Biceps'], 'Spider Curls': ['Biceps'],
        'Drag Curls': ['Biceps'], 'Close Grip Upright Rows': ['Biceps'],
        // Triceps
        'Overhead Tricep Extension': ['Triceps']
    };

    const EXERCISE_TO_MUSCLES = (function () {
        const map = Object.create(null);
        Object.values(EXERCISE_DB).forEach(env => {
            SPECIFIC_MUSCLES.forEach(muscle => {
                const entry = env[muscle];
                if (!entry) return;
                [].concat(entry.compound || [], entry.isolation || []).forEach(ex => {
                    if (!map[ex]) map[ex] = new Set();
                    map[ex].add(muscle);
                });
            });
        });
        // Fold in the supplementary mappings for exercises the per-muscle lists missed
        Object.entries(SUPPLEMENTARY_MUSCLE_MAP).forEach(([ex, muscles]) => {
            if (!map[ex]) map[ex] = new Set();
            muscles.forEach(m => map[ex].add(m));
        });
        // Convert sets to arrays
        Object.keys(map).forEach(k => { map[k] = Array.from(map[k]); });
        return map;
    })();

    // ==========================================================================
    // VOLUME CONTRIBUTION
    // ==========================================================================
    // Primary movers count 1.0 set toward a muscle's weekly volume.
    // Secondary (assisting) movers count 0.5. This map lists the SECONDARY
    // muscles for compound lifts — the primary muscle(s) come from
    // EXERCISE_TO_MUSCLES (what the exercise is filed under in the DB).
    const SECONDARY_MUSCLE_MAP = {
        // Horizontal/incline presses → triceps + front delts assist the chest
        'Bench Press': ['Triceps', 'Shoulders'],
        'Incline Bench Press': ['Triceps', 'Shoulders'],
        'Incline Press': ['Triceps', 'Shoulders'],
        'Decline Bench Press': ['Triceps', 'Shoulders'],
        'Dumbbell Press': ['Triceps', 'Shoulders'],
        'Incline Dumbbell Press': ['Triceps', 'Shoulders'],
        'DB Bench Press': ['Triceps', 'Shoulders'],
        'Incline DB Bench Press': ['Triceps', 'Shoulders'],
        'Chest Press Machine': ['Triceps', 'Shoulders'],
        'Dips': ['Triceps', 'Shoulders'],
        'Upright Dips': ['Triceps', 'Shoulders'],
        'Lean Forward Dips': ['Triceps', 'Shoulders'],
        // Overhead pressing → triceps assist the shoulders
        'Overhead Press': ['Triceps'],
        'Shoulder Press Machine': ['Triceps'],
        'Seated Dumbbell Press': ['Triceps'],
        'Arnold Press': ['Triceps'],
        'Push Press': ['Triceps'],
        'Z Press': ['Triceps'],
        // Close-grip pressing → chest assists triceps
        'Close Grip Bench Press': ['Chest', 'Shoulders'],
        'JM Press': ['Chest'],
        'Diamond Push Ups': ['Chest', 'Shoulders'],
        // Vertical/horizontal pulls → biceps + rear delts assist the back
        'Pull Ups': ['Biceps'],
        'Chin Ups': ['Biceps'],
        'Assisted Pull Ups': ['Biceps'],
        'Assisted Chin Ups': ['Biceps'],
        'Close Grip Pull Ups': ['Biceps'],
        'Lat Pulldown': ['Biceps'],
        'Single Arm Lat Pulldown': ['Biceps'],
        'Barbell Row': ['Biceps'],
        'Pendlay Row': ['Biceps'],
        'Dumbbell Row': ['Biceps'],
        'T-Bar Row': ['Biceps'],
        'Cable Row': ['Biceps'],
        'Seated Row Machine': ['Biceps'],
        'Seated Row Weight Machine': ['Biceps'],
        'Seated Row Cable Machine': ['Biceps'],
        'Underhand Barbell Row': ['Biceps'],
        // Squat-pattern → glutes + hamstrings assist the quads
        'Squat': ['Glutes', 'Hamstrings'],
        'Barbell Squat': ['Glutes', 'Hamstrings'],
        'Front Squat': ['Glutes', 'Hamstrings'],
        'Hack Squat': ['Glutes'],
        'Leg Press': ['Glutes', 'Hamstrings'],
        'Weighted Machine Leg Press': ['Glutes', 'Hamstrings'],
        'Pin Machine Leg Press': ['Glutes', 'Hamstrings'],
        'Lunges': ['Quads', 'Hamstrings'],
        'Walking Lunges': ['Quads', 'Hamstrings'],
        'Forward Lunges': ['Hamstrings'],
        'Reverse Lunges': ['Hamstrings'],
        'Elevated Front Heel Reverse Lunges': ['Hamstrings'],
        'Bulgarian Split Squat': ['Quads', 'Hamstrings'],
        // Hinge-pattern → glutes + back assist the hamstrings
        'Deadlift': ['Quads'],
        'Romanian Deadlift': ['Glutes', 'Back'],
        'Stiff Leg Deadlift': ['Glutes', 'Back'],
        'Single Leg Romanian Deadlift': ['Glutes', 'Back'],
        'Sumo Deadlift': ['Quads', 'Back'],
        'Good Morning': ['Glutes', 'Back'],
        'Hip Thrust': ['Hamstrings'],
        'Barbell Hip Thrusts': ['Hamstrings'],
        'Weight Machine Hip Thrusts': ['Hamstrings'],
        'Cable Pull Through': ['Glutes']
    };

    /**
     * Returns a map of muscle → volume contribution for ONE set of an exercise.
     * Primary movers (what the exercise is filed under) count 1.0; secondary
     * (assisting) movers count 0.5. If a muscle is somehow both, 1.0 wins.
     */
    function getExerciseVolumeContribution(exerciseName) {
        const contrib = {};
        const primary = EXERCISE_TO_MUSCLES[exerciseName] || [];
        primary.forEach(m => { contrib[m] = 1.0; });

        const secondary = SECONDARY_MUSCLE_MAP[exerciseName] || [];
        secondary.forEach(m => {
            // Don't let a secondary downgrade a primary; only add if not already primary
            if (contrib[m] === undefined) contrib[m] = 0.5;
        });
        return contrib;
    }

    // ==========================================================================
    // EXERCISE RATINGS — user "how much do you like this exercise" data.
    // Stored as a running total + count so the rolling average is cheap to compute.
    // ==========================================================================

    /**
     * Get the user's average rating for an exercise, or null if never rated.
     * Ratings are 1-5 (1 = hate it, 5 = love it).
     */
    function getExerciseRating(exerciseName) {
        const r = state.exerciseRatings && state.exerciseRatings[exerciseName];
        if (!r || !r.count) return null;
        return r.total / r.count;
    }

    /**
     * Record a rating for an exercise. Appends to the running average.
     */
    function recordExerciseRating(exerciseName, rating) {
        if (!state.exerciseRatings) state.exerciseRatings = {};
        const existing = state.exerciseRatings[exerciseName] || { total: 0, count: 0 };
        existing.total += rating;
        existing.count += 1;
        state.exerciseRatings[exerciseName] = existing;
        saveState();
    }

    /**
     * Sample `count` items from `pool` weighted by their rating.
     * Unrated exercises get a default weight equivalent to a 3-star rating.
     * Higher-rated → more likely to be picked. But low-rated still has a non-zero
     * chance, so a single bad day doesn't permanently kill an exercise.
     */
    function weightedSample(pool, count) {
        if (pool.length === 0) return [];
        const remaining = pool.slice();
        const picked = [];
        while (picked.length < count && remaining.length > 0) {
            // Weight: rating squared so 5-stars is ~6× more likely than 1-star.
            // Unrated ≈ 3 stars baseline.
            const weights = remaining.map(ex => {
                const r = getExerciseRating(ex);
                const stars = r === null ? 3 : r;
                return stars * stars;
            });
            const total = weights.reduce((a, b) => a + b, 0);
            let roll = Math.random() * total;
            let idx = 0;
            for (let i = 0; i < weights.length; i++) {
                roll -= weights[i];
                if (roll <= 0) { idx = i; break; }
            }
            picked.push(remaining[idx]);
            remaining.splice(idx, 1);
        }
        return picked;
    }

    /**
     * Find a replacement for an exercise that hits the same muscle(s).
     * Excludes the exercise being replaced and any exercises already in the
     * current workout (no point swapping for something you're already doing).
     * Weighted by rating so the user's preferred alternatives come up first.
     */
    function findSwapExercise(currentName) {
        const targetMuscles = EXERCISE_TO_MUSCLES[currentName];
        if (!targetMuscles || targetMuscles.length === 0) return null;

        // Restrict the whole candidate pool to the ACTIVE environment so a gym
        // swap never returns a home exercise and vice versa.
        const env = (currentWorkoutContext && currentWorkoutContext.env) || state.workoutEnv || 'gym';
        const envDb = getEnvDB(env); // custom merged in, disabled filtered out

        // Set of every exercise that exists in the active environment
        const envExercises = new Set();
        Object.values(envDb).forEach(group => {
            (group.compound || []).forEach(ex => envExercises.add(ex));
            (group.isolation || []).forEach(ex => envExercises.add(ex));
        });

        // Candidates = same-muscle exercises that ALSO exist in this environment
        const candidates = new Set();
        Object.keys(EXERCISE_TO_MUSCLES).forEach(ex => {
            if (ex === currentName) return;
            if (!envExercises.has(ex)) return; // not in this environment — skip
            const exMuscles = EXERCISE_TO_MUSCLES[ex];
            if (exMuscles.some(m => targetMuscles.indexOf(m) >= 0)) {
                candidates.add(ex);
            }
        });

        // Exclude exercises that are already in the active workout
        document.querySelectorAll('#exercise-list input[type="text"]').forEach(input => {
            const v = input.value.trim();
            if (v) candidates.delete(v);
        });

        const pool = Array.from(candidates);
        if (pool.length === 0) return null;
        const sampled = weightedSample(pool, 1);
        return sampled[0] || null;
    }


    const CARDIO_EXERCISES = ['Treadmill', 'Rowing Machine', 'Stationary Bike', 'Elliptical', 'Stair Climber'];
    const CORE_EXERCISES = ['Plank', 'Crunches', 'Russian Twists', 'Leg Raises', 'Mountain Climbers', 'Dead Bug'];

    // ==========================================================================
    // UK STORES & RESTAURANTS LIST
    // ==========================================================================

    const UK_STORES_RESTAURANTS = [
        { name: 'All Stores & Restaurants', value: 'all', type: 'all' },
        { name: 'Tesco', value: 'tesco', type: 'supermarket' },
        { name: "Sainsbury's", value: 'sainsburys', type: 'supermarket' },
        { name: 'ASDA', value: 'asda', type: 'supermarket' },
        { name: 'Morrisons', value: 'morrisons', type: 'supermarket' },
        { name: 'Aldi', value: 'aldi', type: 'supermarket' },
        { name: 'Lidl', value: 'lidl', type: 'supermarket' },
        { name: 'Waitrose', value: 'waitrose', type: 'supermarket' },
        { name: 'Co-op', value: 'coop', type: 'supermarket' },
        { name: 'Iceland', value: 'iceland', type: 'supermarket' },
        { name: 'Costco', value: 'costco', type: 'supermarket' },
        { name: 'M&S Food', value: 'marks', type: 'supermarket' },
        { name: 'Ocado', value: 'ocado', type: 'supermarket' },
        { name: 'Farmfoods', value: 'farmfoods', type: 'supermarket' },
        { name: 'Booths', value: 'booths', type: 'supermarket' },
        { name: 'Budgens', value: 'budgens', type: 'supermarket' },
        { name: "McDonald's", value: 'mcdonalds', type: 'fastfood' },
        { name: 'KFC', value: 'kfc', type: 'fastfood' },
        { name: 'Burger King', value: 'burgerking', type: 'fastfood' },
        { name: 'Subway', value: 'subway', type: 'fastfood' },
        { name: 'Greggs', value: 'greggs', type: 'fastfood' },
        { name: "Nando's", value: 'nandos', type: 'fastfood' },
        { name: 'Pizza Hut', value: 'pizzahut', type: 'fastfood' },
        { name: "Domino's", value: 'dominos', type: 'fastfood' },
        { name: "Papa John's", value: 'papajohns', type: 'fastfood' },
        { name: 'Five Guys', value: 'fiveguys', type: 'fastfood' },
        { name: 'Wagamama', value: 'wagamama', type: 'fastfood' },
        { name: 'Pret A Manger', value: 'pret', type: 'fastfood' },
        { name: 'Leon', value: 'leon', type: 'fastfood' },
        { name: 'Yo! Sushi', value: 'yosushi', type: 'fastfood' },
        { name: 'Gourmet Burger Kitchen', value: 'gbk', type: 'fastfood' },
        { name: 'Costa Coffee', value: 'costa', type: 'fastfood' },
        { name: 'Starbucks', value: 'starbucks', type: 'fastfood' },
        { name: 'Caffè Nero', value: 'nero', type: 'fastfood' }
    ].sort((a, b) => {
        if (a.value === 'all') return -1;
        if (b.value === 'all') return 1;
        return a.name.localeCompare(b.name);
    });

    // ==========================================================================
    // DASHBOARD
    // ==========================================================================

    function renderDashboard() {
        const todayMeals = state.dailyMeals.filter(m => m.date === state.viewDate);
        const totalCals = todayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
        const totalProtein = todayMeals.reduce((sum, m) => sum + (m.protein || 0), 0);
        const totalCarbs = todayMeals.reduce((sum, m) => sum + (m.carbs || 0), 0);
        const totalFat = todayMeals.reduce((sum, m) => sum + (m.fat || 0), 0);

        const dashCals = document.getElementById('dash-calories');
        if (dashCals) dashCals.innerText = Math.round(totalCals);

        const dashProtein = document.getElementById('dash-protein');
        if (dashProtein) dashProtein.innerText = Math.round(totalProtein) + 'g';

        // FIXED: use actual carbs/fat totals from logged meals (not made-up percentages)
        const dashCarbs = document.getElementById('dash-carbs');
        if (dashCarbs) dashCarbs.innerText = Math.round(totalCarbs) + 'g';

        const dashFat = document.getElementById('dash-fat');
        if (dashFat) dashFat.innerText = Math.round(totalFat) + 'g';

        const calorieGoal = (state.goals && state.goals.calories) ? state.goals.calories : 2500;
        const progress = Math.min((totalCals / calorieGoal) * 534, 534);
        const progressEl = document.getElementById('calorie-progress');
        if (progressEl) progressEl.style.strokeDashoffset = 534 - progress;

        const water = (state.waterLogs && state.waterLogs[state.viewDate]) || 0;
        const waterGoal = (state.goals && state.goals.water) ? state.goals.water : 2500;
        const waterCountEl = document.getElementById('water-count');
        if (waterCountEl) waterCountEl.innerText = `${(water / 1000).toFixed(2)} / ${(waterGoal / 1000).toFixed(1)}L`;
        const waterBar = document.getElementById('water-progress-bar');
        if (waterBar) waterBar.style.width = Math.min(100, (water / waterGoal) * 100) + '%';

        const steps = (state.stepsLogs && state.stepsLogs[state.viewDate]) || 0;
        const stepsGoal = (state.goals && state.goals.steps) ? state.goals.steps : 10000;
        const stepsCountEl = document.getElementById('steps-count');
        if (stepsCountEl) stepsCountEl.innerText = `${steps.toLocaleString()} / ${stepsGoal.toLocaleString()}`;
        const stepsBar = document.getElementById('steps-progress-bar');
        if (stepsBar) stepsBar.style.width = Math.min(100, (steps / stepsGoal) * 100) + '%';

        // Weekly overview stats
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekWorkouts = (state.workoutHistory || []).filter(w => new Date(w.date) > weekAgo).length;
        const lastWeight = state.metricsHistory && state.metricsHistory[0] ? state.metricsHistory[0].weight : '--';

        const statsEl = document.getElementById('muscle-volume-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="bg-white/10 p-3 rounded-xl">
                    <div class="text-[10px] opacity-70 uppercase">This Week</div>
                    <div class="font-bold text-xl">${weekWorkouts} workouts</div>
                </div>
                <div class="bg-white/10 p-3 rounded-xl">
                    <div class="text-[10px] opacity-70 uppercase">Last Weight</div>
                    <div class="font-bold text-xl">${lastWeight} kg</div>
                </div>`;
        }

        // Render habits if enabled
        if (state.habitsEnabled) {
            const habitsTracker = document.getElementById('habits-tracker');
            if (habitsTracker) habitsTracker.classList.remove('hidden');
            renderDashboardHabits();
        }

        // Weekly training volume (intermediate/advanced only)
        renderVolumeTracker();

        refreshIcons();
    }

    /**
     * Weekly set-volume tracker. Counts working sets per muscle group over the
     * current week (Mon-Sun) from workoutHistory, mapping each exercise to the
     * muscles it targets via EXERCISE_TO_MUSCLES. Each set counts once toward
     * every muscle the exercise hits. Target range 12-20 sets per muscle/week.
     *
     * Only shown to Intermediate/Advanced lifters — beginners don't need to
     * think about volume landmarks yet, so the card stays hidden for them.
     */
    /**
     * Compute weekly set-volume per muscle for the current week (Mon-Sun).
     * Primary movers count 1.0 per set, secondary movers 0.5.
     * Returns an object { Chest: 14, Back: 9.5, ... } including only trained muscles.
     * Shared by the dashboard volume card and the AI coach.
     */
    function getWeeklyVolume() {
        // Rolling 7-day window: today and the previous 6 days (not a fixed Mon-Sun week).
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - 6); // 6 days ago + today = 7 days inclusive

        const counts = {};
        SPECIFIC_MUSCLES.forEach(m => { counts[m] = 0; });

        (state.workoutHistory || []).forEach(workout => {
            if (!workout.date) return;
            const wDate = new Date(workout.date);
            if (isNaN(wDate)) return;
            // Normalize to midnight so a workout earlier today still counts
            const wDay = new Date(wDate);
            wDay.setHours(0, 0, 0, 0);
            if (wDay < cutoff) return; // outside the last 7 days
            (workout.exercises || []).forEach(ex => {
                const setCount = (ex.sets || []).length;
                if (setCount === 0) return;
                const contrib = getExerciseVolumeContribution(ex.name);
                Object.entries(contrib).forEach(([muscle, weight]) => {
                    if (counts[muscle] !== undefined) counts[muscle] += setCount * weight;
                });
            });
        });

        // Strip muscles with zero volume
        const out = {};
        Object.entries(counts).forEach(([m, v]) => { if (v > 0) out[m] = v; });
        return out;
    }

    function musclesFromGoalDetails(details) {
        const source = details || {};
        if (Array.isArray(source.muscles)) {
            const selected = source.muscles.filter(muscle => SPECIFIC_MUSCLES.includes(muscle));
            if (selected.length) return [...new Set(selected)];
        }
        const legacy = String(source.priority || '').toLowerCase();
        const map = {
            upper: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
            lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
            legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
            arms: ['Biceps', 'Triceps'],
            chest: ['Chest'], back: ['Back'], shoulders: ['Shoulders'],
            glutes: ['Glutes'], quads: ['Quads'], hamstrings: ['Hamstrings'], calves: ['Calves']
        };
        return map[legacy] ? map[legacy].slice() : [];
    }

    function activeMuscleGainVolumePlan(sourceState) {
        const source = sourceState || state;
        const goal = (source.userGoals || []).find(item => item && item.completed !== true);
        if (!goal || goal.focus !== 'muscle_gain') return null;
        const details = goal.details || {};
        const legacyPriority = String(details.priority || '').toLowerCase();
        const scope = details.scope === 'specific' || (details.scope !== 'general' && legacyPriority && legacyPriority !== 'full')
            ? 'specific'
            : 'general';
        const muscles = scope === 'specific' ? musclesFromGoalDetails(details) : SPECIFIC_MUSCLES.slice();
        if (!muscles.length) return null;
        return {
            goal,
            scope,
            muscles,
            min: 12,
            max: scope === 'specific' ? 20 : 16,
            label: scope === 'specific' ? 'Specific-area muscle gain' : 'Full-body muscle gain'
        };
    }

    function weeklySetTargetForMuscle(muscle, sourceState) {
        const plan = activeMuscleGainVolumePlan(sourceState);
        if (!plan) return { min: 12, max: 20, focused: false };
        if (!plan.muscles.includes(muscle)) return null;
        return { min: plan.min, max: plan.max, focused: plan.scope === 'specific' };
    }

    function renderGoalVolumeSummary() {
        const box = document.getElementById('goal-volume-summary');
        if (!box) return;
        const activeGoal = (state.userGoals || []).find(item => item && item.completed !== true);
        if (!activeGoal) {
            box.innerHTML = '<div class="bg-slate-50 p-4 rounded-2xl"><p class="font-bold text-sm">Choose your main goal</p><p class="text-xs text-slate-400 mt-1">Select fat loss, full-body muscle gain or specific priority areas so coaching can follow the right target.</p></div>';
            return;
        }
        if (activeGoal.focus === 'weight_loss') {
            box.innerHTML = '<div class="bg-rose-50 border border-rose-200 p-4 rounded-2xl"><p class="font-black text-sm text-rose-700">Fat-loss focus</p><p class="text-xs text-slate-600 mt-1">VFIT will prioritise your calorie target, protein, resistance training and sustainable progress while protecting recovery around shifts.</p></div>';
            return;
        }
        const plan = activeMuscleGainVolumePlan(state);
        if (plan) {
            const focus = plan.scope === 'specific' ? plan.muscles.join(', ') : 'all major muscle groups';
            box.innerHTML = `<div class="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl"><p class="font-black text-sm text-indigo-700">${escapeHtml(plan.label)}</p><p class="text-xs text-slate-600 mt-1">Target <b>${plan.min}–${plan.max} quality working sets per week</b> for ${escapeHtml(focus)}. Completed workouts update the volume tracker automatically.</p></div>`;
            return;
        }
        box.innerHTML = '<div class="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl"><p class="font-black text-sm text-emerald-700">Health focus</p><p class="text-xs text-slate-600 mt-1">Coaching will prioritise consistency, readiness, movement and recovery around your shifts.</p></div>';
    }

    function renderVolumeTracker() {
        const card = document.getElementById('volume-tracker-card');
        const list = document.getElementById('volume-tracker-list');
        if (!card || !list) return;

        const level = getExperienceLevel();
        const plan = activeMuscleGainVolumePlan(state);
        const description = document.getElementById('volume-target-description');
        if (description) {
            description.textContent = plan
                ? `${plan.label} · target ${plan.min}–${plan.max} sets/week · assisting muscles count ½`
                : 'Sets per muscle · last 7 days · target 12–20 · assisting muscles count ½';
        }

        // Beginners don't need volume landmarks — keep the card hidden for them.
        if (level === 'Beginner' && !plan) {
            card.classList.add('hidden');
            return;
        }

        // Experience not set yet → show the card but prompt them to set it, so the
        // feature is discoverable rather than silently missing.
        if (level !== 'Intermediate' && level !== 'Advanced' && !plan) {
            card.classList.remove('hidden');
            list.innerHTML = `
                <div class="text-center py-6">
                    <p class="text-sm text-slate-500 mb-3">Set your training experience to unlock weekly volume tracking (for intermediate & advanced lifters).</p>
                    <button onclick="switchTab('profile')" class="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700">Set Experience</button>
                </div>`;
            return;
        }

        // Determine start of the current week (Monday 00:00) — used only for display copy
        // The actual tally comes from the shared getWeeklyVolume() helper.
        const counts = getWeeklyVolume();

        // Only show muscles trained in the last 7 days, sorted by volume desc
        const trained = (plan ? plan.muscles.slice() : SPECIFIC_MUSCLES.filter(m => counts[m] > 0))
            .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

        if (trained.length === 0) {
            card.classList.remove('hidden');
            list.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">No sets logged in the last 7 days. Train a muscle to see volume here.</p>`;
            return;
        }

        card.classList.remove('hidden');
        list.innerHTML = trained.map(m => {
            const sets = counts[m] || 0;
            const target = weeklySetTargetForMuscle(m, state) || { min: 12, max: 20, focused: false };
            // Display whole numbers cleanly, halves as e.g. "13.5"
            const setsLabel = Number.isInteger(sets) ? sets : sets.toFixed(1);
            // Status follows the active goal: 12–16 general or 12–20 priority areas.
            let barColor, statusIcon, statusText, pct;
            if (sets < target.min) {
                barColor = 'bg-amber-400';
                statusIcon = '';
                const shortfall = target.min - sets;
                statusText = `<span class="text-amber-600">${shortfall % 1 === 0 ? shortfall : shortfall.toFixed(1)} below min</span>`;
                pct = Math.min(100, (sets / target.max) * 100);
            } else if (sets <= target.max) {
                barColor = 'bg-emerald-500';
                statusIcon = '✓';
                statusText = `<span class="text-emerald-600">on target</span>`;
                pct = (sets / target.max) * 100;
            } else {
                barColor = 'bg-red-400';
                statusIcon = '';
                const excess = sets - target.max;
                statusText = `<span class="text-red-500">${excess % 1 === 0 ? excess : excess.toFixed(1)} over max</span>`;
                pct = 100;
            }
            return `
                <div class="bg-slate-50 p-3 rounded-xl">
                    <div class="flex justify-between items-center mb-1.5">
                        <span class="font-bold text-sm">${m} ${target.focused ? '<span class="text-[9px] text-indigo-600">PRIORITY</span>' : ''} ${statusIcon}</span>
                        <span class="text-xs font-black text-slate-700">${setsLabel}<span class="text-slate-400 font-normal">/${target.min}–${target.max} sets</span></span>
                    </div>
                    <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div class="${barColor} h-full rounded-full transition-all" style="width: ${pct}%"></div>
                    </div>
                    <div class="text-[10px] font-bold mt-1 text-right">${statusText}</div>
                </div>`;
        }).join('');
    }

    // ==========================================================================
    // HYDRATION LOGGING — number entry + slider + quick-add
    // ==========================================================================
    function openHydrationLog() {
        onHydrationSlider(250);
        document.getElementById('hydration-log-modal').style.display = 'flex';
        refreshIcons();
    }
    function closeHydrationLog() {
        document.getElementById('hydration-log-modal').style.display = 'none';
    }
    // Keep slider and number field in sync
    function onHydrationSlider(val) {
        const v = Math.round(parseFloat(val) || 0);
        document.getElementById('hydration-slider-value').textContent = v;
        document.getElementById('hydration-number').value = v;
        const slider = document.getElementById('hydration-slider');
        if (slider && parseInt(slider.value) !== v && v >= 50 && v <= 1000) slider.value = v;
    }
    function onHydrationNumber(val) {
        const v = Math.round(parseFloat(val) || 0);
        document.getElementById('hydration-slider-value').textContent = v;
        const slider = document.getElementById('hydration-slider');
        if (slider) slider.value = Math.min(1000, Math.max(50, v));
    }
    // Quick-add straight from the dashboard buttons
    function addWater(ml) {
        const date = state.viewDate;
        if (!state.waterLogs) state.waterLogs = {};
        state.waterLogs[date] = Math.max(0, (state.waterLogs[date] || 0) + ml);
        saveState();
        renderDashboard();
        const total = state.waterLogs[date];
        const goal = (state.goals && state.goals.water) ? state.goals.water : 2500;
        showToast(`+${ml}ml · ${(total/1000).toFixed(2)}L today` + (total >= goal ? ' — goal reached! 💧' : ''));
    }
    function confirmAddWater() {
        const ml = Math.round(parseFloat(document.getElementById('hydration-number').value) || 0);
        if (ml <= 0) { showToast('Enter an amount'); return; }
        closeHydrationLog();
        addWater(ml);
    }
    function resetTodayWater() {
        const date = state.viewDate;
        if (!state.waterLogs) state.waterLogs = {};
        state.waterLogs[date] = 0;
        saveState();
        renderDashboard();
        closeHydrationLog();
        showToast("Today's water reset");
    }

    // ==========================================================================
    // STEPS LOGGING — manual entry (+ optional live pedometer while app is open)
    // ==========================================================================
    function openStepsLog() {
        const date = state.viewDate;
        const current = (state.stepsLogs && state.stepsLogs[date]) || 0;
        document.getElementById('steps-number').value = current > 0 ? current : '';
        // Reset the pedometer section each open
        stopPedometer();
        document.getElementById('pedometer-section').classList.add('hidden');
        const showBtn = document.getElementById('show-pedometer-btn');
        if (showBtn) showBtn.style.display = '';
        document.getElementById('steps-log-modal').style.display = 'flex';
        refreshIcons();
    }
    function closeStepsLog() {
        stopPedometer();
        document.getElementById('steps-log-modal').style.display = 'none';
    }
    function confirmSetSteps() {
        const steps = Math.round(parseFloat(document.getElementById('steps-number').value) || 0);
        if (steps < 0) { showToast('Enter a valid number'); return; }
        const date = state.viewDate;
        if (!state.stepsLogs) state.stepsLogs = {};
        state.stepsLogs[date] = steps;
        saveState();
        renderDashboard();
        closeStepsLog();
        const goal = (state.goals && state.goals.steps) ? state.goals.steps : 10000;
        showToast(`${steps.toLocaleString()} steps saved` + (steps >= goal ? ' — goal reached! 👟' : ''));
    }

    // ---- Optional live pedometer (experimental, Android-friendly) ----
    let pedometerActive = false;
    let pedometerCount = 0;
    let pedometerHandler = null;
    let pedoLastPeak = 0;

    function revealPedometer() {
        document.getElementById('pedometer-section').classList.remove('hidden');
        const showBtn = document.getElementById('show-pedometer-btn');
        if (showBtn) showBtn.style.display = 'none';
        refreshIcons();
    }

    function togglePedometer() {
        if (pedometerActive) { stopPedometer(); return; }
        // DeviceMotion needs a permission prompt on iOS 13+
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().then(res => {
                if (res === 'granted') startPedometer();
                else showToast('Motion access denied — type your steps instead', 5000);
            }).catch(() => showToast('Motion sensor unavailable — type your steps instead', 5000));
        } else if (typeof DeviceMotionEvent !== 'undefined') {
            startPedometer();
        } else {
            showToast('This phone/browser has no accessible motion sensor — type your steps instead', 6000);
        }
    }

    function startPedometer() {
        pedometerActive = true;
        pedometerCount = 0;
        pedoLastPeak = 0;
        document.getElementById('pedometer-live').classList.remove('hidden');
        document.getElementById('pedometer-live').innerHTML = '0 <span class="text-sm text-slate-400 font-bold">steps counted</span>';
        const btn = document.getElementById('pedometer-toggle');
        btn.textContent = 'Stop';
        btn.classList.add('bg-rose-100', 'text-rose-700');
        btn.classList.remove('bg-amber-100', 'text-amber-700');

        // Simple peak-detection step counter from total acceleration magnitude
        let lastMag = 0, lastStepTime = 0;
        pedometerHandler = (e) => {
            const a = e.accelerationIncludingGravity;
            if (!a) return;
            const mag = Math.sqrt((a.x||0)**2 + (a.y||0)**2 + (a.z||0)**2);
            const delta = mag - lastMag;
            const now = Date.now();
            // A step tends to produce a sharp upward spike; debounce to ~350ms
            if (delta > 2.2 && (now - lastStepTime) > 350) {
                pedometerCount++;
                lastStepTime = now;
                const live = document.getElementById('pedometer-live');
                if (live) live.innerHTML = pedometerCount + ' <span class="text-sm text-slate-400 font-bold">steps counted</span>';
            }
            lastMag = mag;
        };
        window.addEventListener('devicemotion', pedometerHandler);
        showToast('Counting steps while the app is open…', 4000);
    }

    function stopPedometer() {
        if (!pedometerActive) return;
        pedometerActive = false;
        if (pedometerHandler) window.removeEventListener('devicemotion', pedometerHandler);
        pedometerHandler = null;
        const btn = document.getElementById('pedometer-toggle');
        if (btn) {
            btn.textContent = 'Start';
            btn.classList.remove('bg-rose-100', 'text-rose-700');
            btn.classList.add('bg-amber-100', 'text-amber-700');
        }
        // Offer to add what was counted to today's total
        if (pedometerCount > 0) {
            const numEl = document.getElementById('steps-number');
            const existing = Math.round(parseFloat(numEl.value) || 0);
            numEl.value = existing + pedometerCount;
            showToast(`Added ${pedometerCount} counted steps to the box — press Save Steps`, 5000);
        }
    }

    // ==========================================================================
    // TRAINING
    // ==========================================================================

    function setWorkoutEnv(env) {
        state.workoutEnv = env;
        saveState();
        renderWorkoutEnvTabs();
    }

    /**
     * Sync the Gym/Home tab highlighting to the actual saved state.workoutEnv.
     * Called on load and whenever the env changes, so the highlighted tab always
     * matches the environment that AI Generate will actually use.
     */
    function renderWorkoutEnvTabs() {
        const env = state.workoutEnv || 'gym';
        const gymTab = document.getElementById('env-tab-gym');
        const homeTab = document.getElementById('env-tab-home');
        if (gymTab) gymTab.className = `flex-1 py-2 text-[10px] font-black uppercase rounded-xl ${env === 'gym' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`;
        if (homeTab) homeTab.className = `flex-1 py-2 text-[10px] font-black uppercase rounded-xl ${env === 'home' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`;
    }

    // ==========================================================================
    // SPECIFIC MUSCLE PICKER (multi-select chips)
    // ==========================================================================

    let selectedMuscles = [];

    function toggleSpecificMuscle() {
        const focus = document.getElementById('workout-focus').value;
        const container = document.getElementById('specific-muscle-container');
        const isSpecific = focus === 'Specific Muscle';
        if (container) container.classList.toggle('hidden', !isSpecific);
        // Reset selection when leaving Specific Muscle mode so a leftover choice
        // doesn't silently apply next time it's opened.
        if (!isSpecific) clearMuscleChips();
    }

    function toggleMuscleChip(muscle) {
        const idx = selectedMuscles.indexOf(muscle);
        if (idx >= 0) selectedMuscles.splice(idx, 1);
        else selectedMuscles.push(muscle);
        renderMuscleChipStates();
    }

    function clearMuscleChips() {
        selectedMuscles = [];
        renderMuscleChipStates();
    }

    function renderMuscleChipStates() {
        document.querySelectorAll('#specific-muscle-chips .muscle-chip').forEach(btn => {
            const m = btn.getAttribute('data-muscle');
            const selected = selectedMuscles.indexOf(m) >= 0;
            if (selected) {
                btn.className = 'muscle-chip py-3 px-2 rounded-xl border-2 border-indigo-600 bg-indigo-600 text-sm font-bold text-white shadow-md';
            } else {
                btn.className = 'muscle-chip py-3 px-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50';
            }
        });
        const countEl = document.getElementById('specific-muscle-count');
        if (countEl) {
            if (selectedMuscles.length === 0) {
                countEl.textContent = 'No muscles selected';
                countEl.className = 'text-xs text-slate-400 mt-2 italic';
            } else {
                countEl.textContent = selectedMuscles.length + ' selected: ' + selectedMuscles.join(', ');
                countEl.className = 'text-xs text-indigo-600 mt-2 font-bold';
            }
        }
    }

    function startWorkout(mode) {
        const focus = document.getElementById('workout-focus').value;
        const isSpecific = focus === 'Specific Muscle';

        // Validate Specific Muscle selection before starting
        if (isSpecific && selectedMuscles.length === 0) {
            showToast('Pick at least one muscle');
            return;
        }

        // Title is either the focus, the single muscle, or a list of muscles.
        // Prefix with the environment so it's always clear whether this is a
        // Gym or Home workout, and that AI Generate used that environment.
        const envForTitle = state.workoutEnv || 'gym';
        const envLabel = envForTitle === 'home' ? '🏠 Home' : '🏋️ Gym';
        let title;
        if (isSpecific) {
            title = selectedMuscles.length === 1 ? selectedMuscles[0] : selectedMuscles.join(' + ');
        } else {
            title = focus;
        }
        title = envLabel + ' · ' + title;

        document.getElementById('workout-setup').classList.add('hidden');
        { const _cpc = document.getElementById('coach-plan-card'); if (_cpc) _cpc.classList.add('hidden'); }
        document.getElementById('workout-active').classList.remove('hidden');
        document.getElementById('active-workout-title').innerText = title;
        document.getElementById('exercise-list').innerHTML = '';

        if (mode === 'ai') {
            const env = state.workoutEnv || 'gym';
            const addCardio = document.getElementById('add-cardio-check').checked;
            const addCore = document.getElementById('add-core-check').checked;

            // Build the list of muscles we need exercises for. For non-specific focus,
            // it's just the single focus key. For specific, it's the user's checked chips.
            const muscleKeys = isSpecific ? selectedMuscles.slice() : [focus];

            // Per-muscle exercise allocation. With 1 muscle we want the original ~5 exercises.
            // With more, we still want a sensible total — so taper compounds/isolations per muscle.
            const exercisesPerMuscle = muscleKeys.length === 1 ? { compound: 2, isolation: 3 }
                : muscleKeys.length === 2 ? { compound: 2, isolation: 2 }
                : muscleKeys.length === 3 ? { compound: 1, isolation: 2 }
                : { compound: 1, isolation: 1 }; // 4+ muscles → keep total manageable

            const queued = [];
            const missingMuscles = [];

            muscleKeys.forEach(muscleKey => {
                // Strictly use the SELECTED environment's exercises only — no cross-over
                // between gym and home, so a gym workout never shows home exercises
                // and vice versa.
                const exercises = getEnvDB(env)[muscleKey];
                if (!exercises || ((exercises.compound || []).length + (exercises.isolation || []).length === 0)) {
                    missingMuscles.push(muscleKey);
                    return;
                }
                // Rating-weighted sampling: higher-rated exercises appear more often,
                // but every exercise has a non-zero chance so workouts stay varied.
                const compounds = weightedSample(exercises.compound || [], exercisesPerMuscle.compound);
                const isolations = weightedSample(exercises.isolation || [], exercisesPerMuscle.isolation);
                queued.push(...compounds, ...isolations);
            });

            // De-duplicate (e.g. Bench Press could appear under both Chest and Triceps)
            const seen = new Set();
            const dedupedList = queued.filter(ex => {
                if (seen.has(ex)) return false;
                seen.add(ex);
                return true;
            });

            // Order by muscle demand: hardest muscle groups first, compound lifts
            // before isolation within each group, finishing one muscle before the next.
            const finalList = orderWorkoutExercises(dedupedList, env);

            if (finalList.length === 0) {
                const envLabel = env === 'home' ? 'Home' : 'Gym';
                showToast(`No ${envLabel} exercises for ${muscleKeys.join(', ')}. Try the other environment or different muscles.`, 5000);
            } else {
                // Warn about any muscles with no exercises in THIS environment
                if (missingMuscles.length > 0) {
                    const envLabel = env === 'home' ? 'Home' : 'Gym';
                    showToast(`No ${envLabel} exercises for: ${missingMuscles.join(', ')}`, 4000);
                }
                let delay = 0;
                finalList.forEach(ex => {
                    setTimeout(() => addExercise(ex), delay);
                    delay += 20;
                });

                if (addCardio) {
                    const cardio = CARDIO_EXERCISES[Math.floor(Math.random() * CARDIO_EXERCISES.length)];
                    setTimeout(() => addExercise(cardio), delay);
                    delay += 20;
                }

                if (addCore) {
                    const core1 = CORE_EXERCISES[Math.floor(Math.random() * CORE_EXERCISES.length)];
                    const core2 = CORE_EXERCISES.filter(c => c !== core1)[Math.floor(Math.random() * (CORE_EXERCISES.length - 1))];
                    setTimeout(() => addExercise(core1), delay);
                    delay += 20;
                    setTimeout(() => addExercise(core2), delay);
                }
                showToast('AI workout generated! 💪');
                // ALL focuses step through one exercise at a time. `delay` accounts
                // for every card queued above (including cardio/core), so we wait
                // until they all exist before entering the wizard.
                setTimeout(() => enterWizardMode(), delay + 120);
            }
        }

        // Track context for the focus-filtered exercise picker. When the user
        // taps "+ Add Exercise" or types into the search, the dropdown will
        // narrow to exercises that match this focus / these muscles.
        currentWorkoutContext = {
            env: state.workoutEnv || 'gym',
            focus: focus,
            muscles: isSpecific ? selectedMuscles.slice() : null
        };

        workoutStartTime = Date.now();
        workoutAccumulatedSeconds = 0; // fresh workout — no banked time yet
        startWorkoutTimer();

        // Push a history entry so an accidental browser Back / swipe-back fires
        // popstate and we can intercept it with the "lose workout?" warning
        // instead of the user silently navigating away.
        try { history.pushState({ workout: true }, ''); } catch (e) { /* ignore */ }

        // MANUAL ENTRY → also steps through one exercise at a time.
        // For Specific Muscle we pre-build the exercise list from the chosen muscles.
        // For every other focus, Manual means "I'll pick my own", so we start with a
        // single blank card and let the user add more as they step through.
        if (mode !== 'ai') {
            const env = state.workoutEnv || 'gym';
            document.getElementById('exercise-list').innerHTML = '';

            if (isSpecific) {
                const perMuscle = selectedMuscles.length === 1 ? { compound: 2, isolation: 3 }
                    : selectedMuscles.length === 2 ? { compound: 2, isolation: 2 }
                    : selectedMuscles.length === 3 ? { compound: 1, isolation: 2 }
                    : { compound: 1, isolation: 1 };
                const queued = [];
                selectedMuscles.forEach(muscleKey => {
                    const ex = getEnvDB(env)[muscleKey];
                    if (!ex) return;
                    queued.push(...weightedSample(ex.compound || [], perMuscle.compound));
                    queued.push(...weightedSample(ex.isolation || [], perMuscle.isolation));
                });
                const seen = new Set();
                const deduped = queued.filter(e => { if (seen.has(e)) return false; seen.add(e); return true; });
                const ordered = orderWorkoutExercises(deduped, env);

                if (ordered.length === 0) {
                    const envLabel = env === 'home' ? 'Home' : 'Gym';
                    showToast(`No ${envLabel} exercises for ${selectedMuscles.join(', ')}.`, 5000);
                    addExercise(); // fall back to a blank card so the wizard still works
                } else {
                    ordered.forEach(ex => addExercise(ex));
                }
            } else {
                // Non-specific focus, manual: begin with one blank exercise to fill in.
                addExercise();
            }
            setTimeout(() => enterWizardMode(), 120);
        }

        persistActiveWorkout(); // save the freshly-started workout so a refresh keeps it
    }

    // ==========================================================================
    // WORKOUT WIZARD — one exercise at a time (all focuses)
    // ==========================================================================
    let wizardActive = false;
    let wizardIndex = 0;

    /**
     * Turn the active workout into a step-by-step wizard: show one exercise card
     * at a time with Back / Next controls. The cards already exist in #exercise-list;
     * we just show one and hide the rest, and add a nav bar.
     */
    function enterWizardMode() {
        const cards = document.querySelectorAll('#exercise-list > div');
        if (cards.length === 0) return;
        wizardActive = true;
        wizardIndex = 0;
        // The wizard's "Next → Finish" replaces the bottom Finish button.
        const finishBtn = document.getElementById('finish-workout-btn');
        if (finishBtn) finishBtn.style.display = 'none';
        const addBtn = document.getElementById('add-exercise-btn');
        if (addBtn) addBtn.style.display = 'none'; // wizard nav has its own add button
        ensureWizardNav();
        showWizardStep(0);
        persistActiveWorkout();
    }

    function ensureWizardNav() {
        if (document.getElementById('wizard-nav')) return;
        const activeView = document.getElementById('workout-active');
        if (!activeView) return;
        const nav = document.createElement('div');
        nav.id = 'wizard-nav';
        nav.className = 'mt-4 space-y-3';
        nav.innerHTML = `
            <div class="flex items-center gap-3">
                <button onclick="wizardBack()" id="wizard-back-btn" class="flex-1 bg-slate-200 text-slate-700 p-4 rounded-xl font-bold disabled:opacity-40">← Back</button>
                <div id="wizard-progress" class="text-xs font-bold text-slate-400 flex-shrink-0 px-2"></div>
                <button onclick="wizardNext()" id="wizard-next-btn" class="flex-1 bg-indigo-600 text-white p-4 rounded-xl font-bold hover:bg-indigo-700">Next →</button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <button onclick="wizardAddExercise()" id="wizard-add-btn" class="p-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs hover:border-indigo-400 hover:text-indigo-500">+ Add Exercise</button>
                <button onclick="openAddExerciseForm()" id="wizard-new-btn" class="p-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs hover:border-indigo-400 hover:text-indigo-500">✎ Create New</button>
            </div>`;
        // Insert the nav right after the exercise list
        const list = document.getElementById('exercise-list');
        if (list && list.parentNode) {
            list.parentNode.insertBefore(nav, list.nextSibling);
        } else {
            activeView.appendChild(nav);
        }
    }

    /**
     * Add a new blank exercise as a step at the end of the wizard and jump to it.
     * (addExercise auto-navigates to the new card while wizardActive is true.)
     */
    function wizardAddExercise() {
        addExercise();
        persistActiveWorkout();
    }

    function showWizardStep(index) {
        const cards = document.querySelectorAll('#exercise-list > div');
        if (cards.length === 0) return;
        wizardIndex = Math.max(0, Math.min(index, cards.length - 1));
        cards.forEach((card, i) => {
            card.style.display = (i === wizardIndex) ? '' : 'none';
        });

        // Update progress + button labels
        const progress = document.getElementById('wizard-progress');
        if (progress) progress.textContent = `${wizardIndex + 1} / ${cards.length}`;
        const backBtn = document.getElementById('wizard-back-btn');
        if (backBtn) backBtn.disabled = (wizardIndex === 0);
        const nextBtn = document.getElementById('wizard-next-btn');
        if (nextBtn) nextBtn.textContent = (wizardIndex === cards.length - 1) ? 'Finish ✓' : 'Next →';

        // Scroll so the shown exercise starts at the top and is fully visible
        const shown = cards[wizardIndex];
        const listEl = document.getElementById('exercise-list');
        if (listEl) listEl.scrollTop = 0;
        if (shown && shown.scrollIntoView) shown.scrollIntoView({ block: 'nearest' });
    }

    function wizardNext() {
        const cards = document.querySelectorAll('#exercise-list > div');
        // Bank progress each time you advance (persists the whole in-progress workout)
        persistActiveWorkout();
        if (wizardIndex >= cards.length - 1) {
            // Last exercise → finish the workout (same as the normal Finish button)
            saveWorkout();
            return;
        }
        showWizardStep(wizardIndex + 1);
        persistActiveWorkout();
    }

    function wizardBack() {
        if (wizardIndex === 0) return;
        showWizardStep(wizardIndex - 1); // reloads the previous exercise with its entered sets intact
        persistActiveWorkout();
    }

    /**
     * Remove wizard mode (used on finish/cancel) so all cards are visible again
     * and the nav bar is cleared, returning the workout view to its normal state.
     */
    function exitWizardMode() {
        wizardActive = false;
        wizardIndex = 0;
        const nav = document.getElementById('wizard-nav');
        if (nav) nav.remove();
        const finishBtn = document.getElementById('finish-workout-btn');
        if (finishBtn) finishBtn.style.display = '';
        const addBtn = document.getElementById('add-exercise-btn');
        if (addBtn) addBtn.style.display = '';
        document.querySelectorAll('#exercise-list > div').forEach(card => { card.style.display = ''; });
    }

    /**
     * Build the list of exercises that match the current workout's focus.
     * - "Specific Muscle" → exercises that target any selected muscle
     * - "Full Body" / "Upper" / "Push" etc. → exercises in that focus group
     * - No active context → all exercises (used as fallback)
     */
    function getExercisesForCurrentFocus() {
        if (!currentWorkoutContext) return getAvailableExercises(state.workoutEnv || 'gym');
        const ctx = currentWorkoutContext;
        const env = ctx.env || 'gym';
        const envDb = getEnvDB(env); // custom merged in, disabled filtered out

        // Specific muscle workout: exercises that target any selected muscle,
        // drawn ONLY from the active environment (gym stays gym, home stays home).
        if (ctx.muscles && ctx.muscles.length > 0) {
            const set = new Set();
            ctx.muscles.forEach(muscle => {
                const e = envDb[muscle];
                if (!e) return;
                (e.compound || []).forEach(ex => set.add(ex));
                (e.isolation || []).forEach(ex => set.add(ex));
            });
            if (set.size > 0) return Array.from(set).sort();
        }

        // Focus-group workout: take from that group in the active env ONLY.
        if (ctx.focus) {
            const set = new Set();
            const e = envDb[ctx.focus];
            if (e) {
                (e.compound || []).forEach(ex => set.add(ex));
                (e.isolation || []).forEach(ex => set.add(ex));
            }
            if (set.size > 0) return Array.from(set).sort();
        }

        // Last resort: every exercise in the active environment (still no cross-over).
        const envSet = new Set();
        Object.values(envDb).forEach(group => {
            (group.compound || []).forEach(ex => envSet.add(ex));
            (group.isolation || []).forEach(ex => envSet.add(ex));
        });
        return envSet.size > 0 ? Array.from(envSet).sort() : getAvailableExercises(env);
    }

    function elapsedWorkoutSeconds(startedAt, fallbackSeconds, nowValue) {
        const parsedStart = typeof startedAt === 'number' ? startedAt : new Date(startedAt || '').getTime();
        const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
        if (Number.isFinite(parsedStart) && parsedStart > 0 && parsedStart <= now) {
            return Math.max(0, Math.floor((now - parsedStart) / 1000));
        }
        return Math.max(0, Math.floor(Number(fallbackSeconds) || 0));
    }

    function currentWorkoutElapsed() {
        return elapsedWorkoutSeconds(workoutStartTime, workoutAccumulatedSeconds, Date.now());
    }

    // ==========================================================================
    // ACTIVE WORKOUT PERSISTENCE
    // ==========================================================================
    // Keeps an in-progress workout alive across refreshes, tab closes, and
    // accidental navigation. Only Finish or Cancel/Back clears it.
    // The timer is derived from the saved start timestamp, so time continues to
    // pass while the screen is locked, the app is backgrounded or the phone is off.

    /**
     * Read the currently-displayed workout (exercises, typed sets, title, context,
     * elapsed time) into a plain object suitable for saving to state.
     * Returns null if there's no active workout on screen.
     */
    function snapshotActiveWorkout() {
        const active = document.getElementById('workout-active');
        if (!active || active.classList.contains('hidden')) return null;

        const exercises = [];
        document.querySelectorAll('#exercise-list > div').forEach(card => {
            const nameInput = card.querySelector('input[type="text"]');
            const name = nameInput ? nameInput.value : '';
            const sets = [];
            card.querySelectorAll('.set-row').forEach(row => {
                const repsEl = row.querySelector('.set-reps');
                const weightEl = row.querySelector('.set-weight');
                const rirEl = row.querySelector('.set-rir');
                // Capture partially-filled sets too (so nothing typed is lost)
                sets.push({
                    reps: repsEl ? repsEl.value : '',
                    weight: weightEl ? weightEl.value : '',
                    rir: rirEl ? rirEl.value : ''
                });
            });
            // Keep the exercise even if empty, so the card structure is preserved
            exercises.push({ name: name, sets: sets });
        });

        const titleEl = document.getElementById('active-workout-title');
        return {
            title: titleEl ? titleEl.innerText : 'Workout',
            context: currentWorkoutContext,
            startedAt: workoutStartTime,
            elapsedSeconds: currentWorkoutElapsed(),
            workoutDate: window.selectedWorkoutDate || (document.getElementById('workout-date-picker') || {}).value || localDateKey(),
            exercises: exercises,
            wizard: wizardActive,
            wizardIndex: wizardIndex,
            savedAt: Date.now()
        };
    }

    /**
     * Snapshot the active workout into state and persist to localStorage.
     * Called whenever the workout changes (set added, value typed, exercise
     * added/removed/renamed) and when the user leaves the page.
     */
    function persistActiveWorkout() {
        const snap = snapshotActiveWorkout();
        if (snap) {
            state.activeWorkout = snap;
        } else {
            delete state.activeWorkout;
        }
        saveState();
    }

    /**
     * Clear any saved in-progress workout. Called on Finish and Cancel/Back.
     */
    function clearActiveWorkout() {
        delete state.activeWorkout;
        saveState();
    }

    /**
     * On page load, if a workout was in progress, rebuild it exactly and drop the
     * user straight back into it. Returns true if a workout was restored.
     */
    function restoreActiveWorkout() {
        const saved = state.activeWorkout;
        if (!saved || !Array.isArray(saved.exercises)) return false;

        // Restore the original wall-clock start. Older snapshots did not include
        // startedAt, so reconstruct it from their last save and elapsed seconds.
        currentWorkoutContext = saved.context || null;
        const savedStart = typeof saved.startedAt === 'number' ? saved.startedAt : new Date(saved.startedAt || '').getTime();
        const savedAt = Number(saved.savedAt);
        const legacyElapsed = Math.max(0, Number(saved.elapsedSeconds) || 0);
        workoutStartTime = Number.isFinite(savedStart) && savedStart > 0
            ? savedStart
            : (Number.isFinite(savedAt) && savedAt > 0 ? savedAt - legacyElapsed * 1000 : Date.now() - legacyElapsed * 1000);
        workoutAccumulatedSeconds = 0;

        // Keep an in-progress session on the day it actually began. All other
        // training views start on today through resetActiveDatesToToday().
        const restoredWorkoutDate = isDateKey(saved.workoutDate)
            ? saved.workoutDate
            : localDateKey(new Date(workoutStartTime));
        selectWorkoutDate(restoredWorkoutDate);

        // Make sure we're on the Training tab and showing the active workout view
        if (typeof switchTab === 'function') switchTab('training');
        const setupEl = document.getElementById('workout-setup');
        const activeEl = document.getElementById('workout-active');
        if (setupEl) setupEl.classList.add('hidden');
        if (activeEl) activeEl.classList.remove('hidden');

        const titleEl = document.getElementById('active-workout-title');
        if (titleEl) titleEl.innerText = saved.title || 'Workout';

        // Rebuild exercise cards and their sets using the normal builders
        const list = document.getElementById('exercise-list');
        if (list) list.innerHTML = '';
        saved.exercises.forEach(ex => {
            addExercise(ex.name || '', { skipInitialSet: true });
            // The card just added is the last one; find its id from the sets container
            const cards = document.querySelectorAll('#exercise-list > div');
            const card = cards[cards.length - 1];
            if (!card) return;
            const setsContainer = card.querySelector('[id^="sets-"]');
            const exId = setsContainer ? setsContainer.id.replace('sets-', '') : null;
            const savedSets = Array.isArray(ex.sets) && ex.sets.length ? ex.sets : [{ reps: '', weight: '', rir: '' }];
            savedSets.forEach(s => {
                if (exId) addSetToExercise(exId, ex.name ? getPersonalRecord(ex.name) : null, ex.name || '');
                // Fill the values we saved
                const rows = card.querySelectorAll('.set-row');
                const row = rows[rows.length - 1];
                if (row) {
                    const r = row.querySelector('.set-reps');
                    const w = row.querySelector('.set-weight');
                    const rir = row.querySelector('.set-rir');
                    if (r) r.value = s.reps || '';
                    if (w) w.value = s.weight || '';
                    if (rir) rir.value = s.rir || '';
                }
            });
        });

        // Resume the ticking clock
        startWorkoutTimer();

        // If the workout was in one-exercise-at-a-time wizard mode, restore that too,
        // dropping the user back onto the exact exercise step they were on.
        if (saved.wizard) {
            const finishBtn = document.getElementById('finish-workout-btn');
            if (finishBtn) finishBtn.style.display = 'none';
            const addBtn = document.getElementById('add-exercise-btn');
            if (addBtn) addBtn.style.display = 'none';
            wizardActive = true;
            ensureWizardNav();
            showWizardStep(saved.wizardIndex || 0);
        }

        if (typeof lucide !== 'undefined') refreshIcons();
        showToast('Resumed your workout in progress');
        return true;
    }

    function updateWorkoutTimer() {
        const elapsed = currentWorkoutElapsed();
        const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
        const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        const timerEl = document.getElementById('workout-timer');
        if (timerEl) timerEl.innerText = `${h}:${m}:${s}`;
    }

    function startWorkoutTimer() {
        clearInterval(workoutTimer);
        updateWorkoutTimer();
        workoutTimer = setInterval(updateWorkoutTimer, 1000);
    }

    function addExercise(name, options) {
        if (name === undefined) name = '';
        const config = options || {};
        const id = 'ex-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const pr = name ? getPersonalRecord(name) : null;

        const card = document.createElement('div');
        card.id = `card-${id}`;
        card.className = "bg-white p-4 sm:p-5 rounded-2xl shadow-md border-2 border-indigo-100 mb-3 sm:mb-4 w-full";

        const nameContainer = document.createElement('div');
        nameContainer.className = "relative mb-3 sm:mb-4";

        const inputWrapper = document.createElement('div');
        inputWrapper.className = "flex gap-2 items-center";

        const nameInput = document.createElement('input');
        nameInput.type = "text";
        nameInput.value = name;
        nameInput.placeholder = "Search or type exercise name...";
        nameInput.maxLength = 100;
        nameInput.className = "flex-1 p-3 sm:p-3.5 border-2 border-slate-200 rounded-xl font-bold text-base sm:text-lg";
        nameInput.id = `ex-name-${id}`;
        nameInput.autocomplete = "off";

        const infoBtn = document.createElement('button');
        infoBtn.type = "button";
        infoBtn.className = "w-10 h-10 sm:w-11 sm:h-11 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-200 transition-colors flex-shrink-0";
        infoBtn.innerHTML = '<i data-lucide="info" class="w-5 h-5"></i>';
        infoBtn.addEventListener('click', () => {
            const exerciseName = nameInput.value.trim();
            if (exerciseName) showExerciseDemo(exerciseName);
            else showToast('Enter exercise name first');
        });

        // Swap button — replaces this exercise with another that hits the same muscle(s)
        const swapBtn = document.createElement('button');
        swapBtn.type = "button";
        swapBtn.className = "w-10 h-10 sm:w-11 sm:h-11 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center hover:bg-amber-200 transition-colors flex-shrink-0";
        swapBtn.innerHTML = '<i data-lucide="shuffle" class="w-5 h-5"></i>';
        swapBtn.title = "Swap for another exercise that hits the same muscle";
        swapBtn.addEventListener('click', () => {
            const current = nameInput.value.trim();
            if (!current) { showToast('Pick an exercise first'); return; }
            const replacement = findSwapExercise(current);
            if (!replacement) {
                showToast('No alternative found for ' + current, 4000);
                return;
            }
            nameInput.value = replacement;
            showToast(`Swapped ${current} → ${replacement}`);
            const hdr2 = document.getElementById(`weight-header-${id}`);
            if (hdr2) hdr2.textContent = isAssistanceExercise(replacement) ? 'Assist (kg)' : 'Weight (kg)';
            refreshExercisePB(id);
            refreshSetBadges(id, replacement);
            persistActiveWorkout();
        });

        const dropdown = document.createElement('div');
        dropdown.id = `dropdown-${id}`;
        dropdown.className = "hidden absolute z-50 mt-1 w-full bg-white rounded-xl shadow-2xl border-2 border-indigo-100 max-h-60 overflow-y-auto";

        nameInput.addEventListener('focus', () => showExerciseDropdown(id));
        nameInput.addEventListener('input', (e) => filterExerciseDropdown(id, e.target.value));

        inputWrapper.appendChild(nameInput);
        inputWrapper.appendChild(swapBtn);
        inputWrapper.appendChild(infoBtn);
        nameContainer.appendChild(inputWrapper);
        nameContainer.appendChild(dropdown);

        // Live PB / suggestion line — updates dynamically to match whatever exercise
        // is currently in the name field (typed, selected, or swapped), rather than
        // sticking to the exercise the card started with.
        const pbLine = document.createElement('div');
        pbLine.id = `pb-line-${id}`;
        pbLine.className = "text-xs font-bold mt-2 min-h-[16px]";
        nameContainer.appendChild(pbLine);

        // Coach's Focus — when a COACH is assigning, show an editable textarea so
        // they can write a per-exercise coaching cue. (For a client doing an
        // assigned workout, the read-only focus note is attached in
        // startAssignedWorkout, which knows each exercise's focus text.)
        if (assigningToClient) {
            const focusWrap = document.createElement('div');
            focusWrap.className = "mt-2";
            focusWrap.innerHTML = `
                <label class="text-[10px] font-black uppercase text-indigo-500 flex items-center gap-1 mb-1">
                    <span>🎯 Coach's Focus</span>
                </label>
                <textarea id="coach-focus-${id}" rows="2" maxlength="500" placeholder="What should they focus on? (tempo, form cues, intensity…)"
                    class="w-full p-2.5 bg-indigo-50 rounded-xl border-2 border-indigo-100 focus:border-indigo-400 outline-none text-sm"></textarea>`;
            nameContainer.appendChild(focusWrap);
        }

        const setsContainer = document.createElement('div');
        setsContainer.id = `sets-${id}`;
        setsContainer.className = "bg-slate-50 p-3 sm:p-4 rounded-xl mb-3 sm:mb-4 min-h-[100px] w-full";

        const header = document.createElement('div');
        header.className = "flex gap-2 sm:gap-3 mb-2 sm:mb-3";
        const weightHeaderLabel = isAssistanceExercise(name) ? 'Assist (kg)' : 'Weight (kg)';
        header.innerHTML = `
            <div class="flex-1 text-center"><span class="text-xs sm:text-sm font-black text-slate-600 uppercase">Reps</span></div>
            <div class="flex-1 text-center"><span class="text-xs sm:text-sm font-black text-slate-600 uppercase" id="weight-header-${id}">${weightHeaderLabel}</span></div>
            <div class="w-16 sm:w-20 text-center"><span class="text-xs sm:text-sm font-black text-amber-600 uppercase" title="Reps In Reserve">RIR</span></div>
            <div class="w-9 sm:w-10"></div>`;
        setsContainer.appendChild(header);

        // When the exercise name changes, update the weight header label (Assist vs
        // Weight) AND the live PB line, so both track the current exercise.
        nameInput.addEventListener('change', () => {
            const hdr = document.getElementById(`weight-header-${id}`);
            if (hdr) hdr.textContent = isAssistanceExercise(nameInput.value) ? 'Assist (kg)' : 'Weight (kg)';
            refreshExercisePB(id);
        });
        nameInput.addEventListener('input', () => refreshExercisePB(id));

        const addSetBtn = document.createElement('button');
        addSetBtn.type = "button";
        addSetBtn.className = "w-full py-3 sm:py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-sm sm:text-base hover:bg-indigo-700 active:bg-indigo-800";
        addSetBtn.textContent = "+ Add Set";
        // Read the exercise name live so suggestions/labels reflect any rename or swap
        addSetBtn.addEventListener('click', () => { addSetToExercise(id, getPersonalRecord(nameInput.value.trim()), nameInput.value.trim()); persistActiveWorkout(); });

        const deleteExBtn = document.createElement('button');
        deleteExBtn.type = "button";
        deleteExBtn.className = "w-full py-2 sm:py-2.5 mt-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs sm:text-sm hover:bg-red-100";
        deleteExBtn.textContent = "Delete Exercise";
        deleteExBtn.addEventListener('click', () => { card.remove(); persistActiveWorkout(); });

        card.appendChild(nameContainer);
        card.appendChild(setsContainer);
        card.appendChild(addSetBtn);
        card.appendChild(deleteExBtn);

        const exerciseList = document.getElementById('exercise-list');
        if (exerciseList) exerciseList.appendChild(card);

        if (!config.skipInitialSet) {
            setTimeout(() => {
                addSetToExercise(id, pr, name);
                persistActiveWorkout();
            }, 60);
        }
        if (name) refreshExercisePB(id); // show PB for a card that starts with a name
        // If we're in wizard mode and the user manually added an exercise, jump to it.
        if (wizardActive && !name) {
            setTimeout(() => {
                const cards = document.querySelectorAll('#exercise-list > div');
                showWizardStep(cards.length - 1);
            }, 80);
        }
        refreshIcons();
    }

    /**
     * Build a row of HTML for one exercise in the dropdown.
     * Shows PR (if any), star rating (if any), and click to select.
     */
    function renderDropdownRow(id, ex) {
        const pr = getPersonalRecord(ex);
        const rating = getExerciseRating(ex);
        const ratingBadge = rating !== null
            ? `<span class="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">${rating.toFixed(1)}★</span>`
            : '';
        const prBadge = pr
            ? `<span class="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded">PR ${pr}kg</span>`
            : '';
        return `<div onclick="selectExerciseFromDropdown('${escapeJsString(id)}', '${escapeJsString(ex)}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition-colors">
            <span class="font-medium text-sm">${escapeHtml(ex)}</span>
            <div class="flex gap-1 flex-shrink-0">${ratingBadge}${prBadge}</div>
        </div>`;
    }

    /**
     * Footer for the dropdown — shows the current filter context and a toggle
     * to flip between "exercises for this focus" and "all exercises".
     */
    function renderDropdownFooter(id) {
        if (!currentWorkoutContext) return '';
        const ctx = currentWorkoutContext;
        let filterLabel;
        if (ctx.muscles && ctx.muscles.length > 0) {
            filterLabel = ctx.muscles.join(', ');
        } else if (ctx.focus) {
            filterLabel = ctx.focus;
        } else {
            return '';
        }
        const toggleText = showAllExercisesInPicker
            ? `Showing all — tap to filter to ${filterLabel}`
            : `Filtered to ${filterLabel} — tap to show all`;
        return `<div onclick="toggleShowAllExercises('${escapeJsString(id)}')" class="p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer text-center border-t border-slate-200">
            <span class="text-xs font-bold text-indigo-600">${escapeHtml(toggleText)}</span>
        </div>`;
    }

    function toggleShowAllExercises(id) {
        showAllExercisesInPicker = !showAllExercisesInPicker;
        // Re-trigger the dropdown render with whatever's in the input
        const input = document.getElementById(`ex-name-${id}`);
        const query = input ? input.value : '';
        if (query) filterExerciseDropdown(id, query);
        else showExerciseDropdown(id);
    }

    function showExerciseDropdown(id) {
        const dropdown = document.getElementById(`dropdown-${id}`);
        if (!dropdown) return;

        // Filtered list by default; full list if user toggled "show all" or there's no context
        const list = showAllExercisesInPicker ? getAvailableExercises(state.workoutEnv || 'gym') : getExercisesForCurrentFocus();
        const visible = list.slice(0, 80);
        const rows = visible.map(ex => renderDropdownRow(id, ex)).join('');
        const more = list.length > visible.length
            ? `<div class="p-3 text-center text-xs text-slate-400">Type to search ${list.length - visible.length} more exercises</div>`
            : '';
        dropdown.innerHTML = rows + more + renderDropdownFooter(id);
        dropdown.classList.remove('hidden');
    }

    function filterExerciseDropdown(id, query) {
        const dropdown = document.getElementById(`dropdown-${id}`);
        if (!dropdown) return;

        const base = showAllExercisesInPicker ? getAvailableExercises(state.workoutEnv || 'gym') : getExercisesForCurrentFocus();
        const q = query.toLowerCase();
        const filtered = base.filter(ex => ex.toLowerCase().includes(q));

        if (filtered.length === 0 && query.length > 0) {
            // Special case: if the filtered list has no matches but the *full* list does,
            // surface that so the user knows to toggle "show all" if they really want it.
            const fullMatches = !showAllExercisesInPicker && getAvailableExercises(state.workoutEnv || 'gym').some(ex => ex.toLowerCase().includes(q));
            const hint = fullMatches
                ? `<div class="p-3 text-slate-400 text-sm italic text-center">No matches in current focus.<br>Tap below to show all exercises.</div>`
                : `<div class="p-3 text-slate-400 text-sm italic text-center">No matches — keep typing for custom name</div>`;
            dropdown.innerHTML = hint + renderDropdownFooter(id);
            dropdown.classList.remove('hidden');
        } else if (filtered.length > 0) {
            const visible = filtered.slice(0, 100);
            const rows = visible.map(ex => renderDropdownRow(id, ex)).join('');
            const more = filtered.length > visible.length
                ? `<div class="p-3 text-center text-xs text-slate-400">Keep typing to narrow ${filtered.length} matches</div>`
                : '';
            dropdown.innerHTML = rows + more + renderDropdownFooter(id);
            dropdown.classList.remove('hidden');
        } else if (query.length === 0) {
            showExerciseDropdown(id);
        } else {
            dropdown.classList.add('hidden');
        }
    }

    function selectExerciseFromDropdown(id, exerciseName) {
        const input = document.getElementById(`ex-name-${id}`);
        const dropdown = document.getElementById(`dropdown-${id}`);
        if (input) input.value = exerciseName;
        if (dropdown) dropdown.classList.add('hidden');

        // Update the weight header label and the live PB line for the new exercise
        const hdr = document.getElementById(`weight-header-${id}`);
        if (hdr) hdr.textContent = isAssistanceExercise(exerciseName) ? 'Assist (kg)' : 'Weight (kg)';
        refreshExercisePB(id);
        refreshSetBadges(id, exerciseName);
        persistActiveWorkout();
    }

    /**
     * Update the live PB / suggested-weight line for an exercise card to match the
     * exercise currently in its name field. Called on type, select, and swap so the
     * PB is always for the *current* exercise, never the one the card started with.
     */
    function refreshExercisePB(id) {
        const input = document.getElementById(`ex-name-${id}`);
        const line = document.getElementById(`pb-line-${id}`);
        if (!input || !line) return;
        const name = input.value.trim();
        if (!name) { line.textContent = ''; return; }

        const pr = getPersonalRecord(name);
        const isAssist = isAssistanceExercise(name);
        const suggestion = getSuggestedWeight(name);

        let html = '';
        if (pr) {
            html += `<span class="text-emerald-600">${isAssist ? 'Best ' + pr + 'kg assist' : 'PB ' + pr + 'kg'}</span>`;
        } else {
            html += `<span class="text-slate-400">No PB yet — first time logging this</span>`;
        }
        if (suggestion && suggestion.suggested !== undefined) {
            const suggestionColour = suggestion.action === 'progress' ? 'text-emerald-600'
                : suggestion.action === 'reduce' || suggestion.action === 'deload' ? 'text-amber-600'
                : 'text-indigo-600';
            html += ` <span class="text-slate-300">·</span> <span class="${suggestionColour}" title="${escapeHtml(suggestion.reason || '')}">Try ${suggestion.suggested}kg${isAssist ? ' assist' : ''}</span>`;
        }
        line.innerHTML = html;
    }

    /**
     * Refresh the PB badges on any already-added set rows for this exercise, so
     * changing the exercise updates those too (they show the current exercise's PB).
     */
    function refreshSetBadges(id, exerciseName) {
        const container = document.getElementById(`sets-${exerciseId(id)}`) || document.getElementById(`sets-${id}`);
        if (!container) return;
        const pr = exerciseName ? getPersonalRecord(exerciseName) : null;
        const isAssist = isAssistanceExercise(exerciseName || '');
        container.querySelectorAll('.pb-badge').forEach(badge => {
            if (pr) {
                badge.textContent = isAssist ? `Best ${pr}kg assist` : `PB ${pr}kg`;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        });
    }

    // Helper so refreshSetBadges works whether given the raw id or not
    function exerciseId(id) { return id; }

    function addSetToExercise(exerciseId, pr, exerciseName) {
        const container = document.getElementById(`sets-${exerciseId}`);
        if (!container) return;

        // Figure out how many sets already exist (for the suggested-weight hint on set 3)
        const existingSets = container.querySelectorAll('.set-row').length;
        const isAssist = isAssistanceExercise(exerciseName || '');

        const setRow = document.createElement('div');
        setRow.className = "set-row flex gap-2 sm:gap-3 items-center mb-2 bg-white p-2 sm:p-3 rounded-lg border border-slate-200";

        const repsInput = document.createElement('input');
        repsInput.type = "number";
        repsInput.placeholder = "Reps";
        repsInput.min = "0";
        repsInput.className = "set-reps flex-1 p-3 sm:p-4 bg-slate-50 rounded-lg text-center font-bold text-base sm:text-lg border-2 border-transparent focus:border-indigo-500";

        const weightDiv = document.createElement('div');
        weightDiv.className = "flex-1 relative";

        const weightInput = document.createElement('input');
        weightInput.type = "number";
        weightInput.placeholder = isAssist ? "Assist" : "Weight";
        weightInput.min = "0";
        weightInput.step = "0.5";
        weightInput.className = "set-weight w-full p-3 sm:p-4 bg-slate-50 rounded-lg text-center font-bold text-base sm:text-lg border-2 border-transparent focus:border-indigo-500";

        // Pre-fill / hint with suggested weight from last performance
        const suggestion = exerciseName ? getSuggestedWeight(exerciseName) : null;
        if (suggestion) {
            weightInput.placeholder = (isAssist ? 'Assist ' : '') + suggestion.suggested + 'kg';
            const hint = document.createElement('span');
            hint.className = "absolute -bottom-4 left-0 right-0 text-center text-[8px] font-bold " + (suggestion.action === 'progress' ? 'text-emerald-600' : suggestion.changed ? 'text-amber-600' : 'text-slate-400');
            if (suggestion.action === 'progress') {
                hint.textContent = isAssist
                    ? `↓ ${suggestion.last}→${suggestion.suggested}kg assist`
                    : `↑ ${suggestion.last}→${suggestion.suggested}kg`;
            } else if (suggestion.changed) {
                hint.textContent = `adjust ${suggestion.last}→${suggestion.suggested}kg`;
            } else {
                hint.textContent = `last ${suggestion.last}kg`;
            }
            weightDiv.appendChild(weightInput);
            weightDiv.appendChild(hint);
        } else {
            weightDiv.appendChild(weightInput);
        }

        // RIR input (Reps In Reserve) — how many more reps you could have done
        const rirInput = document.createElement('input');
        rirInput.type = "number";
        rirInput.placeholder = "RIR";
        rirInput.min = "0";
        rirInput.max = "10";
        rirInput.title = "Reps In Reserve — how many more reps you could have done";
        rirInput.className = "set-rir w-16 sm:w-20 p-3 sm:p-4 bg-amber-50 rounded-lg text-center font-bold text-base sm:text-lg border-2 border-transparent focus:border-amber-400";

        // Always create the PB badge (with a stable class) so it can be updated
        // live when the exercise changes; hide it when there's no PB.
        const pbBadge = document.createElement('span');
        pbBadge.className = "pb-badge absolute -top-2 -right-2 text-[9px] sm:text-[10px] font-black text-white bg-emerald-500 px-2 py-1 rounded-full shadow-md whitespace-nowrap z-10";
        if (pr) {
            pbBadge.textContent = isAssist ? `Best ${pr}kg assist` : `PB ${pr}kg`;
        } else {
            pbBadge.style.display = 'none';
        }
        weightDiv.appendChild(pbBadge);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = "button";
        deleteBtn.className = "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-100 font-bold text-lg sm:text-xl flex-shrink-0";
        deleteBtn.textContent = "×";
        deleteBtn.addEventListener('click', () => { setRow.remove(); persistActiveWorkout(); });

        setRow.appendChild(repsInput);
        setRow.appendChild(weightDiv);
        setRow.appendChild(rirInput);
        setRow.appendChild(deleteBtn);

        container.appendChild(setRow);
    }

    function getPersonalRecord(exerciseName) {
        // For assistance exercises (e.g. Assisted Pull Ups), a "better" record is a
        // LOWER assist weight, so PR = the minimum assist weight ever used.
        if (isAssistanceExercise(exerciseName)) {
            let minAssist = null;
            (state.workoutHistory || []).forEach(workout => {
                (workout.exercises || []).forEach(ex => {
                    if (ex.name === exerciseName) {
                        (ex.sets || []).forEach(set => {
                            const w = parseFloat(set.weight);
                            if (!isNaN(w) && (minAssist === null || w < minAssist)) minAssist = w;
                        });
                    }
                });
            });
            return minAssist;
        }

        let maxWeight = 0;
        (state.workoutHistory || []).forEach(workout => {
            (workout.exercises || []).forEach(ex => {
                if (ex.name === exerciseName) {
                    (ex.sets || []).forEach(set => {
                        const weight = parseFloat(set.weight) || parseFloat(set.kg) || 0;
                        if (weight > maxWeight) maxWeight = weight;
                    });
                }
            });
        });
        return maxWeight > 0 ? maxWeight : null;
    }

    // ==========================================================================
    // PROGRESSION & ASSISTANCE
    // ==========================================================================

    /**
     * Assistance exercises invert the normal progression: the resistance/weight
     * field represents how much you're being ASSISTED, so getting stronger means
     * the number goes DOWN (less help needed).
     */
    function isAssistanceExercise(name) {
        if (!name) return false;
        // Built-in assisted exercises are detected by name...
        if (/assisted/i.test(name)) return true;
        // ...and custom exercises are detected by their saved "assisted" flag, so
        // a user-created assisted exercise behaves the same (lower weight = better).
        const custom = (state.customExercises || []).find(c => c.name === name);
        return !!(custom && custom.assisted);
    }

    /**
     * Whether an exercise is a compound (bigger jump per progression) vs isolation.
     * Checked against the gym DB compound lists.
     */
    function isCompoundExercise(name) {
        const gym = EXERCISE_DB.gym || {};
        return Object.values(gym).some(group => (group.compound || []).indexOf(name) >= 0);
    }

    /**
     * Find the most recent time this exercise was performed and return its sets.
     * Returns { date, sets } or null.
     */
    function getLastPerformance(exerciseName) {
        const history = (state.workoutHistory || []).slice()
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        for (const w of history) {
            const match = (w.exercises || []).find(ex => ex.name === exerciseName);
            if (match && match.sets && match.sets.length > 0) {
                return { date: w.date, sets: match.sets };
            }
        }
        return null;
    }

    /** Suggest a readiness-aware working weight while preserving the legacy UI shape. */
    function getSuggestedWeight(exerciseName) {
        const recommendation = smartProgressionForExercise(exerciseName, state);
        if (!recommendation) return null;
        return {
            suggested: recommendation.suggested,
            last: recommendation.current,
            bumped: recommendation.action === 'progress',
            changed: recommendation.suggested !== recommendation.current,
            action: recommendation.action,
            reason: recommendation.reason
        };
    }

    // Holds the pending workout while the user is rating exercises.
    // After they tap Save (or Skip), finalizeWorkoutSave consumes this.
    let pendingWorkout = null;

    function saveWorkout() {
        updateWorkoutTimer();
        clearInterval(workoutTimer);

        // If a coach is building a workout to assign to a client, finishing means
        // "assign it" — not save it to the coach's own history or show ratings.
        if (assigningToClient) {
            saveAssignedFromBuilder();
            return;
        }

        const exercises = [];
        document.querySelectorAll('#exercise-list > div').forEach(card => {
            const nameInput = card.querySelector('input[type="text"]');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) return;

            const sets = [];
            card.querySelectorAll('.set-row').forEach(row => {
                const repsEl = row.querySelector('.set-reps');
                const weightEl = row.querySelector('.set-weight');
                const rirEl = row.querySelector('.set-rir');
                const reps = repsEl ? repsEl.value : '';
                const weight = weightEl ? weightEl.value : '';
                if (reps && weight) {
                    const setObj = { reps: reps, weight: weight };
                    // RIR is optional — only store it if entered
                    if (rirEl && rirEl.value !== '') setObj.rir = rirEl.value;
                    sets.push(setObj);
                }
            });

            if (sets.length > 0) exercises.push({ name, sets });
        });

        if (exercises.length === 0) {
            // Restart timer since we're not actually saving
            startWorkoutTimer();
            showToast('Add at least one exercise with sets');
            return;
        }

        const workoutDate = window.selectedWorkoutDate || document.getElementById('workout-date-picker').value || localDateKey();
        const focus = document.getElementById('active-workout-title').innerText;

        // Determine category so log filters work correctly
        let category = 'weights';
        const focusLower = focus.toLowerCase();
        if (focusLower.includes('cardio')) category = 'cardio';
        else if (focusLower.includes('core')) category = 'core';

        // Stash the workout and open the rating modal. The actual save happens
        // in finalizeWorkoutSave() after the user has rated (or skipped).
        pendingWorkout = {
            id: Date.now(),
            date: workoutDate,
            focus: focus,
            duration: document.getElementById('workout-timer').innerText,
            durationSeconds: currentWorkoutElapsed(),
            startedAt: workoutStartTime ? new Date(workoutStartTime).toISOString() : null,
            completedAt: new Date().toISOString(),
            exercises: exercises,
            category: category
        };

        openRatingModal(exercises);
    }

    /**
     * Build the per-exercise rating UI. Each row is a label + 5 star buttons.
     * The user can click a star to rate, or leave a row blank to skip that exercise.
     */
    function openRatingModal(exercises) {
        const listEl = document.getElementById('rate-exercises-list');
        if (!listEl) return;

        // Reset transient rating state
        window._pendingRatings = {};

        listEl.innerHTML = exercises.map((ex, idx) => {
            const displayName = escapeHtml(ex.name || 'Exercise');
            const jsName = escapeJsString(ex.name || 'Exercise');
            const attrName = escapeHtml(ex.name || 'Exercise');
            return `
                <div class="bg-slate-50 p-3 rounded-2xl">
                    <p class="font-bold text-sm mb-2">${displayName}</p>
                    <div class="flex justify-between gap-1 mb-2" id="rating-row-${idx}">
                        ${[1, 2, 3, 4, 5].map(n => `
                            <button type="button"
                                onclick="setPendingRating('${jsName}', ${n}, ${idx})"
                                data-stars="${n}"
                                class="flex-1 py-3 rounded-xl border-2 border-slate-200 bg-white text-lg hover:border-amber-400 hover:bg-amber-50">
                                ☆
                            </button>
                        `).join('')}
                    </div>
                    <input type="text" id="rating-comment-${idx}" data-exname="${attrName}" maxlength="300" placeholder="Add a comment (optional)"
                        class="w-full p-2.5 bg-white rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-sm">
                </div>`;
        }).join('');

        document.getElementById('rate-exercises-modal').style.display = 'flex';
    }

    /**
     * Capture a star rating for a specific exercise (held in memory until Save).
     */
    function setPendingRating(exerciseName, stars, idx) {
        if (!window._pendingRatings) window._pendingRatings = {};
        window._pendingRatings[exerciseName] = stars;

        // Update visuals — fill in stars up to the chosen value
        const row = document.getElementById('rating-row-' + idx);
        if (!row) return;
        row.querySelectorAll('button').forEach(btn => {
            const n = parseInt(btn.getAttribute('data-stars'));
            if (n <= stars) {
                btn.className = 'flex-1 py-3 rounded-xl border-2 border-amber-400 bg-amber-100 text-lg';
                btn.textContent = '★';
            } else {
                btn.className = 'flex-1 py-3 rounded-xl border-2 border-slate-200 bg-white text-lg hover:border-amber-400 hover:bg-amber-50';
                btn.textContent = '☆';
            }
        });
    }

    /**
     * Save the pending workout, record any ratings the user gave, and reset
     * the UI to the workout setup screen. Called by both the Save button and
     * the Skip & Save button — `skipAll` just means we don't apply any ratings
     * the user might have started.
     */
    function finalizeWorkoutSave(skipAll) {
        if (!pendingWorkout) return;

        // Gather any comments the user typed against each exercise
        const comments = {};
        document.querySelectorAll('[id^="rating-comment-"]').forEach(inp => {
            const name = inp.getAttribute('data-exname');
            const val = (inp.value || '').trim();
            if (name && val) comments[name] = val;
        });

        if (!skipAll && window._pendingRatings) {
            Object.entries(window._pendingRatings).forEach(([name, stars]) => {
                recordExerciseRating(name, stars);
            });
        }

        // If this was a workout the coach assigned, send the star ratings and
        // comments back to the coach as feedback (so they can see how it went).
        if (window._activeAssignedWorkout && window._activeAssignedWorkout.coachUid) {
            const feedbackItems = (pendingWorkout.exercises || []).map(ex => ({
                name: ex.name,
                stars: (window._pendingRatings && window._pendingRatings[ex.name]) || 0,
                comment: comments[ex.name] || ''
            }));
            sendWorkoutFeedbackToCoach(window._activeAssignedWorkout, feedbackItems);
        }
        window._activeAssignedWorkout = null;

        state.workoutHistory.unshift(pendingWorkout);
        const exCount = pendingWorkout.exercises.length;
        pendingWorkout = null;
        window._pendingRatings = null;

        saveState();
        clearActiveWorkout(); // workout is done — remove the in-progress save
        exitWizardMode();
        workoutAccumulatedSeconds = 0;
        workoutStartTime = null;
        pushMemberDataToCloud(); // keep the coach's view up to date
        document.getElementById('rate-exercises-modal').style.display = 'none';
        document.getElementById('workout-setup').classList.remove('hidden');
        if (typeof renderCoachPlanInTraining === 'function') renderCoachPlanInTraining();
        document.getElementById('workout-active').classList.add('hidden');
        currentWorkoutContext = null;
        showAllExercisesInPicker = false;
        renderDashboard();
        showToast(`Workout saved! 🏋️ (${exCount} exercises)`);
    }

    /**
     * Send the client's exercise ratings + comments for a coach-assigned workout
     * back to the coach, as a message in their shared notes thread. This is how
     * the coach sees how the client rated the session.
     */
    async function sendWorkoutFeedbackToCoach(assignedInfo, items) {
        const coachUid = assignedInfo.coachUid;
        const memberUid = currentUser.uid;
        if (!coachUid) return;

        // Build a readable feedback summary
        const lines = items.map(it => {
            const starCount = Math.max(0, Math.min(5, Math.round(Number(it.stars) || 0)));
            const stars = starCount ? '★'.repeat(starCount) + '☆'.repeat(5 - starCount) : '(no rating)';
            return `${it.name}: ${stars}${it.comment ? ' — "' + it.comment + '"' : ''}`;
        });
        const message = {
            fromUid: memberUid,
            fromName: firebaseUserData.name || 'Client',
            fromRole: 'member',
            type: 'workout-feedback',
            workoutTitle: assignedInfo.title || 'Coach Workout',
            feedback: items,
            text: `📋 Completed "${assignedInfo.title || 'Coach Workout'}"\n` + lines.join('\n'),
            at: new Date().toISOString()
        };
        try {
            await appendNote(coachUid, memberUid, message);
            // Also drop a notification for the coach
            await pushNotification(coachUid, {
                type: 'workout-completed',
                title: (firebaseUserData.name || 'Your client') + ' completed a workout',
                body: '"' + (assignedInfo.title || 'Coach Workout') + '" — tap to see their ratings',
                fromName: firebaseUserData.name || 'Client'
            });
        } catch (error) {
            console.warn('Could not send workout feedback to coach:', error);
        }
    }

    // ==========================================================================
    // WORKOUT LOSS GUARD
    // ==========================================================================
    // Stops an in-progress workout being thrown away by accident. Anything that
    // would discard the workout routes through here first and shows a modal with
    // "Go Back" / "Continue & Discard".

    let pendingLoseWorkoutAction = null;

    /** True if a workout is currently open with something actually logged in it. */
    function workoutInProgress() {
        const active = document.getElementById('workout-active');
        if (!active || active.classList.contains('hidden')) return false;
        return true;
    }

    /**
     * Ask before discarding. If no workout is running, just runs the action.
     * @param {Function} action - what to do if the user confirms the loss
     * @param {String} [msg]    - optional custom message
     */
    function guardWorkoutLoss(action, msg) {
        if (!workoutInProgress()) { action(); return; }
        pendingLoseWorkoutAction = action;
        const msgEl = document.getElementById('lose-workout-msg');
        if (msgEl && msg) msgEl.textContent = msg;
        else if (msgEl) msgEl.textContent = "You have a workout in progress. Continuing will discard it and everything you've logged.";
        const modal = document.getElementById('lose-workout-modal');
        if (modal) modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') refreshIcons();
    }

    /** "Go Back" — keep the workout, do nothing. */
    function dismissLoseWorkout() {
        pendingLoseWorkoutAction = null;
        const modal = document.getElementById('lose-workout-modal');
        if (modal) modal.style.display = 'none';
    }

    /** "Continue & Discard" — run the action that discards the workout. */
    function confirmLoseWorkout() {
        const action = pendingLoseWorkoutAction;
        pendingLoseWorkoutAction = null;
        const modal = document.getElementById('lose-workout-modal');
        if (modal) modal.style.display = 'none';
        if (typeof action === 'function') action();
    }

    /** Actually tear down the workout (used by the × button once confirmed). */
    function discardWorkoutNow() {
        clearInterval(workoutTimer);
        clearActiveWorkout();
        exitWizardMode();
        workoutAccumulatedSeconds = 0;
        workoutStartTime = null;
        document.getElementById('workout-setup').classList.remove('hidden');
        if (typeof renderCoachPlanInTraining === 'function') renderCoachPlanInTraining();
        document.getElementById('workout-active').classList.add('hidden');
        currentWorkoutContext = null;
        showAllExercisesInPicker = false;
        showToast('Workout discarded');
    }

    function cancelWorkout() {
        guardWorkoutLoss(discardWorkoutNow);
    }

    // Close exercise dropdowns on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.matches('[id^="ex-name-"]') && !e.target.closest('[id^="dropdown-"]')) {
            document.querySelectorAll('[id^="dropdown-"]').forEach(d => d.classList.add('hidden'));
        }
        if (!e.target.matches('#store-search-input') && !e.target.closest('#store-dropdown')) {
            const sd = document.getElementById('store-dropdown');
            if (sd) sd.classList.add('hidden');
        }
        if (!e.target.matches('#manual-food-store-input') && !e.target.closest('#manual-store-dropdown')) {
            const msd = document.getElementById('manual-store-dropdown');
            if (msd) msd.classList.add('hidden');
        }
    });

    // ==========================================================================
    // DATE MANAGEMENT - TRAINING
    // ==========================================================================

    function isDateKey(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    }

    // Move between date-only keys using local noon. Parsing YYYY-MM-DD directly
    // creates a UTC date and can jump a day in UK/device time around DST.
    function offsetLocalDateKey(dateKey, days) {
        const source = isDateKey(dateKey) ? String(dateKey) : localDateKey();
        const parts = source.split('-').map(Number);
        const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
        date.setDate(date.getDate() + (Number(days) || 0));
        return localDateKey(date);
    }

    /**
     * Put each date-led area on the device's current local day without changing
     * any dated history. An unfinished workout keeps the date on which it began.
     */
    function resetActiveDatesToToday(options) {
        const config = options || {};
        const today = localDateKey();
        const previousMetricsDate = state.metricsDate;

        state.viewDate = today;
        state.metricsDate = today;

        // currentPhotos is only an unsaved form buffer and has no date of its
        // own. Clear a buffer from a previously viewed day so it cannot be saved
        // against today by mistake; already-saved metric photos are untouched.
        if (config.clearMetricDraft !== false && previousMetricsDate && previousMetricsDate !== today) {
            state.currentPhotos = { front: null, side: null, back: null };
        }

        const savedWorkoutDate = config.preserveActiveWorkout !== false
            && state.activeWorkout
            && isDateKey(state.activeWorkout.workoutDate)
            ? state.activeWorkout.workoutDate
            : today;
        window.selectedWorkoutDate = savedWorkoutDate;

        const pickerDates = {
            'workout-date-picker': savedWorkoutDate,
            'nutrition-date-picker': today,
            'shift-nutrition-date-picker': today,
            'metrics-date-picker': today
        };
        Object.entries(pickerDates).forEach(([id, dateKey]) => {
            const picker = document.getElementById(id);
            if (picker) picker.value = dateKey;
        });

        const warnings = {
            'workout-date-warning': savedWorkoutDate,
            'nutrition-date-warning': today,
            'metrics-date-warning': today
        };
        Object.entries(warnings).forEach(([id, dateKey]) => {
            const warning = document.getElementById(id);
            if (warning) warning.classList.toggle('hidden', dateKey === today);
        });
        return today;
    }

    function changeWorkoutDate(days) {
        const current = document.getElementById('workout-date-picker').value || localDateKey();
        selectWorkoutDate(offsetLocalDateKey(current, days));
    }

    function selectWorkoutDate(dateStr) {
        document.getElementById('workout-date-picker').value = dateStr;
        window.selectedWorkoutDate = dateStr;
        const today = localDateKey();
        const warning = document.getElementById('workout-date-warning');
        if (warning) warning.classList.toggle('hidden', dateStr === today);
        refreshIcons();
    }
