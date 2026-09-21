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

    function plannerIngredientName(item) {
        return typeof item === 'string'
            ? item.trim()
            : String(item && (item.name || item.foodName || item.productName) || '').trim();
    }

    function plannerIngredientLabel(item) {
        if (typeof item === 'string') return item.trim();
        const name = plannerIngredientName(item);
        if (!name) return '';
        const grams = Number(item && item.grams);
        return Number.isFinite(grams) && grams > 0 ? `${Math.round(grams)}g ${name}` : name;
    }

    function plannerDiaryEntries() {
        const entries = [];
        const seen = new Set();
        const add = (entry, fallbackDate, index) => {
            if (!entry || !String(entry.name || '').trim()) return;
            const date = /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ''))
                ? String(entry.date)
                : (/^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate || '')) ? String(fallbackDate) : '');
            if (!date) return;
            const type = entry.mealType || entry.type || 'snack';
            const identity = entry.id != null
                ? String(entry.id)
                : `${type}:${String(entry.name).trim().toLowerCase()}:${Number(entry.calories) || 0}:${index}`;
            const key = `${date}:${identity}`;
            if (seen.has(key)) return;
            seen.add(key);
            entries.push(Object.assign({}, entry, { date, mealType: type, type }));
        };
        (state.dailyMeals || []).forEach((entry, index) => add(entry, entry && entry.date, index));
        (state.nutritionHistory || []).forEach(history => {
            (history && Array.isArray(history.meals) ? history.meals : []).forEach((entry, index) => add(entry, history.date, index));
        });
        return entries;
    }

    function plannerDiaryIngredientNames(entry) {
        const names = [];
        const addIngredient = item => {
            const name = typeof item === 'string'
                ? item
                : String(item && (item.name || item.foodName || item.productName) || '').trim();
            if (name) names.push(name);
        };
        const direct = entry && entry.ingredients;
        if (Array.isArray(direct)) direct.forEach(addIngredient);
        else if (typeof direct === 'string') direct.split(/[|,]/).forEach(addIngredient);

        const created = (state.createdMeals || []).find(meal =>
            String(meal.id) === String(entry && entry.createdMealId) ||
            (!entry?.createdMealId && String(meal.name || '').trim().toLowerCase() === String(entry && entry.name || '').trim().toLowerCase())
        );
        if (created && Array.isArray(created.ingredients)) created.ingredients.forEach(addIngredient);
        if (!names.length && entry && entry.name) names.push(String(entry.name).trim());
        return Array.from(new Set(names.map(name => name.replace(/\s+/g, ' ').trim()).filter(Boolean)));
    }

    function diaryPlannerMealIdeas(mealType) {
        const validType = WEEKLY_MEAL_TYPES.includes(mealType) ? mealType : 'snack';
        const groupedByDay = new Map();
        plannerDiaryEntries().forEach(entry => {
            const type = entry && (entry.mealType || entry.type);
            if (!entry || type !== validType || !entry.date || !String(entry.name || '').trim()) return;
            const key = `${entry.date}:${validType}`;
            if (!groupedByDay.has(key)) groupedByDay.set(key, []);
            groupedByDay.get(key).push(entry);
        });

        const patterns = new Map();
        groupedByDay.forEach((entries, groupKey) => {
            const names = entries.map(entry => String(entry.name || '').trim()).filter(Boolean);
            if (!names.length) return;
            const signature = names.map(name => name.toLowerCase()).sort().join('|');
            if (!signature) return;
            const date = groupKey.slice(0, 10);
            const totals = entries.reduce((sum, entry) => ({
                calories: sum.calories + (Number(entry.calories) || 0),
                protein: sum.protein + (Number(entry.protein) || 0),
                carbs: sum.carbs + (Number(entry.carbs) || 0),
                fat: sum.fat + (Number(entry.fat) || 0),
                fiber: sum.fiber + (Number(entry.fiber) || 0)
            }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
            const current = patterns.get(signature) || {
                signature, count: 0, lastUsed: '', names, ingredients: new Set(),
                calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0
            };
            current.count += 1;
            current.lastUsed = date > current.lastUsed ? date : current.lastUsed;
            current.calories += totals.calories;
            current.protein += totals.protein;
            current.carbs += totals.carbs;
            current.fat += totals.fat;
            current.fiber += totals.fiber;
            entries.forEach(entry => plannerDiaryIngredientNames(entry).forEach(name => current.ingredients.add(name)));
            patterns.set(signature, current);
        });

        const profile = typeof dietaryProfile === 'function' ? dietaryProfile() : null;
        return Array.from(patterns.values()).map(pattern => {
            const average = key => Math.round((pattern[key] / pattern.count) * 10) / 10;
            const displayNames = pattern.names.slice(0, 3);
            const name = displayNames.join(' + ') + (pattern.names.length > 3 ? ` + ${pattern.names.length - 3} more` : '');
            return {
                id: `diary-${validType}-${plannerHash(pattern.signature).toString(36)}`,
                name,
                calories: Math.round(average('calories')),
                protein: average('protein'),
                carbs: average('carbs'),
                fat: average('fat'),
                fiber: average('fiber'),
                note: `Based on a ${validType} you logged${pattern.count > 1 ? ` ${pattern.count} times` : ''}. Last used ${weeklyPlannerDateLabel(pattern.lastUsed, false)}.`,
                ingredients: Array.from(pattern.ingredients),
                allergens: [],
                source: 'nutrition-diary',
                diarySource: true,
                diaryUses: pattern.count,
                lastUsed: pattern.lastUsed
            };
        }).filter(idea => !profile || typeof mealMatchesDietaryRequirements !== 'function' || mealMatchesDietaryRequirements(idea, profile))
            .sort((a, b) => (b.diaryUses - a.diaryUses) || String(b.lastUsed).localeCompare(String(a.lastUsed)))
            .slice(0, 12);
    }

    function createdMealPlannerIdeas(mealType) {
        const validType = WEEKLY_MEAL_TYPES.includes(mealType) ? mealType : 'snack';
        const profile = typeof dietaryProfile === 'function' ? dietaryProfile() : null;
        return (state.createdMeals || []).filter(meal => {
            if (!meal || !String(meal.name || '').trim()) return false;
            const savedTypes = [meal.defaultMealType, meal.plannedMealType].filter(type => WEEKLY_MEAL_TYPES.includes(type));
            return !savedTypes.length || savedTypes.includes(validType);
        }).map(meal => {
            const ingredientLabels = (Array.isArray(meal.ingredients) ? meal.ingredients : [])
                .map(plannerIngredientLabel)
                .filter(Boolean);
            return {
                id: `created-${String(meal.id)}`,
                name: String(meal.name || 'Created meal').trim(),
                calories: Math.round(Number(meal.calories) || 0),
                protein: Math.round((Number(meal.protein) || 0) * 10) / 10,
                carbs: Math.round((Number(meal.carbs) || 0) * 10) / 10,
                fat: Math.round((Number(meal.fat) || 0) * 10) / 10,
                fiber: Math.round((Number(meal.fiber) || 0) * 10) / 10,
                note: 'A meal you previously saved in Create Meal.',
                ingredients: ingredientLabels,
                allergens: [],
                source: 'created-meal',
                createdMealSource: true,
                createdMealId: meal.id,
                createdAt: meal.createdAt || ''
            };
        }).filter(idea => !profile || typeof mealMatchesDietaryRequirements !== 'function' || mealMatchesDietaryRequirements(idea, profile))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, 20);
    }

    const PLANNER_INGREDIENT_STOP_WORDS = new Set([
        'a', 'an', 'and', 'as', 'at', 'chopped', 'cooked', 'drained', 'fresh', 'handful', 'handfuls',
        'large', 'medium', 'named', 'of', 'or', 'portion', 'recipe', 'sliced', 'small', 'suitable',
        'tbsp', 'teaspoon', 'teaspoons', 'the', 'to', 'tsp', 'whole', 'with'
    ]);

    function plannerIngredientTokens(value) {
        const singular = {
            berries: 'berry', tomatoes: 'tomato', potatoes: 'potato', vegetables: 'vegetable',
            mushrooms: 'mushroom', peppers: 'pepper', onions: 'onion', eggs: 'egg', beans: 'bean',
            lentils: 'lentil', chickpeas: 'chickpea', noodles: 'noodle', wraps: 'wrap', seeds: 'seed',
            herbs: 'herb', spices: 'spice', leaves: 'leaf', strips: 'strip'
        };
        return plannerIngredientName(value)
            .toLowerCase()
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|mg|ml|l)\b/g, ' ')
            .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
            .replace(/[^a-z]+/g, ' ')
            .split(/\s+/)
            .map(token => singular[token] || token)
            .filter(token => token.length > 1 && !PLANNER_INGREDIENT_STOP_WORDS.has(token));
    }

    function plannerSavedShoppingNames() {
        return (state.shoppingItems || []).map(item => plannerIngredientName(item)).filter(Boolean);
    }

    function plannerIdeaIngredients(idea) {
        const listed = Array.isArray(idea && idea.ingredients) ? idea.ingredients : [];
        const values = listed.length ? listed : inferredShiftMealIngredients(idea);
        return values.map(plannerIngredientLabel).filter(Boolean);
    }

    function plannerIdeaCanBeMadeFromShoppingList(idea) {
        const shoppingNames = plannerSavedShoppingNames();
        if (!shoppingNames.length) return false;
        const shoppingPhrases = shoppingNames.map(name => plannerIngredientTokens(name).join(' ')).filter(Boolean);
        const shoppingTokens = new Set(shoppingNames.flatMap(plannerIngredientTokens));
        const ingredients = plannerIdeaIngredients(idea);
        if (!ingredients.length) return false;
        return ingredients.every(ingredient => {
            const tokens = plannerIngredientTokens(ingredient);
            if (!tokens.length) return false;
            const phrase = tokens.join(' ');
            if (shoppingPhrases.some(saved => saved === phrase || saved.includes(phrase) || phrase.includes(saved))) return true;
            return tokens.every(token => shoppingTokens.has(token));
        });
    }

    function shoppingListPlannerMealIdeas(dateKey, mealType) {
        return shiftMealIdeasFor(plannerShiftType(dateKey), mealType)
            .filter(plannerIdeaCanBeMadeFromShoppingList)
            .map(idea => Object.assign({}, idea, {
                ingredients: plannerIdeaIngredients(idea),
                source: 'shopping-list',
                shoppingListSource: true
            }));
    }

    function plannerMealIdeas(dateKey, mealType) {
        const createdIdeas = createdMealPlannerIdeas(mealType);
        const diaryIdeas = diaryPlannerMealIdeas(mealType);
        const shoppingIdeas = shoppingListPlannerMealIdeas(dateKey, mealType);
        const seen = new Set();
        return createdIdeas.concat(diaryIdeas, shoppingIdeas).filter(idea => {
            const key = String(idea.name || '').trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function plannerMealSelection(dateKey, mealType) {
        const day = plannerDayRecord(dateKey);
        const ideas = plannerMealIdeas(dateKey, mealType);
        if (!ideas.length) return { selection: null, idea: null, index: -1 };
        let selection = isPlainRecord(day.meals[mealType]) ? day.meals[mealType] : {};
        let index = ideas.findIndex(idea => idea.id === selection.recipeId);
        if (index < 0) {
            const selected = ideas[plannerHash(dateKey + ':' + mealType) % ideas.length];
            index = ideas.findIndex(idea => idea.id === selected.id);
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
                const selected = ideas[(plannerHash(dateKey) + mealIndex) % ideas.length];
                const previous = isPlainRecord(day.meals[mealType]) ? day.meals[mealType] : {};
                day.meals[mealType] = {
                    recipeId: selected.id,
                    servings: Math.min(12, Math.max(1, Number(previous.servings) || 1)),
                    completed: false,
                    updatedAt: new Date().toISOString()
                };
            });
        });
        saveState();
        renderWeeklyMealPlanner();
        showToast('Seven-day plan refreshed from your shopping list, created meals and diary');
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

    let weeklyDiaryMealDetail = null;

    function ensureWeeklyDiaryMealModal() {
        let modal = document.getElementById('weekly-diary-meal-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'weekly-diary-meal-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '248';
        modal.innerHTML = `
            <div class="bg-white rounded-[2rem] p-5 sm:p-7 max-h-[92vh] overflow-y-auto" style="width:min(640px,calc(100vw - 1rem));">
                <div class="flex items-start justify-between gap-3 mb-4">
                    <div><p id="weekly-diary-meal-kicker" class="text-[10px] font-black uppercase text-orange-600"></p><h3 id="weekly-diary-meal-title" class="text-xl font-black mt-1"></h3><p id="weekly-diary-meal-date" class="text-xs text-slate-400 mt-1"></p></div>
                    <button onclick="closeWeeklyDiaryMealDetail()" class="w-10 h-10 bg-slate-100 rounded-full text-2xl flex-shrink-0" aria-label="Close meal details">×</button>
                </div>
                <div id="weekly-diary-meal-body"></div>
                <button onclick="addSelectedWeeklyPlannerMeal()" class="w-full mt-5 bg-orange-600 text-white p-4 rounded-2xl font-black">Add This Meal to Diary</button>
            </div>`;
        document.body.appendChild(modal);
        ensureAccessibleDom(modal);
        return modal;
    }

    function openWeeklyDiaryMealDetail(dateKey, mealType, idea) {
        weeklyDiaryMealDetail = { dateKey, mealType, ideaId: idea.id };
        const modal = ensureWeeklyDiaryMealModal();
        const kicker = document.getElementById('weekly-diary-meal-kicker');
        const title = document.getElementById('weekly-diary-meal-title');
        const date = document.getElementById('weekly-diary-meal-date');
        const body = document.getElementById('weekly-diary-meal-body');
        const sourceLabel = idea.createdMealSource
            ? 'From Create Meal'
            : (idea.diarySource ? 'From your Nutrition Diary' : 'Made from your Shopping List');
        const ingredientHeading = idea.createdMealSource
            ? 'Ingredients saved in Create Meal'
            : (idea.diarySource ? 'Foods and ingredients from your diary' : 'Ingredients matched in your shopping list');
        const ingredients = plannerIdeaIngredients(idea);
        const steps = idea.shoppingListSource && typeof shiftMealRecipeSteps === 'function'
            ? shiftMealRecipeSteps(idea)
            : [];
        if (kicker) kicker.textContent = sourceLabel;
        if (title) title.textContent = idea.name;
        if (date) date.textContent = `${weeklyPlannerDateLabel(dateKey, true)} · ${mealType}`;
        if (body) body.innerHTML = `
            <p class="text-sm text-slate-600">${escapeHtml(idea.note || 'Based on foods previously logged in your Nutrition Diary.')}</p>
            <div class="grid grid-cols-4 gap-2 mt-4">
                <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[8px] uppercase text-slate-400 font-black">Calories</p><p class="font-black text-sm">${Math.round(Number(idea.calories) || 0)}</p></div>
                <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[8px] uppercase text-slate-400 font-black">Protein</p><p class="font-black text-sm">${Number(idea.protein || 0).toFixed(1)}g</p></div>
                <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[8px] uppercase text-slate-400 font-black">Carbs</p><p class="font-black text-sm">${Number(idea.carbs || 0).toFixed(1)}g</p></div>
                <div class="bg-slate-50 p-2 rounded-xl text-center"><p class="text-[8px] uppercase text-slate-400 font-black">Fat</p><p class="font-black text-sm">${Number(idea.fat || 0).toFixed(1)}g</p></div>
            </div>
            <div class="mt-5"><h4 class="font-black text-sm">${escapeHtml(ingredientHeading)}</h4><ul class="mt-2 space-y-2">${ingredients.length ? ingredients.map(item => `<li class="flex items-start gap-2 text-sm text-slate-600"><span class="text-orange-500 font-black">•</span><span>${escapeHtml(item)}</span></li>`).join('') : '<li class="text-sm text-slate-400">No ingredient detail was saved for this earlier meal.</li>'}</ul></div>
            ${steps.length ? `<div class="mt-5"><h4 class="font-black text-sm">Method</h4><ol class="mt-2 space-y-2">${steps.map((step, index) => `<li class="flex items-start gap-3 text-sm text-slate-600"><span class="w-6 h-6 bg-slate-900 text-orange-300 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0">${index + 1}</span><span>${escapeHtml(step)}</span></li>`).join('')}</ol></div>` : ''}`;
        modal.style.display = 'flex';
        refreshIcons();
    }

    function closeWeeklyDiaryMealDetail() {
        const modal = document.getElementById('weekly-diary-meal-modal');
        if (modal) modal.style.display = 'none';
        weeklyDiaryMealDetail = null;
    }

    function addDiaryPlannerMealToDiary(dateKey, mealType, idea) {
        if (!idea || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return false;
        const base = {
            calories: Number(idea.calories) || 0, protein: Number(idea.protein) || 0,
            carbs: Number(idea.carbs) || 0, fat: Number(idea.fat) || 0,
            fiber: Number(idea.fiber) || 0, sugar: 0, isCustom: true, serving: '1 diary-based portion'
        };
        if (!Array.isArray(state.dailyMeals)) state.dailyMeals = [];
        state.dailyMeals.push({
            id: Date.now() + Math.random(), date: dateKey, type: mealType, mealType,
            name: idea.name, image: null, calories: base.calories, protein: base.protein,
            carbs: base.carbs, fat: base.fat, fiber: base.fiber, sugar: 0,
            amount: 1, amountType: 'portion', base, ingredients: (idea.ingredients || []).slice(),
            source: 'weekly-diary-idea', weeklyDiaryIdeaId: idea.id, createdAt: new Date().toISOString()
        });
        saveState();
        autoSaveNutrition();
        renderDiary();
        renderDashboard();
        showToast(`${idea.name} added to ${weeklyPlannerDateLabel(dateKey, false)}`);
        return true;
    }

    function addWeeklyPlannerIdeaToDiary(dateKey, mealType, idea) {
        if (!idea) return false;
        if (idea.createdMealSource) {
            return addCreatedMealToDiary(idea.createdMealId, dateKey, mealType);
        }
        if (idea.diarySource) {
            return addDiaryPlannerMealToDiary(dateKey, mealType, idea);
        }
        const shiftType = plannerShiftType(dateKey);
        const shiftIndex = shiftMealIdeasFor(shiftType, mealType).findIndex(item => item.id === idea.id);
        if (shiftIndex < 0) return false;
        addShiftMealIdea(shiftType, mealType, shiftIndex, dateKey);
        return true;
    }

    function addSelectedWeeklyPlannerMeal() {
        if (!weeklyDiaryMealDetail) return;
        const selection = Object.assign({}, weeklyDiaryMealDetail);
        const idea = plannerMealIdeas(selection.dateKey, selection.mealType).find(item => item.id === selection.ideaId);
        if (addWeeklyPlannerIdeaToDiary(selection.dateKey, selection.mealType, idea)) closeWeeklyDiaryMealDetail();
    }

    function addSelectedDiaryPlannerMeal() {
        addSelectedWeeklyPlannerMeal();
    }

    function openWeeklyPlannerRecipe(dateKey, mealType) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.idea) return;
        openWeeklyDiaryMealDetail(dateKey, mealType, result.idea);
    }

    function addWeeklyMealToDiary(dateKey, mealType) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.idea) return;
        addWeeklyPlannerIdeaToDiary(dateKey, mealType, result.idea);
    }

    function weeklyMealPlannerCardHTML(dateKey, mealType) {
        const result = plannerMealSelection(dateKey, mealType);
        if (!result.idea) {
            return `
                <div class="border border-dashed border-slate-300 bg-white rounded-2xl p-3">
                    <p class="text-[9px] font-black uppercase text-slate-400">${escapeHtml(mealType)}</p>
                    <p class="font-black text-sm text-slate-600 mt-1">No meal available from your saved sources</p>
                    <p class="text-[10px] text-slate-400 mt-1">Add ingredients to the Shopping List, save a meal in Create Meal, or log this meal type in your diary.</p>
                </div>`;
        }
        const idea = result.idea;
        const selection = result.selection;
        const choices = plannerMealIdeas(dateKey, mealType);
        const timing = shiftMealTimingLabel(plannerShiftType(dateKey), mealType);
        const safety = typeof structuredMealSafety === 'function' ? structuredMealSafety(idea) : { allergens: dietaryMealAllergens(idea) };
        const sourceBadge = idea.createdMealSource
            ? '<span class="bg-emerald-100 text-emerald-700 text-[8px] font-black px-2 py-0.5 rounded-full">CREATE MEAL</span>'
            : (idea.diarySource
                ? '<span class="bg-indigo-100 text-indigo-700 text-[8px] font-black px-2 py-0.5 rounded-full">FROM YOUR DIARY</span>'
                : '<span class="bg-orange-100 text-orange-700 text-[8px] font-black px-2 py-0.5 rounded-full">SHOPPING LIST</span>');
        const swapDisabled = choices.length < 2;
        return `
            <div class="border ${selection.completed ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'} rounded-2xl p-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0"><div class="flex flex-wrap items-center gap-1.5"><p class="text-[9px] font-black uppercase text-orange-600">${escapeHtml(mealType)} · ${escapeHtml(timing)}</p>${sourceBadge}</div><p class="font-black text-sm mt-1">${escapeHtml(idea.name)}</p><p class="text-[10px] text-slate-500 mt-1">${Math.round(Number(idea.calories) || 0)} kcal · ${Number(idea.protein || 0).toFixed(1)}g protein${safety.allergens.length ? ` · Check: ${escapeHtml(safety.allergens.join(', '))}` : ''}</p></div>
                    <button onclick="toggleWeeklyMealComplete('${escapeJsString(dateKey)}','${escapeJsString(mealType)}')" class="w-9 h-9 rounded-full flex-shrink-0 ${selection.completed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}" aria-label="${selection.completed ? 'Mark meal not completed' : 'Mark meal completed'}">${selection.completed ? '✓' : '○'}</button>
                </div>
                <div class="grid grid-cols-4 gap-1.5 mt-3">
                    <button onclick="swapWeeklyMeal('${escapeJsString(dateKey)}','${escapeJsString(mealType)}',1)" ${swapDisabled ? 'disabled' : ''} class="bg-slate-100 p-2 rounded-lg text-[10px] font-black ${swapDisabled ? 'opacity-40 cursor-not-allowed' : ''}">Swap</button>
                    <button onclick="openWeeklyPlannerRecipe('${escapeJsString(dateKey)}','${escapeJsString(mealType)}')" class="bg-orange-50 text-orange-700 p-2 rounded-lg text-[10px] font-black">${idea.shoppingListSource ? 'Recipe' : 'Details'}</button>
                    <button onclick="addWeeklyMealToDiary('${escapeJsString(dateKey)}','${escapeJsString(mealType)}')" class="bg-indigo-50 text-indigo-700 p-2 rounded-lg text-[10px] font-black">Log 1</button>
                    <label class="bg-slate-100 rounded-lg px-1 text-[9px] font-bold text-center flex flex-col justify-center">Servings<input type="number" min="1" max="12" value="${selection.servings}" onchange="setWeeklyMealServings('${escapeJsString(dateKey)}','${escapeJsString(mealType)}',this.value)" class="bg-transparent w-full text-center font-black outline-none"></label>
                </div>
            </div>`;
    }

    function weeklyPlannerDayTotals(dateKey) {
        return WEEKLY_MEAL_TYPES.reduce((totals, mealType) => {
            const idea = plannerMealSelection(dateKey, mealType).idea;
            if (!idea) return totals;
            totals.calories += Number(idea.calories) || 0;
            totals.protein += Number(idea.protein) || 0;
            totals.meals += 1;
            return totals;
        }, { calories: 0, protein: 0, meals: 0 });
    }

    function renderWeeklyPlanView() {
        const dates = plannerWeekDates(weeklyPlannerStartDate);
        const total = dates.length * WEEKLY_MEAL_TYPES.length;
        const completed = dates.reduce((count, dateKey) => count + WEEKLY_MEAL_TYPES.filter(mealType => plannerMealSelection(dateKey, mealType).selection?.completed).length, 0);
        const available = dates.reduce((count, dateKey) => count + WEEKLY_MEAL_TYPES.filter(mealType => plannerMealSelection(dateKey, mealType).idea).length, 0);
        const profile = dietaryProfile();
        const diaryPatternCount = WEEKLY_MEAL_TYPES.reduce((count, mealType) => count + diaryPlannerMealIdeas(mealType).length, 0);
        const createdMealCount = new Set(WEEKLY_MEAL_TYPES.flatMap(mealType => createdMealPlannerIdeas(mealType).map(idea => idea.id))).size;
        const shoppingRecipeCount = new Set(dates.flatMap(dateKey => WEEKLY_MEAL_TYPES.flatMap(mealType => shoppingListPlannerMealIdeas(dateKey, mealType).map(idea => idea.id)))).size;
        return `
            <div class="flex items-center gap-2 mb-4">
                <button onclick="changeWeeklyMealPlannerWeek(-1)" class="w-10 h-10 bg-slate-100 rounded-xl" aria-label="Previous week">‹</button>
                <div class="flex-1 text-center"><p class="text-[9px] font-black uppercase text-slate-400">Week commencing</p><p class="font-black text-sm">${escapeHtml(weeklyPlannerDateLabel(dates[0], false))} – ${escapeHtml(weeklyPlannerDateLabel(dates[6], false))}</p></div>
                <button onclick="changeWeeklyMealPlannerWeek(1)" class="w-10 h-10 bg-slate-100 rounded-xl" aria-label="Next week">›</button>
            </div>
            <div class="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
                <div class="flex flex-wrap gap-1.5">${dietaryProfileBadgesHTML(profile)}</div>
                <p class="text-[11px] text-orange-900 mt-2">Only meals from your saved Shopping List ingredients, Create Meal history or Nutrition Diary are shown. Available now: ${createdMealCount} created meal${createdMealCount === 1 ? '' : 's'}, ${diaryPatternCount} diary pattern${diaryPatternCount === 1 ? '' : 's'} and ${shoppingRecipeCount} shopping-list recipe${shoppingRecipeCount === 1 ? '' : 's'}. Dietary exclusions still apply.</p>
                <div class="flex items-center justify-between gap-2 mt-3"><span class="text-xs font-black">${completed}/${available} available meals completed${available < total ? ` · ${total - available} empty slot${total - available === 1 ? '' : 's'}` : ''}</span><div class="flex gap-2"><button onclick="goToCurrentMealPlannerWeek()" class="bg-white border border-orange-200 px-3 py-2 rounded-xl text-[10px] font-black">This week</button><button onclick="autoFillWeeklyMealPlanner()" class="bg-slate-900 text-white px-3 py-2 rounded-xl text-[10px] font-black">Refresh plan</button></div></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${dates.map(dateKey => {
                const type = plannerShiftType(dateKey);
                const totals = weeklyPlannerDayTotals(dateKey);
                const shiftLabels = { night: '🌙 Night shift', early: '🌅 Early shift', day: '🏢 Day shift', off: '☀️ Rest / off' };
                return `<section class="bg-slate-50 border border-slate-200 rounded-[1.5rem] p-3"><div class="flex items-center justify-between mb-3"><div><p class="font-black">${escapeHtml(weeklyPlannerDateLabel(dateKey, true))}</p><p class="text-[10px] text-slate-500">${escapeHtml(shiftLabels[type])}</p></div>${dateKey === localDateKey() ? '<span class="bg-orange-500 text-white text-[9px] font-black px-2 py-1 rounded-full">TODAY</span>' : ''}</div><div class="space-y-2">${WEEKLY_MEAL_TYPES.map(mealType => weeklyMealPlannerCardHTML(dateKey, mealType)).join('')}</div><div class="mt-3 bg-slate-900 border border-orange-500 text-white rounded-2xl p-3 flex items-center justify-between gap-3"><div><p class="text-[9px] font-black uppercase tracking-wider text-orange-300">Daily total</p><p class="text-[10px] text-slate-300 mt-0.5">${totals.meals} planned meal${totals.meals === 1 ? '' : 's'} · one serving each</p></div><div class="text-right"><p class="font-black">${Math.round(totals.calories)} kcal</p><p class="text-xs font-bold text-orange-300">${totals.protein.toFixed(1)}g protein</p></div></div></section>`;
            }).join('')}</div>`;
    }

    function weeklyShoppingGeneratedItems() {
        const aggregate = new Map();
        plannerWeekDates(weeklyPlannerStartDate).forEach(dateKey => {
            WEEKLY_MEAL_TYPES.forEach(mealType => {
                const result = plannerMealSelection(dateKey, mealType);
                if (!result.idea) return;
                const ingredients = plannerIdeaIngredients(result.idea);
                ingredients.forEach(ingredient => {
                    const key = String(ingredient).trim().toLowerCase().replace(/\s+/g, ' ');
                    const current = aggregate.get(key) || {
                        key: 'recipe:' + encodeURIComponent(key), name: ingredient, servings: 0,
                        meals: new Set(), generated: true, fromDiary: false, fromCreatedMeal: false, fromShoppingRecipe: false
                    };
                    current.servings += result.selection.servings;
                    current.meals.add(result.idea.name);
                    current.fromDiary = current.fromDiary || Boolean(result.idea.diarySource);
                    current.fromCreatedMeal = current.fromCreatedMeal || Boolean(result.idea.createdMealSource);
                    current.fromShoppingRecipe = current.fromShoppingRecipe || Boolean(result.idea.shoppingListSource);
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
                <div class="flex items-start justify-between gap-3"><div><h4 class="font-black text-emerald-900">Combined shopping list</h4><p class="text-[11px] text-emerald-800 mt-1">Items you add or scan can unlock matching recipes. Ingredients required by the created, diary and shopping-list meals currently in your plan are then combined below.</p></div><span class="text-xs font-black text-emerald-700">${checkedCount}/${items.length}</span></div>
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
                const source = item.fromCreatedMeal ? 'CREATED' : (item.fromDiary ? 'DIARY' : (item.fromShoppingRecipe ? 'LIST RECIPE' : 'PLAN'));
                return `<div class="flex items-center gap-3 p-3 border ${checked ? 'border-emerald-200 bg-emerald-50 opacity-70' : 'border-slate-200 bg-white'} rounded-xl"><button onclick="toggleWeeklyShoppingItem('${escapeJsString(item.key)}')" class="w-9 h-9 rounded-full flex-shrink-0 ${checked ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}" aria-label="${checked ? 'Untick' : 'Tick'} ${escapeHtml(item.name)}">${checked ? '✓' : '○'}</button><div class="flex-1 min-w-0"><p class="font-bold text-sm ${checked ? 'line-through' : ''}">${escapeHtml(item.name)}</p><p class="text-[9px] text-slate-400 mt-0.5">${escapeHtml(detail)}</p></div>${item.generated ? `<span class="text-[8px] font-black text-indigo-600">${source}</span>` : `<button onclick="removeWeeklyShoppingItem('${escapeJsString(item.id)}')" class="text-rose-500 p-2" aria-label="Remove ${escapeHtml(item.name)}">×</button>`}</div>`;
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
        return `<div class="glass-card p-5 rounded-[2.5rem] border-2 border-orange-200" data-weekly-meal-planner-entry><div class="flex items-start justify-between gap-3"><div><p class="text-[10px] font-black uppercase text-orange-600">Meal prep and shopping</p><h3 class="text-xl font-black mt-1">7-Day Shift Meal Planner</h3><p class="text-xs text-slate-500 mt-2">${planned} meals using only your Shopping List ingredients, meals saved in Create Meal or foods previously logged in your Nutrition Diary. Each day includes total calories and protein.</p></div><i data-lucide="calendar-range" class="w-8 h-8 text-orange-500 flex-shrink-0"></i></div><button onclick="openWeeklyMealPlanner('${escapeJsString(start)}')" class="w-full mt-4 bg-slate-900 border border-orange-500 text-white p-4 rounded-2xl font-black">Open 7-Day Planner &amp; Shopping Scanner</button></div>`;
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
