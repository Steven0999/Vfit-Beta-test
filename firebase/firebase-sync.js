    // ==========================================================================
    // MEMBERSHIPS — STRIPE CHECKOUT AND CUSTOMER PORTAL
    // ==========================================================================

    const MEMBERSHIP_PLANS = Object.freeze([
        { id: 'free', name: 'Free', price: '£0', note: 'Core beta tracking on this device and cloud sync.' },
        { id: 'basic', name: 'Basic', price: '£10/mo', note: 'Progress planning and member tools.' },
        { id: 'platinum', name: 'Platinum', price: '£50/mo', note: 'Advanced coaching insights and priority support.' },
        { id: 'coaching', name: '1-to-1 Coaching', price: '£250/mo', note: 'Personal coach check-ins, programming and feedback.' }
    ]);

    function membershipTierLabel(tier) {
        const plan = MEMBERSHIP_PLANS.find(item => item.id === tier);
        return plan ? plan.name : 'Free';
    }

    function showMembershipReturnStatus() {
        const params = new URLSearchParams(window.location.search || '');
        const result = params.get('checkout');
        if (result === 'success') showToast('Payment received — your membership will update shortly ✓', 6500);
        else if (result === 'cancelled') showToast('Checkout cancelled — no membership change was made', 5000);
        if (result) {
            params.delete('checkout');
            const query = params.toString();
            history.replaceState(history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
        }
    }

    function renderMembership() {
        const status = document.getElementById('membership-status');
        const plans = document.getElementById('membership-plans');
        if (!status || !plans) return;
        const tier = String(accountMembership.tier || 'free').toLowerCase();
        const active = ['active', 'trialing'].includes(String(accountMembership.status || '').toLowerCase());
        const end = valueTime(accountMembership.currentPeriodEnd);
        status.textContent = active
            ? `${membershipTierLabel(tier)} active${end ? ' · renews ' + new Date(end).toLocaleDateString('en-GB') : ''}`
            : `${membershipTierLabel(tier)} plan${RUNTIME_CONFIG.paymentsEnabled ? '' : ' · secure checkout awaiting setup'}`;

        plans.innerHTML = MEMBERSHIP_PLANS.map(plan => {
            const current = plan.id === tier && (plan.id === 'free' || active);
            const canCheckout = plan.id !== 'free' && RUNTIME_CONFIG.paymentsEnabled;
            const button = current
                ? '<span class="text-[10px] font-black uppercase text-emerald-600">Current plan</span>'
                : plan.id === 'free'
                    ? '<span class="text-[10px] font-black uppercase text-slate-400">Included</span>'
                    : `<button onclick="startMembershipCheckout('${escapeJsString(plan.id)}')" class="px-3 py-2 rounded-lg text-[10px] font-black ${canCheckout ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}">${canCheckout ? 'Choose' : 'Setup pending'}</button>`;
            return `<div class="border ${current ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'} rounded-xl p-3 flex items-center justify-between gap-3">
                <div><p class="font-black text-sm">${escapeHtml(plan.name)} · ${escapeHtml(plan.price)}</p><p class="text-[10px] text-slate-500 mt-1">${escapeHtml(plan.note)}</p></div>${button}
            </div>`;
        }).join('') + ((accountMembership.stripeCustomerId || active)
            ? '<button onclick="openBillingPortal()" class="w-full mt-2 p-3 bg-slate-900 text-white rounded-xl font-bold text-xs">Manage Billing</button>'
            : '') + '<p class="text-[10px] text-slate-400 mt-2">Memberships do not restrict existing beta features while payments are being configured.</p>';
    }

    async function startMembershipCheckout(plan) {
        if (!currentUser) { showToast('Sign in before choosing a membership'); return; }
        if (!currentUser.emailVerified) {
            showToast('Verify your email before starting a paid membership', 5500);
            return;
        }
        if (!RUNTIME_CONFIG.paymentsEnabled) {
            showToast('Secure payments are not live yet — Stripe setup is still required', 5500);
            return;
        }
        const callable = getBackendCallable('createCheckoutSession');
        if (!callable) { showToast('Secure checkout is temporarily unavailable'); return; }
        try {
            showToast('Opening secure Stripe checkout…');
            const result = await callable({ plan: String(plan || '').toLowerCase() });
            const target = new URL(result && result.data && result.data.url);
            if (target.protocol !== 'https:') throw new Error('Unsafe checkout URL');
            window.location.assign(target.href);
        } catch (error) {
            console.error('Checkout failed:', error);
            showToast('Could not start checkout — try again later', 5500);
        }
    }

    async function openBillingPortal() {
        if (!currentUser || !RUNTIME_CONFIG.paymentsEnabled) {
            showToast('Billing management is not live yet');
            return;
        }
        const callable = getBackendCallable('createBillingPortalSession');
        if (!callable) { showToast('Billing management is unavailable'); return; }
        try {
            const result = await callable({});
            const target = new URL(result && result.data && result.data.url);
            if (target.protocol !== 'https:') throw new Error('Unsafe billing URL');
            window.location.assign(target.href);
        } catch (error) {
            console.error('Billing portal failed:', error);
            showToast('Could not open billing management', 5000);
        }
    }

    // ==========================================================================
    // ANDROID / WEB PUSH — FCM DEVICE REGISTRATION AND SHIFT-AWARE SCHEDULING
    // ==========================================================================

    function pushConfigurationReady() {
        return Boolean(
            RUNTIME_CONFIG.pushEnabled &&
            RUNTIME_CONFIG.fcmVapidKey &&
            RUNTIME_CONFIG.appCheckSiteKey &&
            appCheckReady &&
            typeof firebase.messaging === 'function'
        );
    }

    function renderNotificationSettings() {
        const status = document.getElementById('push-status');
        const button = document.getElementById('push-toggle-btn');
        if (!status || !button) return;
        const settings = Object.assign({}, DEFAULT_STATE.notificationSettings, state.notificationSettings || {});
        const controls = {
            'push-reminder-time': settings.reminderTime || '18:00',
            'push-workouts': !!settings.workouts,
            'push-checkins': !!settings.checkIns,
            'push-hydration': !!settings.hydration,
            'push-coach': !!settings.coachMessages
        };
        Object.entries(controls).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (!element) return;
            if (element.type === 'checkbox') element.checked = value;
            else element.value = value;
        });

        const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
        const permission = supported ? Notification.permission : 'unsupported';
        if (!supported) status.textContent = 'Push is not supported in this browser';
        else if (!pushConfigurationReady()) status.textContent = 'Ready in code · Firebase push setup pending';
        else if (permission === 'denied') status.textContent = 'Blocked in Android browser notification settings';
        else if (settings.enabled && permission === 'granted') status.textContent = 'Enabled · shift-aware reminders active';
        else status.textContent = 'Available · permission not yet granted';

        button.textContent = settings.enabled ? 'Disable' : 'Enable';
        button.className = settings.enabled
            ? 'px-4 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs'
            : 'px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs';
        button.disabled = !supported;
    }

    function saveCoachingTargets() {
        const input = document.getElementById('target-workouts-week');
        state.coachingTargets.workoutsPerWeek = Math.round(clampNumber(input && input.value, 1, 14, 3));
        saveState();
        renderWeeklyReportSummary();
        syncPushSchedule();
        showToast('Weekly workout target saved');
    }

    function saveNotificationPreferences() {
        const settings = state.notificationSettings;
        const time = document.getElementById('push-reminder-time');
        settings.reminderTime = /^\d{2}:\d{2}$/.test(time && time.value) ? time.value : '18:00';
        settings.workouts = !!document.getElementById('push-workouts')?.checked;
        settings.checkIns = !!document.getElementById('push-checkins')?.checked;
        settings.hydration = !!document.getElementById('push-hydration')?.checked;
        settings.coachMessages = !!document.getElementById('push-coach')?.checked;
        saveState();
        syncPushSchedule();
        renderNotificationSettings();
    }

    function togglePushNotifications() {
        if (state.notificationSettings.enabled) disablePushNotifications();
        else enablePushNotifications();
    }

    async function sha256Hex(value) {
        if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') {
            return 'device_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        }
        const data = new TextEncoder().encode(String(value));
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function reminderDateForDay(day, shift, configuredTime) {
        const result = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0, 0, 0);
        const time = shift.type !== 'off' && shift.start ? shift.start : configuredTime;
        const match = /^(\d{1,2}):(\d{2})$/.exec(time || '18:00');
        result.setHours(match ? Number(match[1]) : 18, match ? Number(match[2]) : 0, 0, 0);
        if (shift.type !== 'off') result.setMinutes(result.getMinutes() - (shift.type === 'night' ? 120 : 90));
        return result;
    }

    function buildPushReminderSchedule(fromValue, days) {
        const settings = Object.assign({}, DEFAULT_STATE.notificationSettings, state.notificationSettings || {});
        const now = fromValue instanceof Date ? new Date(fromValue) : new Date(fromValue || Date.now());
        const schedule = [];
        const workoutTarget = Math.max(1, Math.min(7, Number(state.coachingTargets.workoutsPerWeek) || 3));
        const workoutCounts = {};
        for (let offset = 0; offset < (days || 14); offset++) {
            const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12, 0, 0, 0);
            const key = localDateKey(day);
            const shift = getShiftForDate(key);
            const at = reminderDateForDay(day, shift, settings.reminderTime);
            if (at.getTime() <= now.getTime() + 60000) continue;
            const block = Math.floor(offset / 7);
            workoutCounts[block] = workoutCounts[block] || 0;
            let kind = null;
            if (settings.checkIns && day.getDay() === 0) kind = 'checkin';
            else if (settings.workouts && workoutCounts[block] < workoutTarget) {
                kind = 'workout';
                workoutCounts[block] += 1;
            } else if (settings.hydration) kind = 'hydration';
            if (!kind) continue;
            schedule.push({ at: at.toISOString(), kind, shiftType: shift.type });
        }
        return schedule;
    }

    function nextShiftAwareReminder(fromValue) {
        return buildPushReminderSchedule(fromValue, 14)[0] || null;
    }

    async function syncPushSchedule() {
        if (!currentUser) return false;
        const settings = state.notificationSettings || DEFAULT_STATE.notificationSettings;
        const schedule = settings.enabled ? buildPushReminderSchedule(new Date(), 14) : [];
        const next = schedule[0] || null;
        const timeZone = (() => {
            try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
            catch (error) { return 'UTC'; }
        })();
        try {
            await db.collection('users').doc(currentUser.uid).set({
                pushPreferences: {
                    enabled: !!settings.enabled,
                    reminderTime: settings.reminderTime || '18:00',
                    workouts: !!settings.workouts,
                    checkIns: !!settings.checkIns,
                    hydration: !!settings.hydration,
                    coachMessages: !!settings.coachMessages,
                    timeZone,
                    nextReminderAt: next ? new Date(next.at) : null,
                    nextReminderKind: next ? next.kind : null,
                    reminderSchedule: schedule,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }
            }, { merge: true });
            return true;
        } catch (error) {
            console.warn('Push schedule could not be synced:', error);
            return false;
        }
    }

    function bindForegroundMessaging() {
        if (!messagingApi || foregroundMessagingBound || typeof messagingApi.onMessage !== 'function') return;
        foregroundMessagingBound = true;
        messagingApi.onMessage(payload => {
            const data = payload && dataOrNotification(payload);
            showToast(`${data.title || 'VFIT'} · ${data.body || 'New update'}`, 6500);
            refreshNotifBadge();
        });
    }

    function dataOrNotification(payload) {
        return Object.assign({}, (payload && payload.notification) || {}, (payload && payload.data) || {});
    }

    async function enablePushNotifications(options) {
        const config = options || {};
        if (!currentUser) { if (!config.silent) showToast('Sign in to enable notifications'); return false; }
        if (!pushConfigurationReady()) {
            if (!config.silent) showToast('Firebase push and App Check setup is still required', 5500);
            renderNotificationSettings();
            return false;
        }
        if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
            if (!config.silent) showToast('This browser does not support push notifications');
            return false;
        }
        try {
            let permission = Notification.permission;
            if (permission !== 'granted' && !config.silent) permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                if (!config.silent) showToast(permission === 'denied' ? 'Notifications are blocked in browser settings' : 'Notification permission was not granted', 5500);
                return false;
            }
            const registration = await navigator.serviceWorker.register('./sw.js');
            await navigator.serviceWorker.ready;
            messagingApi = messagingApi || firebase.messaging();
            const token = await messagingApi.getToken({
                vapidKey: RUNTIME_CONFIG.fcmVapidKey,
                serviceWorkerRegistration: registration
            });
            if (!token) throw new Error('Firebase did not return a device token');
            const deviceId = await sha256Hex(token);
            const deviceRef = db.collection('users').doc(currentUser.uid).collection('devices').doc(deviceId);
            await deviceRef.set({
                token,
                active: true,
                platform: navigator.userAgent || 'web',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            state.notificationSettings.enabled = true;
            state.notificationSettings.deviceId = deviceId;
            saveState({ skipCloud: true });
            await syncPushSchedule();
            bindForegroundMessaging();
            renderNotificationSettings();
            if (!config.silent) showToast('Notifications enabled ✓');
            return true;
        } catch (error) {
            console.error('Push registration failed:', error);
            if (!config.silent) showToast('Could not enable notifications — check Firebase setup', 5500);
            renderNotificationSettings();
            return false;
        }
    }

    async function restorePushRegistration() {
        if (!state.notificationSettings.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        await enablePushNotifications({ silent: true });
    }

    async function disablePushNotifications() {
        const deviceId = state.notificationSettings.deviceId;
        state.notificationSettings.enabled = false;
        state.notificationSettings.deviceId = null;
        saveState({ skipCloud: true });
        try {
            if (currentUser && deviceId) {
                await db.collection('users').doc(currentUser.uid).collection('devices').doc(deviceId).set({
                    active: false,
                    disabledAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            if (messagingApi && typeof messagingApi.deleteToken === 'function') await messagingApi.deleteToken();
            await syncPushSchedule();
        } catch (error) {
            console.warn('Push token cleanup pending:', error);
        }
        renderNotificationSettings();
        showToast('Notifications disabled');
    }

    // ==========================================================================
    // PRIVACY CENTRE — CONSENT, VERIFICATION, EXPORT AND DELETION
    // ==========================================================================

    function openPrivacyCenter() {
        const syncToggle = document.getElementById('privacy-cloud-sync');
        if (syncToggle) syncToggle.checked = !state.privacySettings || state.privacySettings.cloudHealthData !== false;
        document.getElementById('privacy-modal').style.display = 'flex';
        refreshIcons();
    }

    function closePrivacyCenter() {
        document.getElementById('privacy-modal').style.display = 'none';
    }

    async function savePrivacySettings() {
        const toggle = document.getElementById('privacy-cloud-sync');
        const enabled = !toggle || !!toggle.checked;
        state.privacySettings.cloudHealthData = enabled;
        state.privacySettings.noticeVersion = RUNTIME_CONFIG.privacyVersion;
        state.privacySettings.acknowledgedAt = new Date().toISOString();
        saveState({ skipCloud: !enabled });
        if (currentUser) {
            try {
                await db.collection('users').doc(currentUser.uid).set({
                    privacy: {
                        cloudHealthData: enabled,
                        noticeVersion: RUNTIME_CONFIG.privacyVersion,
                        acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }
                }, { merge: true });
            } catch (error) {
                console.warn('Privacy preference sync pending:', error);
            }
        }
        if (enabled) scheduleCloudSnapshotSync(200);
        else {
            clearTimeout(cloudSyncTimer);
            cloudDirty = false;
            updateDataSyncStatus();
        }
        showToast(enabled ? 'Cloud health-data sync enabled' : 'Future health-data changes stay on this device', 5000);
    }

    async function resendVerificationEmail() {
        if (!currentUser) { showToast('Sign in to verify your email'); return; }
        try {
            await currentUser.reload();
            if (currentUser.emailVerified) {
                renderProfile();
                showToast('Your email is already verified ✓');
                return;
            }
            await currentUser.sendEmailVerification();
            showToast('Verification email sent — check your inbox', 5500);
        } catch (error) {
            console.error('Email verification failed:', error);
            showToast('Could not send verification email — try again later', 5000);
        }
    }

    async function deleteVfitAccount() {
        if (!currentUser) { showToast('Sign in before deleting your account'); return; }
        const confirmation = prompt('This permanently deletes your VFIT account and cloud data. Type DELETE to continue.');
        if (confirmation !== 'DELETE') { showToast('Account deletion cancelled'); return; }
        const callable = getBackendCallable('deleteMyAccount');
        if (!callable || !appCheckReady) {
            showToast('Secure account deletion needs the Firebase Functions and App Check setup', 6500);
            return;
        }
        const uid = currentUser.uid;
        try {
            showToast('Deleting account and cloud data…', 8000);
            const result = await callable({ confirmation: 'DELETE' });
            if (!result || !result.data || result.data.deleted !== true) throw new Error('Deletion was not confirmed');
            if (typeof deleteProgressPhotosForOwner === 'function') {
                await deleteProgressPhotosForOwner(uid).catch(error => {
                    console.warn('The deleted account had local progress photos that could not be removed:', error);
                });
            }
            localStorage.removeItem(stateStorageKey(uid));
            localStorage.removeItem(recoveryStorageKey(uid));
            localStorage.removeItem(notificationStorageKey('vfit_seen_notifs'));
            localStorage.removeItem(notificationStorageKey('vfit_dismissed_notifs'));
            if (localStorage.getItem(LEGACY_MIGRATION_KEY) === uid) {
                localStorage.removeItem(LEGACY_STATE_KEY);
                localStorage.removeItem(LEGACY_MIGRATION_KEY);
            }
            await auth.signOut().catch(() => {});
            closePrivacyCenter();
            showToast('Your VFIT account has been deleted');
        } catch (error) {
            console.error('Account deletion failed:', error);
            showToast('Account deletion could not be completed — no local data was removed', 6500);
        }
    }

    // ==========================================================================
    // CARDIO MODAL
    // ==========================================================================

    function openCardioModal() {
        document.getElementById('cardio-modal').style.display = 'flex';
        document.getElementById('cardio-type').value = outdoorRunSession ? 'outdoor-running' : 'treadmill';
        document.getElementById('cardio-duration').value = '';
        document.getElementById('cardio-distance').value = '';
        document.getElementById('cardio-calories').value = '';
        document.getElementById('cardio-notes').value = '';
        updateCardioMode();
        if (nativeRunTrackingAvailable()) sendRunCommand('status');
    }

    function closeCardioModal() {
        document.getElementById('cardio-modal').style.display = 'none';
    }

    function saveCardio() {
        const type = document.getElementById('cardio-type').value;
        const recordedRun = type === 'outdoor-running' ? completedOutdoorRun() : null;
        if (type === 'outdoor-running' && !recordedRun) {
            showToast('Finish your run before saving it', 6000);
            return;
        }
        let gpsRun = recordedRun;
        if (gpsRun && (gpsRun.route.length < 2 || gpsRun.distance <= 0)) {
            const enteredDistance = Number(document.getElementById('cardio-distance').value);
            if (!Number.isFinite(enteredDistance) || enteredDistance < 0.01 || gpsRun.duration <= 0) {
                showToast('GPS recorded no route. Enter a measured distance to calculate speed.', 6000);
                return;
            }
            const distance = Math.round(enteredDistance * 100) / 100;
            gpsRun = Object.assign({}, gpsRun, {
                distance,
                avgSpeedKmh: Math.round(distance / (gpsRun.duration / 60) * 10) / 10,
                maxSpeedKmh: 0,
                route: [],
                trackingSource: 'manual-distance'
            });
        }
        if (gpsRun && (state.cardioLogs || []).some(log => log.runId === gpsRun.runId)) {
            acknowledgeSavedOutdoorRun();
            closeCardioModal();
            return;
        }
        const duration = gpsRun ? gpsRun.duration : Number(document.getElementById('cardio-duration').value);
        const distance = gpsRun ? gpsRun.distance : Number(document.getElementById('cardio-distance').value || 0);
        const calories = parseInt(document.getElementById('cardio-calories').value) || 0;
        const notes = document.getElementById('cardio-notes').value.trim();

        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(distance) || distance < 0) {
            showToast('Enter a valid duration and distance'); return;
        }

        if (!state.cardioLogs) state.cardioLogs = [];
        state.cardioLogs.unshift(Object.assign({
            id: Date.now(),
            date: gpsRun ? gpsRun.date : localDateKey(),
            type: type,
            duration: duration,
            distance: distance,
            avgSpeedKmh: gpsRun ? gpsRun.avgSpeedKmh : (distance ? Math.round(distance / (duration / 60) * 10) / 10 : 0),
            calories: calories,
            notes: notes
        }, gpsRun || {}));
        saveState();
        if (gpsRun) acknowledgeSavedOutdoorRun();
        closeCardioModal();
        showToast('Cardio logged! 🏃');
        renderTrainingLogs();
    }

    // ==========================================================================
    // EXERCISE DEMOS
    // ==========================================================================

    const EXERCISE_DEMO_DB = {
        'Barbell Squat': {
            video: 'https://www.youtube.com/embed/SW_C1A-rejs',
            muscles: ['Quads', 'Glutes', 'Hamstrings', 'Core'],
            instructions: [
                'Set the bar at upper chest height',
                'Step under and rest bar on traps',
                'Brace core and unrack',
                'Squat down keeping chest up',
                'Drive through heels to stand'
            ],
            tips: ['Keep knees tracking over toes', 'Maintain neutral spine', 'Breathe in on descent']
        },
        'Bench Press': {
            video: 'https://www.youtube.com/embed/rT7DgCr-3pg',
            muscles: ['Chest', 'Triceps', 'Front Delts'],
            instructions: [
                'Lie flat on bench',
                'Grip bar slightly wider than shoulders',
                'Unrack and lower to mid-chest',
                'Press up explosively'
            ],
            tips: ['Keep shoulder blades retracted', 'Plant feet firmly', 'Don\'t bounce off chest']
        },
        'Deadlift': {
            video: 'https://www.youtube.com/embed/op9kVnSso6Q',
            muscles: ['Hamstrings', 'Glutes', 'Back', 'Core'],
            instructions: [
                'Stand with feet hip-width apart, bar over mid-foot',
                'Hinge at hips and grip bar',
                'Brace core and pull slack out of bar',
                'Drive through floor, hips and shoulders rise together'
            ],
            tips: ['Keep bar close to body', 'Neutral spine throughout', 'Lock out hips at top']
        },
        'Pull Ups': {
            video: 'https://www.youtube.com/embed/eGo4IYlbE5g',
            muscles: ['Lats', 'Biceps', 'Upper Back'],
            instructions: [
                'Grip bar slightly wider than shoulders',
                'Hang with arms fully extended',
                'Pull chest to bar',
                'Lower with control'
            ],
            tips: ['Engage core throughout', 'Avoid swinging', 'Full range of motion']
        },
        'Overhead Press': {
            video: 'https://www.youtube.com/embed/2yjwXTZQDDI',
            muscles: ['Shoulders', 'Triceps', 'Upper Chest'],
            instructions: [
                'Stand with feet shoulder-width',
                'Bar at upper chest, grip just outside shoulders',
                'Press straight up overhead',
                'Lock out with bar over crown of head'
            ],
            tips: ['Squeeze glutes for stability', 'Don\'t lean back excessively']
        }
    };

    function showExerciseDemo(name) {
        const demo = EXERCISE_DEMO_DB[name];
        if (!demo) {
            showToast('Demo not available for this exercise yet');
            return;
        }

        document.getElementById('demo-exercise-name').textContent = name;
        document.getElementById('demo-video').src = demo.video;

        const instructions = document.getElementById('demo-instructions');
        instructions.innerHTML = demo.instructions.map((step, i) => `
            <p class="flex items-start gap-3">
                <span class="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0">${i + 1}</span>
                <span>${step}</span>
            </p>`).join('');

        const muscles = document.getElementById('demo-muscles');
        muscles.innerHTML = demo.muscles.map(m => `<span class="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold">${m}</span>`).join('');

        const tips = document.getElementById('demo-tips');
        tips.innerHTML = demo.tips.map(t => `
            <p class="flex items-start gap-2">
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5"></i>
                <span>${t}</span>
            </p>`).join('');

        document.getElementById('exercise-demo-modal').style.display = 'flex';
        refreshIcons();
    }

    function closeExerciseDemo() {
        document.getElementById('exercise-demo-modal').style.display = 'none';
        document.getElementById('demo-video').src = '';
    }

    // ==========================================================================
    // AI COACH (analysis & recommendations)
    // ==========================================================================

    /**
     * Aggregate all AI coach signals into a list of messages.
     * Each helper returns either a string or null. Nulls are filtered out.
     * FIXED: removed references to undefined helpers in the original
     * (getAverageWorkoutIntensity, calculateWorkoutVolume, shouldDeload).
     * Now uses self-contained logic that doesn't depend on missing functions.
     */
    function generateAICoachRecommendations() {
        const recommendations = [];

        // Helper: attach a category to a recommendation (if it exists)
        const tag = (rec, category) => { if (rec) { rec.category = rec.category || category; recommendations.push(rec); } };

        // Due progress-update reminders set to AI-coach delivery → Metrics section
        ['weight', 'measurement', 'photo'].forEach(key => {
            const cfg = updReminders()[key];
            if (cfg && cfg.delivery === 'ai' && isReminderDue(key)) {
                const meta = REMINDER_META[key];
                tag({
                    icon: 'bell-ring',
                    color: 'text-emerald-600',
                    title: meta.label + ' update due',
                    text: `It's time for your <b>${meta.label.toLowerCase()}</b> update — logging it today keeps your progress tracking accurate. <button onclick="openLoggerFor('${key}')" class="underline font-bold text-indigo-600">Log now</button>`,
                    detail: `Regular, consistent tracking is what makes your progress data meaningful. Logging your ${meta.label.toLowerCase()} on schedule means your trends, comparisons and charts reflect real change rather than random gaps — and it keeps you accountable to your goals. Tap "Log now" to record it, or head to the Metrics tab whenever you're ready.`
                }, 'metrics');
            }
        });

        tag(analyzeTrainingFrequency(), 'training');
        tag(checkDeloadNeed(), 'training');
        tag(checkPerformanceTrend(), 'training');
        tag(analyzeWeeklyVolume(), 'training');
        tag(analyzeMuscleGroupBalance(), 'training');
        tag(analyzeNutritionAdherence(), 'nutrition');

        return recommendations;
    }

    /**
     * Weekly training-volume coaching. For intermediate/advanced lifters, checks
     * each trained muscle against the 12-20 sets/week landmark and flags the most
     * actionable issue — undertrained muscles (below 12) or junk volume (above 20).
     * Primary movers count 1.0/set, secondary 0.5/set (via getWeeklyVolume).
     */
    function analyzeWeeklyVolume() {
        const level = getExperienceLevel();
        const plan = activeMuscleGainVolumePlan(state);
        if (level !== 'Intermediate' && level !== 'Advanced') return null;

        const volume = getWeeklyVolume();
        const allLoggedSets = Object.values(volume).reduce((sum, value) => sum + value, 0);
        if (allLoggedSets === 0) return null;
        const targeted = plan ? plan.muscles.slice() : Object.keys(volume);
        if (targeted.length === 0) return null;
        const min = plan ? plan.min : 12;
        const max = plan ? plan.max : 20;

        const under = targeted.filter(m => (volume[m] || 0) < min).sort((a, b) => (volume[a] || 0) - (volume[b] || 0));
        const over = targeted.filter(m => (volume[m] || 0) > max).sort((a, b) => (volume[b] || 0) - (volume[a] || 0));

        const fmt = (v) => Number.isInteger(v) ? v : v.toFixed(1);

        if (over.length > 0) {
            const m = over[0];
            return { icon: 'alert-triangle', color: 'text-rose-500',
                title: 'Volume above your goal range',
                text: `${m} is at ${fmt(volume[m])} sets in the last 7 days — above your ${min}–${max} weekly-set target.`,
                detail: `You've logged ${fmt(volume[m])} working sets for ${m}. Your selected ${plan ? plan.label.toLowerCase() : 'muscle-building'} target is ${min}–${max} sets per week. Consider keeping the best-quality sets and trimming extra volume if recovery or performance is slipping.` };
        }

        const targetLoggedSets = targeted.reduce((sum, muscle) => sum + (volume[muscle] || 0), 0);
        if (under.length > 0 && (targetLoggedSets >= 10 || (plan && allLoggedSets >= 10))) {
            const m = under[0];
            const current = volume[m] || 0;
            const needed = fmt(min - current);
            return { icon: 'plus-circle', color: 'text-indigo-500',
                title: plan && plan.scope === 'specific' ? 'Priority area needs more sets' : 'Room to add goal volume',
                text: `${m} is at ${fmt(current)} sets over the last 7 days — about ${needed} short of your ${min}-set minimum.`,
                detail: `Your goal sets a ${min}–${max} weekly range for ${m}. You have ${fmt(current)} so far. Add the missing volume across the next relevant sessions when recovery is good; the tracker counts primary-muscle sets fully and assisting-muscle work as half a set.` };
        }

        const onTarget = targeted.filter(m => (volume[m] || 0) >= min && (volume[m] || 0) <= max);
        const successCount = plan && plan.scope === 'specific' ? 1 : 2;
        if (onTarget.length >= Math.min(successCount, targeted.length)) {
            return { icon: 'check-circle', color: 'text-emerald-500',
                title: 'Weekly sets on target',
                text: `${onTarget.length} target muscle group${onTarget.length === 1 ? ' is' : 's are'} inside your ${min}–${max} weekly-set range.`,
                detail: `Keep those sets high quality and progress reps or load when technique and recovery allow. The target follows your saved goal: ${plan ? plan.label.toLowerCase() : 'general muscle building'}.` };
        }
        return null;
    }

    function analyzeTrainingFrequency() {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const recent = (state.workoutHistory || []).filter(w => new Date(w.date) > weekAgo);

        if (recent.length === 0) {
            return { icon: 'calendar', color: 'text-amber-500',
                title: 'No sessions logged this week',
                text: 'No workouts logged this week. Try a quick session to get momentum back!',
                detail: `You haven't logged any workouts in the last 7 days. Life happens, and one quiet week won't undo your progress — but the hardest part is usually just restarting. Rather than aiming for a perfect session, aim for an easy one: even 20–30 minutes hitting a few compound lifts is enough to break the inertia and rebuild the habit. Momentum tends to snowball, so the goal today is simply to get one session on the board. If something specific is getting in the way — time, energy, motivation — scaling the session right down is far better than skipping it.` };
        }
        if (recent.length >= 5) {
            return { icon: 'alert-triangle', color: 'text-amber-500',
                title: 'Watch your recovery',
                text: `You've trained ${recent.length}× this week — consider a rest day to allow recovery.`,
                detail: `You've logged ${recent.length} sessions in the last 7 days — that's a lot of training, and it shows real commitment. The thing to remember is that muscle is built during recovery, not during the session itself: training provides the stimulus, but sleep and rest days are when adaptation actually happens. Training this frequently without enough recovery can quietly lead to worse performance, poor sleep, and burnout. Make sure at least one or two days a week are genuine rest or light activity, you're sleeping well, and you're eating enough to fuel this workload. If you're feeling strong and recovering fine, that's great — just keep an eye on it.` };
        }
        if (recent.length >= 3) {
            return { icon: 'check-circle', color: 'text-emerald-500',
                title: 'Solid, consistent week',
                text: `Solid week — ${recent.length} sessions logged. Keep it up!`,
                detail: `${recent.length} sessions in the last 7 days is a genuinely productive, sustainable rhythm — enough training to drive progress with enough room to recover between sessions. This is the kind of consistency that beats occasional heroic weeks. The best thing you can do from here is protect it: keep showing up at roughly this frequency, and layer in gradual progression (a little more weight or an extra rep over time). Long-term results come from repeating good weeks like this one, not from any single standout session.` };
        }
        return { icon: 'trending-up', color: 'text-indigo-500',
            title: 'Building momentum',
            text: `${recent.length} workout${recent.length === 1 ? '' : 's'} this week. Aim for 3-4 for steady progress.`,
            detail: `You've logged ${recent.length} workout${recent.length === 1 ? '' : 's'} in the last 7 days — a good start. For most people chasing steady progress, around 3–4 sessions a week is the sweet spot: frequent enough to build and maintain momentum, while still leaving time to recover and fit training around real life. If you can add one more session this week, you'll be right in that productive zone. It doesn't need to be long — consistency and showing up regularly matter far more than the length of any individual workout.` };
    }

    /**
     * Check if a deload week may be appropriate.
     * Self-contained: looks at the last 4 weeks of training volume.
     */
    function checkDeloadNeed() {
        if (isDeloadPlanActive(state, localDateKey())) {
            return { icon: 'battery-charging', color: 'text-indigo-500',
                title: 'Deload week active',
                text: `Your deload runs through ${state.deloadPlan.endDate}. Keep the habit, reduce hard-set volume by about 40–50% and avoid failure.`,
                detail: 'This easier week is designed to let fatigue fall while you keep practising the main movements. Use lighter loads, leave 3–4 reps in reserve and return to normal volume only when recovery and performance improve.' };
        }
        const history = state.workoutHistory || [];
        if (history.length < 8) return null;

        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
        const recent = history.filter(w => new Date(w.date) > fourWeeksAgo);

        if (recent.length >= 16) {
            return { icon: 'battery-low', color: 'text-rose-500',
                title: 'A deload could help',
                text: 'You\'ve been training hard for 4 weeks straight. A deload week could help you come back stronger.',
                detail: `You've put in around ${recent.length} sessions over the last 4 weeks — a big, sustained block of training. After several hard weeks, fatigue accumulates faster than your body can fully clear it, and performance can quietly stall or dip. A deload — a planned easier week where you cut volume or intensity by roughly 40–50% — lets that fatigue dissipate while keeping the training habit intact. Most lifters come back from a deload feeling fresher and often hitting new bests. It can feel counterintuitive to back off when you're motivated, but a well-timed easy week is what lets you keep progressing rather than grinding into a plateau or injury.` };
        }
        return null;
    }

    /**
     * Look at recent PR trend — if max weights have been flat or dropping for the user's
     * most-trained exercise, suggest progressive overload focus.
     */
    function checkPerformanceTrend() {
        const history = state.workoutHistory || [];
        if (history.length < 4) return null;

        const exerciseFreq = {};
        history.forEach(w => {
            (w.exercises || []).forEach(ex => {
                exerciseFreq[ex.name] = (exerciseFreq[ex.name] || 0) + 1;
            });
        });

        const topExercise = Object.entries(exerciseFreq).sort((a, b) => b[1] - a[1])[0];
        if (!topExercise || topExercise[1] < 4) return null;

        const exerciseName = topExercise[0];
        const dataPoints = [];
        history.slice().reverse().forEach(w => {
            (w.exercises || []).forEach(ex => {
                if (ex.name === exerciseName) {
                    let max = 0;
                    (ex.sets || []).forEach(s => {
                        const weight = parseFloat(s.weight) || 0;
                        if (weight > max) max = weight;
                    });
                    if (max > 0) dataPoints.push(max);
                }
            });
        });

        if (dataPoints.length < 3) return null;

        const last3 = dataPoints.slice(-3);
        const allFlat = last3.every(v => v === last3[0]);

        if (allFlat) {
            return { icon: 'trending-up', color: 'text-indigo-500',
                title: 'Time to push past a plateau',
                text: `Your ${exerciseName} weight has plateaued. Try adding 2.5kg or an extra rep next session.`,
                detail: `Your top set on ${exerciseName} has been the same for your last three sessions. Plateaus are completely normal — they're a sign your body has adapted to the current stimulus and is ready for a nudge. The fix is progressive overload: give it a slightly harder target. Try adding the smallest possible increment (2.5kg, or micro-plates if you have them), or keep the weight and add an extra rep or an extra set. If the weight has felt genuinely stuck for a while, other levers can help too — improving sleep, eating a little more, tightening up your technique, or giving that lift an easier week before pushing again. Small, steady increases add up far more than big jumps.` };
        }
        return null;
    }

    function analyzeMuscleGroupBalance() {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        const recent = (state.workoutHistory || []).filter(w => new Date(w.date) > monthAgo);

        if (recent.length < 4) return null;

        const focusCounts = {};
        recent.forEach(w => {
            const focus = (w.focus || '').toLowerCase();
            focusCounts[focus] = (focusCounts[focus] || 0) + 1;
        });

        const totalWorkouts = recent.length;
        const upperFocus = (focusCounts['upper'] || 0) + (focusCounts['push'] || 0) + (focusCounts['pull'] || 0) + (focusCounts['chest'] || 0) + (focusCounts['back'] || 0) + (focusCounts['shoulders'] || 0) + (focusCounts['biceps'] || 0) + (focusCounts['triceps'] || 0);
        const lowerFocus = (focusCounts['lower'] || 0) + (focusCounts['legs'] || 0) + (focusCounts['quads'] || 0) + (focusCounts['hamstrings'] || 0) + (focusCounts['glutes'] || 0) + (focusCounts['calves'] || 0);

        if (upperFocus > 0 && lowerFocus === 0) {
            return { icon: 'alert-circle', color: 'text-amber-500',
                title: 'Don\'t skip leg day',
                text: 'You haven\'t trained lower body in the last month. Consider adding a leg day for balanced development.',
                detail: `Looking at the last month, all your logged sessions have been upper-body focused with no dedicated lower-body work. Training legs matters for more than symmetry: the lower body holds your largest muscles, and working them supports whole-body strength, athleticism, joint health, and even hormonal and metabolic benefits that carry over to your upper-body progress. It also keeps your physique balanced and reduces injury risk from imbalances. Try adding one leg-focused session a week — squats, hinges (deadlift/RDL), lunges, and calf work cover the bases. If you've been avoiding legs because they're tough, start lighter and build up; a little consistent leg training goes a long way.` };
        }
        if (lowerFocus > 0 && upperFocus === 0) {
            return { icon: 'alert-circle', color: 'text-amber-500',
                title: 'Don\'t neglect upper body',
                text: 'You haven\'t trained upper body recently. Don\'t neglect it for overall balance.',
                detail: `Over the last month your sessions have been lower-body focused, with no dedicated upper-body work logged. For balanced strength and physique, your upper body needs regular attention too — pushing (chest, shoulders, triceps) and pulling (back, biceps) movements keep your posture, pressing and pulling strength, and overall proportions in check. Aim to add at least one upper-body session a week, ideally covering both a push and a pull pattern. A simple upper/lower split across the week is an easy way to make sure nothing gets left behind.` };
        }
        if (upperFocus > lowerFocus * 3 && totalWorkouts >= 6) {
            return { icon: 'info', color: 'text-indigo-500',
                title: 'Upper/lower imbalance',
                text: `${upperFocus} upper vs ${lowerFocus} lower body sessions. Consider adding more leg work.`,
                detail: `Across the last month you've done ${upperFocus} upper-body sessions against ${lowerFocus} lower-body — more than a 3-to-1 skew toward upper. You're not neglecting legs entirely, but the balance is tilted enough that your lower body is likely developing more slowly than your upper. Over time, large imbalances can affect your physique, your overall strength, and even injury risk. You don't need to overhaul anything — just nudge the ratio by adding one more leg session a week or tagging some lower-body work onto an existing day. Aiming for a rough balance between upper and lower over each week or two will keep your progress even.` };
        }
        return null;
    }

    function analyzeNutritionAdherence() {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const recent = (state.nutritionHistory || []).filter(h => new Date(h.date) > weekAgo);

        if (recent.length === 0) return null;

        const target = state.goals.calories || 2500;
        const avgCals = recent.reduce((sum, h) => sum + (h.calories || 0), 0) / recent.length;
        const diff = avgCals - target;

        if (Math.abs(diff) < 200) {
            return { icon: 'target', color: 'text-emerald-500',
                title: 'Nutrition on target',
                text: `Nutrition on point — averaging ${Math.round(avgCals)} kcal/day vs your ${target} target.`,
                detail: `Your average intake over the last 7 days is ${Math.round(avgCals)} kcal/day, right around your ${target} kcal target. Consistency like this is exactly what makes nutrition work — day-to-day calories will always bounce around, but it's the weekly average that drives your results, and yours is dialled in. Keep it up. From here, if your goal is changing (leaning down or building), the lever is to adjust the target itself rather than trying to be stricter day to day. And don't forget protein and food quality alongside the calorie total — hitting your protein target consistently supports both muscle and fullness.` };
        }
        if (diff > 300) {
            return { icon: 'arrow-down', color: 'text-amber-500',
                title: 'Running above target',
                text: `Averaging ${Math.round(avgCals)} kcal/day — that's ${Math.round(diff)} above your target.`,
                detail: `Over the last 7 days you've averaged ${Math.round(avgCals)} kcal/day, about ${Math.round(diff)} over your ${target} target. One high week isn't a problem, but a consistent surplus like this will slow fat loss or add weight faster than you might intend. Rather than crash-cutting, look for the easiest wins: liquid calories (drinks, alcohol), snacking, oversized portions, and cooking oils are the usual culprits. Bumping up protein and fibre-rich vegetables helps too — they're very filling for their calories, so you feel satisfied on less. Small, sustainable trims beat drastic restriction that you can't keep up. If the target itself no longer fits your goal, it may be worth revisiting it.` };
        }
        if (diff < -300) {
            return { icon: 'arrow-up', color: 'text-amber-500',
                title: 'Under-fuelling',
                text: `Averaging ${Math.round(avgCals)} kcal/day — that's ${Math.round(Math.abs(diff))} below target. Make sure you're fuelling properly.`,
                detail: `Your average is ${Math.round(avgCals)} kcal/day, around ${Math.round(Math.abs(diff))} under your ${target} target. If you're deliberately dieting, a moderate deficit is fine — but a large or prolonged one can backfire: energy, training performance, recovery, sleep and mood all suffer when you're chronically under-fuelled, and muscle can be lost along with fat. Make sure you're eating enough to support your training, hitting your protein target, and not dropping too far below maintenance. If fat loss is the goal, a smaller, steadier deficit is far more sustainable and protects your muscle and performance. If you've been under target without meaning to, try adding an easy, protein-rich meal or snack to your day.` };
        }
        return null;
    }

    // Titles inferred from the recommendation icon, so each tip has a heading.
    function coachMsgTitle(rec) {
        if (rec.title) return rec.title;
        const byIcon = {
            'alert-triangle': 'Something to watch',
            'plus-circle': 'Room to add',
            'check-circle': 'On track',
            'calendar': 'Training schedule',
            'trending-up': 'Progress update',
            'battery-low': 'Recovery check',
            'alert-circle': 'Nutrition note',
            'info': 'Coach insight',
            'target': 'Goal progress',
            'arrow-down': 'Trending down',
            'arrow-up': 'Trending up',
            'bell-ring': 'Reminder',
            'sparkles': 'Coach tip'
        };
        return byIcon[rec.icon] || 'Coach insight';
    }

    // Section definitions: order + labels + icons for grouping the tips.
    const COACH_SECTIONS = [
        { key: 'training',  label: 'Training',  icon: 'dumbbell' },
        { key: 'nutrition', label: 'Nutrition', icon: 'utensils' },
        { key: 'metrics',   label: 'Metrics',   icon: 'ruler' },
        { key: 'other',     label: 'Other',     icon: 'sparkles' }
    ];

    let coachTips = []; // current tips, with a stable index for expand/collapse

    function renderAICoach() {
        const bubble = document.getElementById('ai-coach-bubble');
        const messagesEl = document.getElementById('ai-coach-messages');
        const timestampEl = document.getElementById('ai-coach-timestamp');
        if (!bubble || !messagesEl) return;

        if (state.aiCoachEnabled === false) {
            bubble.style.display = 'none';
            return;
        }
        bubble.style.display = 'block';

        coachTips = generateAICoachRecommendations();

        if (coachTips.length === 0) {
            messagesEl.innerHTML = `
                <p class="flex items-start gap-2">
                    <i data-lucide="sparkles" class="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-500"></i>
                    <span>Log a few workouts and meals so I can analyse your training and give specific advice.</span>
                </p>`;
            if (timestampEl) timestampEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            refreshIcons();
            return;
        }

        // Give each tip a stable index for the expand toggle
        coachTips.forEach((t, i) => { t._i = i; });

        // Build each section that has at least one tip
        let html = '';
        COACH_SECTIONS.forEach(section => {
            const inSection = coachTips.filter(t => (t.category || 'other') === section.key);
            if (inSection.length === 0) return;
            html += `
                <div class="mb-4 last:mb-0">
                    <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="${section.icon}" class="w-3.5 h-3.5 text-slate-400"></i>
                        <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide">${section.label}</p>
                    </div>
                    <div class="space-y-2">
                        ${inSection.map(t => coachTipHTML(t)).join('')}
                    </div>
                </div>`;
        });

        messagesEl.innerHTML = html;
        if (timestampEl) timestampEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        refreshIcons();
    }

    // A single collapsible coaching tip: title row (tap to expand) + hidden detail.
    function coachTipHTML(t) {
        const i = t._i;
        const detailText = t.detail ? t.detail : stripHtml(t.text);
        return `
            <div class="bg-white/70 border border-indigo-100 rounded-2xl overflow-hidden">
                <button onclick="toggleCoachTip(${i})" class="w-full flex items-start gap-2.5 p-3 text-left hover:bg-white/90">
                    <i data-lucide="${t.icon}" class="w-4 h-4 flex-shrink-0 mt-0.5 ${t.color}"></i>
                    <span class="flex-1 text-sm font-bold text-slate-700">${coachMsgTitle(t)}</span>
                    <i data-lucide="chevron-down" id="coach-chevron-${i}" class="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400 transition-transform"></i>
                </button>
                <div id="coach-detail-${i}" class="hidden px-3 pb-3">
                    <p class="text-sm text-slate-600 leading-relaxed pl-6">${detailText}</p>
                    <button onclick="toggleCoachTip(${i})" class="mt-2 ml-6 text-xs font-bold text-slate-400 hover:text-slate-600">Close</button>
                </div>
            </div>`;
    }

    // Expand/collapse a single tip independently of the others.
    function toggleCoachTip(i) {
        const detail = document.getElementById('coach-detail-' + i);
        const chevron = document.getElementById('coach-chevron-' + i);
        if (!detail) return;
        const isOpen = !detail.classList.contains('hidden');
        if (isOpen) {
            detail.classList.add('hidden');
            if (chevron) chevron.style.transform = '';
        } else {
            detail.classList.remove('hidden');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
    }

    function stripHtml(s) {
        const d = document.createElement('div');
        d.innerHTML = s || '';
        return d.textContent || d.innerText || '';
    }

    function refreshAICoach() {
        const messagesEl = document.getElementById('ai-coach-messages');
        if (messagesEl) {
            messagesEl.innerHTML = `<p class="flex items-start gap-2">
                <i data-lucide="loader" class="w-4 h-4 flex-shrink-0 mt-0.5 animate-spin text-indigo-600"></i>
                <span>Re-analyzing your data...</span>
            </p>`;
            refreshIcons();
        }
        setTimeout(() => renderAICoach(), 500);
    }

    // ==========================================================================
    // GOAL MODAL
    // ==========================================================================

    // ==========================================================================
    // USER PROFILE (gender, age, height, years training, activity level)
    // Used for maintenance calorie calculation and goal recommendations.
    // ==========================================================================

    function saveUserProfile() {
        if (!state.userProfile) state.userProfile = {};
        const gender = document.getElementById('profile-gender').value || '';
        const age = parseInt(document.getElementById('profile-age').value);
        const heightCm = parseFloat(document.getElementById('profile-height').value);
        const yearsTraining = parseFloat(document.getElementById('profile-years-training').value);
        const activityLevel = document.getElementById('profile-activity').value || '';

        state.userProfile.gender = gender;
        state.userProfile.age = isNaN(age) ? null : age;
        state.userProfile.heightCm = isNaN(heightCm) ? null : heightCm;
        state.userProfile.yearsTraining = Number.isFinite(yearsTraining) && yearsTraining >= 0 && yearsTraining <= 60 ? yearsTraining : null;
        state.userProfile.activityLevel = activityLevel;

        saveState();
        renderExperienceLevel();
        renderMaintenanceDisplay();
        applyTrainingExperienceMode();
        renderVolumeTracker();
    }

    /**
     * Open the About You modal, pre-filling the inputs from state.
     */
    function openAboutYouModal() {
        const p = state.userProfile || {};
        document.getElementById('profile-gender').value = p.gender || '';
        document.getElementById('profile-age').value = (p.age !== null && p.age !== undefined) ? p.age : '';
        document.getElementById('profile-height').value = (p.heightCm !== null && p.heightCm !== undefined) ? p.heightCm : '';
        document.getElementById('profile-years-training').value = (p.yearsTraining !== null && p.yearsTraining !== undefined) ? p.yearsTraining : '';
        document.getElementById('profile-activity').value = p.activityLevel || '';

        renderExperienceLevel();
        document.getElementById('about-you-modal').style.display = 'flex';
        refreshIcons();
    }

    function closeAboutYouModal() {
        document.getElementById('about-you-modal').style.display = 'none';
    }

    /**
     * Save handler for the About You modal — persist then close.
     */
    function saveAboutYou() {
        const yearsInput = document.getElementById('profile-years-training');
        const years = Number(yearsInput.value);
        if (yearsInput.value.trim() && (!Number.isFinite(years) || years < 0 || years > 60)) {
            showToast('Enter a number of training years from 0 to 60');
            yearsInput.focus();
            return;
        }
        saveUserProfile();
        renderAboutYouStatus();
        closeAboutYouModal();
        showToast('Profile saved ✓');
    }

    /**
     * Update the status line on the Settings button so user can see at a glance
     * whether their profile is complete (and what's filled in).
     */
    function renderAboutYouStatus() {
        const statusEl = document.getElementById('about-you-status');
        if (!statusEl) return;
        const p = state.userProfile || {};
        const required = ['gender', 'age', 'heightCm', 'activityLevel'];
        const filled = required.filter(k => p[k] !== null && p[k] !== undefined && p[k] !== '').length;

        if (filled === required.length) {
            const parts = [];
            if (p.gender) parts.push(p.gender.charAt(0).toUpperCase() + p.gender.slice(1));
            if (p.age) parts.push(p.age + 'y');
            if (p.heightCm) parts.push(p.heightCm + 'cm');
            statusEl.textContent = parts.join(' · ');
            statusEl.className = 'text-xs text-emerald-600 font-bold';
        } else if (filled === 0) {
            statusEl.textContent = 'Tap to set up';
            statusEl.className = 'text-xs text-slate-500';
        } else {
            statusEl.textContent = `${filled} of ${required.length} fields filled — tap to complete`;
            statusEl.className = 'text-xs text-amber-600 font-bold';
        }
    }

    /**
     * Show a friendly experience-level label based on years training.
     * 0–2 years = Beginner, over 2 to under 4 = Intermediate, 4+ = Advanced.
     */
    function getExperienceLevel() {
        const yrs = state.userProfile && state.userProfile.yearsTraining;
        if (yrs === null || yrs === undefined || yrs === '' || !Number.isFinite(Number(yrs)) || Number(yrs) < 0) return null;
        if (Number(yrs) <= 2) return 'Beginner';
        if (Number(yrs) < 4) return 'Intermediate';
        return 'Advanced';
    }

    // Missing experience uses the basic interface until the member sets their years.
    function trainingExperienceTier() {
        const level = getExperienceLevel();
        return level === 'Advanced' ? 'advanced' : level === 'Intermediate' ? 'intermediate' : 'beginner';
    }

    function applyTrainingExperienceMode() {
        const tier = trainingExperienceTier();
        document.body.dataset.trainingTier = tier;
        const focus = document.getElementById('workout-focus');
        if (focus) {
            const allowed = tier === 'beginner' ? ['Full Body']
                : tier === 'intermediate' ? ['Full Body', 'Upper', 'Lower', 'Push', 'Pull', 'Legs'] : null;
            Array.from(focus.options || []).forEach(option => {
                option.disabled = !!allowed && !allowed.includes(option.value || option.textContent);
                option.hidden = option.disabled;
            });
            if (allowed && !allowed.includes(focus.value)) {
                focus.value = 'Full Body';
                toggleSpecificMuscle();
            }
        }
        const years = state.userProfile && state.userProfile.yearsTraining;
        const status = document.getElementById('training-level-status');
        const description = document.getElementById('training-level-description');
        if (status) status.textContent = tier === 'beginner' ? 'Training basics' : tier === 'intermediate' ? 'Intermediate training' : 'Full training tools';
        if (description) description.textContent = getExperienceLevel() === null
            ? 'Set your years of training to tailor the tools. For now, start with the basics.'
            : tier === 'beginner' ? `${years} year${Number(years) === 1 ? '' : 's'} training · full-body workouts, reps and weight.`
            : tier === 'intermediate' ? 'Workout splits and weekly volume are ready. Specialist muscle goals unlock at 4 years.'
            : 'All workout focuses, weekly volume and progression tools are available.';
        const menuTitle = document.getElementById('coaching-training-menu-title');
        const menuDescription = document.getElementById('coaching-training-menu-description');
        if (menuTitle) menuTitle.textContent = tier === 'beginner' ? 'Training Basics' : 'Training & Goals';
        if (menuDescription) menuDescription.textContent = tier === 'beginner'
            ? 'Full-body workouts and steady progress' : 'Weekly sets, progression and deload guidance';
    }

    function renderExperienceLevel() {
        const el = document.getElementById('experience-level-display');
        if (!el) return;
        const lvl = getExperienceLevel();
        const yrs = state.userProfile && state.userProfile.yearsTraining;
        if (lvl) {
            el.textContent = `Experience level: ${lvl} (${yrs} year${yrs === 1 ? '' : 's'} training)`;
        } else {
            el.textContent = '';
        }
    }

    // ==========================================================================
    // MAINTENANCE CALORIES (Mifflin-St Jeor + logged activity) + BMI
    // ==========================================================================

    const ACTIVITY_MULTIPLIERS = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9
    };

    // Seven complete local days smooth out one unusually long walk or workout.
    // The log-based baseline includes resting needs and a modest allowance for
    // unmeasured daily activity/food digestion. Exercise uses NET METs so resting
    // energy is not counted twice. RIR is only a small intensity cue, not a meter.
    function calculateEnergyExpenditure(todayKey) {
        const p = state.userProfile || {};
        const weight = Number(getLatestWeightKg());
        const bmr = getBMR();
        if (!bmr || !weight || !ACTIVITY_MULTIPLIERS[p.activityLevel]) return null;
        const today = /^\d{4}-\d{2}-\d{2}$/.test(String(todayKey || '')) ? todayKey : localDateKey();
        const [year, month, day] = today.split('-').map(Number);
        const dates = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(year, month - 1, day - index - 1, 12);
            return localDateKey(date);
        });
        const days = new Set(dates);
        const strideMetres = Number(p.heightCm) * 0.00414;
        const cardioDistanceByDay = {};
        const cardioLogDays = new Set();
        let cardio = 0, strength = 0, rirTotal = 0, rirCount = 0;
        (state.cardioLogs || []).forEach(log => {
            if (!log || !days.has(log.date)) return;
            const hours = Math.min(6, Math.max(0, Number(log.duration) || 0) / 60);
            if (!hours) return;
            cardioLogDays.add(log.date);
            const distance = Math.min(80, Math.max(0, Number(log.distance) || 0));
            const speed = distance / hours;
            const type = String(log.type || '').toLowerCase();
            const met = type === 'outdoor-running' || type === 'treadmill'
                ? (speed >= 7 ? Math.min(13, 6.5 + (speed - 7) * 0.8) : 3.5)
                : type === 'walking' ? 3.5 : type === 'hiking' ? 5.5
                : type === 'cycling' ? 6.8 : type === 'swimming' ? 6
                : type === 'rowing' ? 5 : type === 'elliptical' ? 5 : 4;
            cardio += Math.max(0, met - 1) * weight * hours;
            if (['outdoor-running', 'treadmill', 'walking', 'hiking'].includes(type)) {
                cardioDistanceByDay[log.date] = (cardioDistanceByDay[log.date] || 0) + distance;
            }
        });
        (state.workoutHistory || []).forEach(workout => {
            if (!workout || !days.has(workout.date)) return;
            const timer = String(workout.duration || '').split(':').map(Number);
            const legacySeconds = timer.length === 3 && timer.every(Number.isFinite)
                ? timer[0] * 3600 + timer[1] * 60 + timer[2] : 0;
            const hours = Math.min(4, Math.max(0, Number(workout.durationSeconds) || legacySeconds) / 3600);
            if (!hours) return;
            if (workout.category === 'cardio') {
                // The cardio form may also contain this session. Use the cardio
                // log when both surfaces logged cardio on the same day.
                if (!cardioLogDays.has(workout.date)) cardio += (5 - 1) * weight * hours;
                return;
            }
            const rir = (workout.exercises || []).flatMap(exercise => (exercise.sets || [])
                .filter(set => set.rir !== '' && set.rir !== null && set.rir !== undefined).map(set => Number(set.rir)))
                .filter(value => Number.isFinite(value) && value >= 0 && value <= 10);
            const averageRir = rir.length ? rir.reduce((sum, value) => sum + value, 0) / rir.length : null;
            if (rir.length) { rirTotal += rir.reduce((sum, value) => sum + value, 0); rirCount += rir.length; }
            const met = averageRir === null ? 3.5 : averageRir <= 2 ? 4 : averageRir >= 6 ? 3 : 3.5;
            strength += (met - 1) * weight * hours;
        });
        const stepDays = dates.filter(date => Object.prototype.hasOwnProperty.call(state.stepsLogs || {}, date) &&
            Number.isFinite(Number(state.stepsLogs[date])) && Number(state.stepsLogs[date]) >= 0);
        let walking = 0, averageSteps = 0;
        if (stepDays.length) {
            let overlapKm = 0;
            const loggedWalkingKm = stepDays.reduce((sum, date) => {
                const steps = Math.min(50000, Number(state.stepsLogs[date]));
                averageSteps += steps / stepDays.length;
                const totalKm = steps * strideMetres / 1000;
                // Phone steps already include running/treadmill steps on many devices.
                overlapKm += Math.min(totalKm, cardioDistanceByDay[date] || 0);
                return sum + totalKm;
            }, 0) / stepDays.length;
            walking = Math.max(0, (loggedWalkingKm - overlapKm / 7) * weight * 0.5);
        }
        const hasLogs = stepDays.length > 0 || cardio > 0 || strength > 0;
        const baseline = bmr * (hasLogs ? 1.1 : ACTIVITY_MULTIPLIERS[p.activityLevel]);
        const result = {
            bmr, baseline: Math.round(baseline), walking: Math.round(walking),
            strength: Math.round(strength / 7), cardio: Math.round(cardio / 7),
            averageSteps: Math.round(averageSteps), stepDays: stepDays.length,
            averageRir: rirCount ? Math.round(rirTotal / rirCount * 10) / 10 : null,
            source: hasLogs ? 'logged' : 'profile'
        };
        result.maintenance = Math.round(baseline + walking + strength / 7 + cardio / 7);
        return result;
    }

    function calculateMaintenanceCalories() {
        return calculateEnergyExpenditure()?.maintenance || null;
    }

    // Mifflin-St Jeor BMR (before activity). This is the floor calories should
    // not drop below, so we expose it separately for the goal safety check.
    function getBMR() {
        const p = state.userProfile || {};
        const w = getLatestWeightKg();
        // Adult weight-planning equations are not used for younger members.
        if (!p.gender || !p.age || Number(p.age) < 18 || !p.heightCm || !w) return null;
        if (p.gender === 'male') {
            return Math.round(10 * w + 6.25 * p.heightCm - 5 * p.age + 5);
        }
        return Math.round(10 * w + 6.25 * p.heightCm - 5 * p.age - 161);
    }

    const AGGRESSIVE_DEFICIT_KCAL = 1000;
    const AGGRESSIVE_DEFICIT_DAYS = 56;
    const MAINTENANCE_BREAK_DAYS = 7;

    function dietSafetyState() {
        if (!state.dietSafety || typeof state.dietSafety !== 'object') state.dietSafety = {};
        return state.dietSafety;
    }

    function dietDateOffset(dateKey, days) {
        const [year, month, day] = String(dateKey).split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
    }

    function dietDaysBetween(start, end) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || ''))) return 0;
        return Math.round((Date.parse(end + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / 86400000);
    }

    // Reconcile on app open and when the current target is read. A full eight
    // weeks at a >=1000 kcal planned deficit starts a seven-local-day break.
    // A completed break leaves the goal at maintenance until the user chooses
    // another plan; changing a field cannot silently restart the cut.
    function reconcileDietSafety(todayKey) {
        const today = /^\d{4}-\d{2}-\d{2}$/.test(String(todayKey || '')) ? todayKey : localDateKey();
        const safety = dietSafetyState();
        const maintenance = calculateMaintenanceCalories() || Number(safety.lastMaintenance) || null;
        const bmr = getBMR();
        if (!maintenance) return { phase: 'unknown' };
        let changed = false, notice = '';
        safety.lastMaintenance = maintenance;
        if (safety.maintenanceUntil && today >= safety.maintenanceUntil) {
            safety.maintenanceStart = null;
            safety.maintenanceUntil = null;
            safety.aggressiveSince = null;
            state.goals.calories = maintenance;
            dietGoalState().mode = 'maintain';
            changed = true;
            notice = 'Your maintenance week is complete. You may choose a new deficit if you wish.';
        }
        if (safety.maintenanceUntil && today < safety.maintenanceUntil) {
            if (state.goals.calories !== maintenance) { state.goals.calories = maintenance; changed = true; }
            if (state.dietGoal?.mode !== 'maintain') { dietGoalState().mode = 'maintain'; changed = true; }
            if (changed) saveState();
            return { phase: 'maintenance', maintenance, until: safety.maintenanceUntil,
                daysLeft: dietDaysBetween(today, safety.maintenanceUntil) };
        }
        if (!bmr) {
            if (changed) saveState();
            if (notice) showToast(notice, 9000);
            return { phase: 'unknown' };
        }
        if (!safety.legacyGoalChecked) {
            safety.targetChosen = safety.targetChosen || Number(state.goals.calories) !== DEFAULT_STATE.goals.calories ||
                state.dietGoal?.mode === 'lose';
            safety.legacyGoalChecked = true;
            changed = true;
        }
        if (Number(state.goals.calories) < bmr) {
            state.goals.calories = bmr;
            changed = true;
        }
        const aggressive = safety.targetChosen && maintenance - Number(state.goals.calories) >= AGGRESSIVE_DEFICIT_KCAL;
        if (aggressive) {
            if (!safety.aggressiveSince || safety.aggressiveSince > today) {
                safety.aggressiveSince = today;
                changed = true;
            } else if (dietDaysBetween(safety.aggressiveSince, today) >= AGGRESSIVE_DEFICIT_DAYS) {
                safety.maintenanceStart = today;
                safety.maintenanceUntil = dietDateOffset(today, MAINTENANCE_BREAK_DAYS);
                safety.aggressiveSince = null;
                state.goals.calories = maintenance;
                dietGoalState().mode = 'maintain';
                changed = true;
                notice = `Eight weeks at a planned 1,000 kcal/day deficit: your goal is now maintenance (${maintenance.toLocaleString()} kcal) for seven days, until ${safety.maintenanceUntil}.`;
            }
        } else if (safety.aggressiveSince) {
            safety.aggressiveSince = null;
            changed = true;
        }
        if (changed) saveState();
        if (notice) showToast(notice, 9000);
        if (safety.maintenanceUntil) return { phase: 'maintenance', maintenance, until: safety.maintenanceUntil, daysLeft: 7 };
        return aggressive ? { phase: 'aggressive', maintenance, since: safety.aggressiveSince,
            days: dietDaysBetween(safety.aggressiveSince, today) } : { phase: 'regular', maintenance };
    }

    function setTrackedCalorieGoal(value, source) {
        const desired = Math.round(Number(value));
        const estimate = calculateEnergyExpenditure();
        if (!Number.isFinite(desired) || desired <= 0 || !estimate) {
            showToast('Complete About You and log a weight before changing your calorie target.');
            return false;
        }
        const safety = reconcileDietSafety();
        if (safety.phase === 'maintenance') {
            showToast(`Maintenance week: calorie goal stays at ${safety.maintenance.toLocaleString()} kcal until ${safety.until}.`, 7000);
            return false;
        }
        const target = Math.max(desired, estimate.bmr);
        if (target !== desired) showToast(`Goal raised to your estimated BMR floor of ${estimate.bmr.toLocaleString()} kcal.`, 7000);
        state.goals.calories = target;
        if (source === 'manual') dietGoalState().mode = '';
        const safetyState = dietSafetyState();
        safetyState.targetChosen = true;
        safetyState.legacyGoalChecked = true;
        if (estimate.maintenance - target >= AGGRESSIVE_DEFICIT_KCAL) {
            if (!safetyState.aggressiveSince) safetyState.aggressiveSince = localDateKey();
        } else safetyState.aggressiveSince = null;
        saveState();
        return true;
    }

    function renderDietSafetyStatus() {
        const status = reconcileDietSafety();
        const elements = [document.getElementById('deficit-safety-status'), document.getElementById('deficit-diary-status')];
        let message = '';
        if (status.phase === 'maintenance') {
            message = `Maintenance week: ${status.maintenance.toLocaleString()} kcal/day until ${status.until} (${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left). Aggressive dieting is unavailable during this week; afterwards you can choose it again.`;
        } else if (status.phase === 'aggressive') {
            message = `Aggressive deficit: day ${status.days + 1} of 56. After eight weeks, VFIT will set one week at maintenance. This counter starts when VFIT first records this goal.`;
        }
        elements.forEach(element => { if (element) { element.textContent = message; element.classList.toggle('hidden', !message); } });
        return status;
    }

    // ==========================================================================
    // BODY FAT % — US Navy circumference method (estimate)
    // ==========================================================================
    // Uses height + neck + waist (+ hips/glutes for women). Validated tape-measure
    // method, good for tracking trends. Returns null if inputs are missing.
    // Formulas (metric, cm):
    //   Men:   BF% = 495 / (1.0324 − 0.19077·log10(waist−neck) + 0.15456·log10(height)) − 450
    //   Women: BF% = 495 / (1.29579 − 0.35004·log10(waist+hip−neck) + 0.22100·log10(height)) − 450
    function calculateBodyFat(entryOverride) {
        const p = state.userProfile || {};
        const gender = p.gender;
        const height = p.heightCm;
        if (!gender || !height) return null;

        // Use the latest measurement entry (or a provided one for history rows)
        const entry = entryOverride || latestMetricEntry();
        if (!entry) return null;

        const neck = entry.neck;
        const waist = entry.waist;
        const hip = entry.glutes; // glutes measurement stands in for hips
        if (!neck || !waist) return null;

        let bf;
        if (gender === 'male') {
            const denom = 1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height);
            bf = 495 / denom - 450;
        } else {
            if (!hip) return null; // women's formula needs hips
            const denom = 1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height);
            bf = 495 / denom - 450;
        }

        // Guard against nonsensical outputs from bad measurements
        if (!isFinite(bf) || bf < 2 || bf > 60) return null;
        return Math.round(bf * 10) / 10;
    }

    function latestMetricEntry() {
        const h = (state.metricsHistory || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return h[0] || null;
    }

    // Body-fat category for context (rough ACE ranges, gender-aware)
    function bodyFatCategory(bf) {
        const gender = (state.userProfile || {}).gender;
        if (gender === 'female') {
            if (bf < 14) return { label: 'Essential', color: 'text-blue-600' };
            if (bf < 21) return { label: 'Athletic', color: 'text-emerald-600' };
            if (bf < 25) return { label: 'Fitness', color: 'text-emerald-600' };
            if (bf < 32) return { label: 'Average', color: 'text-amber-600' };
            return { label: 'Above average', color: 'text-rose-600' };
        }
        if (bf < 6) return { label: 'Essential', color: 'text-blue-600' };
        if (bf < 14) return { label: 'Athletic', color: 'text-emerald-600' };
        if (bf < 18) return { label: 'Fitness', color: 'text-emerald-600' };
        if (bf < 25) return { label: 'Average', color: 'text-amber-600' };
        return { label: 'Above average', color: 'text-rose-600' };
    }

    function renderBodyFatDisplay() {
        const card = document.getElementById('bodyfat-display');
        if (!card) return;
        const bf = calculateBodyFat();

        if (bf == null) {
            card.classList.add('hidden');
            return;
        }
        card.classList.remove('hidden');
        document.getElementById('bodyfat-value').textContent = bf;
        const cat = bodyFatCategory(bf);
        const catEl = document.getElementById('bodyfat-category');
        catEl.textContent = '(' + cat.label + ')';
        catEl.className = 'text-xs font-bold ml-2 ' + cat.color;
    }
    function dietGoalState() {
        if (!state.dietGoal) state.dietGoal = JSON.parse(JSON.stringify(DEFAULT_STATE.dietGoal));
        return state.dietGoal;
    }

    function renderDietGoal() {
        const g = dietGoalState();
        renderDietSafetyStatus();
        // Highlight the selected mode button
        ['lose', 'maintain', 'gain'].forEach(m => {
            const btn = document.getElementById('goal-btn-' + m);
            if (!btn) return;
            const active = { lose: 'bg-rose-500 text-white', maintain: 'bg-indigo-500 text-white', gain: 'bg-emerald-500 text-white' }[m];
            btn.className = 'py-3 rounded-xl text-xs font-black ' + (g.mode === m ? active : 'bg-slate-100 text-slate-400');
        });
        const loseOpts = document.getElementById('goal-lose-options');
        const gainOpts = document.getElementById('goal-gain-options');
        if (loseOpts) loseOpts.classList.toggle('hidden', g.mode !== 'lose');
        if (gainOpts) gainOpts.classList.toggle('hidden', g.mode !== 'gain');

        // Restore inputs
        const rateInput = document.getElementById('goal-rate-input');
        if (rateInput) rateInput.value = g.rate || '';
        ['lbs', 'kg'].forEach(u => {
            const b = document.getElementById('rate-unit-' + u);
            if (b) b.className = 'px-3 rounded-lg text-xs font-black ' + (g.rateUnit === u ? 'bg-white shadow text-emerald-600' : 'text-slate-400');
        });
        const gainSel = document.getElementById('goal-gain-rate');
        if (gainSel) gainSel.value = String(g.gainRate || 250);

        recalcGoalCalories();
    }

    function setDietGoal(mode) {
        if (mode === 'lose' && reconcileDietSafety().phase === 'maintenance') {
            showToast('The maintenance week must finish before a deficit can be selected.', 7000);
            renderDietGoal();
            return;
        }
        dietGoalState().mode = mode;
        saveState();
        renderDietGoal();
    }
    function setRateUnit(unit) {
        dietGoalState().rateUnit = unit;
        saveState();
        renderDietGoal();
    }

    // The core calculation, with the deficit maths and BMR safety stop.
    function recalcGoalCalories() {
        const g = dietGoalState();
        // Pull the latest typed values into state first
        const rateInput = document.getElementById('goal-rate-input');
        if (rateInput && g.mode === 'lose') g.rate = parseFloat(rateInput.value) || 0;
        const gainSel = document.getElementById('goal-gain-rate');
        if (gainSel && g.mode === 'gain') g.gainRate = parseInt(gainSel.value) || 250;

        const result = document.getElementById('goal-result');
        const warning = document.getElementById('goal-bmr-warning');
        const applyBtn = document.getElementById('goal-apply-btn');
        if (!result) return;

        const safety = renderDietSafetyStatus();
        const maintenance = calculateMaintenanceCalories();
        const bmr = getBMR();

        // Can't calculate without the profile + weight
        if (!maintenance || !bmr || !g.mode) {
            result.classList.add('hidden');
            if (warning) warning.classList.add('hidden');
            if (applyBtn) applyBtn.classList.add('hidden');
            return;
        }

        let target, note = '', belowFloor = false;

        if (g.mode === 'maintain') {
            target = maintenance;
            note = 'Eating at maintenance to hold your current weight.';
        } else if (g.mode === 'gain') {
            const surplus = parseInt(g.gainRate) || 250;
            target = maintenance + surplus;
            note = `Maintenance (${maintenance.toLocaleString()}) + ${surplus} surplus for muscle gain.`;
        } else if (g.mode === 'lose') {
            const rate = parseFloat(g.rate) || 0;
            // 500 kcal/day deficit per lb/week; 1000 kcal/day per kg/week
            const perUnit = g.rateUnit === 'kg' ? 1000 : 500;
            const dailyDeficit = Math.round(rate * perUnit);
            const requestedTarget = maintenance - dailyDeficit;
            target = Math.max(requestedTarget, bmr);
            belowFloor = requestedTarget < bmr;
            const unitLabel = g.rateUnit === 'kg' ? 'kg' : 'lbs';
            note = `Estimated TDEE (${maintenance.toLocaleString()}) − ${dailyDeficit.toLocaleString()} requested deficit to lose ~${rate}${unitLabel}/week.${belowFloor ? ' Capped at estimated BMR.' : ''}`;
        }

        if (safety.phase === 'maintenance') {
            target = maintenance;
            note = `Maintenance week until ${safety.until}. A deficit can be chosen again afterwards.`;
        }

        // Show the result
        result.classList.remove('hidden');
        document.getElementById('goal-target-cals').textContent = target.toLocaleString();
        document.getElementById('goal-target-note').textContent = note;

        if (belowFloor && safety.phase !== 'maintenance') {
            warning.classList.remove('hidden');
            document.getElementById('goal-bmr-text').textContent =
                `Requested target is below your estimated BMR (${bmr.toLocaleString()} kcal). VFIT raised it to ${target.toLocaleString()} kcal. BMR is an estimate, not a guarantee of adequate fuelling.`;
        } else {
            if (warning) warning.classList.add('hidden');
        }
        if (applyBtn) applyBtn.classList.toggle('hidden', safety.phase === 'maintenance');
        window._pendingGoalTarget = target;
    }

    function applyGoalCalories() {
        const target = window._pendingGoalTarget;
        if (!target) return;
        if (!setTrackedCalorieGoal(target, 'goal')) return;
        // Reflect in the calorie goal input + maintenance note
        const input = document.getElementById('calorie-goal-input');
        if (input) input.value = state.goals.calories;
        renderMaintenanceDisplay();
        renderDietSafetyStatus();
        renderDashboard();
        showToast(`Calorie goal set to ${state.goals.calories.toLocaleString()} kcal 🎯`);
    }

    function getLatestWeightKg() {
        const history = (state.metricsHistory || []).filter(m => m.weight);
        if (history.length === 0) return null;
        // metricsHistory is sorted desc by date, but be defensive
        const sorted = history.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return sorted[0].weight;
    }

    /**
     * BMI = weight(kg) / height(m)^2
     */
    function calculateBMI() {
        const weight = getLatestWeightKg();
        const heightCm = state.userProfile && state.userProfile.heightCm;
        if (!weight || !heightCm) return null;
        const heightM = heightCm / 100;
        return weight / (heightM * heightM);
    }

    function getBMICategory(bmi) {
        if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-600' };
        if (bmi < 25) return { label: 'Healthy', color: 'text-emerald-600' };
        if (bmi < 30) return { label: 'Overweight', color: 'text-amber-600' };
        return { label: 'Obese', color: 'text-rose-600' };
    }

    function renderMaintenanceDisplay() {
        const display = document.getElementById('maintenance-display');
        if (!display) return;

        const estimate = calculateEnergyExpenditure();
        const maintenance = estimate?.maintenance || null;
        const bmi = calculateBMI();

        if (!maintenance && !bmi) {
            display.classList.add('hidden');
            return;
        }
        display.classList.remove('hidden');

        if (maintenance) {
            document.getElementById('maintenance-value').textContent = maintenance.toLocaleString();
            const weight = getLatestWeightKg();
            const p = state.userProfile;
            document.getElementById('maintenance-explanation').textContent =
                `Estimated TDEE using ${weight} kg, ${p.heightCm} cm, ${p.age}y, ${p.gender}. ${estimate.source === 'profile' ? 'No recent activity logs: profile activity is the fallback.' : 'Recent complete days: logged steps and exercise are included.'}`;
            const stepDetail = estimate.stepDays
                ? `walking +${estimate.walking.toLocaleString()} (${estimate.averageSteps.toLocaleString()} steps/day across ${estimate.stepDays} logged day${estimate.stepDays === 1 ? '' : 's'})`
                : 'walking unavailable (no saved steps)';
            document.getElementById('energy-breakdown').textContent = estimate.source === 'logged'
                ? `BMR ${estimate.bmr.toLocaleString()} · base ${estimate.baseline.toLocaleString()} · ${stepDetail} · strength +${estimate.strength.toLocaleString()}${estimate.averageRir === null ? '' : ` (average RIR ${estimate.averageRir})`} · cardio +${estimate.cardio.toLocaleString()} kcal/day. Seven completed days; exercise and steps are estimates.`
                : `Estimated BMR ${estimate.bmr.toLocaleString()} kcal/day × profile activity. Add steps and workouts to personalise this estimate.`;
        } else {
            document.getElementById('maintenance-value').textContent = '--';
            document.getElementById('maintenance-explanation').textContent =
                'For adults 18+: fill in About You and log a weight in Metrics to calculate.';
            document.getElementById('energy-breakdown').textContent = '';
        }
        renderDietSafetyStatus();

        // BMI section
        const bmiSection = document.getElementById('bmi-display');
        if (bmi) {
            bmiSection.classList.remove('hidden');
            document.getElementById('bmi-value').textContent = bmi.toFixed(1);
            const cat = getBMICategory(bmi);
            const catEl = document.getElementById('bmi-category');
            catEl.textContent = '(' + cat.label + ')';
            catEl.className = 'text-xs font-bold ml-2 ' + cat.color;
        } else {
            bmiSection.classList.add('hidden');
        }
    }

    /**
     * Apply maintenance calories as the daily calorie goal, possibly adjusted for an active goal.
     */
    function applyMaintenanceAsCalorieGoal() {
        const maintenance = calculateMaintenanceCalories();
        if (!maintenance) {
            showToast('Complete your profile first');
            return;
        }

        // If there's an active weight-loss or muscle-gain goal, adjust automatically.
        const activeGoal = (state.userGoals || []).find(g => !g.completed && (g.focus === 'weight_loss' || g.focus === 'muscle_gain'));
        let target = maintenance;
        let note = `Calorie goal set to maintenance: ${maintenance} kcal/day`;

        if (activeGoal) {
            const adj = calculateGoalCalorieAdjustment(activeGoal, maintenance);
            target = adj.target;
            note = adj.note;
        }

        if (!setTrackedCalorieGoal(target, 'goal')) return;
        document.getElementById('calorie-goal-input').value = state.goals.calories;

        const noteEl = document.getElementById('goal-adjusted-note');
        if (noteEl) {
            noteEl.textContent = '✓ ' + note;
            noteEl.classList.remove('hidden');
            setTimeout(() => noteEl.classList.add('hidden'), 6000);
        }
        renderDashboard();
        showToast(note);
    }

    /**
     * Given a goal and maintenance calories, return { target, note }.
     * Caps deficits at 750 kcal/day and surpluses at 500 kcal/day for safety.
     */
    function calculateGoalCalorieAdjustment(goal, maintenance) {
        if (goal.focus === 'weight_loss' && goal.details) {
            const kg = parseFloat(goal.details.kg);
            const weeks = parseFloat(goal.details.weeks);
            if (kg > 0 && weeks > 0) {
                // ~7700 kcal per kg of fat. Daily deficit:
                let deficit = Math.round((kg * 7700) / (weeks * 7));
                // Cap based on style — "toned" = more conservative deficit to preserve muscle
                const maxDeficit = goal.details.style === 'toned' ? 500 : 750;
                if (deficit > maxDeficit) {
                    deficit = maxDeficit;
                    const target = Math.max(getBMR() || 0, maintenance - deficit);
                    return {
                        target,
                        note: `Requested deficit capped at ${maxDeficit} kcal/day${target > maintenance - deficit ? ' and target raised to estimated BMR' : ''}; your timeframe may need to be longer.`
                    };
                }
                const target = Math.max(getBMR() || 0, maintenance - deficit);
                return {
                    target,
                    note: `Requested deficit: ${deficit} kcal/day for ${kg}kg in ${weeks}w → ${target} kcal target${target > maintenance - deficit ? ' (BMR floor)' : ''}.`
                };
            }
        }

        if (goal.focus === 'muscle_gain' && goal.details) {
            const physique = goal.details.physique;
            const exp = getExperienceLevel();
            // Skinny + beginner = bigger surplus; advanced bodybuilder = smaller surplus
            let surplus = 300;
            if (physique === 'skinny') surplus = 400;
            else if (physique === 'overweight') surplus = 150;
            else if (physique === 'bodybuilder' || physique === 'athletic') surplus = 200;

            if (exp === 'Advanced') surplus = Math.min(surplus, 250);
            else if (exp === 'Beginner') surplus = Math.min(surplus + 100, 500);

            return {
                target: maintenance + surplus,
                note: `Surplus: +${surplus} kcal/day → ${maintenance + surplus} kcal target.`
            };
        }

        // Health goal or unknown — stay at maintenance
        return {
            target: maintenance,
            note: `Maintenance: ${maintenance} kcal/day.`
        };
    }

    // ==========================================================================
    // GOAL MODAL (focus-driven)
    // ==========================================================================

    let currentGoalFocus = null;
    let currentMuscleGainScope = '';
    let selectedGoalMuscles = [];

    function openGoalSetting() {
        currentGoalFocus = null;
        currentMuscleGainScope = '';
        selectedGoalMuscles = [];
        document.getElementById('goal-description').value = '';
        document.getElementById('goal-deadline').value = '';

        // Reset focus buttons
        ['weight_loss', 'muscle_gain', 'health', 'strength', 'healthy_eating', 'activity'].forEach(f => {
            const btn = document.getElementById('focus-' + f);
            if (btn) btn.className = 'p-3 rounded-xl font-bold text-xs bg-slate-100 text-slate-600 hover:bg-slate-200';
            const fields = document.getElementById('focus-fields-' + f);
            if (fields) fields.classList.add('hidden');
        });

        // Reset all follow-up fields
        ['wl-kg', 'wl-weeks', 'wl-style', 'wl-photos',
         'mg-physique', 'mg-target-kg', 'strength-exercise', 'strength-target-kg',
         'healthy-eating-target', 'activity-target', 'h-area', 'h-reason'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('activity-unit').value = 'steps/day';
        setMuscleGainScope('', { preview: false });
        renderGoalMuscleSelection();

        document.getElementById('goal-recommendation').classList.add('hidden');
        document.getElementById('goal-modal').style.display = 'flex';
    }

    function closeGoalModal() {
        document.getElementById('goal-modal').style.display = 'none';
    }

    function setMuscleGainScope(scope, options) {
        const config = options || {};
        currentMuscleGainScope = scope === 'general' || scope === 'specific' ? scope : '';
        if (currentMuscleGainScope !== 'specific') selectedGoalMuscles = [];
        ['general', 'specific'].forEach(value => {
            const button = document.getElementById('mg-scope-' + value);
            if (!button) return;
            const selected = value === currentMuscleGainScope;
            button.className = selected
                ? 'p-3 rounded-xl font-bold text-xs bg-indigo-600 text-white shadow-md'
                : 'p-3 rounded-xl font-bold text-xs bg-slate-100 text-slate-600';
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        const areas = document.getElementById('mg-specific-areas');
        if (areas) areas.classList.toggle('hidden', currentMuscleGainScope !== 'specific');
        renderGoalMuscleSelection();
        if (config.preview !== false) previewGoalRecommendation();
    }

    function toggleGoalMuscle(muscle) {
        if (!SPECIFIC_MUSCLES.includes(muscle)) return;
        if (selectedGoalMuscles.includes(muscle)) {
            selectedGoalMuscles = selectedGoalMuscles.filter(item => item !== muscle);
        } else {
            selectedGoalMuscles.push(muscle);
        }
        renderGoalMuscleSelection();
        previewGoalRecommendation();
    }

    function renderGoalMuscleSelection() {
        document.querySelectorAll('[data-goal-muscle]').forEach(button => {
            const selected = selectedGoalMuscles.includes(button.dataset.goalMuscle);
            button.className = selected
                ? 'p-2.5 rounded-xl border-2 border-indigo-600 bg-indigo-600 text-white text-xs font-bold'
                : 'p-2.5 rounded-xl border-2 border-slate-200 text-xs font-bold';
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        const count = document.getElementById('mg-specific-count');
        if (count) count.textContent = selectedGoalMuscles.length
            ? `${selectedGoalMuscles.length} priorit${selectedGoalMuscles.length === 1 ? 'y area' : 'y areas'} selected · target 12–20 weekly sets each.`
            : 'Choose at least one area.';
    }

    function setGoalFocus(focus) {
        currentGoalFocus = focus;

        // Update button styles
        ['weight_loss', 'muscle_gain', 'health', 'strength', 'healthy_eating', 'activity'].forEach(f => {
            const btn = document.getElementById('focus-' + f);
            if (!btn) return;
            if (f === focus) {
                btn.className = 'p-3 rounded-xl font-bold text-xs bg-indigo-600 text-white shadow-md';
            } else {
                btn.className = 'p-3 rounded-xl font-bold text-xs bg-slate-100 text-slate-600 hover:bg-slate-200';
            }
            // Toggle field visibility
            const fields = document.getElementById('focus-fields-' + f);
            if (fields) fields.classList.toggle('hidden', f !== focus);
        });

        previewGoalRecommendation();

        // Wire up follow-up inputs to live-preview
        ['wl-kg', 'wl-weeks', 'wl-style', 'wl-photos',
         'mg-physique',
         'h-area'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onchange = previewGoalRecommendation;
        });
    }

    /**
     * Build the goal details object from the visible fields.
     */
    function collectGoalDetails() {
        if (currentGoalFocus === 'weight_loss') {
            return {
                kg: parseFloat(document.getElementById('wl-kg').value) || null,
                weeks: parseFloat(document.getElementById('wl-weeks').value) || null,
                style: document.getElementById('wl-style').value || '',
                photosFrequency: document.getElementById('wl-photos').value || ''
            };
        }
        if (currentGoalFocus === 'muscle_gain') {
            return {
                scope: currentMuscleGainScope,
                muscles: currentMuscleGainScope === 'specific' ? selectedGoalMuscles.slice() : [],
                priority: currentMuscleGainScope === 'general' ? 'full' : selectedGoalMuscles.join(', '),
                weeklySetMin: 12,
                weeklySetMax: currentMuscleGainScope === 'specific' ? 20 : 16,
                physique: document.getElementById('mg-physique').value || '',
                targetKg: Number(document.getElementById('mg-target-kg').value) || null,
                experience: getExperienceLevel() || 'Unknown'
            };
        }
        if (currentGoalFocus === 'strength') {
            return {
                exercise: document.getElementById('strength-exercise').value.trim(),
                targetKg: Number(document.getElementById('strength-target-kg').value) || null
            };
        }
        if (currentGoalFocus === 'healthy_eating') {
            return { targetDays: Number(document.getElementById('healthy-eating-target').value) || null };
        }
        if (currentGoalFocus === 'activity') {
            return {
                unit: document.getElementById('activity-unit').value === 'min/week' ? 'min/week' : 'steps/day',
                targetValue: Number(document.getElementById('activity-target').value) || null
            };
        }
        if (currentGoalFocus === 'health') {
            return {
                area: document.getElementById('h-area').value || '',
                reason: document.getElementById('h-reason').value.trim()
            };
        }
        return {};
    }

    /**
     * Live preview the calorie / training recommendation as the user fills the form.
     */
    function previewGoalRecommendation() {
        const recBox = document.getElementById('goal-recommendation');
        const recContent = document.getElementById('goal-rec-content');
        if (!recBox || !recContent || !currentGoalFocus) return;

        const maintenance = calculateMaintenanceCalories();
        const details = collectGoalDetails();
        const draftGoal = { focus: currentGoalFocus, details };

        const lines = [];

        if (currentGoalFocus === 'weight_loss') {
            if (details.kg && details.weeks) {
                if (maintenance) {
                    const adj = calculateGoalCalorieAdjustment(draftGoal, maintenance);
                    lines.push(`📉 <b>${adj.target} kcal/day</b> (${maintenance} maintenance − deficit)`);
                    lines.push(`<span class="text-slate-500">${adj.note}</span>`);
                    if ((details.kg / details.weeks) > 1) {
                        lines.push('⚠️ <span class="text-amber-700">Losing more than 1kg/week is hard to sustain and may cost muscle.</span>');
                    }
                } else {
                    lines.push(`Complete your profile (gender, age, height, activity) + log a weight to see a calorie target.`);
                }
                if (details.style === 'toned') {
                    lines.push('💪 Keep resistance training 3-4×/week and protein at ~1.6-2.2 g/kg bodyweight.');
                }
            }
            if (details.photosFrequency) {
                const label = { daily: 'daily', weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', none: 'no photos' }[details.photosFrequency];
                lines.push(`📸 Progress photos: ${label}.`);
            }
        } else if (currentGoalFocus === 'muscle_gain') {
            if (details.physique && maintenance) {
                const adj = calculateGoalCalorieAdjustment(draftGoal, maintenance);
                lines.push(`📈 <b>${adj.target} kcal/day</b> (${maintenance} maintenance + surplus)`);
                lines.push(`<span class="text-slate-500">${adj.note}</span>`);
            }
            if (details.experience && details.experience !== 'Unknown') {
                const tips = {
                    Beginner: 'Start with two simple full-body sessions each week. Practise the movements and log your reps and weight.',
                    Intermediate: 'Run a structured 4-5 day split. Track progressive overload week by week.',
                    Advanced: 'Specialization phases and periodization matter more than total volume now.'
                };
                lines.push('🎓 <b>' + details.experience + ':</b> ' + tips[details.experience]);
            }
            if (details.scope === 'general') {
                lines.push('🎯 <b>Full-body focus:</b> aim for 12–16 quality working sets per muscle group each week.');
            } else if (details.scope === 'specific' && details.muscles.length) {
                lines.push(`🎯 <b>Priority areas:</b> ${escapeHtml(details.muscles.join(', '))}. Aim for 12–20 quality working sets per selected area each week.`);
            } else {
                lines.push('Choose full-body development or the specific areas you want to prioritise.');
            }
        } else if (currentGoalFocus === 'health') {
            if (details.area === 'bmi') {
                const bmi = calculateBMI();
                if (bmi) {
                    const cat = getBMICategory(bmi);
                    lines.push(`📊 Current BMI: <b>${bmi.toFixed(1)}</b> (${cat.label}). Healthy range is 18.5-24.9.`);
                }
            }
            if (details.area === 'cardio') {
                lines.push('❤️ Aim for 150 min moderate or 75 min vigorous cardio per week (WHO recommendation).');
            }
            if (details.area === 'sleep') {
                lines.push('😴 Target 7-9 hours nightly. Avoid caffeine after 2pm and screens 30 min before bed.');
            }
            if (details.area === 'mobility') {
                lines.push('🤸 5-10 min of dynamic stretching daily; consider 1-2 dedicated mobility sessions/week.');
            }
            if (maintenance) {
                lines.push(`🍽️ Aim for maintenance: <b>${maintenance} kcal/day</b>.`);
            }
        }

        if (lines.length > 0) {
            recContent.innerHTML = lines.map(l => '<p>' + l + '</p>').join('');
            recBox.classList.remove('hidden');
        } else {
            recBox.classList.add('hidden');
        }
    }

    function saveGoal() {
        if (!currentGoalFocus) { showToast('Pick a focus first'); return; }

        const optionalNumberFields = ['wl-kg', 'mg-target-kg', 'strength-target-kg', 'healthy-eating-target', 'activity-target'];
        const fieldForFocus = {
            weight_loss: 'wl-kg', muscle_gain: 'mg-target-kg', strength: 'strength-target-kg',
            healthy_eating: 'healthy-eating-target', activity: 'activity-target'
        }[currentGoalFocus];
        if (fieldForFocus && optionalNumberFields.includes(fieldForFocus)) {
            const field = document.getElementById(fieldForFocus);
            if (field.value.trim() && (!field.checkValidity() || !Number.isFinite(Number(field.value)) || Number(field.value) <= 0)) {
                showToast('Enter a valid positive target'); field.focus(); return;
            }
        }

        if (currentGoalFocus === 'muscle_gain' && !currentMuscleGainScope) {
            showToast('Choose full body or specific areas');
            return;
        }
        if (currentGoalFocus === 'muscle_gain' && currentMuscleGainScope === 'specific' && selectedGoalMuscles.length === 0) {
            showToast('Choose at least one priority area');
            return;
        }

        const desc = document.getElementById('goal-description').value.trim();
        const deadline = document.getElementById('goal-deadline').value;
        if (!desc) { showToast('Enter goal description'); return; }
        if (deadline && deadline < localDateKey()) { showToast('Choose a future target date'); return; }

        if (!state.userGoals) state.userGoals = [];
        const newGoal = {
            id: Date.now(),
            focus: currentGoalFocus,
            details: collectGoalDetails(),
            description: desc,
            deadline: deadline,
            createdAt: new Date().toISOString(),
            completed: false,
            progressEntries: [],
            deletedProgressEntryIds: []
        };
        state.userGoals.unshift(newGoal);

        // Auto-adjust calorie goal if we have enough info
        const maintenance = calculateMaintenanceCalories();
        if (maintenance && (currentGoalFocus === 'weight_loss' || currentGoalFocus === 'muscle_gain')) {
            const adj = calculateGoalCalorieAdjustment(newGoal, maintenance);
            if (setTrackedCalorieGoal(adj.target, 'goal')) showToast('Goal saved! Calorie target → ' + state.goals.calories);
            else showToast('Goal saved. Calorie target remains at maintenance for this week.');
        } else {
            showToast('Goal added! 🎯');
        }

        saveState();
        closeGoalModal();
        renderSettings();
        renderGoalVolumeSummary();
        renderDashboard();
        openGoalProgress(newGoal.id);
    }
