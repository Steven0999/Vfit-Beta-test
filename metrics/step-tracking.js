    // ==========================================================================
    // PHONE STEP TRACKING — Android Health Connect + visible-web fallback
    // ==========================================================================
    const STEP_TRACKING_PREFS_PREFIX = 'vfit_step_tracking_v1:';
    const NATIVE_STEP_ORIGIN = 'https://appassets.androidplatform.net';

    let nativeStepState = {
        availability: 'checking',
        permission: 'prompt',
        backgroundPermission: false,
        lastSyncAt: null,
        lastError: ''
    };
    let nativeStepSyncPending = false;
    let stepPermissionRequestPending = false;
    let webStepTrackingActive = false;
    let webStepHandler = null;
    let webStepSaveTimer = null;
    let webStepSessionCount = 0;

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

    function updateVisibleStepCount(dateKey) {
        if (!state || !state.stepsLogs || dateKey !== state.viewDate) return;
        const steps = Math.max(0, Math.round(Number(state.stepsLogs[dateKey]) || 0));
        const goal = Math.max(1, Number(state.goals && state.goals.steps) || 10000);
        const count = document.getElementById('steps-count');
        const bar = document.getElementById('steps-progress-bar');
        const input = document.getElementById('steps-number');
        if (count) count.textContent = `${steps.toLocaleString()} / ${goal.toLocaleString()}`;
        if (bar) bar.style.width = Math.min(100, (steps / goal) * 100) + '%';
        if (input && document.getElementById('steps-log-modal')?.style.display === 'flex') input.value = steps;
    }

    function setStepSource(dateKey, source, capturedAt) {
        if (!state.stepSources || typeof state.stepSources !== 'object') state.stepSources = {};
        state.stepSources[dateKey] = {
            source: String(source || 'manual').slice(0, 32),
            capturedAt: capturedAt || new Date().toISOString()
        };
    }

    function noteManualStepEntry(dateKey) {
        if (!validStepDateKey(dateKey)) return;
        setStepSource(dateKey, 'manual');
        writeStepTrackingPreferences({ lastSyncAt: new Date().toISOString() });
        renderStepTrackingUI();
    }

    function applyPhoneStepTotal(payload) {
        const dateKey = validStepDateKey(payload && payload.date) ? payload.date : localDateKey();
        const steps = Math.max(0, Math.round(Number(payload && payload.steps) || 0));
        if (!state.stepsLogs || typeof state.stepsLogs !== 'object') state.stepsLogs = {};
        state.stepsLogs[dateKey] = steps;
        setStepSource(dateKey, 'health-connect', payload && payload.capturedAt);
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
        updateVisibleStepCount(dateKey);
        renderStepTrackingUI();
        if (stepPermissionRequestPending) {
            stepPermissionRequestPending = false;
            showToast(`Health Connect linked · ${steps.toLocaleString()} steps today`, 5000);
        }
    }

    function parseNativeStepMessage(value) {
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch (error) { return null; }
        }
        return value && typeof value === 'object' ? value : null;
    }

    function handleNativeStepMessage(value) {
        const payload = parseNativeStepMessage(value);
        if (!payload || !String(payload.type || '').startsWith('vfit-health-connect-')) return;

        if (payload.type === 'vfit-health-connect-status') {
            nativeStepState = Object.assign({}, nativeStepState, {
                availability: payload.availability || 'unavailable',
                permission: payload.permission || 'prompt',
                backgroundPermission: payload.backgroundPermission === true,
                lastError: ''
            });
            writeStepTrackingPreferences({
                mode: 'health-connect',
                permission: nativeStepState.permission,
                enabled: nativeStepState.permission === 'granted'
            });
            nativeStepSyncPending = false;
            renderStepTrackingUI();
            if (nativeStepState.permission === 'granted') requestNativeStepSync();
            else if (stepPermissionRequestPending && nativeStepState.permission === 'denied') {
                stepPermissionRequestPending = false;
                showToast('Step access was not granted. Manual entry and the web fallback are still available.', 6000);
            }
            return;
        }

        if (payload.type === 'vfit-health-connect-steps') {
            applyPhoneStepTotal(payload);
            return;
        }

        if (payload.type === 'vfit-health-connect-error') {
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
        if (!hasNativeHealthConnectBridge() || nativeStepSyncPending) return false;
        nativeStepSyncPending = sendNativeStepCommand('sync');
        renderStepTrackingUI();
        return nativeStepSyncPending;
    }

    function stepTrackingStatusText() {
        const prefs = readStepTrackingPreferences();
        if (hasNativeHealthConnectBridge()) {
            if (nativeStepState.availability === 'provider_update_required') return 'Health Connect needs installing or updating';
            if (nativeStepState.availability === 'unavailable') return 'Health Connect is unavailable · manual entry still works';
            if (nativeStepState.permission === 'granted') {
                if (nativeStepSyncPending) return 'Health Connect · updating today’s total…';
                if (nativeStepState.backgroundPermission) return 'Health Connect · all-day background sync enabled';
                return 'Health Connect · includes steps taken while VFIT was closed';
            }
            if (nativeStepState.permission === 'denied') return 'Health Connect step access not granted';
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
            else action = 'Allow';
        } else if (webStepTrackingActive) {
            action = 'Tracking';
        } else if (readStepTrackingPreferences().enabled) {
            action = 'Resume';
        }

        document.querySelectorAll('[data-step-tracking-action]').forEach(button => {
            button.textContent = action;
            button.disabled = nativeStepSyncPending;
            button.classList.toggle('opacity-60', nativeStepSyncPending);
        });

        const pedometerButton = document.getElementById('pedometer-toggle');
        if (pedometerButton) {
            pedometerButton.textContent = webStepTrackingActive ? 'Stop' : 'Start';
            pedometerButton.classList.toggle('bg-rose-100', webStepTrackingActive);
            pedometerButton.classList.toggle('text-rose-700', webStepTrackingActive);
            pedometerButton.classList.toggle('bg-amber-100', !webStepTrackingActive);
            pedometerButton.classList.toggle('text-amber-700', !webStepTrackingActive);
        }
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
        if (!state.stepsLogs || typeof state.stepsLogs !== 'object') state.stepsLogs = {};
        state.stepsLogs[dateKey] = Math.max(0, Math.round(Number(state.stepsLogs[dateKey]) || 0)) + 1;
        setStepSource(dateKey, 'web-motion');
        webStepSessionCount += 1;
        const live = document.getElementById('pedometer-live');
        if (live) live.innerHTML = `${webStepSessionCount.toLocaleString()} <span class="text-sm text-slate-400 font-bold">steps counted this session</span>`;
        updateVisibleStepCount(dateKey);
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
            stepPermissionRequestPending = true;
            if (nativeStepState.permission === 'granted') {
                requestNativeStepSync();
            } else {
                sendNativeStepCommand('request_permission');
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
        renderStepTrackingUI();
        if (hasNativeHealthConnectBridge()) {
            stopWebStepTracking(false);
            sendNativeStepCommand('status');
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
            sendNativeStepCommand('status');
            requestNativeStepSync();
            return;
        }
        const prefs = readStepTrackingPreferences();
        if (prefs.enabled && prefs.mode === 'web-motion' && !webStepTrackingActive) {
            requestWebStepTrackingPermission(false);
        }
        renderStepTrackingUI();
    }

    function pauseStepTrackingWhenHidden() {
        if (webStepTrackingActive) stopWebStepTracking(false);
    }

    function teardownStepTracking() {
        stopWebStepTracking(false);
        nativeStepSyncPending = false;
        stepPermissionRequestPending = false;
    }

    window.addEventListener('message', event => {
        if (!hasNativeHealthConnectBridge()) return;
        if (event.origin && event.origin !== NATIVE_STEP_ORIGIN) return;
        handleNativeStepMessage(event.data);
    });

