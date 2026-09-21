    // ==========================================================================
    // AUTH STATE OBSERVER
    // ==========================================================================

    auth.onAuthStateChanged(async (user) => {
        const sessionGeneration = ++authSessionGeneration;
        const authScreen = document.getElementById('auth-screen');
        const appScreen = document.getElementById('app-screen');

        if (!user) {
            if (typeof teardownDailyReadinessPrompt === 'function') teardownDailyReadinessPrompt();
            stopSharedFoodDatabaseSync();
            currentUser = null;
            firebaseUserData = {};
            currentUserRole = 'member';
            currentUserIsOwner = false;
            currentUserCanManageFoodDatabase = false;
            accountMembership = { tier: 'free', status: 'inactive' };
            viewingClientData = null;
            cloudDirty = false;
            cloudSyncError = null;
            clearTimeout(cloudSyncTimer);
            clearTimeout(exercisePrefsSyncTimer);
            clearTimeout(midnightSaveTimeout);
            clearInterval(midnightCheckInterval);
            clearInterval(window._notifPoll);
            clearInterval(workoutTimer);
            if (barcodeScannerEngine || nativeBarcodeStream || html5QrCode || quaggaDetectedHandler) closeBarcodeScanner();
            document.body.classList.remove('is-coach');
            state = normalizeState(DEFAULT_STATE);
            if (authScreen) authScreen.style.display = 'flex';
            if (appScreen) appScreen.style.display = 'none';
            updateDataSyncStatus();
            refreshIcons();
            return;
        }

        stopSharedFoodDatabaseSync();
        currentUser = user;
        currentUserIsOwner = false;
        currentUserCanManageFoodDatabase = false;
        if (authScreen) authScreen.style.display = 'none';
        // Keep the application hidden until device and cloud data are reconciled.
        // That prevents a blank/default dashboard flashing and then overwriting
        // a returning user's cloud snapshot.
        if (appScreen) appScreen.style.display = 'none';
        loadState(user.uid);
        await resolveOwnerAccess(user);
        if (sessionGeneration !== authSessionGeneration || !currentUser || currentUser.uid !== user.uid) return;
        await loadFirebaseUserData();
        if (sessionGeneration !== authSessionGeneration || !currentUser || currentUser.uid !== user.uid) return;
        await resolveFoodDatabaseAccess(user);
        if (sessionGeneration !== authSessionGeneration || !currentUser || currentUser.uid !== user.uid) return;
        await loadSharedFoodDatabase();
        if (sessionGeneration !== authSessionGeneration || !currentUser || currentUser.uid !== user.uid) return;

        // A saved snapshot may contain whichever historical day the member last
        // viewed. Reset only the active page dates after device/cloud data has
        // finished merging, so new nutrition, metrics and training entries open
        // on the device's real local day. Historical records remain untouched.
        resetActiveDatesToToday({ preserveActiveWorkout: true });
        saveState({ uid: user.uid, skipCloud: true, preserveUpdatedAt: true });

        document.body.classList.toggle('is-coach', currentUserRole === 'coach');
        const coachView = document.getElementById('coach-view');
        if (coachView) coachView.style.display = 'none';
        const main = document.querySelector('main');
        if (main) main.style.display = '';

        const emailEl = document.getElementById('status-date');
        if (emailEl) emailEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric'
        });
        const sidebarEmail = document.getElementById('sidebar-user-email');
        if (sidebarEmail) sidebarEmail.textContent = user.email || '';

        setupMidnightCheck();
        setupMidnightSave();
        setupFoodSearch();
        setupMealIngredientSearch();
        safeInvoke('Nutrition history', renderNutritionHistory);
        safeInvoke('Profile', renderProfile);
        safeInvoke('Dashboard', renderDashboard);
        safeInvoke('Coaching hub', renderCoachingHub);
        safeInvoke('Membership return', showMembershipReturnStatus);
        safeInvoke('Diary', renderDiary);
        safeInvoke('Settings', renderSettings);
        safeInvoke('Member coach section', renderMemberCoachSection);
        safeInvoke('Owner admin', renderOwnerAdmin);
        safeInvoke('Coach menu', renderCoachMenuEntry);
        safeInvoke('Workout environment', renderWorkoutEnvTabs);
        safeInvoke('Reminder status', updateRemindersStatus);

        if (appScreen) appScreen.style.display = 'block';
        const restoredWorkout = safeInvoke('Workout restore', restoreActiveWorkout) === true;
        if (!restoredWorkout) {
            let rememberedTab = '';
            try { rememberedTab = sessionStorage.getItem('vfit_active_tab') || ''; } catch (error) {}
            const shortcutTab = window.location.hash.replace(/^#/, '');
            const initialTab = VALID_TAB_IDS.has(shortcutTab)
                ? shortcutTab
                : (VALID_TAB_IDS.has(rememberedTab) ? rememberedTab : 'dashboard');
            switchTab(initialTab, { scroll: false });
        }

        refreshNotifBadge();
        restorePushRegistration();
        clearInterval(window._notifPoll);
        window._notifPoll = setInterval(refreshNotifBadge, 60000);
        setTimeout(() => { try { maybeShowUpdateAlerts(); } catch (error) {} }, 900);
        if (typeof setupDailyReadinessPrompt === 'function') setupDailyReadinessPrompt();
        scheduleCloudSnapshotSync(500);
        ensureAccessibleDom(document);
        refreshIcons();
    });


    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    document.addEventListener('DOMContentLoaded', () => {
        registerVfitServiceWorker();
        mountCoachingHubInSettings();
        updateNetworkStatus(false);
        updateInstallButton();
        ensureAccessibleDom(document);
        const accessibilityObserver = new MutationObserver(mutations => {
            if (mutations.some(mutation => mutation.addedNodes.length > 0)) scheduleAccessibleDomRefresh();
        });
        accessibilityObserver.observe(document.body, { childList: true, subtree: true });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('translate-x-0')) {
                toggleSidebar(false);
                return;
            }
            const scanner = document.getElementById('barcode-scanner-modal');
            if (scanner && scanner.style.display === 'flex') {
                closeBarcodeScanner();
                return;
            }
            // Close the top-most visible dialog through its own close control so
            // any modal-specific cleanup still runs. This also gives keyboard and
            // Android hardware-keyboard users a consistent escape route.
            const openModal = Array.from(document.querySelectorAll('.modal-overlay')).reverse()
                .find(modal => window.getComputedStyle(modal).display !== 'none');
            if (openModal) {
                const closeControl = openModal.querySelector(
                    'button[aria-label^="Close"], button[onclick^="close"], button[onclick^="cancel"]'
                );
                if (closeControl) closeControl.click();
                else openModal.style.display = 'none';
            }
        });

        // Prime all date-led pages with the device's current local day. The auth
        // flow repeats this after saved device/cloud data has finished loading.
        resetActiveDatesToToday({ preserveActiveWorkout: true, clearMetricDraft: false });

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

        // Persist the absolute start time whenever the page is hidden. The
        // interval can stop to save battery because elapsed time is recalculated
        // from that timestamp when the app becomes visible again.
        function bankAndPersist() {
            const activeEl = document.getElementById('workout-active');
            if (activeEl && !activeEl.classList.contains('hidden')) {
                persistActiveWorkout();
            }
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                bankAndPersist();
                clearInterval(workoutTimer);
                workoutTimer = null;
                const scannerModal = document.getElementById('barcode-scanner-modal');
                // A file/camera picker briefly hides the page on Android. Keep
                // that scanner session alive so its selected photo can be decoded.
                const scannerIsVisible = barcodeScannerEmbedded || (scannerModal && scannerModal.style.display === 'flex');
                if (scannerIsVisible && !barcodeImagePickerOpen) {
                    closeBarcodeScanner();
                }
            }
            else if (document.visibilityState === 'visible') {
                if (currentUser) rollVfitToCurrentDayIfNeeded();
                if (barcodeImagePickerOpen) {
                    // Older WebViews do not always emit the file-input `cancel`
                    // event. Detect a return with no selected file and restore the
                    // live scanner instead of leaving a black camera surface.
                    setTimeout(() => {
                        const imageInput = document.getElementById('barcode-image-input');
                        if (barcodeImagePickerOpen && !(imageInput && imageInput.files && imageInput.files.length)) {
                            cancelBarcodeImagePicker().catch(error => console.warn('Scanner restart failed:', error));
                        }
                    }, 800);
                }
                // Resume display updates; the away time is already included by
                // currentWorkoutElapsed() because workoutStartTime never changed.
                const activeEl = document.getElementById('workout-active');
                if (activeEl && !activeEl.classList.contains('hidden')) {
                    startWorkoutTimer();
                }
            }
        });
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

        // The auth observer restores an in-progress workout only after this
        // account's local and cloud data have been reconciled.

        refreshIcons();
    });
