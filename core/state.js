    // ==========================================================================
    // APP FOUNDATION — versioning, safe rendering and resilient UI helpers
    // ==========================================================================
    const VFIT_APP_VERSION = '2.1.0-beta.9';
    const VFIT_STATE_SCHEMA_VERSION = 8;
    const VALID_TAB_IDS = new Set(['dashboard', 'coaching', 'profile', 'training', 'nutrition', 'logs', 'metrics', 'settings']);
    const RUNTIME_CONFIG = Object.freeze(Object.assign({
        functionsRegion: 'europe-west2',
        appCheckSiteKey: '',
        fcmVapidKey: '',
        paymentsEnabled: false,
        pushEnabled: false,
        privacyVersion: '2026-09-14'
    }, window.VFIT_CONFIG || {}));
    const LEGACY_STATE_KEY = 'fittrack_state';
    const STATE_KEY_PREFIX = 'vfit_state_v2:';
    const STATE_BACKUP_PREFIX = 'vfit_state_backup_v2:';
    const LEGACY_MIGRATION_KEY = 'vfit_legacy_state_migrated_uid';

    let iconRefreshPending = false;
    let accessibilityRefreshPending = false;
    let networkStatusTimer = null;
    let missingChartNoticeShown = false;

    /** Device-local YYYY-MM-DD key used before state is initialised. */
    function localDateKey(value) {
        const date = value instanceof Date ? value : new Date(value || Date.now());
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    /** Batch Lucide's expensive full-document scan and tolerate first-load offline mode. */
    function refreshIcons() {
        if (iconRefreshPending) return;
        iconRefreshPending = true;
        const schedule = window.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        schedule(() => {
            iconRefreshPending = false;
            try {
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            } catch (error) {
                console.warn('Icon refresh skipped:', error);
            }
        });
    }

    function escapeJsString(value) {
        return String(value == null ? '' : value)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\x22')
            .replace(/</g, '\\x3C')
            .replace(/>/g, '\\x3E')
            .replace(/&/g, '\\x26')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    }

    function safeJsonForInline(value) {
        const json = JSON.stringify(value);
        if (json === undefined) return 'null';
        return json
            .replace(/&/g, '\\u0026')
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/'/g, '\\u0027');
    }

    /** Allow only image schemes browsers can display safely in this app. */
    function safeImageUrl(value) {
        if (!value) return '';
        const raw = String(value).trim();
        if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(raw)) return raw;
        if (/^blob:/i.test(raw)) return raw;
        try {
            const url = new URL(raw, window.location.href);
            return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function safeInvoke(label, callback) {
        try {
            return callback();
        } catch (error) {
            console.error(label + ' failed:', error);
            showToast('That screen hit a problem. Your saved data is safe.', 5000);
            return undefined;
        }
    }

    function chartLibraryReady(canvas) {
        if (typeof window.Chart === 'function') return true;
        if (canvas) canvas.setAttribute('aria-label', 'Chart unavailable until the app has loaded once while online');
        if (!missingChartNoticeShown) {
            missingChartNoticeShown = true;
            showToast('Charts will be available after VFIT loads once while online', 6000);
        }
        return false;
    }

    /** Add safe defaults to static and dynamically-rendered controls. */
    function ensureAccessibleDom(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('button:not([type])').forEach(button => { button.type = 'button'; });
        scope.querySelectorAll('img:not([alt])').forEach(img => { img.alt = ''; });
        scope.querySelectorAll('img').forEach(img => {
            if (!img.hasAttribute('decoding')) img.decoding = 'async';
        });
        scope.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            if (!modal.hasAttribute('aria-label') && !modal.hasAttribute('aria-labelledby')) {
                const heading = modal.querySelector('h1, h2, h3');
                if (heading) {
                    if (!heading.id) heading.id = `${modal.id || 'vfit-modal'}-title`;
                    modal.setAttribute('aria-labelledby', heading.id);
                } else {
                    modal.setAttribute('aria-label', 'VFIT dialog');
                }
            }
        });
        scope.querySelectorAll('input:not([aria-label]):not([aria-labelledby]), select:not([aria-label]):not([aria-labelledby]), textarea:not([aria-label]):not([aria-labelledby])').forEach(control => {
            if (control.labels && control.labels.length > 0) return;
            const label = control.getAttribute('placeholder') || control.id.replace(/[-_]/g, ' ') || 'Input';
            control.setAttribute('aria-label', label);
        });
        scope.querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(textarea)').forEach(control => {
            if (!control.hasAttribute('role')) control.setAttribute('role', 'button');
            if (!control.hasAttribute('tabindex')) control.tabIndex = 0;
            if (control.dataset.keyboardClick === 'true') return;
            control.dataset.keyboardClick = 'true';
            control.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    control.click();
                }
            });
        });
    }

    function scheduleAccessibleDomRefresh() {
        if (accessibilityRefreshPending) return;
        accessibilityRefreshPending = true;
        const schedule = window.requestIdleCallback || ((fn) => setTimeout(fn, 80));
        schedule(() => {
            accessibilityRefreshPending = false;
            ensureAccessibleDom(document);
        }, { timeout: 500 });
    }

    function updateNetworkStatus(announceOnline) {
        const banner = document.getElementById('network-status');
        if (!banner) return;
        clearTimeout(networkStatusTimer);
        if (navigator.onLine) {
            banner.textContent = 'Back online — syncing saved changes';
            banner.className = 'bg-emerald-500 text-black px-4 py-2 rounded-full text-xs font-black shadow-xl';
            if (announceOnline) {
                networkStatusTimer = setTimeout(() => banner.classList.add('hidden'), 3000);
            } else {
                banner.classList.add('hidden');
            }
        } else {
            banner.textContent = 'Offline — changes are saved on this device';
            banner.className = 'bg-amber-500 text-black px-4 py-2 rounded-full text-xs font-black shadow-xl';
        }
        updateDataSyncStatus();
    }

    // ==========================================================================
    // FIREBASE CONFIGURATION
    // ==========================================================================
    const firebaseConfig = {
        apiKey: "AIzaSyA9H9hmvfrQmc2wIwnS2jCPLgdmXBquQXM",
        authDomain: "vfit-app-pro.firebaseapp.com",
        projectId: "vfit-app-pro",
        storageBucket: "vfit-app-pro.firebasestorage.app",
        messagingSenderId: "815730068689",
        appId: "1:815730068689:web:0c6587d7dbe62b0f3c09f0",
        measurementId: "G-74L12X0NE8"
    };

    const firebaseApp = firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let functionsApi = null;
    let messagingApi = null;
    let appCheckReady = false;
    let foregroundMessagingBound = false;
    let accountMembership = { tier: 'free', status: 'inactive' };

    if (typeof firebase.functions === 'function') {
        try { functionsApi = firebase.functions(RUNTIME_CONFIG.functionsRegion); }
        catch (error) { console.warn('Cloud actions unavailable:', error); }
    }

    if (RUNTIME_CONFIG.appCheckSiteKey && typeof firebase.appCheck === 'function') {
        try {
            const provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(RUNTIME_CONFIG.appCheckSiteKey);
            firebase.appCheck().activate(provider, true);
            appCheckReady = true;
        } catch (error) {
            console.warn('Firebase App Check is not ready:', error);
        }
    }

    function getBackendCallable(name) {
        if (!functionsApi || typeof functionsApi.httpsCallable !== 'function') return null;
        try { return functionsApi.httpsCallable(name); }
        catch (error) { return null; }
    }

    // Make sign-in survive an Android browser/app restart. Firebase defaults to
    // local persistence on web, but setting it explicitly avoids inherited
    // session-only behaviour from an earlier build.
    const authPersistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(error => console.warn('Could not enable persistent sign-in:', error));

    // ==========================================================================
    // USDA FOODDATA CENTRAL API KEY
    // ==========================================================================
    // Get your own free key at: https://fdc.nal.usda.gov/api-key-signup.html
    // It arrives by email instantly. Paste it between the quotes below,
    // replacing DEMO_KEY. The DEMO_KEY works but is heavily rate-limited
    // (shared across everyone), so food search may intermittently fail until
    // you add your own key.
    const USDA_API_KEY = "DEMO_KEY";

    let currentUser = null;
    let firebaseUserData = {};
    let currentUserRole = 'member'; // resolved each login from the coach-email allowlist
    let currentUserIsOwner = false; // resolved from the private admins/{uid} record
    let viewingClientData = null;
    let authSessionGeneration = 0;

    function isOwner() {
        return Boolean(currentUser && currentUserIsOwner);
    }

    // Owner access is keyed to Firebase Auth UID instead of an email address.
    // The admins record is created server-side and cannot be changed by clients.
    async function resolveOwnerAccess(user) {
        if (!user) return false;
        try {
            const doc = await db.collection('admins').doc(user.uid).get();
            const allowed = doc.exists && doc.data()?.active === true;
            if (currentUser && currentUser.uid === user.uid) currentUserIsOwner = allowed;
            return allowed;
        } catch (error) {
            console.warn('Owner access could not be verified:', error);
            if (currentUser && currentUser.uid === user.uid) currentUserIsOwner = false;
            return false;
        }
    }

    function requireCoachAccess() {
        if (currentUser && currentUserRole === 'coach') return true;
        showToast('Coach access only');
        return false;
    }

    async function syncUserDirectory(user, role, name) {
        if (!user) return false;
        try {
            await db.collection('directory').doc(user.uid).set({
                uid: user.uid,
                name: String(name || user.displayName || 'User').slice(0, 120),
                email: user.email || '',
                emailLower: (user.email || '').toLowerCase(),
                role: role === 'coach' ? 'coach' : 'member',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return true;
        } catch (error) {
            // Older Firebase rules may not know about the directory collection yet.
            console.warn('User directory sync pending:', error);
            return false;
        }
    }

    /**
     * Coach status is determined by an allowlist of approved emails the owner
     * manages, stored at config/coachEmails (field: emails = array of strings).
     * Returns true if the given email is on the list (case-insensitive).
     */
    async function isApprovedCoach(email) {
        if (!email) return false;
        try {
            const doc = await db.collection('config').doc('coachEmails').get();
            if (!doc.exists) return false;
            const data = doc.data() || {};
            const list = Array.isArray(data.emails) ? data.emails.map(e => e.toString().trim().toLowerCase()) : [];
            return list.includes(email.trim().toLowerCase());
        } catch (e) {
            console.error('Error checking coach allowlist:', e);
            return false;
        }
    }

    // ---------- OWNER ADMIN: manage the coach-email allowlist ----------

    /**
     * Build the admin card HTML. Parametrised by element ids so it can be shown
     * in more than one place (member profile and coach dashboard).
     */
    function ownerAdminHTML(inputId, listId) {
        return `
            <div class="flex items-center gap-2 mb-3">
                <i data-lucide="shield-check" class="w-5 h-5 text-indigo-600"></i>
                <h3 class="text-lg font-black">Coach Access Admin</h3>
            </div>
            <p class="text-xs text-slate-400 mb-3">Approve which emails can log in as coaches. A change takes effect the next time that person signs in. Remove an email to drop them back to a member.</p>
            <div class="flex gap-2 mb-3">
                <input id="${inputId}" type="email" maxlength="254" placeholder="email@example.com" autocomplete="off" class="flex-1 p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-medium" onkeydown="if(event.key==='Enter')addCoachEmail('${inputId}','${listId}')">
                <button onclick="addCoachEmail('${inputId}','${listId}')" class="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700">Add</button>
            </div>
            <div id="${listId}" class="space-y-2">
                <p class="text-sm text-slate-400 text-center py-2">Loading...</p>
            </div>`;
    }

    /**
     * Render the admin space into the member-profile container, but ONLY for the
     * owner account. Everyone else sees nothing.
     */
    async function renderOwnerAdmin() {
        const container = document.getElementById('owner-admin-section');
        if (!container) return;
        if (!isOwner()) { container.style.display = 'none'; container.innerHTML = ''; return; }
        container.style.display = 'block';
        container.innerHTML = ownerAdminHTML('admin-email-profile', 'admin-list-profile');
        refreshIcons();
        await loadCoachEmailList('admin-list-profile');
    }

    async function loadCoachEmailList(listId) {
        const el = document.getElementById(listId);
        if (!el) return;
        try {
            const doc = await db.collection('config').doc('coachEmails').get();
            const emails = (doc.exists && Array.isArray(doc.data().emails)) ? doc.data().emails : [];
            if (emails.length === 0) {
                el.innerHTML = '<p class="text-sm text-slate-400 text-center py-2">No coach emails approved yet. Add one above.</p>';
                return;
            }
            el.innerHTML = emails.map(e => {
                const safe = escapeHtml(e);
                const arg = escapeJsString(e);
                return `
                    <div class="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                        <span class="text-sm font-medium truncate">${safe}</span>
                        <button onclick="removeCoachEmail('${arg}','${listId}')" class="text-rose-500 text-xs font-bold hover:text-rose-600 flex-shrink-0 ml-2">Remove</button>
                    </div>`;
            }).join('');
            refreshIcons();
        } catch (e) {
            console.error('Error loading coach email list:', e);
            el.innerHTML = '<p class="text-sm text-rose-500 text-center py-2">Could not load list — check you are the owner and rules are published.</p>';
        }
    }

    async function addCoachEmail(inputId, listId) {
        if (!isOwner()) { showToast('Owner access only'); return; }
        const input = document.getElementById(inputId);
        const email = (input.value || '').trim().toLowerCase().slice(0, 254);
        if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
            showToast('Enter a valid email'); return;
        }
        try {
            // set+merge with arrayUnion creates the doc if it doesn't exist yet
            await db.collection('config').doc('coachEmails').set({
                emails: firebase.firestore.FieldValue.arrayUnion(email)
            }, { merge: true });
            input.value = '';
            showToast('Approved ' + email + ' as a coach ✓');
            await loadCoachEmailList(listId);
        } catch (e) {
            console.error('Error adding coach email:', e);
            showToast('Could not add — only the owner can edit this (check rules)');
        }
    }

    async function removeCoachEmail(email, listId) {
        if (!isOwner()) { showToast('Owner access only'); return; }
        try {
            await db.collection('config').doc('coachEmails').update({
                emails: firebase.firestore.FieldValue.arrayRemove(email)
            });
            showToast('Removed ' + email);
            await loadCoachEmailList(listId);
        } catch (e) {
            console.error('Error removing coach email:', e);
            showToast('Could not remove — check rules');
        }
    }

    // ==========================================================================
    // AUTH FORM HELPERS
    // ==========================================================================

    function showLogin() {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('forgot-password-form').classList.add('hidden');
        setTimeout(() => document.getElementById('login-email')?.focus(), 0);
    }

    function showRegister() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('forgot-password-form').classList.add('hidden');
        setTimeout(() => document.getElementById('register-name')?.focus(), 0);
    }

    function showForgotPassword() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('forgot-password-form').classList.remove('hidden');
        setTimeout(() => document.getElementById('forgot-email')?.focus(), 0);
    }

    // ==========================================================================
    // AUTH FUNCTIONS
    // ==========================================================================

    let authRequestInFlight = false;

    function setAuthBusy(formId, busy, busyLabel) {
        authRequestInFlight = busy;
        document.querySelectorAll('[data-auth-submit]').forEach(button => {
            button.disabled = busy;
        });
        const button = document.querySelector(`#${formId} [data-auth-submit]`);
        if (!button) return;
        if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent.trim();
        button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
        button.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function friendlyAuthError(error, fallback) {
        const messages = {
            'auth/email-already-in-use': 'That email already has an account',
            'auth/invalid-email': 'Enter a valid email address',
            'auth/invalid-credential': 'Invalid email or password',
            'auth/wrong-password': 'Invalid email or password',
            'auth/user-not-found': 'Invalid email or password',
            'auth/too-many-requests': 'Too many attempts — wait a moment and try again',
            'auth/network-request-failed': 'No connection — check your internet and try again',
            'auth/weak-password': 'Choose a stronger password with at least 6 characters'
        };
        return messages[error && error.code] || fallback;
    }

    async function registerUser() {
        if (authRequestInFlight) return;
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim().toLowerCase();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        const privacyConsent = document.getElementById('register-privacy-consent');

        if (!name) { showToast('Please enter your name'); return; }
        if (!email || !password) { showToast('Please fill all fields'); return; }
        if (password.length < 6) { showToast('Password must be at least 6 characters'); return; }
        if (password !== confirm) { showToast('Passwords do not match'); return; }
        if (!privacyConsent || !privacyConsent.checked) { showToast('Please review and accept the privacy details'); return; }

        // Everyone signs up as a member. Coach status is granted by the owner's
        // email allowlist and applied automatically on login — so if this email
        // is approved, the account becomes a coach the moment they sign in.
        setAuthBusy('register-form', true, 'Creating Account…');
        try {
            await authPersistenceReady;
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            await user.updateProfile({ displayName: name });

            await db.collection('users').doc(user.uid).set({
                name: name,
                email: email,
                role: 'member',
                emailLower: email.toLowerCase(), // for case-insensitive lookup when linking
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                calorieGoal: 2500,
                workouts: [],
                meals: [],
                metrics: [],
                coachUid: null,
                coachName: null,
                clientUids: [],
                pendingRequests: [],
                // Exercise database is account-level, so it follows the user across devices
                customExercises: [],
                barcodeFoods: [],
                disabledExercises: { gym: [], home: [] },
                privacy: {
                    noticeVersion: RUNTIME_CONFIG.privacyVersion,
                    acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
            await syncUserDirectory(user, 'member', name);

            try { await user.sendEmailVerification(); }
            catch (verificationError) { console.warn('Verification email could not be sent yet:', verificationError); }

            showToast('Account created — check your email to verify it 🎉', 6000);
        } catch (error) {
            console.error('Registration error:', error);
            showToast(friendlyAuthError(error, 'Could not create the account — try again'), 5000);
        } finally {
            setAuthBusy('register-form', false, '');
        }
    }

    async function loginUser() {
        if (authRequestInFlight) return;
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;
        if (!email || !password) { showToast('Please enter email and password'); return; }
        setAuthBusy('login-form', true, 'Signing In…');
        try {
            await authPersistenceReady;
            await auth.signInWithEmailAndPassword(email, password);
            showToast('Welcome back! 💪');
        } catch (error) {
            console.error('Login error:', error);
            showToast(friendlyAuthError(error, 'Sign-in failed — try again'), 5000);
        } finally {
            setAuthBusy('login-form', false, '');
        }
    }

    async function resetPassword() {
        if (authRequestInFlight) return;
        const email = document.getElementById('forgot-email').value.trim().toLowerCase();
        if (!email) { showToast('Please enter your email'); return; }
        setAuthBusy('forgot-password-form', true, 'Sending…');
        try {
            await auth.sendPasswordResetEmail(email);
            showToast('Password reset email sent! Check your inbox.');
            showLogin();
        } catch (error) {
            console.error('Reset error:', error);
            showToast(friendlyAuthError(error, 'Could not send the reset email'), 5000);
        } finally {
            setAuthBusy('forgot-password-form', false, '');
        }
    }

    async function logoutUser() {
        if (confirm('Are you sure you want to sign out?')) {
            try {
                // Make one best-effort final cloud save, but never wipe the user's
                // device data if the phone is offline or Firebase is unavailable.
                await Promise.race([
                    flushCloudSync({ silent: true }),
                    new Promise(resolve => setTimeout(resolve, 2500))
                ]);
                await auth.signOut();
                showToast('Signed out successfully');
                state = JSON.parse(JSON.stringify(DEFAULT_STATE));
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Logout failed');
            }
        }
    }

    function valueTime(value) {
        if (!value) return 0;
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (typeof value.toDate === 'function') return value.toDate().getTime();
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? time : 0;
    }

    function mergeUniqueItems(localItems, remoteItems, keyForItem, preferRemote, combine) {
        const local = Array.isArray(localItems) ? localItems : [];
        const remote = Array.isArray(remoteItems) ? remoteItems : [];
        const preferred = preferRemote ? remote : local;
        const secondary = preferRemote ? local : remote;
        const result = new Map();
        const put = (item, index, source) => {
            if (!item || typeof item !== 'object') return;
            const key = String(keyForItem(item, index) || source + ':' + index);
            if (result.has(key) && combine) result.set(key, combine(result.get(key), item, source));
            else result.set(key, deepClone(item));
        };
        secondary.forEach((item, index) => put(item, index, 'secondary'));
        preferred.forEach((item, index) => put(item, index, 'preferred'));

        // Keep the preferred device's ordering, then append anything found only
        // on the other device. This avoids reorder churn on every cloud sync.
        const ordered = [];
        const used = new Set();
        preferred.concat(secondary).forEach((item, index) => {
            if (!item || typeof item !== 'object') return;
            const source = index < preferred.length ? 'preferred' : 'secondary';
            const localIndex = index < preferred.length ? index : index - preferred.length;
            const key = String(keyForItem(item, localIndex) || source + ':' + localIndex);
            if (!used.has(key) && result.has(key)) {
                used.add(key);
                ordered.push(result.get(key));
            }
        });
        return ordered;
    }

    /** Reconcile two complete/partial snapshots without discarding either history. */
    function mergeStateSnapshots(localInput, remoteInput) {
        const local = normalizeState(localInput);
        const remoteRaw = isPlainRecord(remoteInput) ? remoteInput : {};
        const remote = normalizeState(remoteRaw);
        const localTime = valueTime(local.meta && local.meta.updatedAt);
        const remoteTime = valueTime((remoteRaw.meta && remoteRaw.meta.updatedAt) || remoteRaw.updatedAt);
        const preferRemote = remoteTime > localTime;
        const merged = normalizeState(local);

        const arrayFields = new Set([
            'dailyMeals', 'workoutHistory', 'nutritionHistory', 'metricsHistory',
            'createdMeals', 'customFoods', 'barcodeFoods', 'shoppingItems', 'habits', 'userGoals', 'cardioLogs',
            'customExercises', 'checkIns', 'coachConversations'
        ]);
        const recordFields = new Set([
            'waterLogs', 'stepsLogs', 'habitCompletions', 'hydrationGoalCompletions',
            'stepsGoalCompletions', 'hydrationLogs', 'exerciseRatings', 'readinessLogs',
            'weeklyMealPlan', 'shoppingChecks'
        ]);
        if (preferRemote) {
            Object.keys(DEFAULT_STATE).forEach(key => {
                if (!arrayFields.has(key) && !recordFields.has(key) && key !== 'disabledExercises' && key !== 'activeWorkout' &&
                    Object.prototype.hasOwnProperty.call(remoteRaw, key)) {
                    merged[key] = deepClone(remote[key]);
                }
            });
        }

        const itemKey = (item, index) => item.id || item.createdAt || item.date || `${item.name || item.focus || 'item'}:${index}`;
        const mealKey = (item, index) => item.id || `${item.date || ''}:${item.mealType || item.type || ''}:${item.createdAt || item.name || index}`;
        const workoutKey = (item, index) => item.id || `${item.date || ''}:${item.startTime || item.completedAt || ''}:${item.focus || item.name || index}`;
        const metricKey = (item, index) => item.date || item.id || `metric:${index}`;
        const namedKey = (item, index) => item.id || item.barcode || String(item.name || index).trim().toLowerCase();

        merged.dailyMeals = mergeUniqueItems(local.dailyMeals, remote.dailyMeals, mealKey, preferRemote);
        merged.workoutHistory = mergeUniqueItems(local.workoutHistory, remote.workoutHistory, workoutKey, preferRemote);
        merged.nutritionHistory = mergeUniqueItems(local.nutritionHistory, remote.nutritionHistory, metricKey, preferRemote);
        merged.createdMeals = mergeUniqueItems(local.createdMeals, remote.createdMeals, namedKey, preferRemote);
        merged.customFoods = mergeUniqueItems(local.customFoods, remote.customFoods, namedKey, preferRemote);
        const barcodeKey = (item, index) => {
            const code = String(item && (item.scannedBarcode || item.barcode) || '').replace(/[^0-9]/g, '');
            return (code ? (code.length <= 14 ? code.padStart(14, '0') : code) : '') || `barcode:${index}`;
        };
        merged.barcodeFoods = mergeUniqueItems(local.barcodeFoods, remote.barcodeFoods, barcodeKey, preferRemote);
        const shoppingKey = (item, index) => item && (item.id || item.barcode || String(item.name || index).trim().toLowerCase());
        merged.shoppingItems = mergeUniqueItems(local.shoppingItems, remote.shoppingItems, shoppingKey, preferRemote);
        merged.habits = mergeUniqueItems(local.habits, remote.habits, itemKey, preferRemote);
        merged.userGoals = mergeUniqueItems(local.userGoals, remote.userGoals, itemKey, preferRemote);
        merged.cardioLogs = mergeUniqueItems(local.cardioLogs, remote.cardioLogs, itemKey, preferRemote);
        merged.customExercises = mergeUniqueItems(local.customExercises, remote.customExercises, namedKey, preferRemote);
        merged.checkIns = mergeUniqueItems(local.checkIns, remote.checkIns, itemKey, preferRemote);
        merged.coachConversations = mergeUniqueItems(local.coachConversations, remote.coachConversations, itemKey, preferRemote);
        merged.metricsHistory = mergeUniqueItems(
            local.metricsHistory,
            remote.metricsHistory,
            metricKey,
            preferRemote,
            (older, newer) => {
                const combined = Object.assign({}, older, newer);
                // Progress photos intentionally remain device-local, so a cloud
                // record can never erase them during reconciliation.
                const localMetric = local.metricsHistory.find(item => metricKey(item) === metricKey(combined));
                if (localMetric && localMetric.photos) combined.photos = deepClone(localMetric.photos);
                return combined;
            }
        );

        recordFields.forEach(key => {
            const older = preferRemote ? local[key] : remote[key];
            const newer = preferRemote ? remote[key] : local[key];
            merged[key] = Object.assign({}, older || {}, newer || {});
        });
        merged.disabledExercises = {
            gym: Array.from(new Set([...(local.disabledExercises.gym || []), ...(remote.disabledExercises.gym || [])])),
            home: Array.from(new Set([...(local.disabledExercises.home || []), ...(remote.disabledExercises.home || [])]))
        };
        // An in-progress workout on this phone wins because its form fields and
        // timer are tied to the current browser session.
        merged.activeWorkout = local.activeWorkout || remote.activeWorkout || null;
        merged.meta = Object.assign({}, merged.meta, {
            schemaVersion: VFIT_STATE_SCHEMA_VERSION,
            updatedAt: new Date(Math.max(localTime, remoteTime, Date.now())).toISOString()
        });
        return normalizeState(merged);
    }

    function buildCloudSnapshot() {
        let snapshot = stateWithoutLocalImages(normalizeState(state));
        let json = JSON.stringify(snapshot);
        // A Firestore document has a hard size limit. This only trims the cloud
        // mirror; the complete device save and exports remain untouched.
        if (new Blob([json]).size > 850000) {
            snapshot.workoutHistory = (snapshot.workoutHistory || []).slice(0, 250);
            snapshot.nutritionHistory = (snapshot.nutritionHistory || []).slice(0, 365);
            snapshot.dailyMeals = (snapshot.dailyMeals || []).slice(-1200);
            snapshot.cardioLogs = (snapshot.cardioLogs || []).slice(0, 500);
            snapshot.checkIns = (snapshot.checkIns || []).slice(0, 104);
            snapshot.coachConversations = (snapshot.coachConversations || []).slice(0, 30).map(conversation => Object.assign({}, conversation, {
                messages: (conversation.messages || []).slice(-12).map(message => Object.assign({}, message, {
                    text: String(message.text || '').slice(0, 600)
                }))
            }));
            snapshot.meta.cloudTrimmed = true;
            json = JSON.stringify(snapshot);
        }
        if (new Blob([json]).size > 950000) {
            throw new Error('Cloud snapshot is too large. Export a backup and remove unusually large custom entries.');
        }
        return snapshot;
    }

    function updateDataSyncStatus() {
        const status = document.getElementById('data-sync-status');
        const version = document.getElementById('vfit-version');
        if (version) version.textContent = `VFIT ${VFIT_APP_VERSION}`;
        if (!status) return;
        if (!currentUser) {
            status.textContent = 'Sign in to enable account sync';
        } else if (state.privacySettings && state.privacySettings.cloudHealthData === false) {
            status.textContent = 'Cloud health-data sync is off — saved on this device';
        } else if (!navigator.onLine) {
            status.textContent = 'Offline — changes are saved on this device';
        } else if (cloudSyncPromise) {
            status.textContent = 'Syncing securely…';
        } else if (cloudSyncError || cloudDirty) {
            status.textContent = 'Saved on device — cloud sync pending';
        } else if (state.meta && state.meta.lastCloudSyncAt) {
            const when = new Date(state.meta.lastCloudSyncAt);
            status.textContent = `Cloud synced ${when.toLocaleString()}`;
        } else {
            status.textContent = 'Saved on device — ready to sync';
        }
    }

    function scheduleCloudSnapshotSync(delay) {
        if (!currentUser) return;
        if (state.privacySettings && state.privacySettings.cloudHealthData === false) {
            cloudDirty = false;
            updateDataSyncStatus();
            return;
        }
        cloudDirty = true;
        updateDataSyncStatus();
        clearTimeout(cloudSyncTimer);
        if (!navigator.onLine) return;
        cloudSyncTimer = setTimeout(() => flushCloudSync({ silent: true }), Number.isFinite(delay) ? delay : 1600);
    }

    async function writeCloudSnapshot() {
        if (state.privacySettings && state.privacySettings.cloudHealthData === false) {
            cloudDirty = false;
            updateDataSyncStatus();
            return false;
        }
        if (!currentUser || !navigator.onLine) {
            cloudDirty = !!currentUser;
            updateDataSyncStatus();
            return false;
        }
        if (cloudSyncPromise) return cloudSyncPromise;
        const uid = currentUser.uid;
        cloudDirty = false;
        cloudSyncError = null;
        updateDataSyncStatus();
        cloudSyncPromise = (async () => {
            const snapshot = buildCloudSnapshot();
            await db.collection('users').doc(uid).set({
                name: currentUser.displayName || (firebaseUserData && firebaseUserData.name) || 'User',
                email: currentUser.email || '',
                emailLower: (currentUser.email || '').toLowerCase(),
                calorieGoal: state.goals.calories,
                customExercises: state.customExercises || [],
                barcodeFoods: state.barcodeFoods || [],
                disabledExercises: state.disabledExercises || { gym: [], home: [] },
                dataSnapshot: snapshot,
                snapshotSchemaVersion: VFIT_STATE_SCHEMA_VERSION,
                snapshotUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastSync: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            if (currentUser && currentUser.uid === uid) {
                state.meta.lastCloudSyncAt = new Date().toISOString();
                saveState({ skipCloud: true, preserveUpdatedAt: true });
            }
            return true;
        })().catch(error => {
            cloudDirty = true;
            cloudSyncError = error;
            console.warn('Cloud sync pending:', error);
            return false;
        }).finally(() => {
            cloudSyncPromise = null;
            updateDataSyncStatus();
            if (cloudDirty && currentUser && navigator.onLine) scheduleCloudSnapshotSync(5000);
        });
        return cloudSyncPromise;
    }

    async function flushCloudSync(options) {
        const config = options || {};
        clearTimeout(cloudSyncTimer);
        cloudSyncTimer = null;
        if (!currentUser) return false;
        if (state.privacySettings && state.privacySettings.cloudHealthData === false) {
            cloudDirty = false;
            updateDataSyncStatus();
            if (!config.silent) showToast('Cloud health-data sync is off in Privacy Centre', 5000);
            return false;
        }
        cloudDirty = true;
        const success = await writeCloudSnapshot();
        if (!config.silent) showToast(success ? 'Synced to cloud ☁️' : 'Saved on device — cloud sync will retry', 5000);
        return success;
    }

    async function syncToCloud() {
        if (!currentUser) { showToast('Sign in to sync'); return false; }
        if (state.privacySettings && state.privacySettings.cloudHealthData === false) {
            showToast('Cloud health-data sync is off in Privacy Centre', 5000);
            updateDataSyncStatus();
            return false;
        }
        if (!navigator.onLine) {
            cloudDirty = true;
            updateDataSyncStatus();
            showToast('Offline — changes are safely saved on this device', 5000);
            return false;
        }
        return flushCloudSync({ silent: false });
    }

    function syncToFirebase() {
        scheduleCloudSnapshotSync();
    }

    // Load the account document, reconcile its full snapshot with this device,
    // and only then allow a new cloud write.
    async function loadFirebaseUserData() {
        if (!currentUser) return false;
        const uid = currentUser.uid;
        const userRef = db.collection('users').doc(uid);
        let exists = false;
        try {
            const doc = await userRef.get();
            if (!currentUser || currentUser.uid !== uid) return false;
            exists = doc.exists;
            firebaseUserData = doc.exists ? (doc.data() || {}) : {};
            accountMembership = isPlainRecord(firebaseUserData.membership)
                ? Object.assign({ tier: 'free', status: 'inactive' }, firebaseUserData.membership)
                : { tier: 'free', status: 'inactive' };
            if (doc.exists) {
                const remoteSnapshot = isPlainRecord(firebaseUserData.dataSnapshot)
                    ? deepClone(firebaseUserData.dataSnapshot)
                    : {};
                if (!remoteSnapshot.goals && firebaseUserData.calorieGoal) {
                    remoteSnapshot.goals = { calories: firebaseUserData.calorieGoal };
                }
                if (!remoteSnapshot.customExercises && Array.isArray(firebaseUserData.customExercises)) {
                    remoteSnapshot.customExercises = firebaseUserData.customExercises;
                }
                if (!remoteSnapshot.disabledExercises && firebaseUserData.disabledExercises) {
                    remoteSnapshot.disabledExercises = firebaseUserData.disabledExercises;
                }
                if (!remoteSnapshot.barcodeFoods && Array.isArray(firebaseUserData.barcodeFoods)) {
                    remoteSnapshot.barcodeFoods = firebaseUserData.barcodeFoods;
                }
                if (!remoteSnapshot.meta) remoteSnapshot.meta = {};
                if (!remoteSnapshot.meta.updatedAt && firebaseUserData.snapshotUpdatedAt) {
                    const cloudTime = valueTime(firebaseUserData.snapshotUpdatedAt);
                    if (cloudTime) remoteSnapshot.meta.updatedAt = new Date(cloudTime).toISOString();
                }
                if (Object.keys(remoteSnapshot).length > 1) state = mergeStateSnapshots(state, remoteSnapshot);
                if (isPlainRecord(firebaseUserData.privacy)) {
                    state.privacySettings = Object.assign({}, state.privacySettings, firebaseUserData.privacy);
                }
                applyExercisePrefsFromCloud(state);
            }

            const approved = await isApprovedCoach(currentUser.email);
            if (!currentUser || currentUser.uid !== uid) return false;
            currentUserRole = approved ? 'coach' : 'member';
            const baseProfile = {
                name: currentUser.displayName || firebaseUserData.name || 'User',
                email: currentUser.email || '',
                emailLower: (currentUser.email || '').toLowerCase(),
                role: currentUserRole,
                calorieGoal: state.goals.calories || 2500
            };
            if (!exists) {
                Object.assign(baseProfile, {
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    workouts: [], meals: [], metrics: [], coachUid: null,
                    coachName: null, clientUids: [], pendingRequests: []
                });
            }
            await userRef.set(baseProfile, { merge: true });
            await syncUserDirectory(currentUser, currentUserRole, baseProfile.name);
            firebaseUserData = Object.assign({}, firebaseUserData, baseProfile);
            state.meta.lastCloudSyncAt = new Date().toISOString();
            saveState({ skipCloud: true, preserveUpdatedAt: true, forceBackup: true });
            cloudSyncError = null;
            return true;
        } catch (error) {
            cloudSyncError = error;
            console.warn('Using device data; Firebase is currently unavailable:', error);
            saveState({ skipCloud: true, preserveUpdatedAt: true });
            updateDataSyncStatus();
            return false;
        }
    }

    // ==========================================================================
    // ACCOUNT-LEVEL EXERCISE PREFERENCES (custom exercises + disabled equipment)
    // ==========================================================================
    // These are tied to the ACCOUNT, not the device, so your gym equipment setup
    // and your own exercises follow you to any phone/computer you sign in on.
    // Applies to members AND coaches.

    /**
     * Save the user's custom exercises and disabled-equipment lists to their
     * Firestore user doc. Debounced so rapid toggling doesn't hammer the network.
     */
    let exercisePrefsSyncTimer = null;
    function syncExercisePrefs() {
        if (!currentUser) return;
        clearTimeout(exercisePrefsSyncTimer);
        exercisePrefsSyncTimer = setTimeout(() => scheduleCloudSnapshotSync(0), 700);
    }

    /**
     * Pull the account's exercise preferences from Firestore on login and apply
     * them locally. The cloud copy is the source of truth, so signing in on a new
     * device brings your equipment setup and custom exercises with you.
     */
    function applyExercisePrefsFromCloud(data) {
        if (!data) return;
        if (Array.isArray(data.customExercises)) {
            state.customExercises = data.customExercises;
            // Re-register the muscles each custom exercise targets so swap,
            // volume tracking and demand-ordering understand them.
            state.customExercises.forEach(ce => {
                if (ce && ce.name && Array.isArray(ce.muscles) && ce.muscles.length > 0) {
                    EXERCISE_TO_MUSCLES[ce.name] = ce.muscles.slice();
                }
            });
        }
        if (data.disabledExercises) {
            state.disabledExercises = {
                gym: Array.isArray(data.disabledExercises.gym) ? data.disabledExercises.gym : [],
                home: Array.isArray(data.disabledExercises.home) ? data.disabledExercises.home : []
            };
        }
    }

    // ==========================================================================
    // COACH / MEMBER SYSTEM
    // ==========================================================================
    // Members publish a photo-free snapshot of their training/nutrition data so
    // a linked coach can read it (read-only). Roles are resolved on each login.
    // Linking is consent-based: a coach sends a request by email, the member approves.
    // Notes are a two-way conversation. For a coach to READ a member's doc, your
    // Firestore security rules must permit it (rules provided separately).

    async function pushMemberDataToCloud() {
        if (!currentUser || currentUserRole !== 'member') return false;
        return flushCloudSync({ silent: true });
    }

    // ---------- COACH SECTION (burger-menu overlay) ----------

    /**
     * Show/hide the "Coach Section" entry in the burger menu based on role.
     * Only coaches see it; members never do.
     */
    function renderCoachMenuEntry() {
        const entry = document.getElementById('coach-menu-entry');
        if (!entry) return;
        entry.style.display = (currentUserRole === 'coach') ? 'flex' : 'none';
    }

    /**
     * Open the coach section as a full-screen overlay on top of the normal app,
     * so a coach can manage clients + messages without leaving member features.
     */
    function openCoachSection() {
        if (currentUserRole !== 'coach') { showToast('Coach access only'); return; }
        let coachView = document.getElementById('coach-view');
        if (!coachView) {
            coachView = document.createElement('div');
            coachView.id = 'coach-view';
            document.body.appendChild(coachView);
        }
        // Full-screen scrollable overlay
        coachView.className = 'fixed inset-0 z-[120] bg-slate-50 overflow-y-auto';
        coachView.style.display = 'block';
        viewingClientData = null;
        renderCoachDashboard();
    }

    function closeCoachSection() {
        const coachView = document.getElementById('coach-view');
        if (coachView) coachView.style.display = 'none';
        viewingClientData = null;
    }

    async function renderCoachDashboard() {
        if (!requireCoachAccess()) return;
        const coachView = document.getElementById('coach-view');
        if (!coachView) return;

        coachView.innerHTML = `
            <div class="max-w-xl mx-auto p-4 sm:p-6 space-y-6">
            <div class="glass-card rounded-[2.5rem] p-6">
                <div class="flex items-center justify-between mb-2">
                    <div>
                        <h2 class="text-2xl font-black">Coach Section</h2>
                        <p class="text-sm text-slate-400">${escapeHtml(firebaseUserData.name || 'Coach')}</p>
                    </div>
                    <button onclick="closeCoachSection()" class="w-11 h-11 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200" aria-label="Close">
                        <i data-lucide="x" class="w-6 h-6"></i>
                    </button>
                </div>
                <button onclick="closeCoachSection()" class="mt-2 flex items-center gap-2 text-indigo-600 font-bold text-sm">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to my app
                </button>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-3">Add a Client</h3>
                <p class="text-xs text-slate-400 mb-3">Enter your client's email to send a connection request. They approve it in their app.</p>
                <div class="flex gap-2">
                    <input id="add-client-email" type="email" maxlength="254" autocomplete="email" placeholder="client@email.com" class="flex-1 p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-medium">
                    <button onclick="sendClientRequest()" class="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700">Send</button>
                </div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-4">My Clients</h3>
                <div id="coach-client-list" class="space-y-3">
                    <p class="text-sm text-slate-400 text-center py-4">Loading clients...</p>
                </div>
            </div>

            <!-- Coach Access Admin (owner only) -->
            <div id="owner-admin-section-coach" class="glass-card rounded-[2.5rem] p-6" style="display:none;"></div>
            </div>
        `;
        refreshIcons();
        await loadCoachClients();

        // If the owner is themselves a coach, surface the admin space here too.
        if (isOwner()) {
            const adminBox = document.getElementById('owner-admin-section-coach');
            if (adminBox) {
                adminBox.style.display = 'block';
                adminBox.innerHTML = ownerAdminHTML('admin-email-coach', 'admin-list-coach');
                refreshIcons();
                await loadCoachEmailList('admin-list-coach');
            }
        }
    }

    async function loadCoachClients() {
        if (!requireCoachAccess()) return;
        const listEl = document.getElementById('coach-client-list');
        if (!listEl) return;
        try {
            // Find every member who has THIS coach set as their coachUid. This is
            // the source of truth for the client list — members set their own
            // coachUid when they approve, and each user only ever writes their own
            // doc, so nothing is blocked by the security rules.
            const snap = await db.collection('users').where('coachUid', '==', currentUser.uid).limit(50).get();

            if (snap.empty) {
                listEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">No clients yet. Add one above by email — once they approve, they\'ll appear here.</p>';
                return;
            }

            const cards = [];
            snap.forEach(cDoc => {
                const c = cDoc.data();
                const uid = cDoc.id;
                const updated = c.dataSnapshot && c.dataSnapshot.updatedAt
                    ? new Date(c.dataSnapshot.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : 'no data yet';
                cards.push(`
                    <div onclick="openClientDetail('${escapeJsString(uid)}')" class="bg-slate-50 p-4 rounded-2xl cursor-pointer hover:bg-slate-100 flex items-center gap-3">
                        <div class="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black flex-shrink-0">
                            ${escapeHtml((c.name || 'U').charAt(0).toUpperCase())}
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-bold truncate">${escapeHtml(c.name || 'Unknown')}</p>
                            <p class="text-xs text-slate-400 truncate">${escapeHtml(c.email || '')}</p>
                            <p class="text-[10px] text-slate-400">Updated: ${escapeHtml(updated)}</p>
                        </div>
                        <i data-lucide="chevron-right" class="w-5 h-5 text-slate-400 flex-shrink-0"></i>
                    </div>`);
            });
            listEl.innerHTML = cards.join('');
            refreshIcons();
        } catch (error) {
            console.error('Error loading clients:', error);
            listEl.innerHTML = '<p class="text-sm text-rose-500 text-center py-4">Could not load clients. Check your Firestore rules are published.</p>';
        }
    }

    async function sendClientRequest() {
        if (!requireCoachAccess()) return;
        const emailInput = document.getElementById('add-client-email');
        const email = (emailInput.value || '').trim().toLowerCase();
        if (!email) { showToast('Enter a client email'); return; }
        if (email === (currentUser.email || '').toLowerCase()) { showToast("You can't add yourself"); return; }
        try {
            let targetDoc = null;
            let member = {};
            try {
                const directorySnap = await db.collection('directory').where('emailLower', '==', email).limit(1).get();
                if (!directorySnap.empty) {
                    targetDoc = directorySnap.docs[0];
                    member = targetDoc.data() || {};
                }
            } catch (directoryError) {
                console.warn('Secure directory lookup unavailable; trying legacy lookup:', directoryError);
            }
            // Transitional fallback for accounts that have not signed in since the
            // secure directory was introduced. Hardened rules will deny this query,
            // while the directory route above continues to work.
            if (!targetDoc) {
                const legacySnap = await db.collection('users').where('emailLower', '==', email).limit(1).get();
                if (!legacySnap.empty) {
                    targetDoc = legacySnap.docs[0];
                    member = targetDoc.data() || {};
                }
            }
            if (!targetDoc) { showToast('No member found with that email'); return; }
            if (member.role === 'coach') { showToast('That account is a coach, not a member'); return; }
            if (member.coachUid === currentUser.uid) { showToast('Already your client'); return; }
            const existing = (member.pendingRequests || []).some(request => request.fromUid === currentUser.uid);
            if (existing) { showToast('Request already sent'); return; }
            await db.collection('users').doc(targetDoc.id).update({
                pendingRequests: firebase.firestore.FieldValue.arrayUnion({
                    fromUid: currentUser.uid,
                    fromName: firebaseUserData.name || currentUser.displayName || 'Coach',
                    fromEmail: currentUser.email || ''
                })
            });
            showToast('Request sent to ' + (member.name || email) + ' ✓');
            emailInput.value = '';
        } catch (error) {
            console.error('Error sending request:', error);
            showToast('Send failed: ' + (error.code || error.message || 'unknown'), 6000);
        }
    }

    async function openClientDetail(uid) {
        if (!requireCoachAccess()) return;
        try {
            const cDoc = await db.collection('users').doc(uid).get();
            if (!cDoc.exists) { showToast('Client not found'); return; }
            const c = cDoc.data();
            // Collaboration fields live beside dataSnapshot so coaches can update
            // only those fields under the hardened Firestore rules. Combine them
            // for the read-only client view without moving or deleting either copy.
            const clientSnapshot = isPlainRecord(c.dataSnapshot) ? deepClone(c.dataSnapshot) : {};
            clientSnapshot.assignedWorkouts = Array.isArray(c.assignedWorkouts)
                ? deepClone(c.assignedWorkouts)
                : (Array.isArray(clientSnapshot.assignedWorkouts) ? clientSnapshot.assignedWorkouts : []);
            clientSnapshot.sharing = isPlainRecord(c.sharing)
                ? deepClone(c.sharing)
                : (isPlainRecord(clientSnapshot.sharing) ? clientSnapshot.sharing : {});
            viewingClientData = { uid, name: c.name || 'Client', data: clientSnapshot, email: c.email };
            renderClientDetail();
        } catch (error) {
            console.error('Error opening client:', error);
            showToast('Could not load client data (check Firestore rules)');
        }
    }

    function renderClientDetail() {
        const coachView = document.getElementById('coach-view');
        if (!coachView || !viewingClientData) return;
        const { name, data, email } = viewingClientData;
        const snapshot = data || {};
        const workouts = snapshot.workoutHistory || [];
        const nutrition = snapshot.nutritionHistory || [];
        const metrics = snapshot.metricsHistory || [];
        const profile = snapshot.userProfile || {};
        const goals = snapshot.goals || {};
        const latestCheckIn = (snapshot.checkIns || []).slice().sort((a, b) =>
            String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))
        )[0] || null;

        const recentWorkouts = workouts.map(w => {
            const exCount = (w.exercises || []).length;
            const setCount = (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
            const title = w.title || w.focus || 'Workout';
            const badge = w.title ? '<span class="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">coach plan</span>' : '';
            return `<div onclick="openSessionDetail('${escapeJsString(w.date || '')}', '${escapeJsString(w.id || '')}')" class="bg-slate-50 p-3 rounded-xl cursor-pointer hover:bg-slate-100">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm flex items-center gap-2">${escapeHtml(title)} ${badge}</span>
                    <span class="text-xs text-slate-400 flex items-center gap-1">${escapeHtml(w.date || '')} <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></span>
                </div>
                <p class="text-xs text-slate-400 mt-1">${exCount} exercises · ${setCount} sets${w.duration ? ' · ' + escapeHtml(w.duration) : ''} · tap for detail</p>
            </div>`;
        }).join('') || '<p class="text-sm text-slate-400 text-center py-3">No completed sessions yet</p>';

        const latestMetric = metrics[0] || {};
        const metricRows = [];
        if (latestMetric.weight) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Weight</span><span class="font-bold">${nutritionNumber(latestMetric.weight)} kg</span></div>`);
        if (latestMetric.bodyFat) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Body Fat</span><span class="font-bold">${nutritionNumber(latestMetric.bodyFat)}%</span></div>`);
        if (latestMetric.chest) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Chest</span><span class="font-bold">${nutritionNumber(latestMetric.chest)} cm</span></div>`);
        if (latestMetric.waist) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Waist</span><span class="font-bold">${nutritionNumber(latestMetric.waist)} cm</span></div>`);
        if (latestMetric.arms) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Arms</span><span class="font-bold">${nutritionNumber(latestMetric.arms)} cm</span></div>`);

        const recentNutrition = nutrition.slice(0, 7).map(d => {
            return `<div class="bg-slate-50 p-3 rounded-xl flex justify-between items-center">
                <span class="text-xs text-slate-400">${escapeHtml(d.date || '')}</span>
                <span class="font-bold text-sm">${Math.round(d.totalCalories || d.calories || 0)} kcal</span>
            </div>`;
        }).join('') || '<p class="text-sm text-slate-400 text-center py-3">No nutrition logged</p>';

        const lastUpdated = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString('en-GB') : 'never';
        const checkInFlagsHtml = latestCheckIn && (latestCheckIn.flags || []).length
            ? `<div class="flex flex-wrap gap-1 mt-3">${latestCheckIn.flags.map(flag => `<span class="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">${escapeHtml(flag)}</span>`).join('')}</div>`
            : latestCheckIn ? '<p class="text-xs text-emerald-600 font-bold mt-3">✓ No automatic concerns flagged</p>' : '';
        const checkInBodyHtml = latestCheckIn ? `
            <div class="grid grid-cols-3 gap-2 text-center mb-3">
                <div class="bg-slate-50 p-3 rounded-xl"><p class="text-[9px] uppercase text-slate-400 font-bold">Training</p><p class="font-black">${Math.round(Number(latestCheckIn.trainingAdherence || 0))}%</p></div>
                <div class="bg-slate-50 p-3 rounded-xl"><p class="text-[9px] uppercase text-slate-400 font-bold">Nutrition</p><p class="font-black">${Math.round(Number(latestCheckIn.nutritionAdherence || 0))}%</p></div>
                <div class="bg-slate-50 p-3 rounded-xl"><p class="text-[9px] uppercase text-slate-400 font-bold">Energy</p><p class="font-black">${Math.round(Number(latestCheckIn.energy || 0))}/5</p></div>
            </div>
            <p class="text-xs text-slate-400 mb-1">${escapeHtml(latestCheckIn.date || '')} · ${nutritionNumber(latestCheckIn.sleepHours || 0)}h average sleep</p>
            <p class="text-sm"><b>Win:</b> ${escapeHtml(latestCheckIn.win || '—')}</p>
            <p class="text-sm mt-1"><b>Challenge:</b> ${escapeHtml(latestCheckIn.challenge || '—')}</p>
            ${checkInFlagsHtml}`
            : '<p class="text-sm text-slate-400 text-center py-3">No weekly check-in submitted yet.</p>';

        coachView.innerHTML = `
            <div class="max-w-xl mx-auto p-4 sm:p-6 space-y-6">
            <div class="glass-card rounded-[2.5rem] p-6">
                <button onclick="backToCoachDashboard()" class="flex items-center gap-2 text-indigo-600 font-bold text-sm mb-4">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to clients
                </button>
                <div class="flex items-center gap-3">
                    <div class="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-xl">
                        ${escapeHtml((name || 'U').charAt(0).toUpperCase())}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h2 class="text-xl font-black truncate">${escapeHtml(name)}</h2>
                        <p class="text-xs text-slate-400 truncate">${escapeHtml(email || '')}</p>
                    </div>
                </div>
                <div class="mt-3 inline-flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg">
                    <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span class="text-[10px] font-bold text-slate-400 uppercase">Read-only · synced ${escapeHtml(lastUpdated)}</span>
                </div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-3">Profile & Goals</h3>
                <div class="space-y-2 text-sm">
                    ${profile.gender ? `<div class="flex justify-between"><span class="text-slate-400">Gender</span><span class="font-bold">${escapeHtml(profile.gender)}</span></div>` : ''}
                    ${profile.age ? `<div class="flex justify-between"><span class="text-slate-400">Age</span><span class="font-bold">${Math.round(nutritionNumber(profile.age))}</span></div>` : ''}
                    ${profile.heightCm ? `<div class="flex justify-between"><span class="text-slate-400">Height</span><span class="font-bold">${nutritionNumber(profile.heightCm)} cm</span></div>` : ''}
                    ${(profile.yearsTraining !== undefined && profile.yearsTraining !== null) ? `<div class="flex justify-between"><span class="text-slate-400">Training</span><span class="font-bold">${nutritionNumber(profile.yearsTraining)} yrs</span></div>` : ''}
                    ${goals.calories ? `<div class="flex justify-between"><span class="text-slate-400">Calorie Goal</span><span class="font-bold">${Math.round(nutritionNumber(goals.calories))} kcal</span></div>` : ''}
                    ${goals.protein ? `<div class="flex justify-between"><span class="text-slate-400">Protein Goal</span><span class="font-bold">${Math.round(nutritionNumber(goals.protein))} g</span></div>` : ''}
                </div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-3">Latest Measurements</h3>
                <div class="space-y-2 text-sm">
                    ${metricRows.length ? metricRows.join('') : '<p class="text-sm text-slate-400 text-center py-3">No measurements logged</p>'}
                </div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <div class="flex items-center justify-between gap-3 mb-3">
                    <div><h3 class="text-lg font-black">Weekly Check-in</h3><p class="text-xs text-slate-400">Latest readiness and adherence update</p></div>
                    <i data-lucide="clipboard-check" class="w-5 h-5 text-indigo-600"></i>
                </div>
                ${checkInBodyHtml}
                <div class="grid grid-cols-2 gap-2 mt-4">
                    <button onclick="replyToClientCheckIn()" ${latestCheckIn ? '' : 'disabled'} class="p-3 bg-indigo-600 text-white rounded-xl font-bold text-xs disabled:opacity-40">Reply in Notes</button>
                    <button onclick="exportViewedClientReport()" class="p-3 bg-slate-900 text-white rounded-xl font-bold text-xs">Download Report</button>
                </div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-1">Completed Sessions (${workouts.length})</h3>
                <p class="text-xs text-slate-400 mb-3">Every workout ${escapeHtml(name)} has finished. Tap any to see full detail.</p>
                <div class="space-y-2 max-h-96 overflow-y-auto">${recentWorkouts}</div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-3">Recent Nutrition</h3>
                <div class="space-y-2">${recentNutrition}</div>
            </div>

            <!-- Client's goals, focus & targets -->
            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-1">Goals &amp; Targets</h3>
                <p class="text-xs text-slate-400 mb-4">What ${escapeHtml(name)} is working toward.</p>
                <div id="client-goals-list"></div>
            </div>

            <!-- Days the client has chosen to share with the coach -->
            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-1">Shared With You</h3>
                <p class="text-xs text-slate-400 mb-4">Workouts &amp; nutrition ${escapeHtml(name)} has shared.</p>
                <div id="shared-days-list" class="space-y-2">
                    <p class="text-sm text-slate-400 text-center py-3">Loading...</p>
                </div>
            </div>

            <!-- Coach assigns a workout to this client -->
            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-1">Assign a Workout</h3>
                <p class="text-xs text-slate-400 mb-4">Build a workout for ${escapeHtml(name)}. It appears in their app to follow.</p>
                <div id="assigned-workouts-list" class="space-y-2 mb-4"></div>
                <button onclick="openAssignWorkout()" class="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold hover:bg-indigo-700">+ New Assigned Workout</button>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-1">Personal Training Notes</h3>
                <p class="text-xs text-slate-400 mb-4">A shared conversation between you and ${escapeHtml(name)}.</p>
                <div id="notes-thread" class="space-y-3 mb-4 max-h-80 overflow-y-auto">
                    <p class="text-sm text-slate-400 text-center py-3">Loading notes...</p>
                </div>
                <div class="flex gap-2">
                    <input id="note-input" type="text" maxlength="1000" placeholder="Write a note..." class="flex-1 p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-medium" onkeydown="if(event.key==='Enter')postNote()">
                    <button onclick="postNote()" class="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700">Send</button>
                </div>
            </div>
            </div>
        `;
        refreshIcons();
        loadNotesThread();
        renderSharedDays();
        renderClientGoals();
        renderAssignedWorkoutsForCoach();
    }

    function replyToClientCheckIn() {
        if (!viewingClientData) return;
        const latest = (((viewingClientData.data || {}).checkIns || []).slice().sort((a, b) =>
            String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))
        ))[0];
        const input = document.getElementById('note-input');
        if (!latest || !input) { showToast('No check-in available to reply to'); return; }
        input.value = `Check-in response for ${latest.date || 'this week'}: `;
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();
        if (typeof input.setSelectionRange === 'function') input.setSelectionRange(input.value.length, input.value.length);
    }

    // ==========================================================================
    // COACH ↔ CLIENT SHARING & ASSIGNED WORKOUTS
    // ==========================================================================

    // ==========================================================================
    // NOTIFICATIONS  (coach <-> client activity feed)
    // ==========================================================================
    // Stored as an `events` array on the shared notes doc (which both the coach
    // and the client are allowed to write to). Each event records who it's FOR,
    // so each side only counts the ones meant for them as unread. `seenBy` tracks
    // who has opened their notifications so we can show an unread badge.

    /**
     * Add a notification for a recipient. Figures out the coach/member pair from
     * the current user's role, writes into the shared notes doc's events array.
     * @param {String} recipientUid - who should receive/see this notification
     * @param {Object} notif - { type, title, body, fromName }
     */
    async function pushNotification(recipientUid, notif) {
        try {
            let coachUid, memberUid;
            if (currentUserRole === 'coach') {
                coachUid = currentUser.uid;
                memberUid = recipientUid;
            } else {
                coachUid = firebaseUserData.coachUid;
                memberUid = currentUser.uid;
            }
            if (!coachUid || !memberUid) return;

            const event = {
                type: notif.type || 'update',
                title: notif.title || 'Update',
                body: notif.body || '',
                fromName: notif.fromName || '',
                forUid: recipientUid,
                at: new Date().toISOString(),
                id: 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
            };

            const ref = db.collection('notes').doc(notesDocId(coachUid, memberUid));
            const existing = await ref.get();
            if (existing.exists) {
                await ref.update({ events: firebase.firestore.FieldValue.arrayUnion(event) });
            } else {
                await ref.set({ coachUid: coachUid, memberUid: memberUid, messages: [], events: [event] });
            }
            if (RUNTIME_CONFIG.pushEnabled && appCheckReady) {
                const sendPush = getBackendCallable('sendUserPush');
                if (sendPush) {
                    try {
                        await sendPush({
                            recipientUid,
                            title: event.title,
                            body: event.body,
                            kind: 'coachMessages',
                            url: new URL('./#coaching', window.location.href).href
                        });
                    } catch (pushError) {
                        // The in-app activity event above is still safely delivered.
                        console.warn('Remote push delivery pending:', pushError);
                    }
                }
            }
        } catch (error) {
            console.warn('Could not push notification:', error);
        }
    }

    /**
     * Load all notifications addressed to the current user across their coach/
     * client relationship. Members have one coach; coaches may have many clients.
     */
    async function loadMyNotifications() {
        const results = [];
        try {
            if (currentUserRole === 'coach') {
                // All notes docs where this coach is a participant
                const snap = await db.collection('notes').where('coachUid', '==', currentUser.uid).limit(50).get();
                snap.forEach(doc => {
                    const d = doc.data();
                    (d.events || []).forEach(e => { if (e.forUid === currentUser.uid) results.push(e); });
                });
            } else {
                const coachUid = firebaseUserData.coachUid;
                if (coachUid) {
                    const ref = db.collection('notes').doc(notesDocId(coachUid, currentUser.uid));
                    const doc = await ref.get();
                    if (doc.exists) {
                        (doc.data().events || []).forEach(e => { if (e.forUid === currentUser.uid) results.push(e); });
                    }
                }
            }
        } catch (error) {
            console.warn('Could not load notifications:', error);
        }
        results.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
        return results;
    }

    // Track which notification ids the user has already seen (persisted locally)
    function notificationStorageKey(base) {
        return `${base}:${currentUser ? currentUser.uid : 'guest'}`;
    }

    function seenNotifIds() {
        try { return JSON.parse(localStorage.getItem(notificationStorageKey('vfit_seen_notifs')) || '[]'); }
        catch (e) { return []; }
    }
    function markNotifsSeen(ids) {
        const set = new Set(seenNotifIds());
        ids.forEach(id => set.add(id));
        localStorage.setItem(notificationStorageKey('vfit_seen_notifs'), JSON.stringify(Array.from(set).slice(-500)));
    }

    // Track which notifications the user has DISMISSED (read and cleared off the list)
    function dismissedNotifIds() {
        try { return JSON.parse(localStorage.getItem(notificationStorageKey('vfit_dismissed_notifs')) || '[]'); }
        catch (e) { return []; }
    }
    function dismissNotif(id) {
        const set = new Set(dismissedNotifIds());
        set.add(id);
        localStorage.setItem(notificationStorageKey('vfit_dismissed_notifs'), JSON.stringify(Array.from(set).slice(-1000)));
        markNotifsSeen([id]);
        openNotifications();     // re-render the list without the dismissed item
        refreshNotifBadge();
    }
    function clearAllNotifs() {
        const notifs = window._cachedNotifs || [];
        const set = new Set(dismissedNotifIds());
        notifs.forEach(n => set.add(n.id));
        localStorage.setItem(notificationStorageKey('vfit_dismissed_notifs'), JSON.stringify(Array.from(set).slice(-1000)));
        markNotifsSeen(notifs.map(n => n.id));
        openNotifications();
        refreshNotifBadge();
    }

    async function refreshNotifBadge() {
        const notifs = await loadMyNotifications();
        const seen = new Set(seenNotifIds());
        const dismissed = new Set(dismissedNotifIds());
        // Unread = not seen and not dismissed
        const unread = notifs.filter(n => !seen.has(n.id) && !dismissed.has(n.id)).length;
        document.querySelectorAll('.notif-badge').forEach(badge => {
            if (unread > 0) {
                badge.textContent = unread > 9 ? '9+' : String(unread);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        });
        window._cachedNotifs = notifs;
    }

    async function openNotifications() {
        const modal = document.getElementById('notifications-modal');
        const body = document.getElementById('notifications-body');
        if (!modal || !body) return;
        body.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Loading...</p>';
        modal.style.display = 'flex';

        const all = await loadMyNotifications();
        const dismissed = new Set(dismissedNotifIds());
        const seen = new Set(seenNotifIds());
        // Show everything that hasn't been dismissed
        const notifs = all.filter(n => !dismissed.has(n.id));

        const clearBtn = document.getElementById('notif-clear-all');
        if (clearBtn) clearBtn.style.display = notifs.length > 0 ? '' : 'none';

        if (notifs.length === 0) {
            body.innerHTML = `
                <div class="text-center py-12">
                    <i data-lucide="bell-off" class="w-12 h-12 text-slate-300 mx-auto mb-3"></i>
                    <p class="text-sm text-slate-400 font-bold">You're all caught up</p>
                    <p class="text-xs text-slate-400 mt-1">New activity with your ${currentUserRole === 'coach' ? 'clients' : 'coach'} shows here.</p>
                </div>`;
        } else {
            const iconFor = {
                'workout-assigned': { icon: 'clipboard-list', color: 'bg-indigo-100 text-indigo-600' },
                'workout-completed': { icon: 'check-circle', color: 'bg-emerald-100 text-emerald-600' },
                'days-shared': { icon: 'share-2', color: 'bg-emerald-100 text-emerald-600' },
                'note': { icon: 'message-circle', color: 'bg-blue-100 text-blue-600' },
                'coach-connected': { icon: 'user-check', color: 'bg-indigo-100 text-indigo-600' }
            };
            body.innerHTML = notifs.map(n => {
                const isUnread = !seen.has(n.id);
                const ic = iconFor[n.type] || { icon: 'bell', color: 'bg-slate-100 text-slate-600' };
                const time = n.at ? new Date(n.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                return `
                    <div class="flex gap-3 p-3 rounded-2xl mb-2 ${isUnread ? 'bg-indigo-50' : 'bg-slate-50'}">
                        <div class="w-10 h-10 ${ic.color} rounded-xl flex items-center justify-center flex-shrink-0">
                            <i data-lucide="${ic.icon}" class="w-5 h-5"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="font-bold text-sm">${escapeHtml(n.title || '')}</p>
                                ${isUnread ? '<span class="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0"></span>' : ''}
                            </div>
                            ${n.body ? `<p class="text-xs text-slate-500 mt-0.5">${escapeHtml(n.body)}</p>` : ''}
                            <p class="text-[10px] text-slate-400 mt-1">${n.fromName ? escapeHtml(n.fromName) + ' · ' : ''}${time}</p>
                        </div>
                        <button onclick="dismissNotif('${escapeJsString(n.id)}')" class="text-slate-300 hover:text-slate-500 flex-shrink-0 self-start" aria-label="Dismiss">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>`;
            }).join('');
        }
        refreshIcons();

        // Opening the list marks everything as SEEN (clears the badge), but items
        // stay on the list until individually dismissed or cleared.
        markNotifsSeen(all.map(n => n.id));
        refreshNotifBadge();
    }

    function closeNotifications() {
        const modal = document.getElementById('notifications-modal');
        if (modal) modal.style.display = 'none';
    }

    // ---- COACH SIDE: show the client's goals, focus & targets ----
    function renderClientGoals() {
        const box = document.getElementById('client-goals-list');
        if (!box || !viewingClientData) return;
        const snap = viewingClientData.data || {};
        const goals = snap.userGoals || [];
        const targets = snap.goalTargets || {};
        const profile = snap.userProfile || {};

        let html = '';

        // Focus goals (weight loss / muscle gain / health) — same shape the client sets
        if (goals.length > 0) {
            html += goals.map(g => {
                const focusInfo = {
                    weight_loss: { emoji: '🔥', label: 'Fat Loss', color: 'text-rose-600' },
                    muscle_gain: { emoji: '💪', label: 'Muscle Gain', color: 'text-indigo-600' },
                    health:      { emoji: '🌱', label: 'Health',      color: 'text-emerald-600' }
                }[g.focus] || { emoji: '🎯', label: g.type || 'Goal', color: 'text-slate-600' };

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
                    <div class="bg-slate-50 p-3 rounded-xl mb-2">
                        <span class="text-[10px] font-black ${focusInfo.color} uppercase">${focusInfo.emoji} ${escapeHtml(focusInfo.label)}</span>
                        <p class="font-bold text-sm mt-1">${escapeHtml(g.description || '')}</p>
                        ${summary ? `<p class="text-xs text-slate-500 mt-1">${escapeHtml(summary)}</p>` : ''}
                    </div>`;
            }).join('');
        }

        // Daily targets (calories / water / steps)
        const targetChips = [];
        if (targets.calories) targetChips.push(`🔥 ${Math.round(Number(targets.calories) || 0)} kcal`);
        if (targets.water) targetChips.push(`💧 ${Math.round(Number(targets.water) || 0)} ml`);
        if (targets.steps) targetChips.push(`👟 ${(Number(targets.steps) || 0).toLocaleString()} steps`);
        if (targetChips.length) {
            html += `<p class="text-[10px] font-black uppercase text-slate-400 mt-2 mb-1">Daily Targets</p>
                <div class="flex flex-wrap gap-2 mb-2">
                    ${targetChips.map(c => `<span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full">${escapeHtml(c)}</span>`).join('')}
                </div>`;
        }

        // Profile basics that inform training
        const profBits = [];
        if (profile.gender) profBits.push(profile.gender);
        if (profile.age) profBits.push(`${profile.age} yrs`);
        if (profile.heightCm) profBits.push(`${profile.heightCm} cm`);
        if (profile.yearsTraining != null) profBits.push(`${profile.yearsTraining}y training`);
        if (profile.activityLevel) profBits.push(profile.activityLevel.replace('_', ' '));
        if (profBits.length) {
            html += `<p class="text-[10px] font-black uppercase text-slate-400 mt-2 mb-1">Profile</p>
                <p class="text-xs text-slate-500">${escapeHtml(profBits.join(' · '))}</p>`;
        }

        box.innerHTML = html || '<p class="text-sm text-slate-400 text-center py-3">No goals or targets set yet.</p>';
    }

    // ---- COACH SIDE: show what the client has shared ----
    function renderSharedDays() {
        const box = document.getElementById('shared-days-list');
        if (!box || !viewingClientData) return;
        const snap = viewingClientData.data || {};
        const sharing = snap.sharing || {};
        const sharedWorkoutDates = sharing.workouts || [];
        const sharedNutritionDates = sharing.nutrition || [];

        const workouts = snap.workoutHistory || [];
        const nutrition = snap.nutritionHistory || [];

        let html = '';

        if (sharedWorkoutDates.length > 0) {
            html += '<p class="text-[10px] font-black uppercase text-slate-400 mt-1 mb-1">Shared Workouts</p>';
            sharedWorkoutDates.forEach(date => {
                const w = workouts.find(x => x.date === date);
                if (!w) return;
                const exCount = (w.exercises || []).length;
                const setCount = (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
                html += `<div onclick="openSharedDetail('workout', '${escapeJsString(date)}')" class="bg-slate-50 p-3 rounded-xl cursor-pointer hover:bg-slate-100">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-sm">${escapeHtml(w.focus || 'Workout')}</span>
                        <span class="text-xs text-slate-400 flex items-center gap-1">${escapeHtml(date)} <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></span>
                    </div>
                    <p class="text-xs text-slate-400 mt-1">${exCount} exercises · ${setCount} sets${w.duration ? ' · ' + escapeHtml(w.duration) : ''} · tap for detail</p>
                </div>`;
            });
        }

        if (sharedNutritionDates.length > 0) {
            html += '<p class="text-[10px] font-black uppercase text-slate-400 mt-3 mb-1">Shared Nutrition</p>';
            sharedNutritionDates.forEach(date => {
                const n = nutrition.find(x => x.date === date);
                if (!n) return;
                const mealCount = (n.meals || []).length;
                html += `<div onclick="openSharedDetail('nutrition', '${escapeJsString(date)}')" class="bg-slate-50 p-3 rounded-xl cursor-pointer hover:bg-slate-100">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-bold text-sm">${escapeHtml(date)}</span>
                        <span class="text-xs text-slate-400 flex items-center gap-1">${Math.round(n.calories || 0)} kcal <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></span>
                    </div>
                    <p class="text-xs text-slate-400">${mealCount} item${mealCount !== 1 ? 's' : ''} · ${Math.round(n.protein || 0)}g P · ${Math.round(n.carbs || 0)}g C · ${Math.round(n.fat || 0)}g F · tap for detail</p>
                </div>`;
            });
        }

        box.innerHTML = html || '<p class="text-sm text-slate-400 text-center py-3">Nothing shared yet. Your client can share days from their app.</p>';
        refreshIcons();
    }

    /**
     * Coach taps a completed session in the archive → full detail (reuses the
     * shared-detail modal). Finds the workout by id first, falling back to date.
     */
    function openSessionDetail(date, id) {
        if (!viewingClientData) return;
        const snap = viewingClientData.data || {};
        const workouts = snap.workoutHistory || [];
        const w = (id && workouts.find(x => String(x.id) === String(id))) || workouts.find(x => x.date === date);
        if (!w) { showToast('Session not found'); return; }

        const modal = document.getElementById('shared-detail-modal');
        const body = document.getElementById('shared-detail-body');
        const titleEl = document.getElementById('shared-detail-title');
        if (!modal || !body) return;

        titleEl.textContent = w.title || w.focus || 'Workout';
        const prettyDate = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        let totalVolume = 0;
        (w.exercises || []).forEach(ex => (ex.sets || []).forEach(s => {
            const kg = parseFloat(s.weight), reps = parseInt(s.reps);
            if (!isNaN(kg) && !isNaN(reps)) totalVolume += kg * reps;
        }));

        body.innerHTML = `
            <p class="text-sm text-slate-400 mb-1">${prettyDate}</p>
            ${w.title ? `<p class="text-xs font-bold text-indigo-600 mb-2">📋 Coach-assigned workout</p>` : ''}
            <div class="flex gap-2 mb-4 flex-wrap">
                ${w.duration ? `<span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">⏱ ${escapeHtml(w.duration)}</span>` : ''}
                <span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">${(w.exercises || []).length} exercises</span>
                ${totalVolume > 0 ? `<span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">${Math.round(totalVolume).toLocaleString()} kg volume</span>` : ''}
            </div>
            ${(w.exercises || []).map(ex => {
                const rows = (ex.sets || []).map((s, i) => `
                    <div class="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
                        <span class="text-xs font-black text-slate-400 w-12">Set ${i + 1}</span>
                        <span class="text-sm font-bold">${escapeHtml(s.weight === '' || s.weight == null ? '—' : s.weight)} kg</span>
                        <span class="text-slate-300">×</span>
                        <span class="text-sm font-bold">${escapeHtml(s.reps === '' || s.reps == null ? '—' : s.reps)} reps</span>
                        ${(s.rir !== undefined && s.rir !== '') ? `<span class="text-xs text-amber-600 ml-auto">RIR ${escapeHtml(String(s.rir))}</span>` : ''}
                    </div>`).join('');
                return `
                    <div class="bg-slate-50 rounded-2xl p-4 mb-3">
                        <p class="font-black text-sm mb-1">${escapeHtml(ex.name || 'Exercise')}</p>
                        ${ex.focus ? `<p class="text-[11px] text-indigo-600 mb-2">🎯 ${escapeHtml(ex.focus)}</p>` : ''}
                        ${rows || '<p class="text-xs text-slate-400">No sets recorded</p>'}
                    </div>`;
            }).join('')}
        `;
        modal.style.display = 'flex';
        refreshIcons();
    }

    /**
     * Coach taps a shared workout or nutrition day → full detail modal.
     * Reads from the client's snapshot (viewingClientData.data).
     */
    function openSharedDetail(type, date) {
        if (!viewingClientData) return;
        const snap = viewingClientData.data || {};
        const modal = document.getElementById('shared-detail-modal');
        const body = document.getElementById('shared-detail-body');
        const titleEl = document.getElementById('shared-detail-title');
        if (!modal || !body) return;

        const prettyDate = new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        if (type === 'workout') {
            const w = (snap.workoutHistory || []).find(x => x.date === date);
            if (!w) { showToast('Workout not found'); return; }
            titleEl.textContent = w.focus || 'Workout';

            let totalVolume = 0;
            (w.exercises || []).forEach(ex => (ex.sets || []).forEach(s => {
                const kg = parseFloat(s.weight), reps = parseInt(s.reps);
                if (!isNaN(kg) && !isNaN(reps)) totalVolume += kg * reps;
            }));

            body.innerHTML = `
                <p class="text-sm text-slate-400 mb-1">${prettyDate}</p>
                <div class="flex gap-2 mb-4 flex-wrap">
                    ${w.duration ? `<span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">⏱ ${escapeHtml(w.duration)}</span>` : ''}
                    <span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">${(w.exercises || []).length} exercises</span>
                    ${totalVolume > 0 ? `<span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">${Math.round(totalVolume).toLocaleString()} kg volume</span>` : ''}
                </div>
                ${(w.exercises || []).map(ex => {
                    const rows = (ex.sets || []).map((s, i) => `
                        <div class="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
                            <span class="text-xs font-black text-slate-400 w-12">Set ${i + 1}</span>
                            <span class="text-sm font-bold">${escapeHtml(s.weight === '' || s.weight == null ? '—' : s.weight)} kg</span>
                            <span class="text-slate-300">×</span>
                            <span class="text-sm font-bold">${escapeHtml(s.reps === '' || s.reps == null ? '—' : s.reps)} reps</span>
                            ${(s.rir !== undefined && s.rir !== '') ? `<span class="text-xs text-amber-600 ml-auto">RIR ${escapeHtml(String(s.rir))}</span>` : ''}
                        </div>`).join('');
                    return `
                        <div class="bg-slate-50 rounded-2xl p-4 mb-3">
                            <p class="font-black text-sm mb-2">${escapeHtml(ex.name || 'Exercise')}</p>
                            ${rows || '<p class="text-xs text-slate-400">No sets recorded</p>'}
                        </div>`;
                }).join('')}
            `;
        } else {
            const n = (snap.nutritionHistory || []).find(x => x.date === date);
            if (!n) { showToast('Nutrition not found'); return; }
            titleEl.textContent = 'Nutrition';

            body.innerHTML = `
                <p class="text-sm text-slate-400 mb-3">${prettyDate}</p>
                <div class="grid grid-cols-4 gap-2 mb-4">
                    <div class="bg-indigo-50 rounded-xl p-2 text-center">
                        <p class="text-lg font-black text-indigo-600">${Math.round(n.calories || 0)}</p>
                        <p class="text-[9px] font-bold uppercase text-slate-400">kcal</p>
                    </div>
                    <div class="bg-slate-50 rounded-xl p-2 text-center">
                        <p class="text-lg font-black">${Math.round(n.protein || 0)}g</p>
                        <p class="text-[9px] font-bold uppercase text-slate-400">Protein</p>
                    </div>
                    <div class="bg-slate-50 rounded-xl p-2 text-center">
                        <p class="text-lg font-black">${Math.round(n.carbs || 0)}g</p>
                        <p class="text-[9px] font-bold uppercase text-slate-400">Carbs</p>
                    </div>
                    <div class="bg-slate-50 rounded-xl p-2 text-center">
                        <p class="text-lg font-black">${Math.round(n.fat || 0)}g</p>
                        <p class="text-[9px] font-bold uppercase text-slate-400">Fat</p>
                    </div>
                </div>
                <p class="text-[10px] font-black uppercase text-slate-400 mb-2">Foods logged (${(n.meals || []).length})</p>
                ${(n.meals || []).map(m => `
                    <div class="bg-slate-50 rounded-2xl p-3 mb-2">
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-sm flex-1 min-w-0 truncate">${escapeHtml(m.name || 'Food')}</span>
                            <span class="text-sm font-black text-indigo-600 ml-2">${Math.round(m.calories || 0)} kcal</span>
                        </div>
                        <p class="text-xs text-slate-400 mt-0.5">${Math.round(m.protein || 0)}g P · ${Math.round(m.carbs || 0)}g C · ${Math.round(m.fat || 0)}g F${m.fiber ? ' · ' + Math.round(m.fiber) + 'g fibre' : ''}</p>
                    </div>`).join('') || '<p class="text-sm text-slate-400">No foods recorded</p>'}
            `;
        }

        modal.style.display = 'flex';
        refreshIcons();
    }

    function closeSharedDetail() {
        const modal = document.getElementById('shared-detail-modal');
        if (modal) modal.style.display = 'none';
    }

    // ---- COACH SIDE: assign workouts ----
    let assignExercises = []; // [{name, sets:[{weight,reps}]}] being built

    function renderAssignedWorkoutsForCoach() {
        const box = document.getElementById('assigned-workouts-list');
        if (!box || !viewingClientData) return;
        const assigned = (viewingClientData.data || {}).assignedWorkouts || [];
        if (assigned.length === 0) {
            box.innerHTML = '<p class="text-sm text-slate-400 text-center py-2">None assigned yet.</p>';
            return;
        }
        box.innerHTML = assigned.slice().reverse().map(w => `
            <div class="bg-indigo-50 p-3 rounded-xl">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm">${escapeHtml(w.title || 'Workout')}</span>
                    <span class="text-[10px] text-slate-400">${escapeHtml((w.assignedAt || '').split('T')[0])}</span>
                </div>
                <div class="mt-1 space-y-1">
                    ${(w.exercises || []).map(e => `
                        <div>
                            <p class="text-xs text-slate-600">${escapeHtml(e.name)}</p>
                            ${e.focus ? `<p class="text-[11px] text-indigo-600 pl-2">🎯 ${escapeHtml(e.focus)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>`).join('');
    }

    let assigningToClient = null; // when set, a finished workout is assigned to this client instead of saved

    function openAssignWorkout() {
        if (!viewingClientData) return;
        // Build the workout using the REAL workout interface (same cards, exercise
        // picker, PB display, add-set) rather than a stripped-down form. We remember
        // which client we're assigning to; finishing routes to saveAssignedFromBuilder().
        const clientName = viewingClientData.name || 'client';
        assigningToClient = { uid: viewingClientData.uid, name: clientName };

        closeCoachSection(); // hide the coach overlay so the workout screen is visible
        switchTab('training'); // the workout lives in the "training" tab

        currentWorkoutContext = { env: state.workoutEnv || 'gym', focus: 'Assign to ' + clientName, muscles: null };
        workoutStartTime = Date.now();
        workoutAccumulatedSeconds = 0;
        clearInterval(workoutTimer);
        document.getElementById('workout-setup').classList.add('hidden');
        { const _cpc = document.getElementById('coach-plan-card'); if (_cpc) _cpc.classList.add('hidden'); }
        document.getElementById('workout-active').classList.remove('hidden');
        const titleEl = document.getElementById('active-workout-title');
        if (titleEl) titleEl.innerText = '📝 Assigning to ' + clientName;
        document.getElementById('exercise-list').innerHTML = '';
        addExercise(); // start with one blank exercise card
        setTimeout(() => enterWizardMode(), 120);
        showToast('Build the workout, then Finish to assign it');
    }

    /**
     * Called from saveWorkout() when the coach is in assign mode. Reads the built
     * exercises straight from the workout cards and assigns them to the client,
     * instead of saving to the coach's own history.
     */
    let pendingAssignExercises = null; // holds the built workout while naming it

    async function saveAssignedFromBuilder() {
        if (!requireCoachAccess()) return;
        const clientUid = assigningToClient ? assigningToClient.uid : null;
        if (!clientUid) return false;

        // Read the exercises out of the workout DOM (same source saveWorkout uses)
        const exercises = [];
        document.querySelectorAll('#exercise-list > div').forEach(card => {
            const nameInput = card.querySelector('input[type="text"]');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) return;
            const sets = [];
            card.querySelectorAll('.set-row').forEach(row => {
                const w = row.querySelector('.set-weight');
                const r = row.querySelector('.set-reps');
                sets.push({ weight: (w && w.value) || '', reps: (r && r.value) || '' });
            });
            // Coach's Focus text for this exercise (may be blank)
            const focusEl = card.querySelector('[id^="coach-focus-"]');
            const focus = focusEl ? focusEl.value.trim() : '';
            const exObj = { name: name, sets: sets.length ? sets : [{ weight: '', reps: '' }] };
            if (focus) exObj.focus = focus;
            exercises.push(exObj);
        });

        if (exercises.length === 0) { showToast('Add at least one exercise'); return true; }

        // Stash the built workout and ask the coach to name it before saving.
        pendingAssignExercises = exercises;
        const input = document.getElementById('name-workout-input');
        if (input) input.value = '';
        document.getElementById('name-workout-modal').style.display = 'flex';
        setTimeout(() => { if (input) input.focus(); }, 100);
        refreshIcons();
        return true;
    }

    async function confirmAssignWorkoutName() {
        if (!requireCoachAccess()) return;
        const clientUid = assigningToClient ? assigningToClient.uid : null;
        const clientName = assigningToClient ? assigningToClient.name : 'client';
        if (!clientUid || !pendingAssignExercises) return;

        const input = document.getElementById('name-workout-input');
        const title = (input && input.value.trim()) || 'Coach Workout';

        const workout = {
            title: title,
            exercises: pendingAssignExercises,
            assignedBy: firebaseUserData.name || 'Coach',
            assignedAt: new Date().toISOString(),
            id: 'aw_' + Date.now()
        };

        try {
            await db.collection('users').doc(clientUid).update({
                assignedWorkouts: firebase.firestore.FieldValue.arrayUnion(workout)
            });
            if (viewingClientData && viewingClientData.uid === clientUid) {
                if (!Array.isArray(viewingClientData.data.assignedWorkouts)) viewingClientData.data.assignedWorkouts = [];
                viewingClientData.data.assignedWorkouts.push(workout);
            }
            // Notify the client that a new workout was assigned
            await pushNotification(clientUid, {
                type: 'workout-assigned',
                title: 'New workout from your coach',
                body: '"' + title + '" is ready in your Training tab',
                fromName: firebaseUserData.name || 'Coach'
            });
            showToast('Assigned "' + title + '" to ' + clientName + ' ✓');
        } catch (error) {
            console.error('Assign failed:', error);
            showToast('Assign failed: ' + (error.code || error.message || 'unknown'), 6000);
        }

        // Tear down the builder and return to the coach's client view
        pendingAssignExercises = null;
        document.getElementById('name-workout-modal').style.display = 'none';
        assigningToClient = null;
        clearInterval(workoutTimer);
        exitWizardMode();
        clearActiveWorkout();
        document.getElementById('workout-active').classList.add('hidden');
        document.getElementById('workout-setup').classList.remove('hidden');
        if (typeof renderCoachPlanInTraining === 'function') renderCoachPlanInTraining();
        currentWorkoutContext = null;
        openCoachSection();
        setTimeout(() => { if (viewingClientData) renderClientDetail(); else openClientDetail(clientUid); }, 100);
        return true;
    }

    function closeAssignWorkout() {
        document.getElementById('assign-workout-modal').style.display = 'none';
    }

    function addAssignExercise() {
        assignExercises.push({ name: '', sets: [{ weight: '', reps: '' }] });
        renderAssignExerciseList();
    }

    function addAssignSet(exIdx) {
        assignExercises[exIdx].sets.push({ weight: '', reps: '' });
        renderAssignExerciseList();
    }

    function updateAssignField(exIdx, field, value, setIdx) {
        const exercise = assignExercises[exIdx];
        if (!exercise) return;
        if (field === 'name') exercise.name = String(value || '').slice(0, 100);
        else if ((field === 'weight' || field === 'reps') && exercise.sets[setIdx]) {
            exercise.sets[setIdx][field] = String(value || '').slice(0, 12);
        }
    }

    function removeAssignExercise(exIdx) {
        assignExercises.splice(exIdx, 1);
        renderAssignExerciseList();
    }

    function renderAssignExerciseList() {
        const box = document.getElementById('assign-exercise-list');
        if (!box) return;
        if (assignExercises.length === 0) {
            box.innerHTML = '<p class="text-sm text-slate-400 text-center py-3">Add exercises to build the workout.</p>';
            return;
        }
        box.innerHTML = assignExercises.map((ex, i) => `
            <div class="bg-slate-50 p-3 rounded-xl">
                <div class="flex gap-2 mb-2">
                    <input value="${escapeHtml(ex.name)}" maxlength="100" oninput="updateAssignField(${i}, 'name', this.value)" placeholder="Exercise name" class="flex-1 p-2 rounded-lg border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm">
                    <button onclick="removeAssignExercise(${i})" class="text-rose-500 text-xs font-bold px-2">✕</button>
                </div>
                ${ex.sets.map((s, si) => `
                    <div class="flex gap-2 mb-1 items-center">
                        <span class="text-xs text-slate-400 w-10">Set ${si + 1}</span>
                        <input value="${escapeHtml(s.weight)}" maxlength="12" oninput="updateAssignField(${i}, 'weight', this.value, ${si})" placeholder="kg" inputmode="decimal" class="w-20 p-2 rounded-lg text-center border-2 border-transparent focus:border-indigo-500 outline-none text-sm">
                        <span class="text-xs text-slate-400">×</span>
                        <input value="${escapeHtml(s.reps)}" maxlength="12" oninput="updateAssignField(${i}, 'reps', this.value, ${si})" placeholder="reps" inputmode="numeric" class="w-20 p-2 rounded-lg text-center border-2 border-transparent focus:border-indigo-500 outline-none text-sm">
                    </div>`).join('')}
                <button onclick="addAssignSet(${i})" class="text-indigo-600 text-xs font-bold mt-1">+ Add set</button>
            </div>`).join('');
    }

    async function saveAssignedWorkout() {
        if (!requireCoachAccess()) return;
        if (!viewingClientData) return;
        const title = document.getElementById('assign-workout-title').value.trim() || 'Coach Workout';
        const clean = assignExercises
            .filter(ex => ex.name.trim())
            .map(ex => ({
                name: ex.name.trim(),
                sets: ex.sets.map(s => ({ weight: s.weight || '', reps: s.reps || '' }))
            }));
        if (clean.length === 0) { showToast('Add at least one exercise'); return; }

        const workout = {
            title: title,
            exercises: clean,
            assignedBy: firebaseUserData.name || 'Coach',
            assignedAt: new Date().toISOString(),
            id: 'aw_' + Date.now()
        };

        try {
            await db.collection('users').doc(viewingClientData.uid).update({
                assignedWorkouts: firebase.firestore.FieldValue.arrayUnion(workout)
            });
            // keep local copy in sync so the list updates immediately
            if (!viewingClientData.data.assignedWorkouts) viewingClientData.data.assignedWorkouts = [];
            viewingClientData.data.assignedWorkouts.push(workout);
            closeAssignWorkout();
            renderAssignedWorkoutsForCoach();
            showToast('Workout assigned ✓');
        } catch (error) {
            console.error('Assign failed:', error);
            showToast('Assign failed: ' + (error.code || error.message || 'unknown'), 6000);
        }
    }

    function backToCoachDashboard() {
        viewingClientData = null;
        renderCoachDashboard();
    }

    // ---------- NOTES (two-way conversation) ----------

    function notesDocId(coachUid, memberUid) {
        return coachUid + '_' + memberUid;
    }

    async function loadNotesThread() {
        if (!requireCoachAccess()) return;
        const threadEl = document.getElementById('notes-thread');
        if (!threadEl) return;
        let coachUid, memberUid;
        if (currentUserRole === 'coach' && viewingClientData) {
            coachUid = currentUser.uid;
            memberUid = viewingClientData.uid;
        } else if (currentUserRole === 'member') {
            coachUid = firebaseUserData.coachUid;
            memberUid = currentUser.uid;
        }
        if (!coachUid || !memberUid) {
            threadEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-3">No notes yet.</p>';
            return;
        }
        try {
            const noteDoc = await db.collection('notes').doc(notesDocId(coachUid, memberUid)).get();
            const notes = (noteDoc.exists && noteDoc.data().messages) ? noteDoc.data().messages : [];
            if (notes.length === 0) {
                threadEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-3">No notes yet. Start the conversation below.</p>';
                return;
            }
            threadEl.innerHTML = renderNoteMessages(notes);
            threadEl.scrollTop = threadEl.scrollHeight;
        } catch (error) {
            console.error('Error loading notes:', error);
            threadEl.innerHTML = '<p class="text-sm text-rose-500 text-center py-3">Could not load notes (check Firestore rules).</p>';
        }
    }

    function renderNoteMessages(notes) {
        return notes.map(n => {
            const isMine = n.fromUid === currentUser.uid;
            const time = n.at ? new Date(n.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

            // Workout-feedback messages get a distinct card with star rows
            if (n.type === 'workout-feedback' && Array.isArray(n.feedback)) {
                const rows = n.feedback.map(it => {
                    const starCount = Math.max(0, Math.min(5, Math.round(Number(it.stars) || 0)));
                    const stars = starCount ? '★'.repeat(starCount) + '☆'.repeat(5 - starCount) : '—';
                    return `<div class="text-xs py-0.5">
                        <span class="font-bold">${escapeHtml(it.name)}</span>
                        <span class="text-amber-500">${stars}</span>
                        ${it.comment ? `<div class="text-[11px] italic opacity-80">"${escapeHtml(it.comment)}"</div>` : ''}
                    </div>`;
                }).join('');
                return `
                    <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
                        <div class="max-w-[85%] bg-emerald-50 border border-emerald-200 text-slate-800 px-4 py-3 rounded-2xl">
                            <p class="text-[10px] font-bold text-emerald-700 mb-1">${escapeHtml(n.fromName || '')} completed a workout</p>
                            <p class="text-sm font-black mb-1">📋 ${escapeHtml(n.workoutTitle || 'Coach Workout')}</p>
                            ${rows}
                            <p class="text-[9px] opacity-60 mt-1 text-right">${time}</p>
                        </div>
                    </div>`;
            }

            const safeText = escapeHtml(n.text || '').replace(/\n/g, '<br>');
            return `
                <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
                    <div class="max-w-[80%] ${isMine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'} px-4 py-2.5 rounded-2xl">
                        <p class="text-[10px] font-bold opacity-70 mb-0.5">${escapeHtml(n.fromName || '')}${n.fromRole === 'coach' ? ' · Coach' : ''}</p>
                        <p class="text-sm">${safeText}</p>
                        <p class="text-[9px] opacity-60 mt-1 text-right">${time}</p>
                    </div>
                </div>`;
        }).join('');
    }

    async function appendNote(coachUid, memberUid, message) {
        const ref = db.collection('notes').doc(notesDocId(coachUid, memberUid));
        const existing = await ref.get();
        if (existing.exists) {
            await ref.update({ messages: firebase.firestore.FieldValue.arrayUnion(message) });
        } else {
            await ref.set({ coachUid: coachUid, memberUid: memberUid, messages: [message] });
        }
    }

    async function postNote() {
        if (!requireCoachAccess()) return;
        const input = document.getElementById('note-input');
        const text = (input.value || '').trim().slice(0, 1000);
        if (!text) return;
        let coachUid, memberUid;
        if (currentUserRole === 'coach' && viewingClientData) {
            coachUid = currentUser.uid;
            memberUid = viewingClientData.uid;
        } else if (currentUserRole === 'member') {
            coachUid = firebaseUserData.coachUid;
            memberUid = currentUser.uid;
        }
        if (!coachUid || !memberUid) { showToast('No coach/client link found'); return; }
        const message = {
            fromUid: currentUser.uid,
            fromName: firebaseUserData.name || (currentUser.displayName) || 'User',
            fromRole: currentUserRole,
            text: text,
            at: new Date().toISOString()
        };
        try {
            await appendNote(coachUid, memberUid, message);
            // Notify the other person about the new note
            const recipientUid = (currentUser.uid === coachUid) ? memberUid : coachUid;
            await pushNotification(recipientUid, {
                type: 'note',
                title: 'New message from ' + (firebaseUserData.name || 'your ' + (currentUserRole === 'coach' ? 'coach' : 'client')),
                body: text.length > 60 ? text.slice(0, 57) + '...' : text,
                fromName: firebaseUserData.name || ''
            });
            input.value = '';
            loadNotesThread();
        } catch (error) {
            console.error('Error posting note:', error);
            showToast('Note failed: ' + (error.code || error.message || 'unknown'), 6000);
        }
    }

    // ---------- MEMBER SIDE: coach link + requests ----------

    async function renderMemberCoachSection() {
        const container = document.getElementById('member-coach-section');
        if (!container) return;
        if (!currentUser) {
            container.innerHTML = '<p class="text-sm text-slate-400">Sign in to view coach connections and messages.</p>';
            return;
        }
        try {
            const meDoc = await db.collection('users').doc(currentUser.uid).get();
            const me = meDoc.data() || {};
            const pending = me.pendingRequests || [];
            const coachUid = me.coachUid;
            const coachName = me.coachName;
            firebaseUserData.coachUid = coachUid;
            firebaseUserData.coachName = coachName;

            let html = '';
            if (pending.length > 0) {
                html += '<h4 class="text-sm font-black mb-2">Connection Requests</h4>';
                html += pending.map((r, ri) => {
                    const safeName = escapeJsString(r.fromName || 'Coach');
                    const safeUid = escapeJsString(r.fromUid || '');
                    return `
                    <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl mb-2">
                        <p class="font-bold text-sm">${escapeHtml(r.fromName || 'A coach')}</p>
                        <p class="text-xs text-slate-500 mb-2">${escapeHtml(r.fromEmail || '')} wants to be your coach</p>
                        <div class="flex gap-2">
                            <button onclick="approveCoach('${safeUid}', '${safeName}')" class="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold text-sm">Approve</button>
                            <button onclick="declineCoach('${safeUid}')" class="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-bold text-sm">Decline</button>
                        </div>
                    </div>`;
                }).join('');
            }
            if (coachUid) {
                html += `
                    <div class="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 mb-3">
                        <div class="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black">
                            ${escapeHtml((coachName || 'C').charAt(0).toUpperCase())}
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[10px] font-bold text-slate-400 uppercase">Your Coach</p>
                            <p class="font-bold truncate">${escapeHtml(coachName || 'Coach')}</p>
                        </div>
                        <button onclick="openMemberNotes()" class="bg-indigo-600 text-white px-3 py-2 rounded-lg font-bold text-xs">Notes</button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="openShareDays()" class="bg-emerald-600 text-white p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1">
                            <i data-lucide="share-2" class="w-4 h-4"></i> Share Days With Coach
                        </button>
                        <button onclick="switchTab('training')" class="bg-slate-900 text-white p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1">
                            <i data-lucide="clipboard-list" class="w-4 h-4"></i> Coach Workouts
                        </button>
                    </div>
                    <p class="text-[11px] text-slate-400 text-center mt-2">Your coach's workouts appear in the Training tab.</p>`;
            } else if (pending.length === 0) {
                html += '<p class="text-sm text-slate-400">No coach connected. When a coach sends a request, it\'ll appear here to approve.</p>';
            }
            container.innerHTML = html;
            refreshIcons();
        } catch (error) {
            console.error('Error rendering coach section:', error);
            container.innerHTML = '<p class="text-sm text-rose-500">Could not load coach info.</p>';
        }
    }

    async function approveCoach(coachUid, coachNameFromRequest) {
        try {
            // We do NOT read the coach's document here. The hardened rules only let
            // you read your own doc or a client linked to you, so a member reading
            // the coach's doc is (correctly) denied — that was the "permission
            // denied" on approve. The coach's name already arrived in the pending
            // request (fromName), so we use that and avoid the blocked read entirely.
            const coachName = coachNameFromRequest || 'Coach';

            // The member writes ONLY their own doc: set their coach + clear requests.
            // This touches coachUid, coachName and pendingRequests — never `role` —
            // so the self-update rule allows it.
            await db.collection('users').doc(currentUser.uid).update({
                coachUid: coachUid,
                coachName: coachName,
                pendingRequests: []
            });
            firebaseUserData.coachUid = coachUid;
            firebaseUserData.coachName = coachName;
            showToast('Connected with ' + coachName + ' ✓');
            renderMemberCoachSection();
        } catch (error) {
            console.error('Error approving coach:', error);
            showToast('Approve failed: ' + (error.code || error.message || 'unknown'), 6000);
        }
    }

    async function declineCoach(coachUid) {
        try {
            const meDoc = await db.collection('users').doc(currentUser.uid).get();
            const pending = (meDoc.data().pendingRequests || []).filter(r => r.fromUid !== coachUid);
            await db.collection('users').doc(currentUser.uid).update({ pendingRequests: pending });
            showToast('Request declined');
            renderMemberCoachSection();
        } catch (error) {
            console.error('Error declining:', error);
            showToast('Could not decline request');
        }
    }

    // ---- CLIENT SIDE: share workout / nutrition days with the coach ----
    let shareTab = 'workouts';
    let shareSelection = { workouts: [], nutrition: [] };

    async function openShareDays() {
        if (!firebaseUserData.coachUid) { showToast('No coach connected'); return; }
        // Start from what's already shared
        try {
            const meDoc = await db.collection('users').doc(currentUser.uid).get();
            const sharing = (meDoc.data() || {}).sharing || {};
            shareSelection = {
                workouts: (sharing.workouts || []).slice(),
                nutrition: (sharing.nutrition || []).slice()
            };
        } catch (e) { shareSelection = { workouts: [], nutrition: [] }; }
        setShareTab('workouts');
        document.getElementById('share-days-modal').style.display = 'flex';
        refreshIcons();
    }

    function closeShareDays() {
        document.getElementById('share-days-modal').style.display = 'none';
    }

    function setShareTab(tab) {
        shareTab = tab;
        const w = document.getElementById('share-tab-workouts');
        const n = document.getElementById('share-tab-nutrition');
        const on = 'flex-1 py-2 rounded-lg text-xs font-black uppercase bg-white text-indigo-600 shadow-sm';
        const off = 'flex-1 py-2 rounded-lg text-xs font-black uppercase text-slate-400';
        if (w) w.className = (tab === 'workouts') ? on : off;
        if (n) n.className = (tab === 'nutrition') ? on : off;
        renderShareOptions();
    }

    function renderShareOptions() {
        const box = document.getElementById('share-days-options');
        if (!box) return;
        const list = shareTab === 'workouts'
            ? (state.workoutHistory || [])
            : (state.nutritionHistory || []);
        if (list.length === 0) {
            box.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">No ${shareTab} logged yet.</p>`;
            return;
        }
        box.innerHTML = list.slice(0, 60).map(item => {
            const date = item.date;
            const selected = shareSelection[shareTab].indexOf(date) >= 0;
            const summary = shareTab === 'workouts'
                ? `${escapeHtml(item.focus || 'Workout')} · ${(item.exercises || []).length} exercises`
                : `${Math.round(item.calories || 0)} kcal · ${Math.round(item.protein || 0)}g protein`;
            return `
                <label class="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                    <div class="min-w-0">
                        <p class="font-bold text-sm">${escapeHtml(date)}</p>
                        <p class="text-xs text-slate-400 truncate">${summary}</p>
                    </div>
                    <input type="checkbox" ${selected ? 'checked' : ''} onchange="toggleShareDay('${escapeJsString(date)}', this.checked)" class="w-5 h-5 accent-indigo-600 flex-shrink-0">
                </label>`;
        }).join('');
    }

    function toggleShareDay(date, on) {
        const arr = shareSelection[shareTab];
        const i = arr.indexOf(date);
        if (on) { if (i < 0) arr.push(date); }
        else { if (i >= 0) arr.splice(i, 1); }
    }

    async function saveSharedDays() {
        try {
            await db.collection('users').doc(currentUser.uid).update({
                sharing: {
                    workouts: shareSelection.workouts,
                    nutrition: shareSelection.nutrition
                }
            });
            // Make sure the shared days' full data is in the cloud snapshot for the coach
            await pushMemberDataToCloud();
            // Notify the coach that the client shared days
            if (firebaseUserData.coachUid) {
                const total = shareSelection.workouts.length + shareSelection.nutrition.length;
                await pushNotification(firebaseUserData.coachUid, {
                    type: 'days-shared',
                    title: (firebaseUserData.name || 'Your client') + ' shared their data',
                    body: total + ' day' + (total !== 1 ? 's' : '') + ' now visible to you',
                    fromName: firebaseUserData.name || 'Client'
                });
            }
            closeShareDays();
            const total = shareSelection.workouts.length + shareSelection.nutrition.length;
            showToast(total > 0 ? `Sharing ${total} day${total > 1 ? 's' : ''} with your coach ✓` : 'Sharing updated');
        } catch (error) {
            console.error('Share failed:', error);
            showToast('Could not save sharing: ' + (error.code || error.message || 'unknown'), 6000);
        }
    }

    // ---- CLIENT SIDE: view & use workouts the coach assigned ----
    // ==========================================================================
    // PROGRESS REMINDERS — weight / measurements / photos, scheduled
    // ==========================================================================
    function updReminders() {
        if (!state.updateReminders) state.updateReminders = JSON.parse(JSON.stringify(DEFAULT_STATE.updateReminders));
        return state.updateReminders;
    }

    const REMINDER_META = {
        weight:      { label: 'Weight', icon: 'scale', desc: 'Log your bodyweight' },
        measurement: { label: 'Body Measurements', icon: 'ruler', desc: 'Chest, waist, arms, etc.' },
        photo:       { label: 'Progress Photos', icon: 'camera', desc: 'Front, side, back photos' }
    };
    const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function openProgressReminders() {
        renderRemindersSections();
        document.getElementById('progress-reminders-modal').style.display = 'flex';
        refreshIcons();
    }
    function closeProgressReminders() {
        document.getElementById('progress-reminders-modal').style.display = 'none';
    }

    function renderRemindersSections() {
        const box = document.getElementById('reminders-sections');
        if (!box) return;
        const r = updReminders();
        box.innerHTML = ['weight', 'measurement', 'photo'].map(key => {
            const cfg = r[key];
            const meta = REMINDER_META[key];
            const on = cfg.enabled;
            return `
                <div class="border-2 ${on ? 'border-indigo-200' : 'border-slate-200'} rounded-3xl p-4">
                    <label class="flex items-center justify-between gap-3 cursor-pointer">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 ${on ? 'bg-indigo-600' : 'bg-slate-300'} rounded-xl flex items-center justify-center flex-shrink-0">
                                <i data-lucide="${meta.icon}" class="w-5 h-5 text-white"></i>
                            </div>
                            <div>
                                <p class="font-black text-sm">${meta.label}</p>
                                <p class="text-[11px] text-slate-400">${meta.desc}</p>
                            </div>
                        </div>
                        <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleReminder('${key}', this.checked)" class="w-6 h-6 accent-indigo-600 flex-shrink-0">
                    </label>

                    <div id="reminder-body-${key}" class="${on ? '' : 'hidden'} mt-4 space-y-3">
                        <div>
                            <label class="text-[9px] font-black uppercase text-slate-400 block mb-1.5">How often</label>
                            <div class="grid grid-cols-4 gap-1">
                                ${['daily', 'weekly', 'monthly', 'custom'].map(f => `
                                    <button onclick="setReminderFreq('${key}', '${f}')" class="py-2 rounded-lg text-[10px] font-black uppercase ${cfg.frequency === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}">${f}</button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Weekly: pick weekday(s) -->
                        <div id="reminder-weekly-${key}" class="${cfg.frequency === 'weekly' || cfg.frequency === 'custom' ? '' : 'hidden'}">
                            <label class="text-[9px] font-black uppercase text-slate-400 block mb-1.5">${cfg.frequency === 'custom' ? 'Pick your days' : 'Which day'}</label>
                            <div class="grid grid-cols-7 gap-1">
                                ${WEEKDAYS.map((d, i) => `
                                    <button onclick="toggleReminderDay('${key}', ${i})" class="py-2 rounded-lg text-[9px] font-black ${(cfg.customDays || []).indexOf(i) >= 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}">${d[0]}</button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Monthly: pick day of month -->
                        <div id="reminder-monthly-${key}" class="${cfg.frequency === 'monthly' ? '' : 'hidden'}">
                            <label class="text-[9px] font-black uppercase text-slate-400 block mb-1.5">Day of the month</label>
                            <select onchange="setReminderDate('${key}', this.value)" class="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none text-sm">
                                ${Array.from({length: 28}, (_, i) => i + 1).map(d => `<option value="${d}" ${cfg.customDate === d ? 'selected' : ''}>${d}${d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</option>`).join('')}
                            </select>
                            <p class="text-[10px] text-slate-400 mt-1">Days 1–28 so it works every month.</p>
                        </div>

                        ${key === 'measurement' || key === 'photo' || key === 'weight' ? `
                        <div class="bg-pink-50 border border-pink-100 rounded-xl p-2.5">
                            <p class="text-[10px] text-pink-700">💡 Using <b>custom</b> days can help track around a menstrual cycle — measuring at the same phase each month gives more accurate, comparable results (fluid shifts across the cycle can affect weight and measurements).</p>
                        </div>` : ''}

                        <div>
                            <label class="text-[9px] font-black uppercase text-slate-400 block mb-1.5">How to remind me</label>
                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="setReminderDelivery('${key}', 'alert')" class="p-3 rounded-xl text-xs font-bold ${cfg.delivery === 'alert' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}">
                                    <i data-lucide="bell" class="w-4 h-4 inline"></i> Sign-in alert
                                </button>
                                <button onclick="setReminderDelivery('${key}', 'ai')" class="p-3 rounded-xl text-xs font-bold ${cfg.delivery === 'ai' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}">
                                    <i data-lucide="sparkles" class="w-4 h-4 inline"></i> AI coach
                                </button>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">${cfg.delivery === 'alert'
                                ? 'A tick-box alert when you open the app, repeating daily until you log it or turn it off.'
                                : 'Your AI coach will mention it in conversation instead of a pop-up.'}</p>
                        </div>
                    </div>
                </div>`;
        }).join('');
        refreshIcons();
    }

    function toggleReminder(key, on) {
        updReminders()[key].enabled = on;
        renderRemindersSections();
    }
    function setReminderFreq(key, freq) {
        const cfg = updReminders()[key];
        cfg.frequency = freq;
        // Sensible defaults when switching
        if (freq === 'weekly' && (!cfg.customDays || cfg.customDays.length !== 1)) cfg.customDays = [cfg.customDays && cfg.customDays[0] != null ? cfg.customDays[0] : 1];
        renderRemindersSections();
    }
    function toggleReminderDay(key, day) {
        const cfg = updReminders()[key];
        if (!cfg.customDays) cfg.customDays = [];
        const i = cfg.customDays.indexOf(day);
        if (cfg.frequency === 'weekly') {
            cfg.customDays = [day]; // weekly = single day
        } else {
            if (i >= 0) cfg.customDays.splice(i, 1); else cfg.customDays.push(day);
        }
        renderRemindersSections();
    }
    function setReminderDate(key, d) {
        updReminders()[key].customDate = parseInt(d, 10);
    }
    function setReminderDelivery(key, mode) {
        updReminders()[key].delivery = mode;
        renderRemindersSections();
    }

    function saveProgressReminders() {
        saveState();
        closeProgressReminders();
        updateRemindersStatus();
        showToast('Reminders saved');
    }

    function updateRemindersStatus() {
        const el = document.getElementById('reminders-status');
        if (!el) return;
        const r = updReminders();
        const active = ['weight', 'measurement', 'photo'].filter(k => r[k].enabled);
        el.textContent = active.length === 0
            ? 'Weight, measurements & photos'
            : active.map(k => REMINDER_META[k].label.split(' ')[0]).join(', ') + ' on';
    }

    // ---- Is a given reminder due today? ----
    // A reminder is due if it's enabled, today matches its schedule, and it hasn't
    // already been completed for the current period.
    function isReminderDue(key) {
        const cfg = updReminders()[key];
        if (!cfg || !cfg.enabled) return false;

        const now = new Date();
        const today = localDateKey(now);
        const dow = now.getDay();       // 0..6
        const dom = now.getDate();      // 1..31
        const lastDone = cfg.lastDone;  // ISO date string or null

        // Has it been logged already for this period? If logged today, never due.
        if (lastDone === today) return false;

        if (cfg.frequency === 'daily') {
            return true; // due every day it hasn't been done
        }
        if (cfg.frequency === 'weekly') {
            const targetDay = (cfg.customDays && cfg.customDays[0] != null) ? cfg.customDays[0] : 1;
            return dow === targetDay;
        }
        if (cfg.frequency === 'custom') {
            return (cfg.customDays || []).indexOf(dow) >= 0;
        }
        if (cfg.frequency === 'monthly') {
            // Due on the chosen day of month (clamped for short months)
            const target = Math.min(cfg.customDate || 1, daysInThisMonth());
            return dom === target;
        }
        return false;
    }
    function daysInThisMonth() {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
    }

    function markReminderDone(key) {
        const cfg = updReminders()[key];
        if (!cfg) return;
        cfg.lastDone = localDateKey();
        saveState();
        refreshDueAlertBadgeSoon();
    }

    let alertQueue = [];
    let alertIndex = 0;

    function getDueAlerts() {
        return ['weight', 'measurement', 'photo'].filter(k =>
            updReminders()[k].delivery === 'alert' && isReminderDue(k)
        );
    }

    function maybeShowUpdateAlerts() {
        alertQueue = getDueAlerts();
        alertIndex = 0;
        if (alertQueue.length > 0) {
            showCurrentAlert();
        }
    }

    function showCurrentAlert() {
        const key = alertQueue[alertIndex];
        if (!key) { document.getElementById('update-alerts-modal').style.display = 'none'; return; }
        const meta = REMINDER_META[key];

        const progressEl = document.getElementById('update-alert-progress');
        const titleEl = document.getElementById('update-alert-title');
        const bodyEl = document.getElementById('update-alert-body');
        const checkLabel = document.getElementById('update-alert-check-label');
        const check = document.getElementById('update-alert-check');
        const nextBtn = document.getElementById('update-alert-next');

        progressEl.textContent = alertQueue.length > 1 ? `Update ${alertIndex + 1} of ${alertQueue.length}` : 'Reminder';
        titleEl.textContent = 'Time for a ' + meta.label.toLowerCase() + ' update';
        bodyEl.textContent = 'Take a moment to log your ' + meta.label.toLowerCase() + '. Tick below once done, or come back to it later.';
        checkLabel.textContent = "I've logged my " + meta.label.toLowerCase() + " (or I'll do it now)";
        check.checked = false;
        nextBtn.textContent = (alertIndex >= alertQueue.length - 1) ? 'Finish' : 'Next';

        document.getElementById('update-alerts-modal').style.display = 'flex';
        refreshIcons();
    }

    function updateAlertNext() {
        const key = alertQueue[alertIndex];
        const check = document.getElementById('update-alert-check');
        if (check && check.checked) {
            markReminderDone(key);
            openLoggerFor(key);
        }
        alertIndex++;
        if (alertIndex >= alertQueue.length) {
            document.getElementById('update-alerts-modal').style.display = 'none';
        } else {
            showCurrentAlert();
        }
    }

    function snoozeUpdateAlerts() {
        document.getElementById('update-alerts-modal').style.display = 'none';
    }

    function openLoggerFor(key) {
        const am = document.getElementById('update-alerts-modal');
        if (am) am.style.display = 'none';
        setTimeout(() => {
            switchTab('metrics');
            setTimeout(() => {
                if (key === 'weight' && typeof openRecordWeightModal === 'function') openRecordWeightModal();
                else if (key === 'measurement' && typeof openRecordMeasurementsModal === 'function') openRecordMeasurementsModal();
                else if (key === 'photo' && typeof openProgressPhotosModal === 'function') openProgressPhotosModal();
            }, 200);
        }, 200);
    }

    function refreshDueAlertBadgeSoon() {
    }


    function shiftP() {
        if (!state.shiftProfile) state.shiftProfile = JSON.parse(JSON.stringify(DEFAULT_STATE.shiftProfile));
        return state.shiftProfile;
    }

    function renderShiftWorker() {
        const box = document.getElementById('shift-worker-content');
        if (!box) return;
        const sp = shiftP();

        if (!sp.acknowledgedDisclaimer) {
            box.innerHTML = shiftDisclaimerHTML();
            refreshIcons();
            return;
        }

        const hasSavedRota = isPlainRecord(sp.rota) && Object.keys(sp.rota).length > 0;
        if (!sp.enabled && !hasSavedRota) {
            box.innerHTML = `
                <div class="glass-card p-6 rounded-[2.5rem] text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-indigo-50 rounded-2xl flex items-center justify-center">
                        <i data-lucide="moon" class="w-8 h-8 text-indigo-600"></i>
                    </div>
                    <h3 class="text-xl font-black mb-2">Shift Worker Mode</h3>
                    <p class="text-sm text-slate-500 mb-5">Meal timing and training built around your shift pattern, using circadian-rhythm science. Working nights makes your body eat and train "against the clock" — this helps you work with it.</p>
                    <button onclick="openShiftSetup()" class="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold hover:bg-indigo-700">Set Up My Shift</button>
                    <button onclick="reshowShiftDisclaimer()" class="w-full mt-2 text-xs text-slate-400 font-bold">Review the health disclaimer</button>
                </div>`;
            refreshIcons();
            return;
        }

        box.innerHTML = shiftPlanHTML();
        refreshIcons();
    }

    function shiftDisclaimerHTML() {
        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <div class="w-16 h-16 mx-auto mb-4 bg-amber-50 rounded-2xl flex items-center justify-center">
                    <i data-lucide="heart-pulse" class="w-8 h-8 text-amber-500"></i>
                </div>
                <h3 class="text-xl font-black text-center mb-3">Before you start — please read</h3>
                <div class="space-y-3 text-sm text-slate-600 mb-5">
                    <p><b>This is general guidance, not medical advice.</b> The suggestions here are based on published research on shift work and circadian rhythms, but they are not a substitute for professional medical care.</p>
                    <p><b>Speak to your GP first.</b> This is especially important if you have diabetes or take glucose-lowering medication (including insulin), have heart or blood-pressure conditions, are pregnant or breastfeeding, have a history of disordered eating, or take any regular medication. Meal-timing and fasting changes can affect these conditions and medications.</p>
                    <p><b>Fasting isn't for everyone.</b> The optional fasting features should not be used by anyone for whom fasting is unsafe. If in doubt, don't — and ask your GP.</p>
                    <p class="text-xs text-slate-400">VFIT is a tracking tool. It can't see your medical history and doesn't know your individual needs. Always prioritise advice from a qualified healthcare professional over anything shown here.</p>
                </div>
                <label class="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl cursor-pointer mb-3">
                    <input type="checkbox" id="shift-disclaimer-check" class="w-6 h-6 accent-indigo-600 flex-shrink-0 mt-0.5">
                    <span class="text-sm font-bold">I understand this is not medical advice, and I'll speak to my GP before making significant changes — especially regarding any health conditions or medication.</span>
                </label>
                <button onclick="acceptShiftDisclaimer()" class="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold hover:bg-indigo-700">I Understand — Continue</button>
            </div>`;
    }

    function acceptShiftDisclaimer() {
        const cb = document.getElementById('shift-disclaimer-check');
        if (!cb || !cb.checked) { showToast('Please tick the box to confirm you understand'); return; }
        shiftP().acknowledgedDisclaimer = true;
        saveState();
        renderShiftWorker();
    }

    function reshowShiftDisclaimer() {
        shiftP().acknowledgedDisclaimer = false;
        saveState();
        renderShiftWorker();
    }

    function openShiftSetup() {
        const sp = shiftP();
        const modal = document.getElementById('shift-setup-modal');
        if (!modal) return;
        document.getElementById('shift-type-select').value = sp.shiftType;
        document.getElementById('shift-start-input').value = sp.shiftStart;
        document.getElementById('shift-end-input').value = sp.shiftEnd;
        document.getElementById('shift-goal-select').value = sp.goal;
        document.getElementById('shift-fasting-check').checked = !!sp.useFasting;
        [0,1,2,3,4,5,6].forEach(d => {
            const cb = document.getElementById('shift-day-' + d);
            if (cb) cb.checked = (sp.workDays || []).indexOf(d) >= 0;
        });
        toggleFastingVisibility();
        modal.style.display = 'flex';
        refreshIcons();
    }

    function closeShiftSetup() {
        document.getElementById('shift-setup-modal').style.display = 'none';
    }

    function toggleFastingVisibility() {
        const goal = document.getElementById('shift-goal-select').value;
        const wrap = document.getElementById('shift-fasting-wrap');
        if (wrap) wrap.style.display = (goal === 'fat_loss') ? '' : 'none';
    }

    function saveShiftSetup() {
        const sp = shiftP();
        sp.shiftType = document.getElementById('shift-type-select').value;
        sp.shiftStart = document.getElementById('shift-start-input').value || '19:00';
        sp.shiftEnd = document.getElementById('shift-end-input').value || '07:00';
        sp.goal = document.getElementById('shift-goal-select').value;
        sp.useFasting = (sp.goal === 'fat_loss') && document.getElementById('shift-fasting-check').checked;
        sp.workDays = [0,1,2,3,4,5,6].filter(d => {
            const cb = document.getElementById('shift-day-' + d);
            return cb && cb.checked;
        });
        sp.enabled = true;
        saveState();
        closeShiftSetup();
        renderShiftWorker();
        showToast('Shift plan ready 🌙');
    }

    function hmToMin(hm) {
        const [h, m] = (hm || '0:0').split(':').map(Number);
        return (h * 60 + (m || 0));
    }
    function minToHM(min) {
        min = ((min % 1440) + 1440) % 1440;
        const h = Math.floor(min / 60), m = min % 60;
        const ap = h < 12 ? 'am' : 'pm';
        let h12 = h % 12; if (h12 === 0) h12 = 12;
        return `${h12}:${String(m).padStart(2, '0')}${ap}`;
    }
    function shiftPlanHTML() {
        const sp = shiftP();
        const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(state.viewDate || '')) ? state.viewDate : localDateKey();
        const shift = getShiftForDate(dateKey);
        const type = ['night', 'early', 'day'].includes(shift.type) ? shift.type : 'off';
        const onShift = type !== 'off';
        const isNight = type === 'night';
        const isEarly = type === 'early';
        const labels = { off: 'Rest / Off Day', day: 'Day Shift', early: 'Early Shift', night: 'Night Shift' };
        const icons = { off: '☀️', day: '🏢', early: '🌅', night: '🌙' };
        const date = new Date(dateKey + 'T12:00:00');
        const dateLabel = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const sourceLabel = shift.source === 'rota' ? 'Saved rota' : shift.source === 'pattern' ? 'Normal weekly pattern' : 'No shift scheduled';
        const timeLabel = onShift && shift.start ? `${minToHM(hmToMin(shift.start))} – ${minToHM(hmToMin(shift.end || shift.start))}` : '';
        let html = '';

        html += `
            <div class="glass-card p-5 rounded-[2.5rem]" data-shift-nutrition-type="${type}" data-shift-nutrition-date="${dateKey}">
                <div class="flex items-center gap-2 mb-4">
                    <button onclick="changeNutritionDate(-1)" class="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center" aria-label="Previous nutrition day"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                    <label class="flex-1 text-center"><span class="block text-[10px] font-black uppercase text-slate-400">Nutrition plan date</span><input type="date" id="shift-nutrition-date-picker" value="${dateKey}" onchange="selectNutritionDate(this.value)" class="w-full bg-transparent text-sm font-black text-center outline-none"></label>
                    <button onclick="changeNutritionDate(1)" class="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center" aria-label="Next nutrition day"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                </div>
                <div class="flex justify-between items-start gap-3 mb-2">
                    <div>
                        <p class="text-[10px] font-black uppercase text-orange-500">${sourceLabel} · ${dateLabel}</p>
                        <h3 class="text-xl font-black">${icons[type]} ${labels[type]}</h3>
                    </div>
                    <div class="flex flex-col gap-2 flex-shrink-0"><button onclick="openShiftRotaFromNutrition()" class="text-xs font-bold text-orange-700 bg-orange-50 px-3 py-2 rounded-xl">Open Rota</button><button onclick="openShiftSetup()" class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl">Pattern</button></div>
                </div>
                <p class="text-sm text-slate-500">${onShift
                    ? `Your ${labels[type].toLowerCase()} runs ${timeLabel}. The meals, training and recovery below use this date's saved shift.`
                    : 'This date is a rest/off day, so the plan switches to daytime eating and recovery. Changes made in your rota update this automatically.'}
                </p>
            </div>`;

        html += onShift
            ? (isNight ? nightShiftMealHTML(shift) : isEarly ? earlyShiftMealHTML(shift) : dayShiftMealHTML(shift))
            : offDayMealHTML();

        html += dietaryShiftFocusHTML(type);
        html += shiftMealIdeasHTML(type, dateKey);
        html += shiftTrainingHTML(onShift, isNight, isEarly);

        const dietaryApproaches = dietaryProfile().approaches || [];
        if ((sp.goal === 'fat_loss' && sp.useFasting) || dietaryApproaches.includes('intermittent_fasting')) html += fastingGuidanceHTML(onShift, type);

        html += shiftFoodIdeasHTML(isNight && onShift, dateKey);
        html += shiftScienceHTML();

        html += `
            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p class="text-xs text-amber-800"><b>Not medical advice.</b> This is general guidance. Speak to your GP before significant changes, especially with any health condition or medication. <button onclick="reshowShiftDisclaimer()" class="underline font-bold">Review disclaimer</button></p>
            </div>`;

        return html;
    }

    function openShiftRotaFromNutrition() {
        if (openPreferencesAndGoals('coaching')) openCoachingPage('shifts');
    }


    const DIETARY_PATTERN_LABELS = Object.freeze({
        balanced: 'Balanced / no specific diet',
        vegan: 'Vegan',
        vegetarian: 'Vegetarian',
        ketogenic: 'Ketogenic'
    });
    const DIETARY_APPROACH_LABELS = Object.freeze({
        intermittent_fasting: 'Intermittent fasting',
        calorie_deficit: 'Calorie deficit'
    });
    const DIETARY_REQUIREMENT_LABELS = Object.freeze({
        dairy_free: 'Dairy-free',
        gluten_free: 'Gluten-free',
        nut_free: 'Nut-free',
        egg_free: 'Egg-free',
        fish_free: 'Fish / seafood-free',
        soy_free: 'Soy-free',
        sesame_free: 'Sesame-free',
        halal: 'Halal',
        kosher: 'Kosher',
        religious_cultural: 'Religious / cultural requirement',
        other: 'Other / allergy detail supplied'
    });

    function inferDietaryRequirementsFromText(value) {
        const text = String(value || '').toLowerCase();
        const inferred = [];
        if (/\b(dairy|milk|lactose)\b/.test(text)) inferred.push('dairy_free');
        if (/\b(gluten|coeliac|celiac|wheat)\b/.test(text)) inferred.push('gluten_free');
        if (/\b(nut|nuts|peanut|almond|walnut|cashew|hazelnut)\b/.test(text)) inferred.push('nut_free');
        if (/\b(egg|eggs)\b/.test(text)) inferred.push('egg_free');
        if (/\b(fish|seafood|shellfish|prawn|shrimp)\b/.test(text)) inferred.push('fish_free');
        if (/\b(soy|soya)\b/.test(text)) inferred.push('soy_free');
        if (/\b(sesame|tahini)\b/.test(text)) inferred.push('sesame_free');
        if (/\bhalal\b/.test(text)) inferred.push('halal');
        if (/\bkosher\b/.test(text)) inferred.push('kosher');
        return Array.from(new Set(inferred));
    }

    function dietaryProfile() {
        if (!isPlainRecord(state.dietaryProfile)) state.dietaryProfile = deepClone(DEFAULT_STATE.dietaryProfile);
        const profile = state.dietaryProfile;
        if (!['balanced', 'vegan', 'vegetarian', 'ketogenic'].includes(profile.pattern)) profile.pattern = 'balanced';
        if (!Array.isArray(profile.approaches)) profile.approaches = [];
        if (!Array.isArray(profile.requirements)) profile.requirements = [];
        profile.notes = String(profile.notes || '').slice(0, 750);
        return profile;
    }

    function dietaryPatternLabel(pattern) {
        return DIETARY_PATTERN_LABELS[pattern] || DIETARY_PATTERN_LABELS.balanced;
    }

    function dietaryProfileBadgesHTML(profileInput) {
        const profile = profileInput || dietaryProfile();
        const labels = [dietaryPatternLabel(profile.pattern)]
            .concat((profile.approaches || []).map(value => DIETARY_APPROACH_LABELS[value]).filter(Boolean))
            .concat((profile.requirements || []).map(value => DIETARY_REQUIREMENT_LABELS[value]).filter(Boolean));
        return labels.map((label, index) => `<span class="text-[10px] font-black px-2 py-1 rounded-full ${index === 0 ? 'bg-slate-900 text-orange-300' : 'bg-orange-50 text-orange-800 border border-orange-200'}">${escapeHtml(label)}</span>`).join('');
    }

    function openDietaryProfile() {
        const profile = dietaryProfile();
        document.querySelectorAll('input[name="dietary-pattern"]').forEach(input => {
            input.checked = input.value === profile.pattern;
        });
        const fasting = document.getElementById('dietary-approach-fasting');
        const deficit = document.getElementById('dietary-approach-deficit');
        if (fasting) fasting.checked = profile.approaches.includes('intermittent_fasting');
        if (deficit) deficit.checked = profile.approaches.includes('calorie_deficit');
        document.querySelectorAll('input[name="dietary-requirement"]').forEach(input => {
            input.checked = profile.requirements.includes(input.value);
        });
        const notes = document.getElementById('dietary-profile-notes');
        if (notes) notes.value = profile.notes;
        const modal = document.getElementById('dietary-profile-modal');
        if (modal) modal.style.display = 'flex';
        refreshIcons();
    }

    function closeDietaryProfile() {
        const modal = document.getElementById('dietary-profile-modal');
        if (modal) modal.style.display = 'none';
    }

    function saveDietaryProfile() {
        const selectedPattern = document.querySelector('input[name="dietary-pattern"]:checked');
        if (!selectedPattern) {
            showToast('Choose a diet style, including balanced / no specific diet');
            return;
        }
        const profile = dietaryProfile();
        profile.pattern = selectedPattern.value;
        profile.approaches = [
            document.getElementById('dietary-approach-fasting')?.checked ? 'intermittent_fasting' : '',
            document.getElementById('dietary-approach-deficit')?.checked ? 'calorie_deficit' : ''
        ].filter(Boolean);
        profile.notes = String(document.getElementById('dietary-profile-notes')?.value || '').trim().slice(0, 750);
        const selectedRequirements = Array.from(document.querySelectorAll('input[name="dietary-requirement"]:checked'))
            .map(input => input.value)
            .filter(value => DIETARY_REQUIREMENT_LABELS[value]);
        profile.requirements = Array.from(new Set(selectedRequirements.concat(inferDietaryRequirementsFromText(profile.notes))));
        profile.completed = true;
        profile.source = 'coaching-questionnaire';
        profile.updatedAt = new Date().toISOString();
        saveState();
        closeDietaryProfile();
        renderCoachingHub();
        renderShiftWorker();
        showToast(`${dietaryPatternLabel(profile.pattern)} plan saved · meal choices updated`, 5000);
    }

    function applyDietaryCoachAnswers(answers) {
        const values = answers || {};
        if (!values.dietPattern) return false;
        const profile = dietaryProfile();
        profile.pattern = ['balanced', 'vegan', 'vegetarian', 'ketogenic'].includes(values.dietPattern)
            ? values.dietPattern
            : 'balanced';
        const approachMap = {
            none: [],
            intermittent_fasting: ['intermittent_fasting'],
            calorie_deficit: ['calorie_deficit'],
            fasting_deficit: ['intermittent_fasting', 'calorie_deficit']
        };
        profile.approaches = approachMap[values.dietApproach] || [];
        const requirementMap = {
            none: [],
            allergy: ['other'],
            faith: ['religious_cultural'],
            other: ['other']
        };
        profile.notes = String(values.dietRequirementDetails || '').trim().slice(0, 750);
        profile.requirements = Array.from(new Set(
            (requirementMap[values.dietRequirementOverview] || []).concat(inferDietaryRequirementsFromText(profile.notes))
        ));
        profile.completed = true;
        profile.source = 'ai-coach-conversation';
        profile.updatedAt = new Date().toISOString();
        return true;
    }

    function dietaryShiftFocusLines(type, profileInput) {
        const profile = profileInput || dietaryProfile();
        const shiftLines = {
            night: 'Anchor the largest meal after waking or before the shift, then use lighter planned food through the biological night.',
            early: 'Prepare breakfast and the first break meal the evening before so food planning does not reduce sleep.',
            day: 'Pack the main work-break meal and keep a planned option ready for the pre- or post-shift training window.',
            off: 'Return meals to daytime hours and batch-prepare food for the next run of shifts.'
        };
        const patternLines = {
            balanced: 'Build each main meal around a clear protein source, vegetables or fruit, and a portion of carbohydrate that fits the day.',
            vegan: 'Use a substantial plant-protein anchor at each meal—such as tofu, tempeh, seitan, beans, lentils or a fortified protein product.',
            vegetarian: 'Rotate eggs, dairy or fortified alternatives, tofu, beans and lentils so each meal has a deliberate protein source.',
            ketogenic: 'Prioritise protein, non-starchy vegetables and measured fats; hydration and electrolyte needs deserve extra attention during long shifts.'
        };
        const lines = [
            shiftLines[type] || shiftLines.off,
            patternLines[profile.pattern] || patternLines.balanced
        ];
        if ((profile.approaches || []).includes('calorie_deficit')) {
            lines.push('Suggested portions are reduced by about 15% in the planner; keep protein and vegetables in place rather than skipping both.');
        }
        if ((profile.approaches || []).includes('intermittent_fasting')) {
            lines.push(type === 'night'
                ? 'Do not force a fasting window through a safety-critical night shift. Place the eating window after waking and stop if alertness, wellbeing or performance suffers.'
                : 'Keep the eating window consistent with this shift and do not let fasting displace hydration, recovery or adequate protein.');
        }
        if ((profile.requirements || []).length || profile.notes) {
            lines.push('VFIT hides obvious matches for selected exclusions, but you must still check labels, certification and cross-contamination.');
        }
        return lines;
    }

    function dietaryShiftCoachAdvice(type) {
        const profile = dietaryProfile();
        if (!profile.completed) return 'Complete Dietary Plan & Meals in the Coaching Hub so food advice can reflect your requirements.';
        return `Dietary focus: ${dietaryShiftFocusLines(type, profile).join(' ')}`;
    }

    function dietaryShiftFocusHTML(type) {
        const profile = dietaryProfile();
        if (!profile.completed) {
            return `<div class="bg-orange-50 border-2 border-orange-200 rounded-[2rem] p-5">
                <p class="text-[10px] font-black uppercase text-orange-600">Dietary plan needed</p>
                <h3 class="font-black text-lg mt-1">Personalise these shift meals</h3>
                <p class="text-xs text-orange-900 mt-2">Answer the Coaching Hub dietary questions to set vegan, vegetarian, ketogenic, fasting, calorie-deficit and dietary-requirement preferences.</p>
                <button onclick="openDietaryProfile()" class="w-full mt-3 bg-slate-900 text-white p-3 rounded-xl font-black text-xs">Answer Dietary Questions</button>
            </div>`;
        }
        const lines = dietaryShiftFocusLines(type, profile);
        return `<details open class="bg-slate-900 border border-orange-500 text-white rounded-[2rem] p-5">
            <summary class="font-black cursor-pointer">Your Personalised Dietary Focus</summary>
            <div class="mt-3">
                <div class="flex flex-wrap gap-1.5 mb-3">${dietaryProfileBadgesHTML(profile)}</div>
                <ul class="space-y-2">${lines.map(line => `<li class="flex items-start gap-2 text-xs text-slate-200"><span class="text-orange-400 font-black">•</span><span>${escapeHtml(line)}</span></li>`).join('')}</ul>
                ${profile.notes ? `<div class="mt-3 bg-white/10 border border-white/10 p-3 rounded-xl"><p class="text-[10px] font-black uppercase text-orange-300">Your instructions</p><p class="text-xs text-slate-200 mt-1">${escapeHtml(profile.notes)}</p></div>` : ''}
                <button onclick="openDietaryProfile()" class="mt-3 text-xs font-black text-orange-300 underline">Update dietary plan</button>
            </div>
        </details>`;
    }

    function renderDietaryProfileSummary() {
        const box = document.getElementById('dietary-profile-summary');
        if (!box) return;
        const profile = dietaryProfile();
        if (!profile.completed) {
            box.innerHTML = `<div class="bg-orange-50 border border-orange-200 p-4 rounded-2xl">
                <p class="font-black text-sm text-orange-900">Questions not completed yet</p>
                <p class="text-xs text-orange-800 mt-1">The AI Coach will ask on your next conversation, or you can fill them in now.</p>
            </div>`;
            return;
        }
        const requirementText = (profile.requirements || []).length
            ? profile.requirements.map(value => DIETARY_REQUIREMENT_LABELS[value] || value).join(' · ')
            : 'No selected exclusions';
        box.innerHTML = `<div class="bg-slate-50 p-4 rounded-2xl">
            <div class="flex flex-wrap gap-1.5 mb-3">${dietaryProfileBadgesHTML(profile)}</div>
            <p class="text-xs text-slate-500"><b>Requirements:</b> ${escapeHtml(requirementText)}</p>
            ${profile.notes ? `<p class="text-xs text-slate-500 mt-2"><b>Your instructions:</b> ${escapeHtml(profile.notes)}</p>` : ''}
            <p class="text-[10px] text-slate-400 mt-3">Last updated ${profile.updatedAt ? escapeHtml(new Date(profile.updatedAt).toLocaleDateString('en-GB')) : 'today'}.</p>
        </div>`;
    }

    function renderDietaryShiftSummary() {
        const box = document.getElementById('dietary-shift-summary');
        if (!box) return;
        const shift = getShiftForDate(localDateKey());
        const profile = dietaryProfile();
        const label = aiCoachShiftLabel(shift);
        const lines = dietaryShiftFocusLines(shift.type, profile);
        box.innerHTML = `<div class="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
            <p class="text-[10px] font-black uppercase text-orange-600">${escapeHtml(label)}</p>
            <p class="font-black text-sm mt-1">${profile.completed ? escapeHtml(dietaryPatternLabel(profile.pattern)) : 'Complete your dietary questions'}</p>
            <p class="text-xs text-slate-500 mt-2">${escapeHtml(lines[0])}</p>
            ${profile.completed ? `<p class="text-xs text-slate-500 mt-2">${escapeHtml(lines.slice(1).join(' '))}</p>` : ''}
        </div>`;
    }

    function openDietaryMeals() {
        switchTab('nutrition');
        setNutritionTab('shift');
        setTimeout(() => {
            const target = document.querySelector('[data-shift-meal-ideas]');
            if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    }


    // Each shift keeps its original four-choice balanced rotation. The dietary
    // layer below adds another compatible option or swaps in a five-recipe
    // vegan, vegetarian or ketogenic library without mixing shift base lists.
    const SHIFT_MEAL_IDEAS = Object.freeze({
        night: Object.freeze({
            breakfast: Object.freeze([
                { id: 'night-breakfast-oats', name: 'Protein overnight oats with berries', calories: 485, protein: 36, carbs: 58, fat: 12, fiber: 9, note: 'Oats, Greek yogurt, whey and berries prepared ahead as one filling meal after waking.' },
                { id: 'night-breakfast-yogurt-bowl', name: 'Greek yogurt, banana and granola bowl', calories: 455, protein: 34, carbs: 57, fat: 10, fiber: 7, note: 'A quick no-cook first meal with fruit, wholegrain carbohydrate and a clear protein serving.' },
                { id: 'night-breakfast-eggs-beans', name: 'Eggs, beans and wholegrain toast', calories: 510, protein: 32, carbs: 58, fat: 17, fiber: 13, note: 'A hot meal after waking that combines protein and high-fibre carbohydrate before the shift.' },
                { id: 'night-breakfast-smoothie', name: 'Protein berry smoothie with oats', calories: 470, protein: 38, carbs: 55, fat: 11, fiber: 10, note: 'Milk, whey, berries, oats and a small spoon of peanut butter blended for busy nights.' }
            ]),
            lunch: Object.freeze([
                { id: 'night-lunch-chicken-rice', name: 'Chicken, brown rice and roasted veg bowl', calories: 610, protein: 48, carbs: 67, fat: 16, fiber: 9, note: 'A filling pre-shift meal-prep bowl with protein, vegetables and slow-release carbohydrate.' },
                { id: 'night-lunch-salmon-potato', name: 'Salmon, baby potatoes and green vegetables', calories: 625, protein: 43, carbs: 59, fat: 23, fiber: 10, note: 'A substantial anchor meal around two hours before work, with oily fish and vegetables.' },
                { id: 'night-lunch-turkey-chilli', name: 'Turkey and bean chilli with rice', calories: 640, protein: 49, carbs: 72, fat: 17, fiber: 14, note: 'A batch-cook option with lean protein and fibre to help control hunger later in the shift.' },
                { id: 'night-lunch-tofu-noodles', name: 'Tofu and edamame noodle stir-fry', calories: 590, protein: 36, carbs: 68, fat: 20, fiber: 12, note: 'A plant-based pre-shift meal with vegetables, soy protein and moderate carbohydrate.' }
            ]),
            dinner: Object.freeze([
                { id: 'night-dinner-turkey-wrap', name: 'Turkey, hummus and salad wholegrain wrap', calories: 465, protein: 39, carbs: 48, fat: 13, fiber: 8, note: 'A lighter, portable dinner for early in the shift when a large meal would feel too heavy.' },
                { id: 'night-dinner-tuna-couscous', name: 'Tuna and vegetable couscous pot', calories: 450, protein: 38, carbs: 52, fat: 10, fiber: 8, note: 'Easy to pack and eat cold, with enough protein for a main break without a heavy portion.' },
                { id: 'night-dinner-chicken-soup', name: 'Chicken and vegetable soup with a wholegrain roll', calories: 430, protein: 36, carbs: 49, fat: 10, fiber: 9, note: 'A warm but lighter early-shift meal that is practical to batch-cook and reheat.' },
                { id: 'night-dinner-jacket-potato', name: 'Cottage cheese jacket potato with salad', calories: 475, protein: 32, carbs: 66, fat: 9, fiber: 10, note: 'A simple early-shift dinner with a high-protein topping and plenty of fibre.' }
            ]),
            snack: Object.freeze([
                { id: 'night-snack-yogurt', name: 'Greek yogurt, berries and almonds', calories: 275, protein: 24, carbs: 22, fat: 10, fiber: 5, note: 'A protein-forward option that is easy to portion and carry for a mid-shift break.' },
                { id: 'night-snack-shake-banana', name: 'Protein shake with a banana', calories: 260, protein: 28, carbs: 32, fat: 3, fiber: 4, note: 'A quick backup for unpredictable breaks, combining protein with an easy-to-carry fruit.' },
                { id: 'night-snack-cottage-oatcakes', name: 'Cottage cheese with oatcakes', calories: 290, protein: 26, carbs: 29, fat: 8, fiber: 5, note: 'A savoury snack with slow-digesting protein that can replace vending-machine food.' },
                { id: 'night-snack-eggs-fruit', name: 'Two boiled eggs with an apple', calories: 250, protein: 15, carbs: 27, fat: 10, fiber: 5, note: 'Prepared ahead for a smaller deep-night snack when genuinely hungry.' }
            ])
        }),
        early: Object.freeze({
            breakfast: Object.freeze([
                { id: 'early-breakfast-wrap', name: 'Egg, turkey and spinach breakfast wrap', calories: 435, protein: 35, carbs: 42, fat: 14, fiber: 6, note: 'A portable hot or cold breakfast that can be prepared the night before.' },
                { id: 'early-breakfast-porridge', name: 'Protein porridge with banana', calories: 445, protein: 34, carbs: 57, fat: 10, fiber: 9, note: 'Microwave or overnight oats make this practical before an early start.' },
                { id: 'early-breakfast-yogurt-pot', name: 'Greek yogurt overnight-oats pot', calories: 420, protein: 32, carbs: 52, fat: 9, fiber: 8, note: 'Prepare it before bed so breakfast does not reduce an already-short sleep window.' },
                { id: 'early-breakfast-sandwich', name: 'Egg and lean ham wholemeal sandwich', calories: 410, protein: 31, carbs: 43, fat: 13, fiber: 7, note: 'A portable breakfast for mornings when there is no time to sit down before leaving.' }
            ]),
            lunch: Object.freeze([
                { id: 'early-lunch-pasta', name: 'Chicken pesto pasta salad', calories: 575, protein: 45, carbs: 62, fat: 16, fiber: 7, note: 'Easy to pack and eat cold when a work break is short or unpredictable.' },
                { id: 'early-lunch-tuna-rice', name: 'Tuna, sweetcorn and rice pot', calories: 535, protein: 40, carbs: 65, fat: 12, fiber: 7, note: 'A portable balanced lunch that can be batch-prepared for several early shifts.' },
                { id: 'early-lunch-turkey-wrap', name: 'Turkey salad wrap with fruit', calories: 505, protein: 39, carbs: 59, fat: 12, fiber: 9, note: 'Quick to eat on a short break while still providing protein, carbohydrate and fibre.' },
                { id: 'early-lunch-chicken-soup', name: 'Chicken and lentil soup with wholegrain bread', calories: 550, protein: 43, carbs: 64, fat: 13, fiber: 14, note: 'A filling reheatable lunch with lean protein and high-fibre pulses.' }
            ]),
            dinner: Object.freeze([
                { id: 'early-dinner-stirfry', name: 'Lean beef vegetable stir-fry with rice', calories: 630, protein: 46, carbs: 70, fat: 18, fiber: 9, note: 'A substantial recovery meal with lean protein and vegetables soon after work.' },
                { id: 'early-dinner-salmon', name: 'Baked salmon, potatoes and broccoli', calories: 610, protein: 44, carbs: 56, fat: 23, fiber: 10, note: 'A balanced main meal early enough to protect the earlier bedtime needed for the next shift.' },
                { id: 'early-dinner-fajita', name: 'Chicken fajita rice bowl', calories: 620, protein: 49, carbs: 69, fat: 17, fiber: 11, note: 'Chicken, peppers, beans and rice make a colourful post-shift recovery meal.' },
                { id: 'early-dinner-turkey-pasta', name: 'Turkey tomato pasta with vegetables', calories: 600, protein: 47, carbs: 72, fat: 13, fiber: 12, note: 'A family-friendly batch meal that gives protein and carbohydrate without a very late dinner.' }
            ]),
            snack: Object.freeze([
                { id: 'early-snack-banana-yogurt', name: 'High-protein yogurt with banana', calories: 265, protein: 24, carbs: 35, fat: 3, fiber: 4, note: 'Quick carbohydrate and protein for a short morning break.' },
                { id: 'early-snack-eggs-oatcakes', name: 'Boiled eggs with oatcakes', calories: 270, protein: 18, carbs: 23, fat: 12, fiber: 4, note: 'A savoury option that can be packed the previous evening and eaten without reheating.' },
                { id: 'early-snack-cottage-fruit', name: 'Cottage cheese with berries', calories: 235, protein: 25, carbs: 21, fat: 6, fiber: 5, note: 'A lighter protein-rich snack for the morning or the journey home.' },
                { id: 'early-snack-shake-apple', name: 'Protein shake with an apple', calories: 250, protein: 27, carbs: 31, fat: 2, fiber: 5, note: 'A fast option to keep in reserve when an early shift delays the planned break.' }
            ])
        }),
        day: Object.freeze({
            breakfast: Object.freeze([
                { id: 'day-breakfast-porridge', name: 'Protein porridge with banana and cinnamon', calories: 450, protein: 33, carbs: 55, fat: 11, fiber: 9, note: 'Slow-release carbohydrate with a clear protein serving for steadier energy.' },
                { id: 'day-breakfast-eggs-toast', name: 'Scrambled eggs, tomatoes and wholegrain toast', calories: 430, protein: 30, carbs: 41, fat: 17, fiber: 8, note: 'A balanced cooked breakfast before the shift with protein, vegetables and wholegrains.' },
                { id: 'day-breakfast-yogurt-muesli', name: 'Greek yogurt, muesli and berries', calories: 425, protein: 31, carbs: 53, fat: 10, fiber: 9, note: 'A quick no-cook breakfast that is easy to scale around the day’s calorie target.' },
                { id: 'day-breakfast-bagel', name: 'Egg and smoked salmon wholemeal bagel', calories: 475, protein: 34, carbs: 49, fat: 16, fiber: 7, note: 'A higher-protein portable breakfast for a busy day shift.' }
            ]),
            lunch: Object.freeze([
                { id: 'day-lunch-tuna-potato', name: 'Tuna jacket potato with mixed salad', calories: 530, protein: 40, carbs: 65, fat: 12, fiber: 10, note: 'A practical main meal that is filling without being difficult to prepare.' },
                { id: 'day-lunch-chicken-quinoa', name: 'Chicken and quinoa rainbow salad', calories: 550, protein: 47, carbs: 54, fat: 16, fiber: 11, note: 'High in protein and vegetables, and suitable for preparing several portions.' },
                { id: 'day-lunch-burrito-bowl', name: 'Lean beef and bean burrito bowl', calories: 625, protein: 45, carbs: 72, fat: 18, fiber: 15, note: 'A filling work-break meal with lean protein, beans, rice and colourful vegetables.' },
                { id: 'day-lunch-falafel-chicken', name: 'Chicken and falafel wholegrain pitta', calories: 565, protein: 43, carbs: 61, fat: 17, fiber: 12, note: 'A portable pitta with salad and yogurt dressing for a lunch away from a microwave.' }
            ]),
            dinner: Object.freeze([
                { id: 'day-dinner-chilli', name: 'Turkey and bean chilli with rice', calories: 650, protein: 50, carbs: 72, fat: 18, fiber: 13, note: 'A batch-cook dinner with protein, vegetables and high-fibre carbohydrate.' },
                { id: 'day-dinner-cod', name: 'Baked cod, sweet potato and greens', calories: 585, protein: 48, carbs: 62, fat: 16, fiber: 12, note: 'A balanced dinner with lean protein, colourful vegetables and carbohydrate.' },
                { id: 'day-dinner-curry', name: 'Chicken and vegetable curry with basmati rice', calories: 635, protein: 48, carbs: 73, fat: 17, fiber: 11, note: 'A batch-friendly evening meal that can be portioned to the current calorie goal.' },
                { id: 'day-dinner-bolognese', name: 'Lean beef bolognese with wholewheat pasta', calories: 640, protein: 46, carbs: 76, fat: 17, fiber: 13, note: 'A familiar high-protein dinner with extra vegetables and wholewheat pasta.' }
            ]),
            snack: Object.freeze([
                { id: 'day-snack-cottage-cheese', name: 'Cottage cheese, apple and oatcakes', calories: 285, protein: 25, carbs: 28, fat: 8, fiber: 5, note: 'A portable snack that adds protein without relying on sweets or pastries.' },
                { id: 'day-snack-yogurt', name: 'High-protein yogurt with berries', calories: 220, protein: 24, carbs: 24, fat: 3, fiber: 5, note: 'A simple chilled snack for the gap between lunch and the end of the shift.' },
                { id: 'day-snack-hummus', name: 'Hummus, vegetable sticks and turkey slices', calories: 280, protein: 22, carbs: 24, fat: 11, fiber: 7, note: 'A savoury snack with crunch, fibre and a stronger protein contribution.' },
                { id: 'day-snack-shake', name: 'Protein shake with a small banana', calories: 245, protein: 27, carbs: 30, fat: 2, fiber: 4, note: 'A convenient option for a busy afternoon or before training after work.' }
            ])
        }),
        off: Object.freeze({
            breakfast: Object.freeze([
                { id: 'off-breakfast-eggs', name: 'Eggs, avocado and wholegrain toast', calories: 480, protein: 30, carbs: 45, fat: 20, fiber: 10, note: 'A balanced cooked breakfast with protein, fibre and satisfying fats.' },
                { id: 'off-breakfast-pancakes', name: 'Protein pancakes with yogurt and berries', calories: 465, protein: 37, carbs: 55, fat: 11, fiber: 8, note: 'A slower off-day breakfast that still provides a clear protein serving.' },
                { id: 'off-breakfast-oats', name: 'Apple-cinnamon protein oats', calories: 445, protein: 33, carbs: 58, fat: 9, fiber: 11, note: 'A high-fibre breakfast to help return meal timing to the daytime.' },
                { id: 'off-breakfast-shakshuka', name: 'Shakshuka with wholegrain toast', calories: 470, protein: 29, carbs: 50, fat: 18, fiber: 12, note: 'Eggs, tomatoes, peppers and toast make a vegetable-rich off-day meal.' }
            ]),
            lunch: Object.freeze([
                { id: 'off-lunch-quinoa', name: 'Chicken and quinoa rainbow salad', calories: 550, protein: 47, carbs: 54, fat: 16, fiber: 11, note: 'High in protein and vegetables, and suitable for preparing several portions.' },
                { id: 'off-lunch-omelette', name: 'Chicken and vegetable omelette with potatoes', calories: 570, protein: 45, carbs: 49, fat: 21, fiber: 9, note: 'A substantial daytime meal that works well before an off-day training session.' },
                { id: 'off-lunch-salmon-pitta', name: 'Salmon and salad wholegrain pitta', calories: 540, protein: 39, carbs: 51, fat: 19, fiber: 9, note: 'A quick lunch with oily fish, salad and a wholegrain carbohydrate source.' },
                { id: 'off-lunch-lentil-bowl', name: 'Lentil, chicken and roasted vegetable bowl', calories: 585, protein: 46, carbs: 63, fat: 16, fiber: 17, note: 'A high-fibre meal-prep bowl for daytime eating on a rest day.' }
            ]),
            dinner: Object.freeze([
                { id: 'off-dinner-cod', name: 'Baked cod, sweet potato and greens', calories: 585, protein: 48, carbs: 62, fat: 16, fiber: 12, note: 'A balanced dinner with lean protein, colourful vegetables and carbohydrate.' },
                { id: 'off-dinner-roast-chicken', name: 'Roast chicken, potatoes and vegetables', calories: 640, protein: 52, carbs: 65, fat: 19, fiber: 11, note: 'A balanced family meal that can also provide prepared portions for upcoming shifts.' },
                { id: 'off-dinner-beef-stew', name: 'Lean beef and vegetable stew', calories: 590, protein: 47, carbs: 58, fat: 18, fiber: 13, note: 'A batch-cook dinner with protein, root vegetables and beans.' },
                { id: 'off-dinner-tofu-curry', name: 'Tofu and chickpea curry with rice', calories: 620, protein: 32, carbs: 78, fat: 20, fiber: 16, note: 'A plant-based dinner with tofu, pulses and vegetables for protein and fibre.' }
            ]),
            snack: Object.freeze([
                { id: 'off-snack-smoothie', name: 'Protein berry smoothie with oats', calories: 320, protein: 30, carbs: 36, fat: 6, fiber: 8, note: 'Milk or a fortified alternative, protein, berries and oats blended together.' },
                { id: 'off-snack-yogurt-nuts', name: 'Greek yogurt with fruit and walnuts', calories: 285, protein: 24, carbs: 25, fat: 11, fiber: 5, note: 'A filling snack that combines protein, fruit and a measured portion of nuts.' },
                { id: 'off-snack-tuna-oatcakes', name: 'Tuna and cucumber oatcakes', calories: 265, protein: 25, carbs: 24, fat: 8, fiber: 5, note: 'A savoury high-protein option for an afternoon break.' },
                { id: 'off-snack-chocolate-yogurt', name: 'Chocolate protein yogurt pot', calories: 250, protein: 27, carbs: 28, fat: 4, fiber: 4, note: 'Greek yogurt, cocoa, berries and a little granola for a sweeter planned option.' }
            ])
        })
    });

    function dietaryMeal(id, name, calories, protein, carbs, fat, fiber, note, ingredients, kind, allergens) {
        return Object.freeze({
            id, name, calories, protein, carbs, fat, fiber, note,
            ingredients: String(ingredients || '').split('|').filter(Boolean),
            kind: kind || 'bowl',
            allergens: String(allergens || '').split('|').filter(Boolean)
        });
    }

    const DIETARY_MEAL_IDEAS = Object.freeze({
        vegan: Object.freeze({
            breakfast: Object.freeze([
                dietaryMeal('vegan-breakfast-overnight-oats', 'Vegan protein overnight oats with berries', 455, 32, 59, 10, 12, 'Prepare before sleep for a ready-to-eat first meal after waking.', '60g rolled oats|250ml fortified soy milk|30g pea protein|100g mixed berries|10g chia seeds', 'overnight', 'soy|gluten'),
                dietaryMeal('vegan-breakfast-tofu-wrap', 'Tofu scramble and spinach breakfast wrap', 440, 31, 43, 16, 9, 'Portable plant protein for an early start or the first meal after waking.', '180g firm tofu|1 wholegrain wrap|2 handfuls spinach|1 chopped tomato|Turmeric, pepper and 1 tsp oil', 'wrap', 'soy|gluten'),
                dietaryMeal('vegan-breakfast-berry-smoothie', 'Berry, banana and pea-protein smoothie', 420, 34, 55, 8, 10, 'A fast option when appetite is low after waking; blend immediately before drinking.', '300ml fortified soy milk|30g pea protein|1 small banana|120g frozen berries|30g rolled oats', 'blend', 'soy|gluten'),
                dietaryMeal('vegan-breakfast-chia-pot', 'Chocolate chia and soy-protein pot', 405, 31, 35, 17, 14, 'A chilled make-ahead breakfast with fibre and a deliberate protein serving.', '250ml fortified soy milk|30g chia seeds|25g chocolate plant protein|100g strawberries|1 tsp cocoa', 'overnight', 'soy'),
                dietaryMeal('vegan-breakfast-quinoa-porridge', 'Apple-cinnamon quinoa protein porridge', 450, 30, 61, 10, 11, 'Warm or reheat after waking and portion into a lidded pot for work.', '180g cooked quinoa|250ml fortified soy milk|25g pea protein|1 small apple|Cinnamon', 'simmer', 'soy')
            ]),
            lunch: Object.freeze([
                dietaryMeal('vegan-lunch-tofu-rice', 'Ginger tofu and brown-rice vegetable bowl', 555, 34, 68, 17, 13, 'A batch-cook work meal with soy protein, vegetables and steady carbohydrate.', '180g firm tofu|160g cooked brown rice|200g mixed vegetables|1 tbsp reduced-salt soy sauce|Ginger and 1 tsp oil', 'stirfry', 'soy'),
                dietaryMeal('vegan-lunch-lentil-quinoa', 'Lentil and quinoa rainbow salad', 520, 28, 70, 14, 18, 'Eat cold on a short break; add the dressing only when serving.', '180g cooked lentils|140g cooked quinoa|200g cucumber, tomato and peppers|40g spinach|Lemon and 1 tbsp olive oil', 'bowl', ''),
                dietaryMeal('vegan-lunch-chickpea-pasta', 'Chickpea pasta with peas and tomato pesto', 545, 32, 67, 16, 17, 'High-protein pasta that reheats well or works as a cold lunch pot.', '85g dry chickpea pasta|100g peas|150g cherry tomatoes|25g dairy-free pesto|Rocket leaves', 'simmer', 'nuts'),
                dietaryMeal('vegan-lunch-seitan-fajita', 'Seitan fajita wholegrain wrap', 525, 39, 57, 14, 11, 'A portable lunch for unpredictable breaks with vegetables and plant protein.', '160g seitan strips|1 large wholegrain wrap|150g peppers and onion|60g black beans|Salsa and lime', 'wrap', 'gluten'),
                dietaryMeal('vegan-lunch-tempeh-noodles', 'Tempeh and edamame noodle box', 570, 38, 64, 18, 15, 'Prepare two portions at once and chill promptly for the next shift.', '150g tempeh|140g cooked wholewheat noodles|80g edamame|180g stir-fry vegetables|1 tbsp reduced-salt soy sauce', 'stirfry', 'soy|gluten')
            ]),
            dinner: Object.freeze([
                dietaryMeal('vegan-dinner-tofu-curry', 'Tofu and chickpea vegetable curry with rice', 590, 34, 75, 18, 17, 'A reliable batch dinner that can become tomorrow’s packed shift meal.', '170g firm tofu|100g cooked chickpeas|150g cooked basmati rice|220g mixed vegetables|120ml light coconut milk and curry spices', 'simmer', 'soy'),
                dietaryMeal('vegan-dinner-lentil-chilli', 'Three-bean lentil chilli with brown rice', 575, 31, 84, 12, 23, 'Batch-cook, cool quickly and freeze individual portions for busy weeks.', '220g mixed cooked beans and lentils|150g cooked brown rice|200g chopped tomatoes|150g peppers and onion|Chilli, cumin and paprika', 'simmer', ''),
                dietaryMeal('vegan-dinner-seitan-stirfry', 'Seitan vegetable stir-fry with noodles', 560, 42, 62, 15, 12, 'A high-protein plant-based recovery meal ready in around 20 minutes.', '170g seitan strips|140g cooked wholewheat noodles|250g stir-fry vegetables|1 tbsp reduced-salt soy sauce|Garlic, ginger and 1 tsp oil', 'stirfry', 'soy|gluten'),
                dietaryMeal('vegan-dinner-chickpea-tagine', 'Chickpea and apricot tagine with quinoa', 565, 27, 83, 15, 20, 'A fibre-rich evening meal; keep dried fruit measured for predictable nutrition.', '220g cooked chickpeas|150g cooked quinoa|200g tomatoes and vegetables|25g dried apricots|Cumin, cinnamon and 1 tsp oil', 'simmer', ''),
                dietaryMeal('vegan-dinner-bean-traybake', 'Black-bean sweet-potato traybake', 540, 26, 78, 15, 20, 'Roast extra portions on an off day and reheat until piping hot.', '220g black beans|250g sweet potato cubes|200g peppers and courgette|60g avocado|Paprika, lime and 1 tsp oil', 'bake', '')
            ]),
            snack: Object.freeze([
                dietaryMeal('vegan-snack-soy-yogurt', 'High-protein soy yogurt with berries', 235, 22, 24, 7, 7, 'A chilled, portioned snack for the middle of a shift.', '250g high-protein soy yogurt|100g berries|10g pumpkin seeds', 'snack', 'soy'),
                dietaryMeal('vegan-snack-edamame', 'Edamame, cucumber and chilli-lime pot', 245, 21, 22, 9, 11, 'A savoury plant-protein snack that can be eaten cold.', '180g cooked edamame|100g cucumber|Lime juice|Chilli flakes and a pinch of salt', 'snack', 'soy'),
                dietaryMeal('vegan-snack-hummus', 'Hummus, vegetable sticks and seed crackers', 270, 12, 31, 12, 10, 'Pre-portion the hummus so a quick break still fits the plan.', '70g hummus|200g carrot, cucumber and pepper sticks|25g seed crackers', 'snack', 'sesame'),
                dietaryMeal('vegan-snack-protein-shake', 'Pea-protein shake with a small banana', 250, 28, 32, 3, 5, 'Keep a measured dry serving at work for a reliable backup.', '30g pea protein|300ml water or fortified plant milk|1 small banana|Ice and cinnamon', 'blend', ''),
                dietaryMeal('vegan-snack-roasted-chickpeas', 'Roasted chickpeas with an apple', 260, 13, 42, 6, 11, 'Crunchy, portable and easy to batch-portion for several shifts.', '120g cooked chickpeas|1 small apple|Paprika and garlic powder|1 tsp olive oil', 'bake', '')
            ])
        }),
        vegetarian: Object.freeze({
            breakfast: Object.freeze([
                dietaryMeal('vegetarian-breakfast-porridge', 'Protein porridge with banana and cinnamon', 440, 34, 56, 10, 9, 'A repeatable hot breakfast before a day or early shift.', '60g rolled oats|250ml semi-skimmed milk|30g whey or vegetarian protein|1 small banana|Cinnamon', 'simmer', 'dairy|gluten'),
                dietaryMeal('vegetarian-breakfast-egg-wrap', 'Egg, spinach and bean breakfast wrap', 445, 30, 45, 17, 10, 'Cook ahead, chill promptly and reheat for a fast shift breakfast.', '2 eggs|1 wholegrain wrap|80g black beans|2 handfuls spinach|Salsa', 'wrap', 'egg|gluten'),
                dietaryMeal('vegetarian-breakfast-yogurt', 'Greek yogurt, muesli and berry bowl', 425, 32, 52, 10, 9, 'No-cook and easy to portion the night before.', '250g Greek yogurt|45g no-added-sugar muesli|120g berries|10g mixed seeds', 'snack', 'dairy|gluten'),
                dietaryMeal('vegetarian-breakfast-cottage-toast', 'Cottage cheese, tomato and wholegrain toast', 410, 32, 43, 12, 8, 'A savoury breakfast with little preparation and a clear protein anchor.', '220g cottage cheese|2 slices wholegrain toast|150g tomatoes|Black pepper and herbs', 'snack', 'dairy|gluten'),
                dietaryMeal('vegetarian-breakfast-pancakes', 'Oat protein pancakes with yogurt and berries', 465, 37, 54, 12, 9, 'Cook a batch on an off day and reheat individual portions.', '60g oats|2 eggs|25g whey or vegetarian protein|100g Greek yogurt|100g berries', 'skillet', 'dairy|egg|gluten')
            ]),
            lunch: Object.freeze([
                dietaryMeal('vegetarian-lunch-halloumi', 'Halloumi and quinoa rainbow salad', 555, 31, 52, 25, 12, 'Pack the dressing separately to keep the vegetables crisp.', '100g halloumi|150g cooked quinoa|220g salad vegetables|50g chickpeas|Lemon and herbs', 'bowl', 'dairy'),
                dietaryMeal('vegetarian-lunch-egg-lentil', 'Egg and lentil potato salad', 520, 29, 58, 19, 15, 'A filling cold lunch that can be prepared for two shifts.', '2 boiled eggs|180g cooked lentils|200g baby potatoes|150g green vegetables|Mustard-yogurt dressing', 'bowl', 'egg|dairy'),
                dietaryMeal('vegetarian-lunch-mozzarella-pasta', 'Mozzarella, bean and tomato pasta pot', 545, 33, 67, 17, 15, 'Works warm or cold and travels well in a sealed container.', '75g dry wholewheat pasta|100g reduced-fat mozzarella|100g cannellini beans|180g tomatoes and spinach|Basil', 'simmer', 'dairy|gluten'),
                dietaryMeal('vegetarian-lunch-tofu-burrito', 'Tofu and black-bean burrito bowl', 560, 34, 70, 17, 17, 'Batch the rice, tofu and beans, then add fresh salsa at serving.', '160g firm tofu|130g cooked brown rice|100g black beans|180g peppers and corn|Salsa and lime', 'bowl', 'soy'),
                dietaryMeal('vegetarian-lunch-cottage-potato', 'Cottage cheese jacket potato with salad', 475, 32, 66, 9, 10, 'A simple microwave-friendly work lunch with a high-protein topping.', '1 medium baked potato|220g cottage cheese|200g mixed salad|Chives and black pepper', 'bake', 'dairy')
            ]),
            dinner: Object.freeze([
                dietaryMeal('vegetarian-dinner-lentil-bolognese', 'Lentil bolognese with wholewheat pasta', 585, 32, 82, 13, 21, 'Make several portions and freeze the sauce separately.', '200g cooked lentils|75g dry wholewheat pasta|220g chopped tomatoes and vegetables|15g vegetarian hard cheese|Italian herbs', 'simmer', 'dairy|gluten'),
                dietaryMeal('vegetarian-dinner-paneer-curry', 'Paneer and vegetable curry with basmati rice', 620, 34, 66, 24, 12, 'A substantial post-shift meal; measure the paneer and oil.', '140g reduced-fat paneer|150g cooked basmati rice|250g mixed vegetables|150g tomato curry sauce|Curry spices', 'simmer', 'dairy'),
                dietaryMeal('vegetarian-dinner-bean-chilli', 'Bean chilli with rice and Greek yogurt', 570, 30, 82, 12, 22, 'A high-fibre batch meal for off days and work containers.', '240g mixed beans|140g cooked brown rice|220g tomatoes, peppers and onion|80g Greek yogurt|Chilli and cumin', 'simmer', 'dairy'),
                dietaryMeal('vegetarian-dinner-tofu-noodles', 'Tofu and edamame vegetable noodles', 565, 37, 63, 18, 15, 'Fast enough for after work and suitable for next-day leftovers.', '170g firm tofu|140g cooked wholewheat noodles|80g edamame|220g stir-fry vegetables|1 tbsp reduced-salt soy sauce', 'stirfry', 'soy|gluten'),
                dietaryMeal('vegetarian-dinner-omelette', 'Mushroom omelette with roast potatoes and greens', 550, 35, 48, 23, 11, 'A balanced off-day or post-early-shift dinner.', '3 eggs|150g mushrooms and spinach|35g reduced-fat cheese|220g potatoes|180g green vegetables', 'skillet', 'egg|dairy')
            ]),
            snack: Object.freeze([
                dietaryMeal('vegetarian-snack-yogurt', 'Greek yogurt with berries and pumpkin seeds', 250, 24, 24, 8, 6, 'Portion into a chilled pot before the shift.', '250g Greek yogurt|100g berries|10g pumpkin seeds', 'snack', 'dairy'),
                dietaryMeal('vegetarian-snack-cottage', 'Cottage cheese with pineapple', 240, 26, 25, 5, 3, 'A quick high-protein chilled snack.', '220g cottage cheese|120g pineapple pieces|Cinnamon', 'snack', 'dairy'),
                dietaryMeal('vegetarian-snack-eggs', 'Boiled eggs, tomatoes and oatcakes', 275, 19, 23, 12, 5, 'Prepare the eggs ahead and keep chilled until the break.', '2 boiled eggs|3 oatcakes|120g cherry tomatoes|Black pepper', 'snack', 'egg|gluten'),
                dietaryMeal('vegetarian-snack-shake', 'Protein shake with a small banana', 250, 28, 31, 3, 4, 'A measured backup when a work break changes unexpectedly.', '30g whey or vegetarian protein|300ml water or milk|1 small banana|Ice', 'blend', 'dairy'),
                dietaryMeal('vegetarian-snack-hummus', 'Hummus, vegetable sticks and mini pitta', 280, 12, 38, 10, 9, 'A portable savoury option; portion the hummus rather than eating from the tub.', '70g hummus|180g vegetable sticks|1 mini wholemeal pitta', 'snack', 'sesame|gluten')
            ])
        }),
        ketogenic: Object.freeze({
            breakfast: Object.freeze([
                dietaryMeal('keto-breakfast-eggs-avocado', 'Eggs, avocado and spinach skillet', 455, 29, 12, 34, 9, 'A low-carbohydrate first meal with vegetables and a measured fat serving.', '3 eggs|100g avocado|100g spinach and tomatoes|1 tsp olive oil|Pepper and herbs', 'skillet', 'egg'),
                dietaryMeal('keto-breakfast-yogurt-chia', 'Greek yogurt, chia and berry bowl', 395, 31, 18, 23, 10, 'Use unsweetened yogurt and keep the berry portion measured.', '250g unsweetened Greek yogurt|25g chia seeds|70g berries|10g pumpkin seeds', 'snack', 'dairy'),
                dietaryMeal('keto-breakfast-tofu', 'Tofu, mushroom and spinach scramble', 410, 34, 14, 27, 8, 'A dairy- and egg-free lower-carbohydrate breakfast option.', '220g firm tofu|150g mushrooms|100g spinach|60g avocado|Turmeric and 1 tsp olive oil', 'skillet', 'soy'),
                dietaryMeal('keto-breakfast-salmon', 'Smoked salmon, eggs and cucumber plate', 430, 36, 8, 28, 4, 'No-cook apart from the eggs and practical after a night shift.', '100g smoked salmon|2 boiled eggs|150g cucumber and tomatoes|60g avocado|Lemon and pepper', 'snack', 'fish|egg'),
                dietaryMeal('keto-breakfast-cottage-walnut', 'Cottage cheese, walnuts and berries', 400, 33, 17, 24, 6, 'A chilled breakfast with a measured nut serving.', '250g full-fat cottage cheese|20g walnuts|70g berries|10g chia seeds', 'snack', 'dairy|nuts')
            ]),
            lunch: Object.freeze([
                dietaryMeal('keto-lunch-chicken-salad', 'Chicken, avocado and crunchy salad bowl', 515, 48, 15, 31, 10, 'Pack dressing separately and chill promptly.', '170g cooked chicken breast|100g avocado|250g mixed salad vegetables|20g seeds|Lemon and 1 tbsp olive oil', 'bowl', ''),
                dietaryMeal('keto-lunch-tuna-avocado', 'Tuna and avocado lettuce cups', 465, 42, 12, 28, 8, 'A cold work lunch that does not need a microwave.', '150g drained tuna|90g avocado|6 large lettuce leaves|150g cucumber and tomato|Lemon-yogurt or olive-oil dressing', 'wrap', 'fish'),
                dietaryMeal('keto-lunch-tofu-cauliflower', 'Tofu and cauliflower-rice bowl', 470, 34, 21, 28, 12, 'Cook ahead and reheat until piping hot.', '200g firm tofu|250g cauliflower rice|220g green vegetables|20g pumpkin seeds|1 tbsp reduced-salt soy sauce', 'stirfry', 'soy'),
                dietaryMeal('keto-lunch-beef-courgetti', 'Lean beef and courgetti tomato bowl', 500, 45, 20, 28, 9, 'Keep courgetti separate until reheating so it stays firm.', '170g lean beef mince|250g courgetti|180g tomato and mushrooms|15g vegetarian hard cheese|Italian herbs', 'skillet', 'dairy'),
                dietaryMeal('keto-lunch-halloumi-egg', 'Halloumi, egg and green salad', 520, 35, 13, 37, 8, 'A vegetarian lower-carbohydrate lunch with measured cheese.', '100g halloumi|2 boiled eggs|250g leafy salad and cucumber|80g avocado|Lemon dressing', 'bowl', 'dairy|egg')
            ]),
            dinner: Object.freeze([
                dietaryMeal('keto-dinner-salmon', 'Baked salmon with broccoli and herb butter', 555, 44, 16, 36, 9, 'A simple tray meal for after work or an off day.', '180g salmon fillet|250g broccoli and courgette|100g cauliflower mash|10g herb butter|Lemon and pepper', 'bake', 'fish|dairy'),
                dietaryMeal('keto-dinner-chicken-curry', 'Chicken and cauliflower coconut curry', 540, 47, 20, 31, 10, 'Batch-cook the curry and add fresh greens when reheating.', '180g chicken breast|250g cauliflower and green vegetables|150ml light coconut milk|150g cauliflower rice|Curry spices', 'simmer', ''),
                dietaryMeal('keto-dinner-beef-skillet', 'Beef, mushroom and green-bean skillet', 535, 46, 18, 32, 9, 'A one-pan meal that is quick enough for a post-shift dinner.', '180g lean beef strips|180g mushrooms|180g green beans|80g cauliflower rice|Garlic and 1 tbsp olive oil', 'skillet', ''),
                dietaryMeal('keto-dinner-tofu-coconut', 'Tofu coconut curry with greens', 520, 33, 23, 34, 12, 'A plant-based lower-carbohydrate dinner; measure coconut milk.', '220g firm tofu|250g broccoli, spinach and courgette|150ml light coconut milk|150g cauliflower rice|Curry spices', 'simmer', 'soy'),
                dietaryMeal('keto-dinner-turkey-courgetti', 'Turkey courgetti bolognese', 485, 48, 19, 25, 9, 'Batch the sauce and add courgetti only for the final few minutes.', '180g lean turkey mince|300g courgetti|200g tomato, celery and mushrooms|15g hard cheese|Italian herbs', 'simmer', 'dairy')
            ]),
            snack: Object.freeze([
                dietaryMeal('keto-snack-eggs', 'Boiled eggs with cucumber and tomatoes', 245, 18, 9, 16, 3, 'Prepare and chill the eggs before the shift.', '2 boiled eggs|150g cucumber and tomatoes|Pepper and herbs', 'snack', 'egg'),
                dietaryMeal('keto-snack-yogurt', 'Unsweetened Greek yogurt with chia', 260, 24, 12, 13, 8, 'A portioned chilled snack with no added sugar.', '220g unsweetened Greek yogurt|20g chia seeds|50g berries', 'snack', 'dairy'),
                dietaryMeal('keto-snack-tuna-boats', 'Tuna cucumber boats', 235, 31, 7, 10, 3, 'Mix just before the shift and keep chilled.', '120g drained tuna|1 large cucumber|40g Greek yogurt or mayonnaise|Lemon and pepper', 'snack', 'fish|dairy'),
                dietaryMeal('keto-snack-edamame', 'Edamame with chilli and lime', 230, 20, 18, 9, 9, 'A plant-based savoury snack that works cold.', '170g cooked edamame|Lime juice|Chilli flakes and a pinch of salt', 'snack', 'soy'),
                dietaryMeal('keto-snack-cheese-olives', 'Cheese, olives and pepper strips', 280, 19, 9, 20, 4, 'Pre-portion rather than grazing from the pack.', '70g reduced-fat cheese|40g olives|150g pepper strips', 'snack', 'dairy')
            ])
        })
    });

    function dietaryMealAllergens(idea) {
        if (typeof structuredMealSafety === 'function') return structuredMealSafety(idea).allergens.slice();
        const allergens = new Set(Array.isArray(idea && idea.allergens) ? idea.allergens : []);
        const text = `${idea && idea.name || ''} ${idea && idea.note || ''} ${(idea && idea.ingredients || []).join(' ')}`.toLowerCase();
        if (/\b(yogurts?|yoghurts?|cheeses?|milk|whey|paneer|halloumi|butter|mozzarella|pesto)\b/.test(text)) allergens.add('dairy');
        if (/\b(oats?|oatcakes?|bread|toast|wraps?|pittas?|pastas?|noodles?|couscous|bagels?|muesli|granola|seitan|wheat|rolls?|pancakes?)\b/.test(text)) allergens.add('gluten');
        if (/\b(nuts?|almonds?|walnuts?|peanuts?|cashews?|hazelnuts?|pesto)\b/.test(text)) allergens.add('nuts');
        if (/\b(eggs?|omelettes?|shakshuka)\b/.test(text)) allergens.add('egg');
        if (/\b(fish|salmon|tuna|cod|seafood|shellfish|prawn|shrimp)\b/.test(text)) allergens.add('fish');
        if (/\b(soy|soya|tofu|tempeh|edamame)\b/.test(text)) allergens.add('soy');
        if (/\b(sesame|tahini|hummus)\b/.test(text)) allergens.add('sesame');
        return Array.from(allergens);
    }

    function mealMatchesDietaryRequirements(idea, profileInput) {
        const profile = profileInput || dietaryProfile();
        const allergens = dietaryMealAllergens(idea);
        const exclusions = {
            dairy_free: 'dairy',
            gluten_free: 'gluten',
            nut_free: 'nuts',
            egg_free: 'egg',
            fish_free: 'fish',
            soy_free: 'soy',
            sesame_free: 'sesame'
        };
        return !(profile.requirements || []).some(requirement =>
            exclusions[requirement] && allergens.includes(exclusions[requirement])
        );
    }

    function calorieDeficitPortion(idea) {
        const factor = 0.85;
        return Object.assign({}, idea, {
            calories: Math.round(idea.calories * factor),
            protein: Math.round(idea.protein * factor),
            carbs: Math.round(idea.carbs * factor),
            fat: Math.round(idea.fat * factor),
            fiber: Math.round(idea.fiber * factor),
            originalCalories: idea.calories,
            portionAdjusted: true,
            note: `${idea.note} Calorie-deficit view uses about 85% of the standard suggested portion.`
        });
    }

    function personalisedShiftMealIdeas(type, mealType) {
        const profile = dietaryProfile();
        const shiftIdeas = SHIFT_MEAL_IDEAS[type] || SHIFT_MEAL_IDEAS.off;
        const baseIdeas = (shiftIdeas && shiftIdeas[mealType]) || [];
        let ideas;
        if (profile.completed && profile.pattern !== 'balanced') {
            ideas = ((DIETARY_MEAL_IDEAS[profile.pattern] || {})[mealType] || []).slice();
        } else {
            const extra = (DIETARY_MEAL_IDEAS.vegan[mealType] || [])[0];
            ideas = baseIdeas.concat(extra ? [extra] : []);
        }
        ideas = ideas.filter(idea => mealMatchesDietaryRequirements(idea, profile));
        if ((profile.approaches || []).includes('calorie_deficit')) {
            ideas = ideas.map(calorieDeficitPortion).sort((a, b) => a.calories - b.calories);
        }
        return ideas;
    }


    const SHIFT_MEAL_TIMINGS = Object.freeze({
        night: { breakfast: 'After waking', lunch: 'About 2h before shift', dinner: 'Early in the shift', snack: 'Mid-shift if hungry' },
        early: { breakfast: 'Before leaving for work', lunch: 'Mid-shift break', dinner: 'Soon after work', snack: 'Morning break' },
        day: { breakfast: 'Before the shift', lunch: 'Main work break', dinner: 'After the shift', snack: 'Between meals' },
        off: { breakfast: 'Within 1h of waking', lunch: 'Around midday', dinner: 'Early evening', snack: 'Between meals if hungry' }
    });
    const SHIFT_MEAL_ROTATION = Object.create(null);

    function shiftMealIdeasFor(type, mealType) {
        return personalisedShiftMealIdeas(type, mealType);
    }


    function shiftMealTimingLabel(type, mealType) {
        const base = (SHIFT_MEAL_TIMINGS[type] || SHIFT_MEAL_TIMINGS.off)[mealType] || '';
        const approaches = dietaryProfile().approaches || [];
        if (!approaches.includes('intermittent_fasting')) return base;
        return type === 'night' ? `${base} · alertness first` : `${base} · inside your eating window`;
    }

    function shiftMealIdeaPattern(idea) {
        const id = String(idea && idea.id || '');
        if (id.startsWith('vegan-')) return 'Vegan';
        if (id.startsWith('vegetarian-')) return 'Vegetarian';
        if (id.startsWith('keto-')) return 'Ketogenic';
        return 'Balanced';
    }

    function shiftMealIdeaBadgesHTML(idea) {
        const badges = [shiftMealIdeaPattern(idea)];
        if (idea && idea.portionAdjusted) badges.push('Calorie-deficit portion');
        return badges.map(label => `<span class="text-[9px] font-black uppercase bg-orange-50 text-orange-800 border border-orange-200 px-2 py-1 rounded-full">${escapeHtml(label)}</span>`).join('');
    }

    function shiftMealIdeaCardHTML(type, mealType, dateKey) {
        const ideas = shiftMealIdeasFor(type, mealType);
        if (!ideas.length) {
            return `<div class="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <p class="font-black text-sm text-amber-900">No automatic matches for these requirements</p>
                <p class="text-xs text-amber-800 mt-1">Update the dietary plan or use a meal you know is safe. VFIT will not bypass a selected exclusion.</p>
                <button onclick="openDietaryProfile()" class="mt-3 text-xs font-black text-amber-900 underline">Review dietary requirements</button>
            </div>`;
        }
        const key = type + ':' + mealType;
        const index = ((Number(SHIFT_MEAL_ROTATION[key]) || 0) % ideas.length + ideas.length) % ideas.length;
        const idea = ideas[index];
        const timing = shiftMealTimingLabel(type, mealType);
        const loggedCount = (state.dailyMeals || []).filter(meal => meal.date === dateKey && meal.shiftMealIdeaId === idea.id).length;
        return `
            <div data-shift-meal-id="${idea.id}" data-shift-meal-option="${index + 1}">
                <div class="flex items-center justify-between gap-2 mb-3"><button onclick="rotateShiftMealIdea('${type}', '${mealType}', -1, '${dateKey}')" class="w-9 h-9 rounded-xl bg-white font-black" aria-label="Previous ${mealType} idea">‹</button><span class="text-[10px] font-black uppercase text-slate-400">Choice ${index + 1} of ${ideas.length}</span><button onclick="rotateShiftMealIdea('${type}', '${mealType}', 1, '${dateKey}')" class="w-9 h-9 rounded-xl bg-white font-black" aria-label="Next ${mealType} idea">›</button></div>
                <p class="text-[10px] font-black uppercase text-orange-500">${escapeHtml(timing)}</p><h4 class="font-black text-sm mt-1">${escapeHtml(idea.name)}</h4>
                <div class="flex flex-wrap gap-1.5 mt-2">${shiftMealIdeaBadgesHTML(idea)}</div>
                <div class="flex gap-2 mt-2"><span class="bg-white px-2 py-1 rounded-lg text-xs font-black">${idea.calories} kcal</span><span class="bg-white px-2 py-1 rounded-lg text-xs font-black text-indigo-600">${idea.protein}g protein</span></div>
                <p class="text-xs text-slate-500 mt-2">${escapeHtml(idea.note)}</p>
                <button onclick="openShiftMealDetail('${type}', '${mealType}', ${index}, '${dateKey}')" class="w-full mt-3 bg-orange-600 text-white p-3 rounded-xl font-black text-xs active:scale-[0.98] flex items-center justify-center gap-2"><i data-lucide="book-open" class="w-4 h-4"></i> View Recipe &amp; More Meals</button>
                <button onclick="addShiftMealIdea('${type}', '${mealType}', ${index}, '${dateKey}')" class="w-full mt-2 bg-slate-900 text-white p-3 rounded-xl font-bold text-xs active:scale-[0.98]">${loggedCount ? `✓ Added ${loggedCount} · Add Again` : '+ Add to This Day’s Diary'}</button>
            </div>`;
    }

    function shiftMealCategoryHTML(type, mealType, dateKey) {
        const icons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };
        const optionCount = shiftMealIdeasFor(type, mealType).length;
        return `<details class="bg-slate-50 border border-slate-100 rounded-2xl p-4" data-shift-meal-category="${mealType}" data-shift-meal-options="${optionCount}"><summary class="font-black capitalize cursor-pointer">${icons[mealType]} ${mealType} · ${optionCount} compatible choice${optionCount === 1 ? '' : 's'}</summary><div id="shift-meal-option-${type}-${mealType}" class="mt-3">${shiftMealIdeaCardHTML(type, mealType, dateKey)}</div></details>`;
    }

    function shiftMealIdeasHTML(type, dateKey) {
        const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
        const total = mealTypes.reduce((sum, mealType) => sum + shiftMealIdeasFor(type, mealType).length, 0);
        const profile = dietaryProfile();
        return `
            <details class="glass-card p-6 rounded-[2.5rem]" data-shift-meal-ideas="${type}" open>
                <summary class="text-lg font-black cursor-pointer">Personalised Meal Planner · ${total} Recipes</summary>
                <div class="mt-4"><div class="flex justify-between items-start gap-3 mb-4"><div><p class="text-xs text-slate-500">Choices reflect ${escapeHtml(dietaryPatternLabel(profile.pattern).toLowerCase())}${profile.requirements.length ? ' and selected exclusions' : ''}. Open any recipe to see every compatible meal, ingredients and step-by-step instructions.</p><div class="flex flex-wrap gap-1.5 mt-2">${profile.completed ? dietaryProfileBadgesHTML(profile) : '<span class="text-[10px] font-black text-orange-700">Complete Dietary Plan in Coaching for personalisation</span>'}</div></div><button onclick="setNutritionTab('diary')" class="text-xs font-bold text-orange-700 bg-orange-50 px-3 py-2 rounded-xl flex-shrink-0">View Diary</button></div>
                <div class="space-y-3">${mealTypes.map(mealType => shiftMealCategoryHTML(type, mealType, dateKey)).join('')}</div>
                <p class="text-[10px] text-slate-400 mt-3">Nutrition values are estimates per suggested portion. Check labels, allergens, certification and cooking temperatures yourself.</p></div>
            </details>`;
    }

    function inferredShiftMealIngredients(idea) {
        const name = String(idea && idea.name || '').toLowerCase();
        if (name.includes('smoothie') || name.includes('shake')) {
            return ['30g protein powder suitable for your diet', '250–300ml milk, fortified alternative or water', 'The fruit or flavouring named in the recipe', 'Ice, if wanted'];
        }
        if (name.includes('oat') || name.includes('porridge') || name.includes('muesli') || name.includes('granola')) {
            return ['60g oats, muesli or granola as named', '250ml milk or a suitable fortified alternative', '25–30g protein powder or an equivalent protein serving', '100g fruit named in the recipe', 'Cinnamon or seeds, if suitable'];
        }
        if (name.includes('yogurt') || name.includes('yoghurt') || name.includes('cottage cheese')) {
            return ['220–250g yogurt or cottage cheese named in the recipe', '100g fruit or vegetables named in the recipe', 'A measured 10–20g topping, if included', 'Seasoning to taste'];
        }
        if (name.includes('wrap') || name.includes('pitta') || name.includes('sandwich') || name.includes('bagel')) {
            return ['1 wholegrain wrap, pitta, sandwich or bagel as named', '150g cooked protein filling or the equivalent shown', '2 handfuls salad or cooked vegetables', '1 tbsp suitable sauce or dressing'];
        }
        const proteinOptions = [
            ['chicken', '160–180g cooked chicken'],
            ['turkey', '160–180g cooked turkey'],
            ['beef', '160–180g lean beef'],
            ['salmon', '170–180g salmon'],
            ['tuna', '140–150g drained tuna'],
            ['cod', '180g cod'],
            ['tofu', '180–220g firm tofu'],
            ['lentil', '180–220g cooked lentils'],
            ['bean', '180–220g cooked beans'],
            ['chickpea', '180–220g cooked chickpeas'],
            ['egg', '2–3 eggs']
        ];
        const carbohydrateOptions = [
            ['rice', '140–160g cooked rice'],
            ['quinoa', '140–160g cooked quinoa'],
            ['pasta', '70–80g dry pasta'],
            ['noodle', '140–160g cooked noodles'],
            ['potato', '220–250g potato or sweet potato'],
            ['couscous', '150g cooked couscous']
        ];
        const protein = (proteinOptions.find(([token]) => name.includes(token)) || [null, '150–200g of the protein named in the recipe'])[1];
        const carbohydrate = (carbohydrateOptions.find(([token]) => name.includes(token)) || [null, 'A portion of the grain, potato or pulse named in the recipe'])[1];
        return [protein, carbohydrate, '200–250g vegetables named in the recipe', '1 tsp oil plus herbs or spices'];
    }

    function shiftMealRecipeKind(idea) {
        if (idea && idea.kind) return idea.kind;
        const name = String(idea && idea.name || '').toLowerCase();
        if (name.includes('overnight')) return 'overnight';
        if (name.includes('smoothie') || name.includes('shake')) return 'blend';
        if (name.includes('wrap') || name.includes('pitta') || name.includes('sandwich') || name.includes('bagel')) return 'wrap';
        if (name.includes('baked') || name.includes('roast') || name.includes('traybake') || name.includes('jacket')) return 'bake';
        if (name.includes('stir-fry') || name.includes('noodle')) return 'stirfry';
        if (name.includes('curry') || name.includes('chilli') || name.includes('soup') || name.includes('stew') || name.includes('bolognese')) return 'simmer';
        if (name.includes('egg') || name.includes('omelette') || name.includes('shakshuka') || name.includes('pancake')) return 'skillet';
        if (name.includes('yogurt') || name.includes('cottage cheese') || name.includes('oatcake')) return 'snack';
        return 'bowl';
    }

    function shiftMealRecipeSteps(idea) {
        const kind = shiftMealRecipeKind(idea);
        const steps = {
            overnight: ['Add the measured ingredients to a lidded container and stir thoroughly.', 'Cover and refrigerate for at least four hours or overnight.', 'Stir again, add the fresh topping and keep chilled until eaten.'],
            blend: ['Measure every ingredient so the logged portion stays accurate.', 'Blend until smooth, adding a little more liquid only if needed.', 'Drink straight away or keep chilled in a sealed bottle for the shift.'],
            wrap: ['Cook or warm the protein filling and vegetables; meat must be cooked through.', 'Warm the wrap or bread, then layer in the filling, salad and measured sauce.', 'Fold firmly, chill promptly if packing, and reheat only when suitable.'],
            bake: ['Heat the oven to 200°C / 180°C fan and prepare the ingredients in even pieces.', 'Season, add the measured oil and bake until vegetables are tender and the protein is safely cooked through.', 'Portion with the remaining sides; cool leftovers quickly before refrigerating.'],
            stirfry: ['Prepare every ingredient before heating the pan.', 'Cook the protein safely, add vegetables, then the cooked grain or noodles and measured sauce.', 'Stir-fry until piping hot and divide into the suggested portion.'],
            simmer: ['Prepare the protein, vegetables and measured carbohydrate.', 'Cook aromatics and protein, add the sauce or stock, then simmer until everything is safely cooked and tender.', 'Add the cooked grain or side, portion, and cool any shift-prep servings quickly.'],
            skillet: ['Prepare and measure the ingredients before heating a non-stick pan.', 'Cook the vegetables and protein until safely cooked through, using only the measured oil.', 'Serve immediately with the named sides and season to taste.'],
            snack: ['Measure the listed ingredients into one suggested portion.', 'Combine or assemble them in a clean, sealed container.', 'Keep chilled when required and check the product labels before eating.'],
            bowl: ['Cook the protein and grain or potato according to pack guidance; cook animal proteins thoroughly.', 'Prepare the vegetables and measured dressing or seasoning.', 'Assemble one portion, or cool components quickly and store separately for the shift.']
        };
        return steps[kind] || steps.bowl;
    }

    function openShiftMealDetail(type, mealType, index, dateKey) {
        const ideas = shiftMealIdeasFor(type, mealType);
        if (!ideas.length) {
            showToast('No compatible meal ideas for these requirements');
            return;
        }
        shiftMealDetailSelection = {
            type,
            mealType,
            index: Math.max(0, Math.min(ideas.length - 1, Number(index) || 0)),
            dateKey: /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? String(dateKey) : state.viewDate
        };
        const modal = document.getElementById('shift-meal-detail-modal');
        if (modal) modal.style.display = 'flex';
        renderShiftMealDetail();
        refreshIcons();
    }

    function closeShiftMealDetail() {
        const modal = document.getElementById('shift-meal-detail-modal');
        if (modal) modal.style.display = 'none';
        shiftMealDetailSelection = null;
    }

    function selectShiftMealDetail(index) {
        if (!shiftMealDetailSelection) return;
        const ideas = shiftMealIdeasFor(shiftMealDetailSelection.type, shiftMealDetailSelection.mealType);
        shiftMealDetailSelection.index = Math.max(0, Math.min(ideas.length - 1, Number(index) || 0));
        renderShiftMealDetail();
    }

    function renderShiftMealDetail() {
        if (!shiftMealDetailSelection) return;
        const selection = shiftMealDetailSelection;
        const ideas = shiftMealIdeasFor(selection.type, selection.mealType);
        if (!ideas.length) {
            closeShiftMealDetail();
            showToast('No compatible recipes remain after that dietary change');
            return;
        }
        selection.index = Math.max(0, Math.min(ideas.length - 1, selection.index));
        const idea = ideas[selection.index];
        const ingredients = Array.isArray(idea.ingredients) && idea.ingredients.length
            ? idea.ingredients
            : inferredShiftMealIngredients(idea);
        const steps = shiftMealRecipeSteps(idea);
        const profile = dietaryProfile();
        const title = document.getElementById('shift-meal-detail-title');
        const kicker = document.getElementById('shift-meal-detail-kicker');
        const count = document.getElementById('shift-meal-detail-count');
        const options = document.getElementById('shift-meal-detail-options');
        const content = document.getElementById('shift-meal-detail-content');
        const addButton = document.getElementById('shift-meal-detail-add');
        if (!title || !options || !content) return;

        title.textContent = idea.name;
        if (kicker) kicker.textContent = `${aiCoachShiftLabel(getShiftForDate(selection.dateKey))} · ${selection.mealType}`;
        if (count) count.textContent = `${ideas.length} compatible choice${ideas.length === 1 ? '' : 's'}`;
        options.innerHTML = ideas.map((option, index) => {
            const active = index === selection.index;
            return `<button onclick="selectShiftMealDetail(${index})" class="text-left p-3 rounded-xl border-2 ${active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}">
                <span class="block text-[9px] font-black uppercase ${active ? 'text-orange-600' : 'text-slate-400'}">Choice ${index + 1}</span>
                <span class="block font-black text-xs mt-1">${escapeHtml(option.name)}</span>
                <span class="block text-[10px] text-slate-500 mt-1">${option.calories} kcal · ${option.protein}g protein</span>
            </button>`;
        }).join('');

        const dateLabel = new Date(selection.dateKey + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const requirementLabels = (profile.requirements || []).map(value => DIETARY_REQUIREMENT_LABELS[value] || value);
        const allergenLabels = dietaryMealAllergens(idea);
        const loggedCount = (state.dailyMeals || []).filter(meal => meal.date === selection.dateKey && meal.shiftMealIdeaId === idea.id).length;
        content.innerHTML = `
            <article class="border-2 border-slate-200 rounded-[2rem] p-4 sm:p-6">
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <p class="text-[10px] font-black uppercase text-orange-600">${escapeHtml(shiftMealTimingLabel(selection.type, selection.mealType))} · ${escapeHtml(dateLabel)}</p>
                        <h4 class="text-2xl font-black mt-1">${escapeHtml(idea.name)}</h4>
                        <div class="flex flex-wrap gap-1.5 mt-2">${shiftMealIdeaBadgesHTML(idea)}</div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 flex-shrink-0">
                        <span class="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-black text-center">${idea.calories} kcal</span>
                        <span class="bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl text-xs font-black text-center">${idea.protein}g protein</span>
                    </div>
                </div>
                <p class="text-sm text-slate-600 mt-4">${escapeHtml(idea.note)}</p>

                <div class="grid grid-cols-4 gap-2 mt-4">
                    <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[9px] uppercase text-slate-400 font-black">Carbs</p><p class="font-black text-sm">${idea.carbs}g</p></div>
                    <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[9px] uppercase text-slate-400 font-black">Fat</p><p class="font-black text-sm">${idea.fat}g</p></div>
                    <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[9px] uppercase text-slate-400 font-black">Fibre</p><p class="font-black text-sm">${idea.fiber}g</p></div>
                    <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[9px] uppercase text-slate-400 font-black">Serving</p><p class="font-black text-sm">${idea.portionAdjusted ? '85%' : '1×'}</p></div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                    <section>
                        <h5 class="font-black flex items-center gap-2"><i data-lucide="shopping-basket" class="w-4 h-4 text-orange-600"></i> Ingredients</h5>
                        <ul class="mt-3 space-y-2">${ingredients.map(item => `<li class="flex items-start gap-2 text-sm text-slate-600"><span class="text-orange-500 font-black">•</span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>
                    </section>
                    <section>
                        <h5 class="font-black flex items-center gap-2"><i data-lucide="list-ordered" class="w-4 h-4 text-orange-600"></i> Instructions</h5>
                        <ol class="mt-3 space-y-3">${steps.map((step, index) => `<li class="flex items-start gap-3 text-sm text-slate-600"><span class="w-6 h-6 bg-slate-900 text-orange-300 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0">${index + 1}</span><span>${escapeHtml(step)}</span></li>`).join('')}</ol>
                    </section>
                </div>

                ${typeof mealSafetyHTML === 'function' ? mealSafetyHTML(idea, profile) : `
                <div class="mt-6 bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <p class="font-black text-xs text-amber-900">Dietary and food-safety check</p>
                    <p class="text-[11px] text-amber-800 mt-1">${requirementLabels.length ? `Your saved requirements: ${escapeHtml(requirementLabels.join(' · '))}. ` : ''}${profile.notes ? `Your note: ${escapeHtml(profile.notes)}. ` : ''}Possible recipe flags: ${escapeHtml(allergenLabels.length ? allergenLabels.join(', ') : 'none identified')}. Always check every label and prevent cross-contamination.</p>
                </div>`}
            </article>`;
        if (addButton) addButton.textContent = loggedCount ? `✓ Added ${loggedCount} · Add Again` : `Add ${idea.name} to Diary`;
        refreshIcons();
    }

    function addSelectedShiftMealIdea() {
        if (!shiftMealDetailSelection) return;
        const selection = Object.assign({}, shiftMealDetailSelection);
        addShiftMealIdea(selection.type, selection.mealType, selection.index, selection.dateKey);
        renderShiftMealDetail();
    }


    function rotateShiftMealIdea(type, mealType, direction, dateKey) {
        const ideas = shiftMealIdeasFor(type, mealType);
        if (!ideas.length) return;
        const key = type + ':' + mealType;
        SHIFT_MEAL_ROTATION[key] = ((Number(SHIFT_MEAL_ROTATION[key]) || 0) + Number(direction || 0) + ideas.length) % ideas.length;
        const slot = document.getElementById('shift-meal-option-' + type + '-' + mealType);
        if (slot) slot.innerHTML = shiftMealIdeaCardHTML(type, mealType, dateKey);
        refreshIcons();
    }

    function addShiftMealIdea(type, mealType, index, dateKey) {
        const ideas = shiftMealIdeasFor(type, mealType);
        const idea = ideas && ideas[Number(index)];
        const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? String(dateKey) : state.viewDate;
        if (!idea || !/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate || ''))) { showToast('Meal idea unavailable'); return; }
        const base = { calories: idea.calories, protein: idea.protein, carbs: idea.carbs, fat: idea.fat, fiber: idea.fiber, sugar: 0, isCustom: true, serving: '1 suggested portion' };
        const entry = {
            id: Date.now() + Math.random(), date: targetDate, type: mealType, mealType,
            name: idea.name, image: null, calories: idea.calories, protein: idea.protein,
            carbs: idea.carbs, fat: idea.fat, fiber: idea.fiber, sugar: 0,
            amount: 1, amountType: 'portion', base, source: 'shift-meal-idea',
            shiftType: type, shiftMealIdeaId: idea.id, createdAt: new Date().toISOString()
        };
        if (!Array.isArray(state.dailyMeals)) state.dailyMeals = [];
        state.dailyMeals.push(entry);
        saveState();
        autoSaveNutrition();
        renderDiary();
        renderDashboard();
        const slot = document.getElementById('shift-meal-option-' + type + '-' + mealType);
        if (slot) slot.innerHTML = shiftMealIdeaCardHTML(type, mealType, targetDate);
        const label = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        showToast(`${idea.name} added to ${label}`);
    }

    function mealRow(time, title, desc, tone) {
        const colors = {
            main: 'bg-indigo-50 border-indigo-200',
            light: 'bg-emerald-50 border-emerald-200',
            avoid: 'bg-rose-50 border-rose-200',
            sleep: 'bg-slate-100 border-slate-200'
        };
        return `
            <div class="flex gap-3 p-3 rounded-2xl border ${colors[tone] || 'bg-slate-50 border-slate-200'} mb-2">
                <div class="text-xs font-black text-slate-500 w-20 flex-shrink-0 pt-0.5">${time}</div>
                <div class="min-w-0">
                    <p class="font-bold text-sm">${title}</p>
                    <p class="text-xs text-slate-500 mt-0.5">${desc}</p>
                </div>
            </div>`;
    }

    function nightShiftMealHTML(shift) {
        const sp = shiftP();
        const start = hmToMin((shift && shift.start) || sp.shiftStart);
        const end = hmToMin((shift && shift.end) || sp.shiftEnd);
        return `
            <details class="glass-card p-6 rounded-[2.5rem]">
                <summary class="text-lg font-black cursor-pointer">Meal Timing — Working Night</summary><div class="mt-4">
                <p class="text-xs text-slate-400 mb-4">The goal: eat your main food before/early in the shift, keep the deep-night hours light, and don't go to bed on a full stomach.</p>
                ${mealRow(minToHM(start - 120), 'Anchor meal (before shift)', 'Your biggest, most balanced meal ~2h before starting. Lean protein + complex carbs + veg for steady 4–6h energy — this is what stops the 3am vending-machine trap.', 'main')}
                ${mealRow(minToHM(start + 180), 'Mid-shift protein snack', 'A protein-forward snack ~3–4h in. Greek yogurt, cottage cheese, boiled eggs, or a lean-protein wrap. Keeps you full without a sugar crash.', 'light')}
                ${mealRow('12am–6am', 'Biological night — keep minimal', 'Try to avoid a full meal in these hours: this is when your body handles food worst (higher glucose & fat in the blood). If you must eat, keep it small and protein/veg based, not sugary or heavy.', 'avoid')}
                ${mealRow(minToHM(end), 'Post-shift: light only', 'A small, easy-to-digest meal at most. Finish eating at least ~1h before sleep so it doesn\'t wreck your sleep quality.', 'light')}
                ${mealRow('Daytime', 'Sleep', 'Protect your sleep window. Dark, cool, quiet room. Sleep is where fat-loss and muscle-building actually happen.', 'sleep')}</div>
            </details>`;
    }

    function dayShiftMealHTML(shift) {
        const sp = shiftP();
        const start = hmToMin((shift && shift.start) || sp.shiftStart);
        const end = hmToMin((shift && shift.end) || sp.shiftEnd);
        return `
            <details class="glass-card p-6 rounded-[2.5rem]">
                <summary class="text-lg font-black cursor-pointer">Meal Timing — Working Day</summary><div class="mt-4">
                <p class="text-xs text-slate-400 mb-4">Daytime shifts are more circadian-friendly. Front-load your calories earlier and keep the evening lighter.</p>
                ${mealRow(minToHM(start - 60), 'Breakfast', 'A solid protein + carb breakfast within ~an hour of waking. Insulin sensitivity is highest earlier in the day.', 'main')}
                ${mealRow('Midday', 'Lunch — main meal', 'Make lunch your largest meal where you can. Protein, complex carbs, veg.', 'main')}
                ${mealRow(minToHM(end), 'Dinner — lighter & earlier', 'Aim to finish your main evening eating before ~9pm. Late, large dinners are linked to worse metabolic outcomes.', 'light')}
                ${mealRow('After 9pm', 'Wind down', 'Avoid late heavy meals and sugary snacks. A small protein snack is fine if genuinely hungry.', 'avoid')}</div>
            </details>`;
    }

    function earlyShiftMealHTML(shift) {
        const sp = shiftP();
        const start = hmToMin((shift && shift.start) || sp.shiftStart);
        const end = hmToMin((shift && shift.end) || sp.shiftEnd);
        return `
            <details class="glass-card p-6 rounded-[2.5rem]">
                <summary class="text-lg font-black cursor-pointer">Meal Timing — Working Early</summary><div class="mt-4">
                <p class="text-xs text-slate-400 mb-4">Protect sleep by preparing breakfast and shift food in advance, then place your main meal after work rather than skipping through the morning.</p>
                ${mealRow(minToHM(start - 45), 'Pre-shift breakfast', 'Keep it quick but balanced: protein plus slow-release carbs. Prepare it the night before so the early start does not become a missed meal.', 'main')}
                ${mealRow(minToHM(start + 180), 'Mid-shift meal or snack', 'Use a packed protein-forward option with fruit or wholegrain carbs to keep energy steadier through the early shift.', 'light')}
                ${mealRow(minToHM(end + 30), 'Post-shift main meal', 'Have your largest balanced meal soon after work, while there is still plenty of daytime left for digestion and recovery.', 'main')}
                ${mealRow('~6–7pm', 'Lighter evening meal', 'Keep dinner lighter and finish early enough to protect the earlier bedtime your next shift needs.', 'light')}</div>
            </details>`;
    }

    function offDayMealHTML() {
        return `
            <details class="glass-card p-6 rounded-[2.5rem]">
                <summary class="text-lg font-black cursor-pointer">Meal Timing — Rest / Off Day</summary><div class="mt-4">
                <p class="text-xs text-slate-400 mb-4">Use rest days to nudge your body clock back toward daytime eating — it helps recovery and metabolic health.</p>
                ${mealRow('On waking', 'Breakfast', 'Eat within ~an hour of waking to anchor your body clock to daytime. Protein + carbs.', 'main')}
                ${mealRow('Midday', 'Lunch — main meal', 'Largest meal of the day around midday when your metabolism is best set up for it.', 'main')}
                ${mealRow('~6–7pm', 'Early dinner', 'Finish your main eating earlier in the evening. Aim to stop before ~9pm.', 'light')}
                ${mealRow('Late', 'Minimise late eating', 'Keep the late-evening hours light. This re-trains your system after nights.', 'avoid')}</div>
            </details>`;
    }

    function shiftTrainingHTML(onShift, isNight, isEarly) {
        const sp = shiftP();
        const fatLoss = sp.goal === 'fat_loss';
        let inner = '';

        if (onShift && isNight) {
            inner = `
                <p class="text-sm text-slate-600 mb-3">On a night-shift day, your strength peak and your available energy don't line up with a normal schedule. Best options:</p>
                ${trainTip('Before your shift (2–4h after waking)', 'Your best window on a night-shift day. Core body temperature and neuromuscular readiness are higher a few hours after you wake — that\'s when to do your hardest lifting or intervals, not right after rolling out of bed.', 'primary')}
                ${trainTip('On a mid-shift break', 'A short, lower-sweat strength session (compound lifts, moderate load) works well mid-shift and can boost alertness without frying you.', 'ok')}
                ${trainTip('After a night shift — keep it gentle', 'Post-shift your body temp is at its lowest and cortisol can spike from hard training. Save heavy sessions for another time; a short walk to wind down is ideal before sleep.', 'avoid')}`;
        } else if (onShift && isEarly) {
            inner = `
                <p class="text-sm text-slate-600 mb-3">Early shifts make sleep the priority. Do not trade sleep for a hard pre-shift workout.</p>
                ${trainTip('After work, if energy is steady', 'Train after your shift and after a planned meal or snack. Keep the session concise so you can still wind down for an early bedtime.', 'primary')}
                ${trainTip('Before work: mobility only', 'If moving first helps you wake up, use a short walk or mobility routine. Save heavy lifting and hard intervals for after work or an off day.', 'ok')}`;
        } else if (onShift) {
            inner = `
                <p class="text-sm text-slate-600 mb-3">Day shifts fit the body clock better. Strength naturally peaks late afternoon/early evening.</p>
                ${trainTip('Before or after your shift', 'If your job is physically tiring, train before work so fatigue doesn\'t rob the session. If it\'s a desk job, late afternoon/evening after work is your natural strength peak.', 'primary')}
                ${trainTip('Consistency beats perfection', 'Training at the same time daily trains your muscle clocks to perform then — even a "non-optimal" time becomes optimal with consistency.', 'ok')}`;
        } else {
            inner = `
                <p class="text-sm text-slate-600 mb-3">Rest days are ideal for your hardest training — you're not also carrying shift fatigue.</p>
                ${trainTip('Late afternoon / early evening (~4–7pm)', 'Maximal strength peaks in the evening and is lowest early morning. If you want a heavy session, this is the window.', 'primary')}
                ${trainTip(fatLoss ? 'Add easy cardio / steps' : 'Prioritise progressive overload', fatLoss ? 'On rest days, low-intensity cardio or a long walk adds fat-loss without denting recovery.' : 'Push your key lifts a little heavier or add a rep — rest days are when you can genuinely progress.', 'ok')}`;
        }

        return `
            <details class="glass-card p-6 rounded-[2.5rem]">
                <summary class="text-lg font-black cursor-pointer">Training Plan — ${fatLoss ? 'Fat Loss' : 'Muscle Gain'}</summary><div class="mt-4">
                <p class="text-xs text-slate-400 mb-4">Timed to your circadian phase, not the clock on the wall.</p>
                ${inner}</div>
            </details>`;
    }

    function trainTip(title, desc, tone) {
        const dot = { primary: 'bg-indigo-500', ok: 'bg-emerald-500', avoid: 'bg-rose-400' }[tone] || 'bg-slate-400';
        return `
            <div class="flex gap-3 mb-3">
                <div class="w-2.5 h-2.5 rounded-full ${dot} flex-shrink-0 mt-1.5"></div>
                <div class="min-w-0">
                    <p class="font-bold text-sm">${title}</p>
                    <p class="text-xs text-slate-500 mt-0.5">${desc}</p>
                </div>
            </div>`;
    }

function fastingGuidanceHTML(onShift, shiftType) {
    const isNight = onShift && shiftType === 'night';
    return `
        <details class="glass-card p-6 rounded-[2.5rem] border-2 border-dashed border-indigo-200">
            <summary class="text-lg font-black cursor-pointer">Intermittent-Fasting Shift Guidance</summary><div class="mt-4">
            <p class="text-xs text-slate-500 mb-4">Your saved plan uses intermittent fasting. VFIT changes the emphasis by shift instead of applying one rigid clock window every day.</p>
            ${isNight
                ? `<div class="p-3 bg-amber-50 border border-amber-200 rounded-2xl mb-3"><p class="text-sm font-bold text-amber-900">Night shift: alertness and safety come first</p><p class="text-xs text-amber-800 mt-1">Do not force a fast through work if it causes dizziness, poor concentration, unusual fatigue or impaired performance. A practical option is to anchor the eating window after waking and through the early part of the shift.</p></div>`
                : onShift
                    ? mealRow('This shift', 'Keep the window practical', 'Place the eating window around the main work break and the training or recovery meal. Do not sacrifice fluids or adequate protein to hit a clock target.', 'light')
                    : mealRow('Off day', 'Return the window to daytime', 'Use a consistent daytime window if it feels sustainable, while still meeting protein, energy, fibre and hydration needs.', 'main')}
            <p class="text-[11px] text-slate-400 mt-2">Fasting is not suitable for everyone. Get appropriate clinical advice first if you have diabetes or another health condition, take medication affected by food timing, are pregnant, or have a history of disordered eating. Stop if you feel unwell.</p></div>
        </details>`;
}

    function createdShiftFoodIdeasHTML(dateKey) {
        const customMeals = (state.createdMeals || []).filter(meal => meal && (meal.showInShiftFoodIdeas === true || meal.addToShiftFoodIdeas === true));
        if (!customMeals.length) return '';
        const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))
            ? String(dateKey)
            : (/^\d{4}-\d{2}-\d{2}$/.test(String(state.viewDate || '')) ? String(state.viewDate) : localDateKey());
        const validSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
        return `
                <div class="mt-4 border-t border-orange-100 pt-4" data-created-shift-meals="true">
                    <div class="flex items-start justify-between gap-3 mb-3"><div><p class="text-[10px] font-black uppercase text-orange-600">My created shift meals</p><p class="text-xs text-slate-400 mt-1">Only meals you selected in Create Meal appear here.</p></div><span class="text-[10px] font-black text-orange-600 bg-orange-100 px-2 py-1 rounded-lg">${customMeals.length} saved</span></div>
                    <div class="space-y-2">
                        ${customMeals.map(meal => {
                            const mealType = validSlots.includes(meal.defaultMealType) ? meal.defaultMealType : (validSlots.includes(meal.plannedMealType) ? meal.plannedMealType : 'snack');
                            const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
                            return `<div class="bg-orange-50 border border-orange-100 rounded-2xl p-3"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="font-bold text-sm truncate">${escapeHtml(meal.name || 'Created meal')}</p><p class="text-[11px] text-slate-500 mt-1">${Math.round(Number(meal.calories) || 0)} kcal · ${(Number(meal.protein) || 0).toFixed(1)}g protein · ${mealLabel}</p></div><button onclick="addCreatedMealToDiary('${escapeJsString(meal.id)}', '${targetDate}', '${mealType}')" class="flex-shrink-0 bg-slate-900 text-white px-3 py-2 rounded-xl font-bold text-[11px]">+ Add to diary</button></div></div>`;
                        }).join('')}
                    </div>
                </div>`;
    }

function shiftFoodIdeasHTML(emphasiseNight, dateKey) {
    const profile = dietaryProfile();
    const lists = {
        vegan: [
            ['🫘 Beans & lentils', 'Batch-cook for bowls, soups and chilli', ''],
            ['🌱 Tofu', 'Bake or stir-fry several portions', 'soy'],
            ['🌿 Tempeh', 'High-protein option for wraps and noodles', 'soy'],
            ['🥗 Edamame', 'Portable savoury protein snack', 'soy'],
            ['🥤 Pea or soy protein', 'Measured backup for short breaks', 'soy'],
            ['🌾 Seitan', 'Protein-rich if gluten suits your requirements', 'gluten'],
            ['🥣 Fortified soy yogurt', 'No-cook breakfast or snack', 'soy'],
            ['🧆 Chickpeas & hummus', 'Fibre plus plant protein', 'sesame']
        ],
        vegetarian: [
            ['🥚 Eggs', 'Boil ahead or use in quick meals', 'egg'],
            ['🥛 Greek yogurt', 'High protein and low effort', 'dairy'],
            ['🧀 Cottage cheese', 'Chilled snack or potato topping', 'dairy'],
            ['🌱 Tofu & tempeh', 'Plant-protein rotation for meal prep', 'soy'],
            ['🫘 Beans & lentils', 'Fibre plus plant protein', ''],
            ['🥤 Protein shake', 'Fast measured backup when busy', 'dairy'],
            ['🧀 Reduced-fat cheese', 'Measure portions for predictable calories', 'dairy'],
            ['🥗 Edamame', 'Portable savoury protein snack', 'soy']
        ],
        ketogenic: [
            ['🍗 Chicken or turkey', 'Batch-cook plain portions for salads', ''],
            ['🐟 Salmon or tuna', 'Protein and fats; keep chilled', 'fish'],
            ['🥚 Eggs', 'Portable and easy to prepare ahead', 'egg'],
            ['🌱 Tofu', 'Lower-carbohydrate plant protein', 'soy'],
            ['🥛 Unsweetened Greek yogurt', 'Check carbohydrate on the label', 'dairy'],
            ['🧀 Cottage cheese', 'Measure portions and check the label', 'dairy'],
            ['🥗 Edamame', 'Fibre-rich plant option', 'soy'],
            ['🌰 Seeds', 'Measure portions; check allergy needs', 'nuts']
        ],
        balanced: [
            ['🥚 Boiled eggs', 'Prep ahead; grab 2–3', 'egg'],
            ['🍗 Grilled chicken', 'Batch-cook and portion out', ''],
            ['🥛 Greek yogurt', 'High protein and low effort', 'dairy'],
            ['🧀 Cottage cheese', 'Slow-release protein option', 'dairy'],
            ['🥜 Nuts & seeds', 'Measure portions carefully', 'nuts'],
            ['🐟 Tinned tuna or salmon', 'On oatcakes or wholegrain bread', 'fish|gluten'],
            ['🫘 Beans & lentils', 'Fibre plus plant protein', ''],
            ['🥤 Protein shake', 'Fast backup when busy', 'dairy']
        ]
    };
    const candidates = lists[profile.pattern] || lists.balanced;
    const ideas = candidates.filter(([name, note, allergens]) =>
        mealMatchesDietaryRequirements({ name, note, allergens: String(allergens || '').split('|').filter(Boolean) }, profile)
    );
    return `
        <details class="glass-card p-6 rounded-[2.5rem]">
            <summary class="text-lg font-black cursor-pointer">${escapeHtml(dietaryPatternLabel(profile.pattern))} Protein Ideas</summary><div class="mt-4">
            <p class="text-xs text-slate-400 mb-4">${emphasiseNight
                ? 'Prepare protein-forward choices before a night shift so your deepest-night break does not depend on vending-machine food.'
                : 'A deliberate protein source at each main meal supports recovery and helps make the plan more filling.'}</p>
            <div class="grid grid-cols-2 gap-2">
                ${ideas.map(([name, note]) => foodIdea(name, note)).join('') || '<p class="col-span-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl">No generic ideas match every selected exclusion. Use a product or recipe you have personally verified as safe.</p>'}
            </div>
            ${createdShiftFoodIdeasHTML(dateKey)}
            <div class="mt-3 p-3 bg-slate-50 rounded-2xl">
                <p class="text-xs text-slate-500"><b>Shift prep:</b> portion food before work, carry fluids and keep a verified backup meal available. Check every product against your saved requirements.</p>
            </div></div>
        </details>`;
}

    function foodIdea(name, note) {
        return `
            <div class="bg-slate-50 rounded-2xl p-3">
                <p class="font-bold text-sm">${name}</p>
                <p class="text-[11px] text-slate-400 mt-0.5">${note}</p>
            </div>`;
    }

    function shiftScienceHTML() {
        return `
            <details class="glass-card rounded-[2.5rem] p-6">
                <summary class="text-lg font-black cursor-pointer">The science (why this works)</summary>
                <div class="space-y-3 text-sm text-slate-600 mt-4">
                    <p><b>Your master clock — the SCN.</b> Deep in your brain (the hypothalamus) sits the suprachiasmatic nucleus, or SCN. It's your body's master clock, and it's set mainly by <b>light</b>. It tells your body when to be alert, when to release melatonin for sleep, and when your metabolism is primed for food.</p>
                    <p><b>Zeitgebers — "time-givers".</b> Besides light, your body takes timing cues from <b>food, activity and temperature</b>. These are called zeitgebers (German for "time-givers"). Your gut and muscles have their own "peripheral clocks" that respond to when you eat and train — not just to light.</p>
                    <p><b>Why shift work is hard.</b> On nights, your SCN still thinks it's night (because of the light/dark cycle), but you're eating and working. This <b>desynchronises</b> your master clock from your gut and muscle clocks. Eating at 3am means digesting food when your body is metabolically set to sleep — which is why the same meal raises blood sugar and fat more at night than in the day.</p>
                    <p><b>What we do about it.</b> We use the zeitgebers you <i>can</i> control — food timing and training timing — to reduce that mismatch: concentrate eating when your body is more aligned, keep the deep-night hours light, and place training near your true strength peak (a few hours after waking, when core temperature is up).</p>
                    <p class="text-xs text-slate-400">This is a simplified summary of active research. The science is still developing and individual responses vary — another reason to work with your GP.</p>
                </div>
            </details>`;
    }

    // Only appears when the client actually has a coach.
    async function renderCoachPlanInTraining() {
        const card = document.getElementById('coach-plan-card');
        const list = document.getElementById('coach-plan-list');
        if (!card || !list) return;

        // Hide entirely unless this user has a coach
        if (currentUserRole !== 'member' || !firebaseUserData || !firebaseUserData.coachUid) {
            card.classList.add('hidden');
            return;
        }

        let assigned = [];
        try {
            const meDoc = await db.collection('users').doc(currentUser.uid).get();
            assigned = (meDoc.data() || {}).assignedWorkouts || [];
        } catch (e) { /* offline — leave hidden */ }

        if (assigned.length === 0) {
            // Has a coach but nothing assigned yet — hide the card entirely
            // (only show when a coach has actually set a workout).
            card.classList.add('hidden');
            return;
        }

        card.classList.remove('hidden');
        list.innerHTML = assigned.slice().reverse().map((w, idx) => {
            const realIdx = assigned.length - 1 - idx;
            const exNames = (w.exercises || []).map(e => escapeHtml(e.name)).join(', ');
            const hasFocus = (w.exercises || []).some(e => e.focus);
            return `
                <div class="bg-slate-50 rounded-2xl p-4">
                    <div class="flex justify-between items-start mb-1">
                        <div class="min-w-0">
                            <p class="font-black">${escapeHtml(w.title || 'Coach Workout')}</p>
                            <p class="text-[10px] text-slate-400">From ${escapeHtml(w.assignedBy || 'Coach')} · ${escapeHtml((w.assignedAt || '').split('T')[0])}</p>
                        </div>
                        ${hasFocus ? '<span class="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full flex-shrink-0">🎯 cues</span>' : ''}
                    </div>
                    <p class="text-xs text-slate-500 mb-3 truncate">${exNames}</p>
                    <button onclick="startAssignedWorkout(${realIdx})" class="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold text-sm">Start This Workout</button>
                </div>`;
        }).join('');
        refreshIcons();
    }

    async function openAssignedWorkouts() {
        if (!firebaseUserData.coachUid) { showToast('No coach connected'); return; }
        let assigned = [];
        try {
            const meDoc = await db.collection('users').doc(currentUser.uid).get();
            assigned = (meDoc.data() || {}).assignedWorkouts || [];
        } catch (e) { /* ignore */ }

        const box = document.getElementById('assigned-workouts-body');
        if (assigned.length === 0) {
            box.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Your coach hasn\'t assigned any workouts yet.</p>';
        } else {
            box.innerHTML = assigned.slice().reverse().map((w, idx) => {
                const realIdx = assigned.length - 1 - idx;
                return `
                <div class="bg-slate-50 p-4 rounded-2xl mb-3">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="font-black">${escapeHtml(w.title || 'Workout')}</p>
                            <p class="text-[10px] text-slate-400">From ${escapeHtml(w.assignedBy || 'Coach')} · ${escapeHtml((w.assignedAt || '').split('T')[0])}</p>
                        </div>
                    </div>
                    <div class="space-y-2 mb-3">
                        ${(w.exercises || []).map(ex => `
                            <div>
                                <p class="text-sm"><b>${escapeHtml(ex.name)}</b> — ${(ex.sets || []).map(s => `${escapeHtml(s.weight === '' || s.weight == null ? '—' : s.weight)}kg×${escapeHtml(s.reps === '' || s.reps == null ? '—' : s.reps)}`).join(', ')}</p>
                                ${ex.focus ? `<p class="text-[11px] text-indigo-600 pl-2 mt-0.5">🎯 ${escapeHtml(ex.focus)}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <button onclick="startAssignedWorkout(${realIdx})" class="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold text-sm">Start This Workout</button>
                </div>`;
            }).join('');
        }
        document.getElementById('assigned-workouts-modal').style.display = 'flex';
        refreshIcons();
    }

    function closeAssignedWorkouts() {
        document.getElementById('assigned-workouts-modal').style.display = 'none';
    }

    async function startAssignedWorkout(idx) {
        let assigned = [];
        try {
            const meDoc = await db.collection('users').doc(currentUser.uid).get();
            assigned = (meDoc.data() || {}).assignedWorkouts || [];
        } catch (e) { /* ignore */ }
        const w = assigned[idx];
        if (!w) { showToast('Workout not found'); return; }

        closeAssignedWorkouts();
        switchTab('training');
        window._activeAssignedWorkout = { title: w.title || 'Coach Workout', coachUid: firebaseUserData.coachUid };

        // Set up the active workout view directly with the assigned exercises
        currentWorkoutContext = { env: state.workoutEnv || 'gym', focus: w.title || 'Coach Workout', muscles: null };
        workoutStartTime = Date.now();
        workoutAccumulatedSeconds = 0;
        startWorkoutTimer();
        try { history.pushState({ workout: true }, ''); } catch (e) {}

        document.getElementById('workout-setup').classList.add('hidden');
        { const _cpc = document.getElementById('coach-plan-card'); if (_cpc) _cpc.classList.add('hidden'); }
        document.getElementById('workout-active').classList.remove('hidden');
        const titleEl = document.getElementById('active-workout-title');
        if (titleEl) titleEl.innerText = '📋 ' + (w.title || 'Coach Workout');
        document.getElementById('exercise-list').innerHTML = '';

        // Build a name→focus map so each exercise card shows the coach's focus note.
        window._assignedFocusByName = Object.create(null);
        (w.exercises || []).forEach(ex => {
            if (ex.focus) window._assignedFocusByName[ex.name] = ex.focus;
        });

        (w.exercises || []).forEach(ex => {
            addExercise(ex.name || '', { skipInitialSet: true });
            const cards = document.querySelectorAll('#exercise-list > div');
            const card = cards[cards.length - 1];
            if (!card) return;
            // Directly attach this exercise's focus note (handles duplicate names too)
            if (ex.focus) {
                const nameContainer = card.querySelector('.relative');
                if (nameContainer && !card.querySelector('.coach-focus-note')) {
                    const note = document.createElement('div');
                    note.className = "coach-focus-note mt-2 p-3 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-xl";
                    note.innerHTML = `
                        <p class="text-[10px] font-black uppercase text-indigo-600 mb-0.5">🎯 Coach's Focus</p>
                        <p class="text-sm text-slate-700">${escapeHtml(ex.focus)}</p>`;
                    nameContainer.appendChild(note);
                }
            }
            const setsContainer = card.querySelector('[id^="sets-"]');
            const exId = setsContainer ? setsContainer.id.replace('sets-', '') : null;
            const assignedSets = Array.isArray(ex.sets) && ex.sets.length ? ex.sets : [{ weight: '', reps: '' }];
            assignedSets.forEach(s => {
                if (exId) addSetToExercise(exId, ex.name ? getPersonalRecord(ex.name) : null, ex.name || '');
                const rows = card.querySelectorAll('.set-row');
                const row = rows[rows.length - 1];
                if (row) {
                    const w2 = row.querySelector('.set-weight');
                    const r2 = row.querySelector('.set-reps');
                    if (w2) w2.value = s.weight || '';
                    if (r2) r2.value = s.reps || '';
                }
            });
        });
        // Step through it one exercise at a time like other workouts
        setTimeout(() => enterWizardMode(), 120);
        persistActiveWorkout();
        showToast('Following your coach\'s workout 💪');
    }

    function openMemberNotes() {
        if (!firebaseUserData.coachUid) { showToast('No coach connected'); return; }
        const modal = document.getElementById('member-notes-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('member-notes-coach-name').textContent = firebaseUserData.coachName || 'Coach';
            loadMemberNotesThread();
        }
    }

    function closeMemberNotes() {
        const modal = document.getElementById('member-notes-modal');
        if (modal) modal.style.display = 'none';
    }

    async function loadMemberNotesThread() {
        const threadEl = document.getElementById('member-notes-thread');
        if (!threadEl) return;
        const coachUid = firebaseUserData.coachUid;
        const memberUid = currentUser.uid;
        if (!coachUid) { threadEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-3">No coach connected.</p>'; return; }
        try {
            const noteDoc = await db.collection('notes').doc(notesDocId(coachUid, memberUid)).get();
            const notes = (noteDoc.exists && noteDoc.data().messages) ? noteDoc.data().messages : [];
            if (notes.length === 0) {
                threadEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-3">No notes yet. Start the conversation below.</p>';
                return;
            }
            threadEl.innerHTML = renderNoteMessages(notes);
            threadEl.scrollTop = threadEl.scrollHeight;
        } catch (error) {
            console.error('Error loading member notes:', error);
            threadEl.innerHTML = '<p class="text-sm text-rose-500 text-center py-3">Could not load notes (check Firestore rules).</p>';
        }
    }

    async function postMemberNote() {
        const input = document.getElementById('member-note-input');
        const text = (input.value || '').trim().slice(0, 1000);
        if (!text) return;
        const coachUid = firebaseUserData.coachUid;
        const memberUid = currentUser.uid;
        if (!coachUid) { showToast('No coach connected'); return; }
        const message = {
            fromUid: currentUser.uid,
            fromName: firebaseUserData.name || (currentUser.displayName) || 'You',
            fromRole: 'member',
            text: text,
            at: new Date().toISOString()
        };
        try {
            await appendNote(coachUid, memberUid, message);
            await pushNotification(coachUid, {
                type: 'note',
                title: 'New message from ' + (firebaseUserData.name || 'your client'),
                body: text.length > 60 ? text.slice(0, 57) + '...' : text,
                fromName: firebaseUserData.name || 'Client'
            });
            input.value = '';
            loadMemberNotesThread();
        } catch (error) {
            console.error('Error posting member note:', error);
            showToast('Note failed: ' + (error.code || error.message || 'unknown'), 6000);
        }
    }

    // Render profile with Firebase data
    function renderProfile() {
        if (!currentUser) return;

        const name = (currentUser.displayName) || (firebaseUserData && firebaseUserData.name) || 'User';
        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-email').textContent = currentUser.email;

        if (firebaseUserData && firebaseUserData.createdAt) {
            try {
                const date = firebaseUserData.createdAt.toDate
                    ? firebaseUserData.createdAt.toDate()
                    : new Date(firebaseUserData.createdAt);
                document.getElementById('profile-created').textContent = date.toLocaleDateString();
            } catch (e) {
                document.getElementById('profile-created').textContent = 'Recently';
            }
        } else {
            document.getElementById('profile-created').textContent = 'Recently';
        }

        document.getElementById('profile-workouts').textContent = state.workoutHistory.length;
        const accountStatus = document.getElementById('profile-account-status');
        const verifyButton = document.getElementById('verify-email-btn');
        if (accountStatus) {
            accountStatus.textContent = currentUser.emailVerified ? '✓ Active · Email verified' : 'Active · Email verification needed';
            accountStatus.className = currentUser.emailVerified ? 'font-bold text-emerald-600' : 'font-bold text-amber-600';
        }
        if (verifyButton) verifyButton.classList.toggle('hidden', !!currentUser.emailVerified);
    }

    // ==========================================================================
    // STATE MANAGEMENT
    // ==========================================================================

    const DEFAULT_STATE = {
        meta: {
            schemaVersion: VFIT_STATE_SCHEMA_VERSION,
            updatedAt: null,
            lastCloudSyncAt: null
        },
        viewDate: localDateKey(),
        metricsDate: localDateKey(),
        goals: { calories: 2500, water: 2500, steps: 10000 },
        waterLogs: {},
        stepsLogs: {},
        dailyMeals: [],
        workoutHistory: [],
        nutritionHistory: [],
        metricsHistory: [],
        createdMeals: [],
        customFoods: [],
        barcodeFoods: [],
        // Seven-day shift-aware planner and its persistent manual/scanned shopping items.
        weeklyMealPlan: {},
        shoppingItems: [],
        shoppingChecks: {},
        workoutEnv: 'gym',
        currentPhotos: { front: null, side: null, back: null },
        habits: [],
        habitsEnabled: false,
        habitCompletions: {},
        hydrationGoalCompletions: {},
        stepsGoalCompletions: {},
        trackHydration: true,
        trackSteps: true,
        userGoals: [],
        // Diet goal for calorie targeting: 'lose' | 'maintain' | 'gain'
        dietGoal: { mode: '', rate: 1, rateUnit: 'lbs', gainRate: 250 },
        // Saved coaching answers used to personalise shift nutrition and meal ideas.
        dietaryProfile: {
            completed: false,
            pattern: 'balanced',       // 'balanced' | 'vegan' | 'vegetarian' | 'ketogenic'
            approaches: [],            // 'intermittent_fasting' and/or 'calorie_deficit'
            requirements: [],          // dietary exclusions or certification needs
            notes: '',
            source: null,
            updatedAt: null
        },
        cardioLogs: [],
        hydrationLogs: {},
        aiCoachEnabled: true,
        proteinGoal: 150,
        weightUnit: 'kg', // user's preferred display unit: 'kg' | 'lbs' | 'st'
        foodRegion: 'uk', // food search region: 'uk' | 'us' | 'world'
        // Shift-worker mode: null until set up. When enabled, drives chrono-nutrition
        // meal-timing guidance and training suggestions keyed to the shift pattern.
        shiftProfile: {
            enabled: false,
            acknowledgedDisclaimer: false,
            shiftType: 'nights',      // 'days' | 'nights' | 'rotating' | 'earlies'
            shiftStart: '19:00',      // clock time the shift starts
            shiftEnd: '07:00',        // clock time the shift ends
            workDays: [1, 2, 3, 4, 5],// 0=Sun..6=Sat that they're on shift
            goal: 'fat_loss',         // 'fat_loss' | 'muscle_gain'
            useFasting: false,        // optional 5:2-style fasting (rest days only)
            rota: {}                  // date-keyed overrides
        },
        checkIns: [],
        coachConversations: [],
        readinessLogs: {},
        coachingTargets: {
            workoutsPerWeek: 3,
            calorieTolerancePercent: 10,
            proteinAdherencePercent: 90
        },
        progressionSettings: {
            enabled: true,
            targetRir: 2,
            plateauSessions: 3,
            deloadPercent: 10
        },
        deloadPlan: {
            active: false,
            startDate: null,
            endDate: null,
            source: null,
            createdAt: null
        },
        notificationSettings: {
            enabled: false,
            reminderTime: '18:00',
            workouts: true,
            checkIns: true,
            hydration: false,
            coachMessages: true,
            deviceId: null
        },
        privacySettings: {
            cloudHealthData: true,
            noticeVersion: null,
            acknowledgedAt: null
        },
        // Progress-update reminders. Three independent trackers (weight, body
        // measurements, progress photos), each with its own schedule + delivery.
        // frequency: 'daily' | 'weekly' | 'monthly' | 'custom'
        // customDays: array of weekday numbers (0=Sun..6=Sat) for weekly/custom
        // customDate: day-of-month (1..31) for monthly, or a chosen recurring date
        // delivery: 'ai' (AI coach mentions it) | 'alert' (sign-in acknowledgement)
        // lastDone: ISO date string of the last time that update was logged
        updateReminders: {
            weight:      { enabled: false, frequency: 'weekly', customDays: [1], customDate: 1, delivery: 'alert', lastDone: null },
            measurement: { enabled: false, frequency: 'monthly', customDays: [1], customDate: 1, delivery: 'alert', lastDone: null },
            photo:       { enabled: false, frequency: 'monthly', customDays: [1], customDate: 1, delivery: 'alert', lastDone: null }
        },
        exerciseRatings: {}, // { 'Bench Press': { total: 14, count: 4 }, ... }  — average = total/count
        // User-created exercises: { name, env, focus, muscles:[], type:'compound'|'isolation' }
        customExercises: [],
        // Exercises the user has turned OFF (not available at their gym).
        // Stored as { gym: ['Machine Bicep Curl', ...], home: [...] }
        disabledExercises: { gym: [], home: [] },
        // A refresh-safe snapshot of the workout currently being logged.
        activeWorkout: null,
        userProfile: {
            gender: '',         // 'male' | 'female' | ''
            heightCm: null,     // number
            age: null,          // number
            yearsTraining: null, // number — used to derive experience level
            activityLevel: ''   // 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | ''
        },
        equipment: {
            gym: {
                'Barbell': true,
                'Dumbbells': true,
                'Cable Machine': true,
                'Weighted Machine': true,
                'Leg Press': true,
                'Pull Up Bar': true,
                'Bench': true
            },
            home: {
                'Dumbbells': false,
                'Resistance Bands': false,
                'Pull Up Bar': false,
                'Yoga Mat': true
            }
        }
    };

    let state = JSON.parse(JSON.stringify(DEFAULT_STATE));

    let workoutTimer = null;
    let workoutStartTime = null;       // absolute wall-clock timestamp when the workout began
    let workoutAccumulatedSeconds = 0; // legacy restore fallback for pre-beta.5 snapshots
    let currentWorkoutContext = null; // {env, focus, muscles} — set when a workout starts
    let showAllExercisesInPicker = false; // toggled by the "Show all" link in the dropdown
    let currentFoodItem = null;
    let lastCheckDate = null;
    let midnightCheckInterval = null;
    let selectedPreviousMeals = [];
    let currentEditingMeal = null;
    let editAmountType = 'portion';
    let currentAmountType = 'portion';
    let searchResults = [];
    let mealIngredients = [];
    let shiftMealDetailSelection = null;
    let html5QrCode = null;
    let metricsChart = null;
    let currentPhotoType = null;
    let manualFoodImageData = null;
    let midnightSaveTimeout = null;
    let localSaveCounter = 0;
    let cloudSyncTimer = null;
    let cloudSyncPromise = null;
    let cloudDirty = false;
    let cloudSyncError = null;

    // ==========================================================================
    // PERSISTENCE
    // ==========================================================================

    /** A photo is either legacy inline image data or a durable IndexedDB reference. */
    function isValidPhotoData(v) {
        return typeof v === 'string'
            && (v.indexOf('data:image/') === 0 || v.indexOf('vfit-photo:') === 0);
    }

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isPlainRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function sanitizeStoredValue(value, depth) {
        const level = depth || 0;
        if (level > 40) return null;
        if (Array.isArray(value)) return value.map(item => sanitizeStoredValue(item, level + 1));
        if (!isPlainRecord(value)) return value;
        const clean = {};
        Object.keys(value).forEach(key => {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            clean[key] = sanitizeStoredValue(value[key], level + 1);
        });
        return clean;
    }

    /** Keep only the state fields VFIT owns and repair older data shapes. */
    function normalizeState(input) {
        const raw = isPlainRecord(input) ? sanitizeStoredValue(input) : {};
        const normalized = deepClone(DEFAULT_STATE);

        Object.keys(DEFAULT_STATE).forEach(key => {
            if (Object.prototype.hasOwnProperty.call(raw, key)) normalized[key] = deepClone(raw[key]);
        });

        normalized.meta = Object.assign({}, DEFAULT_STATE.meta, isPlainRecord(raw.meta) ? raw.meta : {}, {
            schemaVersion: VFIT_STATE_SCHEMA_VERSION
        });
        normalized.goals = Object.assign({}, DEFAULT_STATE.goals, isPlainRecord(raw.goals) ? raw.goals : {});
        normalized.dietGoal = Object.assign({}, DEFAULT_STATE.dietGoal, isPlainRecord(raw.dietGoal) ? raw.dietGoal : {});
        normalized.dietaryProfile = Object.assign({}, DEFAULT_STATE.dietaryProfile, isPlainRecord(raw.dietaryProfile) ? raw.dietaryProfile : {});
        normalized.dietaryProfile.pattern = ['balanced', 'vegan', 'vegetarian', 'ketogenic'].includes(normalized.dietaryProfile.pattern)
            ? normalized.dietaryProfile.pattern
            : 'balanced';
        normalized.dietaryProfile.approaches = Array.isArray(normalized.dietaryProfile.approaches)
            ? normalized.dietaryProfile.approaches.filter(value => ['intermittent_fasting', 'calorie_deficit'].includes(value))
            : [];
        normalized.dietaryProfile.requirements = Array.isArray(normalized.dietaryProfile.requirements)
            ? normalized.dietaryProfile.requirements.filter(value => typeof value === 'string').slice(0, 16)
            : [];
        normalized.dietaryProfile.notes = String(normalized.dietaryProfile.notes || '').slice(0, 750);
        normalized.userProfile = Object.assign({}, DEFAULT_STATE.userProfile, isPlainRecord(raw.userProfile) ? raw.userProfile : {});
        normalized.shiftProfile = Object.assign({}, DEFAULT_STATE.shiftProfile, isPlainRecord(raw.shiftProfile) ? raw.shiftProfile : {});
        normalized.shiftProfile.rota = isPlainRecord(raw.shiftProfile && raw.shiftProfile.rota)
            ? deepClone(raw.shiftProfile.rota)
            : {};
        normalized.coachingTargets = Object.assign({}, DEFAULT_STATE.coachingTargets, isPlainRecord(raw.coachingTargets) ? raw.coachingTargets : {});
        normalized.progressionSettings = Object.assign({}, DEFAULT_STATE.progressionSettings, isPlainRecord(raw.progressionSettings) ? raw.progressionSettings : {});
        normalized.deloadPlan = Object.assign({}, DEFAULT_STATE.deloadPlan, isPlainRecord(raw.deloadPlan) ? raw.deloadPlan : {});
        normalized.notificationSettings = Object.assign({}, DEFAULT_STATE.notificationSettings, isPlainRecord(raw.notificationSettings) ? raw.notificationSettings : {});
        normalized.privacySettings = Object.assign({}, DEFAULT_STATE.privacySettings, isPlainRecord(raw.privacySettings) ? raw.privacySettings : {});
        normalized.currentPhotos = Object.assign({}, DEFAULT_STATE.currentPhotos, isPlainRecord(raw.currentPhotos) ? raw.currentPhotos : {});
        normalized.equipment = {
            gym: Object.assign({}, DEFAULT_STATE.equipment.gym, isPlainRecord(raw.equipment && raw.equipment.gym) ? raw.equipment.gym : {}),
            home: Object.assign({}, DEFAULT_STATE.equipment.home, isPlainRecord(raw.equipment && raw.equipment.home) ? raw.equipment.home : {})
        };
        normalized.updateReminders = {
            weight: Object.assign({}, DEFAULT_STATE.updateReminders.weight, isPlainRecord(raw.updateReminders && raw.updateReminders.weight) ? raw.updateReminders.weight : {}),
            measurement: Object.assign({}, DEFAULT_STATE.updateReminders.measurement, isPlainRecord(raw.updateReminders && raw.updateReminders.measurement) ? raw.updateReminders.measurement : {}),
            photo: Object.assign({}, DEFAULT_STATE.updateReminders.photo, isPlainRecord(raw.updateReminders && raw.updateReminders.photo) ? raw.updateReminders.photo : {})
        };
        normalized.disabledExercises = {
            gym: Array.isArray(raw.disabledExercises && raw.disabledExercises.gym) ? raw.disabledExercises.gym.filter(v => typeof v === 'string') : [],
            home: Array.isArray(raw.disabledExercises && raw.disabledExercises.home) ? raw.disabledExercises.home.filter(v => typeof v === 'string') : []
        };

        const arrayFields = [
            'dailyMeals', 'workoutHistory', 'nutritionHistory', 'metricsHistory',
            'createdMeals', 'customFoods', 'barcodeFoods', 'shoppingItems', 'habits', 'userGoals', 'cardioLogs',
            'customExercises', 'checkIns', 'coachConversations'
        ];
        arrayFields.forEach(key => {
            if (!Array.isArray(normalized[key])) normalized[key] = [];
        });
        const recordFields = [
            'waterLogs', 'stepsLogs', 'habitCompletions', 'hydrationGoalCompletions',
            'stepsGoalCompletions', 'hydrationLogs', 'exerciseRatings', 'readinessLogs',
            'weeklyMealPlan', 'shoppingChecks'
        ];
        recordFields.forEach(key => {
            if (!isPlainRecord(normalized[key])) normalized[key] = {};
        });

        // Migration: older meals used `type`; all current views use `mealType`.
        normalized.dailyMeals.forEach(meal => {
            if (isPlainRecord(meal) && !meal.mealType && meal.type) meal.mealType = meal.type;
        });

        // Remove invalid photo sentinels while preserving every real image.
        normalized.metricsHistory.forEach(metric => {
            if (!isPlainRecord(metric) || !isPlainRecord(metric.photos)) return;
            const cleanPhotos = {};
            Object.entries(metric.photos).forEach(([angle, value]) => {
                if (['front', 'side', 'back'].includes(angle) && isValidPhotoData(value)) cleanPhotos[angle] = value;
            });
            if (Object.keys(cleanPhotos).length) metric.photos = cleanPhotos;
            else delete metric.photos;
        });

        normalized.customExercises.forEach(exercise => {
            if (exercise && exercise.name && Array.isArray(exercise.muscles) && typeof EXERCISE_TO_MUSCLES !== 'undefined') {
                EXERCISE_TO_MUSCLES[exercise.name] = exercise.muscles.slice();
            }
        });
        return normalized;
    }

    function stateStorageKey(uid) {
        return STATE_KEY_PREFIX + String(uid || (currentUser && currentUser.uid) || 'guest');
    }

    function recoveryStorageKey(uid) {
        return STATE_BACKUP_PREFIX + String(uid || (currentUser && currentUser.uid) || 'guest');
    }

    function readStoredJson(key) {
        try {
            const value = localStorage.getItem(key);
            if (!value) return null;
            const parsed = JSON.parse(value);
            return isPlainRecord(parsed) ? parsed : null;
        } catch (error) {
            console.warn('Ignored an unreadable VFIT save:', key, error);
            return null;
        }
    }

    /** A small recovery copy excludes local-only image data to avoid doubling storage use. */
    function stateWithoutLocalImages(value) {
        return JSON.parse(JSON.stringify(value, (key, item) => {
            if (key === 'photos' || key === 'currentPhotos') return undefined;
            if (typeof item === 'string' && item.indexOf('data:image/') === 0) return undefined;
            return item;
        }));
    }

    function saveState(options) {
        const config = options || {};
        if (!isPlainRecord(state.meta)) state.meta = deepClone(DEFAULT_STATE.meta);
        state.meta.schemaVersion = VFIT_STATE_SCHEMA_VERSION;
        if (!config.preserveUpdatedAt) state.meta.updatedAt = new Date().toISOString();

        const key = stateStorageKey(config.uid);
        try {
            localStorage.setItem(key, JSON.stringify(state));
            localSaveCounter += 1;
            if (config.forceBackup || localSaveCounter % 10 === 1 || !localStorage.getItem(recoveryStorageKey(config.uid))) {
                try {
                    localStorage.setItem(recoveryStorageKey(config.uid), JSON.stringify(stateWithoutLocalImages(state)));
                } catch (backupError) {
                    console.warn('Recovery save skipped:', backupError);
                }
            }
            if (!config.skipCloud) scheduleCloudSnapshotSync();
            updateDataSyncStatus();
            return true;
        } catch (error) {
            console.error('Save error:', error);
            // Preserve the full in-memory state and at least refresh the photo-free
            // recovery record. Never delete older photos automatically.
            try {
                localStorage.setItem(recoveryStorageKey(config.uid), JSON.stringify(stateWithoutLocalImages(state)));
            } catch (backupError) {
                console.warn('Recovery save also failed:', backupError);
            }
            if (error && (error.name === 'QuotaExceededError' || error.code === 22)) {
                showToast('App storage is full. Your photo gallery is kept separately — export a backup and free device space.', 7000);
            } else {
                showToast('Could not save on this device. Export a backup now.', 6000);
            }
            updateDataSyncStatus();
            return false;
        }
    }

    /** Load only this signed-in account. A legacy shared save is claimed once. */
    function loadState(uid) {
        const accountId = uid || (currentUser && currentUser.uid) || 'guest';
        let parsed = readStoredJson(stateStorageKey(accountId));
        let source = 'device';

        if (!parsed) {
            parsed = readStoredJson(recoveryStorageKey(accountId));
            source = parsed ? 'recovery' : 'default';
        }

        if (!parsed && accountId !== 'guest') {
            let migratedUid = null;
            try { migratedUid = localStorage.getItem(LEGACY_MIGRATION_KEY); } catch (error) {}
            if (!migratedUid || migratedUid === accountId) {
                const legacy = readStoredJson(LEGACY_STATE_KEY);
                if (legacy) {
                    parsed = legacy;
                    source = 'legacy';
                    try { localStorage.setItem(LEGACY_MIGRATION_KEY, accountId); } catch (error) {}
                }
            }
        }

        state = normalizeState(parsed || DEFAULT_STATE);
        if (source === 'legacy' || source === 'recovery') {
            saveState({ uid: accountId, skipCloud: true, preserveUpdatedAt: true, forceBackup: true });
        }
        return source;
    }

    function exportVfitBackup() {
        try {
            const payload = {
                app: 'VFIT',
                appVersion: VFIT_APP_VERSION,
                schemaVersion: VFIT_STATE_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                accountEmail: currentUser ? (currentUser.email || '') : '',
                state: state
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
            showToast('Backup downloaded — keep it private', 5000);
        } catch (error) {
            console.error('Backup export failed:', error);
            showToast('Could not create the backup', 5000);
        }
    }

    async function importVfitBackup(event) {
        const input = event && event.target;
        const file = input && input.files && input.files[0];
        if (!file) return;
        try {
            if (file.size > 50 * 1024 * 1024) throw new Error('Backup is larger than 50 MB');
            const parsed = JSON.parse(await file.text());
            const imported = isPlainRecord(parsed && parsed.state) ? parsed.state : parsed;
            if (!isPlainRecord(imported)) throw new Error('This is not a VFIT state backup');
            const sourceEmail = parsed && parsed.accountEmail ? String(parsed.accountEmail) : '';
            const accountWarning = sourceEmail && currentUser && sourceEmail.toLowerCase() !== (currentUser.email || '').toLowerCase()
                ? `\n\nThis backup was exported for ${sourceEmail}.`
                : '';
            const approved = confirm(
                'Restore this VFIT backup? Imported history will be merged with this account, so existing workouts and photos are kept.' + accountWarning
            );
            if (!approved) return;
            const preferredImport = normalizeState(imported);
            preferredImport.meta.updatedAt = new Date(Date.now() + 1000).toISOString();
            state = mergeStateSnapshots(state, preferredImport);
            if (!saveState({ forceBackup: true })) throw new Error('The restored data could not be saved on this device');
            await flushCloudSync({ silent: true });
            showToast('Backup restored ✓');
            setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            console.error('Backup restore failed:', error);
            showToast(error.message || 'Could not restore that backup', 6000);
        } finally {
            if (input) input.value = '';
        }
    }

    let deferredInstallPrompt = null;

    function isStandaloneApp() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function requestPersistentDeviceStorage() {
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
            navigator.storage.persist().catch(() => false);
        }
    }

    function updateInstallButton() {
        const button = document.getElementById('install-app-btn');
        if (!button) return;
        if (isStandaloneApp()) {
            button.textContent = 'App Installed';
            button.disabled = true;
        } else {
            button.textContent = deferredInstallPrompt ? 'Install VFIT App' : 'Add to Home Screen';
            button.disabled = false;
        }
    }

    async function installVfitApp() {
        if (isStandaloneApp()) {
            showToast('VFIT is already installed');
            return;
        }
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            updateInstallButton();
            if (choice && choice.outcome === 'accepted') {
                requestPersistentDeviceStorage();
                showToast('VFIT installed ✓');
            }
            return;
        }
        showToast('In Chrome, open ⋮ then tap “Add to Home screen” or “Install app”', 7000);
    }

    function registerVfitServiceWorker() {
        if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then(registration => registration.update().catch(() => {}))
            .catch(error => console.warn('Offline app setup unavailable:', error));
    }

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        updateInstallButton();
    });
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        updateInstallButton();
    });
    window.addEventListener('online', () => {
        updateNetworkStatus(true);
        if (currentUser) scheduleCloudSnapshotSync(250);
    });
    window.addEventListener('offline', () => updateNetworkStatus(false));

    function setupMidnightSave() {
        if (midnightSaveTimeout) clearTimeout(midnightSaveTimeout);
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow - now;

        midnightSaveTimeout = setTimeout(() => {
            saveDailyNutrition();
            setupMidnightSave();
        }, msUntilMidnight);
    }

    function saveDailyNutrition() {
        const dateToSave = state.viewDate;
        const mealsForDate = state.dailyMeals.filter(m => m.date === dateToSave);

        if (mealsForDate.length > 0) {
            const totalCals = mealsForDate.reduce((sum, m) => sum + (m.calories || 0), 0);
            const totalProtein = mealsForDate.reduce((sum, m) => sum + (m.protein || 0), 0);
            const totalCarbs = mealsForDate.reduce((sum, m) => sum + (m.carbs || 0), 0);
            const totalFat = mealsForDate.reduce((sum, m) => sum + (m.fat || 0), 0);
            const totalFiber = mealsForDate.reduce((sum, m) => sum + (m.fiber || 0), 0);

            state.nutritionHistory = state.nutritionHistory.filter(h => h.date !== dateToSave);

            const entry = {
                date: dateToSave,
                calories: totalCals,
                protein: totalProtein,
                carbs: totalCarbs,
                fat: totalFat,
                fiber: totalFiber,
                meals: mealsForDate,
                savedAt: new Date().toISOString()
            };
            state.nutritionHistory.unshift(entry);

            state.nutritionHistory = state.nutritionHistory.slice(0, 365);

            saveState();
        } else {
            state.nutritionHistory = state.nutritionHistory.filter(h => h.date !== dateToSave);
            saveState();
        }
    }

    /**
     * Auto-save nutrition whenever a meal is added or removed.
     */
    function autoSaveNutrition() {
        saveDailyNutrition();
        if (currentUser && db) {
            syncToFirebase();
        }
    }

    // ==========================================================================
    // TAB MANAGEMENT
    // ==========================================================================

    const SETTINGS_PAGE_DETAILS = Object.freeze({
        coaching: {
            title: 'Coaching Hub',
            description: 'Daily advice, readiness, shift rota, check-ins and progression.'
        },
        personal: {
            title: 'Personal Details',
            description: 'Update body stats, maintenance calories and progress reminders.'
        },
        goals: {
            title: 'Goals & Nutrition Targets',
            description: 'Set your focus, calorie target and longer-term goals.'
        },
        equipment: {
            title: 'Equipment & Exercises',
            description: 'Choose the gym, home and custom exercises available to you.'
        },
        'ai-coach': {
            title: 'AI Coach Preferences',
            description: 'Control personalised training, nutrition and recovery advice.'
        },
        habits: {
            title: 'Daily Habits',
            description: 'Create and manage the habits shown on your dashboard.'
        },
        tracking: {
            title: 'Tracking Options',
            description: 'Choose whether hydration and steps appear in daily tracking.'
        },
        notifications: {
            title: 'Android Notifications',
            description: 'Set shift-aware workout, check-in and hydration reminders.'
        },
        privacy: {
            title: 'Privacy & Account',
            description: 'Review cloud privacy, exports and account controls.'
        },
        data: {
            title: 'Data & Offline App',
            description: 'Sync, back up, restore or install VFIT on your device.'
        },
        feedback: {
            title: 'Beta Feedback & Readiness',
            description: 'Report bugs or ideas with safe diagnostics and review launch checks.'
        }
    });
    let activeSettingsPage = 'home';

    function openSettingsPage(pageId, options) {
        const config = options || {};
        const requested = String(pageId || 'home');
        const nextPage = requested === 'home' || SETTINGS_PAGE_DETAILS[requested]
            ? requested
            : 'home';
        const isHome = nextPage === 'home';
        const menu = document.getElementById('settings-menu');
        const shell = document.getElementById('settings-subpage-shell');
        const contentCard = document.getElementById('settings-content-card');
        const title = document.getElementById('settings-subpage-title');
        const description = document.getElementById('settings-subpage-description');

        if (!menu || !shell) return false;
        menu.classList.toggle('hidden', !isHome);
        shell.classList.toggle('hidden', isHome);

        document.querySelectorAll('#settings [data-settings-page]').forEach(panel => {
            const visible = !isHome && panel.dataset.settingsPage === nextPage;
            panel.classList.toggle('hidden', !visible);
            panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });

        if (contentCard) {
            contentCard.classList.toggle('hidden', isHome || nextPage === 'coaching');
        }

        if (!isHome) {
            const details = SETTINGS_PAGE_DETAILS[nextPage];
            if (title) title.textContent = details.title;
            if (description) description.textContent = details.description;
            if (nextPage === 'coaching') {
                mountCoachingHubInSettings();
                if (config.render !== false) renderCoachingHub();
                openCoachingPage('home', { scroll: false, focus: false, render: false });
            } else if (config.render !== false) {
                renderSettings();
            }
        }

        activeSettingsPage = nextPage;
        if (config.scroll !== false) window.scrollTo({ top: 0, behavior: 'auto' });
        if (config.focus !== false) {
            const focusTarget = isHome ? document.getElementById('settings-menu-title') : title;
            if (focusTarget && focusTarget.focus) {
                try { focusTarget.focus({ preventScroll: true }); } catch (error) { focusTarget.focus(); }
            }
        }
        scheduleAccessibleDomRefresh();
        refreshIcons();
        return true;
    }

    function closeSettingsPage() {
        saveState();
        return openSettingsPage('home');
    }

    function openPreferencesAndGoals(pageId) {
        return switchTab('settings', { settingsPage: pageId || 'home' });
    }

    const COACHING_PAGE_DETAILS = Object.freeze({
        daily: ['Today’s Coaching', 'Daily conversation, readiness and advice based on today’s shift.'],
        training: ['Training & Goals', 'Weekly set targets, progression, plateaus and deload guidance.'],
        shifts: ['Shift Plan & Advice', 'Set the rota that powers today’s shift-aware coaching guidance.'],
        diet: ['Dietary Plan & Meals', 'Dietary requirements, eating approach and meals adapted to your shift.'],
        coach: ['Coach & Check-ins', 'Coach messages, shared plans and your weekly check-in.'],
        reports: ['Progress Reports', 'Review or download your weekly training and nutrition report.'],
        membership: ['Membership', 'View your current plan and available membership options.']
    });
    let activeCoachingPage = 'home';

    function openCoachingPage(pageId, options) {
        const config = options || {};
        const requested = String(pageId || 'home');
        const nextPage = requested === 'home' || COACHING_PAGE_DETAILS[requested] ? requested : 'home';
        const isHome = nextPage === 'home';
        const menu = document.getElementById('coaching-menu');
        const header = document.getElementById('coaching-subpage-header');
        const title = document.getElementById('coaching-subpage-title');
        const description = document.getElementById('coaching-subpage-description');
        if (!menu || !header) return false;

        if (!isHome && config.render !== false) renderCoachingHub();
        menu.classList.toggle('hidden', !isHome);
        header.classList.toggle('hidden', isHome);
        document.querySelectorAll('#coaching [data-coaching-page]').forEach(panel => {
            const visible = !isHome && panel.dataset.coachingPage === nextPage;
            panel.classList.toggle('hidden', !visible);
            panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });
        if (!isHome) {
            const details = COACHING_PAGE_DETAILS[nextPage];
            if (title) title.textContent = details[0];
            if (description) description.textContent = details[1];
        }
        activeCoachingPage = nextPage;
        if (config.scroll !== false) window.scrollTo({ top: 0, behavior: 'auto' });
        if (config.focus !== false) {
            const target = isHome ? document.getElementById('coaching-menu-title') : title;
            if (target && target.focus) {
                try { target.focus({ preventScroll: true }); } catch (error) { target.focus(); }
            }
        }
        scheduleAccessibleDomRefresh();
        refreshIcons();
        return true;
    }

    function closeCoachingPage() {
        return openCoachingPage('home');
    }

    function mountCoachingHubInSettings() {
        const hub = document.getElementById('coaching');
        const slot = document.getElementById('coaching-settings-slot');
        if (!hub || !slot) return false;
        if (hub.parentNode !== slot) slot.appendChild(hub);
        hub.classList.remove('hidden');
        return true;
    }

    function openCoachingHub() {
        return switchTab('coaching');
    }

    function switchTab(tabId, options) {
        const config = options || {};
        if (!VALID_TAB_IDS.has(tabId)) {
            console.warn('Ignored unknown tab:', tabId);
            return false;
        }
        const requestedTabId = tabId;
        const targetTabId = tabId === 'coaching' ? 'settings' : tabId;
        if (targetTabId === 'settings') mountCoachingHubInSettings();
        const tab = document.getElementById(targetTabId);
        if (!tab || !tab.classList.contains('tab-content')) return false;

        document.querySelectorAll('.tab-content').forEach(content => {
            const active = content === tab;
            content.classList.toggle('active', active);
            content.setAttribute('aria-hidden', active ? 'false' : 'true');
        });
        document.querySelectorAll('[onclick*="switchTab("]').forEach(control => {
            const handler = control.getAttribute('onclick') || '';
            const active = handler.includes(`switchTab('${targetTabId}')`) || handler.includes(`switchTab("${targetTabId}")`);
            if (active) control.setAttribute('aria-current', 'page');
            else control.removeAttribute('aria-current');
        });
        try { sessionStorage.setItem('vfit_active_tab', requestedTabId); } catch (error) {}

        const renders = {
            logs: () => { renderLogs(); filterWorkouts(); },
            profile: renderProfile,
            settings: () => { renderSettings(); renderCoachingHub(); },
            dashboard: renderDashboard,
            training: renderCoachPlanInTraining,
            metrics: () => {
                const picker = document.getElementById('metrics-date-picker');
                if (picker && !picker.value) picker.value = state.metricsDate || localDateKey();
                renderMetricsStatusLines();
                renderMetricsHistory();
            }
        };
        if (renders[targetTabId]) safeInvoke(`${targetTabId} tab`, renders[targetTabId]);
        if (targetTabId === 'settings') {
            const settingsPage = requestedTabId === 'coaching'
                ? 'coaching'
                : (config.settingsPage || 'home');
            openSettingsPage(settingsPage, { scroll: false, focus: false, render: false });
        }
        if (config.scroll !== false) window.scrollTo({ top: 0, behavior: 'auto' });
        if (requestedTabId === 'coaching' && config.scroll !== false) {
            setTimeout(() => {
                const hub = document.getElementById('coaching');
                if (hub && hub.scrollIntoView) hub.scrollIntoView({ block: 'start', behavior: 'auto' });
            }, 0);
        }
        scheduleAccessibleDomRefresh();
        refreshIcons();
        return true;
    }

    // ==========================================================================
    // SIDEBAR
    // ==========================================================================

    function toggleSidebar(forceOpen) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const trigger = document.getElementById('sidebar-menu-button');
        if (!sidebar || !overlay) return;
        const isOpen = sidebar.classList.contains('translate-x-0');
        const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
        if (!shouldOpen) {
            sidebar.classList.remove('translate-x-0');
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
            sidebar.setAttribute('aria-hidden', 'true');
            overlay.setAttribute('aria-hidden', 'true');
            if (trigger) {
                trigger.setAttribute('aria-expanded', 'false');
                trigger.setAttribute('aria-label', 'Open menu');
                if (isOpen) trigger.focus({ preventScroll: true });
            }
        } else {
            sidebar.classList.add('translate-x-0');
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
            sidebar.setAttribute('aria-hidden', 'false');
            overlay.setAttribute('aria-hidden', 'false');
            if (trigger) {
                trigger.setAttribute('aria-expanded', 'true');
                trigger.setAttribute('aria-label', 'Close menu');
            }
            setTimeout(() => document.getElementById('sidebar-close-button')?.focus({ preventScroll: true }), 0);
        }
        refreshIcons();
    }

    // ==========================================================================
    // TOAST
    // ==========================================================================

    function showToast(message, duration) {
        if (duration === undefined) duration = 3000;
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }
