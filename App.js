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

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

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
    let viewingClientData = null;

    // The single super-admin who manages the coach allowlist. Only this account
    // can see/use the Coach Access Admin space and write the approved-email list.
    const OWNER_EMAIL = 'steven.vaughanrr@hotmail.co.uk';

    function isOwner() {
        return currentUser && (currentUser.email || '').trim().toLowerCase() === OWNER_EMAIL;
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
                <input id="${inputId}" type="email" placeholder="email@example.com" autocomplete="off" class="flex-1 p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-medium" onkeydown="if(event.key==='Enter')addCoachEmail('${inputId}','${listId}')">
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
        lucide.createIcons();
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
                const arg = e.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `
                    <div class="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                        <span class="text-sm font-medium truncate">${safe}</span>
                        <button onclick="removeCoachEmail('${arg}','${listId}')" class="text-rose-500 text-xs font-bold hover:text-rose-600 flex-shrink-0 ml-2">Remove</button>
                    </div>`;
            }).join('');
            lucide.createIcons();
        } catch (e) {
            console.error('Error loading coach email list:', e);
            el.innerHTML = '<p class="text-sm text-rose-500 text-center py-2">Could not load list — check you are the owner and rules are published.</p>';
        }
    }

    async function addCoachEmail(inputId, listId) {
        const input = document.getElementById(inputId);
        const email = (input.value || '').trim().toLowerCase();
        if (!email || email.indexOf('@') < 1) { showToast('Enter a valid email'); return; }
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
    }

    function showRegister() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('forgot-password-form').classList.add('hidden');
    }

    function showForgotPassword() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('forgot-password-form').classList.remove('hidden');
    }

    // ==========================================================================
    // AUTH FUNCTIONS
    // ==========================================================================

    async function registerUser() {
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;

        if (!name) { showToast('Please enter your name'); return; }
        if (!email || !password) { showToast('Please fill all fields'); return; }
        if (password.length < 6) { showToast('Password must be at least 6 characters'); return; }
        if (password !== confirm) { showToast('Passwords do not match'); return; }

        // Everyone signs up as a member. Coach status is granted by the owner's
        // email allowlist and applied automatically on login — so if this email
        // is approved, the account becomes a coach the moment they sign in.
        try {
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
                shiftProfile: state.shiftProfile || null,
                disabledExercises: { gym: [], home: [] }
            });

            showToast('Account created successfully! 🎉');
        } catch (error) {
            console.error('Registration error:', error);
            if (error.code === 'auth/email-already-in-use') {
                showToast('Email already in use');
            } else if (error.code === 'auth/invalid-email') {
                showToast('Invalid email address');
            } else {
                showToast('Registration failed: ' + error.message);
            }
        }
    }

    async function loginUser() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        if (!email || !password) { showToast('Please enter email and password'); return; }
        try {
            await auth.signInWithEmailAndPassword(email, password);
            showToast('Welcome back! 💪');
        } catch (error) {
            console.error('Login error:', error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                showToast('Invalid email or password');
            } else {
                showToast('Login failed: ' + error.message);
            }
        }
    }

    async function resetPassword() {
        const email = document.getElementById('forgot-email').value.trim();
        if (!email) { showToast('Please enter your email'); return; }
        try {
            await auth.sendPasswordResetEmail(email);
            showToast('Password reset email sent! Check your inbox.');
            showLogin();
        } catch (error) {
            console.error('Reset error:', error);
            showToast('Failed to send reset email');
        }
    }

    async function logoutUser() {
        if (confirm('Are you sure you want to sign out?')) {
            try {
                await auth.signOut();
                showToast('Signed out successfully');
                state = JSON.parse(JSON.stringify(DEFAULT_STATE));
                saveState();
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Logout failed');
            }
        }
    }

    // Load user data from Firestore and merge with local
    async function loadFirebaseUserData() {
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if (doc.exists) {
                firebaseUserData = doc.data();
                if (firebaseUserData.calorieGoal) {
                    state.goals.calories = firebaseUserData.calorieGoal;
                }
                // Exercise database is account-level: pull the cloud copy so your
                // equipment setup and custom exercises follow you to any device.
                applyExercisePrefsFromCloud(firebaseUserData);
                mergeBarcodeFoodsFromCloud(firebaseUserData.barcodeFoods);
                applyShiftProfileFromCloud(firebaseUserData);
            } else {
                await db.collection('users').doc(currentUser.uid).set({
                    name: currentUser.displayName || 'User',
                    email: currentUser.email,
                    role: 'member',
                    emailLower: (currentUser.email || '').toLowerCase(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    calorieGoal: state.goals.calories || 2500,
                    workouts: [],
                    meals: [],
                    metrics: [],
                    coachUid: null,
                    coachName: null,
                    clientUids: [],
                    pendingRequests: [],
                    customExercises: state.customExercises || [],
                    barcodeFoods: state.barcodeFoods || [],
                    shiftProfile: state.shiftProfile || null,
                    disabledExercises: {
                        gym: (state.disabledExercises && state.disabledExercises.gym) || [],
                        home: (state.disabledExercises && state.disabledExercises.home) || []
                    }
                });
                firebaseUserData = { role: 'member', name: currentUser.displayName || 'User', email: currentUser.email };
            }

            // Role is DYNAMIC: determined by the coach-email allowlist every login,
            // not fixed at signup. If the email is approved → coach, else member.
            // Keep the stored role in sync so the rest of the app reads it correctly.
            const approved = await isApprovedCoach(currentUser.email);
            currentUserRole = approved ? 'coach' : 'member';
            if (firebaseUserData.role !== currentUserRole) {
                try {
                    await db.collection('users').doc(currentUser.uid).update({ role: currentUserRole });
                    firebaseUserData.role = currentUserRole;
                } catch (e) {
                    console.warn('Could not sync role field:', e);
                }
            }
        } catch (error) {
            console.error('Error loading Firebase user data:', error);
        }
    }

    // Sync local state to Firestore
    async function syncToCloud() {
        if (!currentUser) { showToast('Not signed in'); return; }
        try {
            await db.collection('users').doc(currentUser.uid).update({
                calorieGoal: state.goals.calories,
                lastSync: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('Synced to cloud ☁️');
        } catch (error) {
            console.error('Sync error:', error);
            showToast('Sync failed - check connection');
        }
    }

    // Stub used by autoSaveNutrition to be safe even when not signed in.
    function syncToFirebase() {
        // The real sync happens via syncToCloud(). This is a no-op safe stub
        // so autoSaveNutrition() can call it without error.
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
        if (!currentUser) return; // not signed in — local save still happened
        clearTimeout(exercisePrefsSyncTimer);
        exercisePrefsSyncTimer = setTimeout(async () => {
            try {
                await db.collection('users').doc(currentUser.uid).update({
                    customExercises: state.customExercises || [],
                    disabledExercises: {
                        gym: (state.disabledExercises && state.disabledExercises.gym) || [],
                        home: (state.disabledExercises && state.disabledExercises.home) || []
                    },
                    exercisePrefsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (error) {
                console.warn('Could not sync exercise preferences:', error);
                showToast('Equipment saved locally — will sync when online');
            }
        }, 700);
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
        saveState(); // cache locally so it works offline until the next login
    }

    // ==========================================================================
    // COACH / MEMBER SYSTEM
    // ==========================================================================
    // Roles are fixed at signup. Members push a snapshot of their training/nutrition
    // data to their Firestore user doc so a linked coach can read it (read-only).
    // Linking is consent-based: a coach sends a request by email, the member approves.
    // Notes are a two-way conversation. For a coach to READ a member's doc, your
    // Firestore security rules must permit it (rules provided separately).

    async function pushMemberDataToCloud() {
        if (!currentUser || currentUserRole !== 'member') return;
        try {
            const snapshot = {
                workoutHistory: (state.workoutHistory || []).slice(0, 100),
                nutritionHistory: (state.nutritionHistory || []).slice(0, 60),
                dailyMeals: state.dailyMeals || [],
                shiftProfile: state.shiftProfile || {},
                // Goals, focus & targets — so the coach can see what the client is working toward
                userGoals: state.userGoals || [],
                goalTargets: state.goals || {},
                userProfile: state.userProfile || {},
                metricsHistory: (state.metricsHistory || []).map(m => {
                    const copy = { ...m };
                    delete copy.photos; // photos are large; don't sync them
                    return copy;
                }),
                goals: state.goals || {},
                userProfile: state.userProfile || {},
                exerciseRatings: state.exerciseRatings || {},
                updatedAt: new Date().toISOString()
            };
            await db.collection('users').doc(currentUser.uid).update({
                dataSnapshot: snapshot,
                snapshotUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.warn('Could not push member data to cloud:', error);
        }
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
                    <input id="add-client-email" type="email" placeholder="client@email.com" class="flex-1 p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-medium">
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
        lucide.createIcons();
        await loadCoachClients();

        // If the owner is themselves a coach, surface the admin space here too.
        if (isOwner()) {
            const adminBox = document.getElementById('owner-admin-section-coach');
            if (adminBox) {
                adminBox.style.display = 'block';
                adminBox.innerHTML = ownerAdminHTML('admin-email-coach', 'admin-list-coach');
                lucide.createIcons();
                await loadCoachEmailList('admin-list-coach');
            }
        }
    }

    async function loadCoachClients() {
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
                    <div onclick="openClientDetail('${uid}')" class="bg-slate-50 p-4 rounded-2xl cursor-pointer hover:bg-slate-100 flex items-center gap-3">
                        <div class="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black flex-shrink-0">
                            ${escapeHtml((c.name || 'U').charAt(0).toUpperCase())}
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-bold truncate">${escapeHtml(c.name || 'Unknown')}</p>
                            <p class="text-xs text-slate-400 truncate">${escapeHtml(c.email || '')}</p>
                            <p class="text-[10px] text-slate-400">Updated: ${updated}</p>
                        </div>
                        <i data-lucide="chevron-right" class="w-5 h-5 text-slate-400 flex-shrink-0"></i>
                    </div>`);
            });
            listEl.innerHTML = cards.join('');
            lucide.createIcons();
        } catch (error) {
            console.error('Error loading clients:', error);
            listEl.innerHTML = '<p class="text-sm text-rose-500 text-center py-4">Could not load clients. Check your Firestore rules are published.</p>';
        }
    }

    async function sendClientRequest() {
        const emailInput = document.getElementById('add-client-email');
        const email = (emailInput.value || '').trim().toLowerCase();
        if (!email) { showToast('Enter a client email'); return; }
        if (email === (currentUser.email || '').toLowerCase()) { showToast("You can't add yourself"); return; }
        try {
            const snap = await db.collection('users').where('emailLower', '==', email).limit(1).get();
            if (snap.empty) { showToast('No member found with that email'); return; }
            const memberDoc = snap.docs[0];
            const member = memberDoc.data();
            if (member.role === 'coach') { showToast('That account is a coach, not a member'); return; }
            if (member.coachUid === currentUser.uid) { showToast('Already your client'); return; }
            const existing = (member.pendingRequests || []).some(r => r.fromUid === currentUser.uid);
            if (existing) { showToast('Request already sent'); return; }
            await db.collection('users').doc(memberDoc.id).update({
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
        try {
            const cDoc = await db.collection('users').doc(uid).get();
            if (!cDoc.exists) { showToast('Client not found'); return; }
            const c = cDoc.data();
            viewingClientData = { uid, name: c.name || 'Client', data: c.dataSnapshot || {}, email: c.email };
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

        const recentWorkouts = workouts.map(w => {
            const exCount = (w.exercises || []).length;
            const setCount = (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
            const title = w.title || w.focus || 'Workout';
            const badge = w.title ? '<span class="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">coach plan</span>' : '';
            return `<div onclick="openSessionDetail('${escapeHtml(w.date || '')}', '${w.id || ''}')" class="bg-slate-50 p-3 rounded-xl cursor-pointer hover:bg-slate-100">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm flex items-center gap-2">${escapeHtml(title)} ${badge}</span>
                    <span class="text-xs text-slate-400 flex items-center gap-1">${escapeHtml(w.date || '')} <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></span>
                </div>
                <p class="text-xs text-slate-400 mt-1">${exCount} exercises · ${setCount} sets${w.duration ? ' · ' + escapeHtml(w.duration) : ''} · tap for detail</p>
            </div>`;
        }).join('') || '<p class="text-sm text-slate-400 text-center py-3">No completed sessions yet</p>';

        const latestMetric = metrics[0] || {};
        const metricRows = [];
        if (latestMetric.weight) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Weight</span><span class="font-bold">${latestMetric.weight} kg</span></div>`);
        if (latestMetric.bodyFat) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Body Fat</span><span class="font-bold">${latestMetric.bodyFat}%</span></div>`);
        if (latestMetric.chest) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Chest</span><span class="font-bold">${latestMetric.chest} cm</span></div>`);
        if (latestMetric.waist) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Waist</span><span class="font-bold">${latestMetric.waist} cm</span></div>`);
        if (latestMetric.arms) metricRows.push(`<div class="flex justify-between"><span class="text-slate-400">Arms</span><span class="font-bold">${latestMetric.arms} cm</span></div>`);

        const recentNutrition = nutrition.slice(0, 7).map(d => {
            return `<div class="bg-slate-50 p-3 rounded-xl flex justify-between items-center">
                <span class="text-xs text-slate-400">${escapeHtml(d.date || '')}</span>
                <span class="font-bold text-sm">${Math.round(d.totalCalories || d.calories || 0)} kcal</span>
            </div>`;
        }).join('') || '<p class="text-sm text-slate-400 text-center py-3">No nutrition logged</p>';

        const lastUpdated = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString('en-GB') : 'never';

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
                    <span class="text-[10px] font-bold text-slate-400 uppercase">Read-only · synced ${lastUpdated}</span>
                </div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-3">Profile & Goals</h3>
                <div class="space-y-2 text-sm">
                    ${profile.gender ? `<div class="flex justify-between"><span class="text-slate-400">Gender</span><span class="font-bold">${escapeHtml(profile.gender)}</span></div>` : ''}
                    ${profile.age ? `<div class="flex justify-between"><span class="text-slate-400">Age</span><span class="font-bold">${profile.age}</span></div>` : ''}
                    ${profile.heightCm ? `<div class="flex justify-between"><span class="text-slate-400">Height</span><span class="font-bold">${profile.heightCm} cm</span></div>` : ''}
                    ${(profile.yearsTraining !== undefined && profile.yearsTraining !== null) ? `<div class="flex justify-between"><span class="text-slate-400">Training</span><span class="font-bold">${profile.yearsTraining} yrs</span></div>` : ''}
                    ${goals.calories ? `<div class="flex justify-between"><span class="text-slate-400">Calorie Goal</span><span class="font-bold">${goals.calories} kcal</span></div>` : ''}
                    ${goals.protein ? `<div class="flex justify-between"><span class="text-slate-400">Protein Goal</span><span class="font-bold">${goals.protein} g</span></div>` : ''}
                </div>
            </div>

            <div class="glass-card rounded-[2.5rem] p-6">
                <h3 class="text-lg font-black mb-3">Latest Measurements</h3>
                <div class="space-y-2 text-sm">
                    ${metricRows.length ? metricRows.join('') : '<p class="text-sm text-slate-400 text-center py-3">No measurements logged</p>'}
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
                    <input id="note-input" type="text" placeholder="Write a note..." class="flex-1 p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-medium" onkeydown="if(event.key==='Enter')postNote()">
                    <button onclick="postNote()" class="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700">Send</button>
                </div>
            </div>
            </div>
        `;
        lucide.createIcons();
        loadNotesThread();
        renderSharedDays();
        renderClientGoals();
        renderAssignedWorkoutsForCoach();
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
    function seenNotifIds() {
        try { return JSON.parse(localStorage.getItem('vfit_seen_notifs') || '[]'); }
        catch (e) { return []; }
    }
    function markNotifsSeen(ids) {
        const set = new Set(seenNotifIds());
        ids.forEach(id => set.add(id));
        localStorage.setItem('vfit_seen_notifs', JSON.stringify(Array.from(set).slice(-500)));
    }

    // Track which notifications the user has DISMISSED (read and cleared off the list)
    function dismissedNotifIds() {
        try { return JSON.parse(localStorage.getItem('vfit_dismissed_notifs') || '[]'); }
        catch (e) { return []; }
    }
    function dismissNotif(id) {
        const set = new Set(dismissedNotifIds());
        set.add(id);
        localStorage.setItem('vfit_dismissed_notifs', JSON.stringify(Array.from(set).slice(-1000)));
        markNotifsSeen([id]);
        openNotifications();     // re-render the list without the dismissed item
        refreshNotifBadge();
    }
    function clearAllNotifs() {
        const notifs = window._cachedNotifs || [];
        const set = new Set(dismissedNotifIds());
        notifs.forEach(n => set.add(n.id));
        localStorage.setItem('vfit_dismissed_notifs', JSON.stringify(Array.from(set).slice(-1000)));
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
                        <button onclick="dismissNotif('${n.id}')" class="text-slate-300 hover:text-slate-500 flex-shrink-0 self-start" aria-label="Dismiss">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>`;
            }).join('');
        }
        lucide.createIcons();

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
                    weight_loss: { emoji: '🔥', label: 'Weight Loss', color: 'text-rose-600' },
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
                    if (g.details.priority) parts.push(g.details.priority);
                    if (g.details.physique) parts.push(g.details.physique);
                    if (g.details.experience) parts.push(g.details.experience);
                    if (parts.length) summary = parts.join(' · ');
                } else if (g.focus === 'health' && g.details && g.details.area) {
                    summary = g.details.area;
                }

                return `
                    <div class="bg-slate-50 p-3 rounded-xl mb-2">
                        <span class="text-[10px] font-black ${focusInfo.color} uppercase">${focusInfo.emoji} ${focusInfo.label}</span>
                        <p class="font-bold text-sm mt-1">${escapeHtml(g.description || '')}</p>
                        ${summary ? `<p class="text-xs text-slate-500 mt-1">${escapeHtml(summary)}</p>` : ''}
                    </div>`;
            }).join('');
        }

        // Daily targets (calories / water / steps)
        const targetChips = [];
        if (targets.calories) targetChips.push(`🔥 ${targets.calories} kcal`);
        if (targets.water) targetChips.push(`💧 ${targets.water} ml`);
        if (targets.steps) targetChips.push(`👟 ${targets.steps.toLocaleString()} steps`);
        if (targetChips.length) {
            html += `<p class="text-[10px] font-black uppercase text-slate-400 mt-2 mb-1">Daily Targets</p>
                <div class="flex flex-wrap gap-2 mb-2">
                    ${targetChips.map(c => `<span class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full">${c}</span>`).join('')}
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
                html += `<div onclick="openSharedDetail('workout', '${escapeHtml(date)}')" class="bg-slate-50 p-3 rounded-xl cursor-pointer hover:bg-slate-100">
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
                html += `<div onclick="openSharedDetail('nutrition', '${escapeHtml(date)}')" class="bg-slate-50 p-3 rounded-xl cursor-pointer hover:bg-slate-100">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-bold text-sm">${escapeHtml(date)}</span>
                        <span class="text-xs text-slate-400 flex items-center gap-1">${Math.round(n.calories || 0)} kcal <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></span>
                    </div>
                    <p class="text-xs text-slate-400">${mealCount} item${mealCount !== 1 ? 's' : ''} · ${Math.round(n.protein || 0)}g P · ${Math.round(n.carbs || 0)}g C · ${Math.round(n.fat || 0)}g F · tap for detail</p>
                </div>`;
            });
        }

        box.innerHTML = html || '<p class="text-sm text-slate-400 text-center py-3">Nothing shared yet. Your client can share days from their app.</p>';
        lucide.createIcons();
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
                        <span class="text-sm font-bold">${s.weight || '—'} kg</span>
                        <span class="text-slate-300">×</span>
                        <span class="text-sm font-bold">${s.reps || '—'} reps</span>
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
        lucide.createIcons();
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
                            <span class="text-sm font-bold">${s.weight || '—'} kg</span>
                            <span class="text-slate-300">×</span>
                            <span class="text-sm font-bold">${s.reps || '—'} reps</span>
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
        lucide.createIcons();
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
        lucide.createIcons();
        return true;
    }

    async function confirmAssignWorkoutName() {
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
        if (field === 'name') assignExercises[exIdx].name = value;
        else assignExercises[exIdx].sets[setIdx][field] = value;
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
                    <input value="${escapeHtml(ex.name)}" oninput="updateAssignField(${i}, 'name', this.value)" placeholder="Exercise name" class="flex-1 p-2 rounded-lg border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm">
                    <button onclick="removeAssignExercise(${i})" class="text-rose-500 text-xs font-bold px-2">✕</button>
                </div>
                ${ex.sets.map((s, si) => `
                    <div class="flex gap-2 mb-1 items-center">
                        <span class="text-xs text-slate-400 w-10">Set ${si + 1}</span>
                        <input value="${s.weight}" oninput="updateAssignField(${i}, 'weight', this.value, ${si})" placeholder="kg" inputmode="decimal" class="w-20 p-2 rounded-lg text-center border-2 border-transparent focus:border-indigo-500 outline-none text-sm">
                        <span class="text-xs text-slate-400">×</span>
                        <input value="${s.reps}" oninput="updateAssignField(${i}, 'reps', this.value, ${si})" placeholder="reps" inputmode="numeric" class="w-20 p-2 rounded-lg text-center border-2 border-transparent focus:border-indigo-500 outline-none text-sm">
                    </div>`).join('')}
                <button onclick="addAssignSet(${i})" class="text-indigo-600 text-xs font-bold mt-1">+ Add set</button>
            </div>`).join('');
    }

    async function saveAssignedWorkout() {
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
                    const stars = it.stars ? '★'.repeat(it.stars) + '☆'.repeat(5 - it.stars) : '—';
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
        const input = document.getElementById('note-input');
        const text = (input.value || '').trim();
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
                    const safeName = (r.fromName || 'Coach').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    return `
                    <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl mb-2">
                        <p class="font-bold text-sm">${escapeHtml(r.fromName || 'A coach')}</p>
                        <p class="text-xs text-slate-500 mb-2">${escapeHtml(r.fromEmail || '')} wants to be your coach</p>
                        <div class="flex gap-2">
                            <button onclick="approveCoach('${r.fromUid}', '${safeName}')" class="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold text-sm">Approve</button>
                            <button onclick="declineCoach('${r.fromUid}')" class="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-bold text-sm">Decline</button>
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
                    <div class="grid grid-cols-1 gap-2">
                        <button onclick="openShareDays()" class="bg-emerald-600 text-white p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1">
                            <i data-lucide="share-2" class="w-4 h-4"></i> Share Days With Coach
                        </button>
                    </div>
                    <p class="text-[11px] text-slate-400 text-center mt-2">Your coach's workouts appear in the Training tab.</p>`;
            } else if (pending.length === 0) {
                html += '<p class="text-sm text-slate-400">No coach connected. When a coach sends a request, it\'ll appear here to approve.</p>';
            }
            container.innerHTML = html;
            lucide.createIcons();
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
        lucide.createIcons();
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
                    <input type="checkbox" ${selected ? 'checked' : ''} onchange="toggleShareDay('${date}', this.checked)" class="w-5 h-5 accent-indigo-600 flex-shrink-0">
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
        lucide.createIcons();
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
        lucide.createIcons();
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
        const today = now.toISOString().split('T')[0];
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

    /** Mark a reminder as completed today (called when the user logs that item). */
    function markReminderDone(key) {
        const cfg = updReminders()[key];
        if (!cfg) return;
        cfg.lastDone = new Date().toISOString().split('T')[0];
        saveState();
        refreshDueAlertBadgeSoon();
    }

    // ---- The sign-in ALERT flow (delivery === 'alert') ----
    // Builds a queue of due 'alert' reminders and walks the user through ticking
    // each. They tick the box and press Next; on the last one it's Finish.
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
        // Last in queue → "Finish", otherwise "Next"
        nextBtn.textContent = (alertIndex >= alertQueue.length - 1) ? 'Finish' : 'Next';

        document.getElementById('update-alerts-modal').style.display = 'flex';
        lucide.createIcons();
    }

    function updateAlertNext() {
        const key = alertQueue[alertIndex];
        const check = document.getElementById('update-alert-check');
        if (check && check.checked) {
            // They confirmed — mark done so it stops reminding this period, and
            // jump them to the right logging screen.
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
        // Dismiss for now; they'll be reminded again next sign-in / next day
        document.getElementById('update-alerts-modal').style.display = 'none';
    }

    /** Send the user to the relevant logging screen for a reminder type. */
    function openLoggerFor(key) {
        // Close any alert modal first
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
        // (Hook for a future badge; safe no-op if not present.)
    }


    // Evidence-based guidance (NOT medical advice) that adapts meal timing and
    // training to a person's shift. Keyed to circadian science: the SCN (the
    // brain's master clock in the hypothalamus) is set mainly by light, while
    // "peripheral clocks" in the gut/muscle respond to zeitgebers ("time-givers")
    // like food timing, activity and light. Shift work desynchronises these, so
    // the aim is to reduce eating in the biological night and place training when
    // the body is most primed.

    let shiftPlannerWeekOffset = 0;
    let shiftAdviceDateKey = null;
    let plannedShiftEditorDateKey = null;

    function shiftP() {
        if (!state.shiftProfile) state.shiftProfile = JSON.parse(JSON.stringify(DEFAULT_STATE.shiftProfile));
        state.shiftProfile = Object.assign({}, DEFAULT_STATE.shiftProfile, state.shiftProfile);
        if (
            !state.shiftProfile.plannedShifts ||
            typeof state.shiftProfile.plannedShifts !== 'object' ||
            Array.isArray(state.shiftProfile.plannedShifts)
        ) {
            state.shiftProfile.plannedShifts = {};
        }
        return state.shiftProfile;
    }

    async function syncShiftProfileToCloud() {
        if (!currentUser || !db) return;
        try {
            await db.collection('users').doc(currentUser.uid).set({
                shiftProfile: JSON.parse(JSON.stringify(shiftP())),
                shiftProfileUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.warn('Shift planner saved locally but cloud sync failed:', error);
        }
    }

    function applyShiftProfileFromCloud(data) {
        if (!data) return;
        const localProfile = shiftP();
        if (!data.shiftProfile || typeof data.shiftProfile !== 'object') {
            if (localProfile.enabled) syncShiftProfileToCloud();
            return;
        }

        const cloudProfile = Object.assign(
            {},
            DEFAULT_STATE.shiftProfile,
            data.shiftProfile,
            {
                plannedShifts: Object.assign(
                    {},
                    (data.shiftProfile && data.shiftProfile.plannedShifts) || {}
                )
            }
        );
        const cloudUpdated = cloudProfile.updatedAt ? (Date.parse(cloudProfile.updatedAt) || 0) : 0;
        const localUpdated = localProfile.updatedAt ? (Date.parse(localProfile.updatedAt) || 0) : 0;

        // A legacy local plan may pre-date timestamps. Do not let an older,
        // disabled cloud placeholder erase an already configured device.
        if (!localProfile.enabled || (cloudUpdated > 0 && cloudUpdated >= localUpdated)) {
            state.shiftProfile = cloudProfile;
            saveState();
        } else {
            syncShiftProfileToCloud();
        }
    }

    function persistShiftProfile() {
        const sp = shiftP();
        sp.updatedAt = new Date().toISOString();
        saveState();
        syncShiftProfileToCloud();
        if (typeof pushMemberDataToCloud === 'function') pushMemberDataToCloud();
    }

    function renderShiftWorker() {
        const box = document.getElementById('shift-worker-content');
        if (!box) return;
        const sp = shiftP();

        // GATE 1: must acknowledge the medical disclaimer before anything else
        if (!sp.acknowledgedDisclaimer) {
            box.innerHTML = shiftDisclaimerHTML();
            lucide.createIcons();
            return;
        }

        // GATE 2: not enabled yet → show intro + setup button
        if (!sp.enabled) {
            box.innerHTML = `
                <div class="glass-card p-6 rounded-[2.5rem] text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-indigo-50 rounded-2xl flex items-center justify-center">
                        <i data-lucide="moon" class="w-8 h-8 text-indigo-600"></i>
                    </div>
                    <h3 class="text-xl font-black mb-2">Shift Worker Mode</h3>
                    <p class="text-sm text-slate-500 mb-5">Plan individual shifts and receive meal and training advice for that exact day. Your repeating pattern remains available as a fallback.</p>
                    <button onclick="openShiftSetup()" class="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold hover:bg-indigo-700">Set Up My Default Pattern</button>
                    <button onclick="reshowShiftDisclaimer()" class="w-full mt-2 text-xs text-slate-400 font-bold">Review the health disclaimer</button>
                </div>`;
            lucide.createIcons();
            return;
        }

        if (!shiftAdviceDateKey) shiftAdviceDateKey = localDateKey();
        box.innerHTML = shiftPlanHTML();
        lucide.createIcons();
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
        persistShiftProfile();
        renderShiftWorker();
    }

    function reshowShiftDisclaimer() {
        shiftP().acknowledgedDisclaimer = false;
        persistShiftProfile();
        renderShiftWorker();
    }

    // ---- SETUP ----
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
        lucide.createIcons();
    }

    function closeShiftSetup() {
        document.getElementById('shift-setup-modal').style.display = 'none';
    }

    function toggleFastingVisibility() {
        const goal = document.getElementById('shift-goal-select').value;
        const wrap = document.getElementById('shift-fasting-wrap');
        if (wrap) wrap.style.display = (goal === 'fat_loss') ? '' : 'none';
    }

    function applyShiftPatternTypeDefaults() {
        const type = document.getElementById('shift-type-select')?.value;
        if (!type || type === 'rotating') return;
        const defaults = defaultTimesForShiftType(normaliseShiftType(type));
        const startInput = document.getElementById('shift-start-input');
        const endInput = document.getElementById('shift-end-input');
        if (startInput) startInput.value = defaults.start;
        if (endInput) endInput.value = defaults.end;
    }

    function saveShiftSetup() {
        const sp = shiftP();
        sp.shiftType = document.getElementById('shift-type-select').value;
        const defaultTimes = sp.shiftType === 'rotating'
            ? { start: '19:00', end: '07:00' }
            : defaultTimesForShiftType(normaliseShiftType(sp.shiftType));
        sp.shiftStart = document.getElementById('shift-start-input').value || defaultTimes.start;
        sp.shiftEnd = document.getElementById('shift-end-input').value || defaultTimes.end;
        sp.goal = document.getElementById('shift-goal-select').value;
        sp.useFasting = (sp.goal === 'fat_loss') && document.getElementById('shift-fasting-check').checked;
        sp.workDays = [0,1,2,3,4,5,6].filter(d => {
            const cb = document.getElementById('shift-day-' + d);
            return cb && cb.checked;
        });
        sp.enabled = true;
        persistShiftProfile();
        closeShiftSetup();
        renderShiftWorker();
        showToast('Default pattern saved — daily advice updated');
    }


    // ---- Shift planner and date-specific advice ----
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

    function localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function dateFromLocalKey(key) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
        if (
            date.getFullYear() !== Number(match[1]) ||
            date.getMonth() !== Number(match[2]) - 1 ||
            date.getDate() !== Number(match[3])
        ) return null;
        return date;
    }

    function addLocalDays(date, days) {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
    }

    function defaultTimesForShiftType(type) {
        const defaults = {
            earlies: { start: '06:00', end: '14:00' },
            days: { start: '08:00', end: '16:00' },
            lates: { start: '14:00', end: '22:00' },
            nights: { start: '19:00', end: '07:00' },
            off: { start: '', end: '' }
        };
        return defaults[type] || defaults.days;
    }

    function normaliseShiftType(type) {
        return ['off', 'earlies', 'days', 'lates', 'nights'].includes(type) ? type : 'off';
    }

    function resolvePatternShiftType(sp) {
        if (['earlies', 'days', 'lates', 'nights'].includes(sp.shiftType)) return sp.shiftType;
        const start = hmToMin(sp.shiftStart);
        const end = hmToMin(sp.shiftEnd);
        if (end < start || start >= 17 * 60) return 'nights';
        if (start < 7 * 60) return 'earlies';
        if (start >= 12 * 60) return 'lates';
        return 'days';
    }

    function shiftTypeMeta(type) {
        const types = {
            off: { emoji: '☀️', label: 'Rest / Off Day', short: 'Off', badge: 'bg-slate-100 text-slate-600' },
            earlies: { emoji: '🌅', label: 'Early Shift', short: 'Early', badge: 'bg-amber-100 text-amber-700' },
            days: { emoji: '☀️', label: 'Day Shift', short: 'Day', badge: 'bg-sky-100 text-sky-700' },
            lates: { emoji: '🌆', label: 'Late Shift', short: 'Late', badge: 'bg-violet-100 text-violet-700' },
            nights: { emoji: '🌙', label: 'Night Shift', short: 'Night', badge: 'bg-indigo-100 text-indigo-700' }
        };
        return types[normaliseShiftType(type)];
    }

    function getShiftForDate(dateKey) {
        const sp = shiftP();
        const date = dateFromLocalKey(dateKey) || new Date();
        const safeDateKey = dateFromLocalKey(dateKey) ? dateKey : localDateKey(date);
        const planned = sp.plannedShifts && Object.prototype.hasOwnProperty.call(sp.plannedShifts, safeDateKey)
            ? sp.plannedShifts[safeDateKey]
            : null;

        if (planned && typeof planned === 'object') {
            const type = normaliseShiftType(planned.type);
            const defaults = defaultTimesForShiftType(type);
            return {
                dateKey: safeDateKey,
                type,
                start: type === 'off' ? '' : (planned.start || defaults.start),
                end: type === 'off' ? '' : (planned.end || defaults.end),
                source: 'planned'
            };
        }

        const isPatternWorkDay = !!sp.enabled && (sp.workDays || []).includes(date.getDay());
        if (!isPatternWorkDay) {
            return { dateKey: safeDateKey, type: 'off', start: '', end: '', source: 'pattern' };
        }

        const type = resolvePatternShiftType(sp);
        const defaults = defaultTimesForShiftType(type);
        return {
            dateKey: safeDateKey,
            type,
            start: sp.shiftStart || defaults.start,
            end: sp.shiftEnd || defaults.end,
            source: 'pattern'
        };
    }

    function isOnShiftToday() {
        return getShiftForDate(localDateKey()).type !== 'off';
    }

    function formatShiftPlannerDate(date, options) {
        return date.toLocaleDateString('en-GB', options || {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    }

    function getShiftPlannerWeekStart() {
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const mondayOffset = (today.getDay() + 6) % 7;
        return addLocalDays(today, -mondayOffset + (shiftPlannerWeekOffset * 7));
    }

    function shiftPlannerHTML() {
        const weekStart = getShiftPlannerWeekStart();
        const todayKey = localDateKey();
        const selectedKey = shiftAdviceDateKey || todayKey;
        const rows = [];

        for (let i = 0; i < 7; i++) {
            const date = addLocalDays(weekStart, i);
            const dateKey = localDateKey(date);
            const shift = getShiftForDate(dateKey);
            const meta = shiftTypeMeta(shift.type);
            const isSelected = dateKey === selectedKey;
            const isToday = dateKey === todayKey;
            const timeText = shift.type === 'off'
                ? 'Recovery day'
                : `${minToHM(hmToMin(shift.start))} – ${minToHM(hmToMin(shift.end))}`;
            rows.push(`
                <div class="flex items-center gap-2 p-2 rounded-2xl border ${isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 bg-white'}">
                    <button type="button" onclick="selectShiftAdviceDate('${dateKey}')" class="flex-1 min-w-0 flex items-center gap-3 text-left">
                        <div class="w-14 shrink-0">
                            <p class="text-[10px] font-black uppercase ${isToday ? 'text-indigo-600' : 'text-slate-400'}">${formatShiftPlannerDate(date, { weekday: 'short' })}${isToday ? ' · Today' : ''}</p>
                            <p class="text-sm font-black text-slate-800">${formatShiftPlannerDate(date, { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <div class="flex-1 min-w-0">
                            <span class="inline-flex px-2 py-1 rounded-lg text-[10px] font-black uppercase ${meta.badge}">${meta.emoji} ${meta.short}</span>
                            <p class="text-xs text-slate-500 mt-1 truncate">${timeText} · ${shift.source === 'planned' ? 'Planned' : 'Default pattern'}</p>
                        </div>
                    </button>
                    <button type="button" onclick="openPlannedShiftEditor('${dateKey}')" class="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Edit shift for ${formatShiftPlannerDate(date)}">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                </div>`);
        }

        return `
            <div class="glass-card p-5 rounded-[2.5rem]">
                <div class="flex items-center justify-between gap-3 mb-4">
                    <div>
                        <p class="text-[10px] font-black uppercase text-indigo-500">Linked Shift Planner</p>
                        <h3 class="text-lg font-black">Choose a day for tailored advice</h3>
                    </div>
                    <button type="button" onclick="openShiftSetup()" class="text-[11px] font-black text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl">Default Pattern</button>
                </div>
                <div class="flex items-center justify-between gap-2 mb-3">
                    <button type="button" onclick="changeShiftPlannerWeek(-1)" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center" aria-label="Previous week">
                        <i data-lucide="chevron-left" class="w-4 h-4"></i>
                    </button>
                    <div class="text-center">
                        <p class="text-xs font-black text-slate-700">${formatShiftPlannerDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatShiftPlannerDate(addLocalDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        <button type="button" onclick="goToCurrentShiftWeek()" class="text-[10px] font-bold text-indigo-600 mt-1">Jump to today</button>
                    </div>
                    <button type="button" onclick="changeShiftPlannerWeek(1)" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center" aria-label="Next week">
                        <i data-lucide="chevron-right" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="space-y-2">${rows.join('')}</div>
                <p class="text-[11px] text-slate-400 mt-3">Tap a day to update the advice below. The pencil saves a one-day shift that overrides your repeating pattern.</p>
            </div>`;
    }

    function changeShiftPlannerWeek(direction) {
        shiftPlannerWeekOffset += direction;
        renderShiftWorker();
    }

    function goToCurrentShiftWeek() {
        shiftPlannerWeekOffset = 0;
        shiftAdviceDateKey = localDateKey();
        renderShiftWorker();
    }

    function selectShiftAdviceDate(dateKey) {
        if (!dateFromLocalKey(dateKey)) return;
        shiftAdviceDateKey = dateKey;
        renderShiftWorker();
    }

    function updatePlannedShiftTimeVisibility() {
        const type = document.getElementById('planned-shift-type')?.value;
        const timeWrap = document.getElementById('planned-shift-times');
        if (timeWrap) timeWrap.style.display = type === 'off' ? 'none' : '';
    }

    function applyPlannedShiftTypeDefaults() {
        const type = normaliseShiftType(document.getElementById('planned-shift-type')?.value);
        const defaults = defaultTimesForShiftType(type);
        const startInput = document.getElementById('planned-shift-start');
        const endInput = document.getElementById('planned-shift-end');
        if (startInput) startInput.value = defaults.start;
        if (endInput) endInput.value = defaults.end;
        updatePlannedShiftTimeVisibility();
    }

    function openPlannedShiftEditor(dateKey) {
        if (!dateFromLocalKey(dateKey)) return;
        const modal = document.getElementById('planned-shift-modal');
        if (!modal) return;

        plannedShiftEditorDateKey = dateKey;
        shiftAdviceDateKey = dateKey;
        const sp = shiftP();
        const hasOverride = Object.prototype.hasOwnProperty.call(sp.plannedShifts, dateKey);
        const shift = getShiftForDate(dateKey);
        const dateInput = document.getElementById('planned-shift-date');
        const typeInput = document.getElementById('planned-shift-type');
        const startInput = document.getElementById('planned-shift-start');
        const endInput = document.getElementById('planned-shift-end');
        const source = document.getElementById('planned-shift-source');
        const fallbackButton = document.getElementById('planned-shift-use-pattern');

        if (dateInput) dateInput.value = dateKey;
        if (typeInput) typeInput.value = shift.type;
        if (startInput) startInput.value = shift.start || defaultTimesForShiftType(shift.type).start;
        if (endInput) endInput.value = shift.end || defaultTimesForShiftType(shift.type).end;
        if (source) source.textContent = hasOverride
            ? 'This date has a saved one-day shift. It overrides your default pattern.'
            : 'This currently follows your default repeating pattern. Saving creates a one-day override.';
        if (fallbackButton) {
            fallbackButton.disabled = !hasOverride;
            fallbackButton.classList.toggle('opacity-40', !hasOverride);
        }

        updatePlannedShiftTimeVisibility();
        modal.style.display = 'flex';
        lucide.createIcons();
    }

    function loadPlannedShiftEditorDate(dateKey) {
        if (!dateFromLocalKey(dateKey)) return;
        openPlannedShiftEditor(dateKey);
    }

    function closePlannedShiftEditor() {
        const modal = document.getElementById('planned-shift-modal');
        if (modal) modal.style.display = 'none';
        plannedShiftEditorDateKey = null;
    }

    function prunePlannedShifts(plannedShifts) {
        const keys = Object.keys(plannedShifts || {});
        if (keys.length <= 400) return;
        keys.sort((a, b) => {
            const aTime = Date.parse(plannedShifts[a]?.updatedAt || '') || 0;
            const bTime = Date.parse(plannedShifts[b]?.updatedAt || '') || 0;
            return bTime - aTime;
        });
        keys.slice(400).forEach(key => delete plannedShifts[key]);
    }

    function savePlannedShift() {
        const dateKey = document.getElementById('planned-shift-date')?.value || plannedShiftEditorDateKey;
        if (!dateFromLocalKey(dateKey)) {
            showToast('Choose a valid date');
            return;
        }

        const type = normaliseShiftType(document.getElementById('planned-shift-type')?.value);
        const defaults = defaultTimesForShiftType(type);
        const start = document.getElementById('planned-shift-start')?.value || defaults.start;
        const end = document.getElementById('planned-shift-end')?.value || defaults.end;
        if (type !== 'off' && (!start || !end)) {
            showToast('Add the shift start and finish times');
            return;
        }

        const sp = shiftP();
        sp.plannedShifts[dateKey] = {
            type,
            start: type === 'off' ? '' : start,
            end: type === 'off' ? '' : end,
            updatedAt: new Date().toISOString()
        };
        sp.enabled = true;
        prunePlannedShifts(sp.plannedShifts);
        shiftAdviceDateKey = dateKey;
        persistShiftProfile();
        closePlannedShiftEditor();
        renderShiftWorker();
        showToast(`${shiftTypeMeta(type).label} saved — advice updated`);
    }

    function useShiftPatternForDate() {
        const dateKey = document.getElementById('planned-shift-date')?.value || plannedShiftEditorDateKey;
        if (!dateFromLocalKey(dateKey)) return;
        const sp = shiftP();
        delete sp.plannedShifts[dateKey];
        shiftAdviceDateKey = dateKey;
        persistShiftProfile();
        closePlannedShiftEditor();
        renderShiftWorker();
        showToast('Using your default pattern — advice updated');
    }

    function shiftPlanHTML() {
        const sp = shiftP();
        const adviceDateKey = dateFromLocalKey(shiftAdviceDateKey) ? shiftAdviceDateKey : localDateKey();
        shiftAdviceDateKey = adviceDateKey;
        const adviceDate = dateFromLocalKey(adviceDateKey);
        const shiftForDay = getShiftForDate(adviceDateKey);
        const meta = shiftTypeMeta(shiftForDay.type);
        const onShift = shiftForDay.type !== 'off';
        const isNight = shiftForDay.type === 'nights';
        const dayLabel = formatShiftPlannerDate(adviceDate, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        const sourceLabel = shiftForDay.source === 'planned' ? 'Saved in Shift Planner' : 'From Default Pattern';

        let html = shiftPlannerHTML();
        html += `
            <div class="glass-card p-6 rounded-[2.5rem] border-2 border-indigo-100">
                <div class="flex justify-between items-start gap-3 mb-2">
                    <div>
                        <p class="text-[10px] font-black uppercase text-indigo-500">Advice for ${dayLabel}</p>
                        <h3 class="text-xl font-black">${meta.emoji} ${meta.label}</h3>
                        <span class="inline-flex mt-2 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${meta.badge}">${sourceLabel}</span>
                    </div>
                    <button type="button" onclick="openPlannedShiftEditor('${adviceDateKey}')" class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl shrink-0">Edit Day</button>
                </div>
                <p class="text-sm text-slate-500">${onShift
                    ? `Your planned shift runs ${minToHM(hmToMin(shiftForDay.start))} – ${minToHM(hmToMin(shiftForDay.end))}. Every meal, training and fasting suggestion below uses this shift.`
                    : 'This is marked as a rest day, so the advice below returns to daytime meals, recovery and sleep re-anchoring.'}
                </p>
            </div>`;

        if (!onShift) html += offDayMealHTML();
        else if (shiftForDay.type === 'nights') html += nightShiftMealHTML(shiftForDay);
        else if (shiftForDay.type === 'earlies') html += earlyShiftMealHTML(shiftForDay);
        else if (shiftForDay.type === 'lates') html += lateShiftMealHTML(shiftForDay);
        else html += dayShiftMealHTML(shiftForDay);

        html += shiftTrainingHTML(onShift, isNight, shiftForDay);

        if (sp.goal === 'fat_loss' && sp.useFasting) {
            html += fastingGuidanceHTML(onShift, dayLabel);
        }

        html += shiftFoodIdeasHTML(isNight && onShift);
        html += shiftScienceHTML();

        html += `
            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p class="text-xs text-amber-800"><b>Not medical advice.</b> This is general guidance. Speak to your GP before significant changes, especially if you have diabetes, heart/kidney conditions, take medication, are pregnant, or have a history of disordered eating.</p>
                <button onclick="reshowShiftDisclaimer()" class="text-[11px] font-bold text-amber-700 underline mt-2">View safety notice again</button>
            </div>`;
        return html;
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


    function nightShiftMealHTML(shiftInfo) {
        const start = hmToMin(shiftInfo.start);
        const end = hmToMin(shiftInfo.end);
        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <h3 class="text-lg font-black mb-1">Meal Timing — Night Shift</h3>
                <p class="text-xs text-slate-400 mb-4">Built from the ${minToHM(start)}–${minToHM(end)} shift saved in your planner. Put most food before and early in the shift, then keep the biological night light.</p>
                ${mealRow(minToHM(start - 120), 'Anchor meal before shift', 'Your largest balanced meal about two hours before starting: lean protein, complex carbs and vegetables for steady energy.', 'main')}
                ${mealRow(minToHM(start + 180), 'Mid-shift protein snack', 'A protein-forward snack around three hours in: Greek yogurt, cottage cheese, eggs or a lean-protein wrap.', 'light')}
                ${mealRow('12am–6am', 'Biological night — keep food minimal', 'If you need to eat, choose a small protein-and-vegetable option. Avoid a full, sugary or heavy meal during the hours your body handles food least effectively.', 'avoid')}
                ${mealRow(minToHM(end), 'After shift — light only', 'Keep any post-shift food small and easy to digest, then leave roughly an hour before sleep where possible.', 'light')}
                ${mealRow('After work', 'Protect daytime sleep', 'Use a dark, cool and quiet room. Consistent sleep supports recovery, appetite control and training progress.', 'sleep')}
            </div>`;
    }

    function earlyShiftMealHTML(shiftInfo) {
        const start = hmToMin(shiftInfo.start);
        const end = hmToMin(shiftInfo.end);
        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <h3 class="text-lg font-black mb-1">Meal Timing — Early Shift</h3>
                <p class="text-xs text-slate-400 mb-4">Built from the ${minToHM(start)}–${minToHM(end)} shift saved in your planner. Keep the pre-work meal practical, then eat your main meal after the early start is behind you.</p>
                ${mealRow(minToHM(start - 45), 'Pre-shift breakfast', 'Have a digestible protein-and-carbohydrate meal before work. If appetite is low, split breakfast and take the second half with you.', 'main')}
                ${mealRow(minToHM(start + 180), 'Mid-shift top-up', 'Use a prepared protein snack plus fruit or wholegrain carbohydrates to avoid relying on pastries or vending food.', 'light')}
                ${mealRow(minToHM(end + 45), 'Main meal after shift', 'Make this the largest balanced meal of the day while it is still daytime: protein, vegetables and a useful carbohydrate portion.', 'main')}
                ${mealRow('By ~8–9pm', 'Finish with a lighter dinner', 'Keep dinner lighter and reasonably early so eating does not push back the sleep you need for the next early start.', 'light')}
            </div>`;
    }

    function dayShiftMealHTML(shiftInfo) {
        const start = hmToMin(shiftInfo.start);
        const end = hmToMin(shiftInfo.end);
        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <h3 class="text-lg font-black mb-1">Meal Timing — Day Shift</h3>
                <p class="text-xs text-slate-400 mb-4">Built from the ${minToHM(start)}–${minToHM(end)} shift saved in your planner. Day shifts suit normal daytime eating, so keep meals regular and avoid pushing most calories late.</p>
                ${mealRow(minToHM(start - 60), 'Breakfast', 'Start with protein and carbohydrates before work so the first half of the shift is not fuelled by snacks alone.', 'main')}
                ${mealRow(minToHM(start + 240), 'Lunch — main work meal', 'Pack a balanced lunch with protein, complex carbohydrates and vegetables. A planned meal makes afternoon energy more predictable.', 'main')}
                ${mealRow(minToHM(end + 60), 'Dinner after shift', 'Eat a balanced but slightly lighter dinner after work. Adjust the portion around your calorie and protein targets.', 'light')}
                ${mealRow('After ~9pm', 'Wind down', 'Avoid a late heavy meal. A small protein snack is reasonable if you are genuinely hungry.', 'avoid')}
            </div>`;
    }

    function lateShiftMealHTML(shiftInfo) {
        const start = hmToMin(shiftInfo.start);
        const end = hmToMin(shiftInfo.end);
        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <h3 class="text-lg font-black mb-1">Meal Timing — Late Shift</h3>
                <p class="text-xs text-slate-400 mb-4">Built from the ${minToHM(start)}–${minToHM(end)} shift saved in your planner. Front-load food before work so finishing late does not turn into the day’s biggest meal.</p>
                ${mealRow(minToHM(start - 240), 'Breakfast after waking', 'Use a normal daytime breakfast with protein, fruit and a fibre-rich carbohydrate.', 'light')}
                ${mealRow(minToHM(start - 90), 'Main meal before shift', 'Make this your largest balanced meal. Starting well fed reduces the urge for high-sugar food late in the shift.', 'main')}
                ${mealRow(minToHM(start + 240), 'Work-break meal or snack', 'Choose a smaller prepared meal with lean protein and vegetables, or a protein snack with fruit.', 'light')}
                ${mealRow(minToHM(end + 30), 'After shift — light only', 'If hungry, keep it small and easy to digest rather than having a large late-night dinner just before bed.', 'avoid')}
            </div>`;
    }

    function offDayMealHTML() {
        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <h3 class="text-lg font-black mb-1">Meal Timing — Rest / Off Day</h3>
                <p class="text-xs text-slate-400 mb-4">The selected date is marked off in your planner. Use it to return to daytime eating and support recovery.</p>
                ${mealRow('On waking', 'Breakfast', 'Eat within roughly an hour of waking to anchor the day. Include protein and a useful carbohydrate source.', 'main')}
                ${mealRow('Midday', 'Lunch — main meal', 'Place the largest balanced meal near the middle of your waking day when practical.', 'main')}
                ${mealRow('~6–7pm', 'Earlier dinner', 'Finish the main evening meal earlier and adjust portions to your calorie and protein targets.', 'light')}
                ${mealRow('Late evening', 'Minimise late eating', 'Keep late food light. This can help re-anchor your routine after night or late shifts.', 'avoid')}
            </div>`;
    }

    function shiftTrainingHTML(onShift, isNight, shiftInfo) {
        const sp = shiftP();
        const fatLoss = sp.goal === 'fat_loss';
        const type = shiftInfo?.type || (onShift ? (isNight ? 'nights' : 'days') : 'off');
        const start = hmToMin(shiftInfo?.start || '08:00');
        const end = hmToMin(shiftInfo?.end || '16:00');
        let inner = '';

        if (type === 'nights') {
            inner = `
                <p class="text-sm text-slate-600 mb-3">This is tied to your ${minToHM(start)}–${minToHM(end)} night shift.</p>
                ${trainTip(`${minToHM(start - 180)}–${minToHM(start - 60)} before work`, 'The best slot for a demanding strength or interval session is usually after waking but before the shift. Leave time to eat and travel.', 'primary')}
                ${trainTip('During a work break', 'Keep movement short and moderate: walking, mobility or a compact strength session if your workplace and energy allow it.', 'ok')}
                ${trainTip(`After ${minToHM(end)} — recovery only`, 'After a night shift, favour a gentle walk or mobility. Hard training can make it harder to wind down and adds fatigue when alertness is already low.', 'avoid')}`;
        } else if (type === 'earlies') {
            inner = `
                <p class="text-sm text-slate-600 mb-3">This is tied to your ${minToHM(start)}–${minToHM(end)} early shift.</p>
                ${trainTip(`${minToHM(end + 60)}–${minToHM(end + 180)} after work`, 'After food and a short decompression period is often the most realistic quality-training window. Keep the session concise if the early start reduced your sleep.', 'primary')}
                ${trainTip('Before work — light only', 'Mobility or an easy walk is fine. Avoid sacrificing sleep for a hard pre-dawn session.', 'ok')}`;
        } else if (type === 'lates') {
            inner = `
                <p class="text-sm text-slate-600 mb-3">This is tied to your ${minToHM(start)}–${minToHM(end)} late shift.</p>
                ${trainTip(`${minToHM(start - 240)}–${minToHM(start - 120)} before work`, 'Train after waking and before the main pre-shift meal. This protects the session from work fatigue and avoids hard exercise close to bedtime.', 'primary')}
                ${trainTip(`After ${minToHM(end)} — wind down`, 'Choose only gentle walking or mobility after work so sleep is not pushed even later.', 'avoid')}`;
        } else if (type === 'days') {
            inner = `
                <p class="text-sm text-slate-600 mb-3">This is tied to your ${minToHM(start)}–${minToHM(end)} day shift.</p>
                ${trainTip(`${minToHM(end + 60)}–${minToHM(end + 180)} after work`, 'For a desk-based shift, this is a practical strength window. If work is physically demanding, use a shorter session or train before work instead.', 'primary')}
                ${trainTip('Use the option you can repeat', 'A consistent slot that preserves sleep and recovery is more useful than chasing a theoretically perfect time.', 'ok')}`;
        } else {
            inner = `
                <p class="text-sm text-slate-600 mb-3">The selected date is marked as a rest day in your planner, so no work-shift fatigue is assumed.</p>
                ${trainTip('Late afternoon / early evening', 'Use the rest day for a key strength session if recovery is good, while still protecting the following sleep period.', 'primary')}
                ${trainTip(fatLoss ? 'Add easy cardio or steps' : 'Prioritise progressive overload', fatLoss ? 'Low-intensity cardio or a longer walk can add activity without heavily taxing recovery.' : 'Use the fresher day to progress a key lift by load, repetitions or technique quality.', 'ok')}`;
        }

        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <h3 class="text-lg font-black mb-1">Training Advice — ${fatLoss ? 'Fat Loss' : 'Muscle Gain'}</h3>
                <p class="text-xs text-slate-400 mb-4">Linked to the selected day and its saved shift times.</p>
                ${inner}
            </div>`;
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


    function fastingGuidanceHTML(onShift, dayLabel) {
        const label = dayLabel || 'Selected day';
        return `
            <div class="glass-card p-6 rounded-[2.5rem] border-2 border-dashed border-indigo-200">
                <div class="flex items-center gap-2 mb-1">
                    <i data-lucide="timer" class="w-5 h-5 text-indigo-600"></i>
                    <h3 class="text-lg font-black">Optional: Intermittent Fasting</h3>
                </div>
                <p class="text-xs text-slate-400 mb-4">You enabled this option for fat loss. The planner now checks the selected date before suggesting it; fasting is optional and overall intake still matters.</p>
                <div class="p-3 bg-rose-50 border border-rose-200 rounded-2xl mb-3">
                    <p class="text-sm font-bold text-rose-700">⚠️ Do not fast through a work shift</p>
                    <p class="text-xs text-rose-600 mt-1">Working while under-fuelled can worsen fatigue and concentration. Keep any optional fasting day on a suitable rest day, and stop if you feel unwell.</p>
                </div>
                ${onShift
                    ? mealRow(label, 'Not a fasting day', 'The Shift Planner marks this as a work shift, so follow the meal plan above and save optional fasting for a rest day.', 'light')
                    : mealRow(label, 'Optional rest-day fasting', 'The planner marks this as off. If fasting is appropriate for you, keep it moderate, hydrate, prioritise protein and vegetables, and remain within your personal plan.', 'main')}
                <p class="text-[11px] text-slate-400 mt-2">Fasting is not safe for everyone. If you have any doubt, do not fast and speak with your GP or dietitian.</p>
            </div>`;
    }

    function shiftFoodIdeasHTML(emphasiseNight) {
        return `
            <div class="glass-card p-6 rounded-[2.5rem]">
                <h3 class="text-lg font-black mb-1">Protein-Forward Food Ideas</h3>
                <p class="text-xs text-slate-400 mb-4">${emphasiseNight
                    ? 'On nights, protein is your best friend — it keeps you full, steadies blood sugar, and avoids the crash-and-crave cycle that sugary snacks cause. Prep these ahead so 3am-you has good options.'
                    : 'Protein at each meal supports muscle and keeps you full. Batch-prep on days off.'}</p>
                <div class="grid grid-cols-2 gap-2">
                    ${foodIdea('🥚 Boiled eggs', 'Prep a dozen; grab 2–3')}
                    ${foodIdea('🍗 Grilled chicken', 'Batch-cook, portion out')}
                    ${foodIdea('🥛 Greek yogurt', 'High protein, low effort')}
                    ${foodIdea('🧀 Cottage cheese', 'Slow-release protein, great pre-sleep')}
                    ${foodIdea('🥜 Nuts & seeds', 'Protein + good fats (watch portions)')}
                    ${foodIdea('🐟 Tinned tuna/salmon', 'On oatcakes or wholegrain')}
                    ${foodIdea('🫘 Beans & lentils', 'Fibre + plant protein')}
                    ${foodIdea('🥤 Protein shake', 'Fast backup when busy')}
                </div>
                <div class="mt-3 p-3 bg-slate-50 rounded-2xl">
                    <p class="text-xs text-slate-500"><b>Avoid on shift:</b> sugary snacks, pastries, energy drinks and fast food. They spike then crash your blood sugar, leaving you hungrier and more tired — the opposite of what you need at 3am.</p>
                </div>
            </div>`;
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
        lucide.createIcons();
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
                                <p class="text-sm"><b>${escapeHtml(ex.name)}</b> — ${(ex.sets || []).map(s => `${s.weight || '—'}kg×${s.reps || '—'}`).join(', ')}</p>
                                ${ex.focus ? `<p class="text-[11px] text-indigo-600 pl-2 mt-0.5">🎯 ${escapeHtml(ex.focus)}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <button onclick="startAssignedWorkout(${realIdx})" class="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold text-sm">Start This Workout</button>
                </div>`;
            }).join('');
        }
        document.getElementById('assigned-workouts-modal').style.display = 'flex';
        lucide.createIcons();
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
        clearInterval(workoutTimer);
        workoutTimer = setInterval(updateWorkoutTimer, 1000);
        try { history.pushState({ workout: true }, ''); } catch (e) {}

        document.getElementById('workout-setup').classList.add('hidden');
        { const _cpc = document.getElementById('coach-plan-card'); if (_cpc) _cpc.classList.add('hidden'); }
        document.getElementById('workout-active').classList.remove('hidden');
        const titleEl = document.getElementById('active-workout-title');
        if (titleEl) titleEl.innerText = '📋 ' + (w.title || 'Coach Workout');
        document.getElementById('exercise-list').innerHTML = '';

        // Build a name→focus map so each exercise card shows the coach's focus note.
        window._assignedFocusByName = {};
        (w.exercises || []).forEach(ex => {
            if (ex.focus) window._assignedFocusByName[ex.name] = ex.focus;
        });

        (w.exercises || []).forEach(ex => {
            addExercise(ex.name || '');
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
            (ex.sets || []).forEach(s => {
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
        const text = (input.value || '').trim();
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

    // ==========================================================================
    // AUTH STATE OBSERVER
    // ==========================================================================

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-screen').style.display = 'block';

            // State loading is asynchronous because progress photos live in IndexedDB.
            // Waiting here prevents the metrics screens from rendering before their
            // photo references and any legacy-photo migration are ready.
            await loadState();
            await loadFirebaseUserData();

            setupMidnightCheck();
            renderNutritionHistory();

            const emailEl = document.getElementById('status-date');
            if (emailEl) emailEl.innerText = new Date().toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });

            const sidebarEmail = document.getElementById('sidebar-user-email');
            if (sidebarEmail) sidebarEmail.textContent = user.email;

            // EVERYONE — members and coaches — uses the full app. Coaches simply
            // get an extra "Coach Section" entry in the burger menu (an overlay)
            // for managing clients and messages. We no longer route coaches into a
            // separate exclusive mode.
            if (currentUserRole === 'coach') {
                document.body.classList.add('is-coach');
            } else {
                document.body.classList.remove('is-coach');
            }

            // Always show the normal app and hide any open coach overlay.
            const coachView = document.getElementById('coach-view');
            if (coachView) coachView.style.display = 'none';
            const main = document.querySelector('main');
            if (main) main.style.display = '';

            // Members push their data so a linked coach can read it (no-op for coaches).
            await pushMemberDataToCloud();
            renderProfile();
            renderDashboard();
            renderDiary();
            renderSettings();
            renderMemberCoachSection();
            renderOwnerAdmin();      // admin space shows only for the owner account
            renderCoachMenuEntry();  // show/hide the burger "Coach Section" entry by role

            setupMidnightSave();
            setupFoodSearch();
            renderWorkoutEnvTabs();

            // Notifications: show the unread badge, then keep it fresh
            refreshNotifBadge();
            if (window._notifPoll) clearInterval(window._notifPoll);
            window._notifPoll = setInterval(refreshNotifBadge, 60000); // check once a minute

            updateRemindersStatus();
            // After the app has settled, show any due sign-in update alerts
            setTimeout(() => { try { maybeShowUpdateAlerts(); } catch (e) {} }, 900);

            lucide.createIcons();
        } else {
            currentUser = null;
            document.getElementById('auth-screen').style.display = 'flex';
            document.getElementById('app-screen').style.display = 'none';
            lucide.createIcons();
        }
    });

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
    }

    // ==========================================================================
    // STATE MANAGEMENT
    // ==========================================================================

    const DEFAULT_STATE = {
        viewDate: new Date().toISOString().split('T')[0],
        metricsDate: new Date().toISOString().split('T')[0],
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
            shiftType: 'nights',      // 'days' | 'nights' | 'rotating' | 'earlies' | 'lates'
            shiftStart: '19:00',      // default clock time the shift starts
            shiftEnd: '07:00',        // default clock time the shift ends
            workDays: [1, 2, 3, 4, 5],// repeating fallback, 0=Sun..6=Sat
            goal: 'fat_loss',         // 'fat_loss' | 'muscle_gain'
            useFasting: false,        // optional 5:2-style fasting (rest days only)
            plannedShifts: {},        // dateKey -> { type, start, end, updatedAt }
            updatedAt: null           // ISO timestamp for account sync
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
    let workoutStartTime = null;      // timestamp of the current running segment
    let workoutAccumulatedSeconds = 0; // banked seconds from previous segments (Option 2: frozen while away)
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
    let html5QrCode = null;
    let metricsChart = null;
    let currentPhotoType = null;
    let manualFoodImageData = null;
    let photoModalLoadToken = 0;
    let comparisonPhotoLoadToken = 0;

    // ==========================================================================
    // PERSISTENCE
    // ==========================================================================

    // Progress photos used to be embedded as base64 strings inside localStorage.
    // Browsers normally cap localStorage at only a few megabytes, so a handful of
    // phone photos could prevent the entire app state from saving. Photos now live
    // in IndexedDB (a much larger binary store); localStorage keeps tiny references.
    const PHOTO_DB_NAME = 'vfit-media';
    const PHOTO_DB_VERSION = 1;
    const PHOTO_STORE_NAME = 'progressPhotos';
    const PHOTO_REF_PREFIX = 'idb-photo:';
    let photoDatabasePromise = null;
    let photoStorageMode = ('indexedDB' in window) ? 'indexeddb' : 'localstorage';
    const progressPhotoUrlCache = new Map();

    function progressPhotoOwnerId() {
        return (currentUser && currentUser.uid) ? currentUser.uid : 'local-user';
    }

    function progressPhotoRecordId(date, angle, ownerId) {
        return `${ownerId || progressPhotoOwnerId()}::${date}::${angle}`;
    }

    function progressPhotoReference(date, angle) {
        return `${PHOTO_REF_PREFIX}${date}:${angle}`;
    }

    function isPhotoReference(value) {
        return typeof value === 'string' && value.indexOf(PHOTO_REF_PREFIX) === 0;
    }

    function isStoredPhotoValue(value) {
        return isValidPhotoData(value) || isPhotoReference(value);
    }

    function openPhotoDatabase() {
        if (photoStorageMode !== 'indexeddb') {
            return Promise.reject(new Error('IndexedDB is not available'));
        }
        if (photoDatabasePromise) return photoDatabasePromise;

        photoDatabasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
            request.onupgradeneeded = () => {
                const dbInstance = request.result;
                if (!dbInstance.objectStoreNames.contains(PHOTO_STORE_NAME)) {
                    const store = dbInstance.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' });
                    store.createIndex('ownerId', 'ownerId', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                }
            };
            request.onsuccess = () => {
                const dbInstance = request.result;
                dbInstance.onversionchange = () => dbInstance.close();
                resolve(dbInstance);
            };
            request.onerror = () => reject(request.error || new Error('Could not open photo storage'));
            request.onblocked = () => reject(new Error('Photo storage upgrade is blocked by another open VFIT tab'));
        }).catch(error => {
            photoDatabasePromise = null;
            throw error;
        });

        return photoDatabasePromise;
    }

    function transactionComplete(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Photo storage transaction failed'));
            transaction.onabort = () => reject(transaction.error || new Error('Photo storage transaction was cancelled'));
        });
    }

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const match = /^data:([^;]+);base64$/i.exec(parts[0] || '');
        if (!match || !parts[1]) throw new Error('Invalid image data');
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: match[1] || 'image/jpeg' });
    }

    async function applyProgressPhotoChanges(date, changes) {
        const dbInstance = await openPhotoDatabase();
        const ownerId = progressPhotoOwnerId();
        const prepared = Object.entries(changes).map(([angle, value]) => ({
            angle,
            value,
            blob: isValidPhotoData(value) ? dataUrlToBlob(value) : null
        }));
        const transaction = dbInstance.transaction(PHOTO_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(PHOTO_STORE_NAME);
        const completion = transactionComplete(transaction);

        prepared.forEach(({ angle, value, blob }) => {
            const id = progressPhotoRecordId(date, angle, ownerId);
            if (value === 'REMOVE') {
                store.delete(id);
                removeCachedProgressPhoto(id);
            } else if (blob) {
                store.put({ id, ownerId, date, angle, blob, updatedAt: new Date().toISOString() });
                removeCachedProgressPhoto(id);
            }
        });

        await completion;
    }

    async function storeLegacyProgressPhotos(records) {
        if (!records.length) return;
        const dbInstance = await openPhotoDatabase();
        const ownerId = progressPhotoOwnerId();
        const prepared = records.map(record => ({ ...record, blob: dataUrlToBlob(record.dataUrl) }));
        const transaction = dbInstance.transaction(PHOTO_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(PHOTO_STORE_NAME);
        const completion = transactionComplete(transaction);
        prepared.forEach(record => {
            const id = progressPhotoRecordId(record.date, record.angle, ownerId);
            store.put({
                id,
                ownerId,
                date: record.date,
                angle: record.angle,
                blob: record.blob,
                updatedAt: new Date().toISOString()
            });
        });
        await completion;
    }

    async function getProgressPhotoRecordKeys() {
        const dbInstance = await openPhotoDatabase();
        const transaction = dbInstance.transaction(PHOTO_STORE_NAME, 'readonly');
        const request = transaction.objectStore(PHOTO_STORE_NAME).getAllKeys();
        const keys = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('Could not read photo index'));
        });
        const prefix = progressPhotoOwnerId() + '::';
        return keys.filter(key => typeof key === 'string' && key.indexOf(prefix) === 0);
    }

    function cacheProgressPhoto(id, url, isObjectUrl) {
        removeCachedProgressPhoto(id);
        progressPhotoUrlCache.set(id, { url, isObjectUrl: !!isObjectUrl });
        while (progressPhotoUrlCache.size > 12) {
            const oldestId = progressPhotoUrlCache.keys().next().value;
            removeCachedProgressPhoto(oldestId);
        }
        return url;
    }

    function removeCachedProgressPhoto(id) {
        const cached = progressPhotoUrlCache.get(id);
        if (cached && cached.isObjectUrl) URL.revokeObjectURL(cached.url);
        progressPhotoUrlCache.delete(id);
    }

    async function resolveProgressPhotoSource(value, date, angle) {
        if (isValidPhotoData(value)) return value;
        if (!isPhotoReference(value) || photoStorageMode !== 'indexeddb') return '';

        const id = progressPhotoRecordId(date, angle);
        const cached = progressPhotoUrlCache.get(id);
        if (cached) {
            progressPhotoUrlCache.delete(id);
            progressPhotoUrlCache.set(id, cached);
            return cached.url;
        }

        const dbInstance = await openPhotoDatabase();
        const transaction = dbInstance.transaction(PHOTO_STORE_NAME, 'readonly');
        const request = transaction.objectStore(PHOTO_STORE_NAME).get(id);
        const record = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('Could not load photo'));
        });
        if (!record) return '';
        if (record.blob instanceof Blob) {
            return cacheProgressPhoto(id, URL.createObjectURL(record.blob), true);
        }
        // Compatibility with any early builds that stored a data URL directly.
        if (isValidPhotoData(record.dataUrl)) {
            return cacheProgressPhoto(id, record.dataUrl, false);
        }
        return '';
    }

    async function requestPersistentPhotoStorage() {
        try {
            if (!navigator.storage || !navigator.storage.persist) return false;
            if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
            return await navigator.storage.persist();
        } catch (error) {
            console.warn('Persistent storage request was not available:', error);
            return false;
        }
    }

    /**
     * Migrates old localStorage data URLs once, restores the lightweight photo
     * index, and can recover IndexedDB photos even if the old state save failed.
     * Image blobs are loaded only when viewed, keeping startup memory low.
     */
    async function initialiseProgressPhotoStorage() {
        if (photoStorageMode !== 'indexeddb') return;
        try {
            await openPhotoDatabase();
            requestPersistentPhotoStorage();

            const legacyRecords = [];
            (state.metricsHistory || []).forEach(entry => {
                if (!entry || !entry.date || !entry.photos) return;
                Object.entries(entry.photos).forEach(([angle, value]) => {
                    if (isValidPhotoData(value)) {
                        legacyRecords.push({ date: entry.date, angle, dataUrl: value });
                    }
                });
            });
            await storeLegacyProgressPhotos(legacyRecords);

            const keys = await getProgressPhotoRecordKeys();
            const ownerPrefix = progressPhotoOwnerId() + '::';
            const recordsByDate = new Map();
            keys.forEach(id => {
                const remainder = id.slice(ownerPrefix.length);
                const splitAt = remainder.lastIndexOf('::');
                if (splitAt < 0) return;
                const date = remainder.slice(0, splitAt);
                const angle = remainder.slice(splitAt + 2);
                if (!date || !angle) return;
                if (!recordsByDate.has(date)) recordsByDate.set(date, new Set());
                recordsByDate.get(date).add(angle);
            });

            // IndexedDB is authoritative for photo presence. Keep metric values as
            // references so hundreds of images never bloat the JavaScript state.
            (state.metricsHistory || []).forEach(entry => {
                if (!entry || !entry.date) return;
                const angles = recordsByDate.get(entry.date);
                if (!angles || angles.size === 0) {
                    delete entry.photos;
                    return;
                }
                entry.photos = {};
                angles.forEach(angle => { entry.photos[angle] = progressPhotoReference(entry.date, angle); });
                recordsByDate.delete(entry.date);
            });

            // Recover photo-only dates whose localStorage metric entry was absent.
            recordsByDate.forEach((angles, date) => {
                const entry = { date, photos: {} };
                angles.forEach(angle => { entry.photos[angle] = progressPhotoReference(date, angle); });
                state.metricsHistory.push(entry);
            });
            state.metricsHistory.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            saveState();
        } catch (error) {
            console.error('IndexedDB photo storage could not start:', error);
            photoStorageMode = 'localstorage';
            // Preserve legacy data URLs as a fallback. Never erase references if a
            // temporary database error occurs; they can recover on the next load.
            showToast('Photo storage could not open — existing app data is still safe', 6000);
        }
    }

    function buildLocalStateSnapshot() {
        if (photoStorageMode !== 'indexeddb') return state;

        const snapshot = Object.assign({}, state);
        // Unconfirmed modal selections should never consume persistent storage.
        snapshot.currentPhotos = { front: null, side: null, back: null };
        snapshot.metricsHistory = (state.metricsHistory || []).map(entry => {
            const copy = Object.assign({}, entry);
            if (entry.photos) {
                const refs = {};
                Object.entries(entry.photos).forEach(([angle, value]) => {
                    if (isStoredPhotoValue(value)) refs[angle] = progressPhotoReference(entry.date, angle);
                });
                if (Object.keys(refs).length > 0) copy.photos = refs;
                else delete copy.photos;
            }
            return copy;
        });
        return snapshot;
    }

    function saveState() {
        try {
            localStorage.setItem('fittrack_state', JSON.stringify(buildLocalStateSnapshot()));
            return true;
        } catch (e) {
            console.error('Save error:', e);
            if (e && (e.name === 'QuotaExceededError' || (e.code && e.code === 22))) {
                showToast('⚠️ App storage is full — remove large custom food images', 6000);
            } else {
                showToast('⚠️ Could not save — ' + (e.message || 'unknown error'), 5000);
            }
            return false;
        }
    }

    /**
     * A real photo is a string starting with "data:image/". Anything else
     * (null, the literal string "null", empty string, undefined) is invalid.
     */
    function isValidPhotoData(v) {
        return typeof v === 'string' && v.indexOf('data:image/') === 0;
    }

    async function loadState() {
        try {
            const saved = localStorage.getItem('fittrack_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                state = Object.assign({}, DEFAULT_STATE, parsed);
                state.goals = Object.assign({}, DEFAULT_STATE.goals, (parsed.goals || {}));
                state.dietGoal = Object.assign({}, DEFAULT_STATE.dietGoal, (parsed.dietGoal || {}));
                state.equipment = {
                    gym: Object.assign({}, DEFAULT_STATE.equipment.gym, (parsed.equipment && parsed.equipment.gym) || {}),
                    home: Object.assign({}, DEFAULT_STATE.equipment.home, (parsed.equipment && parsed.equipment.home) || {})
                };
                state.userProfile = Object.assign({}, DEFAULT_STATE.userProfile, parsed.userProfile || {});
                state.shiftProfile = Object.assign({}, DEFAULT_STATE.shiftProfile, parsed.shiftProfile || {});
                state.updateReminders = {
                    weight: Object.assign({}, DEFAULT_STATE.updateReminders.weight, (parsed.updateReminders && parsed.updateReminders.weight) || {}),
                    measurement: Object.assign({}, DEFAULT_STATE.updateReminders.measurement, (parsed.updateReminders && parsed.updateReminders.measurement) || {}),
                    photo: Object.assign({}, DEFAULT_STATE.updateReminders.photo, (parsed.updateReminders && parsed.updateReminders.photo) || {})
                };
                // Ensure the exercise-database fields exist and have the right shape
                if (!Array.isArray(state.customExercises)) state.customExercises = [];
                if (!Array.isArray(state.barcodeFoods)) state.barcodeFoods = [];
                state.disabledExercises = {
                    gym: Array.isArray(parsed.disabledExercises && parsed.disabledExercises.gym) ? parsed.disabledExercises.gym : [],
                    home: Array.isArray(parsed.disabledExercises && parsed.disabledExercises.home) ? parsed.disabledExercises.home : []
                };
                // Re-register custom exercises in the reverse muscle index so swap,
                // volume tracking and demand-ordering know what they target.
                state.customExercises.forEach(ce => {
                    if (ce && ce.name && ce.muscles && ce.muscles.length > 0) {
                        EXERCISE_TO_MUSCLES[ce.name] = ce.muscles.slice();
                    }
                });
                // Migration: older versions may have saved meals with field `type` instead of `mealType`.
                // Normalize so the diary shows them under the right section.
                if (Array.isArray(state.dailyMeals)) {
                    state.dailyMeals.forEach(m => {
                        if (!m.mealType && m.type) m.mealType = m.type;
                    });
                }
            }
        } catch (e) {
            console.error('Load error:', e);
        }
        if (!Array.isArray(state.metricsHistory)) state.metricsHistory = [];
        await initialiseProgressPhotoStorage();
    }

    function setupMidnightSave() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow - now;

        setTimeout(() => {
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

    function switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const tab = document.getElementById(tabId);
        if (tab) tab.classList.add('active');
        if (tabId === 'logs') { renderLogs(); filterWorkouts(); }
        if (tabId === 'profile') renderProfile();
        if (tabId === 'settings') renderSettings();
        if (tabId === 'dashboard') renderDashboard();
        if (tabId === 'training') renderCoachPlanInTraining();
        if (tabId === 'metrics') {
            // Set date picker to current viewing date and refresh status + history
            const picker = document.getElementById('metrics-date-picker');
            if (picker && !picker.value) picker.value = state.metricsDate || new Date().toISOString().split('T')[0];
            renderMetricsStatusLines();
            renderMetricsHistory();
        }
        lucide.createIcons();
    }

    // ==========================================================================
    // SIDEBAR
    // ==========================================================================

    function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const isOpen = sidebar.classList.contains('translate-x-0');
        if (isOpen) {
            sidebar.classList.remove('translate-x-0');
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        } else {
            sidebar.classList.add('translate-x-0');
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        }
        lucide.createIcons();
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
            return `<button type="button" onclick="toggleNewExMuscle('${m}')"
                class="px-4 py-2 rounded-full text-xs font-bold border-2 ${sel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}">${m}</button>`;
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
                const safe = ex.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
        const map = {};
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

        // Render AI Coach recommendations
        renderAICoach();

        lucide.createIcons();
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

    function renderVolumeTracker() {
        const card = document.getElementById('volume-tracker-card');
        const list = document.getElementById('volume-tracker-list');
        if (!card || !list) return;

        const level = getExperienceLevel();

        // Beginners don't need volume landmarks — keep the card hidden for them.
        if (level === 'Beginner') {
            card.classList.add('hidden');
            return;
        }

        // Experience not set yet → show the card but prompt them to set it, so the
        // feature is discoverable rather than silently missing.
        if (level !== 'Intermediate' && level !== 'Advanced') {
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
        const trained = SPECIFIC_MUSCLES
            .filter(m => counts[m] > 0)
            .sort((a, b) => counts[b] - counts[a]);

        if (trained.length === 0) {
            card.classList.remove('hidden');
            list.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">No sets logged in the last 7 days. Train a muscle to see volume here.</p>`;
            return;
        }

        card.classList.remove('hidden');
        list.innerHTML = trained.map(m => {
            const sets = counts[m];
            // Display whole numbers cleanly, halves as e.g. "13.5"
            const setsLabel = Number.isInteger(sets) ? sets : sets.toFixed(1);
            // Status: under 12 = below target (amber), 12-20 = on target (green), >20 = over (red)
            let barColor, statusIcon, statusText, pct;
            if (sets < 12) {
                barColor = 'bg-amber-400';
                statusIcon = '';
                statusText = `<span class="text-amber-600">${(12 - sets) % 1 === 0 ? (12 - sets) : (12 - sets).toFixed(1)} below min</span>`;
                pct = Math.min(100, (sets / 20) * 100);
            } else if (sets <= 20) {
                barColor = 'bg-emerald-500';
                statusIcon = '✓';
                statusText = `<span class="text-emerald-600">on target</span>`;
                pct = (sets / 20) * 100;
            } else {
                barColor = 'bg-red-400';
                statusIcon = '';
                statusText = `<span class="text-red-500">${(sets - 20) % 1 === 0 ? (sets - 20) : (sets - 20).toFixed(1)} over max</span>`;
                pct = 100;
            }
            return `
                <div class="bg-slate-50 p-3 rounded-xl">
                    <div class="flex justify-between items-center mb-1.5">
                        <span class="font-bold text-sm">${m} ${statusIcon}</span>
                        <span class="text-xs font-black text-slate-700">${setsLabel}<span class="text-slate-400 font-normal">/12-20 sets</span></span>
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
        lucide.createIcons();
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
        lucide.createIcons();
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
        lucide.createIcons();
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
        workoutTimer = setInterval(updateWorkoutTimer, 1000);

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

    function currentWorkoutElapsed() {
        // Total elapsed = banked seconds + the segment currently running.
        const segment = workoutStartTime ? Math.floor((Date.now() - workoutStartTime) / 1000) : 0;
        return workoutAccumulatedSeconds + segment;
    }

    // ==========================================================================
    // ACTIVE WORKOUT PERSISTENCE
    // ==========================================================================
    // Keeps an in-progress workout alive across refreshes, tab closes, and
    // accidental navigation. Only Finish or Cancel/Back clears it.
    // Timer uses Option 2: it freezes while you're away and resumes on return.

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
            elapsedSeconds: currentWorkoutElapsed(),
            workoutDate: window.selectedWorkoutDate || (document.getElementById('workout-date-picker') || {}).value || new Date().toISOString().split('T')[0],
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

        // Restore context + timer state. Option 2: banked elapsed is frozen; the
        // clock resumes counting forward from here.
        currentWorkoutContext = saved.context || null;
        workoutAccumulatedSeconds = saved.elapsedSeconds || 0;
        workoutStartTime = Date.now();

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
            addExercise(ex.name || '');
            // The card just added is the last one; find its id from the sets container
            const cards = document.querySelectorAll('#exercise-list > div');
            const card = cards[cards.length - 1];
            if (!card) return;
            const setsContainer = card.querySelector('[id^="sets-"]');
            const exId = setsContainer ? setsContainer.id.replace('sets-', '') : null;
            (ex.sets || []).forEach(s => {
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
        clearInterval(workoutTimer);
        updateWorkoutTimer();
        workoutTimer = setInterval(updateWorkoutTimer, 1000);

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

        if (typeof lucide !== 'undefined') lucide.createIcons();
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

    function addExercise(name) {
        if (name === undefined) name = '';
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
                <textarea id="coach-focus-${id}" rows="2" placeholder="What should they focus on? (tempo, form cues, intensity…)"
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

        setTimeout(() => addSetToExercise(id, pr, name), 60);
        if (name) refreshExercisePB(id); // show PB for a card that starts with a name
        // If we're in wizard mode and the user manually added an exercise, jump to it.
        if (wizardActive && !name) {
            setTimeout(() => {
                const cards = document.querySelectorAll('#exercise-list > div');
                showWizardStep(cards.length - 1);
            }, 80);
        }
        lucide.createIcons();
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
        return `<div onclick="selectExerciseFromDropdown('${id}', '${ex.replace(/'/g, "\\'")}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition-colors">
            <span class="font-medium text-sm">${ex}</span>
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
        return `<div onclick="toggleShowAllExercises('${id}')" class="p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer text-center border-t border-slate-200">
            <span class="text-xs font-bold text-indigo-600">${toggleText}</span>
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
        const rows = list.map(ex => renderDropdownRow(id, ex)).join('');
        dropdown.innerHTML = rows + renderDropdownFooter(id);
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
            const rows = filtered.map(ex => renderDropdownRow(id, ex)).join('');
            dropdown.innerHTML = rows + renderDropdownFooter(id);
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
        if (suggestion && suggestion.suggested) {
            html += ` <span class="text-slate-300">·</span> <span class="${suggestion.bumped ? 'text-emerald-600' : 'text-indigo-600'}">Try ${suggestion.suggested}kg${isAssist ? ' assist' : ''}</span>`;
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
            hint.className = "absolute -bottom-4 left-0 right-0 text-center text-[8px] font-bold " + (suggestion.bumped ? 'text-emerald-600' : 'text-slate-400');
            if (suggestion.bumped) {
                hint.textContent = isAssist
                    ? `↓ ${suggestion.last}→${suggestion.suggested}kg assist`
                    : `↑ ${suggestion.last}→${suggestion.suggested}kg`;
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

    /**
     * Suggest a working weight for the next time you do this exercise.
     * Rule: if the 3rd set last time had RIR > 5 (more than 5 reps left = too easy),
     * bump the weight. Compounds +5kg, isolation +2.5kg. For assistance exercises,
     * "bump" means REDUCE the assist weight instead.
     * Returns { suggested, last, bumped } or null if no history.
     */
    function getSuggestedWeight(exerciseName) {
        const last = getLastPerformance(exerciseName);
        if (!last) return null;

        // Use the 3rd set if it exists, else the last set
        const refSet = last.sets[2] || last.sets[last.sets.length - 1];
        const lastWeight = parseFloat(refSet.weight);
        if (isNaN(lastWeight)) return null;

        const rir = refSet.rir !== undefined && refSet.rir !== '' ? parseFloat(refSet.rir) : null;
        const increment = isCompoundExercise(exerciseName) ? 5 : 2.5;

        let suggested = lastWeight;
        let bumped = false;
        if (rir !== null && rir > 5) {
            if (isAssistanceExercise(exerciseName)) {
                // Less assistance = harder = progression. Don't go below 0.
                suggested = Math.max(0, lastWeight - increment);
            } else {
                suggested = lastWeight + increment;
            }
            bumped = true;
        }
        return { suggested, last: lastWeight, bumped };
    }

    // Holds the pending workout while the user is rating exercises.
    // After they tap Save (or Skip), finalizeWorkoutSave consumes this.
    let pendingWorkout = null;

    function saveWorkout() {
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
            workoutTimer = setInterval(updateWorkoutTimer, 1000);
            showToast('Add at least one exercise with sets');
            return;
        }

        const workoutDate = window.selectedWorkoutDate || document.getElementById('workout-date-picker').value || new Date().toISOString().split('T')[0];
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
            const safeName = ex.name.replace(/"/g, '&quot;');
            return `
                <div class="bg-slate-50 p-3 rounded-2xl">
                    <p class="font-bold text-sm mb-2">${safeName}</p>
                    <div class="flex justify-between gap-1 mb-2" id="rating-row-${idx}">
                        ${[1, 2, 3, 4, 5].map(n => `
                            <button type="button"
                                onclick="setPendingRating('${safeName}', ${n}, ${idx})"
                                data-stars="${n}"
                                class="flex-1 py-3 rounded-xl border-2 border-slate-200 bg-white text-lg hover:border-amber-400 hover:bg-amber-50">
                                ☆
                            </button>
                        `).join('')}
                    </div>
                    <input type="text" id="rating-comment-${idx}" data-exname="${safeName}" placeholder="Add a comment (optional)"
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
            const stars = it.stars ? '★'.repeat(it.stars) + '☆'.repeat(5 - it.stars) : '(no rating)';
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
        if (typeof lucide !== 'undefined') lucide.createIcons();
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

    function changeWorkoutDate(days) {
        const current = document.getElementById('workout-date-picker').value || new Date().toISOString().split('T')[0];
        const date = new Date(current);
        date.setDate(date.getDate() + days);
        selectWorkoutDate(date.toISOString().split('T')[0]);
    }

    function selectWorkoutDate(dateStr) {
        document.getElementById('workout-date-picker').value = dateStr;
        window.selectedWorkoutDate = dateStr;
        const today = new Date().toISOString().split('T')[0];
        const warning = document.getElementById('workout-date-warning');
        if (warning) warning.classList.toggle('hidden', dateStr === today);
        lucide.createIcons();
    }

    // ==========================================================================
    // NUTRITION TAB
    // ==========================================================================

    function setNutritionTab(tab) {
        const diaryView = document.getElementById('nut-view-diary');
        const searchView = document.getElementById('nut-view-search');
        const shiftView = document.getElementById('nut-view-shift');
        const diaryTab = document.getElementById('nut-tab-diary');
        const searchTab = document.getElementById('nut-tab-search');
        const shiftTab = document.getElementById('nut-tab-shift');
        const on = 'flex-1 py-4 text-xs font-black uppercase rounded-xl bg-white text-indigo-600 shadow-sm';
        const off = 'flex-1 py-4 text-xs font-black uppercase rounded-xl text-slate-400';

        diaryView.classList.add('hidden');
        searchView.classList.add('hidden');
        if (shiftView) shiftView.classList.add('hidden');
        diaryTab.className = off;
        searchTab.className = off;
        if (shiftTab) shiftTab.className = off;

        if (tab === 'diary') {
            diaryView.classList.remove('hidden');
            diaryTab.className = on;
            renderDiary();
        } else if (tab === 'shift') {
            if (shiftView) shiftView.classList.remove('hidden');
            if (shiftTab) shiftTab.className = on;
            renderShiftWorker();
        } else {
            searchView.classList.remove('hidden');
            searchTab.className = on;
            renderCreatedMeals();
            renderRegionToggle();
            renderFilterContent();
        }
        lucide.createIcons();
    }

    function renderDiary() {
        const dateInput = document.getElementById('nutrition-date-picker');
        if (dateInput && !dateInput.value) dateInput.value = state.viewDate;

        const todayMeals = state.dailyMeals.filter(m => m.date === state.viewDate);
        const totalCals = todayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
        const totalProtein = todayMeals.reduce((sum, m) => sum + (m.protein || 0), 0);

        const totalKcalEl = document.getElementById('total-kcal');
        if (totalKcalEl) totalKcalEl.innerText = Math.round(totalCals);
        const totalProteinEl = document.getElementById('total-protein');
        if (totalProteinEl) totalProteinEl.innerText = totalProtein.toFixed(1);

        const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
        const mealIcons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };
        const sections = document.getElementById('meal-sections');
        if (!sections) return;

        sections.innerHTML = mealTypes.map(type => {
            const meals = todayMeals.filter(m => m.mealType === type);
            const totalCal = meals.reduce((s, m) => s + (m.calories || 0), 0);

            return `
                <div class="glass-card rounded-2xl p-5 mb-4">
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="font-black capitalize flex items-center gap-2">
                            <span class="text-xl">${mealIcons[type]}</span>
                            ${type}
                        </h4>
                        <span class="text-xs text-slate-400 font-bold">${Math.round(totalCal)} kcal</span>
                    </div>
                    ${meals.length === 0 ? '<p class="text-xs text-slate-400 italic text-center py-2">No food added</p>' :
                        meals.map(m => `
                            <div class="flex justify-between items-center py-2 border-b last:border-0">
                                <div onclick="editLoggedFood('${m.id}')" class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                                    ${m.image ? `<img src="${m.image}" class="w-10 h-10 object-contain rounded-lg bg-slate-50 p-1" onerror="this.style.display='none'">` : ''}
                                    <div class="flex-1 min-w-0">
                                        <div class="font-bold text-sm truncate flex items-center gap-1">${m.name} <i data-lucide="pencil" class="w-3 h-3 text-slate-300"></i></div>
                                        <div class="text-xs text-slate-400">${Math.round(m.calories || 0)} cal • ${(m.protein || 0).toFixed(1)}g protein${m.amount ? ' • ' + m.amount + (m.amountType === 'grams' ? 'g' : ' serving' + (m.amount > 1 ? 's' : '')) : ''}</div>
                                    </div>
                                </div>
                                <button onclick="removeMeal('${m.id}')" class="w-8 h-8 bg-red-50 text-red-500 rounded-lg text-sm flex-shrink-0 ml-2">×</button>
                            </div>
                        `).join('')
                    }
                </div>`;
        }).join('');

        renderNutritionHistory();
        lucide.createIcons();
    }

    function removeMeal(id) {
        state.dailyMeals = state.dailyMeals.filter(m => String(m.id) !== String(id));
        saveState();
        autoSaveNutrition();
        renderDiary();
        renderDashboard();
        showToast('Meal removed');
    }

    // Reopen a already-logged diary food in the food popup, pre-filled with its
    // base values and the amount you logged — so you can change the portion/grams
    // OR correct the calories/macros, then save it back over the same entry.
    let editingLoggedMealId = null;
    function editLoggedFood(id) {
        const m = state.dailyMeals.find(x => String(x.id) === String(id));
        if (!m) return;

        // Reconstruct the per-100g / per-serving base. Older entries saved before
        // this feature won't have .base, so derive it from the stored totals.
        let base = m.base;
        if (!base) {
            const mult = m.amountType === 'grams' ? (m.amount || 100) / 100 : (m.amount || 1);
            const safe = mult || 1;
            base = {
                calories: (m.calories || 0) / safe,
                protein: (m.protein || 0) / safe,
                carbs: (m.carbs || 0) / safe,
                fat: (m.fat || 0) / safe,
                fiber: (m.fiber || 0) / safe,
                sugar: (m.sugar || 0) / safe,
                isCustom: m.amountType !== 'grams',
                serving: null
            };
        }

        currentFoodItem = {
            name: m.name,
            image: m.image || null,
            calories: base.calories,
            protein: base.protein,
            carbs: base.carbs,
            fat: base.fat,
            fiber: base.fiber || 0,
            sugar: base.sugar || 0,
            satFat: base.satFat || 0,
            sodium: base.sodium || 0,
            cholesterol: base.cholesterol || 0,
            isCustom: !!base.isCustom,
            serving: base.serving || (base.isCustom ? '1 portion' : '100g'),
            servingGrams: base.servingGrams || null,
            barcode: base.barcode || m.barcode || '',
            scannedBarcode: base.scannedBarcode || m.scannedBarcode || '',
            brand: base.brand || m.brand || '',
            source: base.source || m.source || ''
        };

        editingLoggedMealId = id; // popup is now editing this entry
        renderFoodPopup();

        // Restore the amount + type + meal type they originally logged.
        // Order matters: set the type FIRST (it resets the amount), then the amount.
        currentAmountType = m.amountType || 'portion';
        setAmountType(currentAmountType);
        const amtInput = document.getElementById('popup-amount');
        if (amtInput) amtInput.value = m.amount || (currentAmountType === 'grams' ? 100 : 1);
        const mtSel = document.getElementById('popup-meal-type');
        if (mtSel) mtSel.value = m.mealType || m.type || 'lunch';
        updatePopupTotals();

        // Relabel the add button to reflect editing
        const addBtn = document.getElementById('popup-add-btn');
        if (addBtn) addBtn.textContent = 'Save Changes';
    }

    function changeNutritionDate(days) {
        const current = state.viewDate || new Date().toISOString().split('T')[0];
        const date = new Date(current);
        date.setDate(date.getDate() + days);
        selectNutritionDate(date.toISOString().split('T')[0]);
    }

    function selectNutritionDate(dateStr) {
        state.viewDate = dateStr;
        saveState();
        const picker = document.getElementById('nutrition-date-picker');
        if (picker) picker.value = dateStr;
        const today = new Date().toISOString().split('T')[0];
        const warning = document.getElementById('nutrition-date-warning');
        if (warning) warning.classList.toggle('hidden', dateStr === today);
        renderDiary();
        renderDashboard();
    }

    function saveNutritionChanges() {
        autoSaveNutrition();
        showToast('Changes saved!');
    }

    function cancelNutritionChanges() {
        showToast('Cancelled');
    }

    // ==========================================================================
    // STORE DROPDOWN (Search tab)
    // ==========================================================================

    function showStoreDropdown() {
        const dropdown = document.getElementById('store-dropdown');
        if (!dropdown) return;
        const html = UK_STORES_RESTAURANTS.map(store => `
            <div onclick="selectStore('${store.value}', '${store.name.replace(/'/g, "\\'")}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                ${store.name}
            </div>
        `).join('');
        dropdown.innerHTML = html;
        dropdown.classList.remove('hidden');
    }

    function filterStoreDropdown(query) {
        const dropdown = document.getElementById('store-dropdown');
        if (!dropdown) return;
        const filtered = UK_STORES_RESTAURANTS.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));
        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="p-3 text-slate-400 text-sm italic text-center">No stores match</div>';
        } else {
            dropdown.innerHTML = filtered.map(store => `
                <div onclick="selectStore('${store.value}', '${store.name.replace(/'/g, "\\'")}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                    ${store.name}
                </div>
            `).join('');
        }
        dropdown.classList.remove('hidden');
    }

    function selectStore(value, name) {
        document.getElementById('store-search-input').value = name;
        document.getElementById('store-select').value = value;
        document.getElementById('store-dropdown').classList.add('hidden');

        // Update the chip label so the user can see at a glance which store is active
        const label = document.getElementById('food-filter-store-label');
        if (label) label.textContent = value === 'all' ? 'Any store' : name;

        // If there's an active query, re-run the search with the new store filter
        const input = document.getElementById('food-search-input');
        if (input && input.value.trim().length >= 2) {
            searchFood(input.value.trim(), 1);
        }
    }

    function showManualStoreDropdown() {
        const dropdown = document.getElementById('manual-store-dropdown');
        if (!dropdown) return;
        const html = UK_STORES_RESTAURANTS.filter(s => s.value !== 'all').map(store => `
            <div onclick="selectManualStore('${store.name.replace(/'/g, "\\'")}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                ${store.name}
            </div>
        `).join('');
        dropdown.innerHTML = html;
        dropdown.classList.remove('hidden');
    }

    function filterManualStoreDropdown(query) {
        const dropdown = document.getElementById('manual-store-dropdown');
        if (!dropdown) return;
        const filtered = UK_STORES_RESTAURANTS.filter(s => s.value !== 'all' && s.name.toLowerCase().includes(query.toLowerCase()));
        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="p-3 text-slate-400 text-sm italic text-center">No stores match</div>';
        } else {
            dropdown.innerHTML = filtered.map(store => `
                <div onclick="selectManualStore('${store.name.replace(/'/g, "\\'")}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                    ${store.name}
                </div>
            `).join('');
        }
        dropdown.classList.remove('hidden');
    }

    function selectManualStore(name) {
        document.getElementById('manual-food-store-input').value = name;
        document.getElementById('manual-store-dropdown').classList.add('hidden');
    }

    // ==========================================================================
    // FOOD SEARCH (USDA + OpenFoodFacts with relevance ranking + filters)
    // ==========================================================================

    let searchTimer = null;
    let currentFoodFilter = 'recent'; // 'recent' | 'myfoods' | 'high-protein' | 'low-cal' | null

    function setupFoodSearch() {
        const input = document.getElementById('food-search-input');
        if (!input) return;
        // Guard against attaching the listener more than once (we call this from
        // both DOMContentLoaded and the auth handler as a safety net).
        if (input.dataset.searchWired === 'true') return;
        input.dataset.searchWired = 'true';

        input.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            const query = e.target.value.trim();
            const clearBtn = document.getElementById('food-search-clear');
            if (clearBtn) clearBtn.classList.toggle('hidden', query.length === 0);

            if (query.length === 0) {
                // Empty query → show whatever the current filter says (recent, my foods, etc.)
                hideSearchPagination();
                renderFilterContent();
                return;
            }
            if (query.length < 2) {
                document.getElementById('search-results-list').innerHTML = '';
                hideSearchPagination();
                return;
            }
            searchTimer = setTimeout(() => searchFood(query, 1), 350);
        });
    }

    function hideSearchPagination() {
        const p = document.getElementById('search-pagination');
        if (p) p.classList.add('hidden');
    }

    function clearFoodSearch() {
        const input = document.getElementById('food-search-input');
        if (input) input.value = '';
        const clearBtn = document.getElementById('food-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
        hideSearchPagination();
        renderFilterContent();
    }

    /**
     * Set the food search region (UK / US / Worldwide) and persist it.
     * Re-runs the active search so results update immediately.
     */
    // Region is locked to UK — these remain as harmless no-ops in case any
    // older code path still references them. The app searches UK data only.
    function setFoodRegion(region) {
        state.foodRegion = 'uk';
    }

    function renderRegionToggle() {
        // No region toggle in the UI anymore — UK is the only source.
    }

    function setFoodFilter(filter) {
        currentFoodFilter = (currentFoodFilter === filter) ? null : filter;
        renderFilterChips();

        // Clear search box and show the filter's content
        const input = document.getElementById('food-search-input');
        if (input) input.value = '';
        const clearBtn = document.getElementById('food-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
        hideSearchPagination();
        renderFilterContent();
    }

    function renderFilterChips() {
        ['recent', 'myfoods', 'high-protein', 'low-cal'].forEach(f => {
            const btn = document.getElementById('food-filter-' + f);
            if (!btn) return;
            if (currentFoodFilter === f) {
                btn.className = 'food-filter-chip flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold bg-indigo-600 text-white';
            } else {
                btn.className = 'food-filter-chip flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200';
            }
        });
    }

    function toggleStoreFilter() {
        const panel = document.getElementById('store-picker-panel');
        if (panel) panel.classList.toggle('hidden');
    }

    /**
     * Render the appropriate content for the active filter chip.
     * Called when the search box is empty.
     */
    function renderFilterContent() {
        const resultsList = document.getElementById('search-results-list');
        const hint = document.getElementById('food-search-hint');

        if (currentFoodFilter === 'recent') {
            const recents = getRecentFoods(20);
            if (recents.length === 0) {
                resultsList.innerHTML = emptyState('clock', 'No recent foods', 'Foods you log will appear here for quick re-adding.');
            } else {
                renderResultCards(recents.map(r => ({ ...r, _source: 'recent' })));
            }
            if (hint) hint.textContent = 'Recent foods you\'ve logged — tap to add again';
        } else if (currentFoodFilter === 'myfoods') {
            const customs = (state.customFoods || []).slice();
            if (customs.length === 0) {
                resultsList.innerHTML = emptyState('bookmark', 'No saved foods yet', 'Add a food manually and save it to find it here later.');
            } else {
                renderResultCards(customs.map(c => ({ ...c, _source: 'custom', isCustom: true })));
            }
            if (hint) hint.textContent = 'Foods you\'ve added manually';
        } else if (currentFoodFilter === 'high-protein') {
            const recents = getRecentFoods(50).filter(r => (r.protein || 0) >= 15);
            if (recents.length === 0) {
                resultsList.innerHTML = emptyState('beef', 'No high-protein foods yet', 'Log some protein-rich meals first, or search above.');
            } else {
                renderResultCards(recents.map(r => ({ ...r, _source: 'recent' })));
            }
            if (hint) hint.textContent = 'Recent meals with 15g+ protein';
        } else if (currentFoodFilter === 'low-cal') {
            const recents = getRecentFoods(50).filter(r => (r.calories || 0) > 0 && (r.calories || 0) <= 200);
            if (recents.length === 0) {
                resultsList.innerHTML = emptyState('salad', 'No low-cal foods yet', 'Log some lower-calorie items first, or search above.');
            } else {
                renderResultCards(recents.map(r => ({ ...r, _source: 'recent' })));
            }
            if (hint) hint.textContent = 'Recent items ≤ 200 kcal';
        } else {
            resultsList.innerHTML = '';
            if (hint) hint.textContent = 'Type to search any food';
        }
        lucide.createIcons();
    }

    /**
     * Pull unique recently-logged foods from state.dailyMeals + state.nutritionHistory.
     * Deduped by name (case-insensitive), most-recently-used first.
     */
    function getRecentFoods(limit) {
        const all = [];
        // Today's meals
        (state.dailyMeals || []).forEach(m => all.push({ meal: m, when: m.id || Date.now() }));
        // Recent history
        (state.nutritionHistory || []).slice(0, 14).forEach(day => {
            (day.meals || []).forEach(m => all.push({ meal: m, when: day.date }));
        });
        // Sort newest first
        all.sort((a, b) => String(b.when).localeCompare(String(a.when)));

        const seen = new Set();
        const out = [];
        for (const item of all) {
            const m = item.meal;
            if (!m || !m.name) continue;
            const key = m.name.toLowerCase().trim();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                name: m.name,
                calories: m.calories || 0,
                protein: m.protein || 0,
                carbs: m.carbs || 0,
                fat: m.fat || 0,
                fiber: m.fiber || 0,
                image: m.image || '',
                isCustom: true,
                serving: m.serving || '1 serving'
            });
            if (out.length >= limit) break;
        }
        return out;
    }

    function emptyState(icon, title, subtitle) {
        return `<div class="text-center py-12">
            <div class="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                <i data-lucide="${icon}" class="w-8 h-8 text-slate-400"></i>
            </div>
            <p class="font-bold text-slate-600 mb-1">${title}</p>
            <p class="text-xs text-slate-400">${subtitle}</p>
        </div>`;
    }

    /**
     * Score a result for relevance to a query. Higher = better match.
     * Exact match → exact prefix → word starts with → contains anywhere → bonus for having protein data.
     */
    function scoreRelevance(name, query) {
        const n = (name || '').toLowerCase();
        const q = query.toLowerCase();
        if (!n) return -1;
        if (n === q) return 1000;
        if (n.startsWith(q + ' ') || n.startsWith(q + ',')) return 800;
        if (n.startsWith(q)) return 600;
        // Word-boundary match
        if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(n)) return 400;
        if (n.includes(q)) return 200;
        return 0;
    }

    /**
     * Render an array of food objects into the results list.
     * Each item should have: name, calories, protein, carbs, fat, image, _source, plus
     * either the OpenFoodFacts shape (nutriments, product_name) or our normalized shape.
     */
    function renderResultCards(items) {
        const resultsList = document.getElementById('search-results-list');
        if (!resultsList) return;

        resultsList.innerHTML = items.map(item => {
            // Normalize all shapes into a common view model
            let name, brand, image, cals, protein, carbs, fat, perLabel, sourceData;
            const sourceBadge = sourceTag(item._source);

            if (item._source === 'recent' || item._source === 'custom' || item.isCustom) {
                name = item.name;
                brand = item._source === 'recent' ? 'Recently logged' : (item.brand || item.store || 'My Food');
                image = item.image || '';
                cals = item.calories || 0;
                protein = item.protein || 0;
                carbs = item.carbs || 0;
                fat = item.fat || 0;
                perLabel = item.serving ? `per ${item.serving}` : 'per serving';
                sourceData = JSON.stringify(item).replace(/'/g, '&apos;');
                return cardHtml({ name, brand, image, cals, protein, carbs, fat, perLabel, sourceBadge, onClick: `openFoodPopupCustom(${sourceData})` });
            }

            if (item._source === 'usda') {
                name = item.description;
                brand = item.brandOwner || item.brandName || 'USDA database';
                image = '';
                cals = item._n.calories || 0;
                protein = item._n.protein || 0;
                carbs = item._n.carbs || 0;
                fat = item._n.fat || 0;
                perLabel = 'per 100g';
                sourceData = JSON.stringify(item).replace(/'/g, '&apos;');
                return cardHtml({ name, brand, image, cals, protein, carbs, fat, perLabel, sourceBadge, onClick: `openFoodPopupUSDA(${sourceData})` });
            }

            // OpenFoodFacts shape
            name = item.product_name || 'Unknown';
            brand = item.brands || item.stores || 'OpenFoodFacts';
            image = item.image_url || item.image_front_small_url || '';
            const n = item.nutriments || {};
            // Prefer per-serving when available; fall back to per-100g
            const hasServing = n['energy-kcal_serving'] && item.serving_size;
            if (hasServing) {
                cals = n['energy-kcal_serving'] || 0;
                protein = n.proteins_serving || 0;
                carbs = n.carbohydrates_serving || 0;
                fat = n.fat_serving || 0;
                perLabel = `per ${item.serving_size}`;
            } else {
                cals = n['energy-kcal_100g'] || 0;
                protein = n.proteins_100g || 0;
                carbs = n.carbohydrates_100g || 0;
                fat = n.fat_100g || 0;
                perLabel = 'per 100g';
            }
            sourceData = JSON.stringify(item).replace(/'/g, '&apos;');
            return cardHtml({ name, brand, image, cals, protein, carbs, fat, perLabel, sourceBadge, onClick: `openFoodPopup(${sourceData})` });
        }).join('');

        lucide.createIcons();
    }

    function sourceTag(source) {
        if (source === 'recent') return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">RECENT</span>';
        if (source === 'custom') return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">CUSTOM</span>';
        if (source === 'usda') return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">USDA</span>';
        return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">OFF</span>';
    }

    function cardHtml(d) {
        const proteinG = (d.protein || 0).toFixed(1);
        return `<div onclick='${d.onClick}' class="bg-white p-3 rounded-2xl border-2 border-slate-100 cursor-pointer hover:border-emerald-400 hover:shadow-md active:scale-[0.98] transition-all flex items-center gap-3">
            <div class="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                ${d.image ? `<img src="${d.image}" class="w-full h-full object-contain" onerror="this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'package\\' class=\\'w-8 h-8 text-slate-300\\'></i>';">` : '<i data-lucide="utensils" class="w-7 h-7 text-slate-300"></i>'}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-0.5">
                    ${d.sourceBadge}
                </div>
                <h4 class="font-bold text-sm leading-tight line-clamp-2">${escapeHtml(d.name)}</h4>
                <p class="text-[11px] text-slate-400 truncate">${escapeHtml(d.brand)} · ${d.perLabel}</p>
                <div class="flex gap-3 mt-1.5 text-[11px]">
                    <span class="font-black text-indigo-600">${Math.round(d.cals)} kcal</span>
                    <span class="font-bold text-emerald-600">${proteinG}g P</span>
                    <span class="text-slate-500">${(d.carbs || 0).toFixed(0)}g C</span>
                    <span class="text-slate-500">${(d.fat || 0).toFixed(0)}g F</span>
                </div>
            </div>
            <div class="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                <i data-lucide="plus" class="w-5 h-5 text-emerald-600"></i>
            </div>
        </div>`;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * The main search. Calls USDA and OpenFoodFacts in parallel, then merges,
     * dedupes, scores by relevance, and renders.
     */
    // Pagination state for the active search
    let searchState = { query: '', page: 1, pageSize: 20, hasMore: false };

    /**
     * Run a search for a given query + page. Page is 1-indexed.
     */
    /**
     * fetch() with a timeout, so a hanging request can't freeze the search forever.
     * Rejects after `ms` milliseconds if the request hasn't completed.
     */
    async function fetchWithTimeout(url, ms) {
        ms = ms || 8000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try {
            const r = await fetch(url, { signal: controller.signal });
            return r;
        } finally {
            clearTimeout(timer);
        }
    }

    async function searchFood(query, page) {
        page = page || 1;
        const resultsList = document.getElementById('search-results-list');
        const loading = document.getElementById('search-loading');
        const pagination = document.getElementById('search-pagination');
        const store = document.getElementById('store-select').value;

        searchState.query = query;
        searchState.page = page;

        // Clear the active filter chip when user starts typing — they're searching, not filtering
        currentFoodFilter = null;
        renderFilterChips();

        loading.classList.remove('hidden');
        resultsList.innerHTML = '';
        if (pagination) pagination.classList.add('hidden');

        // Track whether the source actually errored (vs just returned nothing)
        let usdaErrored = false; // USDA is disabled — this app uses UK Open Food Facts data only
        let offErrored = false;

        // Search Open Food Facts (UK) only. USDA is US-government data and has been
        // intentionally disabled so all nutrition info comes from UK sources.
        const offResults = await searchOpenFoodFacts(query, store, page)
            .catch(err => { console.warn('OFF failed:', err); offErrored = true; return { products: [], more: false }; });
        const usdaResults = { foods: [], more: false };

        // Custom + recent matches only make sense on page 1 (they're local, not paged)
        let localMatches = [];
        if (page === 1) {
            const customMatches = (state.customFoods || []).filter(f =>
                f.name && f.name.toLowerCase().includes(query.toLowerCase())
            ).map(c => ({ ...c, _source: 'custom', isCustom: true, _score: scoreRelevance(c.name, query) + 100 }));

            const recentMatches = getRecentFoods(100).filter(r =>
                r.name && r.name.toLowerCase().includes(query.toLowerCase())
            ).map(r => ({ ...r, _source: 'recent', _score: scoreRelevance(r.name, query) + 50 }));

            localMatches = [...customMatches, ...recentMatches];
        }

        const usda = (usdaResults.foods || []).map(u => ({ ...u, _source: 'usda', _score: scoreRelevance(u.description, query) }));
        const off = (offResults.products || []).map(o => {
            let s = scoreRelevance(o.product_name, query);
            // Fallback: the OFF engine matches on brand/category too, so a product
            // named "Sausage Roll" by brand "Greggs" scores 0 against the query
            // "greggs sausage roll". If every query word appears somewhere in
            // name+brand, keep it with a modest score instead of filtering it out.
            if (s <= 0) {
                const hay = ((o.product_name || '') + ' ' + (o.brands || '')).toLowerCase();
                const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
                if (tokens.length > 0 && tokens.every(t => hay.includes(t))) s = 150;
            }
            return { ...o, _source: 'off', _score: s };
        });

        // Penalize OpenFoodFacts entries with no nutrition data (often junk)
        off.forEach(o => {
            const n = o.nutriments || {};
            if (!n['energy-kcal_100g'] && !n['energy-kcal_serving']) o._score -= 300;
            if (!n.proteins_100g && !n.proteins_serving) o._score -= 100;
        });

        // Dedupe by lowercased name, keeping the highest-scoring version
        const byName = new Map();
        [...localMatches, ...usda, ...off].forEach(item => {
            const name = (item.name || item.product_name || item.description || '').toLowerCase().trim();
            if (!name) return;
            const existing = byName.get(name);
            if (!existing || (item._score || 0) > (existing._score || 0)) {
                byName.set(name, item);
            }
        });

        const merged = Array.from(byName.values())
            .filter(x => (x._score || 0) > 0)
            .sort((a, b) => (b._score || 0) - (a._score || 0));

        // There are more pages if either external source reported more results
        searchState.hasMore = !!(usdaResults.more || offResults.more);

        loading.classList.add('hidden');

        if (merged.length > 0) {
            renderResultCards(merged);
            renderPagination();
            return;
        }

        // No results to show. Decide WHY so the message is accurate.
        if (page > 1) {
            searchState.page = page - 1;
            resultsList.innerHTML = emptyState('search-x', 'No more results', 'You\'ve reached the end. Tap Previous to go back.');
            renderPagination();
        } else if (offErrored) {
            // Both online sources genuinely failed — this is the real "connection" case.
            // But the user can still add manually, so make that the call to action.
            resultsList.innerHTML = `
                <div class="text-center py-10">
                    <div class="w-16 h-16 mx-auto mb-4 bg-amber-50 rounded-2xl flex items-center justify-center">
                        <i data-lucide="wifi-off" class="w-8 h-8 text-amber-500"></i>
                    </div>
                    <p class="font-bold text-slate-600 mb-1">Couldn't reach Open Food Facts</p>
                    <p class="text-xs text-slate-400 mb-4">The search servers may be busy. Try again in a moment,<br>switch region, or add the food manually.</p>
                    <div class="flex gap-2 justify-center">
                        <button onclick="retryFoodSearch()" class="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700">Try Again</button>
                        <button onclick="openManualFoodEntry()" class="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-800">Add Manually</button>
                    </div>
                </div>`;
        } else {
            // Sources responded fine, there just aren't any matches for this term.
            resultsList.innerHTML = emptyState('search-x', 'No results found',
                'Try a different search term or region, or add this food manually below.');
        }
        lucide.createIcons();
    }

    function retryFoodSearch() {
        if (searchState.query) searchFood(searchState.query, searchState.page || 1);
    }

    /**
     * Show/update the Previous/Next controls based on the current page.
     */
    function renderPagination() {
        const pagination = document.getElementById('search-pagination');
        const prevBtn = document.getElementById('search-prev-btn');
        const nextBtn = document.getElementById('search-next-btn');
        const label = document.getElementById('search-page-label');
        if (!pagination) return;

        pagination.classList.remove('hidden');
        if (label) label.textContent = 'Page ' + searchState.page;
        if (prevBtn) prevBtn.disabled = searchState.page <= 1;
        if (nextBtn) nextBtn.disabled = !searchState.hasMore;
        lucide.createIcons();
    }

    function searchNextPage() {
        if (!searchState.hasMore) return;
        searchFood(searchState.query, searchState.page + 1);
        // Scroll results back to top of the search view
        const el = document.getElementById('search-results-list');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function searchPrevPage() {
        if (searchState.page <= 1) return;
        searchFood(searchState.query, searchState.page - 1);
        const el = document.getElementById('search-results-list');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * USDA FoodData Central — clean entries for whole foods like "chicken breast".
     * Returns { foods: [...], more: bool } for pagination.
     */
    async function searchUSDA(query, page) {
        page = page || 1;
        const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=10&pageNumber=${page}&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)`;
        const r = await fetchWithTimeout(url, 8000);
        if (!r.ok) return { foods: [], more: false };
        const data = await r.json();
        const foods = (data.foods || []).map(f => {
            const find = (id) => {
                const n = (f.foodNutrients || []).find(x => x.nutrientId === id);
                return n ? (n.value || 0) : 0;
            };
            return {
                ...f,
                _n: {
                    calories: find(1008), protein: find(1003), fat: find(1004),
                    carbs: find(1005), fiber: find(1079), sugar: find(2000),
                    sodium: find(1093), satFat: find(1258), cholesterol: find(1253)
                }
            };
        });
        // USDA tells us the total hits; more pages exist if we haven't reached totalHits
        const totalHits = data.totalHits || 0;
        const more = (page * 10) < totalHits;
        return { foods, more };
    }

    /**
     * OpenFoodFacts free-text search — region-aware.
     * PRIMARY: the legacy cgi/search.pl endpoint. It is the OFF endpoint that
     * actually supports free-text `search_terms` queries. (The newer /api/v2/search
     * only filters by exact tags and silently IGNORES text queries — using it
     * made every search return unrelated "popular" products, which the relevance
     * filter then discarded, so nothing ever showed.)
     * FALLBACK: Search-a-licious (search.openfoodfacts.org), OFF's modern
     * full-text search service, also constrained to UK products.
     * Returns { products: [...], more: bool }. Throws only if BOTH endpoints
     * hard-fail, so the caller can distinguish "no matches" from "no connection".
     *
     * UK-focused: results are filtered to United Kingdom products where possible.
     * If the UK-filtered query returns nothing, it retries unfiltered so you still
     * get results rather than an empty screen.
     */
    async function searchOpenFoodFacts(query, store, page) {
        page = page || 1;
        const pageSize = 20;

        // --- PRIMARY: Search-a-licious (OFF's modern search API) ---
        // This is fast and CORS-friendly, unlike the old cgi/search.pl endpoint
        // which frequently fails from browsers. Try UK-filtered first, then a
        // plain query if that finds nothing.
        try {
            const ukQuery = query + ' countries_tags:"en:united-kingdom"';
            let res = await searchSAL(ukQuery, page, pageSize);
            if (res.products.length === 0 && page === 1) {
                // UK filter too strict for this term — retry without it
                res = await searchSAL(query, page, pageSize);
            }
            if (res.products.length > 0 || page > 1) return res;
        } catch (e) {
            console.warn('Search-a-licious failed, trying legacy:', e);
        }

        // --- FALLBACK: legacy cgi/search.pl on the UK subdomain ---
        try {
            let url = `https://uk.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${pageSize}&page=${page}`;
            if (store && store !== 'all') {
                url += `&tagtype_0=stores&tag_contains_0=contains&tag_0=${encodeURIComponent(store)}`;
            }
            const r = await fetchWithTimeout(url, 9000);
            if (!r.ok) throw new Error('OFF legacy HTTP ' + r.status);
            const data = await r.json();
            const products = (data.products || []).filter(p => p.product_name);
            return { products, more: (page * pageSize) < (data.count || 0) };
        } catch (e) {
            console.warn('OFF legacy search also failed:', e);
            // Both endpoints failed — signal a genuine connection problem to the caller
            throw e;
        }
    }

    /**
     * Search-a-licious helper. Requests only the fields we use.
     * Response shape: { hits: [...], count, page, page_count }.
     */
    async function searchSAL(q, page, pageSize) {
        const fields = 'product_name,brands,stores,image_url,image_front_small_url,nutriments,serving_size,code';
        const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&fields=${fields}&page_size=${pageSize}&page=${page}`;
        const r = await fetchWithTimeout(url, 9000);
        if (!r.ok) throw new Error('Search-a-licious HTTP ' + r.status);
        const data = await r.json();
        const products = (data.hits || []).filter(p => p.product_name);
        return { products, more: (page * pageSize) < (data.count || 0) };
    }

    /**
     * Open the popup for a USDA item — converts USDA shape to the standard popup model.
     */
    function openFoodPopupUSDA(food) {
        currentFoodItem = {
            id: Date.now(),
            name: food.description,
            image: '',
            calories: food._n.calories || 0,
            protein: food._n.protein || 0,
            carbs: food._n.carbs || 0,
            fat: food._n.fat || 0,
            fiber: food._n.fiber || 0,
            sugar: food._n.sugar || 0,
            satFat: food._n.satFat || 0,
            sodium: food._n.sodium || 0,
            cholesterol: food._n.cholesterol || 0,
            serving: '100g',
            isCustom: false
        };
        editingLoggedMealId = null;
        renderFoodPopup();
    }

    /**
     * Convert Open Food Facts values into a predictable per-100g model.
     * OFF records are community supplied, so fields can be absent, strings, or
     * available only per serving. Keeping this normalization in one place prevents
     * a valid barcode lookup from failing just because one nutriment is missing.
     */
    function toFiniteNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
    }

    function parseServingGrams(product) {
        const direct = toFiniteNumber(product && product.serving_quantity);
        const directUnit = String((product && product.serving_quantity_unit) || 'g').toLowerCase();
        if (direct !== null && direct > 0) {
            if (directUnit === 'kg') return direct * 1000;
            if (directUnit === 'oz') return direct * 28.3495;
            if (directUnit === 'cl') return direct * 10;
            if (directUnit === 'l') return direct * 1000;
            return direct; // g or ml
        }

        const servingText = String((product && product.serving_size) || '');
        const match = servingText.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l|oz)\b/i);
        if (!match) return 100;
        const amount = Number(match[1].replace(',', '.'));
        const unit = match[2].toLowerCase();
        if (unit === 'kg') return amount * 1000;
        if (unit === 'oz') return amount * 28.3495;
        if (unit === 'cl') return amount * 10;
        if (unit === 'l') return amount * 1000;
        return amount; // g or ml
    }

    function readOpenFoodFactsNutrient(nutriments, nutrient, servingGrams) {
        const per100 = toFiniteNumber(nutriments[nutrient + '_100g']);
        if (per100 !== null) return Math.max(0, per100);

        const perServing = toFiniteNumber(nutriments[nutrient + '_serving']);
        if (perServing !== null && servingGrams > 0) {
            return Math.max(0, perServing * 100 / servingGrams);
        }
        return 0;
    }

    function normaliseOpenFoodFactsProduct(product, requestedBarcode) {
        product = product && typeof product === 'object' ? product : {};
        const nutriments = product.nutriments && typeof product.nutriments === 'object'
            ? product.nutriments
            : {};
        const servingGrams = parseServingGrams(product);
        let calories = readOpenFoodFactsNutrient(nutriments, 'energy-kcal', servingGrams);

        // Some OFF entries contain energy only in kilojoules.
        if (!calories) {
            let kilojoules = readOpenFoodFactsNutrient(nutriments, 'energy-kj', servingGrams);
            if (!kilojoules && String(nutriments.energy_unit || '').toLowerCase() === 'kj') {
                kilojoules = readOpenFoodFactsNutrient(nutriments, 'energy', servingGrams);
            }
            if (kilojoules) calories = kilojoules / 4.184;
        }

        const sodium = readOpenFoodFactsNutrient(nutriments, 'sodium', servingGrams);
        const salt = readOpenFoodFactsNutrient(nutriments, 'salt', servingGrams);
        const cholesterolValue = readOpenFoodFactsNutrient(nutriments, 'cholesterol', servingGrams);
        const cholesterolUnit = String(nutriments.cholesterol_unit || 'g').toLowerCase();
        const scannedBarcode = normaliseBarcode(requestedBarcode);
        const apiBarcode = normaliseBarcode(product.code) || scannedBarcode;

        return {
            name: product.product_name || product.product_name_en || product.generic_name || product.brands || 'Scanned item',
            brand: product.brands || '',
            image: product.image_front_url || product.image_url || product.image_front_small_url || '',
            calories,
            protein: readOpenFoodFactsNutrient(nutriments, 'proteins', servingGrams),
            carbs: readOpenFoodFactsNutrient(nutriments, 'carbohydrates', servingGrams),
            fat: readOpenFoodFactsNutrient(nutriments, 'fat', servingGrams),
            fiber: readOpenFoodFactsNutrient(nutriments, 'fiber', servingGrams),
            sugar: readOpenFoodFactsNutrient(nutriments, 'sugars', servingGrams),
            satFat: readOpenFoodFactsNutrient(nutriments, 'saturated-fat', servingGrams),
            sodium: sodium || (salt ? salt / 2.5 : 0),
            cholesterol: cholesterolUnit === 'mg' ? cholesterolValue : cholesterolValue * 1000,
            serving: product.serving_size || (servingGrams !== 100 ? Math.round(servingGrams * 10) / 10 + 'g' : '100g'),
            servingGrams,
            barcode: apiBarcode,
            scannedBarcode: scannedBarcode || apiBarcode,
            source: 'openfoodfacts',
            isCustom: false
        };
    }

    function openFoodPopupModel(food) {
        currentFoodItem = Object.assign({
            name: 'Scanned item',
            image: '',
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
            sugar: 0,
            satFat: 0,
            sodium: 0,
            cholesterol: 0,
            serving: '100g',
            servingGrams: 100,
            barcode: '',
            scannedBarcode: '',
            source: 'openfoodfacts',
            isCustom: false
        }, food || {}, { id: Date.now() });
        editingLoggedMealId = null;
        renderFoodPopup();
    }

    function openFoodPopup(product, requestedBarcode) {
        openFoodPopupModel(normaliseOpenFoodFactsProduct(product, requestedBarcode));
    }

    function openFoodPopupCustom(food) {
        currentFoodItem = {
            id: Date.now(),
            name: food.name,
            image: food.image || '',
            calories: food.calories || 0,
            protein: food.protein || 0,
            carbs: food.carbs || 0,
            fat: food.fat || 0,
            fiber: food.fiber || 0,
            sugar: food.sugar || 0,
            satFat: 0,
            sodium: 0,
            cholesterol: 0,
            serving: food.serving || '1 portion',
            store: food.store || '',
            isCustom: true
        };
        editingLoggedMealId = null;
        renderFoodPopup();
    }

    function renderFoodPopup() {
        if (!currentFoodItem) return;
        // Default the action button to "Add to Diary"; editLoggedFood overrides
        // this to "Save Changes" after calling renderFoodPopup for an edit.
        const addBtnLabel = document.getElementById('popup-add-btn');
        if (addBtnLabel && editingLoggedMealId == null) addBtnLabel.textContent = 'Add to Diary';
        document.getElementById('popup-name').textContent = currentFoodItem.name;
        const barcodeEl = document.getElementById('popup-barcode');
        const visibleBarcode = currentFoodItem.scannedBarcode || currentFoodItem.barcode || '';
        if (barcodeEl) {
            barcodeEl.textContent = visibleBarcode ? 'Barcode ' + visibleBarcode : '';
            barcodeEl.classList.toggle('hidden', !visibleBarcode);
        }
        const img = document.getElementById('popup-image');
        if (img) {
            img.src = currentFoodItem.image || 'https://via.placeholder.com/200?text=No+Image';
            img.onerror = function() { this.src = 'https://via.placeholder.com/200?text=No+Image'; };
        }
        document.getElementById('popup-nutrition-cals').textContent = Math.round(currentFoodItem.calories);
        document.getElementById('popup-nutrition-protein').textContent = (currentFoodItem.protein).toFixed(1);
        document.getElementById('popup-nutrition-carbs').textContent = (currentFoodItem.carbs).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-fat').textContent = (currentFoodItem.fat).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-fiber').textContent = (currentFoodItem.fiber).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-sugar').textContent = (currentFoodItem.sugar).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-satfat').textContent = (currentFoodItem.satFat).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-sodium').textContent = (currentFoodItem.sodium).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-cholesterol').textContent = currentFoodItem.cholesterol + 'mg';
        const nutritionBasis = currentFoodItem.isCustom
            ? 'Per ' + currentFoodItem.serving
            : 'Per 100g' + (currentFoodItem.serving && currentFoodItem.serving !== '100g' ? ' • 1 portion = ' + currentFoodItem.serving : '');
        document.getElementById('popup-nutrition').textContent = nutritionBasis;

        document.getElementById('popup-amount').value = 1;
        currentAmountType = currentFoodItem.isCustom ? 'portion' : 'portion';
        setAmountType(currentAmountType);
        updatePopupTotals();

        // Always start with the edit form collapsed
        const editForm = document.getElementById('edit-food-values');
        if (editForm) editForm.classList.add('hidden');

        document.getElementById('food-popup').style.display = 'flex';
        lucide.createIcons();
    }

    // ---- Edit scanned/looked-up nutrition values ----
    // Values are stored per 100g for scanned/DB foods, or per serving for custom.
    function openEditFoodValues() {
        if (!currentFoodItem) return;
        const f = currentFoodItem;
        document.getElementById('edit-cals').value = Math.round(f.calories * 10) / 10;
        document.getElementById('edit-protein').value = Math.round(f.protein * 10) / 10;
        document.getElementById('edit-carbs').value = Math.round(f.carbs * 10) / 10;
        document.getElementById('edit-fat').value = Math.round(f.fat * 10) / 10;
        document.getElementById('edit-fiber').value = Math.round((f.fiber || 0) * 10) / 10;
        document.getElementById('edit-sugar').value = Math.round((f.sugar || 0) * 10) / 10;
        const basis = document.getElementById('edit-values-basis');
        if (basis) basis.textContent = f.isCustom ? `(per ${f.serving})` : '(per 100g)';
        document.getElementById('edit-food-values').classList.remove('hidden');
        lucide.createIcons();
    }

    function cancelEditFoodValues() {
        document.getElementById('edit-food-values').classList.add('hidden');
    }

    function applyEditFoodValues() {
        if (!currentFoodItem) return;
        const num = (id) => {
            const v = parseFloat(document.getElementById(id).value);
            return isNaN(v) || v < 0 ? 0 : v;
        };
        currentFoodItem.calories = num('edit-cals');
        currentFoodItem.protein = num('edit-protein');
        currentFoodItem.carbs = num('edit-carbs');
        currentFoodItem.fat = num('edit-fat');
        currentFoodItem.fiber = num('edit-fiber');
        currentFoodItem.sugar = num('edit-sugar');
        currentFoodItem.edited = true; // mark as user-corrected

        // Re-render the display numbers, keep the current amount, recalc totals
        const amt = document.getElementById('popup-amount').value;
        document.getElementById('popup-nutrition-cals').textContent = Math.round(currentFoodItem.calories);
        document.getElementById('popup-nutrition-protein').textContent = (currentFoodItem.protein).toFixed(1);
        document.getElementById('popup-nutrition-carbs').textContent = (currentFoodItem.carbs).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-fat').textContent = (currentFoodItem.fat).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-fiber').textContent = (currentFoodItem.fiber).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-sugar').textContent = (currentFoodItem.sugar).toFixed(1) + 'g';
        if (document.getElementById('popup-amount')) document.getElementById('popup-amount').value = amt;
        updatePopupTotals();

        document.getElementById('edit-food-values').classList.add('hidden');
        showToast('Values updated ✓');
    }

    function setAmountType(type) {
        currentAmountType = type;
        const portionBtn = document.getElementById('amount-type-portion');
        const gramsBtn = document.getElementById('amount-type-grams');
        if (type === 'portion') {
            portionBtn.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase bg-white shadow text-emerald-600';
            gramsBtn.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400';
            document.getElementById('popup-amount').value = 1;
        } else {
            gramsBtn.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase bg-white shadow text-emerald-600';
            portionBtn.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400';
            document.getElementById('popup-amount').value = 100;
        }
        updatePopupTotals();
    }

    function foodAmountMultiplier(food, amount, amountType) {
        if (amountType === 'grams') return amount / 100;
        if (food && food.isCustom) return amount;
        const servingGrams = toFiniteNumber(food && food.servingGrams);
        return amount * ((servingGrams !== null && servingGrams > 0 ? servingGrams : 100) / 100);
    }

    function updatePopupTotals() {
        if (!currentFoodItem) return;
        const amount = parseFloat(document.getElementById('popup-amount').value) || 1;
        const mult = foodAmountMultiplier(currentFoodItem, amount, currentAmountType);
        document.getElementById('popup-total-kcal').textContent = Math.round((currentFoodItem.calories || 0) * mult);
        document.getElementById('popup-total-protein').textContent = ((currentFoodItem.protein || 0) * mult).toFixed(1) + 'g';
    }

    function toggleDetailedNutrition() {
        const detailed = document.getElementById('detailed-nutrition');
        const toggleText = document.getElementById('toggle-text');
        if (detailed.classList.contains('hidden')) {
            detailed.classList.remove('hidden');
            toggleText.textContent = 'Show Less ▲';
        } else {
            detailed.classList.add('hidden');
            toggleText.textContent = 'Show More ▼';
        }
    }

    function addFoodItem() {
        if (!currentFoodItem) return;
        const amount = parseFloat(document.getElementById('popup-amount').value) || 1;
        const mealType = document.getElementById('popup-meal-type').value;
        const mult = foodAmountMultiplier(currentFoodItem, amount, currentAmountType);

        const base = {
            calories: currentFoodItem.calories || 0,
            protein: currentFoodItem.protein || 0,
            carbs: currentFoodItem.carbs || 0,
            fat: currentFoodItem.fat || 0,
            fiber: currentFoodItem.fiber || 0,
            sugar: currentFoodItem.sugar || 0,
            satFat: currentFoodItem.satFat || 0,
            sodium: currentFoodItem.sodium || 0,
            cholesterol: currentFoodItem.cholesterol || 0,
            isCustom: !!currentFoodItem.isCustom,
            serving: currentFoodItem.serving || null,
            servingGrams: currentFoodItem.servingGrams || null,
            barcode: currentFoodItem.barcode || '',
            scannedBarcode: currentFoodItem.scannedBarcode || '',
            brand: currentFoodItem.brand || '',
            source: currentFoodItem.source || ''
        };

        const computed = {
            date: state.viewDate,
            type: mealType,
            mealType: mealType,
            name: currentFoodItem.name,
            image: currentFoodItem.image,
            calories: base.calories * mult,
            protein: base.protein * mult,
            carbs: base.carbs * mult,
            fat: base.fat * mult,
            fiber: base.fiber * mult,
            sugar: base.sugar * mult,
            barcode: base.barcode,
            scannedBarcode: base.scannedBarcode,
            brand: base.brand,
            source: base.source,
            amount,
            amountType: currentAmountType,
            base
        };

        const wasEditing = editingLoggedMealId != null;
        if (wasEditing) {
            // Editing an existing entry → update it in place
            const idx = state.dailyMeals.findIndex(x => String(x.id) === String(editingLoggedMealId));
            if (idx >= 0) {
                state.dailyMeals[idx] = Object.assign({}, state.dailyMeals[idx], computed);
            }
            editingLoggedMealId = null;
        } else {
            computed.id = Date.now() + Math.random();
            state.dailyMeals.push(computed);
        }

        saveState();
        autoSaveNutrition();
        closeFoodPopup();
        renderDiary();
        renderDashboard();
        showToast(wasEditing ? 'Updated' : 'Added to ' + mealType);
    }

    function closeFoodPopup() {
        document.getElementById('food-popup').style.display = 'none';
        currentFoodItem = null;
        editingLoggedMealId = null;
        const addBtn = document.getElementById('popup-add-btn');
        if (addBtn) addBtn.textContent = 'Add to Diary';
    }

    // Bind amount input listener
    document.addEventListener('DOMContentLoaded', () => {
        const amt = document.getElementById('popup-amount');
        if (amt) amt.addEventListener('input', updatePopupTotals);
    });

    // ==========================================================================
    // MANUAL FOOD ENTRY
    // ==========================================================================

    function openManualFoodEntry() {
        document.getElementById('manual-food-modal').style.display = 'flex';
        ['manual-food-name','manual-food-calories','manual-food-protein','manual-food-carbs','manual-food-fat','manual-food-fiber','manual-food-sugar','manual-food-serving','manual-food-store-input'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        manualFoodImageData = null;
        const preview = document.getElementById('manual-food-preview');
        if (preview) preview.innerHTML = '<i data-lucide="image" class="w-10 h-10 text-slate-300"></i>';
        lucide.createIcons();
    }

    function closeManualFoodEntry() {
        document.getElementById('manual-food-modal').style.display = 'none';
    }

    function previewManualFoodImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            manualFoodImageData = e.target.result;
            const preview = document.getElementById('manual-food-preview');
            if (preview) preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
        };
        reader.readAsDataURL(file);
    }

    function clearManualFoodImage() {
        manualFoodImageData = null;
        const preview = document.getElementById('manual-food-preview');
        if (preview) preview.innerHTML = '<i data-lucide="image" class="w-10 h-10 text-slate-300"></i>';
        document.getElementById('manual-food-image').value = '';
        lucide.createIcons();
    }

    function toggleManualFoodMacros() {
        const macros = document.getElementById('manual-food-macros');
        const toggle = document.getElementById('manual-macros-toggle');
        if (macros.classList.contains('hidden')) {
            macros.classList.remove('hidden');
            toggle.textContent = '− Hide Details';
        } else {
            macros.classList.add('hidden');
            toggle.textContent = '+ Add More Details (Optional)';
        }
    }

    function saveManualFood() {
        const name = document.getElementById('manual-food-name').value.trim();
        const cals = parseFloat(document.getElementById('manual-food-calories').value) || 0;
        const protein = parseFloat(document.getElementById('manual-food-protein').value) || 0;

        if (!name) { showToast('Please enter a food name'); return; }

        const food = {
            id: 'cf-' + Date.now(),
            name,
            store: document.getElementById('manual-food-store-input').value.trim(),
            image: manualFoodImageData,
            calories: cals,
            protein,
            carbs: parseFloat(document.getElementById('manual-food-carbs').value) || 0,
            fat: parseFloat(document.getElementById('manual-food-fat').value) || 0,
            fiber: parseFloat(document.getElementById('manual-food-fiber').value) || 0,
            sugar: parseFloat(document.getElementById('manual-food-sugar').value) || 0,
            serving: document.getElementById('manual-food-serving').value.trim() || '1 portion',
            createdAt: Date.now()
        };

        if (!state.customFoods) state.customFoods = [];
        state.customFoods.unshift(food);
        saveState();
        closeManualFoodEntry();
        showToast('Saved to My Foods! 🍽️');
    }

    // ==========================================================================
    // BARCODE SCANNER
    // ==========================================================================

    let barcodeScanMode = 'food'; // 'food' → food popup; 'meal' → add as meal ingredient
    let barcodeScanLocked = false;
    let barcodeLookupInProgress = false;
    let barcodeScannerEngine = null; // 'native', 'html5' or 'quagga'
    let barcodeScannerSession = 0;
    let barcodeScannerFallbackTimer = null;
    let barcodeTriedEngines = new Set();
    let barcodeTorchOn = false;
    let quaggaDetectedHandler = null;
    let barcodeCandidateCode = '';
    let barcodeCandidateHits = 0;
    let barcodeCandidateAt = 0;
    let activeBarcodeOnScan = null;
    let nativeBarcodeStream = null;
    let nativeBarcodeVideo = null;
    let nativeBarcodeDetector = null;
    let nativeBarcodeLoopTimer = null;
    let nativeBarcodeFrameBusy = false;
    let barcodeImageDecodeInProgress = false;

    const OPEN_FOOD_FACTS_PRODUCT_FIELDS = [
        'code',
        'product_name',
        'product_name_en',
        'generic_name',
        'brands',
        'serving_size',
        'serving_quantity',
        'serving_quantity_unit',
        'image_front_url',
        'image_front_small_url',
        'image_url',
        'nutriments'
    ].join(',');

    function normaliseBarcode(value) {
        // A barcode is always kept as text. This preserves every digit and leading
        // zero, while removing spaces/hyphens from printed or manually entered codes.
        const withoutAimPrefix = String(value ?? '').trim().replace(/^\][A-Za-z0-9]{2}/, '');
        return withoutAimPrefix.replace(/[^0-9]/g, '');
    }

    function isPlausibleFoodBarcode(code) {
        // Common consumer codes: UPC-E (7), EAN-8, UPC-A (12), EAN-13 and GTIN-14.
        return /^\d{7,14}$/.test(code);
    }

    /**
     * Match the key normalization used by Open Food Facts without changing the
     * exact scanned value sent to the API or shown to the user.
     */
    function openFoodFactsBarcodeKey(value) {
        const code = normaliseBarcode(value);
        if (!code) return '';
        // GTIN-8, UPC-A, EAN-13 and GTIN-14 share a canonical 14-digit form.
        // Keeping it as a padded string preserves leading zeroes and lets cache
        // entries match whichever equivalent form a scanner or API returns.
        return code.length <= 14 ? code.padStart(14, '0') : code;
    }

    function barcodeFoodIdentityKeys(...values) {
        const keys = new Set();
        values.forEach(value => {
            const code = normaliseBarcode(value);
            if (!code) return;
            const variants = typeof barcodeLookupCandidates === 'function'
                ? barcodeLookupCandidates(code)
                : [code];
            variants.forEach(variant => {
                const key = openFoodFactsBarcodeKey(variant);
                if (key) keys.add(key);
            });
        });
        return keys;
    }

    function setBarcodeScanStatus(message, tone) {
        const status = document.getElementById('barcode-scan-status');
        if (!status) return;
        status.textContent = message;
        status.classList.remove('text-indigo-600', 'text-emerald-600', 'text-rose-600', 'text-amber-600');
        status.classList.add(
            tone === 'success' ? 'text-emerald-600' :
            tone === 'error' ? 'text-rose-600' :
            tone === 'warning' ? 'text-amber-600' :
            'text-indigo-600'
        );
    }

    function setBarcodeDetectedCode(code) {
        const clean = normaliseBarcode(code);
        const wrap = document.getElementById('barcode-detected-wrap');
        const value = document.getElementById('barcode-detected-number');
        if (value) value.textContent = clean;
        if (wrap) wrap.classList.toggle('hidden', !clean);
    }

    function setBarcodeLookupBusy(busy) {
        const button = document.getElementById('barcode-search-button');
        const input = document.getElementById('manual-barcode');
        if (button) {
            button.disabled = busy;
            button.textContent = busy ? 'Finding…' : 'Search';
            button.classList.toggle('opacity-60', busy);
        }
        if (input) input.readOnly = busy;
    }

    function getFoodBarcodeFormats() {
        if (typeof Html5QrcodeSupportedFormats === 'undefined') return null;
        return [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODE_128
        ].filter(format => format !== undefined && format !== null);
    }

    function createFoodBarcodeScanner() {
        const fullConfig = {
            verbose: false,
            // The native BarcodeDetector runs as its own first engine below.
            // Force this second engine to use html5-qrcode's bundled ZXing decoder,
            // so a fallback genuinely changes decoding technology.
            useBarCodeDetectorIfSupported: false
        };
        const formats = getFoodBarcodeFormats();
        if (formats && formats.length) fullConfig.formatsToSupport = formats;
        return new Html5Qrcode('barcode-reader', fullConfig);
    }

    function hasValidGtinCheckDigit(code) {
        // Eight digits can be EAN-8 or UPC-E, whose check digit is derived differently.
        // Both scanner engines already validate those formats internally.
        if (!/^\d+$/.test(code) || ![12, 13, 14].includes(code.length)) return true;
        const digits = code.split('').map(Number);
        const supplied = digits.pop();
        let total = 0;
        let multiplyByThree = true;
        for (let i = digits.length - 1; i >= 0; i--) {
            total += digits[i] * (multiplyByThree ? 3 : 1);
            multiplyByThree = !multiplyByThree;
        }
        return ((10 - (total % 10)) % 10) === supplied;
    }

    function clearBarcodeScannerFallback() {
        if (barcodeScannerFallbackTimer) {
            clearTimeout(barcodeScannerFallbackTimer);
            barcodeScannerFallbackTimer = null;
        }
    }

    function resetBarcodeCandidate() {
        barcodeCandidateCode = '';
        barcodeCandidateHits = 0;
        barcodeCandidateAt = 0;
    }

    function setBarcodeTorchAvailable(available) {
        const button = document.getElementById('barcode-torch-button');
        if (!button) return;
        button.disabled = !available;
        button.classList.toggle('opacity-50', !available);
        if (!available) {
            barcodeTorchOn = false;
            button.textContent = '🔦 Light';
        }
    }


    function updateBarcodeScannerButton() {
        const button = document.getElementById('barcode-switch-button');
        if (!button) return;
        button.textContent = 'Other decoder';
        const engineNames = {
            native: 'Android native scanner',
            html5: 'ZXing scanner',
            quagga: 'Quagga scanner'
        };
        button.title = barcodeScannerEngine
            ? `Currently using ${engineNames[barcodeScannerEngine] || barcodeScannerEngine}`
            : 'Try another barcode decoder';
    }

    function getActiveBarcodeTrack() {
        try {
            if (barcodeScannerEngine === 'native' && nativeBarcodeStream) {
                return nativeBarcodeStream.getVideoTracks()[0] || null;
            }
            if (
                barcodeScannerEngine === 'quagga' &&
                typeof Quagga !== 'undefined' &&
                Quagga.CameraAccess &&
                Quagga.CameraAccess.getActiveTrack
            ) {
                return Quagga.CameraAccess.getActiveTrack();
            }
        } catch (error) {}
        return null;
    }

    async function optimiseBarcodeCamera() {
        try {
            const track = getActiveBarcodeTrack();
            const capabilities = track && track.getCapabilities
                ? track.getCapabilities()
                : (
                    html5QrCode &&
                    html5QrCode.isScanning &&
                    html5QrCode.getRunningTrackCapabilities
                        ? html5QrCode.getRunningTrackCapabilities()
                        : {}
                );
            const advanced = {};

            if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
                advanced.focusMode = 'continuous';
            }
            if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
                advanced.exposureMode = 'continuous';
            }

            if (Object.keys(advanced).length) {
                if (track && track.applyConstraints) {
                    await track.applyConstraints({ advanced: [advanced] });
                } else if (html5QrCode && html5QrCode.applyVideoConstraints) {
                    await html5QrCode.applyVideoConstraints({ advanced: [advanced] });
                }
            }

            setBarcodeTorchAvailable(Boolean(capabilities && capabilities.torch));
        } catch (error) {
            setBarcodeTorchAvailable(false);
            console.debug('Barcode camera controls unavailable:', error);
        }
    }

    async function toggleBarcodeTorch() {
        const nextState = !barcodeTorchOn;
        try {
            const track = getActiveBarcodeTrack();
            if (track && track.applyConstraints) {
                await track.applyConstraints({ advanced: [{ torch: nextState }] });
            } else if (html5QrCode && html5QrCode.isScanning && html5QrCode.applyVideoConstraints) {
                await html5QrCode.applyVideoConstraints({ advanced: [{ torch: nextState }] });
            } else {
                throw new Error('torch-unavailable');
            }

            barcodeTorchOn = nextState;
            const button = document.getElementById('barcode-torch-button');
            if (button) button.textContent = nextState ? '🔦 Light on' : '🔦 Light';
        } catch (error) {
            setBarcodeTorchAvailable(false);
            showToast('Camera light is not available on this device');
        }
    }

    async function startNativeBarcodeScanner(onScan, session) {
        if (
            typeof BarcodeDetector === 'undefined' ||
            typeof BarcodeDetector.getSupportedFormats !== 'function' ||
            !navigator.mediaDevices ||
            typeof navigator.mediaDevices.getUserMedia !== 'function'
        ) {
            throw new Error('native-scanner-unavailable');
        }

        const supported = await BarcodeDetector.getSupportedFormats();
        const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'];
        const formats = wanted.filter(format => supported.includes(format));
        if (!formats.length) throw new Error('native-food-formats-unavailable');

        const target = document.getElementById('barcode-reader');
        if (!target) throw new Error('scanner-target-missing');
        target.innerHTML = '';
        resetBarcodeCandidate();

        let stream = null;
        let video = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30, max: 30 }
                }
            });
            if (session !== barcodeScannerSession) throw new Error('scanner-session-ended');

            video = document.createElement('video');
            video.autoplay = true;
            video.muted = true;
            video.playsInline = true;
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('aria-label', 'Live rear camera barcode scanner');
            video.srcObject = stream;
            target.appendChild(video);

            if (video.readyState < 1) {
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, 1800);
                    video.onloadedmetadata = () => {
                        clearTimeout(timer);
                        resolve();
                    };
                    video.onerror = event => {
                        clearTimeout(timer);
                        reject(event);
                    };
                });
            }
            await video.play();
            if (session !== barcodeScannerSession) throw new Error('scanner-session-ended');

            nativeBarcodeStream = stream;
            nativeBarcodeVideo = video;
            nativeBarcodeDetector = new BarcodeDetector({ formats });
            nativeBarcodeFrameBusy = false;
            barcodeScannerEngine = 'native';
            updateBarcodeScannerButton();
            await optimiseBarcodeCamera();

            const scanFrame = async () => {
                if (
                    session !== barcodeScannerSession ||
                    barcodeScannerEngine !== 'native' ||
                    !nativeBarcodeDetector ||
                    !nativeBarcodeVideo ||
                    barcodeScanLocked ||
                    barcodeLookupInProgress
                ) return;

                if (!nativeBarcodeFrameBusy && nativeBarcodeVideo.readyState >= 2) {
                    nativeBarcodeFrameBusy = true;
                    try {
                        const matches = await nativeBarcodeDetector.detect(nativeBarcodeVideo);
                        for (const match of matches || []) {
                            if (match && match.rawValue) {
                                handleDecodedBarcode(match.rawValue, onScan, false);
                                if (barcodeScanLocked) break;
                            }
                        }
                    } catch (error) {
                        // A frame can fail while the camera is focusing. Keep scanning.
                    } finally {
                        nativeBarcodeFrameBusy = false;
                    }
                }

                if (
                    session === barcodeScannerSession &&
                    barcodeScannerEngine === 'native' &&
                    !barcodeScanLocked &&
                    !barcodeLookupInProgress
                ) {
                    nativeBarcodeLoopTimer = setTimeout(scanFrame, 100);
                }
            };
            nativeBarcodeLoopTimer = setTimeout(scanFrame, 80);
        } catch (error) {
            if (stream) stream.getTracks().forEach(track => track.stop());
            if (video) {
                try { video.pause(); } catch (pauseError) {}
                video.srcObject = null;
                video.remove();
            }
            throw error;
        }
    }


    async function stopActiveBarcodeScanner() {
        clearBarcodeScannerFallback();
        const hadActiveScanner = Boolean(
            barcodeScannerEngine ||
            nativeBarcodeStream ||
            html5QrCode ||
            quaggaDetectedHandler
        );

        if (nativeBarcodeLoopTimer) {
            clearTimeout(nativeBarcodeLoopTimer);
            nativeBarcodeLoopTimer = null;
        }
        nativeBarcodeFrameBusy = false;
        nativeBarcodeDetector = null;
        if (nativeBarcodeVideo) {
            try { nativeBarcodeVideo.pause(); } catch (error) {}
            nativeBarcodeVideo.srcObject = null;
            try { nativeBarcodeVideo.remove(); } catch (error) {}
            nativeBarcodeVideo = null;
        }
        if (nativeBarcodeStream) {
            try {
                nativeBarcodeStream.getTracks().forEach(track => track.stop());
            } catch (error) {}
            nativeBarcodeStream = null;
        }

        if (
            (barcodeScannerEngine === 'quagga' || quaggaDetectedHandler) &&
            typeof Quagga !== 'undefined'
        ) {
            try {
                if (quaggaDetectedHandler && Quagga.offDetected) {
                    Quagga.offDetected(quaggaDetectedHandler);
                }
            } catch (error) {}
            try { Quagga.stop(); } catch (error) {}
        }

        if (html5QrCode) {
            try {
                if (html5QrCode.isScanning) await html5QrCode.stop();
            } catch (error) {}
            try { html5QrCode.clear(); } catch (error) {}
        }

        html5QrCode = null;
        quaggaDetectedHandler = null;
        barcodeScannerEngine = null;
        barcodeTorchOn = false;
        setBarcodeTorchAvailable(false);
        updateBarcodeScannerButton();

        const reader = document.getElementById('barcode-reader');
        if (reader) reader.innerHTML = '';

        // Some Android cameras need a moment to release before another decoder
        // opens the same rear lens.
        if (hadActiveScanner) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }


    function handleDecodedBarcode(rawValue, onScan, requireConfirmation) {
        if (barcodeScanLocked || barcodeLookupInProgress) return;
        const code = normaliseBarcode(rawValue);
        if (!isPlausibleFoodBarcode(code)) return;

        if (!hasValidGtinCheckDigit(code)) {
            setBarcodeScanStatus('Barcode found but not yet clear — hold steady', 'warning');
            resetBarcodeCandidate();
            return;
        }

        if (requireConfirmation) {
            const now = Date.now();
            if (code === barcodeCandidateCode && now - barcodeCandidateAt < 2500) {
                barcodeCandidateHits += 1;
            } else {
                barcodeCandidateCode = code;
                barcodeCandidateHits = 1;
            }
            barcodeCandidateAt = now;
            if (barcodeCandidateHits < 2) {
                setBarcodeScanStatus('Reading ' + code + ' — hold steady…');
                return;
            }
        }

        setBarcodeDetectedCode(code);
        clearBarcodeScannerFallback();
        onScan(code);
    }

    async function startQuaggaBarcodeScanner(onScan, session) {
        if (typeof Quagga === 'undefined') throw new Error('quagga-scanner-unavailable');
        const target = document.getElementById('barcode-reader');
        if (!target) throw new Error('scanner-target-missing');
        target.innerHTML = '';
        resetBarcodeCandidate();

        await new Promise((resolve, reject) => {
            Quagga.init({
                inputStream: {
                    name: 'VFit food barcode',
                    type: 'LiveStream',
                    target,
                    constraints: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        aspectRatio: { ideal: 1.777778 }
                    }
                },
                locate: true,
                frequency: 12,
                // A zero-worker fallback avoids Android WebView/Blob-worker failures.
                numOfWorkers: 0,
                locator: {
                    // Preserve full bar detail instead of halving already-small frames.
                    halfSample: false,
                    patchSize: 'large'
                },
                decoder: {
                    readers: [
                        'ean_reader',
                        'ean_8_reader',
                        'upc_reader',
                        'upc_e_reader',
                        'i2of5_reader',
                        'code_128_reader'
                    ],
                    multiple: false
                }
            }, error => {
                if (error) {
                    reject(error);
                    return;
                }
                if (session !== barcodeScannerSession) {
                    try { Quagga.stop(); } catch (stopError) {}
                    reject(new Error('scanner-session-ended'));
                    return;
                }

                quaggaDetectedHandler = result => {
                    const value = result && result.codeResult && result.codeResult.code;
                    // Quagga already scores and validates its own decoded result.
                    if (value) handleDecodedBarcode(value, onScan, false);
                };
                Quagga.onDetected(quaggaDetectedHandler);

                try {
                    Quagga.start();
                    barcodeScannerEngine = 'quagga';
                    updateBarcodeScannerButton();
                    Promise.resolve(optimiseBarcodeCamera()).finally(resolve);
                } catch (startError) {
                    reject(startError);
                }
            });
        });
    }

    async function startHtml5BarcodeScanner(onScan, session) {
        if (typeof Html5Qrcode === 'undefined') throw new Error('zxing-scanner-unavailable');
        const target = document.getElementById('barcode-reader');
        if (!target) throw new Error('scanner-target-missing');
        target.innerHTML = '';

        const config = {
            fps: 10,
            // A wide, shallow region gives the ZXing decoder many more pixels per
            // EAN/UPC bar than scanning the whole tall portrait frame.
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                const width = Math.max(50, Math.floor(viewfinderWidth * 0.92));
                const height = Math.max(
                    50,
                    Math.floor(Math.min(viewfinderHeight * 0.42, width * 0.38))
                );
                return {
                    width: Math.min(width, Math.max(50, viewfinderWidth - 8)),
                    height: Math.min(height, Math.max(50, viewfinderHeight - 8))
                };
            },
            // The rear camera is not mirrored; disabling the mirrored retry halves
            // unnecessary work and improves scan cadence on lower-power phones.
            disableFlip: true
        };
        const success = decodedText => handleDecodedBarcode(decodedText, onScan, false);
        const failure = () => {};

        const releaseHtml5Instance = async () => {
            try {
                if (html5QrCode && html5QrCode.isScanning) await html5QrCode.stop();
            } catch (error) {}
            try {
                if (html5QrCode) html5QrCode.clear();
            } catch (error) {}
            html5QrCode = null;
            target.innerHTML = '';
        };

        const startWith = async camera => {
            const highResolutionConfig = Object.assign({}, config, {
                videoConstraints: typeof camera === 'string'
                    ? {
                        deviceId: { exact: camera },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                    : {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
            });
            html5QrCode = createFoodBarcodeScanner();
            await html5QrCode.start(camera, highResolutionConfig, success, failure);
            if (session !== barcodeScannerSession) {
                await releaseHtml5Instance();
                throw new Error('scanner-session-ended');
            }
            barcodeScannerEngine = 'html5';
            updateBarcodeScannerButton();
            await optimiseBarcodeCamera();
        };

        let firstError = null;
        try {
            const cameras = await Html5Qrcode.getCameras();
            if (cameras && cameras.length) {
                const labelledRear = cameras.filter(camera =>
                    /back|rear|environment/i.test(camera.label || '')
                );
                const preferredRear = labelledRear.find(camera =>
                    !/ultra|wide|tele|macro/i.test(camera.label || '')
                ) || labelledRear[0] || cameras[cameras.length - 1];
                try {
                    await startWith(preferredRear.id);
                    return;
                } catch (error) {
                    firstError = error;
                    await releaseHtml5Instance();
                }
            }
        } catch (error) {
            firstError = error;
        }

        try {
            await startWith({ facingMode: { ideal: 'environment' } });
        } catch (error) {
            await releaseHtml5Instance();
            throw error || firstError || new Error('back-camera-unavailable');
        }
    }


    function getBarcodeEngineOrder() {
        const engines = [];
        if (
            typeof BarcodeDetector !== 'undefined' &&
            navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === 'function'
        ) engines.push('native');
        if (typeof Html5Qrcode !== 'undefined') engines.push('html5');
        if (typeof Quagga !== 'undefined') engines.push('quagga');
        return engines;
    }

    function barcodeEngineReadyMessage(engine) {
        if (engine === 'native') {
            return 'Android scanner ready — fill the orange box with the barcode';
        }
        if (engine === 'html5') {
            return 'Wide barcode scanner ready — hold every bar inside the box';
        }
        return 'Detail scanner ready — hold still while the camera focuses';
    }

    async function startBarcodeEngine(engine, onScan, session) {
        if (engine === 'native') return startNativeBarcodeScanner(onScan, session);
        if (engine === 'html5') return startHtml5BarcodeScanner(onScan, session);
        if (engine === 'quagga') return startQuaggaBarcodeScanner(onScan, session);
        throw new Error('unknown-barcode-engine');
    }


    async function startBestBarcodeScanner(onScan, session, preferredOrder) {
        const available = getBarcodeEngineOrder();
        const order = (preferredOrder || available).filter((engine, index, list) =>
            available.includes(engine) && list.indexOf(engine) === index
        );
        let lastError = null;

        for (const engine of order) {
            barcodeTriedEngines.add(engine);
            try {
                await startBarcodeEngine(engine, onScan, session);
                if (session !== barcodeScannerSession) return null;
                setBarcodeScanStatus(barcodeEngineReadyMessage(engine));
                scheduleBarcodeScannerFallback(onScan, session);
                return engine;
            } catch (error) {
                lastError = error;
                console.warn(`${engine} barcode scanner unavailable:`, error);
                await stopActiveBarcodeScanner();
                if (session !== barcodeScannerSession) return null;
            }
        }
        throw lastError || new Error('no-barcode-scanner-loaded');
    }

    function scheduleBarcodeScannerFallback(onScan, session) {
        clearBarcodeScannerFallback();
        const engineWhenScheduled = barcodeScannerEngine;
        const untried = getBarcodeEngineOrder().filter(engine => !barcodeTriedEngines.has(engine));
        if (!engineWhenScheduled || untried.length === 0) return;

        const delay = engineWhenScheduled === 'native' ? 5000 : 8000;
        barcodeScannerFallbackTimer = setTimeout(async () => {
            if (
                session !== barcodeScannerSession ||
                barcodeScanLocked ||
                barcodeLookupInProgress ||
                barcodeImageDecodeInProgress ||
                barcodeScannerEngine !== engineWhenScheduled
            ) return;

            setBarcodeScanStatus('Still looking — changing decoder automatically…', 'warning');
            await switchBarcodeScannerEngine(true);
        }, delay);
    }

    async function switchBarcodeScannerEngine(triggeredAutomatically) {
        if (barcodeScanLocked || barcodeLookupInProgress || barcodeImageDecodeInProgress) return;
        if (!activeBarcodeOnScan) {
            await openBarcodeScanner();
            return;
        }

        const session = barcodeScannerSession;
        const onScan = activeBarcodeOnScan;
        const currentEngine = barcodeScannerEngine;
        const allEngines = getBarcodeEngineOrder();
        let nextEngines = allEngines.filter(engine =>
            engine !== currentEngine && !barcodeTriedEngines.has(engine)
        );

        // A manual tap can cycle through the decoders again after all have run.
        if (!triggeredAutomatically && nextEngines.length === 0) {
            barcodeTriedEngines = new Set(currentEngine ? [currentEngine] : []);
            nextEngines = allEngines.filter(engine => engine !== currentEngine);
        }
        if (nextEngines.length === 0) {
            setBarcodeScanStatus('Use Photo or enter the printed number below', 'warning');
            return;
        }

        setBarcodeScanStatus(triggeredAutomatically ? 'Changing decoder…' : 'Switching scanner…');
        try {
            await stopActiveBarcodeScanner();
            if (session !== barcodeScannerSession) return;
            activeBarcodeOnScan = onScan;
            const started = await startBestBarcodeScanner(onScan, session, nextEngines);
            if (!started) return;
            setBarcodeScanStatus(barcodeEngineReadyMessage(started));
        } catch (error) {
            console.warn('Could not switch barcode scanner:', error);
            setBarcodeScanStatus('Live scan could not read it — use Photo or enter the number below', 'error');
        }
    }

    function decodeBarcodeImageWithQuagga(file) {
        if (typeof Quagga === 'undefined') return Promise.reject(new Error('quagga-unavailable'));
        const objectUrl = URL.createObjectURL(file);
        return new Promise((resolve, reject) => {
            Quagga.decodeSingle({
                src: objectUrl,
                numOfWorkers: 0,
                locate: true,
                inputStream: { size: 1600 },
                locator: { halfSample: false, patchSize: 'large' },
                decoder: {
                    readers: [
                        'ean_reader',
                        'ean_8_reader',
                        'upc_reader',
                        'upc_e_reader',
                        'i2of5_reader',
                        'code_128_reader'
                    ]
                }
            }, result => {
                URL.revokeObjectURL(objectUrl);
                const code = result && result.codeResult && result.codeResult.code;
                if (code) resolve(code);
                else reject(new Error('barcode-not-found-in-image'));
            });
        });
    }

    async function scanBarcodeImage(input) {
        const file = input && input.files && input.files[0];
        if (!file || barcodeLookupInProgress || barcodeImageDecodeInProgress) return;
        const session = barcodeScannerSession;
        const onScan = activeBarcodeOnScan;
        input.value = '';
        if (!onScan) {
            setBarcodeScanStatus('Open the scanner again, then choose Photo', 'warning');
            return;
        }

        barcodeImageDecodeInProgress = true;
        setBarcodeScanStatus('Reading barcode from photo…');
        let decoded = '';
        let lastError = null;

        try {
            await stopActiveBarcodeScanner();
            if (session !== barcodeScannerSession) return;
            activeBarcodeOnScan = onScan;

            if (typeof Html5Qrcode !== 'undefined') {
                try {
                    html5QrCode = createFoodBarcodeScanner();
                    decoded = await html5QrCode.scanFile(file, true);
                } catch (error) {
                    lastError = error;
                } finally {
                    try {
                        if (html5QrCode) html5QrCode.clear();
                    } catch (error) {}
                    html5QrCode = null;
                }
            }

            if (!decoded && typeof Quagga !== 'undefined') {
                try {
                    decoded = await decodeBarcodeImageWithQuagga(file);
                } catch (error) {
                    lastError = error;
                }
            }

            if (session !== barcodeScannerSession) return;
            const clean = normaliseBarcode(decoded);
            if (!isPlausibleFoodBarcode(clean) || !hasValidGtinCheckDigit(clean)) {
                throw lastError || new Error('barcode-not-found-in-image');
            }

            setBarcodeDetectedCode(clean);
            setBarcodeScanStatus('Barcode read: ' + clean + ' — finding product…', 'success');
            handleDecodedBarcode(clean, onScan, false);
        } catch (error) {
            console.warn('Barcode photo could not be decoded:', error);
            setBarcodeScanStatus('No barcode found in that photo — retake it closer or enter the number', 'error');
            barcodeImageDecodeInProgress = false;
            if (session === barcodeScannerSession && !barcodeScanLocked) {
                try {
                    await startBestBarcodeScanner(onScan, session);
                } catch (restartError) {
                    console.warn('Could not restart live barcode scanner:', restartError);
                }
            }
            return;
        } finally {
            barcodeImageDecodeInProgress = false;
        }
    }


    function mergeBarcodeFoodsFromCloud(cloudFoods) {
        if (!Array.isArray(cloudFoods) || cloudFoods.length === 0) return;
        const parsedTime = value => value ? (Date.parse(value) || 0) : 0;
        const combined = [...(Array.isArray(state.barcodeFoods) ? state.barcodeFoods : []), ...cloudFoods]
            .filter(item => item && (item.barcode || item.scannedBarcode))
            .sort((a, b) => parsedTime(b.cachedAt) - parsedTime(a.cachedAt));
        const seen = new Set();
        state.barcodeFoods = combined.filter(item => {
            const keys = barcodeFoodIdentityKeys(item.barcode, item.scannedBarcode);
            if (!keys.size || [...keys].some(key => seen.has(key))) return false;
            keys.forEach(key => seen.add(key));
            return true;
        }).slice(0, 100);
        saveState();
    }

    function findCachedBarcodeFood(code) {
        const wanted = barcodeFoodIdentityKeys(code);
        return (Array.isArray(state.barcodeFoods) ? state.barcodeFoods : []).find(item => {
            const itemKeys = barcodeFoodIdentityKeys(item.barcode, item.scannedBarcode);
            return [...itemKeys].some(key => wanted.has(key));
        }) || null;
    }

    async function cacheBarcodeFood(food) {
        if (!food || !(food.barcode || food.scannedBarcode)) return;
        const clean = {
            name: food.name || 'Scanned item',
            brand: food.brand || '',
            image: food.image || '',
            calories: food.calories || 0,
            protein: food.protein || 0,
            carbs: food.carbs || 0,
            fat: food.fat || 0,
            fiber: food.fiber || 0,
            sugar: food.sugar || 0,
            satFat: food.satFat || 0,
            sodium: food.sodium || 0,
            cholesterol: food.cholesterol || 0,
            serving: food.serving || '100g',
            servingGrams: food.servingGrams || 100,
            barcode: food.barcode || food.scannedBarcode,
            scannedBarcode: food.scannedBarcode || food.barcode,
            source: 'openfoodfacts',
            isCustom: false,
            cachedAt: new Date().toISOString()
        };

        const cleanKeys = barcodeFoodIdentityKeys(clean.barcode, clean.scannedBarcode);
        const existing = Array.isArray(state.barcodeFoods) ? state.barcodeFoods : [];
        state.barcodeFoods = [clean, ...existing.filter(item => {
            const itemKeys = barcodeFoodIdentityKeys(item.barcode, item.scannedBarcode);
            return ![...itemKeys].some(key => cleanKeys.has(key));
        })].slice(0, 100);
        saveState();

        // Keep the user's scanned-food database with their Firebase account as well
        // as localStorage, so the barcode data survives a device change.
        if (currentUser && db) {
            try {
                await db.collection('users').doc(currentUser.uid).set({
                    barcodeFoods: state.barcodeFoods
                }, { merge: true });
            } catch (error) {
                console.warn('Barcode food saved locally but cloud sync failed:', error);
            }
        }
    }


    function expandUpceToUpca(value) {
        let code = normaliseBarcode(value);
        // Some decoders omit the UPC-E number-system digit (normally zero).
        if (code.length === 7) code = '0' + code;
        if (code.length !== 8 || !/^[01]/.test(code)) return '';

        const numberSystem = code[0];
        const body = code.slice(1, 7);
        const checkDigit = code[7];
        const last = body[5];
        let manufacturer = '';
        let product = '';

        if (last === '0' || last === '1' || last === '2') {
            manufacturer = body.slice(0, 2) + last + '00';
            product = '00' + body.slice(2, 5);
        } else if (last === '3') {
            manufacturer = body.slice(0, 3) + '00';
            product = '000' + body.slice(3, 5);
        } else if (last === '4') {
            manufacturer = body.slice(0, 4) + '0';
            product = '0000' + body[4];
        } else {
            manufacturer = body.slice(0, 5);
            product = '0000' + last;
        }
        return numberSystem + manufacturer + product + checkDigit;
    }

    function barcodeLookupCandidates(value) {
        const code = normaliseBarcode(value);
        const candidates = [code];
        if (code.length === 7) candidates.push(code.padStart(8, '0'));
        if (code.length === 7 || code.length === 8) {
            candidates.push(expandUpceToUpca(code));
        }
        if (code.length === 12) candidates.push('0' + code);
        if (code.length === 13 && code.startsWith('0')) candidates.push(code.slice(1));
        if (code.length === 14 && code.startsWith('0')) candidates.push(code.slice(1));
        candidates.push(openFoodFactsBarcodeKey(code));

        return candidates
            .map(normaliseBarcode)
            .filter((candidate, index, list) =>
                isPlausibleFoodBarcode(candidate) && list.indexOf(candidate) === index
            );
    }

    async function fetchOpenFoodFactsProduct(code) {
        const requestedCode = normaliseBarcode(code);
        const fields = encodeURIComponent(OPEN_FOOD_FACTS_PRODUCT_FIELDS);
        const candidates = barcodeLookupCandidates(requestedCode);
        let lastError = null;
        let receivedValidResponse = false;

        for (const candidate of candidates) {
            const encodedCode = encodeURIComponent(candidate);
            // V2 is Open Food Facts' documented read endpoint. V3 is retained as
            // an independent compatibility fallback.
            const endpoints = [
                `https://world.openfoodfacts.org/api/v2/product/${encodedCode}?fields=${fields}&lc=en&cc=gb`,
                `https://world.openfoodfacts.org/api/v3/product/${encodedCode}?fields=${fields}&lc=en&cc=gb`
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await fetchWithTimeout(endpoint, 10000);
                    if (response.status === 404) {
                        receivedValidResponse = true;
                        continue;
                    }
                    if (!response.ok) {
                        throw new Error('Open Food Facts HTTP ' + response.status);
                    }

                    receivedValidResponse = true;
                    const data = await response.json();
                    if (data && data.product) {
                        return {
                            found: true,
                            requestedCode,
                            code: normaliseBarcode(data.code || data.product.code || candidate),
                            product: data.product
                        };
                    }
                    if (data && (data.status === 0 || data.status === 'failure' || data.result?.id === 'product_not_found')) {
                        continue;
                    }
                    lastError = new Error('Open Food Facts returned no product');
                } catch (error) {
                    lastError = error;
                }
            }
        }

        if (receivedValidResponse) return { found: false, code: requestedCode };
        throw lastError || new Error('Open Food Facts lookup failed');
    }

    function openMealBarcodeScanner() {
        barcodeScanMode = 'meal';
        openBarcodeScanner();
    }


    async function openBarcodeScanner() {
        const modal = document.getElementById('barcode-scanner-modal');
        const input = document.getElementById('manual-barcode');
        const imageInput = document.getElementById('barcode-image-input');
        if (!modal) return;
        modal.style.display = 'flex';
        if (input) input.value = '';
        if (imageInput) imageInput.value = '';
        setBarcodeDetectedCode('');

        const session = ++barcodeScannerSession;
        barcodeScanLocked = false;
        barcodeLookupInProgress = false;
        barcodeImageDecodeInProgress = false;
        barcodeTriedEngines = new Set();
        activeBarcodeOnScan = null;
        resetBarcodeCandidate();
        setBarcodeLookupBusy(false);
        setBarcodeTorchAvailable(false);
        setBarcodeScanStatus('Starting back camera…');

        await stopActiveBarcodeScanner();
        if (session !== barcodeScannerSession) return;

        const onScan = async decodedText => {
            if (
                session !== barcodeScannerSession ||
                barcodeScanLocked ||
                barcodeLookupInProgress
            ) return;

            const fullBarcode = normaliseBarcode(decodedText);
            if (!isPlausibleFoodBarcode(fullBarcode)) {
                setBarcodeScanStatus('Keep the whole barcode inside the frame', 'warning');
                return;
            }

            barcodeScanLocked = true;
            clearBarcodeScannerFallback();
            if (input) input.value = fullBarcode;
            setBarcodeDetectedCode(fullBarcode);
            setBarcodeScanStatus('Barcode read: ' + fullBarcode + ' — finding product…', 'success');
            try {
                if (navigator.vibrate) navigator.vibrate(90);
            } catch (error) {}

            await stopActiveBarcodeScanner();
            if (session !== barcodeScannerSession) return;
            await lookupBarcode(fullBarcode);
        };
        activeBarcodeOnScan = onScan;

        if (getBarcodeEngineOrder().length === 0) {
            setBarcodeScanStatus('Scanner libraries failed to load — enter the printed number', 'error');
            showToast('Scanner failed to load — enter barcode manually', 5000);
            return;
        }

        try {
            await startBestBarcodeScanner(onScan, session);
        } catch (error) {
            console.warn('Barcode camera unavailable:', error);
            setBarcodeScanStatus('Camera unavailable — use Photo or enter the printed number', 'error');
            showToast('Camera unavailable — use Photo or enter barcode manually', 5000);
        }
    }

    async function closeBarcodeScanner() {
        barcodeScannerSession += 1;
        barcodeScanLocked = false;
        barcodeImageDecodeInProgress = false;
        activeBarcodeOnScan = null;
        setBarcodeLookupBusy(false);
        await stopActiveBarcodeScanner();
        setBarcodeDetectedCode('');
        const modal = document.getElementById('barcode-scanner-modal');
        if (modal) modal.style.display = 'none';
    }

    async function useResolvedBarcodeFood(food) {
        const requestedMode = barcodeScanMode;
        barcodeScanMode = 'food';
        await closeBarcodeScanner();

        if (requestedMode === 'meal') {
            addIngredient({
                name: food.name || 'Scanned item',
                cal: food.calories || 0,
                protein: food.protein || 0
            });
        } else {
            openFoodPopupModel(food);
        }
    }


    async function restartBarcodeScannerAfterLookup() {
        const modal = document.getElementById('barcode-scanner-modal');
        if (
            !modal ||
            modal.style.display === 'none' ||
            barcodeScannerEngine ||
            !activeBarcodeOnScan ||
            barcodeLookupInProgress ||
            barcodeScanLocked
        ) return;

        const session = barcodeScannerSession;
        barcodeTriedEngines = new Set();
        try {
            await startBestBarcodeScanner(activeBarcodeOnScan, session);
        } catch (error) {
            console.warn('Barcode scanner could not restart:', error);
            setBarcodeScanStatus('Use Photo or enter another barcode number', 'warning');
        }
    }

    async function lookupBarcode(scannedCode) {
        const barcodeInput = document.getElementById('manual-barcode');
        const code = normaliseBarcode(scannedCode ?? (barcodeInput && barcodeInput.value));
        if (barcodeInput) barcodeInput.value = code;
        setBarcodeDetectedCode(code);

        if (!isPlausibleFoodBarcode(code)) {
            barcodeScanLocked = false;
            setBarcodeScanStatus('Enter the complete 7–14 digit barcode', 'error');
            showToast('Enter the complete barcode number');
            return;
        }
        if (barcodeLookupInProgress) return;

        barcodeLookupInProgress = true;
        barcodeScanLocked = true;
        setBarcodeLookupBusy(true);
        setBarcodeScanStatus('Finding ' + code + ' in Open Food Facts…');

        const cached = findCachedBarcodeFood(code);
        let restartAfterFailure = false;
        try {
            const result = await fetchOpenFoodFactsProduct(code);
            if (!result.found || !result.product) {
                barcodeScanLocked = false;
                restartAfterFailure = true;
                setBarcodeScanStatus('Barcode ' + code + ' was read, but it is not in Open Food Facts', 'warning');
                showToast('Barcode read — product not found in Open Food Facts');
                return;
            }

            const food = normaliseOpenFoodFactsProduct(result.product, code);
            food.barcode = result.code || food.barcode || code;
            food.scannedBarcode = code;
            await cacheBarcodeFood(food);
            await useResolvedBarcodeFood(food);
        } catch (error) {
            console.warn('Open Food Facts barcode lookup failed:', error);
            if (cached) {
                await useResolvedBarcodeFood(cached);
                showToast('Loaded saved product — Open Food Facts is unavailable');
            } else {
                barcodeScanLocked = false;
                restartAfterFailure = true;
                setBarcodeScanStatus('Barcode read, but Open Food Facts could not be reached — try again', 'error');
                showToast('Could not reach Open Food Facts');
            }
        } finally {
            barcodeLookupInProgress = false;
            setBarcodeLookupBusy(false);
            if (restartAfterFailure) await restartBarcodeScannerAfterLookup();
        }
    }

    // ==========================================================================
    // CREATED MEALS
    // ==========================================================================

    function renderCreatedMeals() {
        const container = document.getElementById('created-meals-list');
        if (!container) return;
        const list = state.createdMeals || [];
        const customs = state.customFoods || [];

        let html = '';
        if (customs.length > 0) {
            html += '<h4 class="text-xs font-black text-slate-400 uppercase mb-2 mt-4">My Foods</h4>';
            html += customs.slice(0, 10).map(f => `
                <div onclick='openFoodPopupCustom(${JSON.stringify(f).replace(/'/g, "&apos;")})' class="glass-card p-3 rounded-2xl cursor-pointer hover:shadow-md mb-2 flex items-center gap-3">
                    <div class="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                        ${f.image ? `<img src="${f.image}" class="w-full h-full object-contain">` : '<i data-lucide="utensils" class="w-6 h-6 text-slate-300"></i>'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate">${f.name}</p>
                        <p class="text-xs text-slate-400">${Math.round(f.calories || 0)} kcal • ${(f.protein || 0).toFixed(1)}g protein</p>
                    </div>
                    <button onclick="event.stopPropagation(); deleteCustomFood('${f.id}')" class="w-7 h-7 bg-red-50 text-red-500 rounded-lg text-sm">×</button>
                </div>
            `).join('');
        }

        if (list.length > 0) {
            html += '<h4 class="text-xs font-black text-slate-400 uppercase mb-2 mt-4">My Meals</h4>';
            html += list.map(m => `
                <div class="glass-card p-3 rounded-2xl mb-2 flex items-center gap-3">
                    <div class="flex-1">
                        <p class="font-bold text-sm">${m.name}</p>
                        <p class="text-xs text-slate-400">${Math.round(m.calories || 0)} kcal</p>
                    </div>
                    <button onclick="deleteCreatedMeal('${m.id}')" class="w-7 h-7 bg-red-50 text-red-500 rounded-lg text-sm">×</button>
                </div>
            `).join('');
        }

        container.innerHTML = html;
        lucide.createIcons();
    }

    function deleteCustomFood(id) {
        state.customFoods = (state.customFoods || []).filter(f => f.id !== id);
        saveState();
        renderCreatedMeals();
        showToast('Removed');
    }

    function deleteCreatedMeal(id) {
        state.createdMeals = (state.createdMeals || []).filter(m => String(m.id) !== String(id));
        saveState();
        renderCreatedMeals();
    }

    function openCreateMeal() {
        document.getElementById('create-meal-modal').style.display = 'flex';
        mealIngredients = [];
        document.getElementById('meal-name-input').value = '';
        document.getElementById('meal-search-results').innerHTML = '';
        const search = document.getElementById('meal-ingredient-search');
        if (search) search.value = '';
        renderMealIngredients();  // shows placeholder + hides totals
    }

    function closeCreateMeal() {
        document.getElementById('create-meal-modal').style.display = 'none';
    }

    function setupMealIngredientSearch() {
        const input = document.getElementById('meal-ingredient-search');
        if (!input) return;
        let timer;
        input.addEventListener('input', (e) => {
            clearTimeout(timer);
            const q = e.target.value.trim();
            if (q.length < 2) {
                document.getElementById('meal-search-results').innerHTML = '';
                return;
            }
            timer = setTimeout(() => searchIngredient(q), 300);
        });
    }

    async function searchIngredient(query) {
        try {
            const r = await fetch(`https://uk.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&tagtype_0=countries&tag_contains_0=contains&tag_0=united-kingdom`);
            const d = await r.json();
            const items = (d.products || []).filter(p => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g']);
            document.getElementById('meal-search-results').innerHTML = items.map(p => `
                <div onclick='addIngredient(${JSON.stringify({name: p.product_name, cal: p.nutriments["energy-kcal_100g"], protein: p.nutriments.proteins_100g || 0}).replace(/'/g, "&apos;")})' class="p-2 hover:bg-indigo-50 cursor-pointer rounded-lg border text-xs">
                    <span class="font-bold">${p.product_name}</span> <span class="text-slate-400">${Math.round(p.nutriments['energy-kcal_100g'])} kcal/100g</span>
                </div>
            `).join('');
        } catch (e) {
            console.error(e);
        }
    }

    function addIngredient(item) {
        const grams = parseFloat(prompt(`How many grams of "${item.name}"?`, '100'));
        if (!grams || grams <= 0) return;
        mealIngredients.push({
            name: item.name,
            grams: grams,
            // Keep per-100g base so the weight can be edited later
            calPer100: item.cal || 0,
            proteinPer100: item.protein || 0,
            calories: (item.cal || 0) * (grams / 100),
            protein: (item.protein || 0) * (grams / 100)
        });
        renderMealIngredients();
        // Clear the search so it's ready for the next ingredient
        const search = document.getElementById('meal-ingredient-search');
        if (search) search.value = '';
        document.getElementById('meal-search-results').innerHTML = '';
    }

    // Change an ingredient's weight inline → recalcs its cals/protein + totals
    function updateIngredientGrams(idx, value) {
        const grams = parseFloat(value);
        const ing = mealIngredients[idx];
        if (!ing) return;
        ing.grams = (!grams || grams < 0) ? 0 : grams;
        // Recompute from the stored per-100g base
        const base100cal = ing.calPer100 != null ? ing.calPer100 : (ing.grams ? ing.calories / (ing.grams / 100) : 0);
        const base100prot = ing.proteinPer100 != null ? ing.proteinPer100 : (ing.grams ? ing.protein / (ing.grams / 100) : 0);
        ing.calories = base100cal * (ing.grams / 100);
        ing.protein = base100prot * (ing.grams / 100);
        // Update just this row's readout + the totals (no full re-render, so the
        // input keeps focus while typing)
        const rowInfo = document.getElementById('ing-info-' + idx);
        if (rowInfo) rowInfo.textContent = `${Math.round(ing.calories)} kcal • ${ing.protein.toFixed(1)}g protein`;
        updateMealTotals();
    }

    function renderMealIngredients() {
        const list = document.getElementById('meal-ingredients-list');
        if (!list) return;
        if (mealIngredients.length === 0) {
            list.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-2">No ingredients added yet</p>';
            updateMealTotals();
            return;
        }
        list.innerHTML = mealIngredients.map((ing, i) => `
            <div class="bg-slate-50 p-3 rounded-xl">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-sm font-bold flex-1 min-w-0 truncate">${ing.name}</p>
                    <button onclick="removeIngredient(${i})" class="w-7 h-7 bg-red-50 text-red-500 rounded-lg text-sm flex-shrink-0 ml-2">×</button>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center bg-white rounded-lg border border-slate-200 px-2">
                        <input type="number" min="0" step="1" value="${ing.grams}" oninput="updateIngredientGrams(${i}, this.value)" class="w-16 py-1.5 text-sm font-bold outline-none text-center">
                        <span class="text-xs text-slate-400 font-bold">g</span>
                    </div>
                    <p id="ing-info-${i}" class="text-[11px] text-slate-500">${Math.round(ing.calories)} kcal • ${ing.protein.toFixed(1)}g protein</p>
                </div>
            </div>
        `).join('');
        updateMealTotals();
    }

    // Recalculate and display the live meal totals
    function updateMealTotals() {
        const totalsBox = document.getElementById('meal-totals');
        if (!totalsBox) return;
        if (mealIngredients.length === 0) {
            totalsBox.classList.add('hidden');
            return;
        }
        totalsBox.classList.remove('hidden');
        const totalCal = mealIngredients.reduce((s, i) => s + (i.calories || 0), 0);
        const totalProt = mealIngredients.reduce((s, i) => s + (i.protein || 0), 0);
        const totalWeight = mealIngredients.reduce((s, i) => s + (i.grams || 0), 0);
        document.getElementById('meal-total-cals').textContent = Math.round(totalCal);
        document.getElementById('meal-total-protein').textContent = totalProt.toFixed(1);
        document.getElementById('meal-total-weight').textContent =
            `${mealIngredients.length} ingredient${mealIngredients.length === 1 ? '' : 's'} • ${Math.round(totalWeight)}g total`;
    }

    function removeIngredient(idx) {
        mealIngredients.splice(idx, 1);
        renderMealIngredients();
    }

    function saveMeal() {
        const name = document.getElementById('meal-name-input').value.trim();
        if (!name) { showToast('Enter a meal name'); return; }
        if (mealIngredients.length === 0) { showToast('Add at least one ingredient'); return; }

        const totalCal = mealIngredients.reduce((s, i) => s + i.calories, 0);
        const totalProt = mealIngredients.reduce((s, i) => s + i.protein, 0);

        state.createdMeals.unshift({
            id: Date.now(),
            name,
            calories: totalCal,
            protein: totalProt,
            ingredients: mealIngredients
        });
        saveState();
        closeCreateMeal();
        renderCreatedMeals();
        showToast('Meal saved! 🍽️');
    }

    // ==========================================================================
    // NUTRITION HISTORY DISPLAY
    // ==========================================================================

    function renderNutritionHistory() {
        const container = document.getElementById('nutrition-history-display');
        if (!container) return;

        if (!state.nutritionHistory || state.nutritionHistory.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">No nutrition history yet</p>';
            return;
        }

        const recent = state.nutritionHistory.slice(0, 7);
        container.innerHTML = recent.map(entry => {
            const date = new Date(entry.date);
            const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return `
                <div class="bg-slate-50 p-4 rounded-2xl">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="font-bold text-sm">${dateLabel}</p>
                            <p class="text-xs text-slate-400">${(entry.meals || []).length} meals</p>
                        </div>
                        <div class="text-right">
                            <p class="font-black text-indigo-600">${Math.round(entry.calories)} kcal</p>
                            <p class="text-[10px] text-slate-500">${Math.round(entry.protein)}g protein</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==========================================================================
    // SAVE NUTRITION MODAL
    // ==========================================================================

    function openSaveNutritionModal() {
        const today = state.viewDate || new Date().toISOString().split('T')[0];
        document.getElementById('save-nutrition-date').value = today;

        const meals = state.dailyMeals.filter(m => m.date === today);
        const cals = meals.reduce((s, m) => s + (m.calories || 0), 0);
        const prot = meals.reduce((s, m) => s + (m.protein || 0), 0);

        document.getElementById('save-cal-preview').textContent = Math.round(cals);
        document.getElementById('save-protein-preview').textContent = Math.round(prot);
        document.getElementById('save-meals-preview').textContent = meals.length;

        document.getElementById('save-nutrition-modal').style.display = 'flex';
    }

    function closeSaveNutritionModal() {
        document.getElementById('save-nutrition-modal').style.display = 'none';
    }

    function confirmSaveNutrition() {
        const dateToSave = document.getElementById('save-nutrition-date').value;
        if (!dateToSave) { showToast('Pick a date'); return; }

        const meals = state.dailyMeals.filter(m => m.date === state.viewDate);
        if (meals.length === 0) { showToast('No meals to save'); closeSaveNutritionModal(); return; }

        if (dateToSave !== state.viewDate) {
            meals.forEach(m => m.date = dateToSave);
        }

        const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
        const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);
        const totalCarbs = meals.reduce((s, m) => s + (m.carbs || 0), 0);
        const totalFat = meals.reduce((s, m) => s + (m.fat || 0), 0);
        const totalFiber = meals.reduce((s, m) => s + (m.fiber || 0), 0);

        state.nutritionHistory = state.nutritionHistory.filter(h => h.date !== dateToSave);
        state.nutritionHistory.unshift({
            date: dateToSave,
            calories: totalCals,
            protein: totalProtein,
            carbs: totalCarbs,
            fat: totalFat,
            fiber: totalFiber,
            meals,
            savedAt: new Date().toISOString()
        });

        saveState();
        closeSaveNutritionModal();
        renderNutritionHistory();
        showToast('Saved to history! ✓');
    }

    // ==========================================================================
    // COPY FROM PREVIOUS DAY
    // ==========================================================================

    function openCopyPreviousDay() {
        const sel = document.getElementById('copy-date-select');
        if (!sel) return;

        const datesWithMeals = [...new Set((state.nutritionHistory || []).map(h => h.date))].sort().reverse();

        if (datesWithMeals.length === 0) {
            showToast('No previous nutrition history found');
            return;
        }

        sel.innerHTML = '<option value="">Choose a date...</option>' + datesWithMeals.map(d => {
            const date = new Date(d);
            const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return `<option value="${d}">${label}</option>`;
        }).join('');

        document.getElementById('previous-meals-list').innerHTML = '';
        selectedPreviousMeals = [];
        document.getElementById('copy-previous-day-modal').style.display = 'flex';
    }

    function closeCopyPreviousDay() {
        document.getElementById('copy-previous-day-modal').style.display = 'none';
        selectedPreviousMeals = [];
        // Reset the search box
        const input = document.getElementById('copy-search-input');
        if (input) input.value = '';
        const results = document.getElementById('past-food-results');
        if (results) results.innerHTML = '';
        const clearBtn = document.getElementById('copy-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
    }

    /**
     * Build a deduplicated list of every food ever logged, newest first.
     * Pulls from nutritionHistory (past days) + today's dailyMeals.
     * Deduped by name (case-insensitive) so repeated foods appear once.
     */
    function getAllLoggedFoods() {
        const all = [];
        (state.dailyMeals || []).forEach(m => all.push({ meal: m, when: m.id || Date.now() }));
        (state.nutritionHistory || []).forEach(day => {
            (day.meals || []).forEach(m => all.push({ meal: m, when: day.date }));
        });
        all.sort((a, b) => String(b.when).localeCompare(String(a.when)));

        const seen = new Set();
        const out = [];
        for (const item of all) {
            const m = item.meal;
            if (!m || !m.name) continue;
            const key = m.name.toLowerCase().trim();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(m);
        }
        return out;
    }

    /**
     * Search the user's previously-logged foods by name and show matches with
     * checkboxes. Selecting one adds it to the same selectedPreviousMeals list
     * that "Copy to Today" reads from.
     */
    function searchPastFoods(query) {
        const results = document.getElementById('past-food-results');
        const clearBtn = document.getElementById('copy-search-clear');
        if (!results) return;

        const q = query.trim().toLowerCase();
        if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);

        if (q.length === 0) {
            results.innerHTML = '';
            return;
        }

        const matches = getAllLoggedFoods().filter(m => m.name.toLowerCase().includes(q)).slice(0, 25);

        if (matches.length === 0) {
            results.innerHTML = '<p class="text-center text-slate-400 italic py-3 text-sm">No matching foods in your history</p>';
            return;
        }

        results.innerHTML = matches.map((m, i) => {
            // Is this food already selected? (match by name since these are deduped)
            const isSel = selectedPreviousMeals.some(s => (s.name || '').toLowerCase() === m.name.toLowerCase());
            const safe = JSON.stringify(m).replace(/'/g, '&apos;');
            return `
                <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                    <input type="checkbox" ${isSel ? 'checked' : ''} onchange='togglePastFood(this, ${safe})' class="w-5 h-5 accent-indigo-600 flex-shrink-0">
                    <div class="w-10 h-10 bg-white rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                        ${m.image ? `<img src="${m.image}" class="w-full h-full object-contain" onerror="this.style.display='none'">` : '<i data-lucide="utensils" class="w-5 h-5 text-slate-300"></i>'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate">${escapeHtml(m.name)}</p>
                        <p class="text-xs text-slate-400">${Math.round(m.calories || 0)} kcal · ${(m.protein || 0).toFixed(0)}g protein</p>
                    </div>
                </label>`;
        }).join('');
        lucide.createIcons();
    }

    function togglePastFood(checkbox, meal) {
        if (checkbox.checked) {
            // Avoid duplicate entries by name
            if (!selectedPreviousMeals.some(s => (s.name || '').toLowerCase() === (meal.name || '').toLowerCase())) {
                // Give it a fresh id so it doesn't collide with an existing logged meal
                selectedPreviousMeals.push({ ...meal, id: Date.now() + Math.floor(Math.random() * 1000) });
            }
            showToast('Added — tap "Copy to Today" to confirm');
        } else {
            selectedPreviousMeals = selectedPreviousMeals.filter(s => (s.name || '').toLowerCase() !== (meal.name || '').toLowerCase());
        }
    }

    function clearPastFoodSearch() {
        const input = document.getElementById('copy-search-input');
        if (input) input.value = '';
        const clearBtn = document.getElementById('copy-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
        const results = document.getElementById('past-food-results');
        if (results) results.innerHTML = '';
    }

    function loadPreviousDayMeals() {
        const date = document.getElementById('copy-date-select').value;
        if (!date) return;

        const entry = (state.nutritionHistory || []).find(h => h.date === date);
        const meals = entry ? entry.meals : [];

        const container = document.getElementById('previous-meals-list');
        if (meals.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-400 italic py-4">No meals logged on this date</p>';
            return;
        }

        container.innerHTML = meals.map((m, i) => `
            <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                <input type="checkbox" data-idx="${i}" data-meal-id="${m.id}" onchange="togglePreviousMeal(this, ${i}, '${date}')" class="w-5 h-5 accent-indigo-600">
                <div class="flex-1">
                    <p class="font-bold text-sm">${m.name}</p>
                    <p class="text-xs text-slate-400">${m.mealType} • ${Math.round(m.calories || 0)} kcal</p>
                </div>
                <button onclick="editPreviousMealItem(${i}, '${date}'); event.preventDefault();" class="text-xs text-indigo-600 font-bold">Edit</button>
            </label>
        `).join('');
    }

    function togglePreviousMeal(checkbox, idx, date) {
        const entry = (state.nutritionHistory || []).find(h => h.date === date);
        if (!entry) return;
        const meal = entry.meals[idx];
        if (checkbox.checked) {
            selectedPreviousMeals.push({ ...meal });
        } else {
            selectedPreviousMeals = selectedPreviousMeals.filter(m => m.id !== meal.id);
        }
    }

    function editPreviousMealItem(idx, date) {
        const entry = (state.nutritionHistory || []).find(h => h.date === date);
        if (!entry) return;
        currentEditingMeal = { ...entry.meals[idx] };
        document.getElementById('edit-meal-name').textContent = currentEditingMeal.name;
        document.getElementById('edit-meal-image').src = currentEditingMeal.image || 'https://via.placeholder.com/100';
        document.getElementById('edit-meal-original').textContent = `Was: ${currentEditingMeal.amount || 1} ${currentEditingMeal.amountType || 'portion'} (${Math.round(currentEditingMeal.calories)} kcal)`;
        document.getElementById('edit-meal-amount').value = currentEditingMeal.amount || 1;
        editAmountType = currentEditingMeal.amountType || 'portion';
        setEditAmountType(editAmountType);
        document.getElementById('edit-meal-type').value = currentEditingMeal.type || 'lunch';
        updateEditPreview();
        document.getElementById('edit-copied-meal-modal').style.display = 'flex';
    }

    function closeEditCopiedMeal() {
        document.getElementById('edit-copied-meal-modal').style.display = 'none';
        currentEditingMeal = null;
    }

    function setEditAmountType(type) {
        editAmountType = type;
        const p = document.getElementById('edit-amount-type-portion');
        const g = document.getElementById('edit-amount-type-grams');
        if (type === 'portion') {
            p.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase bg-white shadow text-emerald-600';
            g.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400';
        } else {
            g.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase bg-white shadow text-emerald-600';
            p.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400';
        }
        updateEditPreview();
    }

    function updateEditPreview() {
        if (!currentEditingMeal) return;
        const amount = parseFloat(document.getElementById('edit-meal-amount').value) || 1;
        const originalAmount = currentEditingMeal.amount || 1;
        const originalCal = currentEditingMeal.calories || 0;
        const originalProtein = currentEditingMeal.protein || 0;

        // Compute per-1-portion or per-gram values from original
        const perUnitCal = originalAmount > 0 ? originalCal / originalAmount : originalCal;
        const perUnitProt = originalAmount > 0 ? originalProtein / originalAmount : originalProtein;

        const newCal = perUnitCal * amount;
        const newProt = perUnitProt * amount;

        document.getElementById('edit-total-cals').textContent = Math.round(newCal);
        document.getElementById('edit-total-protein').textContent = newProt.toFixed(1) + 'g';
    }

    function saveEditedMeal() {
        if (!currentEditingMeal) return;
        const amount = parseFloat(document.getElementById('edit-meal-amount').value) || 1;
        const originalAmount = currentEditingMeal.amount || 1;
        const ratio = amount / originalAmount;

        const newMeal = {
            ...currentEditingMeal,
            id: Date.now() + Math.random(),
            date: state.viewDate,
            type: document.getElementById('edit-meal-type').value,
            amount,
            amountType: editAmountType,
            calories: (currentEditingMeal.calories || 0) * ratio,
            protein: (currentEditingMeal.protein || 0) * ratio,
            carbs: (currentEditingMeal.carbs || 0) * ratio,
            fat: (currentEditingMeal.fat || 0) * ratio,
            fiber: (currentEditingMeal.fiber || 0) * ratio
        };

        state.dailyMeals.push(newMeal);
        saveState();
        autoSaveNutrition();
        closeEditCopiedMeal();
        renderDiary();
        renderDashboard();
        showToast('Added to today!');
    }

    function copySelectedMeals() {
        if (selectedPreviousMeals.length === 0) { showToast('Pick at least one meal'); return; }
        selectedPreviousMeals.forEach(m => {
            state.dailyMeals.push({
                ...m,
                id: Date.now() + Math.random(),
                date: state.viewDate
            });
        });
        saveState();
        autoSaveNutrition();
        closeCopyPreviousDay();
        renderDiary();
        renderDashboard();
        showToast(`Copied ${selectedPreviousMeals.length} meals to today!`);
    }

    // ==========================================================================
    // MIDNIGHT AUTO-SAVE WATCHDOG
    // ==========================================================================

    function setupMidnightCheck() {
        if (midnightCheckInterval) clearInterval(midnightCheckInterval);
        lastCheckDate = new Date().toDateString();
        midnightCheckInterval = setInterval(() => {
            const currentDate = new Date().toDateString();
            if (currentDate !== lastCheckDate) {
                saveDailyNutrition();
                lastCheckDate = currentDate;
                const today = new Date().toISOString().split('T')[0];
                state.viewDate = today;
                saveState();
                renderDiary();
                renderDashboard();
                shiftAdviceDateKey = localDateKey();
                shiftPlannerWeekOffset = 0;
                renderShiftWorker();
            }
        }, 60000);
    }

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
        lucide.createIcons();
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
            workouts.push({
                id: c.id,
                date: c.date,
                focus: c.type.charAt(0).toUpperCase() + c.type.slice(1),
                duration: c.duration + ' min',
                category: c.type === 'walking' ? 'walking' : 'cardio',
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
            lucide.createIcons();
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
                <div onclick="viewWorkoutDetails(${w.id})" class="glass-card p-4 rounded-2xl mb-3 cursor-pointer hover:shadow-md transition-all">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">${catEmoji}</span>
                            <div>
                                <p class="font-bold text-sm">${w.focus}</p>
                                <p class="text-xs text-slate-400">${dateStr}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-bold text-indigo-600">${w.duration || ''}</p>
                            <p class="text-xs text-slate-400">${summary}</p>
                        </div>
                    </div>
                </div>`;
        }).join('');

        lucide.createIcons();
    }

    function viewWorkoutDetails(workoutId) {
        const workout = (state.workoutHistory || []).find(w => w.id === workoutId)
            || (state.cardioLogs || []).find(c => c.id === workoutId);
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
        const current = document.getElementById('metrics-date-picker').value || new Date().toISOString().split('T')[0];
        const date = new Date(current);
        date.setDate(date.getDate() + days);
        selectMetricsDate(date.toISOString().split('T')[0]);
    }

    function selectMetricsDate(dateStr) {
        state.metricsDate = dateStr;
        document.getElementById('metrics-date-picker').value = dateStr;
        const today = new Date().toISOString().split('T')[0];
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

    /**
     * Resize an image to fit within maxDim and re-encode as a JPEG of the given quality.
     * Returns a base64 data URL. Progress photos compressed this way are typically
     * 200-400 KB instead of 4-16 MB, which fits comfortably inside localStorage.
     */
    function compressImage(file, maxDim, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.onload = (e) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Image decode failed'));
                img.onload = () => {
                    let { width, height } = img;
                    // Scale down so the longest edge equals maxDim
                    if (width > maxDim || height > maxDim) {
                        if (width >= height) {
                            height = Math.round(height * (maxDim / width));
                            width = maxDim;
                        } else {
                            width = Math.round(width * (maxDim / height));
                            height = maxDim;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    // toDataURL('image/jpeg', quality) produces a much smaller file than raw
                    resolve(canvas.toDataURL('image/jpeg', quality));
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
            // 1200px max edge, 80% JPEG quality — good visual fidelity, ~200-400 KB on disk
            const compressed = await compressImage(file, 1200, 0.8);
            if (preview) {
                preview.src = compressed;
                preview.classList.remove('hidden');
            }
            state.currentPhotos[currentPhotoType] = compressed;
            showToast('Photo added — tap Save Photos to confirm');
        } catch (err) {
            console.error('Photo compression failed:', err);
            showToast('Could not process that image — try another');
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
                } else if (isStoredPhotoValue(v)) {
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
        const date = state.metricsDate || new Date().toISOString().split('T')[0];
        return (state.metricsHistory || []).find(m => m.date === date) || null;
    }

    function formatMetricsDateLabel(dateStr) {
        const today = new Date().toISOString().split('T')[0];
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
        const date = state.metricsDate || new Date().toISOString().split('T')[0];
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
        const date = state.metricsDate || new Date().toISOString().split('T')[0];
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
        const date = state.metricsDate || new Date().toISOString().split('T')[0];
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
        const date = state.metricsDate || new Date().toISOString().split('T')[0];

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

    async function openProgressPhotosModal() {
        const date = state.metricsDate || new Date().toISOString().split('T')[0];
        document.getElementById('record-photos-date').textContent = formatMetricsDateLabel(date);
        const loadToken = ++photoModalLoadToken;

        // Reset buffer and load any existing photos for the date
        state.currentPhotos = { front: null, side: null, back: null };
        const existing = getCurrentMetricEntry();

        ['front', 'side', 'back'].forEach(t => {
            const preview = document.getElementById(`photo-${t}-preview`);
            if (!preview) return;
            preview.classList.add('hidden');
            preview.src = '';
        });

        document.getElementById('progress-photos-modal').style.display = 'flex';
        lucide.createIcons();
        updateProgressPhotoStorageStatus();

        await Promise.all(['front', 'side', 'back'].map(async t => {
            const value = existing && existing.photos && existing.photos[t];
            if (!value) return;
            try {
                const source = await resolveProgressPhotoSource(value, date, t);
                // Do not let a slower database read overwrite a photo the user
                // has just selected or cleared while this modal is open.
                if (loadToken !== photoModalLoadToken || state.currentPhotos[t] !== null || !source) return;
                const preview = document.getElementById(`photo-${t}-preview`);
                if (preview) {
                    preview.src = source;
                    preview.classList.remove('hidden');
                }
            } catch (error) {
                console.warn(`Could not load ${t} progress photo:`, error);
            }
        }));
    }

    function closeProgressPhotosModal() {
        photoModalLoadToken += 1;
        document.getElementById('progress-photos-modal').style.display = 'none';
        // Discard buffered changes that weren't saved
        state.currentPhotos = { front: null, side: null, back: null };
    }

    async function saveRecordedPhotos() {
        const date = state.metricsDate || new Date().toISOString().split('T')[0];

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

        const saveButton = document.getElementById('progress-photo-save-btn');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = 'Saving Photos…';
        }

        let ok = false;
        try {
            if (photoStorageMode === 'indexeddb') {
                // The database transaction completes before state is updated, so a
                // refresh cannot leave a reference pointing at an unwritten image.
                await applyProgressPhotoChanges(date, photos);
                const references = {};
                Object.entries(photos).forEach(([angle, value]) => {
                    references[angle] = value === 'REMOVE'
                        ? 'REMOVE'
                        : progressPhotoReference(date, angle);
                });
                mergeMetricEntry(date, {}, references);
                // IndexedDB is authoritative and can rebuild the local index even if
                // another oversized local setting makes the lightweight cache fail.
                ok = true;
            } else {
                ok = mergeMetricEntry(date, {}, photos);
            }
        } catch (error) {
            console.error('Photo save failed:', error);
            showToast('Photos not saved — keep this screen open and try again', 6000);
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = 'Save Photos';
            }
        }

        if (!ok) return;

        // Verify it actually persisted (defensive — in case mergeMetricEntry's
        // internal state was updated but localStorage write threw)
        const verifyEntry = (state.metricsHistory || []).find(m => m.date === date);
        const savedCount = verifyEntry && verifyEntry.photos ? Object.keys(verifyEntry.photos).length : 0;

        // Reset buffer only on confirmed success
        state.currentPhotos = { front: null, side: null, back: null };
        if (typeof markReminderDone === 'function') markReminderDone('photo');

        photoModalLoadToken += 1;
        document.getElementById('progress-photos-modal').style.display = 'none';
        renderMetricsStatusLines();
        renderMetricsHistory();
        updateProgressPhotoStorageStatus();
        showToast('Photos saved ✓ (' + savedCount + ' on file for this date)');
    }

    function formatStorageSize(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    async function updateProgressPhotoStorageStatus() {
        const status = document.getElementById('progress-photo-storage-status');
        if (!status) return;
        if (photoStorageMode !== 'indexeddb') {
            status.textContent = 'Limited browser storage mode';
            return;
        }
        try {
            const keys = await getProgressPhotoRecordKeys();
            let detail = `${keys.length} photo${keys.length === 1 ? '' : 's'} stored on this device`;
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                if (Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage)) {
                    detail += ` · ${formatStorageSize(Math.max(0, estimate.quota - estimate.usage))} available`;
                }
            }
            status.textContent = detail;
        } catch (error) {
            status.textContent = 'Expanded photo storage is ready';
        }
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
                <div onclick="selectMetricsDate('${e.date}')" class="bg-slate-50 hover:bg-slate-100 p-3 rounded-xl cursor-pointer flex items-center justify-between">
                    <p class="font-bold text-sm">${d}</p>
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
    async function diagnosePhotoData() {
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
                    const storageType = isPhotoReference(data) ? 'IndexedDB reference' : (isValidPhotoData(data) ? 'legacy inline image' : 'invalid');
                    lines.push('  ' + angle + ': ' + storageType);
                });
            });
        }

        lines.push('');
        lines.push('=== LOCAL STORAGE ===');
        try {
            const raw = localStorage.getItem('fittrack_state');
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
                    lines.push('The IndexedDB recovery index will repair this on the next load.');
                }
            } else {
                lines.push('⚠️ No state in localStorage');
            }
        } catch (e) {
            lines.push('Storage read error: ' + e.message);
        }

        lines.push('');
        lines.push('=== EXPANDED PHOTO STORAGE ===');
        try {
            if (photoStorageMode === 'indexeddb') {
                const keys = await getProgressPhotoRecordKeys();
                lines.push('IndexedDB photos for this account: ' + keys.length);
                if (navigator.storage && navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    lines.push('Origin usage: ' + formatStorageSize(estimate.usage || 0));
                    lines.push('Estimated capacity: ' + formatStorageSize(estimate.quota || 0));
                }
            } else {
                lines.push('IndexedDB unavailable — using limited localStorage fallback.');
            }
        } catch (e) {
            lines.push('IndexedDB read error: ' + e.message);
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
            lucide.createIcons();
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

    async function loadComparisonPhotos() {
        const loadToken = ++comparisonPhotoLoadToken;
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
            lucide.createIcons();
            return;
        }

        const m1 = (state.metricsHistory || []).find(m => m.date === date1);
        const m2 = (state.metricsHistory || []).find(m => m.date === date2);

        const photoValue1 = m1 && m1.photos && m1.photos[comparePhotoType];
        const photoValue2 = m2 && m2.photos && m2.photos[comparePhotoType];
        let photo1 = '';
        let photo2 = '';
        if (photoValue1 && photoValue2) {
            try {
                [photo1, photo2] = await Promise.all([
                    resolveProgressPhotoSource(photoValue1, date1, comparePhotoType),
                    resolveProgressPhotoSource(photoValue2, date2, comparePhotoType)
                ]);
                if (loadToken !== comparisonPhotoLoadToken) return;
            } catch (error) {
                console.warn('Could not load comparison photos:', error);
            }
        }

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
            lucide.createIcons();
            return;
        }

        noMsg.classList.add('hidden');
        view.classList.remove('hidden');
        // A valid pair is showing — allow saving the comparison image
        const sBtn = document.getElementById('save-comparison-btn');
        if (sBtn) { sBtn.classList.remove('hidden'); lucide.createIcons(); }

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
                lucide.createIcons();
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
        lucide.createIcons();
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
            cutoff = d.toISOString().split('T')[0];
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
            lucide.createIcons();
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
            // Lifts: compare best weight for every exercise trained in the period
            const names = new Set();
            (state.workoutHistory || []).forEach(w => {
                if (!w.date || w.date > to) return;
                (w.exercises || []).forEach(ex => { if (ex.name) names.add(ex.name); });
            });
            names.forEach(name => {
                const a = bestLiftUpTo(name, from);
                const b = bestLiftUpTo(name, to);
                if (b <= 0) return;                 // never lifted by the end date
                if (a === b) return;                // no change — skip for a cleaner card
                progressRows.push({
                    label: name, unit: 'kg',
                    before: a, after: b,
                    delta: Math.round((b - a) * 10) / 10,
                    good: isAssistanceExercise(name) ? (b < a) : (b > a)
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
                </div>`;
        }).join('');

        if (saveBtn) saveBtn.classList.remove('hidden');
        lucide.createIcons();
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
            lucide.createIcons();
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
            lucide.createIcons();
        }, 'image/jpeg', 0.92);
    }

    function closeComparisonResult() {
        const modal = document.getElementById('comparison-result-modal');
        if (modal) modal.style.display = 'none';
        const img = document.getElementById('comparison-result-img');
        if (img && img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    }

    function comparisonFileName() {
        const d = new Date().toISOString().split('T')[0];
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

        lucide.createIcons();
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

        // Show stats and chart sections
        document.getElementById('exercise-progress-empty').classList.add('hidden');
        document.getElementById('exercise-progress-stats').classList.remove('hidden');
        document.getElementById('exercise-progress-chart-container').classList.remove('hidden');

        const currentMax = Math.max(...dataPoints.map(d => d.weight));
        const startingWeight = dataPoints[0].weight;
        const totalGain = currentMax - startingWeight;
        const workoutCount = dataPoints.length;

        document.getElementById('exercise-current-max').textContent = currentMax + 'kg';
        document.getElementById('exercise-starting-weight').textContent = startingWeight + 'kg';
        document.getElementById('exercise-total-gain').textContent = (totalGain >= 0 ? '+' : '') + totalGain.toFixed(1) + 'kg';
        document.getElementById('exercise-workout-count').textContent = workoutCount;

        // Render chart
        const canvas = document.getElementById('exercise-progress-chart');
        if (exerciseProgressChart) exerciseProgressChart.destroy();

        exerciseProgressChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: dataPoints.map(d => new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
                datasets: [{
                    label: 'Max Weight (kg)',
                    data: dataPoints.map(d => d.weight),
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

        lucide.createIcons();
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
                const weekKey = monday.toISOString().split('T')[0];
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
                const weekKey = monday.toISOString().split('T')[0];
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
        state.habits = (state.habits || []).filter(h => h.id !== id);
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
            return `
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <span class="font-bold text-sm ${completed ? 'line-through text-slate-400' : ''}">${h.name}</span>
                    <button onclick="toggleHabitCompletion(${h.id})" class="w-10 h-10 rounded-xl flex items-center justify-center ${completed ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-200'}">
                        <i data-lucide="check" class="w-5 h-5 ${completed ? '' : 'text-transparent'}"></i>
                    </button>
                </div>`;
        }).join('');

        lucide.createIcons();
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
                        <span class="font-bold text-sm">${h.name}</span>
                        <button onclick="removeHabit(${h.id})" class="w-8 h-8 bg-red-50 text-red-500 rounded-lg">×</button>
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
                    <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleEquipment('gym', '${item}')" class="w-4 h-4 accent-indigo-600">
                    <span class="text-sm font-bold">${item}</span>
                </label>`).join('');
        }
        const homeList = document.getElementById('home-equipment-list');
        if (homeList && state.equipment && state.equipment.home) {
            homeList.innerHTML = Object.entries(state.equipment.home).map(([item, enabled]) => `
                <label class="flex items-center gap-2 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                    <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleEquipment('home', '${item}')" class="w-4 h-4 accent-indigo-600">
                    <span class="text-sm font-bold">${item}</span>
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
                        weight_loss: { emoji: '🔥', label: 'Weight Loss', color: 'text-rose-600' },
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
                        if (g.details.priority) parts.push(g.details.priority);
                        if (g.details.physique) parts.push(g.details.physique);
                        if (g.details.experience) parts.push(g.details.experience);
                        if (parts.length) summary = parts.join(' · ');
                    } else if (g.focus === 'health' && g.details && g.details.area) {
                        summary = g.details.area;
                    }

                    return `
                        <div class="bg-slate-50 p-3 rounded-xl">
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-[10px] font-black ${focusInfo.color} uppercase">${focusInfo.emoji} ${focusInfo.label}</span>
                                <button onclick="removeGoal(${g.id})" class="text-red-500 text-xs font-bold">×</button>
                            </div>
                            <p class="font-bold text-sm">${g.description}</p>
                            ${summary ? `<p class="text-xs text-slate-500 mt-1">${summary}</p>` : ''}
                            ${g.deadline ? `<p class="text-xs text-slate-400 mt-1">Target: ${new Date(g.deadline).toLocaleDateString()}</p>` : ''}
                        </div>`;
                }).join('');
            }
        }
    }

    function removeGoal(id) {
        state.userGoals = (state.userGoals || []).filter(g => g.id !== id);
        saveState();
        renderSettings();
    }

    // ==========================================================================
    // CARDIO MODAL
    // ==========================================================================

    function openCardioModal() {
        document.getElementById('cardio-modal').style.display = 'flex';
        document.getElementById('cardio-duration').value = '';
        document.getElementById('cardio-distance').value = '';
        document.getElementById('cardio-calories').value = '';
        document.getElementById('cardio-notes').value = '';
    }

    function closeCardioModal() {
        document.getElementById('cardio-modal').style.display = 'none';
    }

    function saveCardio() {
        const type = document.getElementById('cardio-type').value;
        const duration = parseInt(document.getElementById('cardio-duration').value);
        const distance = parseFloat(document.getElementById('cardio-distance').value) || 0;
        const calories = parseInt(document.getElementById('cardio-calories').value) || 0;
        const notes = document.getElementById('cardio-notes').value.trim();

        if (!duration || duration <= 0) { showToast('Enter duration'); return; }

        if (!state.cardioLogs) state.cardioLogs = [];
        state.cardioLogs.unshift({
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            type: type,
            duration: duration,
            distance: distance,
            calories: calories,
            notes: notes
        });
        saveState();
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
        lucide.createIcons();
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
        if (level !== 'Intermediate' && level !== 'Advanced') return null;

        const volume = getWeeklyVolume();
        const trained = Object.keys(volume);
        if (trained.length === 0) return null;

        // Find muscles below the minimum effective volume (12) and above the max (20)
        const under = trained.filter(m => volume[m] < 12).sort((a, b) => volume[a] - volume[b]);
        const over = trained.filter(m => volume[m] > 20).sort((a, b) => volume[b] - volume[a]);

        const fmt = (v) => Number.isInteger(v) ? v : v.toFixed(1);

        // Over-training (junk volume) is the higher priority warning
        if (over.length > 0) {
            const m = over[0];
            return { icon: 'alert-triangle', color: 'text-rose-500',
                title: 'Possible junk volume',
                text: `${m} is at ${fmt(volume[m])} sets in the last 7 days — above the ~20-set mark where extra volume tends to add fatigue without much extra growth. Consider trimming a little.`,
                detail: `You've done ${fmt(volume[m])} sets for ${m} in the last 7 days. Research on training volume suggests most muscle groups grow well on roughly 12–20 hard sets per week, and beyond about 20 the extra sets mostly add fatigue rather than more muscle — sometimes called "junk volume". Consider dropping ${m} back toward 15–18 quality sets, making sure each is close to failure, and redirecting that energy to a muscle that's under-trained or to better recovery. This isn't a hard rule — advanced lifters can sometimes handle more — but if progress has stalled or you feel run down, trimming here is a sensible first move.` };
        }

        // Under-training — only nag if they've done a fair amount of training already,
        // so we don't flag "Chest: 6 sets" early in the week.
        const totalSets = trained.reduce((s, m) => s + volume[m], 0);
        if (under.length > 0 && totalSets >= 10) {
            const m = under[0];
            const needed = fmt(12 - volume[m]);
            return { icon: 'plus-circle', color: 'text-indigo-500',
                title: 'Room to add volume',
                text: `${m} is at ${fmt(volume[m])} sets over the last 7 days — about ${needed} short of the 12-set minimum for growth. Add a set or two in your next session.`,
                detail: `Over the last 7 days you've done ${fmt(volume[m])} hard sets for ${m}. The evidence suggests most muscles need at least around 12 challenging sets per week to drive meaningful growth, and you're roughly ${needed} short of that. This doesn't mean you've done anything wrong — it may just be earlier in your week, or ${m} hasn't come up in your recent sessions. To close the gap, add a set or two of a ${m} exercise in your next relevant workout, or slot in a short accessory finisher. Aim to build toward the 12–20 set range across the week, keeping every set close to failure so it actually counts.` };
        }

        // Everything on target — give positive reinforcement naming the best-covered muscle
        const onTarget = trained.filter(m => volume[m] >= 12 && volume[m] <= 20);
        if (onTarget.length >= 2) {
            return { icon: 'check-circle', color: 'text-emerald-500',
                title: 'Volume in the sweet spot',
                text: `Volume looking good — ${onTarget.length} muscle groups in the 12-20 set sweet spot over the last 7 days.`,
                detail: `Nicely balanced week: ${onTarget.length} muscle groups are sitting in the 12–20 hard-sets range that research points to as the productive zone for growth — enough stimulus to grow, not so much that it just piles on fatigue. Keep doing what you're doing. The main thing now is progression: over the coming weeks, gradually add a little weight or a rep where you can, rather than simply adding more and more sets. Quality and consistency at this volume will take you further than chasing bigger numbers.` };
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
            lucide.createIcons();
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
        lucide.createIcons();
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
            lucide.createIcons();
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
        state.userProfile.yearsTraining = isNaN(yearsTraining) ? null : yearsTraining;
        state.userProfile.activityLevel = activityLevel;

        saveState();
        renderExperienceLevel();
        renderMaintenanceDisplay();
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
        lucide.createIcons();
    }

    function closeAboutYouModal() {
        document.getElementById('about-you-modal').style.display = 'none';
    }

    /**
     * Save handler for the About You modal — persist then close.
     */
    function saveAboutYou() {
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
     * <1 year = Beginner, 1-3 = Intermediate, 3+ = Advanced.
     */
    function getExperienceLevel() {
        const yrs = state.userProfile && state.userProfile.yearsTraining;
        if (yrs === null || yrs === undefined || isNaN(yrs)) return null;
        if (yrs < 1) return 'Beginner';
        if (yrs < 3) return 'Intermediate';
        return 'Advanced';
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
    // MAINTENANCE CALORIES (Mifflin-St Jeor) + BMI
    // ==========================================================================

    const ACTIVITY_MULTIPLIERS = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9
    };

    /**
     * Calculate maintenance (TDEE) from profile.
     * Returns null if any required field is missing.
     * Uses the user's most recent recorded weight from metricsHistory.
     */
    function calculateMaintenanceCalories() {
        const p = state.userProfile || {};
        if (!p.gender || !p.age || !p.heightCm || !p.activityLevel) return null;

        const latestWeight = getLatestWeightKg();
        if (!latestWeight) return null;

        const bmr = getBMR();
        if (!bmr) return null;

        const multiplier = ACTIVITY_MULTIPLIERS[p.activityLevel] || 1.2;
        return Math.round(bmr * multiplier);
    }

    // Mifflin-St Jeor BMR (before activity). This is the floor calories should
    // not drop below, so we expose it separately for the goal safety check.
    function getBMR() {
        const p = state.userProfile || {};
        const w = getLatestWeightKg();
        if (!p.gender || !p.age || !p.heightCm || !w) return null;
        if (p.gender === 'male') {
            return Math.round(10 * w + 6.25 * p.heightCm - 5 * p.age + 5);
        }
        return Math.round(10 * w + 6.25 * p.heightCm - 5 * p.age - 161);
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

        const maintenance = calculateMaintenanceCalories();
        const bmr = getBMR();

        // Can't calculate without the profile + weight
        if (!maintenance || !bmr || !g.mode) {
            result.classList.add('hidden');
            if (warning) warning.classList.add('hidden');
            if (applyBtn) applyBtn.classList.add('hidden');
            return;
        }

        let target, note = '';

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
            target = maintenance - dailyDeficit;
            const unitLabel = g.rateUnit === 'kg' ? 'kg' : 'lbs';
            note = `Maintenance (${maintenance.toLocaleString()}) − ${dailyDeficit.toLocaleString()} deficit to lose ~${rate}${unitLabel}/week.`;
        }

        // Show the result
        result.classList.remove('hidden');
        document.getElementById('goal-target-cals').textContent = target.toLocaleString();
        document.getElementById('goal-target-note').textContent = note;

        // SAFETY: stop if the target drops below BMR
        if (g.mode === 'lose' && target < bmr) {
            warning.classList.remove('hidden');
            document.getElementById('goal-bmr-text').innerHTML =
                `Eating <b>${target.toLocaleString()} kcal</b> is under your BMR of <b>${bmr.toLocaleString()} kcal</b> — the energy your body needs at rest just to keep organs working. Eating below this is not recommended: it can cost you muscle, slow your metabolism, and harm your health. ` +
                `Aim for a <b>500–1000 kcal/day</b> deficit at most — try a slower rate. Your lowest sensible target is around your maintenance minus 1000 (${Math.max(bmr, maintenance - 1000).toLocaleString()} kcal).`;
            // Block applying an unsafe target
            if (applyBtn) applyBtn.classList.add('hidden');
        } else {
            if (warning) warning.classList.add('hidden');
            if (applyBtn) applyBtn.classList.remove('hidden');
            window._pendingGoalTarget = target;
        }
    }

    function applyGoalCalories() {
        const target = window._pendingGoalTarget;
        if (!target) return;
        state.goals.calories = target;
        saveState();
        // Reflect in the calorie goal input + maintenance note
        const input = document.getElementById('calorie-goal-input');
        if (input) input.value = target;
        renderMaintenanceDisplay();
        showToast(`Calorie goal set to ${target.toLocaleString()} kcal 🎯`);
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

        const maintenance = calculateMaintenanceCalories();
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
                `Based on ${weight}kg, ${p.heightCm}cm, ${p.age}y, ${p.gender}, ${p.activityLevel.replace('_', ' ')} activity.`;
        } else {
            document.getElementById('maintenance-value').textContent = '--';
            document.getElementById('maintenance-explanation').textContent =
                'Fill in all About You fields + log a weight in Metrics to calculate.';
        }

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

        state.goals.calories = target;
        saveState();
        document.getElementById('calorie-goal-input').value = target;

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
                    return {
                        target: maintenance - deficit,
                        note: `Capped at ${maxDeficit} kcal/day deficit for safety — your timeframe may need to be longer.`
                    };
                }
                return {
                    target: maintenance - deficit,
                    note: `Deficit: ${deficit} kcal/day for ${kg}kg in ${weeks}w → ${maintenance - deficit} kcal target.`
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

    function openGoalSetting() {
        currentGoalFocus = null;
        document.getElementById('goal-description').value = '';
        document.getElementById('goal-deadline').value = '';

        // Reset focus buttons
        ['weight_loss', 'muscle_gain', 'health'].forEach(f => {
            const btn = document.getElementById('focus-' + f);
            if (btn) btn.className = 'p-3 rounded-xl font-bold text-xs bg-slate-100 text-slate-600 hover:bg-slate-200';
            const fields = document.getElementById('focus-fields-' + f);
            if (fields) fields.classList.add('hidden');
        });

        // Reset all follow-up fields
        ['wl-kg', 'wl-weeks', 'wl-style', 'wl-photos',
         'mg-priority', 'mg-physique',
         'h-area', 'h-reason'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        document.getElementById('goal-recommendation').classList.add('hidden');
        document.getElementById('goal-modal').style.display = 'flex';
    }

    function closeGoalModal() {
        document.getElementById('goal-modal').style.display = 'none';
    }

    function setGoalFocus(focus) {
        currentGoalFocus = focus;

        // Update button styles
        ['weight_loss', 'muscle_gain', 'health'].forEach(f => {
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
         'mg-priority', 'mg-physique',
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
                priority: document.getElementById('mg-priority').value || '',
                physique: document.getElementById('mg-physique').value || '',
                experience: getExperienceLevel() || 'Unknown'
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
                    Beginner: 'Focus on compound lifts (squat, bench, deadlift, row, OHP) 3×/week. Beginner gains are real — use them.',
                    Intermediate: 'Run a structured 4-5 day split. Track progressive overload week by week.',
                    Advanced: 'Specialization phases and periodization matter more than total volume now.'
                };
                lines.push('🎓 <b>' + details.experience + ':</b> ' + tips[details.experience]);
            }
            if (details.priority) {
                lines.push(`🎯 Prioritizing: ${details.priority}. Add 1-2 extra direct sets per week.`);
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

        const desc = document.getElementById('goal-description').value.trim();
        const deadline = document.getElementById('goal-deadline').value;
        if (!desc) { showToast('Enter goal description'); return; }

        if (!state.userGoals) state.userGoals = [];
        const newGoal = {
            id: Date.now(),
            focus: currentGoalFocus,
            details: collectGoalDetails(),
            description: desc,
            deadline: deadline,
            createdAt: new Date().toISOString(),
            completed: false
        };
        state.userGoals.unshift(newGoal);

        // Auto-adjust calorie goal if we have enough info
        const maintenance = calculateMaintenanceCalories();
        if (maintenance && (currentGoalFocus === 'weight_loss' || currentGoalFocus === 'muscle_gain')) {
            const adj = calculateGoalCalorieAdjustment(newGoal, maintenance);
            state.goals.calories = adj.target;
            showToast('Goal saved! Calorie target → ' + adj.target);
        } else {
            showToast('Goal added! 🎯');
        }

        saveState();
        closeGoalModal();
        renderSettings();
        renderDashboard();
    }

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    document.addEventListener('DOMContentLoaded', () => {
        // Set today as default for date pickers
        const today = new Date().toISOString().split('T')[0];

        const workoutPicker = document.getElementById('workout-date-picker');
        if (workoutPicker) workoutPicker.value = today;
        window.selectedWorkoutDate = today;

        const nutritionPicker = document.getElementById('nutrition-date-picker');
        if (nutritionPicker) nutritionPicker.value = today;

        const metricsPicker = document.getElementById('metrics-date-picker');
        if (metricsPicker) metricsPicker.value = today;

        // Wire up the food search input listener. Without this, typing in the
        // food search box does nothing because no input handler is attached.
        setupFoodSearch();

        // Make sure the Gym/Home tabs match the saved environment on load.
        renderWorkoutEnvTabs();

        // ---- ACTIVE WORKOUT PERSISTENCE HOOKS ----
        // Save the in-progress workout whenever the user types in it (debounced),
        // so a refresh or accidental close never loses reps/weights.
        let workoutPersistTimer = null;
        const exListEl = document.getElementById('exercise-list');
        if (exListEl) {
            const schedulePersist = () => {
                clearTimeout(workoutPersistTimer);
                workoutPersistTimer = setTimeout(persistActiveWorkout, 400);
            };
            exListEl.addEventListener('input', schedulePersist);
            exListEl.addEventListener('change', schedulePersist);
        }

        // When the page is hidden or about to unload, bank the running timer
        // segment (Option 2: clock freezes while away) and persist immediately.
        function bankAndPersist() {
            const activeEl = document.getElementById('workout-active');
            if (activeEl && !activeEl.classList.contains('hidden')) {
                if (workoutStartTime) {
                    workoutAccumulatedSeconds += Math.floor((Date.now() - workoutStartTime) / 1000);
                    workoutStartTime = Date.now();
                }
                persistActiveWorkout();
            }
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') bankAndPersist();
            else if (document.visibilityState === 'visible') {
                // Resume: restart the segment clock without counting the away time
                const activeEl = document.getElementById('workout-active');
                if (activeEl && !activeEl.classList.contains('hidden')) {
                    workoutStartTime = Date.now();
                    updateWorkoutTimer();
                }
            }
        });
        window.addEventListener('beforeunload', bankAndPersist);

        // ---- REFRESH / CLOSE WARNING ----
        // The browser only permits its own native dialog here (a custom modal can't
        // block an unload), so we trigger that. It gives the user a Leave/Cancel
        // choice before a refresh or tab-close can throw the workout away.
        window.addEventListener('beforeunload', (e) => {
            if (workoutInProgress()) {
                bankAndPersist();          // save first, so even if they leave, it's recoverable
                e.preventDefault();
                e.returnValue = '';        // required for the native prompt to show
                return '';
            }
        });

        // ---- BACK-BUTTON / SWIPE-BACK GUARD ----
        // Catch an accidental browser Back while a workout is open and show our own
        // "Go Back / Continue & Discard" modal instead of silently leaving.
        window.addEventListener('popstate', () => {
            if (workoutInProgress()) {
                // Immediately re-push so we stay on the page while we ask
                history.pushState({ workout: true }, '');
                guardWorkoutLoss(() => {
                    discardWorkoutNow();
                    history.back(); // they chose to leave — let the back actually happen
                }, 'Going back will discard the workout you have in progress and everything you\'ve logged.');
            }
        });

        // If a workout was in progress last time, drop straight back into it.
        restoreActiveWorkout();

        lucide.createIcons();
    });
