    // VFIT-owned food records. The bundled UK dataset is copied atomically to
    // IndexedDB; it is public reference data, separate from private account logs.
    const VFIT_FOOD_CATALOG_VERSION = 'cofid-2021-v1';
    const VFIT_FOOD_CATALOG_URL = './nutrition/data/uk-foods-2021.json';
    let vfitFoodCatalogPromise = null;
    let vfitFoodCatalogDbPromise = null;
    let vfitFoodCatalogFoods = [];
    let vfitFoodCatalogPersistent = false;
    let vfitDatabaseRenderToken = 0;
    let vfitDatabasePage = 1;
    let vfitDatabaseQuery = '';

    function foodAmountUnit(food) {
        return food && food.basisUnit === 'ml' ? 'ml' : 'g';
    }

    function openVfitFoodCatalogDatabase() {
        if (vfitFoodCatalogDbPromise) return vfitFoodCatalogDbPromise;
        vfitFoodCatalogDbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('Food storage is unavailable'));
            const request = window.indexedDB.open('vfit-food-catalog', 1);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains('foods')) {
                    const store = database.createObjectStore('foods', { keyPath: 'id' });
                    store.createIndex('name', 'name');
                    store.createIndex('category', 'category');
                }
                if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'id' });
            };
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => { database.close(); vfitFoodCatalogDbPromise = null; };
                resolve(database);
            };
            request.onerror = () => { vfitFoodCatalogDbPromise = null; reject(request.error || new Error('Food database could not be opened')); };
            request.onblocked = () => { vfitFoodCatalogDbPromise = null; reject(new Error('Close another VFIT tab to update the food database')); };
        });
        return vfitFoodCatalogDbPromise;
    }

    async function readVfitFoodCatalog(database) {
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['foods', 'meta'], 'readonly');
            const meta = transaction.objectStore('meta').get('catalog');
            const foods = transaction.objectStore('foods').getAll();
            transaction.oncomplete = () => resolve({ meta: meta.result, foods: foods.result || [] });
            transaction.onerror = () => reject(transaction.error || new Error('Food database could not be read'));
            transaction.onabort = () => reject(transaction.error || new Error('Food database read was interrupted'));
        });
    }

    function decodeVfitFoodCatalog(data) {
        if (!data || data.schemaVersion !== 1 || data.version !== VFIT_FOOD_CATALOG_VERSION || !Array.isArray(data.columns) || !Array.isArray(data.foods) || data.foodCount !== data.foods.length || !data.foods.length) throw new Error('Food catalogue is incomplete');
        const seen = new Set();
        return data.foods.map(row => {
            const value = Object.fromEntries(data.columns.map((key, index) => [key, row[index]]));
            if (!value.key || !value.code || !value.name || seen.has(value.key) || !['g', 'ml'].includes(value.basisUnit)) throw new Error('Invalid food catalogue record');
            seen.add(value.key);
            const per100g = {};
            const missingNutrients = [];
            ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodiumMg', 'cholesterol'].forEach(key => {
                const raw = value[key];
                if (raw === null || raw === undefined) {
                    if (['calories', 'protein', 'carbs', 'fat'].includes(key)) throw new Error('Required food nutrition is missing');
                    missingNutrients.push(key);
                    per100g[key] = 0;
                } else {
                    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) throw new Error('Invalid nutrient value');
                    per100g[key] = raw;
                }
            });
            return {
                id: 'cofid-' + value.key, catalogId: 'cofid-' + value.key, sourceCode: value.code,
                name: value.name, brand: 'UK CoFID 2021', source: 'cofid2021',
                category: value.category || 'general', foodGroup: value.foodGroup,
                basisUnit: value.basisUnit, serving: '100' + value.basisUnit, servingGrams: 100,
                ...per100g, sodium: per100g.sodiumMg / 1000, per100g,
                missingNutrients, traceNutrients: value.traceNutrients || [],
                description: value.description || '', reference: value.reference || '', footnote: value.footnote || '',
                catalogFood: true, isCustom: true, databaseItem: false, _source: 'catalog', image: '', barcode: ''
            };
        });
    }

    async function storeVfitFoodCatalog(database, foods) {
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(['foods', 'meta'], 'readwrite');
            const store = transaction.objectStore('foods');
            store.clear();
            foods.forEach(food => store.put(food));
            transaction.objectStore('meta').put({ id: 'catalog', version: VFIT_FOOD_CATALOG_VERSION, count: foods.length });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Food catalogue could not be stored'));
            transaction.onabort = () => reject(transaction.error || new Error('Food catalogue import was interrupted'));
        });
    }

    async function ensureVfitFoodCatalog() {
        if (vfitFoodCatalogPromise) return vfitFoodCatalogPromise;
        vfitFoodCatalogPromise = (async () => {
            let database = null;
            try {
                database = await openVfitFoodCatalogDatabase();
                const cached = await readVfitFoodCatalog(database);
                if (cached.meta && cached.meta.version === VFIT_FOOD_CATALOG_VERSION && cached.meta.count === cached.foods.length && cached.foods.length) {
                    vfitFoodCatalogFoods = cached.foods;
                    vfitFoodCatalogPersistent = true;
                    return cached.foods;
                }
            } catch (error) { console.warn('VFIT food storage fallback:', error); }
            const response = await fetchWithTimeout(VFIT_FOOD_CATALOG_URL, { credentials: 'omit' }, 15000);
            if (!response.ok) throw new Error('The VFIT food catalogue could not be loaded. Try reopening VFIT.');
            const foods = decodeVfitFoodCatalog(await response.json());
            if (database) {
                try { await storeVfitFoodCatalog(database, foods); vfitFoodCatalogPersistent = true; }
                catch (error) { console.warn('Using bundled VFIT foods until storage is available:', error); }
            }
            vfitFoodCatalogFoods = foods;
            return foods;
        })().catch(error => { vfitFoodCatalogPromise = null; throw error; }).finally(renderVfitFoodCatalogStatus);
        return vfitFoodCatalogPromise;
    }

    function renderVfitFoodCatalogStatus() {
        const label = vfitFoodCatalogFoods.length
            ? `${vfitFoodCatalogFoods.length.toLocaleString('en-GB')} UK foods ${vfitFoodCatalogPersistent ? 'saved for offline search' : 'included with VFIT'} · plus saved foods`
            : 'UK foods included with VFIT · plus saved foods';
        ['food-catalog-status', 'meal-food-catalog-status'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = label;
        });
    }

    function getVfitDatabaseFoods() {
        const foods = (state.customFoods || []).map(food => ({ ...food, _source: 'custom', databaseItem: true, isCustom: true }));
        const usedIds = new Set(foods.map(food => String(food.id)));
        const usedBarcodes = new Set(foods.map(food => normaliseBarcode(food.barcode)).filter(Boolean));
        (state.barcodeFoods || []).forEach(food => {
            const barcode = normaliseBarcode(food.barcode || food.scannedBarcode);
            if (!barcode || usedBarcodes.has(barcode)) return;
            usedBarcodes.add(barcode);
            const per100g = foodNutrientsPer100g(food);
            const servingGrams = nutritionNumber(food.servingGrams) || 100;
            foods.push({ ...food, ...scaleFoodNutrients(per100g, servingGrams / 100),
                id: 'barcode-' + barcode, servingGrams, per100g, databaseItem: false,
                savedBarcodeFood: true, isCustom: true, _source: 'savedbarcode' });
        });
        vfitFoodCatalogFoods.forEach(food => { if (!usedIds.has(food.id)) foods.push(food); });
        return foods;
    }

    function findVfitDatabaseFood(id) {
        return getVfitDatabaseFoods().find(food => String(food.id) === String(id)) || null;
    }

    function queryVfitDatabaseFoods(query, options) {
        const settings = options || {};
        const pageSize = settings.pageSize || 20;
        const page = Math.max(1, Number(settings.page) || 1);
        let foods = getVfitDatabaseFoods();
        if (settings.includeRecent) foods.push(...getRecentFoods(100).map(food => ({ ...food, _source: 'recent' })));
        const matches = foods.filter(food => foodDatabaseMatchesQuery(food, query))
            .filter(food => !settings.store || settings.store === 'all' || [food.brand, food.store].filter(Boolean).join(' ').toLowerCase().includes(settings.store.toLowerCase()))
            .filter(food => {
                const per100g = foodNutrientsPer100g(food);
                return settings.filter === 'high-protein' ? per100g.protein >= 15
                    : settings.filter === 'low-cal' ? per100g.calories > 0 && per100g.calories <= 200 : true;
            });
        const seen = new Set();
        const ranked = matches.map(food => ({ ...food, _score: scoreRelevance(food.name, String(query || '')) + (food._source === 'custom' ? 120 : food._source === 'savedbarcode' ? 80 : 0) }))
            .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name, 'en-GB'))
            .filter(food => {
                // Keep different brands and preparation methods distinct.
                const key = food.catalogId || (food._source === 'recent' ? String(food.name).toLowerCase() : [food.name, food.brand, food.serving].join('|').toLowerCase());
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        return { foods: ranked.slice((page - 1) * pageSize, page * pageSize), total: ranked.length, page, hasMore: ranked.length > page * pageSize };
    }

    function setFoodSearchSource() {
        const input = document.getElementById('food-search-input');
        foodSearchToken += 1;
        if (input && input.value.trim().length >= 2) searchFood(input.value.trim(), 1);
        else renderFilterContent();
    }

    function setMealFoodSearchSource() {
        mealIngredientSearchToken += 1;
        const input = document.getElementById('meal-ingredient-search');
        if (input && input.value.trim().length >= 2) searchIngredient(input.value.trim());
    }

    function changeFoodDatabasePage(direction) {
        renderFoodDatabase(Math.max(1, vfitDatabasePage + direction));
    }

    function downloadVfitFoodDatabase() {
        ensureVfitFoodCatalog().then(() => {
            const publicFoods = [...(state.customFoods || []), ...vfitFoodCatalogFoods];
            const data = { format: 'vfit-food-database', version: VFIT_FOOD_CATALOG_VERSION,
                attribution: 'Contains public sector information licensed under the Open Government Licence v3.0. Source: Public Health England, UK CoFID 2021.', foods: publicFoods };
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url; link.download = 'VFIT-food-database.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }).catch(error => showToast(error.message || 'Food export failed'));
    }
