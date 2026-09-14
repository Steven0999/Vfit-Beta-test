    // ========================================================================
    // COACH-CREATED SEVEN-DAY TRAINING + MEAL PLAN
    // ========================================================================
    let coachPlanDraft = null;

    function coachPlanDocumentId(coachUid, memberUid, weekStart) {
        return `${String(coachUid || '').replace(/[^A-Za-z0-9_-]/g, '')}_${String(memberUid || '').replace(/[^A-Za-z0-9_-]/g, '')}_${plannerWeekStart(weekStart)}`;
    }

    function coachPlanShiftForDate(snapshot, dateKey) {
        const profile = isPlainRecord(snapshot && snapshot.shiftProfile) ? snapshot.shiftProfile : {};
        const rota = isPlainRecord(profile.rota) ? profile.rota : {};
        if (isPlainRecord(rota[dateKey])) {
            const type = rota[dateKey].type;
            return ['night', 'early', 'day'].includes(type) ? type : 'off';
        }
        if (!profile.enabled) return 'off';
        const day = plannerDate(dateKey).getDay();
        if (!Array.isArray(profile.workDays) || !profile.workDays.includes(day)) return 'off';
        return ({ nights: 'night', days: 'day', earlies: 'early', rotating: 'night' })[profile.shiftType] || 'day';
    }

    function coachPlanDietaryProfile(snapshot) {
        const source = isPlainRecord(snapshot && snapshot.dietaryProfile) ? snapshot.dietaryProfile : {};
        return {
            completed: Boolean(source.completed),
            pattern: ['balanced', 'vegan', 'vegetarian', 'ketogenic'].includes(source.pattern) ? source.pattern : 'balanced',
            approaches: Array.isArray(source.approaches) ? source.approaches.filter(value => DIETARY_APPROACH_LABELS[value]) : [],
            requirements: Array.isArray(source.requirements) ? source.requirements.filter(value => DIETARY_REQUIREMENT_LABELS[value]) : [],
            notes: String(source.notes || '').slice(0, 750)
        };
    }

    function coachPlanMealIdeas(snapshot, dateKey, mealType) {
        const profile = coachPlanDietaryProfile(snapshot);
        const shiftType = coachPlanShiftForDate(snapshot, dateKey);
        let ideas;
        if (profile.completed && profile.pattern !== 'balanced') {
            ideas = (((DIETARY_MEAL_IDEAS[profile.pattern] || {})[mealType]) || []).slice();
        } else {
            const base = (((SHIFT_MEAL_IDEAS[shiftType] || SHIFT_MEAL_IDEAS.off)[mealType]) || []).slice();
            const extra = DIETARY_MEAL_IDEAS.vegan[mealType] && DIETARY_MEAL_IDEAS.vegan[mealType][0];
            ideas = base.concat(extra ? [extra] : []);
        }
        ideas = ideas.filter(idea => mealMatchesDietaryRequirements(idea, profile));
        if (profile.approaches.includes('calorie_deficit')) ideas = ideas.map(calorieDeficitPortion).sort((a, b) => a.calories - b.calories);
        return ideas;
    }

    function coachPlanTrainingSuggestion(shiftType) {
        return ({
            night: 'Recovery / mobility',
            early: 'Full body strength',
            day: 'Upper body strength',
            off: 'Lower body strength'
        })[shiftType] || 'Rest / recovery';
    }

    function createCoachPlanDraft(weekStart) {
        const client = viewingClientData || {};
        const snapshot = client.data || {};
        const start = plannerWeekStart(weekStart);
        const now = new Date().toISOString();
        return {
            coachUid: currentUser.uid,
            memberUid: client.uid,
            coachName: String(firebaseUserData.name || currentUser.displayName || 'Coach').slice(0, 120),
            memberName: String(client.name || 'Client').slice(0, 120),
            weekStart: start,
            status: 'draft',
            coachMessage: '',
            memberMessage: '',
            days: plannerWeekDates(start).map((dateKey, dayIndex) => {
                const shiftType = coachPlanShiftForDate(snapshot, dateKey);
                const meals = {};
                WEEKLY_MEAL_TYPES.forEach((mealType, mealIndex) => {
                    const ideas = coachPlanMealIdeas(snapshot, dateKey, mealType);
                    meals[mealType] = ideas.length ? ideas[(dayIndex + mealIndex) % ideas.length].id : '';
                });
                return { date: dateKey, shiftType, training: coachPlanTrainingSuggestion(shiftType), meals, note: '', completed: false };
            }),
            createdAt: now,
            updatedAt: now
        };
    }

    function normaliseCoachPlan(plan, weekStart) {
        const fallback = createCoachPlanDraft(weekStart);
        if (!isPlainRecord(plan)) return fallback;
        const normalized = Object.assign({}, fallback, plan);
        normalized.days = plannerWeekDates(normalized.weekStart).map((dateKey, index) => {
            const existing = Array.isArray(plan.days) && isPlainRecord(plan.days[index]) ? plan.days[index] : {};
            return Object.assign({}, fallback.days[index], existing, {
                date: dateKey,
                meals: Object.assign({}, fallback.days[index].meals, isPlainRecord(existing.meals) ? existing.meals : {}),
                completed: Boolean(existing.completed)
            });
        });
        return normalized;
    }

    function ensureCoachPlanModal() {
        let modal = document.getElementById('coach-plan-builder-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'coach-plan-builder-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '248';
        modal.innerHTML = `<div class="bg-white rounded-[2rem] overflow-hidden flex flex-col" style="width:min(1050px,calc(100vw - 0.75rem));height:min(920px,96vh);"><div class="bg-slate-900 border-b border-orange-500 p-4 sm:p-5 flex items-start justify-between gap-3"><div><p class="text-[10px] font-black uppercase tracking-[0.16em] text-orange-400">Human coach workspace</p><h3 class="text-xl font-black text-white">Build 7-Day Client Plan</h3><p id="coach-plan-builder-subtitle" class="text-[11px] text-slate-300 mt-1"></p></div><button onclick="closeCoachPlanBuilder()" class="w-10 h-10 bg-white rounded-full text-2xl flex-shrink-0" aria-label="Close plan builder">×</button></div><div id="coach-plan-builder-content" class="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5"></div><div class="border-t border-slate-200 bg-white p-3 grid grid-cols-3 gap-2"><button onclick="closeCoachPlanBuilder()" class="bg-slate-100 p-3 rounded-xl font-black text-xs">Cancel</button><button id="coach-plan-publish" onclick="saveCoachPlan()" class="col-span-2 bg-orange-600 text-white p-3 rounded-xl font-black text-xs">Publish Plan to Member</button></div></div>`;
        document.body.appendChild(modal);
        ensureAccessibleDom(modal);
        return modal;
    }

    async function openCoachPlanBuilder(weekStart) {
        if (!requireCoachAccess() || !viewingClientData) return;
        const start = plannerWeekStart(weekStart || localDateKey());
        const id = coachPlanDocumentId(currentUser.uid, viewingClientData.uid, start);
        try {
            const documentSnapshot = await db.collection('coachPlans').doc(id).get();
            coachPlanDraft = normaliseCoachPlan(documentSnapshot.exists ? documentSnapshot.data() : null, start);
            ensureCoachPlanModal().style.display = 'flex';
            renderCoachPlanBuilder();
        } catch (error) {
            console.warn('Existing coach plan could not be loaded:', error);
            coachPlanDraft = createCoachPlanDraft(start);
            ensureCoachPlanModal().style.display = 'flex';
            renderCoachPlanBuilder();
        }
    }

    function closeCoachPlanBuilder() {
        const modal = document.getElementById('coach-plan-builder-modal');
        if (modal) modal.style.display = 'none';
        coachPlanDraft = null;
    }

    function collectCoachPlanForm() {
        if (!coachPlanDraft) return;
        coachPlanDraft.coachMessage = String(document.getElementById('coach-plan-message')?.value || '').trim().slice(0, 1500);
        coachPlanDraft.days.forEach((day, index) => {
            day.training = String(document.getElementById(`coach-plan-training-${index}`)?.value || '').slice(0, 120);
            day.note = String(document.getElementById(`coach-plan-note-${index}`)?.value || '').trim().slice(0, 500);
            WEEKLY_MEAL_TYPES.forEach(mealType => {
                day.meals[mealType] = String(document.getElementById(`coach-plan-meal-${index}-${mealType}`)?.value || '').slice(0, 120);
            });
        });
    }

    function changeCoachPlanWeek(direction) {
        if (!coachPlanDraft) return;
        collectCoachPlanForm();
        openCoachPlanBuilder(plannerAddDays(coachPlanDraft.weekStart, Number(direction || 0) * 7));
    }

    function coachPlanMealSelectHTML(snapshot, day, dayIndex, mealType) {
        const ideas = coachPlanMealIdeas(snapshot, day.date, mealType);
        return `<label class="text-[9px] font-black uppercase text-slate-400">${escapeHtml(mealType)}<select id="coach-plan-meal-${dayIndex}-${mealType}" class="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold normal-case">${ideas.map(idea => `<option value="${escapeHtml(idea.id)}" ${day.meals[mealType] === idea.id ? 'selected' : ''}>${escapeHtml(idea.name)} · ${idea.calories} kcal</option>`).join('')}</select></label>`;
    }

    function renderCoachPlanBuilder() {
        if (!coachPlanDraft || !viewingClientData) return;
        const snapshot = viewingClientData.data || {};
        const profile = coachPlanDietaryProfile(snapshot);
        const content = document.getElementById('coach-plan-builder-content');
        const subtitle = document.getElementById('coach-plan-builder-subtitle');
        if (subtitle) subtitle.textContent = `${viewingClientData.name} · week of ${weeklyPlannerDateLabel(coachPlanDraft.weekStart, false)}`;
        if (!content) return;
        const requirementLabels = profile.requirements.map(value => DIETARY_REQUIREMENT_LABELS[value] || value);
        content.innerHTML = `
            <div class="flex items-center gap-2 mb-4"><button onclick="changeCoachPlanWeek(-1)" class="w-10 h-10 bg-slate-100 rounded-xl">‹</button><div class="flex-1 text-center"><p class="text-[9px] uppercase text-slate-400 font-black">Plan week</p><p class="font-black text-sm">${escapeHtml(weeklyPlannerDateLabel(coachPlanDraft.weekStart, false))} – ${escapeHtml(weeklyPlannerDateLabel(plannerAddDays(coachPlanDraft.weekStart, 6), false))}</p></div><button onclick="changeCoachPlanWeek(1)" class="w-10 h-10 bg-slate-100 rounded-xl">›</button></div>
            <section class="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4"><div class="flex flex-wrap gap-1.5"><span class="text-[10px] font-black bg-slate-900 text-orange-300 px-2 py-1 rounded-full">${escapeHtml(dietaryPatternLabel(profile.pattern))}</span>${profile.approaches.map(value => `<span class="text-[10px] font-black bg-white text-orange-800 border border-orange-200 px-2 py-1 rounded-full">${escapeHtml(DIETARY_APPROACH_LABELS[value])}</span>`).join('')}${requirementLabels.map(value => `<span class="text-[10px] font-black bg-rose-100 text-rose-800 px-2 py-1 rounded-full">${escapeHtml(value)}</span>`).join('')}</div>${profile.notes ? `<p class="text-[11px] text-orange-900 mt-2"><b>Client instruction:</b> ${escapeHtml(profile.notes)}</p>` : ''}<p class="text-[10px] text-slate-500 mt-2">Recipes are filtered to this saved profile. Confirm allergens, cross-contamination and certification with the client.</p></section>
            <label class="block text-xs font-black mb-4">Message for the week<textarea id="coach-plan-message" maxlength="1500" rows="3" class="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl" placeholder="Priorities, adjustments and encouragement…">${escapeHtml(coachPlanDraft.coachMessage || '')}</textarea></label>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${coachPlanDraft.days.map((day, index) => {
                const shiftLabels = { night: '🌙 Night shift', early: '🌅 Early shift', day: '🏢 Day shift', off: '☀️ Rest / off' };
                return `<section class="bg-slate-50 border border-slate-200 rounded-2xl p-3"><div class="flex justify-between items-center mb-3"><div><p class="font-black text-sm">${escapeHtml(weeklyPlannerDateLabel(day.date, true))}</p><p class="text-[10px] text-slate-500">${escapeHtml(shiftLabels[day.shiftType] || day.shiftType)}</p></div></div><label class="text-[9px] font-black uppercase text-slate-400">Training<select id="coach-plan-training-${index}" class="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold normal-case">${['Rest / recovery','Recovery / mobility','Full body strength','Upper body strength','Lower body strength','Cardio / conditioning','Client choice'].map(value => `<option ${day.training === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label><div class="grid grid-cols-2 gap-2 mt-3">${WEEKLY_MEAL_TYPES.map(mealType => coachPlanMealSelectHTML(snapshot, day, index, mealType)).join('')}</div><label class="text-[9px] font-black uppercase text-slate-400 block mt-3">Day note<input id="coach-plan-note-${index}" maxlength="500" value="${escapeHtml(day.note || '')}" class="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-[11px] normal-case" placeholder="Optional coaching note"></label></section>`;
            }).join('')}</div>`;
        ensureAccessibleDom(content);
        refreshIcons();
    }

    async function saveCoachPlan() {
        if (!coachPlanDraft || !viewingClientData || !requireCoachAccess()) return;
        collectCoachPlanForm();
        coachPlanDraft.status = 'published';
        coachPlanDraft.memberMessage = '';
        coachPlanDraft.updatedAt = new Date().toISOString();
        const id = coachPlanDocumentId(coachPlanDraft.coachUid, coachPlanDraft.memberUid, coachPlanDraft.weekStart);
        const button = document.getElementById('coach-plan-publish');
        if (button) { button.disabled = true; button.textContent = 'Publishing…'; }
        try {
            await db.collection('coachPlans').doc(id).set(coachPlanDraft, { merge: false });
            await pushNotification(coachPlanDraft.memberUid, { type: 'coach-plan', title: 'Your new 7-day plan is ready', body: `${coachPlanDraft.coachName} published your training and meal plan`, fromName: coachPlanDraft.coachName });
            closeCoachPlanBuilder();
            renderCoachPlanBuilderEntry();
            showToast('Seven-day plan published to ' + viewingClientData.name + ' ✓', 5000);
        } catch (error) {
            console.error('Coach plan publish failed:', error);
            showToast('Plan could not be published — check the Firestore rules', 6000);
            if (button) { button.disabled = false; button.textContent = 'Publish Plan to Member'; }
        }
    }

    async function renderCoachPlanBuilderEntry() {
        if (!viewingClientData || currentUserRole !== 'coach') return;
        const root = document.querySelector('#coach-view .max-w-xl');
        if (!root) return;
        root.querySelector('[data-coach-plan-builder-entry]')?.remove();
        const start = plannerWeekStart(localDateKey());
        const id = coachPlanDocumentId(currentUser.uid, viewingClientData.uid, start);
        let status = 'No plan published for this week';
        try {
            const snapshot = await db.collection('coachPlans').doc(id).get();
            if (snapshot.exists) {
                const plan = snapshot.data() || {};
                status = `Current status: ${String(plan.status || 'draft').replace(/_/g, ' ')}`;
                if (plan.memberMessage) status += ` · Request: ${plan.memberMessage}`;
            }
        } catch (error) {}
        root.insertAdjacentHTML('beforeend', `<section data-coach-plan-builder-entry class="glass-card rounded-[2.5rem] p-6 border-2 border-orange-200"><p class="text-[10px] font-black uppercase text-orange-600">Shared weekly plan</p><h3 class="text-lg font-black mt-1">Training + Meals for 7 Days</h3><p class="text-xs text-slate-500 mt-2">Built from ${escapeHtml(viewingClientData.name)}’s rota and dietary requirements. ${escapeHtml(status)}</p><button onclick="openCoachPlanBuilder('${escapeJsString(start)}')" class="w-full mt-4 bg-orange-600 text-white p-3 rounded-xl font-black">Build / Edit 7-Day Plan</button></section>`);
        refreshIcons();
    }

    function memberCoachPlanRecipe(dateKey, mealType, recipeId) {
        const ideas = shiftMealIdeasFor(plannerShiftType(dateKey), mealType);
        const index = ideas.findIndex(idea => idea.id === recipeId);
        if (index < 0) { showToast('This recipe no longer matches the current dietary profile'); return; }
        openShiftMealDetail(plannerShiftType(dateKey), mealType, index, dateKey);
    }

    async function updateMemberCoachPlan(planId, updates) {
        if (!currentUser || currentUserRole !== 'member') return;
        try {
            await db.collection('coachPlans').doc(planId).update(Object.assign({}, updates, { updatedAt: new Date().toISOString() }));
            await renderMemberCoachPlanCard();
            showToast('Coach plan updated ✓');
        } catch (error) {
            console.error('Member coach plan update failed:', error);
            showToast('Plan update could not be saved', 5500);
        }
    }

    function acceptMemberCoachPlan(planId) {
        updateMemberCoachPlan(planId, { status: 'accepted', memberMessage: '' });
    }

    function requestMemberCoachPlanChange(planId) {
        const input = document.getElementById('member-coach-plan-request');
        const message = String(input && input.value || '').trim().slice(0, 1000);
        if (message.length < 3) { showToast('Tell your coach what you want changed'); return; }
        updateMemberCoachPlan(planId, { status: 'changes_requested', memberMessage: message });
    }

    async function toggleMemberCoachPlanDay(planId, dayIndex) {
        try {
            const snapshot = await db.collection('coachPlans').doc(planId).get();
            if (!snapshot.exists) return;
            const plan = snapshot.data() || {};
            const days = Array.isArray(plan.days) ? deepClone(plan.days) : [];
            if (!days[dayIndex]) return;
            days[dayIndex].completed = !days[dayIndex].completed;
            await updateMemberCoachPlan(planId, { days });
        } catch (error) {
            showToast('Could not update that day');
        }
    }

    function memberCoachPlanHTML(planId, plan) {
        const days = Array.isArray(plan.days) ? plan.days : [];
        const completed = days.filter(day => day.completed).length;
        return `<section data-member-coach-plan class="mt-4 border-2 border-orange-200 bg-orange-50 rounded-2xl p-4"><div class="flex items-start justify-between gap-3"><div><p class="text-[10px] font-black uppercase text-orange-600">Coach 7-day plan</p><h4 class="font-black mt-1">Week of ${escapeHtml(weeklyPlannerDateLabel(plan.weekStart, false))}</h4><p class="text-[11px] text-slate-500 mt-1">${escapeHtml(plan.coachMessage || 'Your coach has prepared this week for you.')}</p></div><span class="text-[9px] font-black bg-white border border-orange-200 px-2 py-1 rounded-full">${escapeHtml(String(plan.status || 'published').replace(/_/g, ' ').toUpperCase())}</span></div><p class="text-xs font-black mt-3">${completed}/${days.length} days completed</p><div class="space-y-2 mt-3">${days.map((day, index) => `<details class="bg-white border border-orange-100 rounded-xl p-3"><summary class="font-black text-xs cursor-pointer">${day.completed ? '✓ ' : ''}${escapeHtml(weeklyPlannerDateLabel(day.date, true))} · ${escapeHtml(day.training || 'Rest')}</summary>${day.note ? `<p class="text-[10px] text-slate-500 mt-2">${escapeHtml(day.note)}</p>` : ''}<div class="grid grid-cols-2 gap-1.5 mt-2">${WEEKLY_MEAL_TYPES.map(mealType => `<button onclick="memberCoachPlanRecipe('${escapeJsString(day.date)}','${escapeJsString(mealType)}','${escapeJsString(day.meals && day.meals[mealType] || '')}')" class="bg-slate-50 p-2 rounded-lg text-[9px] font-black capitalize">${escapeHtml(mealType)} recipe</button>`).join('')}</div><button onclick="toggleMemberCoachPlanDay('${escapeJsString(planId)}',${index})" class="w-full mt-2 ${day.completed ? 'bg-slate-100 text-slate-600' : 'bg-emerald-600 text-white'} p-2 rounded-lg text-[10px] font-black">${day.completed ? 'Mark Not Complete' : 'Complete This Day'}</button></details>`).join('')}</div>${plan.status === 'published' ? `<button onclick="acceptMemberCoachPlan('${escapeJsString(planId)}')" class="w-full mt-3 bg-emerald-600 text-white p-3 rounded-xl font-black text-xs">Accept This Plan</button>` : ''}<div class="grid grid-cols-[1fr_auto] gap-2 mt-3"><input id="member-coach-plan-request" maxlength="1000" value="${escapeHtml(plan.memberMessage || '')}" placeholder="Ask for a change…" class="p-3 bg-white border border-orange-200 rounded-xl text-xs"><button onclick="requestMemberCoachPlanChange('${escapeJsString(planId)}')" class="bg-slate-900 text-white px-3 rounded-xl text-[10px] font-black">Request</button></div></section>`;
    }

    async function renderMemberCoachPlanCard() {
        const container = document.getElementById('member-coach-section');
        if (!container || !currentUser || currentUserRole !== 'member' || !firebaseUserData.coachUid) return;
        container.querySelector('[data-member-coach-plan]')?.remove();
        try {
            const snapshot = await db.collection('coachPlans').where('memberUid', '==', currentUser.uid).limit(20).get();
            const plans = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })).filter(item => item.data && item.data.coachUid === firebaseUserData.coachUid).sort((a, b) => String(b.data.weekStart || '').localeCompare(String(a.data.weekStart || '')));
            const currentStart = plannerWeekStart(localDateKey());
            const chosen = plans.find(item => item.data.weekStart === currentStart) || plans.find(item => item.data.weekStart >= currentStart) || plans[0];
            if (chosen) container.insertAdjacentHTML('beforeend', memberCoachPlanHTML(chosen.id, chosen.data));
            ensureAccessibleDom(container);
            refreshIcons();
        } catch (error) {
            console.warn('Member coach plan unavailable:', error);
        }
    }

    const renderClientDetailWithoutPlanBuilder = renderClientDetail;
    renderClientDetail = function renderClientDetailWithPlanBuilder() {
        const result = renderClientDetailWithoutPlanBuilder.apply(this, arguments);
        renderCoachPlanBuilderEntry();
        return result;
    };

    const renderMemberCoachSectionWithoutPlan = renderMemberCoachSection;
    renderMemberCoachSection = async function renderMemberCoachSectionWithPlan() {
        const result = await renderMemberCoachSectionWithoutPlan.apply(this, arguments);
        await renderMemberCoachPlanCard();
        return result;
    };
