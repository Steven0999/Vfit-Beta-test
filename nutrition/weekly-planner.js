    // ========================================================================
    // SEVEN-DAY SHIFT MEAL PLANNER + EMBEDDED SHOPPING SCANNER
    // ========================================================================
    const WEEKLY_MEAL_TYPES = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack']);
    let weeklyPlannerStartDate = '';
    let weeklyPlannerTab = 'plan';

    function plannerDate(value) {
        const key = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : localDateKey();
        return new Date(key + 'T12:00:00');
    }

    function plannerDateKey(value) {
        return localDateKey(value instanceof Date ? value : plannerDate(value));
    }

    function plannerAddDays(value, amount) {
        const date = plannerDate(value);
        date.setDate(date.getDate() + Number(amount || 0));
        return plannerDateKey(date);
    }

    function plannerWeekStart(value) {
        const date = plannerDate(value);
        const distance = (date.getDay() + 6) % 7;
        date.setDate(date.getDate() - distance);
        return plannerDateKey(date);
    }

    function plannerWeekDates(value) {
        const start = plannerWeekStart(value || weeklyPlannerStartDate || state.viewDate);
        return Array.from({ length: 7 }, (_, index) => plannerAddDays(start, index));
    }

    function plannerShiftType(dateKey) {
        const shift = getShiftForDate(dateKey);
        return ['night', 'early', 'day'].includes(shift && shift.type) ? shift.type : 'off';
    }

    function plannerHash(value) {
        return Array.from(String(value || '')).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
    }

    function plannerDayRecord(dateKey) {
        if (!isPlainRecord(state.weeklyMealPlan)) state.weeklyMealPlan = {};
        const existing = isPlainRecord(state.weeklyMealPlan[dateKey]) ? state.weeklyMealPlan[dateKey] : {};
        if (!isPlainRecord(existing.meals)) existing.meals = {};
        existing.date = dateKey;
        existing.shiftType = plannerShiftType(dateKey);
        state.weeklyMealPlan[dateKey] = existing;
        return existing;
    }

    function plannerMealIdeas(dateKey, mealType) {
        return shiftMealIdeasFor(plannerShiftType(dateKey), mealType);
    }

    function plannerMealSelection(dateKey, mealType) {
        const day = plannerDayRecord(dateKey);
        const ideas = plannerMealIdeas(dateKey, mealType);
        if (!ideas.length) return { selection: null, idea: null, index: -1 };
        let selection = isPlainRecord(day.meals[mealType]) ? day.meals[mealType] : {};
        let index = ideas.findIndex(idea => idea.id === selection.recipeId);
        if (index < 0) {
            index = plannerHash(dateKey + ':' + mealType) % ideas.length;
            selection = {
                recipeId: ideas[index].id,
                servings: 1,
                completed: false,
                updatedAt: new Date().toISOString()
            };
            day.meals[mealType] = selection;
        }
        selection.servings = Math.min(12, Math.max(1, Math.round(Number(selection.servings) || 1)));
        selection.completed = Boolean(selection.completed);
        return { selection, idea: ideas[index], index };
    }

    function ensureWeeklyMealPlan(value) {
        plannerWeekDates(value).forEach(dateKey => {
            WEEKLY_MEAL_TYPES.forEach(mealType => plannerMealSelection(dateKey, mealType));
        });
    }

    function weeklyPlannerDateLabel(dateKey, long) {
        return plannerDate(dateKey).toLocaleDateString('en-GB', long
            ? { weekday: 'long', day: 'numeric', month: 'long' }
            : { weekday: 'short', day: 'numeric', month: 'short' });
    }

    function ensureWeeklyPlannerModal() {
        let modal = document.getElementById('weekly-meal-planner-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'weekly-meal-planner-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '246';
        modal.innerHTML = `
            <div class="bg-white rounded-[2rem] overflow-hidden flex flex-col" style="width:min(1100px,calc(100vw - 0.75rem));height:min(920px,96vh);">
                <div class="bg-slate-900 border-b border-orange-500 p-4 sm:p-5 flex items-start justify-between gap-3">
                    <div><p class="text-[10px] font-black uppercase tracking-[0.16em] text-orange-400">Shift-aware nutrition</p><h3 class="text-xl sm:text-2xl font-black text-white">7-Day Meal Planner</h3><p id="weekly-planner-subtitle" class="text-[11px] text-slate-300 mt-1"></p></div>
                    <button onclick="closeWeeklyMealPlanner()" class="w-10 h-10 bg-white rounded-full text-2xl flex-shrink-0" aria-label="Close weekly planner">×</button>
                </div>
                <div class="bg-white border-b border-slate-200 p-3 grid grid-cols-2 gap-2">
                    <button id="weekly-planner-tab-plan" onclick="setWeeklyPlannerTab('plan')" class="p-3 rounded-xl text-xs font-black">Meal Plan</button>
                    <button id="weekly-planner-tab-shopping" onclick="setWeeklyPlannerTab('shopping')" class="p-3 rounded-xl text-xs font-black">Shopping List</button>
                </div>
                <div id="weekly-meal-planner-content" class="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5"></div>
            </div>`;
        document.body.appendChild(modal);
        ensureAccessibleDom(modal);
        return modal;
    }

    function openWeeklyMealPlanner(value) {
        weeklyPlannerStartDate = plannerWeekStart(value || state.viewDate || localDateKey());
        weeklyPlannerTab = 'plan';
        ensureWeeklyMealPlan(weeklyPlannerStartDate);
        saveState();
        const modal = ensureWeeklyPlannerModal();
        modal.style.display = 'flex';
        renderWeeklyMealPlanner();
    }

    async function closeWeeklyMealPlanner() {
        if (barcodeScanMode === 'shopping') await closeBarcodeScanner();
        const modal = document.getElementById('weekly-meal-planner-modal');
        if (modal) modal.style.display = 'none';
    }

    async function setWeeklyPlannerTab(tab) {
        const nextTab = tab === 'shopping' ? 'shopping' : 'plan';
        if (barcodeScanMode === 'shopping' && nextTab !== 'shopping') await closeBarcodeScanner();
        weeklyPlannerTab = nextTab;
        renderWeeklyMealPlanner();
    }

    async function changeWeeklyMealPlannerWeek(amount) {
        if (barcodeScanMode === 'shopping') await closeBarcodeScanner();
        weeklyPlannerStartDate = plannerWeekStart(plannerAddDays(weeklyPlannerStartDate, Number(amount || 0) * 7));
        ensureWeeklyMealPlan(weeklyPlannerStartDate);
        saveState();
        renderWeeklyMealPlanner();
    }

    function goToCurrentMealPlannerWeek() {
        weeklyPlannerStartDate = plannerWeekStart(localDateKey());
        ensureWeeklyMealPlan(weeklyPlannerStartDate);
        saveState();
        renderWeeklyMealPlanner();
    }

    function autoFillWeeklyMealPlanner() {
        plannerWeekDates(weeklyPlannerStartDate).forEach(dateKey => {
            const day = plannerDayRecord(dateKey);
            WEEKLY_MEAL_TYPES.forEach((mealType, mealIndex) => {
                const ideas = plannerMealIdeas(dateKey, mealType);
                if (!ideas.length) return;
                const index = (plannerHash(dateKey) + mealIndex) % ideas.length;
                const previous = isPlainRecord(day.meals[mealType]) ? day.meals[mealType] : {};
                day.meals[mealType] = {
                    recipeId: ideas[index].id,
                    servings: Math.min(12, Math.max(1, Number(previous.servings) || 1)),
                    completed: false,
                    updatedAt: new Date().toISOString()
                };
            });
        });
        saveState();
        renderWeeklyMealPlanner();
        showToast('Seven-day meal plan refreshed for your rota and diet');
    }

    function swapWeeklyMeal(dateKey, mealType, direction) {
        const result = plannerMealSelection(dateKey, mealType);
        const ideas = plannerMealIdeas(dateKey, mealType);
        if (!result.selection || ideas.length < 2) return;
        const next = (result.index + Number(direction || 1) + ideas.length) % ideas.length;
        result.selection.recipeId = ideas[next].id;
        result.selection.completed = false;
        result.selection.updatedAt = new Date().toISOString();
        saveState();
        renderWeeklyMealPlanner();
    }

    function setWeeklyMealServings(dateKey, mealType, value) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.selection) return;
        result.selection.servings = Math.min(12, Math.max(1, Math.round(Number(value) || 1)));
        result.selection.updatedAt = new Date().toISOString();
        saveState();
        renderWeeklyMealPlanner();
    }

    function toggleWeeklyMealComplete(dateKey, mealType) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.selection) return;
        result.selection.completed = !result.selection.completed;
        result.selection.updatedAt = new Date().toISOString();
        saveState();
        renderWeeklyMealPlanner();
    }

    function openWeeklyPlannerRecipe(dateKey, mealType) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.idea) return;
        openShiftMealDetail(plannerShiftType(dateKey), mealType, result.index, dateKey);
    }

    function addWeeklyMealToDiary(dateKey, mealType) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.idea) return;
        addShiftMealIdea(plannerShiftType(dateKey), mealType, result.index, dateKey);
    }

    function weeklyMealPlannerCardHTML(dateKey, mealType) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.idea) return '';
        const idea = result.idea;
        const selection = result.selection;
        const timing = shiftMealTimingLabel(plannerShiftType(dateKey), mealType);
        const safety = typeof structuredMealSafety === 'function' ? structuredMealSafety(idea) : { allergens: dietaryMealAllergens(idea) };
        return `
            <div class="border ${selection.completed ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'} rounded-2xl p-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0"><p class="text-[9px] font-black uppercase text-orange-600">${escapeHtml(mealType)} · ${escapeHtml(timing)}</p><p class="font-black text-sm mt-1">${escapeHtml(idea.name)}</p><p class="text-[10px] text-slate-500 mt-1">${idea.calories} kcal · ${idea.protein}g protein${safety.allergens.length ? ` · Check: ${escapeHtml(safety.allergens.join(', '))}` : ''}</p></div>
                    <button onclick="toggleWeeklyMealComplete('${escapeJsString(dateKey)}','${escapeJsString(mealType)}')" class="w-9 h-9 rounded-full flex-shrink-0 ${selection.completed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}" aria-label="${selection.completed ? 'Mark meal not completed' : 'Mark meal completed'}">${selection.completed ? '✓' : '○'}</button>
                </div>
                <div class="grid grid-cols-4 gap-1.5 mt-3">
                    <button onclick="swapWeeklyMeal('${escapeJsString(dateKey)}','${escapeJsString(mealType)}',1)" class="bg-slate-100 p-2 rounded-lg text-[10px] font-black">Swap</button>
                    <button onclick="openWeeklyPlannerRecipe('${escapeJsString(dateKey)}','${escapeJsString(mealType)}')" class="bg-orange-50 text-orange-700 p-2 rounded-lg text-[10px] font-black">Recipe</button>
                    <button onclick="addWeeklyMealToDiary('${escapeJsString(dateKey)}','${escapeJsString(mealType)}')" class="bg-indigo-50 text-indigo-700 p-2 rounded-lg text-[10px] font-black">Log 1</button>
                    <label class="bg-slate-100 rounded-lg px-1 text-[9px] font-bold text-center flex flex-col justify-center">Servings<input type="number" min="1" max="12" value="${selection.servings}" onchange="setWeeklyMealServings('${escapeJsString(dateKey)}','${escapeJsString(mealType)}',this.value)" class="bg-transparent w-full text-center font-black outline-none"></label>
                </div>
            </div>`;
    }

    function renderWeeklyPlanView() {
        const dates = plannerWeekDates(weeklyPlannerStartDate);
        const total = dates.length * WEEKLY_MEAL_TYPES.length;
        const completed = dates.reduce((count, dateKey) => count + WEEKLY_MEAL_TYPES.filter(mealType => plannerMealSelection(dateKey, mealType).selection?.completed).length, 0);
        const profile = dietaryProfile();
        return `
            <div class="flex items-center gap-2 mb-4">
                <button onclick="changeWeeklyMealPlannerWeek(-1)" class="w-10 h-10 bg-slate-100 rounded-xl" aria-label="Previous week">‹</button>
                <div class="flex-1 text-center"><p class="text-[9px] font-black uppercase text-slate-400">Week commencing</p><p class="font-black text-sm">${escapeHtml(weeklyPlannerDateLabel(dates[0], false))} – ${escapeHtml(weeklyPlannerDateLabel(dates[6], false))}</p></div>
                <button onclick="changeWeeklyMealPlannerWeek(1)" class="w-10 h-10 bg-slate-100 rounded-xl" aria-label="Next week">›</button>
            </div>
            <div class="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
                <div class="flex flex-wrap gap-1.5">${dietaryProfileBadgesHTML(profile)}</div>
                <p class="text-[11px] text-orange-900 mt-2">Every day uses its saved rota shift. Diet exclusions filter recipes; fasting changes timing guidance; calorie deficit changes suggested portions.</p>
                <div class="flex items-center justify-between gap-2 mt-3"><span class="text-xs font-black">${completed}/${total} meals completed</span><div class="flex gap-2"><button onclick="goToCurrentMealPlannerWeek()" class="bg-white border border-orange-200 px-3 py-2 rounded-xl text-[10px] font-black">This week</button><button onclick="autoFillWeeklyMealPlanner()" class="bg-slate-900 text-white px-3 py-2 rounded-xl text-[10px] font-black">Refresh plan</button></div></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${dates.map(dateKey => {
                const type = plannerShiftType(dateKey);
                const shiftLabels = { night: '🌙 Night shift', early: '🌅 Early shift', day: '🏢 Day shift', off: '☀️ Rest / off' };
                return `<section class="bg-slate-50 border border-slate-200 rounded-[1.5rem] p-3"><div class="flex items-center justify-between mb-3"><div><p class="font-black">${escapeHtml(weeklyPlannerDateLabel(dateKey, true))}</p><p class="text-[10px] text-slate-500">${escapeHtml(shiftLabels[type])}</p></div>${dateKey === localDateKey() ? '<span class="bg-orange-500 text-white text-[9px] font-black px-2 py-1 rounded-full">TODAY</span>' : ''}</div><div class="space-y-2">${WEEKLY_MEAL_TYPES.map(mealType => weeklyMealPlannerCardHTML(dateKey, mealType)).join('')}</div></section>`;
            }).join('')}</div>`;
    }

    function weeklyShoppingGeneratedItems() {
        const aggregate = new Map();
        plannerWeekDates(weeklyPlannerStartDate).forEach(dateKey => {
            WEEKLY_MEAL_TYPES.forEach(mealType => {
                const result = plannerMealSelection(dateKey, mealType);
                if (!result.idea) return;
                const ingredients = Array.isArray(result.idea.ingredients) && result.idea.ingredients.length
                    ? result.idea.ingredients
                    : inferredShiftMealIngredients(result.idea);
                ingredients.forEach(ingredient => {
                    const key = String(ingredient).trim().toLowerCase().replace(/\s+/g, ' ');
                    const current = aggregate.get(key) || { key: 'recipe:' + encodeURIComponent(key), name: ingredient, servings: 0, meals: new Set(), generated: true };
                    current.servings += result.selection.servings;
                    current.meals.add(result.idea.name);
                    aggregate.set(key, current);
                });
            });
        });
        return Array.from(aggregate.values()).map(item => Object.assign({}, item, { meals: Array.from(item.meals) }));
    }

    function weeklyShoppingItems() {
        const generated = weeklyShoppingGeneratedItems();
        const manual = (state.shoppingItems || []).map(item => ({
            key: 'saved:' + item.id,
            id: item.id,
            name: item.name,
            quantity: item.quantity || '1 item',
            barcode: item.barcode || '',
            brand: item.brand || '',
            generated: false
        }));
        return generated.concat(manual);
    }

    function weeklyShoppingCheckKey(itemKey) {
        return plannerWeekStart(weeklyPlannerStartDate) + ':' + itemKey;
    }

    function toggleWeeklyShoppingItem(itemKey) {
        if (!isPlainRecord(state.shoppingChecks)) state.shoppingChecks = {};
        const key = weeklyShoppingCheckKey(itemKey);
        state.shoppingChecks[key] = !state.shoppingChecks[key];
        saveState();
        renderWeeklyMealPlanner();
    }

    function addManualShoppingItem() {
        const nameInput = document.getElementById('weekly-shopping-name');
        const quantityInput = document.getElementById('weekly-shopping-quantity');
        const name = String(nameInput && nameInput.value || '').trim().slice(0, 120);
        const quantity = String(quantityInput && quantityInput.value || '').trim().slice(0, 60) || '1 item';
        if (!name) { showToast('Enter a shopping item'); return; }
        if (!Array.isArray(state.shoppingItems)) state.shoppingItems = [];
        state.shoppingItems.push({ id: 'shop-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), name, quantity, source: 'manual', barcode: '', addedAt: new Date().toISOString() });
        saveState();
        renderWeeklyMealPlanner();
        showToast(name + ' added to the shopping list');
    }

    function addShoppingProductFromBarcode(food) {
        const code = normaliseBarcode(food && (food.scannedBarcode || food.barcode));
        const name = String(food && food.name || 'Scanned product').trim().slice(0, 120);
        if (!Array.isArray(state.shoppingItems)) state.shoppingItems = [];
        const existing = state.shoppingItems.find(item => code && normaliseBarcode(item.barcode) === code);
        if (existing) {
            existing.quantity = String(Math.max(1, (parseInt(existing.quantity, 10) || 1) + 1)) + ' items';
            existing.updatedAt = new Date().toISOString();
        } else {
            state.shoppingItems.push({
                id: 'barcode-' + (code || Date.now()), name, quantity: '1 item',
                barcode: code, brand: String(food && food.brand || '').slice(0, 80),
                source: 'barcode', addedAt: new Date().toISOString()
            });
        }
        saveState();
        weeklyPlannerTab = 'shopping';
        renderWeeklyMealPlanner();
        showToast(`${name} added here · barcode ${code || 'not supplied'}`, 5000);
    }

    function removeWeeklyShoppingItem(itemId) {
        state.shoppingItems = (state.shoppingItems || []).filter(item => String(item.id) !== String(itemId));
        saveState();
        renderWeeklyMealPlanner();
    }

    function clearPurchasedShoppingItems() {
        const items = weeklyShoppingItems();
        const checked = new Set(items.filter(item => state.shoppingChecks[weeklyShoppingCheckKey(item.key)]).map(item => item.key));
        state.shoppingItems = (state.shoppingItems || []).filter(item => !checked.has('saved:' + item.id));
        checked.forEach(key => { delete state.shoppingChecks[weeklyShoppingCheckKey(key)]; });
        saveState();
        renderWeeklyMealPlanner();
        showToast('Ticked items cleared');
    }

    function openShoppingBarcodeScanner() {
        weeklyPlannerTab = 'shopping';
        renderWeeklyMealPlanner();
        barcodeScanMode = 'shopping';
        barcodeScannerEmbedded = true;
        openBarcodeScanner();
    }

    function renderWeeklyShoppingView() {
        const items = weeklyShoppingItems();
        const checkedCount = items.filter(item => state.shoppingChecks[weeklyShoppingCheckKey(item.key)]).length;
        return `
            <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
                <div class="flex items-start justify-between gap-3"><div><h4 class="font-black text-emerald-900">Combined shopping list</h4><p class="text-[11px] text-emerald-800 mt-1">Ingredients from all 28 planned meals, multiplied by servings, plus anything you add or scan.</p></div><span class="text-xs font-black text-emerald-700">${checkedCount}/${items.length}</span></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-[1fr_130px_auto] gap-2 mb-3">
                <input id="weekly-shopping-name" maxlength="120" placeholder="Add an item" class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <input id="weekly-shopping-quantity" maxlength="60" placeholder="Quantity" class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <button onclick="addManualShoppingItem()" class="bg-slate-900 text-white px-4 py-3 rounded-xl text-xs font-black">Add</button>
            </div>
            <button onclick="openShoppingBarcodeScanner()" class="w-full bg-orange-600 text-white p-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2"><i data-lucide="scan-line" class="w-5 h-5"></i> Scan a product in Shopping List</button>
            <div id="weekly-shopping-barcode-slot" class="hidden mt-3"></div>
            <div class="flex items-center justify-between gap-2 mt-5 mb-2"><p class="text-xs font-black uppercase text-slate-400">${items.length} items</p><button onclick="clearPurchasedShoppingItems()" class="text-[10px] font-black text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">Clear ticked</button></div>
            <div class="space-y-2">${items.length ? items.map(item => {
                const checked = Boolean(state.shoppingChecks[weeklyShoppingCheckKey(item.key)]);
                const detail = item.generated ? `${item.servings} planned serving${item.servings === 1 ? '' : 's'} · ${item.meals.slice(0, 2).join(', ')}${item.meals.length > 2 ? ` +${item.meals.length - 2}` : ''}` : `${item.quantity}${item.brand ? ` · ${item.brand}` : ''}${item.barcode ? ` · Barcode ${item.barcode}` : ''}`;
                return `<div class="flex items-center gap-3 p-3 border ${checked ? 'border-emerald-200 bg-emerald-50 opacity-70' : 'border-slate-200 bg-white'} rounded-xl"><button onclick="toggleWeeklyShoppingItem('${escapeJsString(item.key)}')" class="w-9 h-9 rounded-full flex-shrink-0 ${checked ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}" aria-label="${checked ? 'Untick' : 'Tick'} ${escapeHtml(item.name)}">${checked ? '✓' : '○'}</button><div class="flex-1 min-w-0"><p class="font-bold text-sm ${checked ? 'line-through' : ''}">${escapeHtml(item.name)}</p><p class="text-[9px] text-slate-400 mt-0.5">${escapeHtml(detail)}</p></div>${item.generated ? '<span class="text-[8px] font-black text-indigo-600">PLAN</span>' : `<button onclick="removeWeeklyShoppingItem('${escapeJsString(item.id)}')" class="text-rose-500 p-2" aria-label="Remove ${escapeHtml(item.name)}">×</button>`}</div>`;
            }).join('') : '<p class="text-sm text-slate-400 text-center py-10">No shopping items yet.</p>'}</div>
            <p class="text-[10px] text-slate-400 mt-4">Check allergen labels and certification on the exact products you buy. Scanned nutrition comes from Open Food Facts and may be incomplete.</p>`;
    }

    function renderWeeklyMealPlanner() {
        const modal = ensureWeeklyPlannerModal();
        if (modal.style.display === 'none') return;
        const scannerCard = document.getElementById('barcode-scanner-card');
        const scannerSlot = document.getElementById('weekly-shopping-barcode-slot');
        if (barcodeScanMode === 'shopping' && barcodeScannerEmbedded && scannerCard && scannerSlot && scannerCard.parentElement === scannerSlot) {
            closeBarcodeScanner().then(renderWeeklyMealPlanner);
            return;
        }
        ensureWeeklyMealPlan(weeklyPlannerStartDate);
        const profile = dietaryProfile();
        const subtitle = document.getElementById('weekly-planner-subtitle');
        if (subtitle) subtitle.textContent = `${dietaryPatternLabel(profile.pattern)} · ${weeklyPlannerDateLabel(weeklyPlannerStartDate, false)}`;
        ['plan', 'shopping'].forEach(tab => {
            const button = document.getElementById('weekly-planner-tab-' + tab);
            if (button) button.className = `p-3 rounded-xl text-xs font-black ${weeklyPlannerTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`;
        });
        const container = document.getElementById('weekly-meal-planner-content');
        if (container) container.innerHTML = weeklyPlannerTab === 'shopping' ? renderWeeklyShoppingView() : renderWeeklyPlanView();
        ensureAccessibleDom(modal);
        refreshIcons();
    }

    function weeklyMealPlannerEntryHTML() {
        const start = plannerWeekStart(state.viewDate || localDateKey());
        const dates = plannerWeekDates(start);
        const planned = dates.reduce((count, dateKey) => count + WEEKLY_MEAL_TYPES.filter(mealType => plannerMealSelection(dateKey, mealType).idea).length, 0);
        return `<div class="glass-card p-5 rounded-[2.5rem] border-2 border-orange-200" data-weekly-meal-planner-entry><div class="flex items-start justify-between gap-3"><div><p class="text-[10px] font-black uppercase text-orange-600">Meal prep and shopping</p><h3 class="text-xl font-black mt-1">7-Day Shift Meal Planner</h3><p class="text-xs text-slate-500 mt-2">${planned} meals matched to this week’s rota and dietary plan, with recipes, swaps, servings and one combined shopping list.</p></div><i data-lucide="calendar-range" class="w-8 h-8 text-orange-500 flex-shrink-0"></i></div><button onclick="openWeeklyMealPlanner('${escapeJsString(start)}')" class="w-full mt-4 bg-slate-900 border border-orange-500 text-white p-4 rounded-2xl font-black">Open 7-Day Planner &amp; Shopping Scanner</button></div>`;
    }

    const renderShiftWorkerWithoutWeeklyPlanner = renderShiftWorker;
    renderShiftWorker = function renderShiftWorkerWithWeeklyPlanner() {
        const result = renderShiftWorkerWithoutWeeklyPlanner.apply(this, arguments);
        const box = document.getElementById('shift-worker-content');
        if (box && shiftP().acknowledgedDisclaimer && !box.querySelector('[data-weekly-meal-planner-entry]')) {
            box.insertAdjacentHTML('beforeend', weeklyMealPlannerEntryHTML());
            ensureAccessibleDom(box);
            refreshIcons();
        }
        return result;
    };
