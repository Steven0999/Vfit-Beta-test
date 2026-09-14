    // ========================================================================
    // IN-APP BETA FEEDBACK + PRODUCTION READINESS
    // ========================================================================
    let betaFeedbackScreenshot = '';

    function currentVfitScreen() {
        const tab = document.querySelector('.tab-content.active');
        const parts = [tab && tab.id || 'unknown'];
        if (parts[0] === 'settings' && activeSettingsPage !== 'home') parts.push(activeSettingsPage);
        if (activeSettingsPage === 'coaching' && activeCoachingPage !== 'home') parts.push(activeCoachingPage);
        return parts.join('/');
    }

    function betaFeedbackDiagnostics() {
        return {
            appVersion: VFIT_APP_VERSION,
            schemaVersion: VFIT_STATE_SCHEMA_VERSION,
            screen: currentVfitScreen(),
            online: Boolean(navigator.onLine),
            installed: Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone),
            viewport: `${Math.round(window.innerWidth || 0)}x${Math.round(window.innerHeight || 0)}`,
            device: String(navigator.userAgent || 'Unavailable').slice(0, 240),
            cloudSyncPending: Boolean(cloudDirty),
            cloudSyncError: Boolean(cloudSyncError),
            lastCloudSyncAt: state.meta && state.meta.lastCloudSyncAt || ''
        };
    }

    function productionReadinessChecks() {
        return [
            { label: 'Expanded progress-photo storage', ready: Boolean(window.indexedDB), action: 'Available in this browser' },
            { label: 'Offline service worker', ready: Boolean('serviceWorker' in navigator), action: 'Available on the published HTTPS site' },
            { label: 'Firebase App Check', ready: Boolean(appCheckReady), action: appCheckReady ? 'Active' : 'Add the reCAPTCHA Enterprise site key in vfit-config.js' },
            { label: 'Android push notifications', ready: Boolean(RUNTIME_CONFIG.pushEnabled && RUNTIME_CONFIG.fcmVapidKey), action: RUNTIME_CONFIG.pushEnabled ? 'Configured' : 'Add the FCM VAPID key and enable push' },
            { label: 'Secure server account deletion', ready: Boolean(appCheckReady && functionsApi), action: appCheckReady && functionsApi ? 'Client is ready' : 'Deploy Functions and enforce App Check' }
        ];
    }

    function ensureBetaFeedbackSettings() {
        const menu = document.querySelector('#settings-menu [aria-label="Preferences and goals sections"]');
        if (menu && !document.getElementById('settings-feedback-entry')) {
            menu.insertAdjacentHTML('beforeend', `
                <button id="settings-feedback-entry" type="button" onclick="openSettingsPage('feedback')" class="w-full min-h-[82px] bg-violet-50 border-2 border-violet-200 p-4 rounded-2xl flex items-center justify-between gap-3 active:scale-[0.98]">
                    <span class="flex items-center gap-3 text-left"><span class="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center flex-shrink-0"><i data-lucide="message-square-plus" class="w-6 h-6 text-white"></i></span><span><span class="block font-black text-sm text-slate-900">Beta Feedback</span><span class="block text-xs text-slate-500 mt-1">Report a bug or suggest an improvement</span></span></span>
                    <i data-lucide="chevron-right" class="w-5 h-5 text-slate-400 flex-shrink-0"></i>
                </button>`);
        }
        const contentCard = document.getElementById('settings-content-card');
        if (contentCard && !document.getElementById('beta-feedback-settings')) {
            const panel = document.createElement('div');
            panel.id = 'beta-feedback-settings';
            panel.dataset.settingsPage = 'feedback';
            panel.className = 'hidden';
            panel.setAttribute('aria-hidden', 'true');
            const saveButton = document.getElementById('settings-save-button');
            if (saveButton && saveButton.parentElement === contentCard) {
                contentCard.insertBefore(panel, saveButton);
            } else {
                contentCard.appendChild(panel);
            }
        }
        return document.getElementById('beta-feedback-settings');
    }

    function renderProductionReadinessHTML() {
        const checks = productionReadinessChecks();
        const ready = checks.filter(item => item.ready).length;
        return `<section class="mt-6 border-t border-slate-200 pt-5"><div class="flex items-center justify-between gap-3"><div><h3 class="font-black">Launch Readiness</h3><p class="text-[11px] text-slate-500">${ready}/${checks.length} checks ready in this build</p></div><span class="text-xs font-black px-3 py-2 rounded-full ${ready === checks.length ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${ready === checks.length ? 'READY' : 'SETUP NEEDED'}</span></div><div class="space-y-2 mt-3">${checks.map(item => `<div class="flex items-start gap-3 p-3 bg-slate-50 rounded-xl"><span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${item.ready ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-slate-900'}">${item.ready ? '✓' : '!'}</span><div><p class="font-bold text-xs">${escapeHtml(item.label)}</p><p class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(item.action)}</p></div></div>`).join('')}</div><p class="text-[10px] text-slate-400 mt-3">App Check, push and server deletion need real Firebase project keys and a deployed backend; this screen never pretends they are active before that setup is complete.</p></section>`;
    }

    function renderBetaFeedbackPanel() {
        const panel = ensureBetaFeedbackSettings();
        if (!panel) return;
        const diagnostics = betaFeedbackDiagnostics();
        panel.innerHTML = `
            <div>
                <p class="text-[10px] font-black uppercase text-violet-600">VFIT ${escapeHtml(VFIT_APP_VERSION)}</p>
                <h3 class="text-xl font-black mt-1">Send Beta Feedback</h3>
                <p class="text-xs text-slate-500 mt-1">Tell us what happened or what would make VFIT better. Diagnostics include app/device status only — never workouts, meals, health answers or photos.</p>
            </div>
            <form onsubmit="event.preventDefault(); submitBetaFeedback();" class="space-y-4 mt-5">
                <fieldset><legend class="text-xs font-black mb-2">Feedback type</legend><div class="grid grid-cols-2 gap-2"><label class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold"><input type="radio" name="beta-feedback-type" value="bug" checked class="mr-2 accent-violet-600">Bug / problem</label><label class="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold"><input type="radio" name="beta-feedback-type" value="improvement" class="mr-2 accent-violet-600">Improvement / idea</label></div></fieldset>
                <label class="block text-xs font-black">Short title<input id="beta-feedback-title" maxlength="120" required class="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium" placeholder="What went wrong or could improve?"></label>
                <label class="block text-xs font-black">Details<textarea id="beta-feedback-details" maxlength="3000" required rows="5" class="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium" placeholder="What did you expect, and what actually happened?"></textarea></label>
                <label class="block text-xs font-black">Steps to repeat it <span class="font-normal text-slate-400">(optional)</span><textarea id="beta-feedback-steps" maxlength="1500" rows="3" class="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium" placeholder="1. Opened… 2. Tapped… 3. Saw…"></textarea></label>
                <div class="border border-dashed border-slate-300 rounded-xl p-3"><div class="flex items-center justify-between gap-3"><div><p class="text-xs font-black">Screenshot (optional)</p><p class="text-[10px] text-slate-400">Compressed before sending; do not include private health information.</p></div><button type="button" onclick="document.getElementById('beta-feedback-screenshot').click()" class="bg-slate-100 px-3 py-2 rounded-lg text-[10px] font-black">Choose</button></div><input id="beta-feedback-screenshot" type="file" accept="image/*" class="hidden" onchange="prepareBetaFeedbackScreenshot(event)"><div id="beta-feedback-screenshot-preview" class="hidden mt-3"></div></div>
                <details class="bg-slate-50 rounded-xl p-3"><summary class="text-xs font-black cursor-pointer">Safe diagnostics included</summary><pre class="text-[9px] text-slate-500 whitespace-pre-wrap break-words mt-2">${escapeHtml(JSON.stringify(diagnostics, null, 2))}</pre></details>
                <button id="beta-feedback-submit" type="submit" class="w-full bg-violet-600 text-white p-4 rounded-2xl font-black">Send Feedback</button>
            </form>
            <div id="beta-feedback-inbox"></div>
            ${renderProductionReadinessHTML()}`;
        if (isOwner()) loadBetaFeedbackInbox();
        ensureAccessibleDom(panel);
        refreshIcons();
    }

    async function prepareBetaFeedbackScreenshot(event) {
        const input = event && event.target;
        const file = input && input.files && input.files[0];
        if (!file) return;
        try {
            if (!String(file.type || '').startsWith('image/')) throw new Error('Choose an image file');
            if (file.size > 15 * 1024 * 1024) throw new Error('Screenshot is larger than 15 MB');
            betaFeedbackScreenshot = await compressImage(file, 1280, 480000);
            const preview = document.getElementById('beta-feedback-screenshot-preview');
            if (preview) {
                preview.classList.remove('hidden');
                preview.innerHTML = `<div class="flex items-start gap-3"><img src="${escapeHtml(betaFeedbackScreenshot)}" alt="Feedback screenshot preview" class="w-24 h-24 object-cover rounded-xl border border-slate-200"><div><p class="text-xs font-bold">Screenshot ready</p><button type="button" onclick="clearBetaFeedbackScreenshot()" class="text-[10px] text-rose-600 font-black mt-2">Remove</button></div></div>`;
            }
        } catch (error) {
            betaFeedbackScreenshot = '';
            showToast(error.message || 'Could not prepare that screenshot', 5000);
        } finally {
            if (input) input.value = '';
        }
    }

    function clearBetaFeedbackScreenshot() {
        betaFeedbackScreenshot = '';
        const preview = document.getElementById('beta-feedback-screenshot-preview');
        if (preview) { preview.classList.add('hidden'); preview.innerHTML = ''; }
    }

    async function submitBetaFeedback() {
        if (!currentUser) { showToast('Sign in before sending feedback'); return; }
        const selectedType = document.querySelector('input[name="beta-feedback-type"]:checked');
        const type = selectedType && selectedType.value === 'improvement' ? 'improvement' : 'bug';
        const title = String(document.getElementById('beta-feedback-title')?.value || '').trim().slice(0, 120);
        const details = String(document.getElementById('beta-feedback-details')?.value || '').trim().slice(0, 3000);
        const steps = String(document.getElementById('beta-feedback-steps')?.value || '').trim().slice(0, 1500);
        if (title.length < 3 || details.length < 5) { showToast('Add a short title and a little more detail'); return; }
        const button = document.getElementById('beta-feedback-submit');
        if (button) { button.disabled = true; button.textContent = 'Sending…'; }
        const now = new Date().toISOString();
        try {
            await db.collection('feedback').add({
                uid: currentUser.uid,
                email: String(currentUser.email || '').slice(0, 254),
                type, title, details, steps,
                screenshot: betaFeedbackScreenshot,
                diagnostics: betaFeedbackDiagnostics(),
                status: 'new', adminNote: '', createdAt: now, updatedAt: now
            });
            betaFeedbackScreenshot = '';
            renderBetaFeedbackPanel();
            showToast('Thank you — beta feedback sent ✓', 5000);
        } catch (error) {
            console.error('Beta feedback failed:', error);
            showToast('Feedback could not be sent yet — your text is still here', 6000);
            if (button) { button.disabled = false; button.textContent = 'Send Feedback'; }
        }
    }

    async function loadBetaFeedbackInbox() {
        const inbox = document.getElementById('beta-feedback-inbox');
        if (!inbox || !isOwner()) return;
        inbox.innerHTML = '<p class="text-xs text-slate-400 mt-5">Loading owner feedback inbox…</p>';
        try {
            const snapshot = await db.collection('feedback').orderBy('createdAt', 'desc').limit(50).get();
            const records = snapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
            inbox.innerHTML = `<section class="mt-6 border-t border-slate-200 pt-5"><div class="flex items-center justify-between"><h3 class="font-black">Owner Feedback Inbox</h3><span class="text-xs font-black text-violet-600">${records.length}</span></div><div class="space-y-3 mt-3">${records.length ? records.map(record => betaFeedbackInboxCardHTML(record)).join('') : '<p class="text-xs text-slate-400 py-4">No feedback received yet.</p>'}</div></section>`;
            ensureAccessibleDom(inbox);
        } catch (error) {
            console.warn('Feedback inbox unavailable:', error);
            inbox.innerHTML = '<p class="text-xs text-rose-600 mt-5">Owner inbox could not load. Deploy the updated Firestore rules first.</p>';
        }
    }

    function betaFeedbackInboxCardHTML(record) {
        const id = escapeJsString(record.id);
        const screenshot = safeImageUrl(record.screenshot);
        return `<article class="border border-slate-200 rounded-2xl p-3"><div class="flex items-start justify-between gap-2"><div><span class="text-[9px] font-black uppercase ${record.type === 'bug' ? 'text-rose-600' : 'text-indigo-600'}">${escapeHtml(record.type || 'feedback')}</span><h4 class="font-black text-sm mt-1">${escapeHtml(record.title || 'Untitled')}</h4><p class="text-[10px] text-slate-400 mt-1">${escapeHtml(record.email || '')} · ${escapeHtml(record.createdAt ? new Date(record.createdAt).toLocaleString('en-GB') : '')}</p></div><select id="feedback-status-${id}" onchange="updateBetaFeedback('${id}')" class="bg-slate-50 p-2 rounded-lg text-[10px] font-black"><option value="new" ${record.status === 'new' ? 'selected' : ''}>New</option><option value="reviewing" ${record.status === 'reviewing' ? 'selected' : ''}>Reviewing</option><option value="planned" ${record.status === 'planned' ? 'selected' : ''}>Planned</option><option value="resolved" ${record.status === 'resolved' ? 'selected' : ''}>Resolved</option></select></div><p class="text-xs text-slate-600 whitespace-pre-wrap mt-3">${escapeHtml(record.details || '')}</p>${record.steps ? `<p class="text-[10px] text-slate-500 whitespace-pre-wrap mt-2"><b>Steps:</b> ${escapeHtml(record.steps)}</p>` : ''}${screenshot ? `<img src="${escapeHtml(screenshot)}" alt="Submitted feedback screenshot" class="mt-3 max-h-52 rounded-xl border border-slate-200 object-contain">` : ''}<label class="block text-[10px] font-black mt-3">Private owner note<textarea id="feedback-note-${id}" maxlength="1000" rows="2" class="w-full mt-1 bg-slate-50 p-2 rounded-lg text-xs">${escapeHtml(record.adminNote || '')}</textarea></label><button onclick="updateBetaFeedback('${id}')" class="mt-2 bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-black">Save status &amp; note</button></article>`;
    }

    async function updateBetaFeedback(feedbackId) {
        if (!isOwner()) return;
        const status = String(document.getElementById('feedback-status-' + feedbackId)?.value || 'new');
        const adminNote = String(document.getElementById('feedback-note-' + feedbackId)?.value || '').trim().slice(0, 1000);
        if (!['new', 'reviewing', 'planned', 'resolved'].includes(status)) return;
        try {
            await db.collection('feedback').doc(feedbackId).update({ status, adminNote, updatedAt: new Date().toISOString() });
            showToast('Feedback status saved');
        } catch (error) {
            console.error('Feedback update failed:', error);
            showToast('Feedback status could not be saved');
        }
    }

    const openSettingsPageWithoutBetaFeedback = openSettingsPage;
    openSettingsPage = function openSettingsPageWithBetaFeedback(pageId, options) {
        ensureBetaFeedbackSettings();
        const result = openSettingsPageWithoutBetaFeedback.apply(this, arguments);
        if (String(pageId) === 'feedback') renderBetaFeedbackPanel();
        return result;
    };

    document.addEventListener('DOMContentLoaded', ensureBetaFeedbackSettings);
