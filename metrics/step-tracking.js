    // ==========================================================================
    // PHONE STEP TRACKING — Android Health Connect + visible-web fallback
    // ==========================================================================
    const STEP_TRACKING_PREFS_PREFIX = 'vfit_step_tracking_v1:';
    const NATIVE_STEP_ORIGIN = 'https://appassets.androidplatform.net';
    const NATIVE_STEP_AUTO_REFRESH_MS = 60000;

    let nativeStepState = {
        availability: 'checking',
        permission: 'prompt',
        backgroundPermission: false,
        backgroundAvailable: false,
        lastSyncAt: null,
        lastError: ''
    };
    let nativeStepSyncPending = false;
    let stepPermissionRequestPending = false;
    let nativeStepPermissionAckTimer = null;
    let nativeStepPermissionOpening = false;
    let stepTrackingAccountReady = false;
    let pendingNativeStepPayloads = [];
    let nativeStepAutoRefreshTimer = null;
    let webStepTrackingActive = false;
    let webStepHandler = null;
    let webStepSaveTimer = null;
    let webStepSessionCount = 0;
    let webStepHistoryRenderAt = 0;

    function stepTrackingUserId() {
        return currentUser && currentUser.uid ? currentUser.uid : 'guest';
    }

    function stepTrackingPreferenceKey() {
        return STEP_TRACKING_PREFS_PREFIX + stepTrackingUserId();
    }

    function readStepTrackingPreferences() {
        try {
            const parsed = JSON.parse(localStorage.getItem(stepTrackingPreferenceKey()) || 'null');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return Object.assign({ enabled: false, mode: 'manual', permission: 'prompt', lastSyncAt: null }, parsed);
            }
        } catch (error) {
            console.warn('Step tracking preferences could not be read:', error);
        }
        return { enabled: false, mode: 'manual', permission: 'prompt', lastSyncAt: null };
    }

    function writeStepTrackingPreferences(patch) {
        const next = Object.assign({}, readStepTrackingPreferences(), patch || {});
        try {
            localStorage.setItem(stepTrackingPreferenceKey(), JSON.stringify(next));
        } catch (error) {
            console.warn('Step tracking preferences could not be saved:', error);
        }
        return next;
    }

    function hasNativeHealthConnectBridge() {
        return !!(window.vfitHealthConnect && typeof window.vfitHealthConnect.postMessage === 'function');
    }

    function sendNativeStepCommand(command) {
        if (!hasNativeHealthConnectBridge()) return false;
        try {
            window.vfitHealthConnect.postMessage(JSON.stringify({
                command,
                requestedAt: new Date().toISOString()
            }));
            return true;
        } catch (error) {
            console.warn('Health Connect bridge command failed:', error);
            return false;
        }
    }

    function validStepDateKey(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    }

    function currentStepGoal() {
        return Math.max(1, Math.round(Number(state && state.goals && state.goals.steps) || 10000));
    }

    function stepGoalForDate(dateKey) {
        const saved = state && state.stepGoalHistory && Math.round(Number(state.stepGoalHistory[dateKey]));
        return saved > 0 ? saved : currentStepGoal();
    }

    function rememberStepGoalForDate(dateKey, overwrite) {
        if (!validStepDateKey(dateKey)) return currentStepGoal();
        if (!state.stepGoalHistory || typeof state.stepGoalHistory !== 'object') state.stepGoalHistory = {};
        const existing = Math.round(Number(state.stepGoalHistory[dateKey]));
        if (overwrite === true || !(existing > 0)) state.stepGoalHistory[dateKey] = currentStepGoal();
        return Math.max(1, Math.round(Number(state.stepGoalHistory[dateKey]) || currentStepGoal()));
    }

    function recordDailyStepTotal(dateKey, value, source, capturedAt) {
        if (!validStepDateKey(dateKey)) return null;
        const steps = Math.max(0, Math.round(Number(value) || 0));
        if (!state.stepsLogs || typeof state.stepsLogs !== 'object') state.stepsLogs = {};
        if (!state.stepsGoalCompletions || typeof state.stepsGoalCompletions !== 'object') state.stepsGoalCompletions = {};
        state.stepsLogs[dateKey] = steps;
        const goal = rememberStepGoalForDate(dateKey, false);
        state.stepsGoalCompletions[dateKey] = steps >= goal;
        if (source) setStepSource(dateKey, source, capturedAt);
        return { date: dateKey, steps, goal };
    }

    function finaliseStepDay(dateKey, finalisedAt) {
        if (!validStepDateKey(dateKey) || !state.stepsLogs || !Object.prototype.hasOwnProperty.call(state.stepsLogs, dateKey)) return false;
        const total = recordDailyStepTotal(dateKey, state.stepsLogs[dateKey]);
        if (!total) return false;
        if (!state.stepSources || typeof state.stepSources !== 'object') state.stepSources = {};
        state.stepSources[dateKey] = Object.assign({}, state.stepSources[dateKey] || {}, {
            source: (state.stepSources[dateKey] && state.stepSources[dateKey].source) || 'saved-total',
            capturedAt: (state.stepSources[dateKey] && state.stepSources[dateKey].capturedAt) || finalisedAt || new Date().toISOString(),
            finalisedAt: finalisedAt || new Date().toISOString()
        });
        return true;
    }

    function stepHistoryEntries() {
        const today = localDateKey();
        const dateKeys = new Set(
            Object.keys((state && state.stepsLogs) || {}).filter(validStepDateKey)
        );
        dateKeys.add(today);
        return Array.from(dateKeys).sort().reverse().map(dateKey => {
            const steps = Math.max(0, Math.round(Number(state.stepsLogs && state.stepsLogs[dateKey]) || 0));
            const goal = stepGoalForDate(dateKey);
            const percent = Math.max(0, Math.round((steps / goal) * 100));
            return {
                date: dateKey,
                steps,
                goal,
                percent,
                remaining: Math.max(0, goal - steps),
                reached: steps >= goal,
                isToday: dateKey === today,
                source: state.stepSources && state.stepSources[dateKey] ? state.stepSources[dateKey].source || '' : ''
            };
        });
    }

    function updateVisibleStepCount(dateKey) {
        if (!state || !state.stepsLogs || dateKey !== state.viewDate) return;
        const steps = Math.max(0, Math.round(Number(state.stepsLogs[dateKey]) || 0));
        const goal = stepGoalForDate(dateKey);
        const percent = Math.max(0, Math.round((steps / goal) * 100));
        const count = document.getElementById('steps-count');
        const bar = document.getElementById('steps-progress-bar');
        const progressLabel = document.getElementById('steps-progress-label');
        const input = document.getElementById('steps-number');
        if (count) count.textContent = `${steps.toLocaleString()} / ${goal.toLocaleString()}`;
        if (bar) {
            bar.style.width = Math.min(100, percent) + '%';
            bar.setAttribute('aria-valuenow', String(Math.min(100, percent)));
            bar.setAttribute('aria-valuemax', '100');
        }
        if (progressLabel) {
            progressLabel.textContent = steps >= goal
                ? `${percent}% · Goal reached`
                : `${percent}% · ${(goal - steps).toLocaleString()} steps remaining`;
        }
        if (input && document.getElementById('steps-log-modal')?.style.display === 'flex') input.value = steps;
    }

    function setStepSource(dateKey, source, capturedAt) {
        if (!state.stepSources || typeof state.stepSources !== 'object') state.stepSources = {};
        state.stepSources[dateKey] = {
            source: String(source || 'manual').slice(0, 32),
            capturedAt: capturedAt || new Date().toISOString()
        };
    }

    function noteManualStepEntry(dateKey, steps) {
        if (!validStepDateKey(dateKey)) return;
        recordDailyStepTotal(dateKey, steps, 'manual');
        writeStepTrackingPreferences({ lastSyncAt: new Date().toISOString() });
        renderStepTrackingUI();
        if (typeof renderStepHistoryLogs === 'function') renderStepHistoryLogs();
    }

    function applyPhoneStepTotal(payload) {
        const dateKey = validStepDateKey(payload && payload.date) ? payload.date : localDateKey();
        const steps = Math.max(0, Math.round(Number(payload && payload.steps) || 0));
        const cachedValue = payload && payload.cached === true;
        const existingSteps = Math.max(0, Math.round(Number(state.stepsLogs && state.stepsLogs[dateKey]) || 0));
        // The native wrapper publishes its last background cache immediately so
        // the screen is never blank. Do not let an older/lower cached value make
        // today's visible total move backwards while the fresh read is running.
        const ignoreOlderCache = cachedValue && dateKey === localDateKey() && existingSteps >= steps;
        if (!ignoreOlderCache) {
            recordDailyStepTotal(
                dateKey,
                steps,
                cachedValue ? 'health-connect-cache' : 'health-connect',
                payload && payload.capturedAt
            );
        }
        nativeStepState.lastSyncAt = (payload && payload.capturedAt) || nativeStepState.lastSyncAt || new Date().toISOString();
        nativeStepState.lastError = '';
        if (!cachedValue) nativeStepSyncPending = false;
        writeStepTrackingPreferences({
            enabled: true,
            mode: 'health-connect',
            permission: 'granted',
            lastSyncAt: nativeStepState.lastSyncAt
        });
        if (!ignoreOlderCache) saveState();
        updateVisibleStepCount(dateKey);
        renderStepTrackingUI();
        if (typeof renderStepHistoryLogs === 'function') renderStepHistoryLogs();
        if (stepPermissionRequestPending && !cachedValue) {
            stepPermissionRequestPending = false;
            showToast(`Health Connect linked · ${steps.toLocaleString()} steps today`, 5000);
        }
    }

    function applyPhoneStepHistory(payload) {
        const entries = Array.isArray(payload && payload.entries) ? payload.entries : [];
        let newest = null;
        entries.forEach(entry => {
            if (!entry || !validStepDateKey(entry.date)) return;
            const recorded = recordDailyStepTotal(entry.date, entry.steps, 'health-connect', entry.capturedAt);
            if (recorded && (!newest || recorded.date > newest.date)) newest = recorded;
        });
        nativeStepState.lastSyncAt = (payload && payload.capturedAt) || new Date().toISOString();
        nativeStepState.lastError = '';
        nativeStepSyncPending = false;
        writeStepTrackingPreferences({
            enabled: true,
            mode: 'health-connect',
            permission: 'granted',
            lastSyncAt: nativeStepState.lastSyncAt
        });
        saveState();
        updateVisibleStepCount(state.viewDate);
        renderStepTrackingUI();
        if (typeof renderStepHistoryLogs === 'function') renderStepHistoryLogs();
        if (stepPermissionRequestPending) {
            stepPermissionRequestPending = false;
            const today = entries.find(entry => entry && entry.date === localDateKey());
            const total = today ? Math.max(0, Math.round(Number(today.steps) || 0)) : (newest ? newest.steps : 0);
            showToast(`Health Connect linked · ${total.toLocaleString()} steps today`, 5000);
        }
    }

    function parseNativeStepMessage(value) {
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch (error) { return null; }
        }
        return value && typeof value === 'object' ? value : null;
    }

    function bufferNativeStepPayload(payload) {
        const type = String(payload && payload.type || '');
        if (!type) return;
        // Only the newest pre-login payload of each type is useful. Holding it
        // until account hydration finishes prevents a fresh result being saved
        // into the temporary guest state and then replaced by cloud data.
        pendingNativeStepPayloads = pendingNativeStepPayloads.filter(item => item.type !== type);
        pendingNativeStepPayloads.push(payload);
    }

    function flushBufferedNativeStepPayloads() {
        if (!stepTrackingAccountReady || !currentUser || !pendingNativeStepPayloads.length) return;
        const buffered = pendingNativeStepPayloads.slice();
        pendingNativeStepPayloads = [];
        buffered.forEach(payload => {
            if (payload.type === 'vfit-health-connect-steps') applyPhoneStepTotal(payload);
            else if (payload.type === 'vfit-health-connect-history') applyPhoneStepHistory(payload);
        });
    }

    function handleNativeStepMessage(value) {
        const payload = parseNativeStepMessage(value);
        if (!payload || !String(payload.type || '').startsWith('vfit-health-connect-')) return;

        if (payload.type === 'vfit-health-connect-ack') {
            if (payload.command === 'request_permission' && stepPermissionRequestPending) {
                clearTimeout(nativeStepPermissionAckTimer);
                nativeStepPermissionAckTimer = null;
                nativeStepPermissionOpening = true;
                renderStepTrackingUI();
            }
            return;
        }

        if (payload.type === 'vfit-health-connect-status') {
            if (!stepPermissionRequestPending || payload.permission === 'granted' || payload.permission === 'denied') {
                clearTimeout(nativeStepPermissionAckTimer);
                nativeStepPermissionAckTimer = null;
                nativeStepPermissionOpening = false;
            }
            nativeStepState = Object.assign({}, nativeStepState, {
                availability: payload.availability || 'unavailable',
                permission: payload.permission || 'prompt',
                backgroundPermission: payload.backgroundPermission === true,
                backgroundAvailable: payload.backgroundAvailable === true,
                lastError: payload.permission === 'granted' ? '' : nativeStepState.lastError
            });
            writeStepTrackingPreferences({
                mode: 'health-connect',
                permission: nativeStepState.permission,
                enabled: nativeStepState.permission === 'granted'
            });
            if (nativeStepState.permission !== 'granted') nativeStepSyncPending = false;
            renderStepTrackingUI();
            if (nativeStepState.permission === 'granted' && stepTrackingAccountReady && currentUser) requestNativeStepSync();
            else if (stepPermissionRequestPending && nativeStepState.permission === 'denied') {
                stepPermissionRequestPending = false;
                showToast('Open Health Connect → App permissions → VFIT and allow Steps.', 6000);
            }
            return;
        }

        if (payload.type === 'vfit-health-connect-request-opening') {
            clearTimeout(nativeStepPermissionAckTimer);
            nativeStepPermissionAckTimer = null;
            nativeStepPermissionOpening = true;
            renderStepTrackingUI();
            return;
        }

        if (payload.type === 'vfit-health-connect-steps') {
            if (!stepTrackingAccountReady || !currentUser) {
                bufferNativeStepPayload(payload);
                return;
            }
            applyPhoneStepTotal(payload);
            return;
        }

        if (payload.type === 'vfit-health-connect-history') {
            if (!stepTrackingAccountReady || !currentUser) {
                bufferNativeStepPayload(payload);
                return;
            }
            applyPhoneStepHistory(payload);
            return;
        }

        if (payload.type === 'vfit-health-connect-error') {
            clearTimeout(nativeStepPermissionAckTimer);
            nativeStepPermissionAckTimer = null;
            nativeStepPermissionOpening = false;
            nativeStepSyncPending = false;
            nativeStepState.lastError = String(payload.message || 'Health Connect could not be read').slice(0, 180);
            renderStepTrackingUI();
            if (stepPermissionRequestPending) {
                stepPermissionRequestPending = false;
                showToast(nativeStepState.lastError, 6000);
            }
        }
    }

    function requestNativeStepSync() {
        if (!hasNativeHealthConnectBridge()
            || !stepTrackingAccountReady
            || !currentUser
            || nativeStepState.permission !== 'granted'
            || nativeStepSyncPending) return false;
        nativeStepSyncPending = sendNativeStepCommand('sync');
        renderStepTrackingUI();
        return nativeStepSyncPending;
    }

    function stopNativeStepAutoRefresh() {
        clearTimeout(nativeStepAutoRefreshTimer);
        nativeStepAutoRefreshTimer = null;
    }

    function scheduleNativeStepAutoRefresh() {
        stopNativeStepAutoRefresh();
        if (!hasNativeHealthConnectBridge() || !stepTrackingAccountReady || !currentUser || document.visibilityState === 'hidden') return;
        nativeStepAutoRefreshTimer = setTimeout(() => {
            nativeStepAutoRefreshTimer = null;
            if (stepTrackingAccountReady && currentUser && document.visibilityState !== 'hidden') {
                requestNativeStepSync();
                scheduleNativeStepAutoRefresh();
            }
        }, NATIVE_STEP_AUTO_REFRESH_MS);
    }

    function stepTrackingStatusText() {
        const prefs = readStepTrackingPreferences();
        if (hasNativeHealthConnectBridge()) {
            if (nativeStepPermissionOpening) return 'Health Connect access screen is opening…';
            if (nativeStepState.lastError) return nativeStepState.lastError;
            if (nativeStepState.availability === 'checking') return 'Checking VFIT access to Health Connect…';
            if (nativeStepState.availability === 'provider_update_required') return 'Health Connect needs installing or updating';
            if (nativeStepState.availability === 'unavailable') return 'Health Connect is unavailable · manual entry still works';
            if (nativeStepState.permission === 'granted') {
                if (nativeStepSyncPending) return 'Health Connect · updating daily step history…';
                if (nativeStepState.backgroundPermission) return 'Health Connect · all-day background sync enabled';
                return 'Health Connect · includes steps taken while VFIT was closed';
            }
            if (nativeStepState.permission === 'denied') return 'VFIT has no Steps access. Open Health Connect app permissions.';
            return 'Allow read-only Health Connect step access';
        }
        if (webStepTrackingActive) return 'Web motion counter active · VFIT must remain open';
        if (prefs.enabled && prefs.mode === 'web-motion') return 'Web motion counter paused until VFIT is visible';
        return 'Web browser mode · connect for visible-app counting';
    }

    function renderStepTrackingUI() {
        const status = stepTrackingStatusText();
        document.querySelectorAll('[data-step-tracking-status]').forEach(element => {
            element.textContent = status;
        });

        let action = 'Connect';
        if (hasNativeHealthConnectBridge()) {
            if (nativeStepState.permission === 'granted') action = nativeStepSyncPending ? 'Updating…' : 'Sync now';
            else if (nativeStepState.availability === 'provider_update_required') action = 'Update';
            else if (nativeStepState.permission === 'denied') action = 'Open access';
            else if (nativeStepState.lastError) action = 'Retry';
            else if (nativeStepPermissionOpening || stepPermissionRequestPending) action = 'Opening…';
            else action = 'Allow';
        } else if (webStepTrackingActive) {
            action = 'Tracking';
        } else if (readStepTrackingPreferences().enabled) {
            action = 'Resume';
        }

        document.querySelectorAll('[data-step-tracking-action]').forEach(button => {
            const permissionGranted = nativeStepState.permission === 'granted';
            const syncIsBlocking = permissionGranted && nativeStepSyncPending;
            button.textContent = action;
            button.disabled = syncIsBlocking;
            button.classList.toggle('opacity-60', syncIsBlocking);
        });

        document.querySelectorAll('[data-step-background-action]').forEach(button => {
            button.classList.toggle('hidden', !hasNativeHealthConnectBridge()
                || nativeStepState.permission !== 'granted'
                || !nativeStepState.backgroundAvailable
                || nativeStepState.backgroundPermission);
        });

        const goal = currentStepGoal();
        ['step-goal-settings-input', 'step-goal-modal-input'].forEach(id => {
            const input = document.getElementById(id);
            if (input && document.activeElement !== input) input.value = goal;
        });
        const currentGoal = document.getElementById('step-history-current-goal');
        if (currentGoal) currentGoal.textContent = `${goal.toLocaleString()} steps`;

        const pedometerButton = document.getElementById('pedometer-toggle');
        if (pedometerButton) {
            pedometerButton.textContent = webStepTrackingActive ? 'Stop' : 'Start';
            pedometerButton.classList.toggle('bg-rose-100', webStepTrackingActive);
            pedometerButton.classList.toggle('text-rose-700', webStepTrackingActive);
            pedometerButton.classList.toggle('bg-amber-100', !webStepTrackingActive);
            pedometerButton.classList.toggle('text-amber-700', !webStepTrackingActive);
        }
    }

    function updateStepGoal(value) {
        const goal = Math.round(Number(value));
        if (!Number.isFinite(goal) || goal < 100 || goal > 100000) {
            renderStepTrackingUI();
            showToast('Choose a daily step goal between 100 and 100,000', 5000);
            return false;
        }
        if (!state.goals || typeof state.goals !== 'object') state.goals = {};
        state.goals.steps = goal;
        const today = localDateKey();
        rememberStepGoalForDate(today, true);
        if (!state.stepsGoalCompletions || typeof state.stepsGoalCompletions !== 'object') state.stepsGoalCompletions = {};
        state.stepsGoalCompletions[today] = Math.max(0, Math.round(Number(state.stepsLogs && state.stepsLogs[today]) || 0)) >= goal;
        saveState();
        if (typeof renderDashboard === 'function') renderDashboard();
        renderStepTrackingUI();
        if (typeof renderStepHistoryLogs === 'function') renderStepHistoryLogs();
        showToast(`Daily step goal set to ${goal.toLocaleString()}`, 4000);
        return true;
    }

    function flushWebStepSave() {
        clearTimeout(webStepSaveTimer);
        webStepSaveTimer = null;
        if (typeof saveState === 'function' && currentUser) saveState();
    }

    function scheduleWebStepSave() {
        clearTimeout(webStepSaveTimer);
        webStepSaveTimer = setTimeout(flushWebStepSave, 1500);
    }

    function recordWebMotionStep() {
        const dateKey = localDateKey();
        const nextTotal = Math.max(0, Math.round(Number(state.stepsLogs && state.stepsLogs[dateKey]) || 0)) + 1;
        recordDailyStepTotal(dateKey, nextTotal, 'web-motion');
        webStepSessionCount += 1;
        const live = document.getElementById('pedometer-live');
        if (live) live.innerHTML = `${webStepSessionCount.toLocaleString()} <span class="text-sm text-slate-400 font-bold">steps counted this session</span>`;
        updateVisibleStepCount(dateKey);
        const now = Date.now();
        if (typeof renderStepHistoryLogs === 'function' && now - webStepHistoryRenderAt >= 1500) {
            webStepHistoryRenderAt = now;
            renderStepHistoryLogs();
        }
        scheduleWebStepSave();
    }

    function startWebStepTracking() {
        if (webStepTrackingActive) return true;
        if (typeof window.DeviceMotionEvent === 'undefined') return false;
        if (document.visibilityState === 'hidden') return false;

        let lastMagnitude = null;
        let lastStepAt = 0;
        webStepSessionCount = 0;
        webStepHandler = event => {
            const acceleration = event.accelerationIncludingGravity;
            if (!acceleration) return;
            const magnitude = Math.sqrt(
                (Number(acceleration.x) || 0) ** 2
                + (Number(acceleration.y) || 0) ** 2
                + (Number(acceleration.z) || 0) ** 2
            );
            if (lastMagnitude == null) {
                lastMagnitude = magnitude;
                return;
            }
            const delta = magnitude - lastMagnitude;
            const now = Date.now();
            if (delta > 2.2 && now - lastStepAt > 350) {
                lastStepAt = now;
                recordWebMotionStep();
            }
            lastMagnitude = magnitude;
        };
        window.addEventListener('devicemotion', webStepHandler);
        webStepTrackingActive = true;
        writeStepTrackingPreferences({ enabled: true, mode: 'web-motion', permission: 'granted' });
        const live = document.getElementById('pedometer-live');
        if (live) {
            live.classList.remove('hidden');
            live.innerHTML = '0 <span class="text-sm text-slate-400 font-bold">steps counted this session</span>';
        }
        renderStepTrackingUI();
        return true;
    }

    function stopWebStepTracking(disable) {
        if (webStepHandler) window.removeEventListener('devicemotion', webStepHandler);
        webStepHandler = null;
        webStepTrackingActive = false;
        flushWebStepSave();
        if (disable === true) writeStepTrackingPreferences({ enabled: false, mode: 'manual' });
        renderStepTrackingUI();
    }

    function isWebStepTrackingActive() {
        return webStepTrackingActive;
    }

    async function requestWebStepTrackingPermission(showConfirmation) {
        if (typeof window.DeviceMotionEvent === 'undefined') {
            writeStepTrackingPreferences({ enabled: false, mode: 'manual', permission: 'unavailable' });
            renderStepTrackingUI();
            showToast('This browser cannot access the motion sensor. Enter your phone’s step total manually.', 6000);
            return false;
        }

        try {
            if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
                const response = await window.DeviceMotionEvent.requestPermission();
                if (response !== 'granted') throw new Error('Motion permission was not granted');
            }
            if (!startWebStepTracking()) throw new Error('The motion sensor could not start');
            if (showConfirmation !== false) showToast('Web step counter started. Keep VFIT open for counting.', 5000);
            return true;
        } catch (error) {
            writeStepTrackingPreferences({ enabled: false, mode: 'manual', permission: 'denied' });
            renderStepTrackingUI();
            showToast(error.message || 'Motion access was not granted', 6000);
            return false;
        }
    }

    function requestStepTrackingPermission() {
        if (hasNativeHealthConnectBridge()) {
            if (nativeStepState.permission === 'granted') {
                requestNativeStepSync();
            } else if (nativeStepState.permission === 'denied') {
                showToast('In Health Connect, open App permissions → VFIT and allow Steps.', 6000);
                sendNativeStepCommand('open_settings');
            } else {
                if (stepPermissionRequestPending) return;
                stepPermissionRequestPending = true;
                nativeStepState.lastError = '';
                const sent = sendNativeStepCommand('request_permission');
                if (sent) {
                    clearTimeout(nativeStepPermissionAckTimer);
                    nativeStepPermissionAckTimer = setTimeout(() => {
                        nativeStepPermissionAckTimer = null;
                        if (!stepPermissionRequestPending || nativeStepPermissionOpening) return;
                        stepPermissionRequestPending = false;
                        nativeStepState.lastError = 'VFIT could not confirm that Android received the request. Close and reopen VFIT, then retry.';
                        renderStepTrackingUI();
                    }, 5000);
                } else {
                    stepPermissionRequestPending = false;
                    nativeStepState.lastError = 'VFIT could not reach Android Health Connect. Reopen VFIT and try again.';
                    showToast(nativeStepState.lastError, 6000);
                }
            }
            renderStepTrackingUI();
            return;
        }
        if (webStepTrackingActive) {
            showToast('The web step counter is already running while VFIT is open.', 4000);
            return;
        }
        requestWebStepTrackingPermission(true);
    }

    function requestBackgroundStepSync() {
        if (!hasNativeHealthConnectBridge() || nativeStepState.permission !== 'granted') return;
        if (sendNativeStepCommand('request_background_permission')) {
            showToast('Allow background access in Health Connect to refresh steps while VFIT is closed.', 5000);
        }
    }

    function revealPedometer() {
        const section = document.getElementById('pedometer-section');
        const showButton = document.getElementById('show-pedometer-btn');
        if (section) section.classList.remove('hidden');
        if (showButton) showButton.style.display = 'none';
        renderStepTrackingUI();
        refreshIcons();
    }

    function togglePedometer() {
        if (webStepTrackingActive) {
            stopWebStepTracking(true);
            showToast('Web step counter stopped', 3500);
            return;
        }
        requestWebStepTrackingPermission(true);
    }

    function initialiseStepTracking() {
        stepTrackingAccountReady = !!currentUser;
        flushBufferedNativeStepPayloads();
        renderStepTrackingUI();
        if (hasNativeHealthConnectBridge()) {
            stopWebStepTracking(false);
            sendNativeStepCommand('status');
            if (nativeStepState.permission === 'granted') requestNativeStepSync();
            scheduleNativeStepAutoRefresh();
            return;
        }
        const prefs = readStepTrackingPreferences();
        if (prefs.enabled && prefs.mode === 'web-motion' && document.visibilityState !== 'hidden') {
            requestWebStepTrackingPermission(false);
        }
    }

    function syncStepTrackingOnVisible() {
        if (!currentUser) return;
        if (hasNativeHealthConnectBridge()) {
            if (!stepTrackingAccountReady) return;
            flushBufferedNativeStepPayloads();
            sendNativeStepCommand('status');
            if (nativeStepState.permission === 'granted') requestNativeStepSync();
            scheduleNativeStepAutoRefresh();
            return;
        }
        const prefs = readStepTrackingPreferences();
        if (prefs.enabled && prefs.mode === 'web-motion' && !webStepTrackingActive) {
            requestWebStepTrackingPermission(false);
        }
        renderStepTrackingUI();
    }

    function pauseStepTrackingWhenHidden() {
        stopNativeStepAutoRefresh();
        if (webStepTrackingActive) stopWebStepTracking(false);
    }

    function teardownStepTracking() {
        stopNativeStepAutoRefresh();
        clearTimeout(nativeStepPermissionAckTimer);
        nativeStepPermissionAckTimer = null;
        nativeStepPermissionOpening = false;
        stopWebStepTracking(false);
        nativeStepSyncPending = false;
        stepPermissionRequestPending = false;
        stepTrackingAccountReady = false;
        pendingNativeStepPayloads = [];
    }

    // The wrapper also calls this receiver for startup and foreground reads.
    // Its main-frame origin is checked on the Android side before delivery.
    window.__vfitReceiveNativeStepPayload = value => handleNativeStepMessage(value);

    // Keep both message listeners for compatibility with older beta wrappers.
    if (hasNativeHealthConnectBridge() && typeof window.vfitHealthConnect.addEventListener === 'function') {
        window.vfitHealthConnect.addEventListener('message', event => {
            handleNativeStepMessage(event.data);
        });
    }

    window.addEventListener('message', event => {
        if (!hasNativeHealthConnectBridge()) return;
        if (event.origin && event.origin !== NATIVE_STEP_ORIGIN) return;
        handleNativeStepMessage(event.data);
    });
