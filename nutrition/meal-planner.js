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
        refreshIcons();
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
        const target = typeof getDailyCalorieTarget === 'function' ? getDailyCalorieTarget(state.viewDate) : ((state.goals && state.goals.calories) || 2500);
        const targetEl = document.getElementById('nutrition-calorie-target');
        if (targetEl) targetEl.textContent = `Target ${Math.round(target)} kcal`;

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
                        meals.map(m => {
                            const safeId = escapeJsString(m.id);
                            const image = safeImageUrl(m.image);
                            const amountLabel = m.amount
                                ? ` • ${escapeHtml(m.amount)}${m.amountType === 'grams' ? 'g' : ' serving' + (Number(m.amount) > 1 ? 's' : '')}`
                                : '';
                            return `
                            <div class="flex justify-between items-center py-2 border-b last:border-0">
                                <div onclick="editLoggedFood('${safeId}')" class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                                    ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" class="w-10 h-10 object-contain rounded-lg bg-slate-50 p-1" onerror="this.style.display='none'">` : ''}
                                    <div class="flex-1 min-w-0">
                                        <div class="font-bold text-sm truncate flex items-center gap-1">${escapeHtml(m.name)} <i data-lucide="pencil" class="w-3 h-3 text-slate-300"></i></div>
                                        <div class="text-xs text-slate-400">${Math.round(Number(m.calories) || 0)} cal • ${(Number(m.protein) || 0).toFixed(1)}g protein${amountLabel}</div>
                                    </div>
                                </div>
                                <button onclick="removeMeal('${safeId}')" class="w-8 h-8 bg-red-50 text-red-500 rounded-lg text-sm flex-shrink-0 ml-2" aria-label="Remove ${escapeHtml(m.name || 'meal')}">×</button>
                            </div>
                        `;
                        }).join('')
                    }
                </div>`;
        }).join('');

        renderNutritionHistory();
        if (typeof renderDailyReadinessCards === 'function') renderDailyReadinessCards();
        refreshIcons();
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
            serving: base.serving || (base.isCustom ? '1 portion' : '100g')
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
        const current = state.viewDate || localDateKey();
        selectNutritionDate(offsetLocalDateKey(current, days));
    }

    function selectNutritionDate(dateStr) {
        state.viewDate = dateStr;
        saveState();
        ['nutrition-date-picker', 'shift-nutrition-date-picker'].forEach(id => {
            const picker = document.getElementById(id);
            if (picker) picker.value = dateStr;
        });
        const today = localDateKey();
        const warning = document.getElementById('nutrition-date-warning');
        if (warning) warning.classList.toggle('hidden', dateStr === today);
        renderDiary();
        renderShiftWorker();
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
            <div onclick="selectStore('${escapeJsString(store.value)}', '${escapeJsString(store.name)}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                ${escapeHtml(store.name)}
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
                <div onclick="selectStore('${escapeJsString(store.value)}', '${escapeJsString(store.name)}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                    ${escapeHtml(store.name)}
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
            <div onclick="selectManualStore('${escapeJsString(store.name)}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                ${escapeHtml(store.name)}
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
                <div onclick="selectManualStore('${escapeJsString(store.name)}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm font-medium">
                    ${escapeHtml(store.name)}
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
                foodSearchToken += 1;
                // Empty query → show whatever the current filter says (recent, my foods, etc.)
                hideSearchPagination();
                renderFilterContent();
                return;
            }
            if (query.length < 2) {
                foodSearchToken += 1;
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
        foodSearchToken += 1;
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
        foodSearchToken += 1;
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
        refreshIcons();
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
        const safeIcon = /^[a-z0-9-]+$/i.test(icon || '') ? icon : 'circle-alert';
        return `<div class="text-center py-12">
            <div class="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                <i data-lucide="${safeIcon}" class="w-8 h-8 text-slate-400"></i>
            </div>
            <p class="font-bold text-slate-600 mb-1">${escapeHtml(title)}</p>
            <p class="text-xs text-slate-400">${escapeHtml(subtitle)}</p>
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
                sourceData = safeJsonForInline({
                    name, brand, image, calories: cals, protein, carbs, fat,
                    fiber: item.fiber || 0, sugar: item.sugar || 0,
                    serving: item.serving || '1 portion', store: item.store || ''
                });
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
                sourceData = safeJsonForInline({ description: name, _n: item._n || {} });
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
            sourceData = safeJsonForInline({
                product_name: name,
                brands: brand,
                image_url: image,
                serving_size: item.serving_size || '100g',
                nutriments: {
                    'energy-kcal_100g': n['energy-kcal_100g'] || 0,
                    proteins_100g: n.proteins_100g || 0,
                    carbohydrates_100g: n.carbohydrates_100g || 0,
                    fat_100g: n.fat_100g || 0,
                    fiber_100g: n.fiber_100g || 0,
                    sugars_100g: n.sugars_100g || 0,
                    'saturated-fat_100g': n['saturated-fat_100g'] || 0,
                    sodium_100g: n.sodium_100g || 0
                }
            });
            return cardHtml({ name, brand, image, cals, protein, carbs, fat, perLabel, sourceBadge, onClick: `openFoodPopup(${sourceData})` });
        }).join('');

        refreshIcons();
    }

    function sourceTag(source) {
        if (source === 'recent') return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">RECENT</span>';
        if (source === 'custom') return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">CUSTOM</span>';
        if (source === 'usda') return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">USDA</span>';
        return '<span class="text-[9px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">OFF</span>';
    }

    function cardHtml(d) {
        const proteinG = (Number(d.protein) || 0).toFixed(1);
        const image = safeImageUrl(d.image);
        return `<div onclick='${d.onClick}' class="bg-white p-3 rounded-2xl border-2 border-slate-100 cursor-pointer hover:border-emerald-400 hover:shadow-md active:scale-[0.98] transition-all flex items-center gap-3">
            <div class="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" class="w-full h-full object-contain" onerror="this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'package\\' class=\\'w-8 h-8 text-slate-300\\'></i>';">` : '<i data-lucide="utensils" class="w-7 h-7 text-slate-300"></i>'}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-0.5">
                    ${d.sourceBadge}
                </div>
                <h4 class="font-bold text-sm leading-tight line-clamp-2">${escapeHtml(d.name)}</h4>
                <p class="text-[11px] text-slate-400 truncate">${escapeHtml(d.brand)} · ${escapeHtml(d.perLabel)}</p>
                <div class="flex gap-3 mt-1.5 text-[11px]">
                    <span class="font-black text-indigo-600">${Math.round(Number(d.cals) || 0)} kcal</span>
                    <span class="font-bold text-emerald-600">${proteinG}g P</span>
                    <span class="text-slate-500">${(Number(d.carbs) || 0).toFixed(0)}g C</span>
                    <span class="text-slate-500">${(Number(d.fat) || 0).toFixed(0)}g F</span>
                </div>
            </div>
            <div class="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                <i data-lucide="plus" class="w-5 h-5 text-emerald-600"></i>
            </div>
        </div>`;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * The main search. Calls USDA and OpenFoodFacts in parallel, then merges,
     * dedupes, scores by relevance, and renders.
     */
    // Pagination state for the active search
    let searchState = { query: '', page: 1, pageSize: 20, hasMore: false };
    let foodSearchToken = 0;

    /**
     * Run a search for a given query + page. Page is 1-indexed.
     */
    /**
     * fetch() with a timeout, so a hanging request can't freeze the search forever.
     * Rejects after `ms` milliseconds if the request hasn't completed.
     */
    async function fetchWithTimeout(url, optionsOrTimeout, timeoutMs) {
        const options = typeof optionsOrTimeout === 'object' && optionsOrTimeout !== null
            ? Object.assign({}, optionsOrTimeout)
            : {};
        const ms = typeof optionsOrTimeout === 'number' ? optionsOrTimeout : (timeoutMs || 8000);
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        if (controller) options.signal = controller.signal;
        const timer = setTimeout(() => { if (controller) controller.abort(); }, ms);
        try {
            const r = await fetch(url, options);
            return r;
        } finally {
            clearTimeout(timer);
        }
    }

    async function searchFood(query, page) {
        page = page || 1;
        const requestToken = ++foodSearchToken;
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

        if (!navigator.onLine) {
            const localOnly = [
                ...(state.customFoods || []).map(item => ({ ...item, _source: 'custom', isCustom: true })),
                ...getRecentFoods(100).map(item => ({ ...item, _source: 'recent' }))
            ].filter(item => item.name && item.name.toLowerCase().includes(query.toLowerCase()))
             .sort((a, b) => scoreRelevance(b.name, query) - scoreRelevance(a.name, query))
             .slice(0, 30);
            loading.classList.add('hidden');
            if (localOnly.length) renderResultCards(localOnly);
            else resultsList.innerHTML = emptyState('wifi-off', 'Offline search', 'No matching saved or recent foods on this device.');
            return;
        }

        // Track whether the source actually errored (vs just returned nothing)
        let usdaErrored = false; // USDA is disabled — this app uses UK Open Food Facts data only
        let offErrored = false;

        // Search Open Food Facts (UK) only. USDA is US-government data and has been
        // intentionally disabled so all nutrition info comes from UK sources.
        const offResults = await searchOpenFoodFacts(query, store, page)
            .catch(err => { console.warn('OFF failed:', err); offErrored = true; return { products: [], more: false }; });
        if (requestToken !== foodSearchToken) return;
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
        refreshIcons();
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
        refreshIcons();
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
    function nutritionNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? Math.min(number, 1000000) : 0;
    }

    function openFoodPopupUSDA(food) {
        const nutrients = (food && food._n) || {};
        currentFoodItem = {
            id: Date.now(),
            name: String((food && food.description) || 'Food').slice(0, 160),
            image: '',
            calories: nutritionNumber(nutrients.calories),
            protein: nutritionNumber(nutrients.protein),
            carbs: nutritionNumber(nutrients.carbs),
            fat: nutritionNumber(nutrients.fat),
            fiber: nutritionNumber(nutrients.fiber),
            sugar: nutritionNumber(nutrients.sugar),
            satFat: nutritionNumber(nutrients.satFat),
            sodium: nutritionNumber(nutrients.sodium),
            cholesterol: nutritionNumber(nutrients.cholesterol),
            serving: '100g',
            isCustom: false
        };
        editingLoggedMealId = null;
        renderFoodPopup();
    }

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
            return direct;
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
        return amount;
    }

    function readOpenFoodFactsNutrient(nutriments, nutrient, servingGrams) {
        const per100 = toFiniteNumber(nutriments[nutrient + '_100g']);
        if (per100 !== null) return nutritionNumber(per100);

        const perServing = toFiniteNumber(nutriments[nutrient + '_serving']);
        if (perServing !== null && servingGrams > 0) {
            return nutritionNumber(perServing * 100 / servingGrams);
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

        if (!calories) {
            let kilojoules = readOpenFoodFactsNutrient(nutriments, 'energy-kj', servingGrams);
            if (!kilojoules && String(nutriments.energy_unit || '').toLowerCase() === 'kj') {
                kilojoules = readOpenFoodFactsNutrient(nutriments, 'energy', servingGrams);
            }
            if (kilojoules) calories = nutritionNumber(kilojoules / 4.184);
        }

        const sodium = readOpenFoodFactsNutrient(nutriments, 'sodium', servingGrams);
        const salt = readOpenFoodFactsNutrient(nutriments, 'salt', servingGrams);
        const cholesterolValue = readOpenFoodFactsNutrient(nutriments, 'cholesterol', servingGrams);
        const cholesterolUnit = String(nutriments.cholesterol_unit || 'g').toLowerCase();
        const scannedBarcode = normaliseBarcode(requestedBarcode);
        const apiBarcode = normaliseBarcode(product.code) || scannedBarcode;

        return {
            name: String(product.product_name || product.product_name_en || product.generic_name || product.brands || 'Scanned item').slice(0, 160),
            brand: String(product.brands || '').slice(0, 160),
            image: safeImageUrl(product.image_front_url || product.image_url || product.image_front_small_url || ''),
            calories: nutritionNumber(calories),
            protein: readOpenFoodFactsNutrient(nutriments, 'proteins', servingGrams),
            carbs: readOpenFoodFactsNutrient(nutriments, 'carbohydrates', servingGrams),
            fat: readOpenFoodFactsNutrient(nutriments, 'fat', servingGrams),
            fiber: readOpenFoodFactsNutrient(nutriments, 'fiber', servingGrams),
            sugar: readOpenFoodFactsNutrient(nutriments, 'sugars', servingGrams),
            satFat: readOpenFoodFactsNutrient(nutriments, 'saturated-fat', servingGrams),
            sodium: nutritionNumber(sodium || (salt ? salt / 2.5 : 0)),
            cholesterol: nutritionNumber(cholesterolUnit === 'mg' ? cholesterolValue : cholesterolValue * 1000),
            serving: String(product.serving_size || (servingGrams !== 100 ? Math.round(servingGrams * 10) / 10 + 'g' : '100g')).slice(0, 80),
            servingGrams: nutritionNumber(servingGrams) || 100,
            barcode: apiBarcode,
            scannedBarcode: scannedBarcode || apiBarcode,
            source: 'openfoodfacts',
            isCustom: false
        };
    }

    function openFoodPopupModel(food) {
        const value = food && typeof food === 'object' ? food : {};
        currentFoodItem = {
            id: Date.now(),
            name: String(value.name || 'Scanned item').slice(0, 160),
            brand: String(value.brand || '').slice(0, 160),
            image: safeImageUrl(value.image || ''),
            calories: nutritionNumber(value.calories),
            protein: nutritionNumber(value.protein),
            carbs: nutritionNumber(value.carbs),
            fat: nutritionNumber(value.fat),
            fiber: nutritionNumber(value.fiber),
            sugar: nutritionNumber(value.sugar),
            satFat: nutritionNumber(value.satFat),
            sodium: nutritionNumber(value.sodium),
            cholesterol: nutritionNumber(value.cholesterol),
            serving: String(value.serving || '100g').slice(0, 80),
            servingGrams: nutritionNumber(value.servingGrams) || 100,
            barcode: normaliseBarcode(value.barcode),
            scannedBarcode: normaliseBarcode(value.scannedBarcode),
            source: 'openfoodfacts',
            isCustom: false
        };
        editingLoggedMealId = null;
        renderFoodPopup();
    }

    function openFoodPopup(product, requestedBarcode) {
        openFoodPopupModel(normaliseOpenFoodFactsProduct(product, requestedBarcode));
    }

    function openFoodPopupCustom(food) {
        if (!food || typeof food !== 'object') return;
        currentFoodItem = {
            id: Date.now(),
            name: String(food.name || 'Food').slice(0, 160),
            image: safeImageUrl(food.image || ''),
            calories: nutritionNumber(food.calories),
            protein: nutritionNumber(food.protein),
            carbs: nutritionNumber(food.carbs),
            fat: nutritionNumber(food.fat),
            fiber: nutritionNumber(food.fiber),
            sugar: nutritionNumber(food.sugar),
            satFat: 0,
            sodium: 0,
            cholesterol: 0,
            serving: String(food.serving || '1 portion').slice(0, 80),
            store: String(food.store || '').slice(0, 120),
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
            img.src = safeImageUrl(currentFoodItem.image) || './icon.svg';
            img.onerror = function() { this.onerror = null; this.src = './icon.svg'; };
        }
        document.getElementById('popup-nutrition-cals').textContent = Math.round(nutritionNumber(currentFoodItem.calories));
        document.getElementById('popup-nutrition-protein').textContent = nutritionNumber(currentFoodItem.protein).toFixed(1);
        document.getElementById('popup-nutrition-carbs').textContent = nutritionNumber(currentFoodItem.carbs).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-fat').textContent = nutritionNumber(currentFoodItem.fat).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-fiber').textContent = nutritionNumber(currentFoodItem.fiber).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-sugar').textContent = nutritionNumber(currentFoodItem.sugar).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-satfat').textContent = nutritionNumber(currentFoodItem.satFat).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-sodium').textContent = nutritionNumber(currentFoodItem.sodium).toFixed(1) + 'g';
        document.getElementById('popup-nutrition-cholesterol').textContent = nutritionNumber(currentFoodItem.cholesterol) + 'mg';
        document.getElementById('popup-nutrition').textContent = `Per ${currentFoodItem.isCustom ? currentFoodItem.serving : '100g'}`;

        document.getElementById('popup-amount').value = 1;
        currentAmountType = currentFoodItem.isCustom ? 'portion' : 'portion';
        setAmountType(currentAmountType);
        updatePopupTotals();

        // Always start with the edit form collapsed
        const editForm = document.getElementById('edit-food-values');
        if (editForm) editForm.classList.add('hidden');

        document.getElementById('food-popup').style.display = 'flex';
        refreshIcons();
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
        refreshIcons();
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

    function updatePopupTotals() {
        if (!currentFoodItem) return;
        const amount = parseFloat(document.getElementById('popup-amount').value) || 1;
        let mult;
        if (currentAmountType === 'grams') {
            mult = amount / 100;
        } else {
            mult = currentFoodItem.isCustom ? amount : amount;
        }
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
        const mult = currentAmountType === 'grams' ? amount / 100 : amount;

        const base = {
            calories: currentFoodItem.calories || 0,
            protein: currentFoodItem.protein || 0,
            carbs: currentFoodItem.carbs || 0,
            fat: currentFoodItem.fat || 0,
            fiber: currentFoodItem.fiber || 0,
            sugar: currentFoodItem.sugar || 0,
            isCustom: !!currentFoodItem.isCustom,
            serving: currentFoodItem.serving || null
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
        refreshIcons();
    }

    function closeManualFoodEntry() {
        document.getElementById('manual-food-modal').style.display = 'none';
    }

    async function previewManualFoodImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            if (!/^image\//i.test(file.type || '')) throw new Error('Choose an image file');
            if (file.size > 20 * 1024 * 1024) throw new Error('Image is larger than 20 MB');
            manualFoodImageData = await compressImage(file, 900, 200 * 1024);
            const preview = document.getElementById('manual-food-preview');
            if (preview) preview.innerHTML = `<img src="${escapeHtml(safeImageUrl(manualFoodImageData))}" alt="Selected food" class="w-full h-full object-cover">`;
        } catch (error) {
            manualFoodImageData = null;
            event.target.value = '';
            showToast(error.message || 'Could not process that image', 5000);
        }
    }

    function clearManualFoodImage() {
        manualFoodImageData = null;
        const preview = document.getElementById('manual-food-preview');
        if (preview) preview.innerHTML = '<i data-lucide="image" class="w-10 h-10 text-slate-300"></i>';
        document.getElementById('manual-food-image').value = '';
        refreshIcons();
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
